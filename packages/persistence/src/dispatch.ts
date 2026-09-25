// Worker-side runtime dispatch (db/migrations/0012, sophia_worker login). A claim is scheduling ownership,
// not an effect; sophia.dispatch_runtime_outbox rechecks authority under the locks and either queues exactly
// one runtime command (recording the outbox result in the same transaction) or records why it may not run.
import type pg from 'pg'
import { classifyDbError } from './errors.ts'
import type { OutboxRow } from './outbox.ts'
import { onlyRow } from './rows.ts'

export type DispatchOutcome =
  | { result: 'enqueued'; runtimeId: string; seq: number; runtimeCommandId: string }
  | { result: 'denied'; reason: string }
  | { result: 'settled'; reason?: string }
  | { result: 'outcome_unknown'; reason: string }

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (err) {
    throw classifyDbError(err)
  }
}

/** Claim pending native deliveries and empty-control settlements, cleanup (Hold/Stop) first. */
export async function claimRuntimeOutbox(
  pool: pg.Pool,
  worker: string,
  limit = 10,
  leaseSeconds = 60,
): Promise<OutboxRow[]> {
  const { rows } = await wrap(
    pool.query<OutboxRow>(`SELECT * FROM sophia.claim_runtime_outbox($1, $2, $3)`, [worker, limit, leaseSeconds]),
  )
  return rows
}

/** Dispatch one claimed row under its lease. A lost lease raises invalid_state: reconcile, never resend. */
export async function dispatchRuntimeOutbox(
  pool: pg.Pool,
  projectId: string,
  outboxId: string,
  leaseToken: string,
): Promise<DispatchOutcome> {
  const { rows } = await wrap(
    pool.query<{ outcome: DispatchOutcome }>(`SELECT sophia.dispatch_runtime_outbox($1, $2, $3) AS outcome`, [
      projectId,
      outboxId,
      leaseToken,
    ]),
  )
  return onlyRow(rows, 'dispatch_runtime_outbox').outcome
}

/** Settle native rows left `outcome_unknown` by an expired lease, from what the database recorded. */
export async function reconcileRuntimeOutbox(pool: pg.Pool, limit = 50): Promise<number> {
  const { rows } = await wrap(pool.query<{ n: number }>(`SELECT sophia.reconcile_runtime_outbox($1) AS n`, [limit]))
  return onlyRow(rows, 'reconcile_runtime_outbox').n
}
