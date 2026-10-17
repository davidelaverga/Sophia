import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError } from './errors.ts'
import { checkServiceControl, controlledQueryTimedOut, serviceClient, type ServiceControl } from './service-control.ts'

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
 * One connection, one transaction. Reads use REPEATABLE READ READ ONLY so a snapshot and its cursor are
 * consistent. A failure while committing a write leaves its outcome unknown: the client must retry with
 * the same Idempotency-Key, never a new one.
 */
async function transaction<T>(
  pool: pg.Pool,
  opts: TxOptions,
  fn: (c: pg.PoolClient) => Promise<T>,
  control?: ServiceControl,
): Promise<T> {
  checkServiceControl(control)
  const client = acquiredClient(
    await pool.connect().catch((err: unknown) => {
      throw new DomainError('unavailable', 'Database unavailable', { cause: err })
    }),
    control,
  )
  const lease = serviceClient(client, control)
  let committing = false
  try {
    await client.query(opts.mode === 'read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    if (opts.actorId !== null) await client.query("SELECT set_config('sophia.actor_id', $1, true)", [opts.actorId])
    lease.check()
    if (control) {
      // Closing pg's socket alone need not stop server-side SQL. Bound it on the server as well as the client.
      await client.query("SELECT set_config('statement_timeout', $1, true)", [
        String(Math.max(1, Math.floor(control.deadline - performance.now()))),
      ])
      lease.check()
    }
    const result = await fn(client)
    lease.check()
    committing = true
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (controlledQueryTimedOut(err, control)) lease.retire()
    if (!committing && !lease.retired()) await client.query('ROLLBACK').catch(() => undefined)
    if (committing && opts.mode === 'write')
      throw new DomainError('outcome_unknown', 'Commit outcome unknown', { cause: err })
    throw err instanceof DomainError ? err : classifyDbError(err)
  } finally {
    lease.finish()
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

/**
 * One connection, one transaction, the verified actor set transaction-locally
 * (`set_config(..., true)`), so a pooled connection never carries a previous actor. A `control` bounds it as it bounds
 * a service transaction: a deadline (statement_timeout on the server too) and an abort, either of which retires the
 * connection instead of returning it to the pool (READ-BOUNDS-01; the projection reads pass one).
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
