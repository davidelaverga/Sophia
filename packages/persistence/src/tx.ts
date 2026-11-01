import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError, pgError } from './errors.ts'
import {
  budgetedRead,
  checkServiceControl,
  controlledQueryTimedOut,
  serviceClient,
  type ServiceControl,
} from './service-control.ts'

export interface PoolOptions {
  max?: number
  /** An idle client whose connection dropped (restart, failover, pooler reset). The pool replaces it. */
  onIdleError?: (err: Error) => void
  /** Bound actual pool acquisition, including queued waits. Omitted preserves the caller's existing default. */
  connectionTimeoutMillis?: number
}

export function createPool(
  connectionString: string,
  { max = 10, onIdleError, connectionTimeoutMillis }: PoolOptions = {},
): pg.Pool {
  const pool = new pg.Pool({ connectionString, max, connectionTimeoutMillis, application_name: 'sophia-api' })
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

function acquiredClient(client: pg.PoolClient, control?: ServiceControl): pg.PoolClient {
  try {
    checkServiceControl(control)
    return client
  } catch (err) {
    // No SQL has been sent: an expired pool waiter must not destroy a healthy connection.
    client.release()
    throw err
  }
}

/**
 * BEGIN and the actor's setting. A controlled transaction is bounded on the server as well as the client: a read
 * statement by statement (`read`, budgetedRead), a write once, here, by what remains of its deadline.
 */
async function begin(
  client: pg.PoolClient,
  read: pg.PoolClient | null,
  opts: TxOptions,
  lease: ReturnType<typeof serviceClient>,
  control?: ServiceControl,
): Promise<void> {
  await client.query(opts.mode === 'read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
  if (opts.actorId !== null)
    await (read ?? client).query("SELECT set_config('sophia.actor_id', $1, true)", [opts.actorId])
  lease.check()
  if (control && !read) {
    // Closing pg's socket alone need not stop server-side SQL. Bound it on the server as well as the client.
    await client.query("SELECT set_config('statement_timeout', $1, true)", [
      String(Math.max(1, Math.floor(control.deadline - performance.now()))),
    ])
    lease.check()
  }
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
  control?: ServiceControl,
): Promise<T> {
  checkServiceControl(control)
  const { deadline } = opts
  const client = acquiredClient(
    await (deadline === undefined ? pool.connect() : connectWithin(pool, deadline)).catch((err: unknown) => {
      throw err instanceof DomainError ? err : new DomainError('unavailable', 'Database unavailable', { cause: err })
    }),
    control,
  )
  const lease = serviceClient(client, control)
  // A controlled read bounds each statement by what remains of its absolute budget (R-C1-READ-BOUNDS-01): the actor's
  // setting and every statement of the read. A controlled write keeps its one bound, set once in begin.
  const read = control && opts.mode === 'read' ? budgetedRead(client, control, lease) : null
  // Before each statement of a bounded transaction (`deadline`, withServiceWithin), and before its COMMIT: only what is
  // left of the time. A statement's lock waits are within its statement_timeout; COMMIT's (deferred triggers) are not
  // (PostgreSQL 16 and 17 do not cut a COMMIT at statement_timeout), so lock_timeout is set to the same: it cuts each
  // lock wait, not their sum. Both are transaction-local. This statement itself, BEGIN and ROLLBACK wait on no lock, and
  // are not bounded.
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
    await begin(client, read, opts, lease, control)
    const result = await fn(read ?? client, within)
    await within()
    lease.check()
    committing = true
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (controlledQueryTimedOut(err, control)) lease.retire()
    if (!committing && !lease.retired()) await client.query('ROLLBACK').catch(() => undefined)
    throw failure(err, committing, opts)
  } finally {
    lease.finish()
  }
}

/** What a failed transaction answers, once it was rolled back or its COMMIT was sent. */
function failure(err: unknown, committing: boolean, opts: TxOptions): Error {
  // Whatever happened at COMMIT, a bound's cancel included, may or may not have committed.
  if (committing && opts.mode === 'write')
    return new DomainError('outcome_unknown', 'Commit outcome unknown', { cause: err })
  if (err instanceof DomainError) return err
  // Strictly before COMMIT, a statement or a lock wait cut by its bound (57014, 55P03): the transaction was rolled back.
  if (opts.deadline !== undefined && ['57014', '55P03'].includes(pgError(err).code))
    return new DomainError('unavailable', NOT_IN_TIME, { cause: err })
  return classifyDbError(err)
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
export function withService<T>(
  pool: pg.Pool,
  fn: (c: pg.PoolClient) => Promise<T>,
  control?: ServiceControl,
): Promise<T> {
  return transaction(pool, { mode: 'write', actorId: null }, fn, control)
}

/** What the verified token says about its subject (never a request): the provider's name, and the verified email. */
export interface ActorNames {
  /** Seeds a display name the person hasn't chosen (0062); never an address. */
  seed: string | null
  /** The address invitations are matched by; the room keeps it (0050, 0055), and it is never shown as a name. */
  contact: string | null
}

/**
 * Put the verified actor's names in the transaction (0062's name_actor), for the rows that keep a name (0048: a room
 * message; 0049: a note, a proposal, a decision) and the room's address book (0050): the provider's name seeds a display
 * name the person hasn't chosen, which never replaces one they chose. Answers their display name, or null. Call inside
 * withActor(..., "write").
 */
export async function nameActor(c: pg.PoolClient, names: ActorNames): Promise<string | null> {
  const { rows } = await c.query<{ shown: string | null }>('SELECT sophia.name_actor($1, $2) AS shown', [
    names.seed,
    names.contact,
  ])
  return rows[0]?.shown ?? null
}

/**
 * Keep the address the transaction carries (nameActor) as the actor's in this project (0050, 0062), for an admin to
 * invite them elsewhere (0055): called when the member opens the project or joins its call. A non-member keeps nothing.
 */
export async function rememberRoomName(c: pg.PoolClient, projectId: string): Promise<void> {
  await c.query('SELECT sophia.remember_room_name($1)', [projectId])
}

/**
 * Put the speaker's display name (0062) in the transaction for a voice write, unless it carries one already: the bridge
 * names the speaker by id only. Call inside withActor as the speaker; nothing leaves the database.
 */
export async function nameFromRoom(c: pg.PoolClient, projectId: string): Promise<void> {
  await c.query('SELECT sophia.name_from_room($1)', [projectId])
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
 * (`set_config(..., true)`), so a pooled connection never carries a previous actor. A `control` bounds it as it bounds
 * a service transaction: a deadline and an abort, either of which retires the connection instead of returning it to the
 * pool (READ-BOUNDS-01; the projection reads pass one). A controlled read is bounded on the server too, each statement
 * by what remains of the absolute deadline (budgetedRead), so none outlives it.
 */
export function withActor<T>(
  pool: pg.Pool,
  actorId: string,
  mode: TxMode,
  fn: (c: pg.PoolClient) => Promise<T>,
  control?: ServiceControl,
): Promise<T> {
  if (!ACTOR_ID.test(actorId)) throw new DomainError('actor_context_required', 'A verified actor is required')
  return transaction(pool, { mode, actorId }, fn, control)
}
