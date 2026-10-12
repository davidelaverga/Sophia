import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError, pgError } from './errors.ts'

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
  /**
   * A performance.now() time bounding the wait for a connection, each statement run after `within`, and each of COMMIT's
   * lock waits (withServiceWithin). Not an aggregate bound on the transaction: COMMIT's completion is outside it.
   */
  deadline?: number
}

/**
 * One connection, one transaction. Reads use REPEATABLE READ READ ONLY so a snapshot and its cursor are
 * consistent. A failure while committing a write leaves its outcome unknown: the client must retry with
 * the same Idempotency-Key, never a new one.
 */
async function transaction<T>(
  pool: pg.Pool,
  opts: TxOptions,
  fn: (c: pg.PoolClient, within: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const { deadline } = opts
  const client = await (deadline === undefined ? pool.connect() : connectWithin(pool, deadline)).catch(
    (err: unknown) => {
      throw err instanceof DomainError ? err : new DomainError('unavailable', 'Database unavailable', { cause: err })
    },
  )
  // Before each statement of a bounded transaction, and before its COMMIT: only what is left of the time. A statement's
  // lock waits are within its statement_timeout; COMMIT's (deferred triggers) are not (PostgreSQL 16 and 17 do not cut
  // a COMMIT at statement_timeout), so lock_timeout is set to the same: it cuts each lock wait, not their sum. Both are
  // transaction-local. This statement itself, BEGIN and ROLLBACK wait on no lock, and are not bounded.
  const within = async () => {
    if (deadline === undefined) return
    const left = Math.floor(deadline - performance.now())
    if (left < 1) throw new DomainError('unavailable', NOT_IN_TIME)
    await client.query(`SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)`, [
      `${String(left)}ms`,
    ])
  }
  let committing = false
  try {
    await client.query(opts.mode === 'read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    if (opts.actorId !== null) await client.query("SELECT set_config('sophia.actor_id', $1, true)", [opts.actorId])
    const result = await fn(client, within)
    await within()
    committing = true
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (!committing) await client.query('ROLLBACK').catch(() => undefined)
    // Whatever happened at COMMIT, a bound's cancel included, may or may not have committed.
    if (committing && opts.mode === 'write')
      throw new DomainError('outcome_unknown', 'Commit outcome unknown', { cause: err })
    if (err instanceof DomainError) throw err
    // Strictly before COMMIT, a statement or a lock wait cut by its bound (57014, 55P03): the transaction was rolled back.
    if (deadline !== undefined && ['57014', '55P03'].includes(pgError(err).code))
      throw new DomainError('unavailable', NOT_IN_TIME, { cause: err })
    throw classifyDbError(err)
  } finally {
    client.release()
  }
}

/**
 * The most acquisitions of bounded transactions that may wait on one pool at once (Codex P1 r4238081302, root's review).
 * pg's Pool has no per-call limit on a wait: an acquisition given up at its deadline stays in the pool's queue until a
 * connection comes free, so under sustained starvation every retry would add a waiter and a retained promise. Each one
 * is counted here from its pool.connect() until the pool hands it a connection (and it is given straight back if its
 * deadline passed); past this many, a bounded transaction is refused at once, never enqueued. It opens no connection of
 * its own: the API's sessions stay its pool's max plus the call fences' (18 per process with the defaults).
 */
export const BOUNDED_ACQUISITIONS_MAX = 4

/** What a bounded transaction answers when the pool already has BOUNDED_ACQUISITIONS_MAX of them waiting. */
export const POOL_BUSY = 'Too many waiting for a database connection; nothing of it was done'

const acquiring = new WeakMap<pg.Pool, number>()

/** The acquisitions of bounded transactions waiting on `pool` now (counted until the pool hands each a connection). */
export function boundedAcquisitions(pool: pg.Pool): number {
  return acquiring.get(pool) ?? 0
}

/**
 * A connection from `pool` by `deadline`, or `unavailable` once it passed (NOT_IN_TIME) or when BOUNDED_ACQUISITIONS_MAX
 * are already waiting (POOL_BUSY, without enqueuing): no transaction begins. A connection the pool hands over after the
 * deadline is given straight back, unused: nothing of the abandoned work runs on it.
 */
async function connectWithin(pool: pg.Pool, deadline: number): Promise<pg.PoolClient> {
  const left = deadline - performance.now()
  if (left < 1) throw new DomainError('unavailable', NOT_IN_TIME)
  const waiting = boundedAcquisitions(pool)
  if (waiting >= BOUNDED_ACQUISITIONS_MAX) throw new DomainError('unavailable', POOL_BUSY)
  acquiring.set(pool, waiting + 1)
  const pending = pool.connect().finally(() => acquiring.set(pool, boundedAcquisitions(pool) - 1))
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), left)
  })
  const client = await Promise.race([pending, late]).finally(() => clearTimeout(timer))
  if (client !== null && performance.now() < deadline) return client
  if (client === null)
    pending.then(
      (c) => c.release(),
      () => undefined,
    )
  else client.release()
  throw new DomainError('unavailable', NOT_IN_TIME)
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

/** What a bounded service write answers once its time ran out before COMMIT: it was rolled back, nothing kept. */
export const NOT_IN_TIME = 'Not done within its time bound; nothing of it was kept'

/**
 * A service write for the media bridge's posts, its waits bounded by `deadline` (a performance.now() time): their client
 * gives an attempt up at its own bound and sends another, so an attempt's waits must not outlive it (Codex P1
 * r4238081302: blocked on a lock, abandoned transactions piled up until the API's pool was exhausted). What it bounds:
 * - The wait for a connection: only until the deadline, and only while fewer than BOUNDED_ACQUISITIONS_MAX bounded
 *   transactions wait on the pool (else refused at once, never enqueued); one the pool hands over after the deadline is
 *   given straight back, unused: no BEGIN, nothing of `fn`.
 * - Each statement `fn` runs after awaiting `within`: it has only what is left then (statement_timeout and lock_timeout,
 *   set transaction-locally; its lock waits included), and none starts once nothing is left.
 * - Each of COMMIT's lock waits (deferred triggers; none on the tables the bridge's posts write): `within` runs again
 *   before COMMIT, and lock_timeout cuts each such wait at what was left then (each wait, not their sum).
 * What it does not bound: there is no aggregate hard bound on the transaction. COMMIT's own completion (its WAL write and
 * flush, a synchronous replica if one is configured), the network round trips to and from the server, BEGIN and the
 * statements that set the bound, and the API's own time between statements have no deadline here; the bound is on the
 * lock waits and statements, which is where an abandoned transaction waited.
 * Anything that fails strictly before COMMIT is a known rollback: `unavailable` (503, retry safe_read; NOT_IN_TIME when
 * the bound ended it), nothing kept, and the caller may send again. A failure at COMMIT, the bound's included, is
 * `outcome_unknown` (503, retry same_admission_key), as for any write: it may or may not have committed.
 */
export function withServiceWithin<T>(
  pool: pg.Pool,
  deadline: number,
  fn: (c: pg.PoolClient, within: () => Promise<void>) => Promise<T>,
): Promise<T> {
  return transaction(pool, { mode: 'write', actorId: null, deadline }, fn)
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
