// Who answers a person in their personal space (contract amendment A10). One answer per pending turn, after the turn
// commits: the context is read under the person (their turns and notes, nothing else), the companion answers, and the
// reply (or the failure) is written under the person. The companion never sees another person's space or a project.
//
// Two kinds exist: a keyless rehearsal for development and tests (companion-rehearsal.ts: scripted, never live
// evidence), and later the runtime's Companion agent (goal D1), another implementation of the same interface. Where
// none is configured, the API refuses to keep a message nobody would answer.
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type pg from 'pg'
import type { PersonalReceipt } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  beginCompanionCall,
  beginPersonalGreeting,
  claimPersonalReply,
  companionCallsRunning,
  endCompanionCall,
  failPersonalReply,
  fencePersonalWrite,
  readCompanionContext,
  readWelcomeContext,
  recordPersonalGreeting,
  recordPersonalReply,
  releasePersonalGreeting,
  renewPersonalGreeting,
  renewPersonalReply,
  withActor,
  type CompanionContext,
} from '@sophia/persistence'

export interface CompanionReply {
  text: string
  /** A short note Sophia suggests the person keep (at most 90 characters), or null. Never kept without them. */
  suggestion: string | null
}

/**
 * Each call is given a signal that aborts once its time is up, or once the space is erased: it must stop then (and
 * settle), so nothing is asked again, and no erasure is acknowledged, while it still runs.
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

/** How often a call to the companion renews its claim: one an erasure took is told to stop within this. */
export const WATCH_MS = 2000

/** How long an erasure waits for the person's calls to the companion, wherever they run, to stop. */
const STOPPING_MS = ANSWER_LIMIT_MS + 5000

/**
 * The companion's work, given `ms`, or until `stop` (an erasure): then it is told to stop (its signal aborts) and is
 * waited for, so a turn fails, or a welcome lets its claim go, only once nothing runs. Work told to stop fails, whatever
 * it returns.
 */
async function withinLimit<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, stop: AbortSignal): Promise<T> {
  const late = new AbortController()
  const timer = setTimeout(() => late.abort(), ms)
  const signal = AbortSignal.any([late.signal, stop])
  try {
    const done = await work(signal)
    if (signal.aborted) throw new Error('The companion was told to stop')
    return done
  } finally {
    clearTimeout(timer)
  }
}

/** One call to the companion in this process: it can be told to stop, and waited for. */
interface Call {
  id: string
  stop: AbortController
  settled: PromiseWithResolvers<void>
}

/**
 * Answers turns in this process, one at a time per turn: a turn already being answered is not asked twice (a retry or
 * a second read while the first answer runs). An answer that fails or runs out of time marks the turn failed.
 */
export class CompanionRunner {
  private readonly inFlight = new Set<string>()
  private readonly calls = new Map<string, Set<Call>>()
  private readonly pool: pg.Pool
  private readonly companion: Companion
  private readonly onError: (err: unknown) => void
  private readonly limitMs: number
  private readonly watchMs: number

  // Node runs this file with its types stripped, so no parameter properties.
  constructor(
    pool: pg.Pool,
    companion: Companion,
    onError: (err: unknown) => void,
    limitMs = ANSWER_LIMIT_MS,
    watchMs = WATCH_MS,
  ) {
    this.pool = pool
    this.companion = companion
    this.onError = onError
    this.limitMs = limitMs
    this.watchMs = watchMs
  }

  /** Tell this process's calls for `actorId` to stop, and wait until they have (their claims are let go too). */
  async stopFor(actorId: string): Promise<void> {
    const mine = [...(this.calls.get(actorId) ?? [])]
    for (const call of mine) call.stop.abort()
    await Promise.all(mine.map((call) => call.settled.promise))
  }

  /**
   * One call to the companion for `actorId`: known to every process while it runs (begin_companion_call), so an erasure
   * anywhere waits for it; renewing its claim every watchMs (`holds`), and told to stop once it no longer holds it (an
   * erasure took it) or here (stopFor). It is forgotten once it settled.
   */
  private async withCall<T>(
    actorId: string,
    holds: (c: pg.PoolClient) => Promise<boolean>,
    body: (stop: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const call: Call = { id: randomUUID(), stop: new AbortController(), settled: Promise.withResolvers<void>() }
    const mine = this.calls.get(actorId) ?? new Set<Call>()
    mine.add(call)
    this.calls.set(actorId, mine)
    const watch = setInterval(() => {
      void withActor(this.pool, actorId, 'write', holds).then(
        (held) => {
          if (!held) call.stop.abort()
        },
        () => undefined,
      )
    }, this.watchMs)
    try {
      await withActor(this.pool, actorId, 'write', (c) => beginCompanionCall(c, call.id))
      return await body(call.stop.signal)
    } finally {
      clearInterval(watch)
      mine.delete(call)
      if (mine.size === 0) this.calls.delete(actorId)
      await withActor(this.pool, actorId, 'write', (c) => endCompanionCall(c, call.id)).catch(() => undefined)
      call.settled.resolve()
    }
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
    const { actorId, claim, name } = attempt
    const text = await this.withCall(
      actorId,
      (c) => renewPersonalGreeting(c, claim),
      async (stop) => {
        const context = await withActor(this.pool, actorId, 'write', (c) => readWelcomeContext(c, claim))
        // No longer due (a turn came meanwhile), or the claim went to another attempt: nothing is asked here.
        if (!context) return ''
        try {
          return await withinLimit((signal) => this.companion.greet(context, name, signal), this.limitMs, stop)
        } catch (err: unknown) {
          this.onError(err)
          throw new DomainError('outcome_unknown', NO_WELCOME) // no cause: the error handler logs nothing of it
        }
      },
    )
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
      const reply = await this.withCall(
        actorId,
        (c) => renewPersonalReply(c, turnId, claim),
        async (stop) => {
          // Its lease is renewed as the context goes to the companion: no other attempt takes the turn meanwhile.
          const context = await withActor(this.pool, actorId, 'write', (c) => readCompanionContext(c, turnId, claim))
          return context ? withinLimit((signal) => this.companion.answer(context, signal), this.limitMs, stop) : null
        },
      )
      if (!reply) return
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

/**
 * After an erasure: the person's calls to the companion in this process are told to stop and waited for, and those of
 * every other process (each stops its own once its claim is gone, within WATCH_MS): this waits until none is in flight
 * anywhere, within STOPPING_MS (a companion that never stops, a process that went away), so the erasure is acknowledged
 * only once nothing of the space is being answered.
 */
export async function stoppedEverywhere(pool: pg.Pool, actorId: string, runner: CompanionRunner | null): Promise<void> {
  const end = Date.now() + STOPPING_MS
  await Promise.race([runner?.stopFor(actorId), delay(STOPPING_MS, undefined, { ref: false })])
  for (;;) {
    const running = await withActor(pool, actorId, 'read', (c) => companionCallsRunning(c))
    if (running === 0 || Date.now() > end) return
    await delay(100)
  }
}
