// The bridge's receipts for an exchange under a voice qualification grant (sophia.voice-qualification.v1, amendment A15;
// docs/plans/voice-qualification-g7.md). Pure: it turns what the session observes into receipts and hands each to
// `emit` (evidence-sender.ts sends them); it never sees a word. A receipt carries exactly the fields A15 declares:
// counts, booleans, enumerated words, ids, digests and times. Nothing of a transcript, a caption or typed text reaches
// it but a count of characters; nothing of audio but its envelope (counts, rms, peak) and a SHA-256 chain over the PCM
// the bridge forwarded or played (sha-256-chain-v1), which cannot be inverted to audio.
//
// It records only while the grant's principal holds the floor (and the assignment still names the grant): an input
// window opens only for the principal's own forwarded audio, and the provider's lifecycle is recorded only then. A reply,
// a tool call or a response is the principal's only when the generation it belongs to answers them, as that generation
// was asked for: a tool response's continuation answers the speaker of the calls, a result notice answers no one, and
// otherwise the floor's attribution as the generation starts (ExchangeState). Asks are kept in order, each with the
// generations it may be (Ask): one sent while the provider was idle is the next generation; one sent while a generation
// was under way, the one after it; one sent while holder input was forwarded and nothing produced yet, either of the
// next two. A generation is someone's only when every owner it may have agrees; otherwise it is no one's (fail closed),
// never a guess. So Sophia's answer to another member, still arriving as the floor moves to the principal, is never
// recorded, nor is the continuation of another member's tool round, whatever was forwarded or answered meanwhile; a
// reply that began for someone else stays unrecorded to its end. What opened under the principal ends with its own
// receipt, whatever ends it. The provider's counters (connections, generations, usage) are the session's, whoever
// holds the floor: the API's reservations hold them to the grant.
import { createHash, randomUUID } from 'node:crypto'
import type {
  MediaEvidenceWrite,
  VoiceInputTurnReceipt,
  VoiceInputWindowReceipt,
  VoiceOutputReplyReceipt,
  VoiceProviderReceipt,
  VoiceQualification,
  VoiceSessionClosedReceipt,
} from '@sophia/contracts'
import { INPUT_RATE, isAudible, OUTPUT_FRAME, OUTPUT_RATE, pcmBytes, type ReplyEnd } from './audio.ts'
import type { Attribution } from './exchange-state.ts'

export type Receipt = MediaEvidenceWrite['receipt']
export type WindowEnd = VoiceInputWindowReceipt['endReason']
export type ProviderPhase = VoiceProviderReceipt['phase']
export type CloseReason = VoiceSessionClosedReceipt['reason']
/** How the provider's turn ended: completed, cut by its own barge-in, or lost with its connection. */
export type TurnEnd = 'turn_complete' | 'interrupted' | 'lost'

const SCHEMA = 'sophia.bridge.voice_qualification.v1'
/** What every receipt carries: its kind and schema, the grant and run it is bound to, and when it was made. */
interface Base<K extends Receipt['kind']> {
  kind: K
  schema: typeof SCHEMA
  grantId: string
  runBindingSha256: string
  atMs: number
}
const DIGEST = 'sha-256-chain-v1'
const FULL_SCALE = 32_768
const FRAME_MS = (OUTPUT_FRAME * 1000) / OUTPUT_RATE

/**
 * sha-256-chain-v1, the Lab's own: from 32 zero bytes, for each frame i from 1, chain = sha256(chain ‖ sha256(frame
 * bytes) ‖ uint32be(i)). A frame's bytes are its 16-bit samples, little-endian, as they went to Google or the room.
 */
export class Sha256Chain {
  #chain = Buffer.alloc(32)
  #frames = 0

  add(samples: Int16Array): void {
    this.#frames += 1
    const index = Buffer.alloc(4)
    index.writeUInt32BE(this.#frames)
    const frame = createHash('sha256').update(pcmBytes(samples)).digest()
    this.#chain = createHash('sha256').update(this.#chain).update(frame).update(index).digest()
  }

  get hex(): string {
    return this.#chain.toString('hex')
  }
}

/** PCM's content-free figures: frames and samples, how many carried sound, its level (0..1 of full scale), its chain. */
class Envelope {
  frames = 0
  samples = 0
  nonzeroSamples = 0
  nonzeroFrames = 0
  audibleFrames = 0
  #squares = 0
  #peak = 0
  readonly chain = new Sha256Chain()

  add(samples: Int16Array): void {
    let nonzero = 0
    for (const s of samples) {
      this.#squares += s * s
      this.#peak = Math.max(this.#peak, Math.abs(s))
      if (s !== 0) nonzero += 1
    }
    this.frames += 1
    this.samples += samples.length
    this.nonzeroSamples += nonzero
    if (nonzero > 0) this.nonzeroFrames += 1
    if (isAudible(samples)) this.audibleFrames += 1
    this.chain.add(samples)
  }

  get rms(): number {
    return this.samples === 0 ? 0 : Math.sqrt(this.#squares / this.samples) / FULL_SCALE
  }

  get peak(): number {
    return this.#peak / FULL_SCALE
  }
}

/**
 * One provider connection: its durable ordinal in the exchange (the API's reservation gave it), its provider session,
 * whether it resumed one, and what the provider reported of it (its session's highest total, the newest prompt size).
 */
interface Link {
  connection: number
  providerSession: string
  resumed: boolean
  usage: number | null
  lastPrompt: number | null
}

interface Window {
  windowSeq: number
  inputEpoch: number
  link: Link
  startedAtMs: number
  envelope: Envelope
  droppedSamples: number
  transcribed: boolean
  transcriptChars: number
  finished: boolean
  responded: boolean
  toolCalls: number
}

interface Reply {
  replyOrdinal: number
  turnOrdinal: number
  link: Link
  receivedAtMs: number
  firstPlayedAtMs: number | null
  samplesReceived: number
  played: Envelope
}

export interface RecorderSetup {
  grant: VoiceQualification
  model: string
  /** SHA-256 of the instruction every connection sends (the guide's combined bytes). */
  instructionSha256: string
  /** The deployed commit (RENDER_GIT_COMMIT, 40 hex), or null. */
  bridgeCommit: string | null
  now: () => number
  /** Whose turn the provider is answering (ExchangeState): a window's turn is attributed to its holder or not. */
  attribution: () => Attribution | null
  emit: (receipt: Receipt) => void
  /** A provider session id (a UUID); tests fix it. */
  uuid?: () => string
}

/** A window that ends before its turn did: what the provider showed of the turn by then. */
const CUT_OUTCOME: Record<'handoff' | 'paused', VoiceInputTurnReceipt['outcome']> = {
  handoff: 'answered',
  paused: 'interrupted',
}

/**
 * A generation the bridge asked for (a tool response, a notice): whom it answers, and the generations it may be, by
 * ordinal (turns + 1 is the next). Under WHEN_IDLE the provider takes an ask when it is next idle, in order. `floors`
 * are the holders whose forwarded input may be answered among those generations instead: the floor's attribution when
 * it was asked, and at each barge-in since. They stay candidates however the floor moves before the output comes.
 */
interface Ask {
  by: Attribution | null
  from: number
  to: number
  floors: Attribution[]
}

export class QualificationRecorder {
  readonly #setup: RecorderSetup
  readonly #links = new Map<number, Link>()
  #link: Link | null = null
  #recording = false
  #closed = false
  #emitted = 0
  #window: Window | null = null
  #reply: Reply | null = null
  /**
   * A reply that began unrecorded (another member's turn, a turn no one's audio started, or not the principal's floor)
   * stays so to its end.
   */
  #unrecordedReply = false
  /** Whom the generation under way answers, fixed as its first output arrives; undefined before that. */
  #owner: Attribution | null | undefined = undefined
  /** The generations the bridge asked for whose turns have not all passed, in the order asked. */
  #asks: Ask[] = []
  #windows = 0
  #replies = 0
  #toolCalls = 0
  #typed = 0
  /** Provider generations ended so far; the one under way, or the next, is turns + 1. */
  #turns = 0
  /** The provider produced something (audio, a call, words) since its last turn ended. */
  #generating = false

  constructor(setup: RecorderSetup) {
    this.#setup = setup
  }

  /** Who holds the floor now, and the grant the assignment names: receipts are recorded only for the principal. */
  floor(holder: string | null, grantId: string | null): void {
    const { grant } = this.#setup
    this.#recording = !this.#closed && holder === grant.principalActorId && grantId === grant.grantId
  }

  /**
   * A provider connection is opening, under the durable ordinal its reservation returned; a resumed one continues its
   * provider session.
   */
  opened(ordinal: number, resumed: boolean): void {
    const providerSession = resumed && this.#link ? this.#link.providerSession : (this.#setup.uuid?.() ?? randomUUID())
    const link = { connection: ordinal, providerSession, resumed, usage: null, lastPrompt: null }
    this.#links.set(ordinal, link)
    this.#link = link
    this.provider('setup', ordinal)
  }

  /** A phase of a connection's lifecycle (setup, ready, recovering, unavailable, closed); usage has its own. */
  provider(phase: ProviderPhase, connection: number): void {
    const link = this.#links.get(connection)
    if (!link || !this.#recording) return
    const receipt: VoiceProviderReceipt = {
      ...this.#base('provider'),
      phase,
      providerSession: link.providerSession,
      connection: link.connection,
      resumed: link.resumed,
      model: this.#setup.model,
      instructionSha256: this.#setup.instructionSha256,
      bridgeCommit: this.#setup.bridgeCommit,
      connectionsOpened: Math.max(...this.#links.keys()),
      turns: this.#turns,
      usageTokens: link.usage,
      lastPromptTokens: link.lastPrompt,
    }
    this.#emit(receipt)
  }

  /**
   * The provider's usage report on a connection (by its durable ordinal): its session's total so far. A report that
   * does not raise the connection's total is older news, and is not recorded. The receipt carries that connection's
   * own total and newest prompt size; the API keeps each connection's and sums them.
   */
  usage(connection: number, total: number, promptTokens: number | null): void {
    const link = this.#links.get(connection)
    if (!link || (link.usage !== null && total <= link.usage)) return
    link.usage = total
    link.lastPrompt = promptTokens ?? link.lastPrompt
    this.provider('usage', connection)
  }

  /** A chunk of the holder's audio went to the provider: the principal's opens a window, if none is open. */
  input(identity: string, chunk: Int16Array, droppedSamples: number, inputEpoch: number): void {
    if (!this.#window && this.#link && this.#recording && identity === this.#setup.grant.principalActorId) {
      this.#windows += 1
      this.#window = {
        windowSeq: this.#windows,
        inputEpoch,
        link: this.#link,
        startedAtMs: this.#at(),
        envelope: new Envelope(),
        droppedSamples: 0,
        transcribed: false,
        transcriptChars: 0,
        finished: false,
        responded: false,
        toolCalls: 0,
      }
    }
    if (!this.#window || identity !== this.#setup.grant.principalActorId) return
    this.#window.envelope.add(chunk)
    this.#window.droppedSamples += droppedSamples
  }

  /** The provider transcribed the holder's words: how many characters, never which. */
  heard(chars: number, finished: boolean): void {
    const w = this.#window
    if (!w) return
    if (chars > 0) w.transcribed = true
    w.transcriptChars += chars
    if (finished) w.finished = true
  }

  /**
   * The bridge asked for a generation: a tool response, whose continuation answers the calls' speaker, or a notice, which
   * answers no one (null). Sent while the provider was idle (nothing produced in this turn, no holder input forwarded
   * since the last turn ended: ExchangeState's attribution is null), it is the next generation; sent while a generation
   * was under way, the one after it; sent while holder input was forwarded and nothing produced yet, either of the next
   * two, since that input may or may not start one first. Each comes after the asks before it.
   */
  asked(by: Attribution | null): void {
    const next = this.#turns + 1
    const floor = this.#setup.attribution()
    let from = this.#generating ? next + 1 : next
    let to = this.#generating || floor !== null ? next + 1 : next
    const last = this.#asks.at(-1)
    if (last) {
      from = Math.max(from, last.from + 1)
      to = Math.max(to, last.to + 1)
    }
    this.#asks.push({ by, from, to, floors: floor === null ? [] : [floor] })
  }

  /** The provider produced something: audio, words, or tool calls (counted while the principal holds the floor). */
  responded(toolCalls = 0): void {
    this.#generating = true
    if (!this.#answeringPrincipal()) return
    if (this.#recording) this.#toolCalls += toolCalls
    if (!this.#window) return
    this.#window.responded = true
    this.#window.toolCalls += toolCalls
  }

  typed(): void {
    if (this.#recording) this.#typed += 1
  }

  /** The provider's turn ended: the window it answered ends with it. */
  turnEnded(how: TurnEnd): void {
    const responded = this.#window?.responded ?? false
    if (how === 'turn_complete') this.#endWindow('turn_complete', responded ? 'answered' : 'no_user_turn_observed')
    else if (how === 'interrupted') this.#endWindow('interrupted', 'interrupted')
    else this.#endWindow('closed', 'connection_lost')
    if (how !== 'lost' || this.#generating) this.#turns += 1
    this.#generating = false
    this.#owner = undefined
    this.#settleAsks(how)
  }

  /**
   * After a turn ends: an ask whose generations have all passed is spent, whether its generation produced anything or
   * not (a notice cut before a word); a lost connection's asks are never answered on the next one; and a barge-in may
   * be answered before what is still asked, so each of those may come one generation later.
   */
  #settleAsks(how: TurnEnd): void {
    if (how === 'lost') {
      this.#asks = []
      return
    }
    this.#asks = this.#asks.filter((a) => a.to > this.#turns)
    if (how !== 'interrupted') return
    // The barge-in's speaker may be answered first, whoever holds the floor by the time the output comes.
    const barging = this.#setup.attribution()
    for (const a of this.#asks) {
      a.to += 1
      if (barging) a.floors.push(barging)
    }
  }

  /** The window ends before its turn did: a handoff or a pause. */
  windowEnded(reason: 'handoff' | 'paused'): void {
    const responded = this.#window?.responded ?? false
    this.#endWindow(reason, responded ? CUT_OUTCOME[reason] : 'no_user_turn_observed')
  }

  /**
   * Reply audio arrived (24 kHz samples): a reply opens while the principal holds the floor and the turn it answers is
   * theirs; one that began otherwise is never recorded, to its end.
   */
  replyReceived(samples: number): void {
    if (!this.#reply && !this.#unrecordedReply) {
      if (!this.#link || !this.#recording || !this.#answeringPrincipal()) {
        this.#unrecordedReply = true
        return
      }
      this.#replies += 1
      this.#reply = {
        replyOrdinal: this.#replies,
        turnOrdinal: this.#turns + 1,
        link: this.#link,
        receivedAtMs: this.#at(),
        firstPlayedAtMs: null,
        samplesReceived: 0,
        played: new Envelope(),
      }
    }
    if (this.#reply) this.#reply.samplesReceived += samples
  }

  /** A 20 ms frame of the reply was handed to the room's track. */
  replyPlayed(frame: Int16Array): void {
    const r = this.#reply
    if (!r) return
    r.firstPlayedAtMs ??= this.#at()
    r.played.add(frame)
  }

  /** The reply ended, as the session's own reply log says (audio.ts ReplyEnd). */
  replyEnded(terminal: ReplyEnd): void {
    this.#unrecordedReply = false
    const r = this.#reply
    if (!r) return
    this.#reply = null
    const receipt: VoiceOutputReplyReceipt = {
      ...this.#base('output_reply'),
      replyOrdinal: r.replyOrdinal,
      turnOrdinal: r.turnOrdinal,
      providerSession: r.link.providerSession,
      connection: r.link.connection,
      receivedAtMs: r.receivedAtMs,
      firstPlayedAtMs: r.firstPlayedAtMs,
      endedAtMs: this.#at(),
      terminal,
      samplesReceived: r.samplesReceived,
      framesPlayed: r.played.frames,
      nonSilentFramesPlayed: r.played.nonzeroFrames,
      rms: r.played.rms,
      peak: r.played.peak,
      durationMs: r.played.frames * FRAME_MS,
      playedDigestAlgorithm: DIGEST,
      playedSha256Chain: r.played.chain.hex,
    }
    this.#emit(receipt)
  }

  /**
   * The session closes, or the bound stopped it: what is open ends, the provider is recorded closed, and the session's
   * close follows when anything of it was recorded. Nothing is recorded after.
   */
  closed(reason: CloseReason): void {
    if (this.#closed) return
    this.#endWindow('closed', 'connection_lost')
    this.replyEnded('closed')
    if (this.#link) this.provider('closed', this.#link.connection)
    if (this.#recording || this.#emitted > 0) {
      const receipt: VoiceSessionClosedReceipt = {
        ...this.#base('session_closed'),
        providerClosed: this.#links.size > 0,
        windows: this.#windows,
        turns: this.#turns,
        replies: this.#replies,
        toolCalls: this.#toolCalls,
        typedMessages: this.#typed,
        transcriptRetained: false,
        reason,
      }
      this.#emit(receipt)
    }
    this.#closed = true
    this.#recording = false
  }

  #endWindow(endReason: WindowEnd, outcome: VoiceInputTurnReceipt['outcome']): void {
    const w = this.#window
    if (!w) return
    this.#window = null
    const at = this.#at()
    const windowReceipt: VoiceInputWindowReceipt = {
      ...this.#base('input_window'),
      windowSeq: w.windowSeq,
      inputEpoch: w.inputEpoch,
      providerSession: w.link.providerSession,
      connection: w.link.connection,
      startedAtMs: w.startedAtMs,
      endedAtMs: at,
      endReason,
      chunkCount: w.envelope.frames,
      sampleCount: w.envelope.samples,
      nonzeroSampleCount: w.envelope.nonzeroSamples,
      audibleChunkCount: w.envelope.audibleFrames,
      rms: w.envelope.rms,
      peak: w.envelope.peak,
      droppedSamples: w.droppedSamples,
      sampleRate: INPUT_RATE,
      pcmDigestAlgorithm: DIGEST,
      pcmSha256Chain: w.envelope.chain.hex,
      rawAudioExcluded: true,
    }
    this.#emit(windowReceipt)
    this.#emit(this.#turnReceipt(w, outcome))
  }

  #turnReceipt(w: Window, outcome: VoiceInputTurnReceipt['outcome']): VoiceInputTurnReceipt {
    const who = this.#setup.attribution()
    return {
      ...this.#base('input_turn'),
      windowSeq: w.windowSeq,
      turnOrdinal: this.#turns + 1,
      inputTranscriptionObserved: w.transcribed,
      transcriptChars: w.transcriptChars,
      finished: w.finished,
      attributedToHolder: who?.actorId === this.#setup.grant.principalActorId && who.inputEpoch === w.inputEpoch,
      modelResponded: w.responded,
      toolCallCount: w.toolCalls,
      outcome,
    }
  }

  /** The generation under way answers the principal (as it was asked for, never whoever holds the floor now). */
  #answeringPrincipal(): boolean {
    if (this.#owner === undefined) this.#owner = this.#ownerOf(this.#turns + 1)
    return this.#owner?.actorId === this.#setup.grant.principalActorId
  }

  /**
   * Whom generation `n` answers, fixed as its first output arrives: the floor's attribution when nothing asked for may be
   * it; the ask it surely is (the only one that may be it, and only it); otherwise whom every owner it may have agrees
   * on: the asks that may be it, the holders whose input they may come after (as they were when asked or barged in on,
   * whoever holds the floor now), and, when holder input was forwarded since the last turn ended, the floor's. When
   * they do not agree it is no one's (null), never a guess.
   */
  #ownerOf(n: number): Attribution | null {
    const asked = this.#asks.filter((a) => a.from <= n && n <= a.to)
    const floor = this.#setup.attribution()
    const only = asked.length === 1 ? asked[0] : undefined
    if (asked.length === 0) return floor
    if (only && only.from === only.to) return only.by
    const owners = asked.flatMap((a) => [a.by, ...a.floors])
    if (floor !== null) owners.push(floor)
    const first = owners[0] ?? null
    return owners.every((o) => o !== null && o.actorId === first?.actorId) ? first : null
  }

  #base<K extends Receipt['kind']>(kind: K): Base<K> {
    const { grantId, runBindingSha256 } = this.#setup.grant
    return { kind, schema: SCHEMA, grantId, runBindingSha256, atMs: this.#at() }
  }

  #at(): number {
    return Math.floor(this.#setup.now())
  }

  #emit(receipt: Receipt): void {
    this.#emitted += 1
    this.#setup.emit(receipt)
  }
}
