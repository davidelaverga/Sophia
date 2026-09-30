// Who answers a person in their personal space (contract amendment A10). One answer per pending turn, after the turn
// commits: the context is read under the person (their turns and notes, nothing else), the companion answers, and the
// reply (or the failure) is written under the person. The companion never sees another person's space or a project.
//
// Two kinds exist: a keyless rehearsal for development and tests (companion-rehearsal.ts: scripted, never live
// evidence), and later the runtime's Companion agent (goal D1), another implementation of the same interface. Where
// none is configured, the API refuses to keep a message nobody would answer.
import type pg from 'pg'
import {
  failPersonalReply,
  readCompanionContext,
  recordPersonalReply,
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
}

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

  private async run(actorId: string, turnId: string): Promise<void> {
    try {
      const context = await withActor(this.pool, actorId, 'read', (c) => readCompanionContext(c, turnId))
      if (!context) return
      const reply = await withinLimit(this.companion.answer(context), this.limitMs)
      await withActor(this.pool, actorId, 'write', (c) => recordPersonalReply(c, turnId, reply.text, reply.suggestion))
    } catch (err: unknown) {
      this.onError(err)
      // The turn says it failed; if even that write fails, it stays pending and the person's client says so in time.
      await withActor(this.pool, actorId, 'write', (c) => failPersonalReply(c, turnId)).catch(() => undefined)
    }
  }
}
