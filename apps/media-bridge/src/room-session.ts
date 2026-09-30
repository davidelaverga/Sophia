import type { ChatInput, ChatReply } from '@sophia/contracts/room-chat'
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
//    provider session, so a decision binds to an answer given after its proposal was put (SMC-M01 binding §4.3).
//  - Every connection, fresh, resumed or rebuilt, sends the same checked M01 instruction (guide.ts). The guide is
//    activated only once the API confirms it executes exactly the declared operations; before that, Sophia is
//    unavailable and says why. A narrower eligibility (a withdrawn note) drops the provider context and starts cold.
//  - GoAway or a lost connection: a reply cut off mid-turn stops (one Google finished plays out), the latest
//    resumption handle is used once the new connection is ready; a handle that fails is dropped and the next
//    connection starts cold.
//  - The room's state (what the bridge observes, never content) is reported to the API and set as the `sophia`
//    participant's attributes, so the room's light shows what is actually happening.
import type { FunctionCall, FunctionResponse } from '@google/genai'
import type { MediaAssignment, MediaToolCall, MediaToolResult } from '@sophia/contracts'
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
import { type Assignment, ExchangeState, type InputState } from './exchange-state.ts'
import { GuideContext } from './guide-context.ts'
import type { MissionGuide } from './guide.ts'
import type { ConnectLive, LiveEvents, LiveLink } from './live-session.ts'
import type { JoinRoom, RoomLink, RoomPerson, VisualSource } from './rtc.ts'
import { type MediaService, ServiceError } from './service.ts'
import { DECLARED_NAMES, isToolName, refusedResponse, toolResponse, WRITE_TOOLS } from './tools.ts'
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
const sameNames = (a: readonly string[], b: readonly string[]) => a.toSorted().join(',') === b.toSorted().join(',')

interface Announced {
  exchangeId: string
  taskId: string
  resultRevision: number
}
const CALL_ID = /^[A-Za-z0-9_.:-]{1,64}$/

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
const shortString = (value: unknown) => (typeof value === 'string' && value.length <= 64 ? value : undefined)

/** The ids a tool answer carries (the work it started or controlled, a refusal's code), for the log only. */
function idsOf(response: FunctionResponse): Record<string, string> {
  const output: unknown = response.response?.output
  if (typeof output !== 'object' || output === null) return {}
  const ids: Array<[string, string | undefined]> = [
    ['workId', 'workId' in output ? shortString(output.workId) : undefined],
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
  /** Results sent to Google as a notice: while one waits to be heard, and once it was heard. */
  private readonly announced = new Set<string>()
  /** The notice sent and not yet heard: it is recorded as announced only once its audio reached the room. */
  private notice: { key: string; event: Announced } | null = null
  private readonly noticeAttempts = new Map<string, number>()
  /**
   * Heard notices the API has not yet recorded. Each is retried until it is: an unrecorded result stays listed, and
   * a later session would announce it again.
   */
  private readonly receipts = new Map<string, { event: Announced; retryAt: number; sending: boolean }>()
  private readonly cancelled = new Set<string>()
  private stopTicking: (() => void) | null = null
  private joining = false
  private joinAttempts = 0
  private joinRetryAt: number | null = null
  /** The guide's per-exchange state: utterances, record freshness, eligibility (guide-context.ts). */
  private readonly guideContext: GuideContext
  /** The API confirmed it executes exactly the declared operations. Checked before the first connection. */
  private guideBound = false
  private typedTurn: { identity: string; packet: ChatInput; sequence: number; generation: number } | null = null
  private typedOutputUntilTurnEnd = false
  private typedInputEpoch: number | null = null
  private typedStartedAt: number | null = null
  private readonly typedSeen = new Set<string>()

  constructor(assignment: MediaAssignment, deps: SessionDeps) {
    this.exchangeId = assignment.exchangeId
    this.assignment = assignment
    this.deps = deps
    this.state = new ExchangeState(toAssignment(assignment))
    this.guideContext = new GuideContext(assignment)
    // Unique across bridge restarts, and so is the provider session that starts from it: tool-call idempotency keys
    // include the provider session (amendment A06).
    this.connection = Math.floor(deps.now())
    this.providerSession = this.connection
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
    this.connection += 1
    this.live?.close()
    this.live = null
    if (!hadContext) return
    this.chunker.clear()
    this.state.bumpGeneration()
    this.silence(this.pendingReply(this.deps.now()), 'recovered')
    this.endTurn(true)
    this.state.provider = 'recovering'
    this.reconnectAt = this.deps.now()
    this.reportDirty = true
  }

  /** The exchange ended or moved away: leave the room and close Google. Work is untouched. */
  async close(): Promise<void> {
    if (this.closed) return
    this.deps.log('session.close', { exchangeId: this.exchangeId, lost: this.lost })
    this.finishTyped('Conversation ended; this reply was stopped.')
    this.closed = true
    this.stopTicking?.()
    this.logReply('closed')
    this.framer.clear()
    this.connection += 1
    this.live?.close()
    this.live = null
    await this.room?.close().catch((err: unknown) => this.deps.log('room.close_failed', { error: message(err) }))
    this.room = null
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
    if (people.some(isGuestLike)) this.finishTyped('Conversation paused: someone without project access joined.')
    const members = people.filter((p) => !isGuestLike(p)).map((p) => p.identity)
    this.state.setPresent(members, this.roomDown || people.some(isGuestLike))
    this.applyPause()
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
    if (this.typedTurn && (change.handoff || change.stopSpeaking || next.state !== 'open'))
      this.finishTyped('Conversation changed; this reply was stopped.')
  }

  private mayAcceptTyped(identity: string, packet: ChatInput): boolean {
    return (
      this.state.mayForwardAudio(identity, this.deps.now()) &&
      packet.inputEpoch === this.assignment.inputEpoch &&
      this.live !== null &&
      !!this.room?.sendChat
    )
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
    this.typedOutputUntilTurnEnd = true
    this.typedInputEpoch = packet.inputEpoch
    this.typedStartedAt = this.deps.now()
    this.state.forwarded()
    this.wordsHeard()
    this.typedTurn = { identity, packet, sequence: 0, generation: this.state.currentGeneration() }
    try {
      this.live?.sendNotice(`[Project member typed message]\n${packet.text}`)
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
    turn.sequence += 1
    this.typedReply(turn.identity, turn.packet, reason ? 'refused' : 'complete', reason ?? '', turn.sequence)
    this.typedTurn = null
  }

  private onAudio(identity: string, samples: Int16Array, rate: number, channels: number): void {
    const live = this.live
    if (this.typedOutputUntilTurnEnd) return
    if (!live || !this.state.mayForwardAudio(identity, this.deps.now())) return
    try {
      this.chunker.push(samples, rate, channels)
    } catch (err: unknown) {
      if (err instanceof FormatError) return this.deps.log('audio.refused', { error: err.message })
      throw err
    }
    for (let chunk = this.chunker.take(); chunk; chunk = this.chunker.take()) {
      live.sendAudio(chunk)
      this.state.forwarded()
      if (isAudible(chunk)) this.heardAt = this.deps.now()
    }
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
    this.chunker.clear()
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
    this.chunker.clear()
    this.sampler.clear()
    this.live?.sendAudioStreamEnd()
    this.state.bumpGeneration()
    this.silence(this.pendingReply(this.deps.now()), 'stopped')
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
    this.deps.service.ackQuiesce(ack).catch((err: unknown) => {
      this.acked.delete(requestId)
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

  /** Report the absence to the API; one it did not take is sent again after HOLDER_RETRY_MS. */
  private holderEvent(absence: HolderAbsence, event: 'left' | 'gone'): void {
    const body = { exchangeId: this.exchangeId, actorId: absence.actorId, inputEpoch: absence.inputEpoch, event }
    this.deps.service.holder(body).catch((err: unknown) => {
      if (event === 'left') absence.leftReported = false
      else absence.goneReported = false
      absence.retryAt = this.deps.now() + HOLDER_RETRY_MS
      this.deps.log('holder.event_failed', { event, error: message(err) })
    })
  }

  // Provider side ------------------------------------------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.closed || this.connecting) return
    this.connecting = true
    try {
      if (await this.checkGuideBound()) await this.openProvider()
    } finally {
      this.connecting = false
    }
  }

  /**
   * The guide names six operations; the API must execute exactly those before the guide speaks (binding §5). An API
   * that cannot say, or says otherwise, leaves Sophia unavailable with the reason, and the check runs again later.
   */
  private async checkGuideBound(): Promise<boolean> {
    if (this.guideBound) return true
    let names: readonly string[] | null
    try {
      names = (await this.deps.service.toolSurface()).names
    } catch {
      names = null
    }
    if (names !== null && sameNames(names, DECLARED_NAMES)) {
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
    this.guideContext.sessionStarted(!resumed, this.everReady && !resumed)
    const { guide } = this.deps
    this.deps.log('provider.setup', {
      exchangeId: this.exchangeId,
      connection,
      resumed,
      instruction: guide.combined.sha256,
      instructionBytes: guide.combined.bytes,
      tools: DECLARED_NAMES.length,
    })
    try {
      const link = await this.deps.connectLive(
        {
          apiKey: this.deps.apiKey,
          model: this.deps.model,
          systemInstruction: guide.instruction,
          resumptionHandle: this.handle,
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
        if (current()) for (const call of calls) void this.runTool(call, connection)
      },
      toolCancellations: (ids) => {
        for (const id of ids) this.cancelled.add(`${connection}:${id}`)
      },
      interrupted: () => {
        if (current()) this.bargeIn()
      },
      audio: (data, mimeType) => {
        if (current()) this.audioOut(data, mimeType)
      },
      // Transcripts are not retained or published (S1-05A A05: only under a test's explicit scope).
      inputTranscript: (text) => {
        if (current() && text.trim()) this.wordsHeard()
      },
      outputTranscript: (text) => {
        if (current()) this.typedOutput(text)
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
      usage: (usage) => this.deps.log('provider.usage', { totalTokens: usage.totalTokenCount }),
      closed: (reason) => {
        if (current()) this.recover(reason)
      },
    }
  }

  private ready(connection: number): void {
    this.deps.log('provider.ready', { exchangeId: this.exchangeId, connection, resumed: this.handle !== null })
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
    this.finishTyped('Connection interrupted. The message will not be sent again automatically.')
    this.typedOutputUntilTurnEnd = false
    this.typedInputEpoch = null
    const failedBeforeReady = this.readyConnection !== this.connection
    this.connection += 1
    this.live?.close()
    this.live = null
    // A handle that failed twice in a row before the connection was ready is dropped: the next start is cold.
    if (failedBeforeReady && this.attempts >= 1) this.handle = null
    this.chunker.clear()
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
    this.deps.log('provider.recover', { exchangeId: this.exchangeId, reason, attempt: this.attempts })
  }

  private bargeIn(): void {
    this.state.bumpGeneration()
    this.silence(null, 'interrupted')
    this.endTurn()
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

  private turnComplete(): void {
    this.finishTyped()
    this.typedOutputUntilTurnEnd = false
    this.typedInputEpoch = null
    if (this.framer.flush(this.state.currentGeneration())) void this.pump()
    this.reply.generated()
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
  }

  /** The model turn ended; when the connection was lost instead, its speaker stands for a resumed repeat. */
  private endTurn(connectionLost = false): void {
    this.finishTyped('Reply interrupted. The message will not be sent again automatically.')
    this.typedOutputUntilTurnEnd = false
    this.typedInputEpoch = null
    this.typedStartedAt = null
    if (connectionLost) this.state.connectionLost()
    else this.state.turnEnded()
    this.responding = false
    this.awaitingReply = false
    this.heardAt = null
    this.fence = null
    this.noticeUnheard()
  }

  private audioOut(data: string, mimeType: string | undefined): void {
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
    let samples: Int16Array
    try {
      const rate = pcmRate(mimeType)
      if (rate !== OUTPUT_RATE) throw new FormatError(`output at ${rate} Hz; the room track is ${OUTPUT_RATE} Hz`)
      samples = base64ToPcm(data)
    } catch (err: unknown) {
      if (err instanceof FormatError) return this.deps.log('audio.output_refused', { error: err.message })
      throw err
    }
    this.responding = true
    const droppedBefore = this.framer.dropped
    this.framer.push(samples, generation)
    this.reply.received(samples.length, this.framer.queued, droppedBefore, this.deps.now())
    void this.pump()
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
        this.noticeHeard()
      }
    } catch (err: unknown) {
      this.deps.log('audio.playback_failed', { error: message(err) })
    } finally {
      this.pumping = false
      this.replyDrained()
    }
  }

  private async runTool(call: FunctionCall, connection: number): Promise<void> {
    const id = call.id ?? ''
    const name = call.name ?? ''
    const response = await this.toolOutcome(id, name, call.args ?? {})
    // Never answer a call the provider cancelled, or one from a connection that has since been replaced.
    if (connection !== this.connection || this.cancelled.has(`${connection}:${id}`)) {
      return this.deps.log('tool.dropped', { exchangeId: this.exchangeId, name, connection })
    }
    this.live?.sendToolResponses([response])
    this.deps.log('tool.answered', {
      exchangeId: this.exchangeId,
      name,
      status: statusOf(response),
      connection,
      ...idsOf(response),
    })
  }

  private async toolOutcome(id: string, name: string, args: Record<string, unknown>): Promise<FunctionResponse> {
    const call = { id, name }
    if (!CALL_ID.test(id) || !isToolName(name))
      return toolResponse(call, { status: 'error', output: { reason: 'Unknown tool' } })
    if (this.state.input(this.deps.now()) === 'paused') {
      return refusedResponse(call, 'The conversation is paused; ask again when it resumes.')
    }
    const who = this.state.attribution()
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
      utterance: this.guideContext.utterance,
      inputMode: this.typedInputEpoch === who.inputEpoch ? 'text' : 'voice',
    }
    const write = WRITE_TOOLS.has(name)
    if (write) this.guideContext.writeStarted()
    let result: MediaToolResult
    try {
      result = await this.callService(request, write)
    } finally {
      if (write) this.guideContext.writeSettled()
    }
    return toolResponse(call, this.guideContext.annotate(name, result))
  }

  /**
   * Send one call; a lost reply is sent again with the same identity (the API answers a repeat with the same result).
   * A write still unconfirmed after the retries is `unknown`, never "nothing changed"; a refusal (4xx) is not retried.
   */
  private async callService(request: MediaToolCall, write: boolean): Promise<MediaToolResult> {
    const waits = this.deps.toolRetryMs ?? TOOL_RETRY_MS
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.deps.service.toolCall(request)
      } catch (err: unknown) {
        this.deps.log('tool.failed', { name: request.name, attempt, error: message(err) })
        const refused = err instanceof ServiceError && err.status < 500
        const wait = waits[attempt]
        if (refused || wait === undefined || this.closed) return write && !refused ? WRITE_UNCONFIRMED : TOOL_FAILED
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
  }

  // The tick ------------------------------------------------------------------------------------------------------

  /** Settles, frames, holder grace, reconnects, announcements and reports. */
  tick(): void {
    if (this.closed) return
    const now = this.deps.now()
    this.expireTyped(now)
    this.settled(now)
    this.applyPause()
    this.sendFrame(now)
    this.checkHolder()
    if (this.joinRetryAt !== null && now >= this.joinRetryAt) {
      this.joinRetryAt = null
      void this.join()
    }
    if (this.reconnectAt !== null && now >= this.reconnectAt) {
      this.reconnectAt = null
      void this.connect()
    }
    this.announce(now)
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
    this.live.sendFrame(toJpeg(frame))
  }

  /**
   * A finished brief is announced once, when Sophia is idle and the room is member-only. It counts as announced
   * (and the API stops listing it) only once the notice's reply reached the room; one lost with the provider, or
   * interrupted before a frame played, is sent again later.
   */
  private announce(now: number): void {
    const live = this.live
    const input = this.state.input(now)
    if (!live || this.state.provider !== 'ready' || !this.silent(now)) return
    if (input === 'paused' || input === 'settling') return
    const next = this.assignment.results.find((r) => !this.announced.has(`${r.taskId}:${r.resultRevision}`))
    if (!next) return
    const key = `${next.taskId}:${next.resultRevision}`
    this.announced.add(key)
    const event = { exchangeId: this.exchangeId, taskId: next.taskId, resultRevision: next.resultRevision }
    this.notice = { key, event }
    this.state.systemTurn()
    live.sendNotice(
      `[Sophia system notice] The brief you drafted is ready in the project (taskId ${next.taskId}). ` +
        'Tell the room in one short sentence. Read it only if someone asks (read_selected_source with that taskId).',
    )
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

  /** A frame reached the room while a notice waited: the room heard it, so it is announced, durably. */
  private noticeHeard(): void {
    const notice = this.notice
    if (!notice) return
    this.notice = null
    this.receipts.set(notice.key, { event: notice.event, retryAt: 0, sending: false })
    this.sendReceipts(this.deps.now())
  }

  /** Record heard notices with the API; one that fails is tried again after RECEIPT_RETRY_MS. */
  private sendReceipts(now: number): void {
    for (const [key, receipt] of this.receipts) {
      if (receipt.sending || receipt.retryAt > now) continue
      receipt.sending = true
      this.deps.service.announced(receipt.event).then(
        () => this.receipts.delete(key),
        (err: unknown) => {
          receipt.sending = false
          receipt.retryAt = this.deps.now() + RECEIPT_RETRY_MS
          const taskId = receipt.event.taskId
          this.deps.log('announce.record_failed', { exchangeId: this.exchangeId, taskId, error: message(err) })
        },
      )
    }
  }

  /** The notice's turn ended and nothing of it is still to play: it was not heard, so it may be sent again. */
  private noticeUnheard(): void {
    const notice = this.notice
    if (!notice || this.framer.queued > 0 || this.pumping) return
    this.notice = null
    const attempts = (this.noticeAttempts.get(notice.key) ?? 0) + 1
    this.noticeAttempts.set(notice.key, attempts)
    if (attempts < NOTICE_ATTEMPTS) this.announced.delete(notice.key)
    this.deps.log('announce.not_heard', { exchangeId: this.exchangeId, taskId: notice.event.taskId, attempts })
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
