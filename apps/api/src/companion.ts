// Who answers a person in their personal space (contract amendment A10). One answer per pending turn, after the turn
// commits: the context is read under the person (their turns and notes, nothing else), the companion answers, and the
// reply (or the failure) is written under the person. The companion never sees another person's space or a project.
//
// Two kinds exist: a keyless rehearsal for development and tests (companion-rehearsal.ts: scripted, never live
// evidence), and later the runtime's Companion agent (goal D1), another implementation of the same interface. Where
// none is configured, the API refuses to keep a message nobody would answer.
import type pg from 'pg'
import type { PersonalReceipt } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  beginPersonalGreeting,
  claimPersonalReply,
  failPersonalReply,
  fencePersonalWrite,
  readCompanionContext,
  readWelcomeContext,
  recordPersonalGreeting,
  recordPersonalReply,
  releasePersonalGreeting,
  withActor,
  type CompanionContext,
} from '@sophia/persistence'

export interface CompanionReply {
  text: string
  /** A short note Sophia suggests the person keep (at most 90 characters), or null. Never kept without them. */
  suggestion: string | null
}

/**
 * Each call is given a signal that aborts once its time is up: it must stop then (and settle), so nothing is asked
 * again while it still runs.
 */
export interface Companion {
  readonly mode: 'rehearsal' | 'live'
  answer(context: CompanionContext, signal: AbortSignal): Promise<CompanionReply>
  /** Sophia's welcome back after a quiet spell, from the conversation so far; `name` is who she greets. */
  greet(context: Omit<CompanionContext, 'asked'>, name: string | null, signal: AbortSignal): Promise<string>
}

/**
 * What may be logged of a companion's failure: its name and code. Its message and stack may carry a person's words
 * (a provider echoing the prompt), so they never reach a log.
 */
export function companionFailure(err: unknown): { name: string; code: string | null } {
  if (!(err instanceof Error)) return { name: typeof err, code: null }
  const code: unknown = Reflect.get(err, 'code')
  return { name: err.name, code: typeof code === 'string' || typeof code === 'number' ? String(code) : null }
}

/** A welcome that couldn't be written: said in the Studio's words, with nothing of the companion's error in it. */
const NO_WELCOME = 'Sophia couldn’t answer just now.'

/** A welcome an earlier attempt of the same request is still writing. */
const WELCOME_WRITING = 'Sophia is still writing her welcome.'

/** One welcome request's attempt: who, under which key and epoch, holding which claim, greeting whom. */
interface Attempt {
  actorId: string
  key: string
  epoch: number
  claim: string
  name: string | null
}

/** How long one answer may take before the turn says it failed (the person can ask again). */
export const ANSWER_LIMIT_MS = 60_000

/**
 * The companion's work, given `ms`: past it, the work is told to stop (its signal aborts) and is waited for, so a turn
 * fails, or a welcome lets its claim go, only once nothing runs. Work told to stop fails as late, whatever it returns.
 */
async function withinLimit<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), ms)
  try {
    const done = await work(stop.signal)
    if (stop.signal.aborted) throw new Error('The companion did not answer in time')
    return done
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Answers turns in this process, one at a time per turn: a turn already being answered is not asked twice (a retry or
 * a second read while the first answer runs). An answer that fails or runs out of time marks the turn failed.
 */
export class CompanionRunner {
  private readonly inFlight = new Set<string>()
  private readonly pool: pg.Pool
  private readonly companion: Companion
  private readonly onError: (err: unknown) => void
  private readonly limitMs: number

  // Node runs this file with its types stripped, so no parameter properties.
  constructor(pool: pg.Pool, companion: Companion, onError: (err: unknown) => void, limitMs = ANSWER_LIMIT_MS) {
    this.pool = pool
    this.companion = companion
    this.onError = onError
    this.limitMs = limitMs
  }

  get mode(): Companion['mode'] {
    return this.companion.mode
  }

  /** Start answering `turnId` for `actorId`; resolves when the reply or the failure is written. */
  answer(actorId: string, turnId: string): Promise<void> {
    if (this.inFlight.has(turnId)) return Promise.resolve()
    this.inFlight.add(turnId)
    return this.run(actorId, turnId).finally(() => this.inFlight.delete(turnId))
  }

  /**
   * Welcome the person back under the request's key, if a welcome is due and this attempt holds its claim (the
   * database decides, and decides again when writing it): the companion is asked only then, by one process. A welcome
   * not written yet, because the companion failed (its claim goes) or an earlier attempt of the same request is still
   * writing it, is outcome_unknown: the client asks again under the same key.
   */
  async greet(actorId: string, key: string, epoch: number, name: string | null): Promise<PersonalReceipt> {
    const begun = await withActor(this.pool, actorId, 'write', async (c) => {
      await fencePersonalWrite(c, epoch)
      return beginPersonalGreeting(c, key, name)
    })
    if (begun === 'writing') throw new DomainError('outcome_unknown', WELCOME_WRITING)
    if (!('claim' in begun)) return begun
    const attempt = { actorId, key, epoch, claim: begun.claim, name }
    try {
      return await this.welcome(attempt)
    } catch (err: unknown) {
      // Whatever failed after the claim (a read, the companion, the write), the claim goes, so the same request may
      // ask again at once; a later attempt's claim stays (the release is fenced to this one). A definitive refusal
      // (the space erased meanwhile) is said as itself; anything else may be asked again under the same key.
      await withActor(this.pool, actorId, 'write', (c) => releasePersonalGreeting(c, attempt.claim)).catch(
        () => undefined,
      )
      if (err instanceof DomainError && (err.code === 'outcome_unknown' || err.retry === 'never')) throw err
      throw new DomainError('outcome_unknown', NO_WELCOME, { cause: err })
    }
  }

  /** The welcome under the attempt's claim: what it is written from, the companion's words, then the write. */
  private async welcome(attempt: Attempt): Promise<PersonalReceipt> {
    const context = await withActor(this.pool, attempt.actorId, 'read', (c) => readWelcomeContext(c))
    // No longer due (a turn came meanwhile): nothing is written, and the key keeps that answer.
    if (!context) return this.settle(attempt, '')
    let text: string
    try {
      text = await withinLimit((signal) => this.companion.greet(context, attempt.name, signal), this.limitMs)
    } catch (err: unknown) {
      this.onError(err)
      throw new DomainError('outcome_unknown', NO_WELCOME) // no cause: the error handler logs nothing of the companion's
    }
    return this.settle(attempt, text)
  }

  /**
   * The welcome (or nothing) under the attempt's claim, fenced to the epoch the request was made against: an erasure
   * since then refuses it (request_erased), and nothing is kept under the key. A later attempt of the request that took
   * the claim over settles it.
   */
  private async settle(attempt: Attempt, text: string): Promise<PersonalReceipt> {
    const { actorId, key, epoch, claim, name } = attempt
    const recorded = await withActor(this.pool, actorId, 'write', async (c) => {
      await fencePersonalWrite(c, epoch)
      return recordPersonalGreeting(c, key, claim, name, text)
    })
    if (recorded === 'writing') throw new DomainError('outcome_unknown', WELCOME_WRITING)
    return recorded
  }

  private async run(actorId: string, turnId: string): Promise<void> {
    // One process asks the companion for a turn, under its claim: another one answering it (a retry that reached it)
    // leaves it, and an attempt whose claim lapsed (it stalled past it) writes neither its reply nor its failure.
    const claim = await withActor(this.pool, actorId, 'write', (c) => claimPersonalReply(c, turnId)).catch(
      (err: unknown) => {
        this.onError(err)
        return null
      },
    )
    if (!claim) return
    try {
      const context = await withActor(this.pool, actorId, 'read', (c) => readCompanionContext(c, turnId, claim))
      if (!context) return
      const reply = await withinLimit((signal) => this.companion.answer(context, signal), this.limitMs)
      await withActor(this.pool, actorId, 'write', (c) =>
        recordPersonalReply(c, turnId, claim, reply.text, reply.suggestion),
      )
    } catch (err: unknown) {
      this.onError(err)
      // The turn says it failed; if even that write fails, it stays pending and the person's client says so in time.
      await withActor(this.pool, actorId, 'write', (c) => failPersonalReply(c, turnId, claim)).catch(() => undefined)
    }
  }
}
