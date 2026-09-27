import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError } from './errors.ts'

export interface PoolOptions {
  max?: number
  /** An idle client whose connection dropped (restart, failover, pooler reset). The pool replaces it. */
  onIdleError?: (err: Error) => void
}

export function createPool(connectionString: string, { max = 10, onIdleError }: PoolOptions = {}): pg.Pool {
  const pool = new pg.Pool({ connectionString, max, application_name: 'sophia-api' })
  // Without a listener, pg.Pool's 'error' event is an uncaught exception and the process exits.
  pool.on('error', onIdleError ?? ((err) => console.error(`idle database client failed: ${err.message}`)))
  return pool
}

/** The verified actor's id: a lowercase UUID. Anything else fails closed before touching the database. */
const ACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Refuse to serve traffic from a role that bypasses RLS or is not scoped to its application role
 * (db/README: "Neither login may inherit the migration owner or BYPASSRLS"): `sophia_api` for the API,
 * `sophia_worker` for the worker.
 */
export async function checkRoleSafety(
  pool: pg.Pool,
  role: 'sophia_api' | 'sophia_worker' = 'sophia_api',
): Promise<void> {
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean; member: boolean; owner: boolean }>(
    `SELECT r.rolsuper, r.rolbypassrls,
            pg_has_role(current_user, $1, 'USAGE') AS member,
            EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'sophia' AND pg_has_role(current_user, n.nspowner, 'USAGE')) AS owner
       FROM pg_roles r WHERE r.rolname = current_user`,
    [role],
  )
  const r = rows[0]
  if (!r || r.rolsuper || r.rolbypassrls || r.owner || !r.member) {
    throw new DomainError(
      'unavailable',
      `Database login must be a non-owner, non-superuser, non-BYPASSRLS member of ${role}`,
    )
  }
}

export type TxMode = 'read' | 'write'

interface TxOptions {
  mode: TxMode
  /** The verified actor, set transaction-locally; null for a read or write that must carry none. */
  actorId: string | null
}

/**
 * One connection, one transaction. Reads use REPEATABLE READ READ ONLY so a snapshot and its cursor are
 * consistent. A failure while committing a write leaves its outcome unknown: the client must retry with
 * the same Idempotency-Key, never a new one.
 */
async function transaction<T>(pool: pg.Pool, opts: TxOptions, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect().catch((err: unknown) => {
    throw new DomainError('unavailable', 'Database unavailable', { cause: err })
  })
  let committing = false
  try {
    await client.query(opts.mode === 'read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    if (opts.actorId !== null) await client.query("SELECT set_config('sophia.actor_id', $1, true)", [opts.actorId])
    const result = await fn(client)
    committing = true
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (!committing) await client.query('ROLLBACK').catch(() => undefined)
    if (committing && opts.mode === 'write')
      throw new DomainError('outcome_unknown', 'Commit outcome unknown', { cause: err })
    throw err instanceof DomainError ? err : classifyDbError(err)
  } finally {
    client.release()
  }
}

/**
 * A read with no actor, for what anyone holding a secret may see (an invitation preview). The actor
 * setting is transaction-local, so a pooled connection never carries one into this read.
 */
export function withoutActor<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return transaction(pool, { mode: 'read', actorId: null }, fn)
}

/**
 * A write with no member actor, for a service principal that the called sophia.* function authenticates
 * itself (a runtime capability, A04). Those functions refuse a call that carries a member identity.
 */
export function withService<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return transaction(pool, { mode: 'write', actorId: null }, fn)
}

/**
 * One connection, one transaction, the verified actor set transaction-locally
 * (`set_config(..., true)`), so a pooled connection never carries a previous actor.
 */
export function withActor<T>(
  pool: pg.Pool,
  actorId: string,
  mode: TxMode,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!ACTOR_ID.test(actorId)) throw new DomainError('actor_context_required', 'A verified actor is required')
  return transaction(pool, { mode, actorId }, fn)
}
