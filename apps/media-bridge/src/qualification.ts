// An exchange under a voice qualification grant, as its RoomSession sees it (sophia.voice-qualification.v1; amendment
// A15, migration 0046; docs/plans/voice-qualification-g7.md). It joins the receipts (qualification-recorder.ts, sent by
// evidence-sender.ts) to the bridge's own spend bound (qualification-reserve.ts) and the grant's deadline. A session
// has one only when SOPHIA_VOICE_EVIDENCE=on and its assignment names a grant; otherwise it has none, and nothing here
// runs: what the bridge sends to the API and the provider is what it sent before.
//
// The bound holds for the whole session under the grant, whoever holds the floor: it counts and records nothing. Each
// check comes before what it checks is sent, and returns why the session must stop, or null; once stopped, every check
// says so, and the session sends nothing more to the provider and closes it (RoomSession.guardStop). The receipts are
// recorded only while the grant's principal holds the floor (the recorder decides).
import type { UsageMetadata } from '@google/genai'
import type { MediaAssignment, MediaEvidenceAck, VoiceQualification } from '@sophia/contracts'
import type { ReplyEnd } from './audio.ts'
import { EvidenceSender } from './evidence-sender.ts'
import type { Attribution, ProviderState } from './exchange-state.ts'
import { type CloseReason, QualificationRecorder, type TurnEnd } from './qualification-recorder.ts'
import { QualificationReserve, type Stop, type Verdict } from './qualification-reserve.ts'
import type { MediaService } from './service.ts'

/** Why the session stopped talking to the provider: the bound (qualification-reserve.ts) or the grant's deadline. */
export type GuardStop = Stop | 'deadline'

/**
 * SOPHIA_VOICE_EVIDENCE as the bridge reads it, the way the API reads SOPHIA_VOICE_QUALIFICATION: on, or off when off,
 * unset or empty. Anything else stops the bridge's start: an operator who meant on must not get a silent off.
 */
export function voiceEvidenceSetting(raw: string | undefined): boolean {
  const value = raw?.trim() || undefined
  if (value === undefined || value === 'off') return false
  if (value !== 'on') throw new Error('SOPHIA_VOICE_EVIDENCE is on, off or unset')
  return true
}

/** The deployed commit a provider receipt names: RENDER_GIT_COMMIT when it is 40 hex, otherwise none, never guessed. */
export function commitOf(raw: string | undefined): string | null {
  return raw !== undefined && /^[0-9a-f]{40}$/.test(raw) ? raw : null
}

export interface QualificationDeps {
  exchangeId: string
  grant: VoiceQualification
  model: string
  instructionSha256: string
  bridgeCommit: string | null
  record: MediaService['recordEvidence']
  nextSeq: () => number
  retryMs: readonly number[]
  now: () => number
  attribution: () => Attribution | null
  /** The API's guard ended the exchange (an evidence answer said so). */
  ended: (reason: MediaEvidenceAck['reason']) => void
  log: (event: string, detail?: Record<string, unknown>) => void
}

export class SessionQualification {
  readonly #deps: QualificationDeps
  readonly #reserve: QualificationReserve
  readonly #recorder: QualificationRecorder
  readonly #sender: EvidenceSender
  readonly #deadline: number
  /** The session's connection numbers, by their ordinal in this session (the reserve's and the receipts' ids). */
  readonly #ordinals = new Map<number, number>()
  /** Connections whose holder input already holds a generation's reserve, until that connection's turn ends. */
  readonly #listening = new Set<number>()
  #stopped: GuardStop | null = null

  constructor(deps: QualificationDeps) {
    this.#deps = deps
    const { grant } = deps
    this.#reserve = new QualificationReserve({
      usageTokens: grant.maxUsageTokens,
      outputTokensPerTurn: grant.maxOutputTokensPerTurn,
      turns: grant.maxTurns,
      connections: grant.maxProviderConnections,
    })
    // An unreadable deadline is already past: the bound fails closed.
    const deadline = Date.parse(grant.deadline)
    this.#deadline = Number.isFinite(deadline) ? deadline : 0
    this.#sender = new EvidenceSender({
      exchangeId: deps.exchangeId,
      grantId: grant.grantId,
      record: deps.record,
      nextSeq: deps.nextSeq,
      retryMs: deps.retryMs,
      ended: deps.ended,
      log: deps.log,
    })
    this.#recorder = new QualificationRecorder({
      grant,
      model: deps.model,
      instructionSha256: deps.instructionSha256,
      bridgeCommit: deps.bridgeCommit,
      now: deps.now,
      attribution: deps.attribution,
      emit: (receipt) => this.#sender.send(receipt),
    })
  }

  /** The provider's output cap for one generation: the grant's (the bound does not rely on it being honoured). */
  get maxOutputTokens(): number {
    return this.#deps.grant.maxOutputTokensPerTurn
  }

  /** The API's newer view: who holds the floor, and whether it still names the grant. */
  floor(assignment: MediaAssignment): void {
    this.#recorder.floor(assignment.inputActorId, assignment.qualification?.grantId ?? null)
  }

  /** Before a provider connection opens: the grant's connections, the first included. */
  connecting(connection: number, resumed: boolean): GuardStop | null {
    const ordinal = this.#ordinals.size + 1
    const stop = this.#check(() => this.#reserve.connected(ordinal))
    if (stop) return stop
    this.#ordinals.set(connection, this.#recorder.opened(resumed))
    return null
  }

  ready(connection: number): void {
    this.#recorder.provider('ready', this.#ordinal(connection))
  }

  /** A connection was lost or replaced: the next is on its way, or the provider is unavailable for now. */
  recovering(connection: number, state: ProviderState): void {
    this.#recorder.provider(state === 'unavailable' ? 'unavailable' : 'recovering', this.#ordinal(connection))
  }

  /** The provider's usage report, from whichever connection sent it: what it reports was spent. */
  usage(connection: number, usage: UsageMetadata): void {
    const total = usage.totalTokenCount
    const ordinal = this.#ordinals.get(connection)
    if (total === undefined || ordinal === undefined) return
    this.#reserve.reported(ordinal, total)
    this.#recorder.usage(ordinal, total, usage.promptTokenCount ?? null)
  }

  /**
   * Before a chunk of the holder's audio goes to the provider. The first after its turn ended may start a generation, so
   * it takes one's reserve; every chunk is counted. `dropped` is what the chunker dropped before it.
   */
  input(
    connection: number,
    identity: string,
    chunk: Int16Array,
    dropped: number,
    inputEpoch: number,
  ): GuardStop | null {
    const ordinal = this.#ordinal(connection)
    if (!this.#listening.has(connection)) {
      const stop = this.#check(() => this.#reserve.reserve(ordinal))
      if (stop) return stop
      this.#listening.add(connection)
    }
    const stop = this.#check(() => this.#reserve.sentAudio(chunk.length))
    if (stop) return stop
    this.#recorder.input(identity, chunk, dropped, inputEpoch)
    return null
  }

  /** Before text that starts a generation goes to the provider: a tool response, a notice, a typed message. */
  prompt(connection: number, chars: number): GuardStop | null {
    const ordinal = this.#ordinal(connection)
    return this.#check(() => this.#reserve.reserve(ordinal)) ?? this.#check(() => this.#reserve.sentText(chars))
  }

  /** Before a video frame goes to the provider. */
  frame(): GuardStop | null {
    return this.#check(() => this.#reserve.sentFrame())
  }

  /**
   * Output arrived: audio (24 kHz samples), tool calls, or Sophia's words (their characters, billed as text). A
   * generation nobody reserved takes its reserve now; one past the grant's per-turn output is cut.
   */
  output(connection: number, out: { samples?: number; toolCalls?: number; chars?: number }): GuardStop | null {
    const ordinal = this.#ordinal(connection)
    const stop =
      this.#check(() => this.#reserve.received(ordinal, out.samples ?? 0)) ??
      (out.chars === undefined ? null : this.#check(() => this.#reserve.transcribed(out.chars ?? 0)))
    if (stop) return stop
    this.#recorder.responded(out.toolCalls ?? 0)
    return null
  }

  /** The holder's words were transcribed: billed as text; the receipt keeps only how many characters. */
  heard(chars: number, finished: boolean): GuardStop | null {
    const stop = this.#check(() => this.#reserve.transcribed(chars))
    if (stop) return stop
    this.#recorder.heard(chars, finished)
    return null
  }

  /** The provider's turn on this connection ended: completed, cut by its barge-in, or lost with the connection. */
  turnEnded(connection: number, how: TurnEnd): void {
    this.#reserve.ended(this.#ordinal(connection))
    this.#listening.delete(connection)
    this.#recorder.turnEnded(how)
  }

  windowEnded(reason: 'handoff' | 'paused'): void {
    this.#recorder.windowEnded(reason)
  }

  typed(): void {
    this.#recorder.typed()
  }

  replyReceived(samples: number): void {
    this.#recorder.replyReceived(samples)
  }

  replyPlayed(frame: Int16Array): void {
    this.#recorder.replyPlayed(frame)
  }

  replyEnded(how: ReplyEnd): void {
    this.#recorder.replyEnded(how)
  }

  /** Past the grant's deadline: the session stops (checked on every tick, and before anything is sent). */
  due(): GuardStop | null {
    if (this.#stopped === null && this.#deps.now() >= this.#deadline) this.#halt('deadline')
    return this.#stopped
  }

  /** The session closed, or the bound stopped it: the receipts end. */
  closed(reason: CloseReason): void {
    this.#recorder.closed(reason)
  }

  /**
   * Waits (at most `ms`) for the receipts still queued, as a close waits for its announcements; what is left then is
   * dropped and counted.
   */
  async flush(ms: number): Promise<void> {
    await this.#sender.flush(ms)
    this.#sender.abandon()
  }

  /** Receipts the API took and receipts dropped, for the close's log. */
  get delivery(): { sent: number; dropped: number } {
    return { sent: this.#sender.sent, dropped: this.#sender.dropped }
  }

  #ordinal(connection: number): number {
    return this.#ordinals.get(connection) ?? 0
  }

  #check(verdict: () => Verdict): GuardStop | null {
    const due = this.due()
    if (due) return due
    const v = verdict()
    if (!v.ok) this.#halt(v.stop)
    return this.#stopped
  }

  #halt(why: GuardStop): void {
    this.#stopped ??= why
  }
}
