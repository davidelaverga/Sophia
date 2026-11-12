// Who answers a person in their personal space (contract amendment A10). One answer per pending turn, after the turn
// commits: the context is read under the person (their turns and notes, nothing else), the companion answers, and the
// reply (or the failure) is written under the person. The companion never sees another person's space or a project.
//
// Two kinds exist: a keyless rehearsal for development and tests (companion-rehearsal.ts: scripted, never live
// evidence), and later the runtime's Companion agent (goal D1), another implementation of the same interface. Where
// none is configured, the API refuses to keep a message nobody would answer.
//
// INC03-CC-003 A2 (docs/plans/personal-answers.md): the runner also resumes a person's waiting turns (resume), once when
// the API is ready for the live companion's owner and after a Personal write commits, through the same claims. An
// automatic turn (an automatic_v1 input, 0098) is answered only by the live companion, whose reservation passes 0102's
// guard; the rehearsal never answers one.
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type pg from 'pg'
import type { PersonalReceipt } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  beginCompanionCall,
  beginPersonalGreeting,
  claimPersonalReply,
  endCompanionCall,
  erasedCompanionCalls,
  failPersonalReply,
  fencePersonalWrite,
  forgetErasedCompanionCalls,
  nextPersonalReply,
  personalAnswerGuardInstalled,
  readCompanionContext,
  readPersonalAnswerOrigin,
  readPersonalEpoch,
  readWelcomeContext,
  recordPersonalGreeting,
  readPersonalSettledAnswer,
  recordPersonalReply,
  recordPersonalSettledReply,
  releasePersonalGreeting,
  renewPersonalGreeting,
  renewPersonalReply,
  withActor,
  type CompanionContext,
  type PersonalAnswerProfile,
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
/** The registered call an answer runs in (begin_companion_call): whose space, and the call's own id. */
export interface CompanionCall {
  readonly actorId: string
  readonly callId: string
  /** The turn the call answers, under the claim it was made for: its settled answer is kept for it (0078). */
  readonly turnId?: string
  readonly claim?: string
}

export interface Companion {
  readonly mode: 'rehearsal' | 'live'
  /** The one person it answers live (#435 4304103151); none for a companion that serves anyone (the rehearsal). */
  readonly owner?: string
  /** `call` names the registered call this answer runs in; a live companion reserves and settles its cost under it. */
  answer(context: CompanionContext, signal: AbortSignal, call?: CompanionCall): Promise<CompanionReply>
  /** Sophia's welcome back after a quiet spell, from the conversation so far; `name` is who she greets. */
  greet(context: Omit<CompanionContext, 'asked'>, name: string | null, signal: AbortSignal): Promise<string>
  /** Whether what it needs outside this process is in place (/ready); none means nothing is needed. */
  ready?(): Promise<boolean>
  /**
   * The trusted answer profile (A1) its live settings make now, or null when 0101 would not accept it; none for a
   * companion that never pays for an answer (the rehearsal). The Answer operation decides under it (A53).
   */
  answerProfile?(): PersonalAnswerProfile | null
}

/** A turn of an automatic_v1 input asked of a companion that is not live: it is never answered without the guard. */
export class AutomaticNotLive extends Error {
  readonly code = 'automatic_not_live'
  constructor() {
    super('An automatic Personal answer needs the live companion')
    this.name = 'AutomaticNotLive'
  }
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

/** How often a write of what the companion gave is tried, and how long apart, while the database is away. */
const TRIES = 3
const AGAIN_MS = 300

/** `work`, tried again while the database is away (unavailable); a refusal is said as itself at once. */
async function again<T>(work: () => Promise<T>, tries = TRIES): Promise<T> {
  for (let tried = 1; ; tried += 1) {
    try {
      return await work()
    } catch (err: unknown) {
      const away = !(err instanceof DomainError) || err.code === 'unavailable'
      if (!away || tried >= tries) throw err
      await delay(AGAIN_MS * tried)
    }
  }
}

/** A welcome not written: a definitive refusal said as itself; anything else may be asked again under the same key. */
const unwritten = (err: unknown): DomainError =>
  err instanceof DomainError && (err.code === 'outcome_unknown' || err.retry === 'never')
    ? err
    : new DomainError('outcome_unknown', NO_WELCOME, { cause: err })

/** One call to the companion in this process, begun in an epoch of the space: it can be told to stop, and waited for. */
interface Call {
  id: string
  epoch: number
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
  /** Every accepted answer's whole run (claim, call, cost, kept answer, reply, the next turn), until it ends. */
  private readonly running = new Set<Promise<void>>()
  /** Shutting down: no answer is started any more, nor the next turn chained (finding 4321054353). */
  private closing = false
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

  /**
   * Tell this process's calls for `actorId` begun before `epoch` (an erasure's) to stop, and wait until they have (their
   * claims are let go too). Calls of the conversation after it go on.
   */
  async stopFor(actorId: string, epoch: number): Promise<void> {
    const mine = [...(this.calls.get(actorId) ?? [])].filter((call) => call.epoch < epoch)
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
    body: (stop: AbortSignal, callId: string) => Promise<T>,
  ): Promise<T> {
    const id = randomUUID()
    const epoch = await withActor(this.pool, actorId, 'write', (c) => beginCompanionCall(c, id))
    const call: Call = { id, epoch, stop: new AbortController(), settled: Promise.withResolvers<void>() }
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
      return await body(call.stop.signal, call.id)
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

  /** Whether it answers this person's turns live: the payer's one enrolled owner, or anyone for the rehearsal. */
  serves(actorId: string): boolean {
    return this.companion.owner === undefined || this.companion.owner === actorId.toLowerCase()
  }

  /** The one owner a live companion answers, or null (the rehearsal serves anyone, and is never resumed at start). */
  get liveOwner(): string | null {
    return this.companion.mode === 'live' ? (this.companion.owner ?? null) : null
  }

  /** The trusted answer profile the live settings make now, or null (none, or one 0101 would not accept). */
  answerProfile(): PersonalAnswerProfile | null {
    return this.companion.answerProfile?.() ?? null
  }

  /**
   * Resume `actorId`'s conversation: its oldest turn waiting for an answer (next_personal_reply), answered as answer()
   * answers it, so through the same claim, in-flight set, chaining and shutdown; or nothing. Only for whom it serves, and
   * never once shutting down. No timer, loop or claim reset: a turn waiting longer than its two minutes stays failed
   * until the person asks again. Resolves when that run ends; it never rejects (a failure is reported by onError).
   */
  resume(actorId: string): Promise<void> {
    if (this.closing || !this.serves(actorId)) return Promise.resolve()
    const run = (async () => {
      const next = await withActor(this.pool, actorId, 'read', (c) => nextPersonalReply(c))
      // The answer's own failure is reported by its own handler (answer), once.
      if (next) await this.answer(actorId, next).catch(() => undefined)
    })()
    this.running.add(run)
    return run.then(
      () => {
        this.running.delete(run)
      },
      (err: unknown) => {
        this.running.delete(run)
        this.onError(err)
      },
    )
  }

  /**
   * Start answering `turnId` for `actorId`; resolves when the reply or the failure is written. Once shutting down,
   * nothing is started: the turn stays pending, as it is, for the next process.
   */
  answer(actorId: string, turnId: string): Promise<void> {
    if (this.closing || this.inFlight.has(turnId)) return Promise.resolve()
    this.inFlight.add(turnId)
    const run = this.run(actorId, turnId).finally(() => this.inFlight.delete(turnId))
    this.running.add(run)
    // Both outcomes handled on the run itself (R2-C64 P2): no derived promise is left to reject unhandled. An
    // unexpected failure of the whole run is reported (its words kept out, as every companion failure), never retried.
    run.then(
      () => this.running.delete(run),
      (err: unknown) => {
        this.running.delete(run)
        this.onError(err)
      },
    )
    return run
  }

  /**
   * Shut down (finding 4321054353): start no answer and chain no next turn, then wait for every accepted run to end,
   * while the pool and the model are still open. Its end is observed, not its success: a run may end with its cost held
   * unknown, its answer kept but its reply unwritten, or failed (reported by onError). The wait has no deadline of its
   * own: ANSWER_LIMIT_MS only signals the call to stop (cooperative), and a write retries a few times, so a call or
   * query that never settles keeps shutdown waiting with its resources open, until the platform ends the process.
   */
  async close(): Promise<void> {
    this.closing = true
    while (this.running.size > 0) await Promise.allSettled(this.running)
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
    let text: string
    try {
      text = await this.welcome(attempt)
    } catch (err: unknown) {
      // Whatever failed before the welcome was in hand (a read, the companion), the claim goes, so the same request
      // may ask again at once; a later attempt's claim stays (the release is fenced to this one).
      await withActor(this.pool, actorId, 'write', (c) => releasePersonalGreeting(c, attempt.claim)).catch(
        () => undefined,
      )
      throw unwritten(err)
    }
    // The welcome is in hand: its write is tried again while the database is away for a moment. Should every try
    // fail, the claim stays (it lapses in two minutes), so no attempt asks the companion again meanwhile.
    return again(() => this.settle(attempt, text)).catch((err: unknown) => {
      throw unwritten(err)
    })
  }

  /** The welcome's words under the attempt's claim, from what it is written from ('' when none is due any more). */
  private async welcome(attempt: Attempt): Promise<string> {
    const { actorId, claim, name } = attempt
    return this.withCall(
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

  /**
   * The person's conversation from `turnId` on, one turn at a time: that turn if it is the next to answer, then the next
   * waiting, while no other process is answering one (next_personal_reply).
   */
  private async run(actorId: string, turnId: string): Promise<void> {
    // A deferred turn (A2-F02) stays the person's next turn: this run ends here, so it is not selected again now, nor
    // its own run awaited; a later wake (a restart, a committed send or retry) asks again.
    if ((await this.answerOne(actorId, turnId)) === 'deferred') return
    const next = await withActor(this.pool, actorId, 'read', (c) => nextPersonalReply(c)).catch((err: unknown) => {
      this.onError(err)
      return null
    })
    // The next turn's run is its own: its failure is reported by its own handler (answer), once.
    if (next) await this.answer(actorId, next).catch(() => undefined)
  }

  /**
   * Whether a live companion may take `turnId` now (A2-F02, A2-F03), decided before any claim. First the owner's kept
   * answer: one already paid for and kept (0078) is written with no new effect, so it needs none of the fresh-effect
   * prerequisites below, nor may their failure hold it back. Without one, a legacy turn may go ahead, as before; an
   * automatic turn (an automatic_v1 input, 0098) needs what a new paid answer needs: 0102's guard installed and the
   * companion ready (0078, and its payer still admitted for the owner). Otherwise it is deferred: nothing is claimed,
   * failed, reserved, prepared or decided, its asked_at and frozen admission are untouched, and its two-minute wait
   * runs on as for any pending turn. A read that fails, the kept ledger's included, is reported and defers; nothing is
   * read as kept or as legacy for it. A companion that is not live keeps its own refusal (ask).
   */
  private async eligible(actorId: string, turnId: string): Promise<boolean> {
    if (this.companion.mode !== 'live') return true
    try {
      const kept = await withActor(this.pool, actorId, 'read', (c) => readPersonalSettledAnswer(c, turnId))
      if (kept !== null) return true
      const origin = await withActor(this.pool, actorId, 'read', (c) => readPersonalAnswerOrigin(c, turnId))
      if (origin === 'legacy') return true
      return (await personalAnswerGuardInstalled(this.pool)) && (await (this.companion.ready?.() ?? true))
    } catch (err: unknown) {
      this.onError(err)
      return false
    }
  }

  private async answerOne(actorId: string, turnId: string): Promise<'deferred' | 'done'> {
    if (!(await this.eligible(actorId, turnId))) return 'deferred'
    // One process asks the companion for a turn, under its claim: another one answering it (a retry that reached it)
    // leaves it, and an attempt whose claim lapsed (it stalled past it) writes neither its reply nor its failure.
    const claim = await withActor(this.pool, actorId, 'write', (c) => claimPersonalReply(c, turnId)).catch(
      (err: unknown) => {
        this.onError(err)
        return null
      },
    )
    if (!claim) return 'done'
    // An answer already paid for and kept with its cost (0078), its reply not written yet (by this process or another,
    // before a restart): written now, the companion not asked again. If even the read fails, nothing is asked.
    // Only a live companion keeps answers with their cost (0078); a rehearsal asks no one and needs no 0078.
    const live = this.companion.mode === 'live'
    let kept: { text: string; suggestion: string | null } | null = null
    try {
      if (live) kept = await withActor(this.pool, actorId, 'read', (c) => readPersonalSettledAnswer(c, turnId))
    } catch (err: unknown) {
      this.onError(err)
      return 'done'
    }
    const reply = kept ?? (await this.ask(actorId, turnId, claim))
    if (!reply) return 'done'
    const { text, suggestion } = reply
    // The companion answered: its words are written, tried again while the database is away for a moment, from the
    // answer kept with its cost when there is one (else as given, a rehearsal's). The turn is never marked failed for
    // that, nor the companion asked again; should every try fail, the claim lapses, and asked again the kept answer is
    // written then.
    await again(() =>
      withActor(this.pool, actorId, 'write', async (c) => {
        if (!live || !(await recordPersonalSettledReply(c, turnId, claim)))
          await recordPersonalReply(c, turnId, claim, text, suggestion)
      }),
    ).catch((err: unknown) => {
      this.onError(err)
    })
    return 'done'
  }

  /** The companion asked for the turn under its claim; null when nothing is to be written (failed, or not due). */
  private async ask(actorId: string, turnId: string, claim: string): Promise<CompanionReply | null> {
    try {
      return await this.withCall(
        actorId,
        (c) => renewPersonalReply(c, turnId, claim),
        async (stop, callId) => {
          // Only the live companion answers an automatic turn, through 0102's guard: its origin is read first, and a
          // read that fails fails the turn, never reads as legacy.
          if (
            this.companion.mode !== 'live' &&
            (await withActor(this.pool, actorId, 'read', (c) => readPersonalAnswerOrigin(c, turnId))) !== 'legacy'
          )
            throw new AutomaticNotLive()
          // Its lease is renewed as the context goes to the companion: no other attempt takes the turn meanwhile.
          const context = await withActor(this.pool, actorId, 'write', (c) => readCompanionContext(c, turnId, claim))
          return context
            ? withinLimit(
                (signal) => this.companion.answer(context, signal, { actorId, callId, turnId, claim }),
                this.limitMs,
                stop,
              )
            : null
        },
      )
    } catch (err: unknown) {
      this.onError(err)
      // The companion couldn't answer: the turn says it failed; if even that write fails, it stays pending and the
      // person's client says so in time.
      await withActor(this.pool, actorId, 'write', (c) => failPersonalReply(c, turnId, claim)).catch(() => undefined)
      return null
    }
  }
}

/**
 * After an erasure: the person's calls to the companion in this process are told to stop and waited for, and those of
 * every other process (each stops its own once its claim is gone, within WATCH_MS): this waits until none begun before
 * the erasure is in flight anywhere, within `ms`, so the erasure is acknowledged only once nothing of the space is being
 * answered; then they are all forgotten. One still running then (a companion that won't stop) leaves it unfinished, to
 * be asked again; one a process that went away left counts no longer after two minutes.
 */
export async function stoppedEverywhere(
  pool: pg.Pool,
  actorId: string,
  runner: CompanionRunner | null,
  ms = STOPPING_MS,
): Promise<void> {
  const end = Date.now() + ms
  const epoch = await withActor(pool, actorId, 'read', (c) => readPersonalEpoch(c))
  await Promise.race([runner?.stopFor(actorId, epoch), delay(ms, undefined, { ref: false })])
  const running = () => withActor(pool, actorId, 'read', (c) => erasedCompanionCalls(c))
  let left = await running()
  while (left > 0 && Date.now() <= end) {
    await delay(100)
    left = await running()
  }
  // Not done while one runs on (the same request asks again, and waits again); forgotten once none counts.
  if (left > 0) throw new Error('A call to the companion from before the erasure is still running')
  await withActor(pool, actorId, 'write', (c) => forgetErasedCompanionCalls(c))
}
