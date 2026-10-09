// An exchange under a voice qualification grant, as its RoomSession sees it (sophia.voice-qualification.v1; amendment
// A15, migration 0046; docs/plans/voice-qualification-g7.md). It joins the receipts (qualification-recorder.ts, sent by
// evidence-sender.ts), the exchange's durable bound (qualification-ledger.ts, held by the API) and the bridge's own
// first check (qualification-reserve.ts), with the grant's deadline. A session has one only when
// SOPHIA_VOICE_EVIDENCE=on and its assignment names a grant; otherwise it has none, and nothing here runs: what the
// bridge sends to the API and the provider is what it sent before.
//
// The bound holds for the whole session under the grant, whoever holds the floor: it counts and records nothing. Every
// spend is first checked here, at once and without the network (a refusal here never waits on the API), then reserved
// on the API, which holds the exchange's true counts across replaced sessions and restarted bridges:
// - a provider connection is reserved before it opens, and its durable ordinal names its receipts;
// - a generation is reserved before what can start one is sent (the first input after a turn ended, held meanwhile; a
//   tool response; a notice; a typed message), charged at its worst case with what was sent and transcribed since the
//   last charge; one that starts unasked (its output arrives while no generation is paid for, a reservation still in
//   flight included: nothing behind that has reached the provider yet) is charged as its output arrives.
// A refusal, or no answer in time, stops the session for good: it sends nothing more to the provider and closes it
// (RoomSession.guardStop). The receipts are recorded only while the grant's principal holds the floor.
import type { UsageMetadata } from '@google/genai'
import type { MediaAssignment, MediaEvidenceAck, VoiceQualification } from '@sophia/contracts'
import type { ReplyEnd } from './audio.ts'
import { EvidenceSender } from './evidence-sender.ts'
import type { Attribution, ProviderState } from './exchange-state.ts'
import { type CloseReason, QualificationRecorder, type TurnEnd } from './qualification-recorder.ts'
import { type LedgerAnswer, type LedgerStop, QualificationLedger } from './qualification-ledger.ts'
import { ASSUMED_RATES, QualificationReserve, type Stop, type Verdict } from './qualification-reserve.ts'
import type { MediaService } from './service.ts'

/** Why the session stopped talking to the provider: its own bound, the API's refusal, or the grant's deadline. */
export type GuardStop = Stop | LedgerStop | 'deadline'

/** The most a single charge may be (the API refuses more): the largest budget a grant can have. */
const MAX_CHARGE = 5_000_000
const INPUT_RATE = 16_000

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
  /** A reservation made on the way (an unasked generation's) was refused: the session stops. */
  stop: (why: GuardStop) => void
  reserve: MediaService['reserveQualification']
  reserveRetryMs: readonly number[]
  reserveTimeoutMs: number
  log: (event: string, detail?: Record<string, unknown>) => void
}

/** A provider connection: its ordinal in this session (the first check's) and in the exchange (the API's). */
interface Link {
  local: number
  durable: number
}

export class SessionQualification {
  readonly #deps: QualificationDeps
  readonly #reserve: QualificationReserve
  readonly #ledger: QualificationLedger
  readonly #recorder: QualificationRecorder
  readonly #sender: EvidenceSender
  readonly #deadline: number
  /** The session's connection numbers, and each one's ordinals. */
  readonly #links = new Map<number, Link>()
  /**
   * The reservation in flight for the next generation on a connection, asked for by input: input waits for it, and only
   * this one, once granted, lets input flow.
   */
  readonly #pending = new Map<number, Promise<GuardStop | null>>()
  /**
   * Generations paid for on a connection that no turn has ended yet: each granted reservation, and each generation
   * charged as it arrived (unasked). Input flows while there is one; output arriving while there is none is a generation
   * nobody reserved. A turn's end takes one.
   */
  readonly #granted = new Map<number, number>()
  /** Tokens sent and transcribed since the last charge, at the assumed rates: the next charge carries them. */
  #sinceCharge = 0
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
    this.#ledger = new QualificationLedger({
      exchangeId: deps.exchangeId,
      grantId: grant.grantId,
      reserve: deps.reserve,
      retryMs: deps.reserveRetryMs,
      timeoutMs: deps.reserveTimeoutMs,
      log: deps.log,
    })
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

  /**
   * Before a provider connection opens (the first, a reconnection, a replacing session's): checked here, then reserved
   * on the API, whose durable ordinal its receipts name. Resolves to why it must not open, or null.
   */
  async connecting(connection: number, resumed: boolean): Promise<GuardStop | null> {
    const local = this.#links.size + 1
    const stop = this.#check(() => this.#reserve.connected(local))
    if (stop) return stop
    const answer = await this.#ledger.connection()
    if (!answer.ok || answer.ordinal === null) return this.#refused(answer)
    if (this.#stopped) return this.#stopped
    this.#links.set(connection, { local, durable: answer.ordinal })
    this.#recorder.opened(answer.ordinal, resumed)
    return null
  }

  ready(connection: number): void {
    this.#recorder.provider('ready', this.#durable(connection))
  }

  /** A connection was lost or replaced: the next is on its way, or the provider is unavailable for now. */
  recovering(connection: number, state: ProviderState): void {
    this.#recorder.provider(state === 'unavailable' ? 'unavailable' : 'recovering', this.#durable(connection))
  }

  /** The provider's usage report, from whichever connection sent it: what it reports was spent. */
  usage(connection: number, usage: UsageMetadata): void {
    const total = usage.totalTokenCount
    const link = this.#links.get(connection)
    if (total === undefined || link === undefined) return
    this.#reserve.reported(link.local, total)
    this.#recorder.usage(link.durable, total, usage.promptTokenCount ?? null)
  }

  /**
   * Before a chunk of the holder's audio goes to the provider. The first after a turn ended may start a generation: it
   * is reserved, and input waits ('hold') until the API granted it (granted()). Every chunk sent is counted. `dropped`
   * is what the chunker dropped before it.
   */
  input(
    connection: number,
    identity: string,
    chunk: Int16Array,
    dropped: number,
    inputEpoch: number,
  ): GuardStop | 'hold' | null {
    if (this.#pending.has(connection)) return this.#stopped ?? 'hold'
    if (!this.#granted.has(connection)) {
      const stop = this.#check(() => this.#reserve.reserve(this.#local(connection)))
      if (stop) return stop
      this.#reserveInput(connection)
      return 'hold'
    }
    const stop = this.#check(() => this.#reserve.sentAudio(chunk.length))
    if (stop) return stop
    this.#sinceCharge += (chunk.length / INPUT_RATE) * ASSUMED_RATES.audioInPerSecond
    this.#recorder.input(identity, chunk, dropped, inputEpoch)
    return null
  }

  /** The reservation input waits for on this connection: null once granted, or why the session stops. */
  granted(connection: number): Promise<GuardStop | null> {
    return this.#pending.get(connection) ?? Promise.resolve(this.#stopped)
  }

  /**
   * Before text that starts a generation goes to the provider: a tool response, a notice, a typed message. Checked
   * here at once, then reserved on the API; resolves to why it must not be sent, or null.
   */
  prompt(connection: number, chars: number): Promise<GuardStop | null> {
    const stop =
      this.#check(() => this.#reserve.reserve(this.#local(connection))) ??
      this.#check(() => this.#reserve.sentText(chars))
    if (stop) return Promise.resolve(stop)
    this.#sinceCharge += chars / ASSUMED_RATES.charsPerToken
    return this.#charge(connection, false).then((refused) => {
      if (!refused) this.#grant(connection)
      return refused
    })
  }

  /** Before a video frame goes to the provider: counted, and carried by the next charge. */
  frame(): GuardStop | null {
    const stop = this.#check(() => this.#reserve.sentFrame())
    if (!stop) this.#sinceCharge += ASSUMED_RATES.perFrame
    return stop
  }

  /**
   * Output arrived: audio (24 kHz samples), tool calls, or Sophia's words (their characters, billed as text). A
   * generation nobody reserved takes its reserve now, and is charged on the API (unasked); one past the grant's
   * per-turn output is cut.
   */
  output(connection: number, out: { samples?: number; toolCalls?: number; chars?: number }): GuardStop | null {
    const ordinal = this.#local(connection)
    const stop =
      this.#check(() => this.#reserve.received(ordinal, out.samples ?? 0)) ??
      (out.chars === undefined ? null : this.#check(() => this.#reserve.transcribed(out.chars ?? 0)))
    if (stop) return stop
    if (out.chars !== undefined) this.#sinceCharge += out.chars / ASSUMED_RATES.charsPerToken
    // A reservation still in flight is for what comes next: nothing behind it has reached the provider yet.
    if (!this.#granted.has(connection)) this.#unasked(connection)
    this.#recorder.responded(out.toolCalls ?? 0)
    return null
  }

  /** The holder's words were transcribed: billed as text; the receipt keeps only how many characters. */
  heard(chars: number, finished: boolean): GuardStop | null {
    const stop = this.#check(() => this.#reserve.transcribed(chars))
    if (stop) return stop
    this.#sinceCharge += chars / ASSUMED_RATES.charsPerToken
    this.#recorder.heard(chars, finished)
    return null
  }

  /**
   * The provider's turn on this connection ended: completed, cut by its barge-in, or lost with the connection. A
   * generation still being reserved is for what comes next, and stays.
   */
  turnEnded(connection: number, how: TurnEnd): void {
    this.#reserve.ended(this.#local(connection))
    const paid = this.#granted.get(connection) ?? 0
    if (paid > 1) this.#granted.set(connection, paid - 1)
    else this.#granted.delete(connection)
    this.#recorder.turnEnded(how)
  }

  windowEnded(reason: 'handoff' | 'paused'): void {
    this.#recorder.windowEnded(reason)
  }

  typed(): void {
    this.#recorder.typed()
  }

  /** The bridge asked for the next generation: a tool response (for the calls' speaker) or a notice (for no one). */
  asked(by: Attribution | null): void {
    this.#recorder.asked(by)
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
   * The bound stopped the session: the API is told, so the exchange ends there too, whether or not anything was
   * recorded (a receipt is recorded only while the principal holds the floor).
   */
  stopped(): void {
    void this.#ledger.stop().then((ended) => {
      if (!ended) this.#deps.log('qualification.stop_unconfirmed', { exchangeId: this.#deps.exchangeId })
    })
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

  #local(connection: number): number {
    return this.#links.get(connection)?.local ?? 0
  }

  #durable(connection: number): number {
    return this.#links.get(connection)?.durable ?? 0
  }

  /**
   * Reserve a generation on the API at its worst case: the context again, its output twice (audio and text), and what
   * was sent and transcribed since the last charge.
   */
  async #charge(connection: number, unasked: boolean): Promise<GuardStop | null> {
    const durable = this.#durable(connection)
    const worst = ASSUMED_RATES.context + 2 * this.#deps.grant.maxOutputTokensPerTurn + this.#sinceCharge
    this.#sinceCharge = 0
    const answer = await this.#ledger.generation(durable, Math.min(MAX_CHARGE, Math.ceil(worst)), unasked)
    if (!answer.ok) return this.#refused(answer)
    return this.#stopped
  }

  /**
   * The reservation input asked for, stored as the one it waits for: only its own grant lets input flow (a tool
   * response's, a notice's or a typed message's never touches it).
   */
  #reserveInput(connection: number): void {
    const pending = this.#charge(connection, false).then((refused) => {
      this.#pending.delete(connection)
      if (!refused) this.#grant(connection)
      return refused
    })
    this.#pending.set(connection, pending)
  }

  #grant(connection: number): void {
    this.#granted.set(connection, (this.#granted.get(connection) ?? 0) + 1)
  }

  /** A generation started that nobody reserved: it is spent, so it is charged; a refusal stops the session. */
  #unasked(connection: number): void {
    this.#grant(connection)
    void this.#charge(connection, true).then((stop) => {
      if (stop) this.#deps.stop(stop)
    })
  }

  #refused(answer: LedgerAnswer): GuardStop | null {
    this.#halt(answer.ok ? 'unconfirmed' : answer.stop)
    return this.#stopped
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
