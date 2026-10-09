// The bridge's receipts for an exchange under a voice qualification grant (sophia.voice-qualification.v1, amendment A15;
// docs/plans/voice-qualification-g7.md). Pure: it turns what the session observes into receipts and hands each to
// `emit` (evidence-sender.ts sends them); it never sees a word. A receipt carries exactly the fields A15 declares:
// counts, booleans, enumerated words, ids, digests and times. Nothing of a transcript, a caption or typed text reaches
// it but a count of characters; nothing of audio but its envelope (counts, rms, peak) and a SHA-256 chain over the PCM
// the bridge forwarded or played (sha-256-chain-v1), which cannot be inverted to audio.
//
// It records only while the grant's principal holds the floor (and the assignment still names the grant): an input
// window opens only for the principal's own forwarded audio, a reply only while they hold the floor, and the provider's
// lifecycle is recorded only then. What opened under the principal ends with its own receipt, whatever ends it. The
// provider's counters (connections, generations, usage) are the session's, whoever holds the floor: the API's guard
// holds them to the grant.
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

/** One provider connection: its ordinal in the session (1..), its provider session, and whether it resumed one. */
interface Link {
  connection: number
  providerSession: string
  resumed: boolean
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

export class QualificationRecorder {
  readonly #setup: RecorderSetup
  readonly #links = new Map<number, Link>()
  readonly #usage = new Map<number, number>()
  #link: Link | null = null
  #recording = false
  #closed = false
  #emitted = 0
  #window: Window | null = null
  #reply: Reply | null = null
  #windows = 0
  #replies = 0
  #toolCalls = 0
  #typed = 0
  /** Provider generations ended so far; the one under way, or the next, is turns + 1. */
  #turns = 0
  /** The provider produced something (audio, a call, words) since its last turn ended. */
  #generating = false
  #usageTokens: number | null = null
  #lastPromptTokens: number | null = null

  constructor(setup: RecorderSetup) {
    this.#setup = setup
  }

  /** Who holds the floor now, and the grant the assignment names: receipts are recorded only for the principal. */
  floor(holder: string | null, grantId: string | null): void {
    const { grant } = this.#setup
    this.#recording = !this.#closed && holder === grant.principalActorId && grantId === grant.grantId
  }

  /** A provider connection is opening: the next ordinal, continuing its provider session when it resumes one. */
  opened(resumed: boolean): number {
    const providerSession = resumed && this.#link ? this.#link.providerSession : (this.#setup.uuid?.() ?? randomUUID())
    const link = { connection: this.#links.size + 1, providerSession, resumed }
    this.#links.set(link.connection, link)
    this.#link = link
    this.provider('setup', link.connection)
    return link.connection
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
      connectionsOpened: this.#links.size,
      turns: this.#turns,
      usageTokens: this.#usageTokens,
      lastPromptTokens: this.#lastPromptTokens,
    }
    this.#emit(receipt)
  }

  /**
   * The provider's usage report on a connection: its session's total so far. A report that does not raise the
   * connection's total is older news, and is not recorded. The receipt carries every connection's highest total,
   * summed, and the prompt size of the newest report that gave one.
   */
  usage(connection: number, total: number, promptTokens: number | null): void {
    const known = this.#usage.get(connection)
    if (known !== undefined && total <= known) return
    this.#usage.set(connection, total)
    this.#usageTokens = [...this.#usage.values()].reduce((sum, t) => sum + t, 0)
    this.#lastPromptTokens = promptTokens ?? this.#lastPromptTokens
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

  /** The provider produced something: audio, words, or tool calls (counted while the principal holds the floor). */
  responded(toolCalls = 0): void {
    this.#generating = true
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
  }

  /** The window ends before its turn did: a handoff or a pause. */
  windowEnded(reason: 'handoff' | 'paused'): void {
    const responded = this.#window?.responded ?? false
    this.#endWindow(reason, responded ? CUT_OUTCOME[reason] : 'no_user_turn_observed')
  }

  /** Reply audio arrived (24 kHz samples): a reply opens while the principal holds the floor. */
  replyReceived(samples: number): void {
    if (!this.#reply && this.#link && this.#recording) {
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
