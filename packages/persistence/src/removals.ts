// Durable room removals (db/migrations/0014, contract amendment A07). A declined or blocked guest who was let in
// leaves the call by an obligation that settles only on evidence from the LiveKit server. The worker claims and
// settles under a short lease (sophia_worker login); the API makes one immediate attempt after the decision and
// settles it the same way. Neither ever treats a failed call as done.
import type pg from 'pg'
import type { LobbyEntry } from '@sophia/contracts'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

export type RemovalState = NonNullable<LobbyEntry['removal']>['state']

export interface RemovalClaim {
  id: string
  roomId: string
  identity: string
  state: RemovalState
  attempts: number
}

/** What the LiveKit server said: evidence (`removed`, `absent`) or a failure that keeps the removal pending. */
export type RemovalOutcome = { outcome: 'removed' | 'absent' } | { outcome: 'failed'; error: string }

type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (err) {
    throw classifyDbError(err)
  }
}

interface ClaimRow {
  id: string
  room_id: string
  identity: string
  state: RemovalState
  attempts: number
}

const toClaim = (r: ClaimRow): RemovalClaim => ({
  id: r.id,
  roomId: r.room_id,
  identity: r.identity,
  state: r.state,
  attempts: r.attempts,
})

/** Removals due now: pending past their backoff, and settled ones still on watch. Service principal only. */
export async function claimRoomRemovals(
  db: Queryable,
  worker: string,
  limit = 10,
  leaseSeconds = 30,
): Promise<RemovalClaim[]> {
  const { rows } = await wrap(
    db.query<ClaimRow>(`SELECT * FROM sophia.claim_room_removals($1, $2, $3)`, [worker, limit, leaseSeconds]),
  )
  return rows.map(toClaim)
}

/** Record the server's answer under the lease; returns the removal's state afterwards, or 'stale'. */
export async function settleRoomRemoval(
  db: Queryable,
  id: string,
  worker: string,
  result: RemovalOutcome,
): Promise<RemovalState | 'cancelled' | 'stale'> {
  const error = result.outcome === 'failed' ? result.error : null
  const { rows } = await wrap(
    db.query<{ state: RemovalState | 'cancelled' | 'stale' }>(
      `SELECT sophia.settle_room_removal($1, $2, $3, $4) AS state`,
      [id, worker, result.outcome, error],
    ),
  )
  return onlyRow(rows, 'settle_room_removal').state
}

/** The open removal of a lobby entry, for the API's immediate attempt. Call inside withActor (members, RLS). */
export async function pendingRemoval(c: pg.PoolClient, entryId: string): Promise<RemovalClaim | null> {
  const { rows } = await c.query<ClaimRow>(
    `SELECT id, room_id, identity, state, attempts FROM sophia.room_removals
      WHERE lobby_entry_id = $1 AND state = 'pending'`,
    [entryId],
  )
  return rows[0] ? toClaim(rows[0]) : null
}

/** The latest removal of a lobby entry as the contract shows it, or null. Call inside withActor. */
export async function readRemoval(c: pg.PoolClient, entryId: string): Promise<LobbyEntry['removal']> {
  const { rows } = await c.query<{ state: RemovalState; attempts: number; last_error: string | null }>(
    `SELECT state, attempts, last_error FROM sophia.room_removals
      WHERE lobby_entry_id = $1 AND state <> 'cancelled' ORDER BY created_at DESC LIMIT 1`,
    [entryId],
  )
  const r = rows[0]
  return r ? { state: r.state, attempts: r.attempts, lastError: r.last_error } : null
}
