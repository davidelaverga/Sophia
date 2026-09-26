// The runtime dispatcher (S1-05A, db/migrations/0012): moves admitted native deliveries from the outbox into the
// bound runtime's command queue. It is a transport step, not a second reasoning loop: it never builds prompts,
// chooses work or retries an effect it cannot prove absent. Each pass
//   1. marks expired dispatch leases outcome_unknown (never pending again by themselves),
//   2. reconciles those rows from what the database recorded (queued → keep the result; never queued → pending),
//   3. claims pending native rows, Hold/Stop first, and dispatches each under its lease: the database rechecks
//      authority and either queues one runtime command or records an explicit denial.
import type pg from 'pg'
import {
  claimRuntimeOutbox,
  dispatchRuntimeOutbox,
  expireDispatchLeases,
  ProjectEventListener,
  reconcileRuntimeOutbox,
  type DispatchOutcome,
} from '@sophia/persistence'

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
}

/** A dispatch outcome as one log line: the result, and the runtime command or the reason. */
const describe = (o: DispatchOutcome): string =>
  o.result === 'enqueued'
    ? `enqueued as runtime command ${o.runtimeCommandId} (seq ${o.seq})`
    : `${o.result}: ${o.reason ?? ''}`

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
    await this.listener.listening
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
    this.wake?.()
    await this.loop
    await this.listener.stop()
  }
}
