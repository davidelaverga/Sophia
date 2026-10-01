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

export interface Companion {
  readonly mode: 'rehearsal' | 'live'
  answer(context: CompanionContext): Promise<CompanionReply>
  /** Sophia's welcome back after a quiet spell, from the conversation so far; `name` is who she greets. */
  greet(context: Omit<CompanionContext, 'asked'>, name: string | null): Promise<string>
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

/** How long one answer may take before the turn says it failed (the person can ask again). */
export const ANSWER_LIMIT_MS = 60_000

function withinLimit<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The companion did not answer in time')), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
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
      return beginPersonalGreeting(c, key)
    })
    if (begun === 'writing') throw new DomainError('outcome_unknown', WELCOME_WRITING)
    if (!('claim' in begun)) return begun
    const { claim } = begun
    const context = await withActor(this.pool, actorId, 'read', (c) => readWelcomeContext(c))
    // No longer due (a turn came meanwhile): nothing is written, and the key keeps that answer.
    if (!context) return this.settle(actorId, key, claim, '')
    let text: string
    try {
      text = await withinLimit(this.companion.greet(context, name), this.limitMs)
    } catch (err: unknown) {
      this.onError(err)
      await withActor(this.pool, actorId, 'write', (c) => releasePersonalGreeting(c, claim)).catch(() => undefined)
      throw new DomainError('outcome_unknown', NO_WELCOME) // no cause: the error handler logs nothing of the companion's
    }
    return this.settle(actorId, key, claim, text)
  }

  /** The welcome (or nothing) under the attempt's claim; a later attempt of the request that took it over settles it. */
  private async settle(actorId: string, key: string, claim: string, text: string): Promise<PersonalReceipt> {
    const recorded = await withActor(this.pool, actorId, 'write', (c) => recordPersonalGreeting(c, key, claim, text))
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
      const context = await withActor(this.pool, actorId, 'read', (c) => readCompanionContext(c, turnId))
      if (!context) return
      const reply = await withinLimit(this.companion.answer(context), this.limitMs)
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
