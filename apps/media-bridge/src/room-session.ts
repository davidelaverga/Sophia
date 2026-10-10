import { randomUUID } from 'node:crypto'
import type { ChatCaption, ChatInput, ChatNotice, ChatReply } from '@sophia/contracts/room-chat'
// One room exchange on the bridge (architecture 06 §2–§12, S1-05A §6): the LiveKit room, one Gemini Live
// connection and the API's assignment, joined by the pure ExchangeState. This module acts; ExchangeState decides.
//
//  - Only the admitted holder's microphone reaches Google, and only while the exchange is open, no guest is in
//    the room and the provider is ready. A handoff ends the old holder's audio stream and settles (or cancels)
//    the model turn before the new holder is heard.
//  - Stop Speaking and barge-in move the playback generation: queued output is cleared at the AudioSource, and
//    the rest of an interrupted model turn is dropped. Neither touches background work. Google streams a reply
//    faster than it plays and sends no barge-in for a turn it has finished, so the holder talking over a reply
//    that is still playing is a barge-in the bridge applies itself, and a handoff cuts whatever of the old
//    holder's reply is still playing once it settles.
//  - A tool call acts for the holder whose audio the turn answered (the API binds it to that input epoch); an
//    unattributed call, or one arriving while paused, is answered with a question and never executed. A call
//    from an older connection is never answered on a newer one. It carries the holder utterances forwarded in the
//    provider session, so a decision binds to an answer given after its proposal was put (SMC-M01 binding §4.3). A
//    write whose reply was lost is settled only by the receipt its repeat brings back; any other answer leaves it
//    unknown. A v1.2 guide is told that a refused control changed nothing, so from an API rolled back behind the
//    bridge, a control's raw invalid_state reaches it as not applied, and a refusal that may hide a control already
//    applied (a repeated call, a lost commit) as unknown (CX-0026).
//  - Every connection, fresh, resumed or rebuilt, sends the same checked M01 instruction (guide.ts). The guide is
//    activated only once the API confirms it executes exactly the declared operations; before that, Sophia is
//    unavailable and says why. A narrower eligibility (a withdrawn note) drops the provider context and starts cold.
//  - GoAway or a lost connection: a reply cut off mid-turn stops (one Google finished plays out), the latest
//    resumption handle is used once the new connection is ready; a handle that fails is dropped and the next
//    connection starts cold.
//  - The room's state (what the bridge observes, never content) is reported to the API and set as the `sophia`
//    participant's attributes, so the room's light shows what is actually happening.
//  - A finished result is told once (SMC-M03 S6): Sophia says it to the room, and every member present gets its card
//    in the chat (a fixed template of ids and the task's kind) at the same time, whether they hear her or read her
//    (CX-0022). A room where everyone present reads gets the cards alone. The API records whether it was heard and
//    how many members got the card. A member's Studio that says its mode (a join, a reconnect, a switch) is sent the
//    cards this exchange has shown again, at most once every few seconds, so a reloaded page or a late arrival has
//    them too.
//  - Typed words reach Google marked as typed, and cannot pose as the bridge's own markers (escapeMarkers).
//  - What is said aloud is captioned live for the members present (CX-0023): the holder's words, attributed by the
//    floor, and Sophia's spoken reply, under the same fences as her audio. Each fragment is passed on and forgotten
//    (captions.ts); no transcript reaches a log, a tool call, the API or retained state. A typed reply stays the
//    sender's. SOPHIA_LIVE_CAPTIONS=off sends none.
//  - Under a voice qualification grant, with SOPHIA_VOICE_EVIDENCE=on (off by default), the session records the
//    principal's receipts and holds itself to the grant's bound and deadline (qualification.ts): past them it sends
//    nothing more to Google and closes it. Without both, none of it runs.
import type { FunctionCall, FunctionResponse } from '@google/genai'
import type { MediaAssignment, MediaEvidenceAck, MediaToolCall, MediaToolResult } from '@sophia/contracts'
import {
  base64ToPcm,
  FormatError,
  InputChunker,
  isAudible,
  OUTPUT_RATE,
  OutputFramer,
  pcmRate,
  ReplyAudio,
  type ReplyEnd,
} from './audio.ts'
import { withinAttempt } from './attempt.ts'
import { Captions } from './captions.ts'
import { EVIDENCE_RETRY_MS } from './evidence-sender.ts'
import { RESERVE_RETRY_MS, RESERVE_TIMEOUT_MS } from './qualification-ledger.ts'
import { type Assignment, type Attribution, ExchangeState, type InputState } from './exchange-state.ts'
import { GuideContext } from './guide-context.ts'
import type { GuideVersion, MissionGuide } from './guide.ts'
import type { ConnectLive, LiveEvents, LiveLink } from './live-session.ts'
import { type GuardStop, SessionQualification } from './qualification.ts'
import type { JoinRoom, RoomLink, RoomPerson, VisualSource } from './rtc.ts'
import { type MediaService, ServiceError } from './service.ts'
import { isToolName, refusedResponse, TOOL_SETS, toolResponse, WRITE_TOOLS, type ToolSet } from './tools.ts'
import { FrameSampler, type RgbaFrame, toJpeg } from './vision.ts'

export type Log = (event: string, detail?: Record<string, unknown>) => void

export interface SessionDeps {
  service: MediaService
  joinRoom: JoinRoom
  connectLive: ConnectLive
  apiKey: string
  model: string
  /** The checked M01 guide: its instruction is sent unchanged on every connection. */
  guide: MissionGuide
  bridgeInstanceId: string
  now: () => number
  log: Log
  /** The tick scheduler; tests drive `tick()` themselves and pass a no-op. */
  every?: (fn: () => void, ms: number) => () => void
  /** Called once when LiveKit gives up on the room, so the bridge can replace the session promptly. */
  lost?: (exchangeId: string) => void
  /** Waits before a tool call whose reply was lost is sent again, with the same identity; tests shorten them. */
  toolRetryMs?: readonly number[]
  /**
   * One attempt's bound for the quiesce acknowledgement, a holder event and an announcement's record
   * (POST_ATTEMPT_MS); tests shorten it.
   */
  postAttemptMs?: number
  /** Live captions for the members present (CX-0023); false sends none (SOPHIA_LIVE_CAPTIONS=off). On by default. */
  liveCaptions?: boolean
  /**
   * Voice qualification evidence (SOPHIA_VOICE_EVIDENCE=on, A15): a session whose assignment names a grant records its
   * receipts and holds itself to the grant (qualification.ts). Off by default: then nothing of it runs.
   */
  voiceEvidence?: boolean
  /** The deployed commit the provider receipts name (RENDER_GIT_COMMIT, 40 hex), or null. */
  bridgeCommit?: string | null
  /** An exchange's receipt sequence, shared by the sessions that replace one another on it (MediaBridge). */
  evidenceSequence?: (exchangeId: string) => () => number
  /** Waits before a receipt whose answer was lost is sent again; tests shorten them. */
  evidenceRetryMs?: readonly number[]
  /** Waits before a reservation whose answer was lost is asked again, and each attempt's limit; tests shorten them. */
  reserveRetryMs?: readonly number[]
  reserveTimeoutMs?: number
}

const everyInterval = (fn: () => void, ms: number) => {
  const timer = setInterval(fn, ms)
  return () => clearInterval(timer)
}

export const TICK_MS = 100
/** An unended typed provider turn must not keep the member's microphone blocked indefinitely. */
export const TYPED_REPLY_MS = 60_000
/** The bridge reports what it observes at least this often; the API treats 20 s of silence as unavailable. */
export const PRESENCE_EVERY_MS = 5000
/** A holder who left gets this long to come back before the floor is cleared (compare-and-set, A15). */
export const HOLDER_GRACE_MS = 5000
/**
 * A holder the bridge has not seen in the room yet gets this long to appear before input is paused: the bridge may
 * have just joined or rejoined, or the floor may have passed to someone still arriving (CX-0044).
 */
export const HOLDER_ARRIVAL_MS = 5000
/** A holder event the API did not take is sent again after this wait. */
export const HOLDER_RETRY_MS = 2000
/**
 * How long one attempt of the quiesce acknowledgement, a holder event or an announcement's record may take, its body's
 * read included (item 7 of the PR #190 review: these posts had no bound but undici's own 300 s). Past it the request is
 * cancelled, its socket closed, and it is sent again with the same identity after its own wait (QUIESCE_RETRY_MS,
 * HOLDER_RETRY_MS, RECEIPT_RETRY_MS). Each is idempotent on the API (0013 media_ack_quiesce, ON CONFLICT DO NOTHING;
 * media_holder_event, compare-and-set on actor and epoch; 0035 media_record_announced, a union upsert).
 */
export const POST_ATTEMPT_MS = 3000
/** A quiesce acknowledgement the API did not take is sent again after this wait, on the tick, while still asked for. */
export const QUIESCE_RETRY_MS = 2000
/** How long after the last frame handed to the AudioSource the room still hears Sophia (its 200 ms queue). */
const PLAYING_TAIL_MS = 250
const RECONNECT_DELAYS_MS = [250, 1000, 2000, 4000, 8000]
/** A room join that failed is tried again after these waits, then every 30 s. */
const JOIN_RETRY_MS = [1000, 2000, 5000, 10_000]
/** A stopped reply that has not started within this long is not coming: the fence lapses. */
const STOPPED_REPLY_WAIT_MS = 8000
const UNAVAILABLE_RETRY_MS = 30_000
/** A result notice whose turn ends unheard this many times is not sent again by this session. */
const NOTICE_ATTEMPTS = 3
/** Cards that reached no member present are tried again after this wait. */
const TEXT_RETRY_MS = 5000
/** How many results' cards an exchange shows again to a member who says hello: as many as a Studio keeps. */
const SHOWN_KEPT = 20
/** A member's cards are shown again at most this often: hellos in between are answered once, when it has passed. */
const BACKFILL_MS = 3000
/** Caption ends kept while the room link is down, to send once it is back. */
const CAPTION_ENDS_KEPT = 20
/**
 * The holder's chunks kept while their generation is reserved (under a grant): five seconds, the oldest dropped first,
 * and counted as dropped (Codex r4234936797).
 */
const HELD_CHUNKS = 50
/** How long closing waits for the announcements it still owes the API (best effort; the API keeps listing the rest). */
const CLOSE_FLUSH_MS = 3000
/** A heard notice whose receipt the API did not take is recorded again after this wait, until it is. */
const RECEIPT_RETRY_MS = 5000
const TOOL_RETRY_MS = [250, 1000]
const TOOL_FAILED: MediaToolResult = { status: 'error', output: { reason: 'The tool failed; nothing was changed.' } }
/** A write whose reply never came: it may have been saved. The guide reconciles by reading, not by writing again. */
const WRITE_UNCONFIRMED: MediaToolResult = {
  status: 'unknown',
  output: {
    reason: 'The project service did not confirm it; it may or may not have been saved.',
    next: 'Read project_status to see whether it was saved before saving it again.',
  },
}
/**
 * A control an API from before CX-0026 refused in the database's own words (code invalid_state, "Goal not admitted
 * for work"), which a v1.2 guide took for "admitted, applied later". Every refusal of that code changed nothing and
 * left nothing waiting, and this says only that. Its code names no case, so the log tells it from the API's own
 * explanations (not_applied:<case>).
 */
const NOT_APPLIED: MediaToolResult = {
  status: 'refused',
  output: {
    code: 'not_applied',
    applied: false,
    pending: false,
    reason: 'Not applied. Nothing was changed and nothing is waiting.',
    next: 'Read project_status before saying where this work stands.',
  },
}
/**
 * A control an API from before CX-0026 refused although it may have been applied, in the words the API now uses for
 * it. Like NOT_APPLIED's, its code names no case, so the log tells it from the API's own (unconfirmed:<code>).
 */
const CONTROL_UNCONFIRMED: MediaToolResult = {
  status: 'unknown',
  output: { code: 'unconfirmed', reason: 'I could not confirm whether it was applied; read project_status.' },
}
/**
 * An older API's refusals that may hide a control already applied: a Hold, Resume or Stop repeated under the same
 * call (the repeat read the goal's new epoch, so its request differed from the stored one), a commit whose outcome
 * was lost, and a database that did not answer (a repeat it could not check).
 */
const MAYBE_APPLIED: ReadonlySet<unknown> = new Set(['idempotency_conflict', 'outcome_unknown', 'unavailable'])
/**
 * What a v1.2 guide is told of a refused control by an API rolled back behind this bridge: its raw invalid_state as
 * not applied, and a refusal that may hide an applied control as unknown. The API's own explanations
 * (not_applied:<case>), its unknown answers and every other refusal pass through untouched. A v1.1 guide keeps the
 * words M01 was qualified on, as the API keeps them for it.
 */
function plainRefusal(version: GuideVersion, name: string, result: MediaToolResult): MediaToolResult {
  if (version === 'v1.1' || name !== 'control_work' || result.status !== 'refused' || !('code' in result.output))
    return result
  if (result.output.code === 'invalid_state') return NOT_APPLIED
  return MAYBE_APPLIED.has(result.output.code) ? CONTROL_UNCONFIRMED : result
}
/**
 * The answers that settle a write sent again after a lost reply: its receipt, which the API replays for a repeat it
 * already applied, or the API's own unknown. A refusal, an error or a question speaks for the repeat alone: the
 * attempt whose reply was lost may still have been applied.
 */
const SETTLES_A_REPEAT: ReadonlySet<MediaToolResult['status']> = new Set([
  'ok',
  'admitted',
  'committed',
  'proposed',
  'unknown',
])
/** The service's answer to a call: a write sent again after a lost reply is settled only by SETTLES_A_REPEAT. */
const answerTo = (repeat: boolean, result: MediaToolResult): MediaToolResult =>
  repeat && !SETTLES_A_REPEAT.has(result.status) ? WRITE_UNCONFIRMED : result
/**
 * A call the service did not answer: a write that may have been applied is unknown, never "nothing changed". Only a
 * first attempt the API refused (4xx) is known to have changed nothing.
 */
const unanswered = (write: boolean, attempt: number, refused: boolean): MediaToolResult =>
  write && (attempt > 0 || !refused) ? WRITE_UNCONFIRMED : TOOL_FAILED
const sameNames = (a: readonly string[], b: readonly string[]) => a.toSorted().join(',') === b.toSorted().join(',')

const READ_IF_ASKED =
  'Tell the room in one short sentence. Read it only if someone asks (read_selected_source with that taskId).'
/**
 * What Sophia is told when a task's result is ready, by the task's kind (A11). A result of a kind this bridge does
 * not know is left unannounced, so a later task kind never holds back the ones it knows.
 */
const RESULT_NOTICES: ReadonlyMap<string, (taskId: string) => string> = new Map([
  [
    'draft_brief',
    (taskId: string) =>
      `[Sophia system notice] The brief you drafted is ready in the project (taskId ${taskId}). ${READ_IF_ASKED}`,
  ],
  [
    'research',
    (taskId: string) =>
      `[Sophia system notice] The research report is ready in the project (taskId ${taskId}). ${READ_IF_ASKED}`,
  ],
])

interface Announced {
  exchangeId: string
  taskId: string
  resultRevision: number
  /** The room heard Sophia say it. */
  heard?: boolean
  /** Members who received its card in the chat, whatever their mode, each counted once (CX-0022). */
  textRecipients?: number
}

type Result = MediaAssignment['results'][number]
/** An announcement the API has not recorded yet; `sending` is the call in flight, if any. */
interface Receipt {
  event: Announced
  retryAt: number
  sending: Promise<void> | null
}
const resultKey = (r: Pick<Result, 'taskId' | 'resultRevision'>) => `${r.taskId}:${String(r.resultRevision)}`

/**
 * What a closing session hands the session that replaces it on the same exchange (a room link lost and joined again):
 * - `owed`: each result still owed to someone, or whose delivery was still under way when the close stopped waiting,
 *   with the attempts it used, the members confirmed to have its card, and whether the room heard it (then only the
 *   members without its card are owed it);
 * - `unrecorded`: every announcement the API has not recorded;
 * - `done`: the results already delivered (by key), which the replacement never announces again, even while a listing
 *   read before their record still shows them. A result whose attempts ran out with nothing delivered is not done: the
 *   replacement may say it, as any later session may;
 * - `shown`: the results whose card the exchange has shown, so the replacement can show them again to a member who
 *   reloads or arrives (CX-0022);
 * - `captionEnds`: the ends of captions cut off while the room link was down (ids and sequences, never words), which
 *   the replacement sends once it has joined, so no member's caption is left as still being said (CX-0023);
 * - `ledger`: under a voice qualification grant, what the replaced session spent that the API may not hold yet
 *   (SessionQualification.ledger(); Codex r4234649847), with every obligation it inherited and had not seen land
 *   (Codex r4234949420): one ledger for the whole chain of sessions on the exchange. The replacement opens no provider
 *   connection until all of it is on the API.
 * A process restart forgets it.
 */
export interface Handover {
  owed: { result: Result; attempts: number; told: string[]; delivered: number; heard: boolean }[]
  unrecorded: Announced[]
  done: string[]
  shown: Result[]
  captionEnds?: ChatCaption[]
  ledger?: InheritedLedger
}

/**
 * What the sessions replaced on an exchange spent and the API may not hold yet (SessionQualification.ledger()), one
 * ledger for the whole chain (Codex r4234949420): a session hands over its own with whatever it inherited and had not
 * seen land, so a session replaced while it still waited on its own handover passes that wait on.
 */
export interface InheritedLedger {
  /** Charges still unanswered when it was handed over; a session whose own handover had not come yet counts one. */
  unanswered: number
  /** Whether a charge was refused or never confirmed, anywhere in the chain. */
  lost: boolean
  /** Once every charge is answered, whether all landed: one per session of the chain, side by side, never nested. */
  landings: Promise<boolean>[]
}

/** Whether every charge of a ledger landed, once all are answered. */
const landedAll = (ledger: InheritedLedger): Promise<boolean> =>
  ledger.lost ? Promise.resolve(false) : Promise.all(ledger.landings).then((landed) => landed.every(Boolean))

/**
 * Typed words reach Google after the bridge's own marker; inside them, an opening bracket before "Sophia" or
 * "Project" becomes a parenthesis, so a member cannot type a line that reads as a system notice or a marker.
 */
export const escapeMarkers = (text: string): string => text.replace(/\[(?=\s*(?:sophia|project)\b)/giu, '(')

/** A typed request owns every non-blocking tool continuation until its final provider boundary. */
interface TypedTurn {
  identity: string
  packet: ChatInput
  sequence: number
  generation: number
  pendingTools: number
  responses: FunctionResponse[]
  providerEnded: boolean
  usedTools: boolean
  toolIds: Set<string>
}
const CALL_ID = /^[A-Za-z0-9_.:-]{1,64}$/

/**
 * A tool call as it arrived from the provider, read then and never later: whose it is (the turn's holder, or null), the
 * typed turn that counts it as pending, its input mode, the utterance it answers, and whether input was paused.
 */
interface Arrival {
  who: Attribution | null
  turn: TypedTurn | null
  inputMode: 'text' | 'voice'
  utterance: number
  paused: boolean
}

export const toAssignment = (a: MediaAssignment): Assignment => ({
  exchangeId: a.exchangeId,
  projectId: a.projectId,
  roomId: a.roomId,
  state: a.state,
  pauseReason: a.pauseReason,
  inputEpoch: a.inputEpoch,
  inputActorId: a.inputActorId,
  playbackEpoch: a.playbackEpoch,
  observationEpoch: a.observationEpoch,
  allowVision: a.allowVision,
  looking: a.looking,
  roomRevision: a.roomRevision,
})

const isGuestLike = (p: RoomPerson) => p.standing === 'guest' || p.standing === 'unknown'

/** For logs: how many people of each standing, never who. */
function standings(people: readonly RoomPerson[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of people) counts[p.standing] = (counts[p.standing] ?? 0) + 1
  return counts
}

const epochs = (a: MediaAssignment) => ({
  state: a.state,
  pauseReason: a.pauseReason,
  inputEpoch: a.inputEpoch,
  playbackEpoch: a.playbackEpoch,
  observationEpoch: a.observationEpoch,
})

/** For logs: a tool response's status (ok, admitted, refused, clarify, error), never its output. */
function statusOf(response: FunctionResponse): unknown {
  const output: unknown = response.response?.output
  return typeof output === 'object' && output !== null && 'status' in output ? output.status : undefined
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
/** A transcript's length in characters (code points): all a qualification receipt keeps of it. */
const charsOf = (text: string) => Array.from(text).length

/** What function calls carry as billed output text: each name and its serialized arguments, in characters. */
const payloadChars = (calls: readonly FunctionCall[]) =>
  calls.reduce((sum, call) => sum + (call.name ?? '').length + JSON.stringify(call.args ?? {}).length, 0)
/** How many 16-bit samples base64 PCM carries, without decoding it. */
const pcmSamples = (data: string) => Math.floor(Buffer.byteLength(data, 'base64') / 2)
const shortString = (value: unknown) => (typeof value === 'string' && value.length <= 64 ? value : undefined)

/** The ids a tool answer carries (the work it started or controlled, a refusal's code), for the log only. */
function idsOf(response: FunctionResponse): Record<string, string> {
  const output: unknown = response.response?.output
  if (typeof output !== 'object' || output === null) return {}
  const ids: Array<[string, string | undefined]> = [
    ['workId', 'workId' in output ? shortString(output.workId) : undefined],
    ['taskId', 'taskId' in output ? shortString(output.taskId) : undefined],
    ['existingTaskId', 'existingTaskId' in output ? shortString(output.existingTaskId) : undefined],
    ['renderJobId', 'renderJobId' in output ? shortString(output.renderJobId) : undefined],
    ['commandId', 'commandId' in output ? shortString(output.commandId) : undefined],
    ['entryId', 'entryId' in output ? shortString(output.entryId) : undefined],
    ['proposalId', 'proposalId' in output ? shortString(output.proposalId) : undefined],
    ['code', 'code' in output ? shortString(output.code) : undefined],
  ]
  return Object.fromEntries(ids.filter((entry): entry is [string, string] => entry[1] !== undefined))
}

export type OutputState = 'idle' | 'responding' | 'playing'
/** Why a reply may still be on its way: the model is producing it, Google transcribed words, or sound was heard. */
type PendingReply = 'responding' | 'transcript' | 'sound'

/** What the room is told about Sophia (attributes on the `sophia` participant): observed state, no content. */
export interface Observed {
  voice: 'connecting' | 'ready' | 'recovering' | 'unavailable'
  input: InputState
  output: OutputState
  inputEpoch: number
  generation: number
}

interface HolderRef {
  actorId: string
  inputEpoch: number
}

interface HolderAbsence extends HolderRef {
  /** Seen in this room since the bridge joined: a departure, reported at once. Otherwise an arrival still owed. */
  departed: boolean
  /** When `left` is due: now for a departure, after HOLDER_ARRIVAL_MS for a holder not seen yet. */
  leftAt: number
  leftReported: boolean
  goneReported: boolean
  /** A report failed: the next is not sent before this. */
  retryAt: number
}

const sameHolder = (ref: HolderRef | null, actorId: string, inputEpoch: number) =>
  ref?.actorId === actorId && ref.inputEpoch === inputEpoch

export class RoomSession {
  readonly exchangeId: string
  private readonly deps: SessionDeps
  /** The declarations of the guide's version: what the provider is offered and the calls the session accepts. */
  private readonly tools: ToolSet
  private readonly state: ExchangeState
  private assignment: MediaAssignment
  private room: RoomLink | null = null
  private live: LiveLink | null = null
  private connection: number
  /**
   * The Google session tool calls belong to, sent as the call's `connectionGeneration`. A cold start opens a new
   * one; a resumed connection continues it, so a call Google repeats after a reconnect keeps its identity (and the
   * API's idempotency key) instead of becoming a second piece of work.
   */
  private providerSession: number
  private connecting = false
  private handle: string | null = null
  private everReady = false
  private readyConnection = 0
  private reconnectAt: number | null = null
  private attempts = 0
  private reason: string | null = null
  private closed = false
  private closing: Promise<void> | null = null
  /** The room connection is down: nobody is heard or played to, and presence is not reported (it is unknown). */
  private roomDown = false
  /** When the room connection went down, while it is down. */
  private downAt: number | null = null
  /** LiveKit gave up on the room: the bridge replaces this session. */
  lost = false
  private people: RoomPerson[] = []
  private readonly chunker = new InputChunker()
  private readonly framer = new OutputFramer()
  /** Content-free continuity of the reply being played, logged as `audio.reply` when it ends (CX-0045). */
  private readonly reply = new ReplyAudio()
  private readonly sampler = new FrameSampler()
  /** The model is producing audio for a turn that has not ended. */
  private responding = false
  /**
   * The holder said something (Google transcribed words) and the reply has not ended: a reply may be on its way
   * before its first audio chunk, and Stop Speaking must fence it too.
   */
  private awaitingReply = false
  /**
   * When the holder's forwarded audio last carried sound since the model's turn ended (null: not since). Google may
   * answer it before it sends any transcript, so a stop fences that reply too.
   */
  private heardAt: number | null = null
  /**
   * Stop Speaking or a pause mid-turn: the rest of that model turn is dropped, never played later. Once the stopped
   * reply has begun (it was already speaking, or its first audio arrived in time), the fence holds until that turn
   * ends (turnComplete, interrupted or a reconnect), however long the provider stalls. A reply that was only
   * possibly on its way must begin within STOPPED_REPLY_WAIT_MS, or the fence lapses so a later reply is not lost.
   */
  private fence: { beginBy: number; begun: boolean } | null = null
  private playingUntil = 0
  private pumping = false
  private pauseApplied = false
  private wasSettling = false
  private absence: HolderAbsence | null = null
  /** The holder (and epoch) last seen in the room over a live room link; forgotten while the link is down. */
  private holderSeen: HolderRef | null = null
  private lastReport = 0
  private reportDirty = true
  private reporting = false
  private published = ''
  private readonly acked = new Set<string>()
  /** When a quiesce acknowledgement the API did not take is sent again (on the tick), or null. */
  private ackRetryAt: number | null = null
  /** Results sent to Google as a notice: while one waits to be heard, and once it was heard. */
  private readonly announced = new Set<string>()
  /**
   * The notice sent and not yet heard: it is recorded as announced only once its audio reached the room, with the
   * cards its members received meanwhile (`cards` resolves to how many).
   */
  private notice: { key: string; result: Result; event: Announced; cards: Promise<number> } | null = null
  /**
   * Results still owed to someone in the room: its listeners, after a notice nobody heard, or members who have not had
   * its card yet. A delivery to some is recorded, and then the API no longer lists the result, so the retry is
   * kept here (M03-RF-0017), and handed to the session that replaces this one (handover()).
   */
  private readonly owed = new Map<string, Result>()
  /** Deliveries and their records still settling: a close waits for them (bounded) before anything is handed over. */
  private readonly settling = new Set<Promise<unknown>>()
  /** Results with a delivery under way, and how many: unknown outcomes, owed again if the session closes first. */
  private readonly inFlight = new Map<string, { result: Result; count: number }>()
  /** Results the room heard Sophia say: never said again, only sent to members who have not had their card. */
  private readonly heard = new Set<string>()
  /** A session that replaces a lost one announces nothing until it has what that one handed over. */
  private awaitingHandover = false
  /**
   * What the session this one replaces spent and the API may not hold yet, once it is handed over: under a grant, no
   * provider connection opens until all of it is on the API (inheritedSettled()).
   */
  private inherited: Promise<InheritedLedger | null> | null = null
  /** That ledger once handed over (null: none); undefined while the handover is still to come. */
  private inheritedNow: InheritedLedger | null | undefined = undefined
  /** Leaving the room, once closing: a room's next exchange may join after it, whatever is still settling. */
  private leaving: Promise<void> | null = null
  /** Members who said they read Sophia (text mode); dropped when they leave. They decide whether she speaks. */
  private readonly readers = new Set<string>()
  /** Members whose Studio said its mode to this session; dropped when they leave. */
  private readonly greeted = new Set<string>()
  /** When each member present was last shown the cards again, and those whose hello waits for BACKFILL_MS to pass. */
  private readonly backfilledAt = new Map<string, number>()
  private readonly backfillDue = new Set<string>()
  /**
   * Results whose card this exchange has sent, by task, oldest first, each task at its newest revision: sent again to
   * a member whose Studio says hello (CX-0022). Kept for the exchange, and handed over; a process restart forgets it.
   */
  private readonly shown = new Map<string, Result>()
  /** Cards sent or on their way, by result and identity; those confirmed delivered; how many members, by result. */
  private readonly carded = new Set<string>()
  private readonly confirmed = new Set<string>()
  private readonly cardsDelivered = new Map<string, number>()
  private readonly noticeAttempts = new Map<string, number>()
  /**
   * Heard notices the API has not yet recorded. Each is retried until it is: an unrecorded result stays listed, and
   * a later session would announce it again.
   */
  private readonly receipts = new Map<string, Receipt>()
  /** When a result's cards may be tried again, after some member present did not get one. */
  private readonly textRetryAt = new Map<string, number>()
  private readonly cancelled = new Set<string>()
  private stopTicking: (() => void) | null = null
  private joining = false
  private joinAttempts = 0
  private joinRetryAt: number | null = null
  /** The guide's per-exchange state: utterances, record freshness, eligibility (guide-context.ts). */
  private readonly guideContext: GuideContext
  /** The API confirmed it executes exactly the declared operations. Checked before the first connection. */
  private guideBound = false
  private typedTurn: TypedTurn | null = null
  private typedOutputUntilTurnEnd = false
  private typedInputEpoch: number | null = null
  private typedStartedAt: number | null = null
  private readonly typedSeen = new Set<string>()
  private readonly captions: Captions
  /** Captions that ended while the room link was down: an end carries no words, so it waits to be sent. */
  private captionEnds: ChatCaption[] = []
  /** Under a voice qualification grant with SOPHIA_VOICE_EVIDENCE=on: its receipts and bound; otherwise null. */
  private readonly qualification: SessionQualification | null
  /** The bound or the grant's deadline stopped the provider for good (guardStop). */
  private guarded = false
  /**
   * The assignment names a grant this bridge does not hold to its limits (SOPHIA_VOICE_EVIDENCE off): it opens no
   * provider connection (decline()).
   */
  private readonly declined: boolean
  /** Under a grant: the holder's chunks waiting for their generation's reservation, and reservations under way. */
  /**
   * Input waiting for a reservation (its generation's, or a top-up), each chunk with its speaker and the provider
   * connection it waits on: only that connection's grant lets it go on.
   */
  /**
   * Chunks waiting for their connection's reservation, each with the samples dropped before it that its window has not
   * counted yet: the chunker's backlog drops pending when it was held, and the chunks evicted ahead of it.
   */
  private readonly held: Array<{ identity: string; connection: number; chunk: Int16Array; dropped: number }> = []
  private typedReserving = false
  private noticeReserving = false

  constructor(assignment: MediaAssignment, deps: SessionDeps, handover: Handover | Promise<Handover> | null = null) {
    this.exchangeId = assignment.exchangeId
    this.assignment = assignment
    this.deps = deps
    this.tools = TOOL_SETS[deps.guide.version]
    this.state = new ExchangeState(toAssignment(assignment))
    this.guideContext = new GuideContext(assignment)
    this.captions = new Captions(this.exchangeId, (packet) => this.sendCaption(packet))
    this.qualification = this.qualify(assignment)
    this.declined = deps.voiceEvidence !== true && assignment.qualification !== undefined
    // Unique across bridge restarts, and so is the provider session that starts from it: tool-call idempotency keys
    // include the provider session (amendment A06).
    this.connection = Math.floor(deps.now())
    this.providerSession = this.connection
    if (handover instanceof Promise) {
      this.awaitingHandover = true
      this.inherited = handover
        .then(
          (h) => h.ledger ?? null,
          () => null,
        )
        .then((ledger) => {
          this.inheritedNow = ledger
          return ledger
        })
      void handover
        .then(
          (h) => this.takeOver(h),
          () => undefined,
        )
        .then(() => {
          this.awaitingHandover = false
        })
    } else if (handover) {
      this.takeOver(handover)
      this.inherited = handover.ledger ? Promise.resolve(handover.ledger) : null
      this.inheritedNow = handover.ledger ?? null
    }
  }

  /**
   * What the session this one replaces still owed the room: owed from here, and its unrecorded announcements recorded
   * from the first tick. One delivered in full is not announced again while the API, not having recorded it yet,
   * still lists it. The cards it showed are shown again to the members who said hello while it was on its way, and
   * the captions it cut off are ended once this one is in the room.
   */
  private takeOver({ owed, unrecorded, done, shown, captionEnds = [] }: Handover): void {
    for (const key of done) this.announced.add(key)
    for (const { result, attempts, told, delivered, heard } of owed) {
      const key = resultKey(result)
      this.owed.set(key, result)
      this.noticeAttempts.set(key, attempts)
      for (const identity of told) {
        this.carded.add(`${key}:${identity}`)
        this.confirmed.add(`${key}:${identity}`)
      }
      this.cardsDelivered.set(key, delivered)
      if (heard) this.heard.add(key)
    }
    for (const event of unrecorded) {
      const key = resultKey(event)
      if (!this.owed.has(key)) this.announced.add(key)
      this.record(key, event, false)
    }
    for (const result of shown) this.remember(result)
    for (const identity of this.greeted) this.backfill(identity)
    this.captionEnds = [...captionEnds, ...this.captionEnds].slice(-CAPTION_ENDS_KEPT)
    if (this.room) this.sendCaptionEnds()
  }

  /**
   * An assignment that names a grant, with SOPHIA_VOICE_EVIDENCE=on: the receipts and the bound (qualification.ts).
   * Their sequence continues the exchange's, when a session replaced on it numbered some already (MediaBridge).
   */
  private qualify(assignment: MediaAssignment): SessionQualification | null {
    const { deps } = this
    const grant = assignment.qualification
    if (!deps.voiceEvidence || !grant) return null
    let seq = 0
    const qualification = new SessionQualification({
      exchangeId: this.exchangeId,
      grant,
      model: deps.model,
      instructionSha256: deps.guide.combined.sha256,
      bridgeCommit: deps.bridgeCommit ?? null,
      record: (write, signal) => deps.service.recordEvidence(write, signal),
      nextSeq: deps.evidenceSequence?.(this.exchangeId) ?? (() => (seq += 1)),
      retryMs: deps.evidenceRetryMs ?? EVIDENCE_RETRY_MS,
      now: () => deps.now(),
      attribution: () => this.state.attribution(),
      ended: (reason) => this.qualificationEnded(reason),
      stop: (why) => this.guardStop(why),
      reserve: (reserve, signal) => deps.service.reserveQualification(reserve, signal),
      reserveRetryMs: deps.reserveRetryMs ?? RESERVE_RETRY_MS,
      reserveTimeoutMs: deps.reserveTimeoutMs ?? RESERVE_TIMEOUT_MS,
      log: deps.log,
    })
    qualification.floor(assignment)
    return qualification
  }

  /** The API's guard ended the exchange (a receipt's answer said so): close now, before the poll brings the end. */
  private qualificationEnded(reason: MediaEvidenceAck['reason']): void {
    this.deps.log('qualification.exchange_ended', { exchangeId: this.exchangeId, reason })
    void this.close()
  }

  /** What this session still owes its room, once it is closed: see Handover. */
  handover(): Handover {
    // A delivery still under way when the close stopped waiting has no known outcome: it is owed again.
    const owing = new Map(this.owed)
    for (const [key, { result }] of this.inFlight) owing.set(key, result)
    const owed = [...owing].map(([key, result]) => ({
      result,
      attempts: this.noticeAttempts.get(key) ?? 0,
      told: [...this.confirmed].filter((c) => c.startsWith(`${key}:`)).map((c) => c.slice(key.length + 1)),
      delivered: this.cardsDelivered.get(key) ?? 0,
      heard: this.heard.has(key),
    }))
    const unrecorded = [...this.receipts.values()].map((r) => r.event)
    const delivered = (key: string) => this.heard.has(key) || (this.cardsDelivered.get(key) ?? 0) > 0
    const done = [...this.announced].filter((key) => !owing.has(key) && delivered(key))
    const captionEnds = this.captionEnds.length > 0 ? { captionEnds: [...this.captionEnds] } : {}
    const ledger = this.ledgerToHand()
    return { owed, unrecorded, done, shown: [...this.shown.values()], ...captionEnds, ...(ledger ? { ledger } : {}) }
  }

  /**
   * Under a grant, the ledger this session hands over (Codex r4234949420): its own, with what it inherited and has not
   * seen land, whether that is known yet or not. Inherited and seen landed (it opened), it is only its own. Still to
   * come (this session was replaced before its own handover came), it is one unanswered link that lands when the chain
   * before it does. Known, its charges, its loss and its landings go on as they are.
   */
  private ledgerToHand(): InheritedLedger | null {
    if (!this.qualification) return null
    const own = this.qualification.ledger()
    const mine: InheritedLedger = { unanswered: own.unanswered, lost: own.lost, landings: [own.landed] }
    if (this.inherited === null) return mine
    const known = this.inheritedNow
    if (known === undefined) {
      const before = this.inherited.then((ledger) => (ledger ? landedAll(ledger) : true))
      return { unanswered: mine.unanswered + 1, lost: mine.lost, landings: [...mine.landings, before] }
    }
    if (known === null) return mine
    return {
      unanswered: mine.unanswered + known.unanswered,
      lost: mine.lost || known.lost,
      landings: [...mine.landings, ...known.landings],
    }
  }

  /** Join the room first (so guests are seen before anything is heard), then connect Google. */
  async start(): Promise<void> {
    this.deps.log('session.start', {
      exchangeId: this.exchangeId,
      roomId: this.assignment.roomId,
      state: this.assignment.state,
    })
    this.stopTicking = (this.deps.every ?? everyInterval)(() => this.tick(), TICK_MS)
    this.applyPause()
    await this.join()
  }

  /**
   * Join the room with the latest assignment's token. A failure is retried with backoff, with each newer
   * assignment's fresh token; until then Sophia is unavailable, and says why.
   */
  private async join(): Promise<void> {
    if (this.closed || this.joining || this.room) return
    const token = this.assignment.roomToken
    if (!token) return this.joinFailed('The room service is not configured for Sophia')
    this.joining = true
    let room: RoomLink
    try {
      room = await this.deps.joinRoom(token, {
        people: (people) => this.onPeople(people),
        typed: (identity, packet) => this.onTyped(identity, packet),
        textMode: (identity, on) => this.onTextMode(identity, on),
        audio: (identity, samples, rate, channels) => this.onAudio(identity, samples, rate, channels),
        frame: (identity, source, frame, at) => this.onFrame(identity, source, frame, at),
        // Leaving the room reports LiveKit's own disconnect: after close() that is the leave itself, not a loss to
        // recover from (it logged session.lost and made the bridge re-read its assignments at every end, CX-0062).
        connection: (state, reason) => {
          if (!this.isClosed()) this.onRoomConnection(state, reason)
        },
      })
    } catch (err: unknown) {
      return this.joinFailed(`Sophia could not join the room: ${message(err)}`)
    } finally {
      this.joining = false
    }
    if (this.isClosed()) return void room.close().catch(() => undefined)
    this.room = room
    this.joinAttempts = 0
    this.joinRetryAt = null
    this.state.provider = this.live ? this.state.provider : 'connecting'
    this.reason = null
    room.watch(this.assignment.looking)
    this.onPeople(room.people())
    this.sendCaptionEnds()
    this.deps.log('room.joined', { exchangeId: this.exchangeId, people: standings(this.people) })
    if (!this.live) await this.connect()
  }

  private joinFailed(reason: string): void {
    this.fail(reason)
    this.joinRetryAt = this.deps.now() + (JOIN_RETRY_MS[this.joinAttempts] ?? 30_000)
    this.joinAttempts += 1
  }

  private isClosed(): boolean {
    return this.closed
  }

  private fail(reason: string): void {
    this.state.provider = 'unavailable'
    this.reason = reason
    this.reportDirty = true
    this.deps.log('session.unavailable', { exchangeId: this.exchangeId, reason })
  }

  /** The API's newer view of this exchange. */
  update(next: MediaAssignment): void {
    const pending = this.pendingReply(this.deps.now())
    const before = this.assignment
    const change = this.state.update(toAssignment(next), this.deps.now())
    this.assignment = next
    this.qualification?.floor(next)
    if (change.handoff || change.stopSpeaking || change.lookChanged || before.state !== next.state) {
      this.deps.log('assignment.changed', { exchangeId: this.exchangeId, ...epochs(next), ...change })
    }
    if (change.handoff) this.handoff()
    if (change.stopSpeaking) this.silence(pending, 'stopped')
    if (change.lookChanged) {
      this.sampler.clear()
      this.room?.watch(next.looking)
    }
    this.applyPause()
    this.ackQuiesce()
    this.checkHolder()
    this.checkTypedUpdate(change, next)
    this.reportDirty = true
    if (this.guideContext.observe(next)) this.rebuild('eligibility narrowed')
  }

  /**
   * Something the provider context may hold is no longer eligible (a note was withdrawn): stop what is playing, drop
   * the resumption handle and the connection, and start cold at once with the same static instruction. Nothing of the
   * old conversation carries over; the guide reads current records again.
   */
  private rebuild(reason: string): void {
    if (this.closed) return
    this.finishTyped('Project access changed; this reply was stopped.')
    this.deps.log('context.rebuild', { exchangeId: this.exchangeId, reason })
    this.handle = null
    const hadContext = this.live !== null || this.connecting
    const replaced = this.connection
    this.connection += 1
    this.live?.close()
    this.live = null
    if (!hadContext) return
    this.qualification?.turnEnded(replaced, 'lost')
    this.clearInput()
    this.state.bumpGeneration()
    this.silence(this.pendingReply(this.deps.now()), 'recovered')
    this.endTurn(true)
    this.state.provider = 'recovering'
    this.reconnectAt = this.deps.now()
    this.reportDirty = true
    this.qualification?.recovering(replaced, this.state.provider)
  }

  /**
   * The exchange ended or moved away: leave the room and close Google. Work is untouched. Every call waits for the same
   * close (a lost room closes itself first), so what it still owes is settled once it returns (handover()).
   */
  close(): Promise<void> {
    this.closing ??= this.shutdown()
    return this.closing
  }

  private async shutdown(): Promise<void> {
    this.deps.log('session.close', { exchangeId: this.exchangeId, lost: this.lost })
    this.finishTyped('Conversation ended; this reply was stopped.')
    this.closed = true
    this.stopTicking?.()
    const owed = this.flushAnnouncements()
    this.logReply('closed')
    const evidence = this.qualification ? this.closeQualification(this.qualification) : null
    this.captions.cut()
    this.framer.clear()
    this.connection += 1
    this.live?.close()
    this.live = null
    this.leaving = this.leaveRoom()
    await this.leaving
    await owed
    if (evidence) await evidence
  }

  /**
   * The receipts end with the session; the close waits for those still queued, bounded as for its announcements. With
   * them, what the session owes the exchange's ledger is settled (qualification.ts settle(), bounded by the ledger's own
   * attempts): every charge for what it already spent, then the bridge's stop if its bound stopped it (Codex
   * r4234233106), so neither is lost with a process that exits once the close resolves.
   */
  private async closeQualification(qualification: SessionQualification): Promise<void> {
    qualification.closed(this.lost ? 'lost' : 'ended')
    await Promise.all([qualification.flush(CLOSE_FLUSH_MS), qualification.settle()])
    this.deps.log('evidence.closed', { exchangeId: this.exchangeId, ...qualification.delivery })
  }

  private async leaveRoom(): Promise<void> {
    await this.room?.close().catch((err: unknown) => this.deps.log('room.close_failed', { error: message(err) }))
    this.room = null
  }

  /** Close, resolving once the room is left; what the session still owes may still be settling (close() waits). */
  left(): Promise<void> {
    const closing = this.close()
    return this.leaving ?? closing
  }

  /**
   * Closing: a notice still waiting to be heard was not heard, so it is owed again and the members who got its card
   * are recorded, and every announcement not yet recorded is sent once more. Bounded: what does not make it is handed
   * to the session that replaces this one (handover()), and what nothing recorded stays listed by the API.
   */
  private async flushAnnouncements(): Promise<void> {
    const notice = this.notice
    this.notice = null
    if (notice) this.unheard(notice)
    // A heard notice whose record waits on its members' cards is recorded as heard now, with the members so far.
    for (const [key, { result }] of this.inFlight) {
      if (!this.heard.has(key)) continue
      const event = { exchangeId: this.exchangeId, taskId: result.taskId, resultRevision: result.resultRevision }
      this.record(key, { ...event, heard: true, textRecipients: this.cardsDelivered.get(key) ?? 0 }, false)
    }
    const flush = async () => {
      if (notice) {
        const textRecipients = await notice.cards
        if (textRecipients > 0) this.record(notice.key, { ...notice.event, heard: false, textRecipients }, false)
      }
      // Notices on their way, and the records that follow them, settle before the receipts are sent and handed over.
      await Promise.allSettled(this.settling)
      const sends = [...this.receipts].map(([key, r]) => r.sending ?? this.sendReceipt(key, r))
      await Promise.allSettled(sends)
    }
    await Promise.race([flush(), new Promise((resolve) => setTimeout(resolve, CLOSE_FLUSH_MS))])
  }

  /** What the bridge observes now: for the room's attributes, the API's presence and tests. */
  observed(): Observed {
    const now = this.deps.now()
    const s = this.state
    const output: OutputState = this.playingUntil > now ? 'playing' : this.responding ? 'responding' : 'idle'
    return {
      voice: s.provider,
      input: s.input(now),
      output,
      inputEpoch: s.assignment.inputEpoch,
      generation: s.currentGeneration(),
    }
  }

  // Room side ----------------------------------------------------------------------------------------------------

  private onPeople(people: RoomPerson[]): void {
    this.people = people
    for (const identity of this.readers) if (!people.some((p) => p.identity === identity)) this.readers.delete(identity)
    for (const identity of this.greeted) if (!people.some((p) => p.identity === identity)) this.forget(identity)
    const abandonTools = this.typedTurn?.usedTools && (this.roomDown || people.some(isGuestLike))
    if (people.some(isGuestLike)) this.finishTyped('Conversation paused: someone without project access joined.')
    const members = people.filter((p) => !isGuestLike(p)).map((p) => p.identity)
    this.state.setPresent(members, this.roomDown || people.some(isGuestLike))
    this.applyPause()
    if (abandonTools && this.live) this.rebuild('typed tool audience changed')
    this.ackQuiesce()
    this.checkHolder()
    this.reportDirty = true
  }

  private onRoomConnection(state: 'connected' | 'reconnecting' | 'disconnected', reason: string | null): void {
    this.deps.log('room.connection', { exchangeId: this.exchangeId, state, reason })
    // Until the room is back its presence is unknown: treat it as not member-only, locally (no report), and judge
    // no holder's absence. Once back, a holder not yet seen again gets the arrival grace. A holder still awaited
    // gets it for the time the link was up (the time it was down does not count against them); an absence already
    // reported keeps its grace running, so a flapping link cannot hold the floor for someone who is gone.
    const now = this.deps.now()
    this.roomDown = state !== 'connected'
    if (this.roomDown) {
      this.holderSeen = null
      this.downAt ??= now
    } else if (this.downAt !== null) {
      const absence = this.absence
      if (absence && !absence.departed && !absence.leftReported) absence.leftAt += now - this.downAt
      this.downAt = null
    }
    this.onPeople(this.room?.people() ?? [])
    this.sendCaptionEnds()
    if (state === 'disconnected' && !this.lost) {
      this.lost = true
      void this.close()
      this.deps.lost?.(this.exchangeId)
    }
  }

  private typedReply(identity: string, packet: ChatInput, kind: ChatReply['kind'], text = '', sequence = 0): void {
    void this.room
      ?.sendChat?.(identity, { kind, id: packet.id, exchangeId: this.exchangeId, text, sequence })
      .catch(() => {
        this.deps.log('chat.delivery_unknown', { exchangeId: this.exchangeId, turnId: packet.id })
      })
  }

  private checkTypedUpdate(change: { handoff: boolean; stopSpeaking: boolean }, next: MediaAssignment): void {
    if (this.typedTurn && (change.handoff || change.stopSpeaking || next.state !== 'open')) {
      const usedTools = this.typedTurn.usedTools
      this.finishTyped('Conversation changed; this reply was stopped.')
      if (usedTools) this.rebuild('typed tool continuation abandoned')
    }
  }

  private mayAcceptTyped(identity: string, packet: ChatInput): boolean {
    return (
      this.state.mayForwardAudio(identity, this.deps.now()) &&
      packet.inputEpoch === this.assignment.inputEpoch &&
      this.live !== null &&
      !!this.room?.sendChat
    )
  }

  /**
   * A member reads Sophia or hears her again. Only a member's signal reaches here (rtc.ts checks the sender's signed
   * standing). It is kept even if this session has not yet seen that member in the room (Studio says it again the
   * moment Sophia joins, which can come before the room's people update), and dropped when they leave. Studio says it
   * on every join, reconnect and switch, so it is also the hello that brings that member's page the cards this
   * exchange has shown (CX-0022).
   */
  private onTextMode(identity: string, on: boolean): void {
    if (on) this.readers.add(identity)
    else this.readers.delete(identity)
    this.greeted.add(identity)
    this.greet(identity)
  }

  /**
   * A hello is answered with the cards at once, unless this member was shown them less than BACKFILL_MS ago: then once
   * that has passed (tick()), however many hellos came meanwhile, so a page sending hellos in a loop costs the room
   * one round of cards every few seconds. Leaving and coming back is a new appearance, answered at once.
   */
  private greet(identity: string): void {
    const now = this.deps.now()
    const last = this.backfilledAt.get(identity)
    if (last !== undefined && now - last < BACKFILL_MS) return void this.backfillDue.add(identity)
    this.backfillDue.delete(identity)
    this.backfilledAt.set(identity, now)
    this.backfill(identity)
  }

  /** A member left: what this session kept about their Studio goes. */
  private forget(identity: string): void {
    this.greeted.delete(identity)
    this.backfilledAt.delete(identity)
    this.backfillDue.delete(identity)
  }

  /**
   * The cards this exchange has shown, sent again to one member: their page may have lost them (a reload) or never had
   * them (a late arrival). Only a member's hello calls it, and rtc.ts sends to members only. It re-shows announcements
   * already under way or done, so nothing waits for it and nothing is owed or recorded for it; a member who gets a card
   * for the first time is counted by the next record of that result.
   */
  private backfill(identity: string): void {
    for (const result of this.shown.values()) {
      this.carded.delete(`${resultKey(result)}:${identity}`)
      void this.sendCards(result, [identity])
    }
  }

  /** A result whose card is being sent joins what is shown again; it replaces an older revision of its task. */
  private remember(result: Result): void {
    const held = this.shown.get(result.taskId)
    if (held && held.resultRevision >= result.resultRevision) return
    this.shown.delete(result.taskId)
    this.shown.set(result.taskId, result)
    for (const taskId of this.shown.keys()) if (this.shown.size > SHOWN_KEPT) this.shown.delete(taskId)
  }

  private onTyped(identity: string, packet: ChatInput): void {
    if (packet.exchangeId !== this.exchangeId) return
    if (!this.mayAcceptTyped(identity, packet)) {
      this.typedReply(
        identity,
        packet,
        'refused',
        'Sophia cannot receive this message now. Check the conversation and input floor.',
      )
      return
    }
    const key = `${identity}:${packet.id}`
    if (this.typedSeen.has(key)) return // Never repeat an input after an uncertain receipt.
    if (this.awaitingReply || this.responding || this.typedOutputUntilTurnEnd) {
      this.typedReply(identity, packet, 'refused', 'Wait for the current reply before sending another message.')
      return
    }
    if (this.typedSeen.size >= 500) {
      this.typedReply(identity, packet, 'refused', 'End this conversation and start a new one to continue.')
      return
    }
    this.typedSeen.add(key)
    const typed = `[Project member typed message]\n${escapeMarkers(packet.text)}`
    if (this.qualification) return this.typedUnderGrant(this.qualification, identity, packet, typed)
    this.acceptTyped(identity, packet, typed)
  }

  /**
   * Under a grant, a typed message may start a generation: it is reserved first, and sent once granted, if the
   * conversation still takes it, on the connection it was reserved for (Codex r4235562640): one that recovered
   * meanwhile is another provider connection, whose output that grant does not cover, so the sender is refused and
   * nothing is sent. One waits at a time; a refusal stops the session.
   */
  private typedUnderGrant(
    qualification: SessionQualification,
    identity: string,
    packet: ChatInput,
    typed: string,
  ): void {
    if (this.typedReserving) {
      this.typedReply(identity, packet, 'refused', 'Wait for the current reply before sending another message.')
      return
    }
    this.typedReserving = true
    const connection = this.connection
    void qualification.prompt(connection, typed.length).then((stop) => {
      this.typedReserving = false
      if (stop) this.guardStop(stop)
      const busy = this.awaitingReply || this.responding || this.typedOutputUntilTurnEnd
      const moved = connection !== this.connection || this.closed
      if (stop || busy || moved || !this.mayAcceptTyped(identity, packet)) {
        this.typedReply(identity, packet, 'refused', 'Sophia cannot receive this message now.')
        return
      }
      this.acceptTyped(identity, packet, typed)
    })
  }

  /** A typed message admitted: it reaches Google under the bridge's marker, and its reply goes to its sender alone. */
  private acceptTyped(identity: string, packet: ChatInput, typed: string): void {
    this.typedOutputUntilTurnEnd = true
    this.typedInputEpoch = packet.inputEpoch
    this.typedStartedAt = this.deps.now()
    this.state.forwarded()
    this.wordsHeard()
    this.typedTurn = {
      identity,
      packet,
      sequence: 0,
      generation: this.state.currentGeneration(),
      pendingTools: 0,
      responses: [],
      providerEnded: false,
      usedTools: false,
      toolIds: new Set(),
    }
    try {
      this.live?.sendNotice(typed)
      this.qualification?.typed({ actorId: identity, inputEpoch: packet.inputEpoch })
      this.typedReply(identity, packet, 'accepted')
      this.deps.log('chat.admitted', { exchangeId: this.exchangeId, turnId: packet.id, inputEpoch: packet.inputEpoch })
    } catch {
      this.finishTyped('Delivery is unconfirmed. The message will not be sent again automatically.')
    }
  }

  private typedOutput(text: string): void {
    const turn = this.typedTurn
    if (!turn || !this.state.mayPlay(turn.generation)) return
    for (let offset = 0; offset < text.length; offset += 2000) {
      turn.sequence += 1
      this.typedReply(turn.identity, turn.packet, 'delta', text.slice(offset, offset + 2000), turn.sequence)
    }
  }

  private finishTyped(reason?: string): void {
    const turn = this.typedTurn
    if (!turn) return
    if (!reason && turn.sequence === 0)
      reason = 'Sophia did not return a text reply. Your message will not be sent again automatically.'
    turn.sequence += 1
    this.typedReply(turn.identity, turn.packet, reason ? 'refused' : 'complete', reason ?? '', turn.sequence)
    this.typedTurn = null
  }

  private onAudio(identity: string, samples: Int16Array, rate: number, channels: number): void {
    const live = this.live
    if (this.typedOutputUntilTurnEnd) return
    if (!live || !this.state.mayForwardAudio(identity, this.deps.now())) return
    const droppedBefore = this.chunker.dropped
    try {
      this.chunker.push(samples, rate, channels)
    } catch (err: unknown) {
      if (err instanceof FormatError) return this.deps.log('audio.refused', { error: err.message })
      throw err
    }
    let dropped = this.chunker.dropped - droppedBefore
    for (let chunk = this.chunker.take(); chunk; chunk = this.chunker.take()) {
      const pending = dropped
      const gate = this.gate(identity, chunk, pending)
      if (gate === 'stop') return
      dropped = 0
      // A chunk held keeps the drop pending before it: it is counted when the chunk goes (Codex r4234936797).
      if (gate === 'hold') this.hold(identity, chunk, pending)
      else this.forward(live, chunk)
    }
  }

  private forward(live: LiveLink, chunk: Int16Array): void {
    live.sendAudio(chunk)
    this.state.forwarded()
    if (isAudible(chunk)) this.heardAt = this.deps.now()
  }

  /**
   * Whether this chunk of the holder's audio may go to the provider now: always, without a grant. Under one, the first
   * after a turn ended waits ('hold') while its generation is reserved, and so does one its connection's allowance does
   * not cover while the allowance is topped up; every chunk after it waits behind it, until that reservation (never
   * another's) is granted; a refusal stops the session.
   */
  private gate(identity: string, chunk: Int16Array, dropped: number): 'send' | 'hold' | 'stop' {
    const q = this.qualification
    if (!q) return 'send'
    // Behind the speaker's chunks still waiting for this connection's reservation: in order, never ahead of them.
    if (this.isHolding(identity, this.connection)) return 'hold'
    const verdict = q.input(this.connection, identity, chunk, dropped, this.state.assignment.inputEpoch)
    if (verdict === null) return 'send'
    if (verdict === 'hold') return 'hold'
    this.guardStop(verdict)
    return 'stop'
  }

  /**
   * Keep a chunk while its generation is being reserved (at most HELD_CHUNKS, the oldest dropped first and counted:
   * evictOldest), with the drop pending before it. Once granted, what its speaker has held on that connection goes on,
   * in order, if they still may, each with its drop counted as it goes; their first chunk held asks to be told. Another
   * speaker's chunks (the floor moved meanwhile), and a later connection's (a reconnection while the old reservation was
   * in flight), are theirs to release, never taken or dropped with these.
   */
  private hold(identity: string, chunk: Int16Array, dropped: number): void {
    const connection = this.connection
    const first = !this.isHolding(identity, connection)
    this.held.push({ identity, connection, chunk, dropped })
    if (this.held.length > HELD_CHUNKS) this.evictOldest()
    const q = this.qualification
    if (!first || !q) return
    void q.granted(connection).then((stop) => {
      if (stop) return this.guardStop(stop)
      const held = this.takeHeld(identity, connection)
      const live = this.live
      if (connection !== this.connection || !live || !this.state.mayForwardAudio(identity, this.deps.now())) return
      for (const next of held) {
        const gate = this.gate(identity, next.chunk, next.dropped)
        if (gate === 'stop') return
        if (gate === 'send') this.forward(live, next.chunk)
        else this.hold(identity, next.chunk, next.dropped)
      }
    })
  }

  /**
   * The oldest chunk held goes, never sent (Codex r4234936797): its samples, and the drop it carried, pass to the next
   * chunk its speaker holds on that connection, so the gap is counted once, on the first chunk after it that reaches the
   * provider (input_window.droppedSamples). The one just held is always such a chunk when the oldest is the same
   * speaker's on the same connection; another speaker's or an older connection's held chunks never reach the provider,
   * nor any window of theirs, so nothing is carried for them.
   */
  private evictOldest(): void {
    const evicted = this.held.shift()
    if (!evicted) return
    const next = this.held.find((h) => h.identity === evicted.identity && h.connection === evicted.connection)
    if (next) next.dropped += evicted.chunk.length + evicted.dropped
  }

  /** Whether this speaker has chunks waiting on this connection's reservation. */
  private isHolding(identity: string, connection: number): boolean {
    return this.held.some((h) => h.identity === identity && h.connection === connection)
  }

  /** This speaker's chunks held on this connection, in order, taken out; anyone else's, and other connections', stay. */
  private takeHeld(identity: string, connection: number): Array<{ chunk: Int16Array; dropped: number }> {
    const mine = (h: { identity: string; connection: number }) => h.identity === identity && h.connection === connection
    const taken = this.held.filter(mine).map(({ chunk, dropped }) => ({ chunk, dropped }))
    const rest = this.held.filter((h) => !mine(h))
    this.held.splice(0, this.held.length, ...rest)
    return taken
  }

  /** Nothing of the old input reaches Google afterwards: what the chunker has, and what waits for a reservation. */
  private clearInput(): void {
    this.chunker.clear()
    this.held.length = 0
  }

  private onFrame(identity: string, source: VisualSource, frame: RgbaFrame, capturedAt: number): void {
    const epoch = this.state.assignment.observationEpoch
    if (!this.state.mayForwardFrame(identity, source, epoch)) return
    this.sampler.offer({ ...frame, capturedAt, observationEpoch: epoch })
  }

  /**
   * Nothing of the old holder reaches Google after the epoch moved: end their stream, drop what is buffered. The
   * settle starts now, so its end is acted on even if the old turn ends before the next tick.
   */
  private handoff(): void {
    this.qualification?.windowEnded('handoff')
    this.clearInput()
    this.live?.sendAudioStreamEnd()
    this.absence = null
    if (this.state.input(this.deps.now()) === 'settling') this.wasSettling = true
  }

  /**
   * Stop Speaking (the generation already moved): clear the source and drop the rest of the current turn. A reply
   * that may still be on its way is fenced; the log says why, since a fence set on sound alone can also drop the
   * next reply when nothing was pending (the stale reply playing after a stop would be worse).
   */
  private silence(pending: PendingReply | null, how: ReplyEnd): void {
    this.logReply(how)
    this.room?.clearPlayback()
    this.framer.clear()
    this.playingUntil = 0
    // The room hears nothing more of this reply, so it reads idle at once; the fence below drops whatever of the
    // turn Google still sends.
    this.responding = false
    if (!pending) return
    this.fence = { beginBy: this.deps.now() + STOPPED_REPLY_WAIT_MS, begun: pending === 'responding' }
    this.deps.log('audio.reply_fenced', { exchangeId: this.exchangeId, because: pending })
  }

  /**
   * Whether a reply may be on its way, and why: the model is producing one, Google transcribed the holder's words,
   * or the holder's forwarded audio carried sound recently enough that a reply to it could still start.
   */
  private pendingReply(now: number): PendingReply | null {
    if (this.responding) return 'responding'
    if (this.awaitingReply) return 'transcript'
    return this.heardAt !== null && now - this.heardAt < STOPPED_REPLY_WAIT_MS ? 'sound' : null
  }

  /** Paused (by the API, or locally for a guest): input closed, output cleared, once per pause. */
  private applyPause(): void {
    const paused = this.state.input(this.deps.now()) === 'paused'
    if (!paused) {
      this.pauseApplied = false
      return
    }
    if (this.pauseApplied) return
    this.pauseApplied = true
    this.qualification?.windowEnded('paused')
    this.clearInput()
    this.sampler.clear()
    this.live?.sendAudioStreamEnd()
    this.state.bumpGeneration()
    this.silence(this.pendingReply(this.deps.now()), 'stopped')
    this.captions.cut()
    if (this.typedTurn?.usedTools) this.rebuild('typed tool continuation paused')
  }

  /**
   * A guest is waiting for their token: confirm input is closed and output cleared (case A12). Only from inside the
   * room, connected: joining as `sophia` displaced any older bridge process there, so this confirmation speaks for
   * whatever the room can hear. It is retried whenever the room's presence is known again (a join or a reconnect).
   */
  private ackQuiesce(): void {
    const requestId = this.assignment.quiesceRequestId
    if (!requestId || !this.room || this.roomDown) return
    if (!this.pauseApplied || this.acked.has(requestId)) return
    this.acked.add(requestId)
    const ack = {
      requestId,
      bridgeInstanceId: this.deps.bridgeInstanceId,
      inputClosed: true,
      outputCleared: true,
    } as const
    this.bounded((signal) => this.deps.service.ackQuiesce(ack, signal)).catch((err: unknown) => {
      // Sent again, the same request, after QUIESCE_RETRY_MS on the tick while the assignment still names it (or at
      // once when the room's presence is known again).
      this.acked.delete(requestId)
      this.ackRetryAt = this.deps.now() + QUIESCE_RETRY_MS
      this.deps.log('quiesce.ack_failed', { requestId, error: message(err) })
    })
  }

  /**
   * The holder left: pause at once; still gone after the grace, clear the floor by compare-and-set (S1-05A §7).
   * Only a holder seen in the room can leave it. One the bridge has not seen yet gets HOLDER_ARRIVAL_MS to appear,
   * and while the bridge's own room link is down nothing is judged (CX-0044).
   */
  private checkHolder(): void {
    const actorId = this.assignment.inputActorId
    const inputEpoch = this.assignment.inputEpoch
    if (!this.room || !actorId) return void (this.absence = null)
    if (this.roomDown) return
    if (this.people.some((p) => p.identity === actorId)) {
      this.holderSeen = { actorId, inputEpoch }
      this.absence = null
      return
    }
    const now = this.deps.now()
    if (!this.absence || !sameHolder(this.absence, actorId, inputEpoch)) {
      const departed = sameHolder(this.holderSeen, actorId, inputEpoch)
      const leftAt = departed ? now : now + HOLDER_ARRIVAL_MS
      this.absence = { actorId, inputEpoch, departed, leftAt, leftReported: false, goneReported: false, retryAt: 0 }
    }
    this.reportAbsence(this.absence, now)
  }

  private reportAbsence(absence: HolderAbsence, now: number): void {
    if (now < absence.retryAt) return
    if (!absence.leftReported) {
      if (now < absence.leftAt) return
      absence.leftReported = true
      const { departed, inputEpoch } = absence
      this.deps.log('holder.absent', { exchangeId: this.exchangeId, inputEpoch, departed, people: this.people.length })
      this.holderEvent(absence, 'left')
    } else if (!absence.goneReported && now - absence.leftAt >= HOLDER_GRACE_MS) {
      absence.goneReported = true
      this.holderEvent(absence, 'gone')
    }
  }

  /** One attempt of a post to the API, within POST_ATTEMPT_MS (attempt.ts): cancelled past it, its socket closed. */
  private bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return withinAttempt(this.deps.postAttemptMs ?? POST_ATTEMPT_MS, run)
  }

  /** Report the absence to the API; one it did not take is sent again after HOLDER_RETRY_MS. */
  private holderEvent(absence: HolderAbsence, event: 'left' | 'gone'): void {
    const body = { exchangeId: this.exchangeId, actorId: absence.actorId, inputEpoch: absence.inputEpoch, event }
    this.bounded((signal) => this.deps.service.holder(body, signal)).catch((err: unknown) => {
      if (event === 'left') absence.leftReported = false
      else absence.goneReported = false
      absence.retryAt = this.deps.now() + HOLDER_RETRY_MS
      this.deps.log('holder.event_failed', { event, error: message(err) })
    })
  }

  // Provider side ------------------------------------------------------------------------------------------------

  /** Under a grant, whether the bound let it through; when it did not, the provider is closed for good (guardStop). */
  private within(stop: GuardStop | null): boolean {
    if (stop === null) return true
    this.guardStop(stop)
    return false
  }

  /**
   * The provider's tool calls, attributed as they arrive. Under a grant they are its output (billed text, and perhaps a
   * generation nobody asked for): measured, held to the bound and paid before any handler runs; a cut or a refusal runs
   * none, and the calls of a connection replaced meanwhile are never run.
   */
  private callTools(calls: FunctionCall[], connection: number): void {
    // Everything a call is run as is read as it arrives, as before there was anything to wait for: a turn ending or a
    // floor moving while it waits changes none of it, and its typed turn counts it as pending from now.
    const turn = this.typedTurn
    if (this.typedOutputUntilTurnEnd && (!turn || !this.state.mayPlay(turn.generation))) return
    const who = this.state.attribution()
    const arrival: Arrival = {
      who,
      turn,
      inputMode: who && this.typedInputEpoch === who.inputEpoch ? 'text' : 'voice',
      utterance: this.guideContext.utterance,
      paused: this.state.input(this.deps.now()) === 'paused',
    }
    if (turn) {
      turn.pendingTools += calls.length
      turn.usedTools = true
      for (const call of calls) turn.toolIds.add(call.id ?? '')
    }
    const q = this.qualification
    if (!q) {
      for (const call of calls) void this.runTool(call, connection, arrival)
      return
    }
    this.callUnderGrant(q, calls, connection, arrival)
  }

  /**
   * Under a grant, calls are measured and charged as they arrive, and run once what they cost is durable on the API:
   * their payload, and their generation when nobody reserved it. A cut or a refusal runs none; the calls of a connection
   * replaced meanwhile never run. They run in the order they came: what they wait for is their connection's (its
   * generation's charge, its allowance's top-up), so a later message never waits for less than an earlier one.
   */
  private callUnderGrant(q: SessionQualification, calls: FunctionCall[], connection: number, arrival: Arrival): void {
    void q.called(connection, calls.length, payloadChars(calls)).then((stop) => {
      if (stop) return this.guardStop(stop)
      if (connection !== this.connection || this.closed) {
        if (arrival.turn) arrival.turn.pendingTools -= calls.length
        return this.deps.log('tool.dropped', { exchangeId: this.exchangeId, connection })
      }
      for (const call of calls) void this.runTool(call, connection, arrival)
    })
  }

  /**
   * Under a grant, the bound or the grant's deadline says stop (qualification.ts): nothing more reaches the provider,
   * whose connection closes for good, and what is playing stops. The session stays in the room, unavailable and saying
   * why, until the API ends the exchange (its guard, from what was reported, or at the deadline) and the assignment goes.
   */
  private guardStop(why: GuardStop): void {
    if (this.closed || this.guarded) return
    this.guarded = true
    this.deps.log('qualification.stopped', { exchangeId: this.exchangeId, why })
    this.finishTyped('This conversation reached its limit; this reply was stopped.')
    this.qualification?.turnEnded(this.connection, 'lost')
    this.connection += 1
    this.live?.close()
    this.live = null
    this.reconnectAt = null
    this.clearInput()
    this.state.bumpGeneration()
    this.silence(null, 'closed')
    this.endTurn(true)
    this.fail(`Sophia stopped: this conversation reached its qualification limit (${why})`)
    this.qualification?.closed('guard')
    void this.qualification?.stopped()
  }

  private async connect(): Promise<void> {
    if (this.closed || this.connecting) return
    if (this.declined) return this.decline()
    this.connecting = true
    try {
      if ((await this.inheritedSettled()) && (await this.checkGuideBound())) await this.openProvider()
    } finally {
      this.connecting = false
    }
  }

  /**
   * Under a grant, a session that replaces another on its exchange opens no provider connection, so reserves nothing
   * and sends no input, until everything the replaced session spent is on the API (Codex r4234649847): otherwise its
   * reservations could take the exchange's last turn or budget before an already spent charge ends it. The handover
   * comes once the replaced session closed, and its close waits for those charges, bounded (settle()); it carries what
   * that session inherited and had not seen land, so a chain of replacements waits on all of it (r4234949420). All
   * answered and taken: it opens. Still unanswered then: it fails closed, unavailable and saying so
   * (qualification.inherited_unsettled), and opens once they are all taken, if they are. One refused or never
   * confirmed, anywhere in the chain: it stays closed for good; the API ends the exchange (a refusal ends it) or its
   * deadline does. Never past the bound, whatever the wait.
   */
  private async inheritedSettled(): Promise<boolean> {
    const inherited = this.inherited
    if (!inherited || !this.qualification) return true
    const ledger = await inherited
    if (this.closed) return false
    if (!ledger || (ledger.unanswered === 0 && !ledger.lost)) {
      this.inherited = null
      return true
    }
    const detail = { exchangeId: this.exchangeId, charges: ledger.unanswered, lost: ledger.lost }
    this.deps.log('qualification.inherited_unsettled', detail)
    this.fail('Sophia waits until what the conversation before this one spent is on the record')
    if (!ledger.lost)
      void landedAll(ledger).then((landed) => {
        if (this.closed) return
        if (!landed) return this.deps.log('qualification.inherited_lost', { exchangeId: this.exchangeId })
        this.inherited = null
        void this.connect()
      })
    return false
  }

  /**
   * An assignment names a grant this bridge does not hold to its limits (SOPHIA_VOICE_EVIDENCE is off): no provider
   * connection opens, so nothing of the grant is spent unbounded. Sophia is unavailable there, and says why.
   */
  private decline(): void {
    this.deps.log('qualification.declined', { exchangeId: this.exchangeId })
    this.fail('Sophia does not take part in a qualification run this bridge does not record (SOPHIA_VOICE_EVIDENCE)')
  }

  /**
   * The guide names its version's operations; the API must execute exactly those before the guide speaks (binding
   * §5). An API that cannot say, or says otherwise, leaves Sophia unavailable with the reason, and the check runs
   * again later.
   */
  private async checkGuideBound(): Promise<boolean> {
    if (this.guideBound) return true
    let names: readonly string[] | null
    try {
      names = (await this.deps.service.toolSurface(this.deps.guide.version)).names
    } catch {
      names = null
    }
    if (names !== null && sameNames(names, this.tools.names)) {
      this.guideBound = true
      return true
    }
    this.fail(
      names === null
        ? 'Sophia’s project service could not confirm the operations her guide uses'
        : 'Sophia’s project service does not run the operations her guide uses',
    )
    this.reconnectAt = this.deps.now() + UNAVAILABLE_RETRY_MS
    return false
  }

  private async openProvider(): Promise<void> {
    if (this.closed) return
    this.connection += 1
    const connection = this.connection
    const resumed = this.handle !== null
    if (!resumed) this.providerSession += 1
    if (this.qualification) {
      const stop = await this.qualification.connecting(connection, resumed)
      if (stop) return this.guardStop(stop)
      if (connection !== this.connection || this.isClosed()) return
    }
    this.guideContext.sessionStarted(!resumed, this.everReady && !resumed)
    const { guide } = this.deps
    this.deps.log('provider.setup', {
      exchangeId: this.exchangeId,
      connection,
      resumed,
      instruction: guide.combined.sha256,
      instructionBytes: guide.combined.bytes,
      guide: guide.version,
      tools: this.tools.names.length,
      declarations: this.tools.sha256,
    })
    try {
      const link = await this.deps.connectLive(
        {
          apiKey: this.deps.apiKey,
          model: this.deps.model,
          systemInstruction: guide.instruction,
          tools: this.tools.declarations,
          resumptionHandle: this.handle,
          ...(this.qualification ? { maxOutputTokens: this.qualification.maxOutputTokens } : {}),
        },
        this.events(connection),
      )
      // close() and recover() move the connection on, so a stale or closed session never keeps the link.
      if (connection !== this.connection) link.close()
      else this.live = link
    } catch (err: unknown) {
      if (connection === this.connection) this.recover(`connect failed: ${message(err)}`)
    }
  }

  private events(connection: number): LiveEvents {
    const current = () => connection === this.connection && !this.closed
    return {
      setupComplete: () => {
        if (current()) this.ready(connection)
      },
      toolCalls: (calls) => {
        if (current()) this.callTools(calls, connection)
      },
      toolCancellations: (ids) => {
        for (const id of ids) this.cancelled.add(`${connection}:${id}`)
        if (current() && ids.some((id) => this.typedTurn?.toolIds.has(id))) this.rebuild('typed tool cancelled')
      },
      interrupted: () => {
        if (current()) this.bargeIn()
      },
      audio: (data, mimeType) => {
        if (current()) this.audioOut(data, mimeType)
      },
      // Captioned as they come, never retained (CX-0023; S1-05A A05).
      inputTranscript: (text, finished) => {
        if (current()) this.inputWords(text, finished)
      },
      outputTranscript: (text) => {
        if (current()) this.outputWords(text)
      },
      generationComplete: () => undefined,
      turnComplete: () => {
        if (current()) this.turnComplete()
      },
      goAway: (timeLeft) => {
        if (current()) this.recover(`provider going away (${timeLeft ?? 'now'})`)
      },
      resumption: (handle) => {
        if (current() && handle) this.handle = handle
      },
      usage: (usage) => {
        this.deps.log('provider.usage', { totalTokens: usage.totalTokenCount })
        this.qualification?.usage(connection, usage)
      },
      closed: (reason) => {
        if (current()) this.recover(reason)
      },
    }
  }

  private ready(connection: number): void {
    this.deps.log('provider.ready', { exchangeId: this.exchangeId, connection, resumed: this.handle !== null })
    this.qualification?.ready(connection)
    this.state.provider = 'ready'
    this.readyConnection = connection
    this.everReady = true
    this.attempts = 0
    this.reason = null
    this.reportDirty = true
  }

  /** Stop stale output, forget the connection and schedule the next one (resumed if a handle is held). */
  private recover(reason: string): void {
    if (this.closed) return
    const lost = this.connection
    this.qualification?.turnEnded(lost, 'lost')
    // Resuming abandoned typed work could deliver an uncorrelated continuation as room audio.
    if (this.typedOutputUntilTurnEnd) this.handle = null
    this.finishTyped('Connection interrupted. The message will not be sent again automatically.')
    this.typedOutputUntilTurnEnd = false
    this.typedInputEpoch = null
    const failedBeforeReady = this.readyConnection !== this.connection
    this.connection += 1
    this.live?.close()
    this.live = null
    // A handle that failed twice in a row before the connection was ready is dropped: the next start is cold.
    if (failedBeforeReady && this.attempts >= 1) this.handle = null
    this.clearInput()
    // A reply cut off mid-turn stops; one Google finished is already here and plays out.
    if (this.responding) {
      this.state.bumpGeneration()
      this.silence(null, 'recovered')
    }
    this.endTurn(true)
    const delay = RECONNECT_DELAYS_MS[this.attempts]
    this.attempts += 1
    this.state.provider = delay === undefined ? 'unavailable' : 'recovering'
    this.reason = delay === undefined ? `Sophia’s voice service is unavailable: ${reason}` : null
    this.reconnectAt = this.deps.now() + (delay ?? UNAVAILABLE_RETRY_MS)
    this.reportDirty = true
    this.qualification?.recovering(lost, this.state.provider)
    this.deps.log('provider.recover', { exchangeId: this.exchangeId, reason, attempt: this.attempts })
  }

  private bargeIn(): void {
    this.qualification?.turnEnded(this.connection, 'interrupted')
    if (this.typedTurn?.usedTools) return this.rebuild('typed tool continuation interrupted')
    this.state.bumpGeneration()
    this.silence(null, 'interrupted')
    this.endTurn(false, true)
  }

  /**
   * Google transcribed the holder's words. If they made sound after Sophia's turn ended and her finished reply is
   * still playing, they are talking over it: Google sends no `interrupted` for a turn it has ended, so the bridge
   * cuts the rest itself, as Google's barge-in would. A reply to the words may now be on its way.
   */
  private wordsHeard(): void {
    const now = this.deps.now()
    if (!this.responding && this.heardAt !== null && this.playing(now)) {
      this.state.bumpGeneration()
      this.silence(null, 'interrupted')
    }
    if (!this.awaitingReply) this.guideContext.utteranceHeard()
    this.awaitingReply = true
  }

  /**
   * Google transcribed the holder's words, or finished them. They are captioned for the holder whose audio was
   * forwarded (the floor, as tool calls are attributed), while input is admitted or a handoff settles; words no holder
   * can be found for are not shown.
   */
  private inputWords(text: string, finished: boolean): void {
    if (this.qualification && !this.within(this.qualification.heard(this.connection, charsOf(text), finished))) return
    if (text.trim()) this.wordsHeard()
    const input = this.state.input(this.deps.now())
    const who = this.state.attribution()
    if (!who || (input !== 'admitted' && input !== 'settling')) return
    this.captions.heard(text, who, finished)
  }

  /**
   * Sophia's words: a typed reply's go to its sender alone; spoken ones are captioned under her audio's own fences (a
   * typed turn's continuation, a pause or guest, a stopped reply still arriving), so no caption shows what is not heard.
   */
  private outputWords(text: string): void {
    const q = this.qualification
    if (q && text && !this.within(q.output(this.connection, { chars: charsOf(text) }))) return
    if (this.typedTurn) return this.typedOutput(text)
    if (this.typedOutputUntilTurnEnd || this.fenced(this.deps.now())) return
    const generation = this.state.currentGeneration()
    if (this.state.mayPlay(generation)) this.captions.spoken(text, generation)
  }

  /**
   * A caption packet to each member present (never a guest: words only come while none is here, inputWords and
   * outputWords), never awaited, so audio never waits on it. Words the room link cannot take are dropped, never
   * queued; an end carries no words, so one it could not take is sent once it is back.
   */
  private sendCaption(packet: ChatCaption): void {
    const room = this.room
    if (this.deps.liveCaptions === false || !room?.sendChat) return
    if (this.roomDown) {
      if (!packet.text) this.captionEnds = [...this.captionEnds, packet].slice(-CAPTION_ENDS_KEPT)
      return
    }
    for (const identity of this.members()) {
      room.sendChat(identity, packet).catch(() => {
        this.deps.log('caption.delivery_unknown', { exchangeId: this.exchangeId, turnId: packet.id })
      })
    }
  }

  /** The room link is back: the captions that ended while it was down are told so. */
  private sendCaptionEnds(): void {
    if (!this.roomDown) for (const end of this.captionEnds.splice(0)) this.sendCaption(end)
  }

  private turnComplete(): void {
    this.qualification?.turnEnded(this.connection, 'turn_complete')
    const turn = this.typedTurn
    if (turn && (turn.pendingTools > 0 || turn.responses.length > 0)) {
      // WHEN_IDLE creates another provider turn. Send one batch only AFTER the current boundary, keeping
      // attribution, recipient routing and the original 60 s deadline across every continuation.
      turn.providerEnded = true
      this.flushTypedTools(turn)
      return
    }
    this.finishTyped()
    this.typedOutputUntilTurnEnd = false
    this.typedInputEpoch = null
    if (this.framer.flush(this.state.currentGeneration())) void this.pump()
    this.reply.generated()
    this.captions.generated()
    // Nothing of it is left to play: its caption has ended as said.
    if (!this.reply.complete) this.captions.replyEnded('played')
    this.endTurn()
    this.replyDrained()
  }

  /** The reply Google finished has played to its last frame. */
  private replyDrained(): void {
    if (this.reply.complete && !this.pumping && this.framer.queued === 0) this.logReply('played')
  }

  private logReply(how: ReplyEnd): void {
    const figures = this.reply.end(how, this.framer.queued, this.framer.dropped)
    if (figures) this.deps.log('audio.reply', { exchangeId: this.exchangeId, ...figures })
    this.qualification?.replyEnded(how)
    this.captions.replyEnded(how)
  }

  /**
   * The model turn ended; when the connection was lost instead, its speaker stands for a resumed repeat. A barge-in ends
   * it while the holder is still talking.
   */
  private endTurn(connectionLost = false, holderTalking = false): void {
    this.finishTyped('Reply interrupted. The message will not be sent again automatically.')
    this.typedOutputUntilTurnEnd = false
    this.typedInputEpoch = null
    this.typedStartedAt = null
    this.captions.turnEnded(connectionLost, holderTalking)
    if (connectionLost) this.state.connectionLost()
    else this.state.turnEnded()
    this.responding = false
    this.awaitingReply = false
    this.heardAt = null
    this.fence = null
    this.noticeUnheard()
  }

  private audioOut(data: string, mimeType: string | undefined): void {
    // Under a grant, every chunk the provider sends is counted, the ones dropped below too: it was generated.
    if (this.audioStopped(data, mimeType)) return
    if (this.typedOutputUntilTurnEnd) return // Typed replies are visible text; no voice recording or playback is added.
    const generation = this.state.currentGeneration()
    if (this.fence) {
      // The stopped reply is (still) arriving: drop it until its turn ends. One that never began in time is over.
      if (this.fenced(this.deps.now())) {
        this.fence.begun = true
        return
      }
      this.fence = null
    }
    if (!this.state.mayPlay(generation)) return
    const samples = this.decodedOutput(data, mimeType)
    if (!samples) return
    this.responding = true
    const droppedBefore = this.framer.dropped
    this.framer.push(samples, generation)
    this.reply.received(samples.length, this.framer.queued, droppedBefore, this.deps.now())
    this.qualification?.replyReceived(samples.length)
    void this.pump()
  }

  /**
   * Sophia's audio as the room's track takes it: 24 kHz PCM of whole 16-bit samples, decoded; or null when it is not,
   * logged as a refused output (audio.output_refused). Nothing of the session changes.
   */
  private decodedOutput(data: string, mimeType: string | undefined): Int16Array | null {
    try {
      const rate = pcmRate(mimeType)
      if (rate !== OUTPUT_RATE) throw new FormatError(`output at ${rate} Hz; the room track is ${OUTPUT_RATE} Hz`)
      return base64ToPcm(data)
    } catch (err: unknown) {
      if (!(err instanceof FormatError)) throw err
      this.deps.log('audio.output_refused', { error: err.message })
      return null
    }
  }

  /**
   * Under a grant, whether this chunk of audio stopped the session (Codex r4235651864): it is counted and charged as it
   * came (q.output). A chunk the reply under way would have played, and that decodes as audioOut decodes it, is recorded
   * as received, its decoded samples and never a frame played; one the room's track would refuse (another rate, a
   * broken sample) is refused and logged as audioOut refuses it, and records no reply (Codex P2 r4235822091). Then the
   * provider closes for good (guardStop), and nothing of it reaches the room.
   */
  private audioStopped(data: string, mimeType: string | undefined): boolean {
    const q = this.qualification
    const stop = q?.output(this.connection, { samples: pcmSamples(data) }) ?? null
    if (!q || !stop) return false
    const samples = this.wouldPlay() ? this.decodedOutput(data, mimeType) : null
    if (samples) q.replyReceived(samples.length)
    this.guardStop(stop)
    return true
  }

  /** Whether audio arriving now would go to the room's reply, as audioOut routes it: read only, nothing changed. */
  private wouldPlay(): boolean {
    if (this.typedOutputUntilTurnEnd || this.fenced(this.deps.now())) return false
    return this.state.mayPlay(this.state.currentGeneration())
  }

  /** Feed the AudioSource with backpressure; anything of an older generation is never played. */
  private async pump(): Promise<void> {
    const room = this.room
    if (this.pumping || !room) return
    this.pumping = true
    try {
      for (;;) {
        const generation = this.state.currentGeneration()
        const frame = this.state.mayPlay(generation) ? this.framer.next(generation) : undefined
        if (!frame) break
        await room.play(frame)
        this.playingUntil = this.deps.now() + PLAYING_TAIL_MS
        this.reply.played()
        this.qualification?.replyPlayed(frame)
        this.noticeHeard()
      }
    } catch (err: unknown) {
      this.deps.log('audio.playback_failed', { error: message(err) })
    } finally {
      this.pumping = false
      this.replyDrained()
    }
  }

  /**
   * One call, as it arrived (`callTools`): it runs as whose it was, and its response's continuation answers them,
   * whoever holds the floor by then.
   */
  private async runTool(call: FunctionCall, connection: number, arrival: Arrival): Promise<void> {
    const id = call.id ?? ''
    const name = call.name ?? ''
    const { who, turn } = arrival
    const response = await this.toolOutcome(id, name, call.args ?? {}, arrival)
    if (turn) turn.pendingTools -= 1
    // Never answer a call the provider cancelled, or one from a connection that has since been replaced.
    if (connection !== this.connection || this.cancelled.has(`${connection}:${id}`)) {
      return this.deps.log('tool.dropped', { exchangeId: this.exchangeId, name, connection })
    }
    this.queueToolResponse(turn, response, connection, who)
  }

  private queueToolResponse(
    turn: TypedTurn | null,
    response: FunctionResponse,
    connection: number,
    who: Attribution | null,
  ): void {
    if (!turn) return this.answerTools([response], connection, who)
    if (this.typedTurn !== turn || !this.state.mayPlay(turn.generation)) return
    turn.responses.push(response)
    this.flushTypedTools(turn)
  }

  private flushTypedTools(turn: TypedTurn): void {
    if (this.typedTurn !== turn || !turn.providerEnded || turn.pendingTools > 0 || turn.responses.length === 0) return
    const responses = turn.responses.splice(0)
    turn.providerEnded = false
    this.answerTools(responses, this.connection, { actorId: turn.identity, inputEpoch: turn.packet.inputEpoch })
  }

  /**
   * Under a grant, a tool response may start a generation (its WHEN_IDLE continuation): it is reserved first, and sent
   * once granted, if its connection is still the current one. A refusal stops the session.
   */
  private answerTools(responses: FunctionResponse[], connection: number, who: Attribution | null): void {
    const q = this.qualification
    if (!q) return this.sendTools(responses, connection, who)
    let chars: number
    try {
      chars = JSON.stringify(responses).length
    } catch {
      return this.toolsUndelivered(connection)
    }
    void q.prompt(connection, chars).then((stop) => {
      if (stop) return this.guardStop(stop)
      if (connection !== this.connection || this.closed) {
        return this.deps.log('tool.dropped', { exchangeId: this.exchangeId, connection })
      }
      this.sendTools(responses, connection, who)
    })
  }

  private sendTools(responses: FunctionResponse[], connection: number, who: Attribution | null): void {
    try {
      this.live?.sendToolResponses(responses)
    } catch {
      return this.toolsUndelivered(connection)
    }
    this.qualification?.asked(who)
    for (const response of responses) this.logAnswered(response, connection)
  }

  /** A tool response that may not have reached the provider: the connection is replaced, never answered twice. */
  private toolsUndelivered(connection: number): void {
    this.deps.log('tool.delivery_unknown', { exchangeId: this.exchangeId, connection })
    this.finishTyped('Tool reply delivery is unconfirmed. Your message will not be sent again automatically.')
    this.rebuild('tool response delivery unconfirmed')
  }

  private logAnswered(response: FunctionResponse, connection: number): void {
    this.deps.log('tool.answered', {
      exchangeId: this.exchangeId,
      name: response.name,
      status: statusOf(response),
      connection,
      ...idsOf(response),
    })
  }

  private async toolOutcome(
    id: string,
    name: string,
    args: Record<string, unknown>,
    arrival: Arrival,
  ): Promise<FunctionResponse> {
    const call = { id, name }
    if (!CALL_ID.test(id) || !isToolName(name, this.tools.names))
      return toolResponse(call, { status: 'error', output: { reason: 'Unknown tool' } })
    // Paused as it arrived, or by the time it would run: either way it waits for the person to ask again.
    if (arrival.paused || this.state.input(this.deps.now()) === 'paused') {
      return refusedResponse(call, 'The conversation is paused; ask again when it resumes.')
    }
    const { who } = arrival
    if (!who)
      return refusedResponse(call, 'I couldn’t tell who asked that. Could the person holding the floor ask again?')
    const request: MediaToolCall = {
      exchangeId: this.exchangeId,
      connectionGeneration: this.providerSession,
      callId: id,
      name,
      args,
      inputEpoch: who.inputEpoch,
      actorId: who.actorId,
      utterance: arrival.utterance,
      inputMode: arrival.inputMode,
      guide: this.deps.guide.version,
    }
    const write = WRITE_TOOLS.has(name)
    if (write) this.guideContext.writeStarted()
    let result: MediaToolResult
    try {
      result = await this.callService(request, write)
    } finally {
      if (write) this.guideContext.writeSettled()
    }
    return toolResponse(call, this.guideContext.annotate(name, plainRefusal(this.deps.guide.version, name, result)))
  }

  /**
   * Send one call; a lost reply is sent again with the same identity, which the API answers with the receipt of a
   * write it already applied (an API from before CX-0026 refused a repeated Hold, Resume or Stop instead). A write is
   * `unknown`, never "nothing changed", while still unconfirmed after the retries, and once its reply was lost,
   * whatever else its repeat is answered (answerTo, unanswered). A refusal (4xx) is not retried.
   */
  private async callService(request: MediaToolCall, write: boolean): Promise<MediaToolResult> {
    const waits = this.deps.toolRetryMs ?? TOOL_RETRY_MS
    for (let attempt = 0; ; attempt += 1) {
      try {
        return answerTo(write && attempt > 0, await this.deps.service.toolCall(request))
      } catch (err: unknown) {
        this.deps.log('tool.failed', { name: request.name, attempt, error: message(err) })
        const refused = err instanceof ServiceError && err.status < 500
        const wait = waits[attempt]
        if (refused || wait === undefined || this.closed) return unanswered(write, attempt, refused)
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
  }

  // The tick ------------------------------------------------------------------------------------------------------

  /** Settles, frames, holder grace, reconnects, announcements and reports. */
  tick(): void {
    if (this.closed) return
    const now = this.deps.now()
    if (this.qualification) this.within(this.qualification.due())
    this.expireTyped(now)
    this.settled(now)
    this.applyPause()
    this.sendFrame(now)
    this.checkHolder()
    if (this.ackRetryAt !== null && now >= this.ackRetryAt) {
      this.ackRetryAt = null
      this.ackQuiesce()
    }
    if (this.joinRetryAt !== null && now >= this.joinRetryAt) {
      this.joinRetryAt = null
      void this.join()
    }
    if (this.reconnectAt !== null && now >= this.reconnectAt) {
      this.reconnectAt = null
      void this.connect()
    }
    this.announce(now)
    for (const identity of this.backfillDue) this.greet(identity)
    this.sendReceipts(now)
    this.publish(now)
  }

  private expireTyped(now: number): void {
    if (this.typedStartedAt === null || now - this.typedStartedAt < TYPED_REPLY_MS) return
    this.finishTyped('Reply unconfirmed. The message will not be sent again automatically.')
    // Without a provider turn boundary, replacing the connection is the fence against late old audio/tools.
    this.rebuild('typed reply timed out')
  }

  /**
   * A handoff has settled: nothing of the old holder's reply plays over the new holder. A turn still on its way is
   * cut (the settle timed out), and so is the rest of a finished reply still playing, which Google streamed ahead.
   */
  private settled(now: number): void {
    const settling = this.state.input(now) === 'settling'
    const pending = this.pendingReply(now)
    if (this.wasSettling && !settling && (pending || this.playing(now))) {
      if (this.typedOutputUntilTurnEnd) {
        // No provider turn boundary arrived. Drop the old connection so its late output cannot become voice
        // or be attributed to the new floor holder after the typed output fence is reset.
        this.rebuild('typed handoff timed out')
        this.wasSettling = false
        return
      }
      this.state.bumpGeneration()
      this.silence(pending, 'stopped')
    }
    this.wasSettling = settling
  }

  private sendFrame(now: number): void {
    const looking = this.state.assignment.looking
    const frame = this.sampler.take(now, this.state.assignment.observationEpoch)
    if (!frame || !looking || !this.live) return
    if (!this.state.mayForwardFrame(looking.participantIdentity, looking.source, frame.observationEpoch)) return
    if (this.qualification && !this.paidFrame(this.qualification)) return
    this.live.sendFrame(toJpeg(frame))
  }

  /** Under a grant, whether this frame was paid for: one the allowance does not cover yet is dropped (and counted). */
  private paidFrame(qualification: SessionQualification): boolean {
    const verdict = qualification.frame(this.connection)
    return verdict !== 'drop' && this.within(verdict)
  }

  /**
   * A finished task is announced once, when Sophia is idle and the room is member-only. It counts as announced
   * (and the API stops listing it) only once the notice's reply reached the room; one lost with the provider, or
   * interrupted before a frame played, is sent again later. Every member present gets its card as it is sent,
   * whether they hear Sophia or read her (CX-0022); when every member present reads, the cards are the announcement.
   * Who reads decides only whether Sophia says it.
   */
  private announce(now: number): void {
    const input = this.state.input(now)
    if (this.awaitingHandover || input === 'paused' || input === 'settling') return
    const members = this.members()
    // Nobody to tell: it waits for someone to arrive, rather than being said to an empty room.
    if (members.length === 0) return
    const asText = this.presentReaders().length === members.length
    const next = this.nextResult(asText, now)
    const noticeOf = next && RESULT_NOTICES.get(next.kind)
    if (!next || !noticeOf) return
    if (asText || this.heard.has(resultKey(next))) return this.announceAsText(next, members)
    this.announceAloud(next, noticeOf(next.taskId), members, now)
  }

  /** Sophia says it to the room once she is idle; every member present gets its card as it is sent. */
  private announceAloud(next: Result, notice: string, recipients: readonly string[], now: number): void {
    const live = this.live
    if (!live || this.state.provider !== 'ready' || !this.silent(now)) return
    const q = this.qualification
    if (!q) return this.sayNotice(next, notice, recipients, live)
    // Under a grant, the notice's generation is reserved first; it is said once granted, if Sophia is still idle.
    if (this.noticeReserving) return
    this.noticeReserving = true
    const connection = this.connection
    void q.prompt(connection, notice.length).then((stop) => {
      this.noticeReserving = false
      if (stop) return this.guardStop(stop)
      const granted = this.live
      if (connection !== this.connection || !granted || this.state.provider !== 'ready') return
      if (this.silent(this.deps.now())) this.sayNotice(next, notice, recipients, granted)
    })
  }

  private sayNotice(next: Result, notice: string, recipients: readonly string[], live: LiveLink): void {
    const key = resultKey(next)
    this.announced.add(key)
    const event = { exchangeId: this.exchangeId, taskId: next.taskId, resultRevision: next.resultRevision }
    this.notice = { key, result: next, event, cards: this.track(key, next, this.sendCards(next, recipients)) }
    // Asked before the notice makes the next turn a system turn: whether holder input went to the provider since its
    // last turn ended decides which generations the notice may be (qualification-recorder.ts).
    this.qualification?.asked(null)
    this.state.systemTurn()
    live.sendNotice(notice)
  }

  /**
   * The next result to announce: listed by the API or still owed, and not announced yet. An owed result a newer
   * revision of its task has superseded is not said. One going to cards only (everyone reads, or the room heard it)
   * that waits for its text retry lets the next go first.
   */
  private nextResult(asText: boolean, now: number): Result | undefined {
    this.pruneOwed()
    return [...this.assignment.results, ...this.owed.values()].find((r) => {
      const key = resultKey(r)
      if (!RESULT_NOTICES.has(r.kind) || this.announced.has(key)) return false
      return !(asText || this.heard.has(key)) || (this.textRetryAt.get(key) ?? 0) <= now
    })
  }

  /** Drop what is owed for a task the API now lists, or this session announced, at a newer revision. */
  private pruneOwed(): void {
    const newest = new Map<string, number>()
    const seen = (taskId: string, revision: number) =>
      newest.set(taskId, Math.max(newest.get(taskId) ?? revision, revision))
    for (const r of this.assignment.results) seen(r.taskId, r.resultRevision)
    for (const key of this.announced) {
      const at = key.lastIndexOf(':')
      seen(key.slice(0, at), Number(key.slice(at + 1)))
    }
    for (const [key, r] of this.owed) if ((newest.get(r.taskId) ?? 0) > r.resultRevision) this.owed.delete(key)
  }

  /** A delivery of a result, which a close waits for and a handover owes again while it is under way. */
  private track<T>(key: string, result: Result, work: Promise<T>): Promise<T> {
    this.settling.add(work)
    const entry = this.inFlight.get(key) ?? { result, count: 0 }
    entry.count += 1
    this.inFlight.set(key, entry)
    const settled = () => {
      this.settling.delete(work)
      entry.count -= 1
      if (entry.count === 0 && this.inFlight.get(key) === entry) this.inFlight.delete(key)
    }
    work.then(settled, settled)
    return work
  }

  /** The members present now, guests aside. */
  private members(): string[] {
    return this.people.filter((p) => !isGuestLike(p)).map((p) => p.identity)
  }

  /** The members present now who read Sophia. */
  private presentReaders(): string[] {
    return this.members().filter((identity) => this.readers.has(identity))
  }

  /**
   * Cards alone: everyone present reads, or the room already heard Sophia say it. It is done once every member present
   * has the card; what reached some is recorded meanwhile, and the rest are tried again after a wait.
   */
  private announceAsText(next: Result, recipients: readonly string[]): void {
    const key = resultKey(next)
    this.announced.add(key)
    void this.track(key, next, this.sendCards(next, recipients)).then(() => {
      // Counted now, not as these sends settled: a hello's card (backfill()) may have reached a member meanwhile.
      const delivered = this.cardsDelivered.get(key) ?? 0
      const event = { exchangeId: this.exchangeId, taskId: next.taskId, resultRevision: next.resultRevision }
      if (delivered > 0) this.record(key, { ...event, heard: this.heard.has(key), textRecipients: delivered })
      if (recipients.every((identity) => this.confirmed.has(`${key}:${identity}`))) this.owed.delete(key)
      else this.retryText(key, next)
    })
  }

  /**
   * Members present have not had the result's card. What reached some is recorded, so the API stops listing it:
   * the rest are owed it from here, tried again after a wait until its attempts run out.
   */
  private retryText(key: string, result: Result): void {
    const attempts = (this.noticeAttempts.get(key) ?? 0) + 1
    this.noticeAttempts.set(key, attempts)
    if (attempts < NOTICE_ATTEMPTS) {
      this.announced.delete(key)
      this.owed.set(key, result)
      this.textRetryAt.set(key, this.deps.now() + TEXT_RETRY_MS)
    } else this.owed.delete(key)
    this.deps.log('announce.not_delivered', { exchangeId: this.exchangeId, taskId: result.taskId, attempts })
  }

  /**
   * The result's card, to each recipient who has not had it sent (a hello clears that, backfill()): a fixed template of
   * ids and the task's kind. Resolves to how many distinct members have received it so far, across attempts; a card
   * sent again to a member who had it does not count twice.
   */
  private async sendCards(next: Result, recipients: readonly string[]): Promise<number> {
    this.remember(next)
    const key = resultKey(next)
    const card: Omit<ChatNotice, 'id'> = {
      kind: 'notice',
      exchangeId: this.exchangeId,
      taskId: next.taskId,
      taskKind: next.kind,
      resultRevision: next.resultRevision,
    }
    const send = async (identity: string): Promise<boolean> => {
      const sent = `${key}:${identity}`
      if (this.carded.has(sent)) return false
      this.carded.add(sent)
      const delivered = await this.room?.sendChat?.(identity, { ...card, id: randomUUID() }).catch(() => false)
      if (delivered !== true) {
        this.carded.delete(sent)
        return false
      }
      if (this.confirmed.has(sent)) return false
      this.confirmed.add(sent)
      this.cardsDelivered.set(key, (this.cardsDelivered.get(key) ?? 0) + 1)
      return true
    }
    const delivered = (await Promise.all(recipients.map(send))).filter(Boolean).length
    if (delivered > 0)
      this.deps.log('announce.as_text', { exchangeId: this.exchangeId, taskId: next.taskId, delivered })
    return this.cardsDelivered.get(key) ?? 0
  }

  /**
   * Nothing is being said, on its way or left to play, and no notice waits to be heard: the next frame the room
   * hears belongs to whatever is sent now.
   */
  private silent(now: number): boolean {
    if (this.responding || this.awaitingReply || this.notice !== null || this.fenced(now)) return false
    return !this.playing(now)
  }

  /** A stopped turn is still arriving, or may still begin: whatever is sent now would be dropped with it. */
  private fenced(now: number): boolean {
    return this.fence !== null && (this.fence.begun || now < this.fence.beginBy)
  }

  /** Some of Sophia's audio is still queued here, or still in the room's 200 ms queue. */
  private playing(now: number): boolean {
    return this.playingUntil > now || this.pumping || this.framer.queued > 0
  }

  /**
   * A frame reached the room while a notice waited: the room heard it, so it is announced, durably, with how many
   * members got its card (once their cards settled).
   */
  private noticeHeard(): void {
    const notice = this.notice
    if (!notice) return
    this.notice = null
    this.owed.delete(notice.key)
    this.heard.add(notice.key)
    // A member who arrived while it was being said gets the card too; then it is recorded, once both settle. A member
    // present whose card did not get through is owed it as a card; the room is never told it again.
    const late = this.sendCards(notice.result, this.members())
    void this.track(notice.key, notice.result, Promise.all([notice.cards, late])).then(([first, total]) => {
      this.record(notice.key, { ...notice.event, heard: true, textRecipients: Math.max(first, total) })
      const missing = this.members().filter((identity) => !this.confirmed.has(`${notice.key}:${identity}`))
      if (missing.length > 0) this.retryText(notice.key, notice.result)
    })
  }

  /**
   * Record an announcement with the API (sendReceipts retries until it is recorded). A later record of the same
   * result (text first, heard later) replaces one still waiting; the API keeps the union (0035).
   */
  private record(key: string, event: Announced, send = true): void {
    // Merged with one not yet recorded, the way the API merges them: a later record never takes back "heard".
    const waiting = this.receipts.get(key)?.event
    const merged = waiting
      ? {
          ...event,
          heard: Boolean(waiting.heard) || Boolean(event.heard),
          textRecipients: Math.max(waiting.textRecipients ?? 0, event.textRecipients ?? 0),
        }
      : event
    this.receipts.set(key, { event: merged, retryAt: 0, sending: null })
    if (send) this.sendReceipts(this.deps.now())
  }

  /** Record heard notices with the API; one that fails is tried again after RECEIPT_RETRY_MS. */
  private sendReceipts(now: number): void {
    for (const [key, receipt] of this.receipts) {
      if (receipt.sending || receipt.retryAt > now) continue
      void this.sendReceipt(key, receipt)
    }
  }

  private sendReceipt(key: string, receipt: Receipt): Promise<void> {
    const sending = this.bounded((signal) => this.deps.service.announced(receipt.event, signal)).then(
      () => {
        // A newer record of the same result may have replaced this one meanwhile: it is still to be sent.
        if (this.receipts.get(key) === receipt) this.receipts.delete(key)
      },
      (err: unknown) => {
        receipt.sending = null
        receipt.retryAt = this.deps.now() + RECEIPT_RETRY_MS
        const taskId = receipt.event.taskId
        this.deps.log('announce.record_failed', { exchangeId: this.exchangeId, taskId, error: message(err) })
      },
    )
    receipt.sending = sending
    return sending
  }

  /**
   * The notice's turn ended and nothing of it is still to play: the room did not hear it, so it may be said again.
   * The members who got its card did get it: that is recorded now, nobody having heard it, whatever the voice retries
   * do next (M03-RF-0017; since CX-0022 this holds in a room where everyone listens too, so the API stops listing it
   * and only this session, or one it hands over to, still owes the room the voice). A later retry the room hears
   * records it as heard too.
   */
  private noticeUnheard(): void {
    const notice = this.notice
    if (!notice || this.framer.queued > 0 || this.pumping) return
    this.notice = null
    const attempts = this.unheard(notice)
    if (attempts < NOTICE_ATTEMPTS) this.announced.delete(notice.key)
    this.deps.log('announce.not_heard', { exchangeId: this.exchangeId, taskId: notice.event.taskId, attempts })
    void this.track(notice.key, notice.result, notice.cards).then((textRecipients) => {
      if (textRecipients > 0) this.record(notice.key, { ...notice.event, heard: false, textRecipients })
    })
  }

  /** A notice the room did not hear used one attempt; it is owed again until its attempts run out. */
  private unheard(notice: { key: string; result: Result }): number {
    const attempts = (this.noticeAttempts.get(notice.key) ?? 0) + 1
    this.noticeAttempts.set(notice.key, attempts)
    if (attempts < NOTICE_ATTEMPTS) this.owed.set(notice.key, notice.result)
    else this.owed.delete(notice.key)
    return attempts
  }

  /** Room attributes when they change; the API's presence when it changed or every PRESENCE_EVERY_MS. */
  private publish(now: number): void {
    const o = this.observed()
    const attributes = {
      'sophia.voice': o.voice,
      'sophia.input': o.input,
      'sophia.output': o.output,
      'sophia.inputEpoch': String(o.inputEpoch),
    }
    const key = JSON.stringify(attributes)
    if (this.room && key !== this.published) {
      this.published = key
      this.room.setState(attributes).catch((err: unknown) => {
        this.published = ''
        this.deps.log('room.attributes_failed', { error: message(err) })
      })
    }
    const due = this.reportDirty || now - this.lastReport >= PRESENCE_EVERY_MS
    if (this.room && !this.roomDown && !this.reporting && due) this.report(now)
  }

  private report(now: number): void {
    this.reporting = true
    this.reportDirty = false
    this.lastReport = now
    const participants = this.people.map((p) => ({ identity: p.identity, standing: p.standing }))
    this.deps.service
      .presence({
        roomId: this.assignment.roomId,
        exchangeId: this.exchangeId,
        bridgeInstanceId: this.deps.bridgeInstanceId,
        voice: this.state.provider,
        reason: this.reason,
        participants,
      })
      .catch((err: unknown) => {
        this.reportDirty = true
        this.deps.log('presence.report_failed', { error: message(err) })
      })
      .finally(() => {
        this.reporting = false
      })
  }
}
