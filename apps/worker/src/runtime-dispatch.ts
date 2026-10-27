// The runtime dispatcher (S1-05A, db/migrations/0012): moves admitted native deliveries from the outbox into the
// bound runtime's command queue. It is a transport step, not a second reasoning loop: it never builds prompts,
// chooses work or retries an effect it cannot prove absent. Each pass
//   1. marks expired dispatch leases outcome_unknown (never pending again by themselves),
//   2. reconciles those rows from what the database recorded (queued → keep the result; never queued → pending),
//   3. claims pending native rows, Hold/Stop first, and dispatches each under its lease: the database rechecks
//      authority and either queues one runtime command or records an explicit denial.
import type pg from 'pg'
import {
  assembleReply,
  checkedLimits,
  claimRuntimeOutbox,
  dispatchRuntimeOutbox,
  expireDispatchLeases,
  ProjectEventListener,
  reconcileRuntimeOutbox,
  type AssemblyLimits,
  type AssemblyMode,
  type DispatchOutcome,
} from '@sophia/persistence'

/**
 * The assembly bounds the worker records a reply's context under. checkedLimits holds them to its rules: a lease of at
 * least three deadlines and at least what a failed client can hold its locks for (statement + idle-in-transaction). The
 * database's conversation_context_wait (0071) is sized from one reply's uncontended worst case under these: 2 s first
 * pass + 3 claims x 30 s lease + 2 x 7 s re-offers + one 7 s final pass = 113 s <= 120 s. A unit test pins that
 * arithmetic. It is not a latency guarantee: dispatchOnce claims up to 10 rows and assembles them one after another, so
 * a reply behind others can run out of the 120 s and fail, truthfully, with context_unavailable when a pass next
 * processes it.
 */
export const ASSEMBLY_LIMITS: AssemblyLimits = checkedLimits({
  leaseMs: 30_000,
  deadlineMs: 10_000,
  connectMs: 2_000,
  statementTimeoutMs: 5_000,
  lockTimeoutMs: 2_000,
  idleInTransactionMs: 5_000,
  connectionCheckMs: 1_000,
})

/** The reason conversation_dispatch (0071) defers a reply create whose context is not yet recorded. */
export const WAITING_FOR_CONTEXT = 'waiting for reply context'

export interface PassResult {
  expired: number
  reconciled: number
  outcomes: DispatchOutcome[]
  /** Rows whose lease was lost before the dispatch could record (reconciled on a later pass). */
  lost: number
}

export interface DispatcherOptions {
  /** A stable name for this worker process; it appears on every lease it takes. */
  workerId: string
  batchSize?: number
  leaseSeconds?: number
  log?: (line: string) => void
  /**
   * A login admitted to the conversation assembler role (Q13), or, in the fixed mode, the worker's own login; or absent:
   * then no context is recorded here, and the database ends a waiting reply as context_unavailable within its wait.
   */
  assemblerUrl?: string | null
  /** How that login reads a reply's context (assemblyConfig): the login mode unless the fixed one is chosen. */
  assemblyMode?: AssemblyMode
}

/**
 * The worker's assembly from its environment. SOPHIA_CONVERSATION_ASSEMBLY unset or `login`: the assembler login of
 * SOPHIA_ASSEMBLER_DATABASE_URL, if any (Q13). `fixed` (0084): the worker's own login through the fixed readers, and
 * then an assembler login set as well is refused, never kept beside it or fallen back to. Anything else is refused.
 */
export function assemblyConfig(env: {
  SOPHIA_CONVERSATION_ASSEMBLY?: string
  SOPHIA_ASSEMBLER_DATABASE_URL?: string
  workerUrl: string
}): { assemblerUrl: string | null; assemblyMode: AssemblyMode } {
  const mode = env.SOPHIA_CONVERSATION_ASSEMBLY?.trim() || 'login'
  const assemblerUrl = env.SOPHIA_ASSEMBLER_DATABASE_URL?.trim() || null
  if (mode === 'login') return { assemblerUrl, assemblyMode: 'login' }
  if (mode !== 'fixed') throw new Error(`SOPHIA_CONVERSATION_ASSEMBLY is login or fixed, not ${mode}`)
  if (assemblerUrl)
    throw new Error('the fixed assembly has no assembler login: unset SOPHIA_ASSEMBLER_DATABASE_URL to choose it')
  return { assemblerUrl: env.workerUrl, assemblyMode: 'fixed' }
}

/** A dispatch outcome as one log line: the result, and the runtime command or the reason. */
const describe = (o: DispatchOutcome): string =>
  o.result === 'enqueued'
    ? `enqueued as runtime command ${o.runtimeCommandId} (seq ${o.seq})`
    : `${o.result}: ${o.reason ?? ''}`

/**
 * A reply create committed as waiting for its context: record that context once, now, through the assembler login;
 * the row's next pass dispatches what was recorded. Without a login nothing is recorded here.
 */
async function assembleWaiting(
  replyId: string | null | undefined,
  outcome: DispatchOutcome,
  options: DispatcherOptions,
): Promise<void> {
  if (outcome.result !== 'deferred' || outcome.reason !== WAITING_FOR_CONTEXT || !replyId || !options.assemblerUrl)
    return
  const assembled = await assembleReply(options.assemblerUrl, replyId, ASSEMBLY_LIMITS, options.assemblyMode)
  options.log?.(`assembly for reply ${replyId}: ${assembled.outcome}`)
}

/** One pass. Safe to run concurrently from several workers: claims skip locked rows. */
export async function dispatchOnce(pool: pg.Pool, options: DispatcherOptions): Promise<PassResult> {
  const expired = await expireDispatchLeases(pool)
  const reconciled = await reconcileRuntimeOutbox(pool)
  const claimed = await claimRuntimeOutbox(pool, options.workerId, options.batchSize ?? 10, options.leaseSeconds ?? 30)
  const outcomes: DispatchOutcome[] = []
  let lost = 0
  for (const row of claimed) {
    if (!row.lease_token) continue
    try {
      const outcome = await dispatchRuntimeOutbox(pool, row.project_id, row.id, row.lease_token)
      outcomes.push(outcome)
      options.log?.(`dispatch outbox ${row.id}: ${describe(outcome)}`)
      await assembleWaiting(row.conversation_reply_id, outcome, options)
    } catch (err: unknown) {
      // The lease expired or was swept meanwhile: the row is reconciled from recorded state, never resent here.
      lost += 1
      options.log?.(`dispatch of outbox ${row.id} did not record: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { expired, reconciled, outcomes, lost }
}

/**
 * Run passes until stopped: at once when a project event commits (every admission writes one in the same
 * transaction as its outbox rows), and at least every `idleMs` so expired leases are always swept.
 */
export class RuntimeDispatcher {
  private stopped = false
  private wake: (() => void) | null = null
  private halt: () => void = () => undefined
  /** Resolves on stop(): the first LISTEN can wait forever while the database is down. */
  private readonly halted = new Promise<void>((resolve) => {
    this.halt = resolve
  })
  private readonly listener: ProjectEventListener
  private loop: Promise<void> | null = null
  private readonly pool: pg.Pool
  private readonly options: DispatcherOptions & { idleMs?: number }

  constructor(pool: pg.Pool, options: DispatcherOptions & { idleMs?: number }) {
    this.pool = pool
    this.options = options
    this.listener = new ProjectEventListener(pool, {
      onProject: () => this.wake?.(),
      onReconnect: () => this.wake?.(),
      onError: (err) => options.log?.(`event listener: ${err.message}`),
    })
  }

  start(): void {
    this.loop ??= this.run()
  }

  private async run(): Promise<void> {
    await Promise.race([this.listener.listening, this.halted])
    while (!this.stopped) {
      try {
        const pass = await dispatchOnce(this.pool, this.options)
        if (pass.outcomes.length > 0 || pass.expired > 0 || pass.reconciled > 0) continue
      } catch (err: unknown) {
        this.options.log?.(`dispatch pass failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, this.options.idleMs ?? 2000)
        function done() {
          clearTimeout(timer)
          resolve()
        }
        this.wake = done
      })
      this.wake = null
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.halt()
    this.wake?.()
    // The listener first: it may still be retrying its first LISTEN, and its retries must end for the process to.
    await this.listener.stop()
    await this.loop
  }
}
