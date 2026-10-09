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
//   tool response; a notice; a typed message), charged at its worst case (with the text it sends); one that starts
//   unasked (its output arrives while no generation is paid for, a reservation still in flight included: nothing behind
//   that has reached the provider yet) is charged as its output arrives;
// - input is paid for before it is sent (charge ahead): each connection holds an allowance prepaid on the API, which the
//   generation input asks for fills up to INPUT_SLICE, and a top-up ('spend') refills once the next chunk or frame would
//   pass it. Audio, frames, transcription and Sophia's words are taken from it; audio held meanwhile waits behind the
//   top-up, in order, and a frame is dropped and counted. So the API's committed amount is never less than what was
//   sent: a crash loses only allowance already paid for, never spend nobody paid for.
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
 * What a connection's allowance is filled up to, in tokens: by the generation input asks for, and by each top-up. About
 * 95 s of speech with its transcription (42 tokens a second), so most spoken turns never top up; with a camera on (a
 * frame each second, 258), about 13 s. It is paid before anything is sent, so the API may hold at most this much more
 * than was spent per connection: an exchange ends at most that much earlier, never later.
 */
export const INPUT_SLICE = 4000
/**
 * The transcription a second of the holder's speech is prepaid for, in tokens (30 characters, at 3 a token: about
 * twice a fast speaker). Transcription follows audio already sent, so it is paid with the audio; what the provider
 * transcribes beyond it comes out of the allowance, and a debt is topped up at once.
 */
export const TRANSCRIPT_PER_SECOND = 10

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
  /** Tokens prepaid on the API for this connection's input and not spent yet; below zero, a debt being topped up. */
  paid: number
  /** Of what audio prepaid, what its transcription may still take. */
  credit: number
}

/** A chunk of 16 kHz audio at the assumed rate, with its transcription prepaid. */
const audioCost = (samples: number) => (samples / INPUT_RATE) * (ASSUMED_RATES.audioInPerSecond + TRANSCRIPT_PER_SECOND)

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
   * The reservation in flight on a connection that input waits for: the next generation, asked for by input, or a
   * top-up of the allowance. Only this one, once granted, lets input flow.
   */
  readonly #pending = new Map<number, Promise<GuardStop | null>>()
  /**
   * Generations paid for on a connection that no turn has ended yet: each granted reservation, and each generation
   * charged as it arrived (unasked). Input flows while there is one; output arriving while there is none is a generation
   * nobody reserved. A turn's end takes one.
   */
  readonly #granted = new Map<number, number>()
  #stopped: GuardStop | null = null
  /** Frames dropped because the allowance did not cover them yet: never sent unpaid. */
  #framesDropped = 0

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
    this.#links.set(connection, { local, durable: answer.ordinal, paid: 0, credit: 0 })
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
   * is reserved, and input waits ('hold') until the API granted it (granted()). A chunk the allowance does not cover
   * waits for a top-up the same way. Every chunk sent is counted and paid for. `dropped` is what the chunker dropped
   * before it.
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
    const cost = audioCost(chunk.length)
    if (!this.#covers(connection, cost)) return this.#topUp(connection) ?? 'hold'
    const stop = this.#check(() => this.#reserve.sentAudio(chunk.length))
    if (stop) return stop
    this.#pay(connection, cost, (chunk.length / INPUT_RATE) * TRANSCRIPT_PER_SECOND)
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
    return this.#charge(connection, false, chars / ASSUMED_RATES.charsPerToken).then((refused) => {
      if (!refused) this.#grant(connection)
      return refused
    })
  }

  /**
   * Before a video frame goes to the provider on this connection: paid from the allowance. One it does not cover is
   * dropped and counted ('drop'), never sent unpaid, and a top-up is asked for if none is in flight, so a later frame may
   * go. A frame that comes while a top-up is in flight is never covered (one is asked for only when the allowance cannot
   * pay for what comes next, and nothing is credited before it is granted): it is dropped.
   */
  frame(connection: number): GuardStop | 'drop' | null {
    const due = this.due()
    if (due) return due
    if (!this.#covers(connection, ASSUMED_RATES.perFrame)) {
      const stop = this.#topUp(connection)
      if (stop) return stop
      this.#framesDropped += 1
      this.#deps.log('qualification.frame_dropped', { exchangeId: this.#deps.exchangeId, dropped: this.#framesDropped })
      return 'drop'
    }
    const stop = this.#check(() => this.#reserve.sentFrame())
    if (stop) return stop
    this.#pay(connection, ASSUMED_RATES.perFrame, 0)
    return null
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
    // A reservation still in flight is for what comes next: nothing behind it has reached the provider yet.
    if (!this.#granted.has(connection)) this.#unasked(connection)
    this.#recorder.responded(out.toolCalls ?? 0)
    return out.chars === undefined ? null : this.#owe(connection, out.chars / ASSUMED_RATES.charsPerToken, 0)
  }

  /**
   * The holder's words were transcribed on this connection: billed as text, from what their audio prepaid for it
   * first; the receipt keeps only how many characters.
   */
  heard(connection: number, chars: number, finished: boolean): GuardStop | null {
    const stop = this.#check(() => this.#reserve.transcribed(chars))
    if (stop) return stop
    this.#recorder.heard(chars, finished)
    const tokens = chars / ASSUMED_RATES.charsPerToken
    return this.#owe(connection, tokens, Math.min(tokens, this.#links.get(connection)?.credit ?? 0))
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
   * Reserve a generation on the API at its worst case: the context again and its output twice (audio and text), with
   * `extra` (text it sends, or the allowance input asked for).
   */
  async #charge(connection: number, unasked: boolean, extra = 0): Promise<GuardStop | null> {
    const durable = this.#durable(connection)
    const worst = ASSUMED_RATES.context + 2 * this.#deps.grant.maxOutputTokensPerTurn + extra
    const answer = await this.#ledger.generation(durable, Math.min(MAX_CHARGE, Math.ceil(worst)), unasked)
    if (!answer.ok) return this.#refused(answer)
    return this.#stopped
  }

  /**
   * The reservation input asked for, stored as the one it waits for: only its own grant lets input flow (a tool
   * response's, a notice's or a typed message's never touches it). It also fills the connection's allowance up to
   * INPUT_SLICE, so the turn's input is paid before it is sent.
   */
  #reserveInput(connection: number): void {
    const prepay = this.#shortfall(connection)
    const pending = this.#charge(connection, false, prepay).then((refused) => {
      this.#pending.delete(connection)
      if (refused) return refused
      this.#grant(connection)
      return this.#credited(connection, prepay)
    })
    this.#pending.set(connection, pending)
  }

  /** What fills the connection's allowance up to INPUT_SLICE, a debt included: a whole number of tokens. */
  #shortfall(connection: number): number {
    return Math.max(0, Math.ceil(INPUT_SLICE - (this.#links.get(connection)?.paid ?? 0)))
  }

  /** Whether the allowance prepaid on this connection covers `cost` now. */
  #covers(connection: number, cost: number): boolean {
    return (this.#links.get(connection)?.paid ?? 0) >= cost
  }

  /** Something sent was paid from the allowance; `credit` of it is its transcription's, prepaid. */
  #pay(connection: number, cost: number, credit: number): void {
    const link = this.#links.get(connection)
    if (!link) return
    link.paid -= cost
    link.credit += credit
  }

  /**
   * What the provider billed after the fact (a transcription, Sophia's words): `fromCredit` of it was prepaid with the
   * audio, the rest comes out of the allowance. A debt is topped up at once (and input waits for it).
   */
  #owe(connection: number, tokens: number, fromCredit: number): GuardStop | null {
    const link = this.#links.get(connection)
    if (!link) return null
    link.credit -= fromCredit
    link.paid -= tokens - fromCredit
    return link.paid < 0 ? this.#topUp(connection) : null
  }

  /**
   * Refill the connection's allowance on the API ('spend': a charge only, no turn) before anything more is sent, unless a
   * reservation input waits for is in flight already. Input waits for it, frames are dropped meanwhile; a refusal stops
   * the session, whoever was waiting. Returns why the session stops now (the deadline), or null.
   */
  #topUp(connection: number): GuardStop | null {
    const due = this.due()
    if (due) return due
    if (this.#pending.has(connection)) return null
    const charge = this.#shortfall(connection)
    const pending = this.#ledger.spend(this.#durable(connection), Math.min(MAX_CHARGE, charge)).then((answer) => {
      this.#pending.delete(connection)
      const stop = answer.ok ? this.#credited(connection, charge) : this.#refused(answer)
      if (stop) this.#deps.stop(stop)
      return stop
    })
    this.#pending.set(connection, pending)
    return null
  }

  /** A grant prepaid `amount` for the connection's input: credited, and a debt still left is topped up again. */
  #credited(connection: number, amount: number): GuardStop | null {
    if (this.#stopped) return this.#stopped
    const link = this.#links.get(connection)
    if (!link) return null
    link.paid += amount
    return link.paid < 0 ? this.#topUp(connection) : null
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
