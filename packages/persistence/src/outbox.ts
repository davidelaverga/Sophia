// Worker-side outbox access (sophia_worker login). Claiming a row is not proof its effect happened;
// only record_dispatch_result with the live lease token can record an outcome.
import type pg from 'pg'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

export interface OutboxRow {
  project_id: string
  id: string
  command_id: string
  destination: string
  goal_id: string
  state: string
  cleanup: boolean
  lease_owner: string | null
  lease_token: string | null
  attempts: number
}

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (err) {
    throw classifyDbError(err)
  }
}

export async function claimOutbox(pool: pg.Pool, worker: string, limit = 10, leaseSeconds = 60): Promise<OutboxRow[]> {
  const { rows } = await wrap(
    pool.query<OutboxRow>(`SELECT * FROM sophia.claim_outbox($1, $2, $3)`, [worker, limit, leaseSeconds]),
  )
  return rows
}

/** Maintenance: expired `dispatching` leases become `outcome_unknown`, never `pending` again. */
export async function expireDispatchLeases(pool: pg.Pool): Promise<number> {
  const { rows } = await wrap(pool.query<{ n: number }>(`SELECT sophia.expire_dispatch_leases() AS n`))
  return onlyRow(rows, 'expire_dispatch_leases').n
}

/**
 * Record the observed result of a dispatch under the lease that claimed it (db/migrations/0007).
 * Returns the stored state: the result, or `outcome_unknown` if the lease expired meanwhile.
 * A lost lease (other token, already recorded or swept) raises invalid_state: reconcile first.
 */
export async function recordDispatchResult(
  pool: pg.Pool,
  projectId: string,
  outboxId: string,
  leaseToken: string,
  result: 'acknowledged' | 'denied',
): Promise<string> {
  const { rows } = await wrap(
    pool.query<{ state: string }>(`SELECT sophia.record_dispatch_result($1, $2, $3, $4) AS state`, [
      projectId,
      outboxId,
      leaseToken,
      result,
    ]),
  )
  return onlyRow(rows, 'record_dispatch_result').state
}
