import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError } from './errors.ts'

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max, application_name: 'sophia-api' })
}

/**
 * Refuse to serve user traffic from a role that bypasses RLS or is not scoped to sophia_api
 * (db/README: "Neither login may inherit the migration owner or BYPASSRLS").
 */
export async function checkRoleSafety(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean; api: boolean; owner: boolean }>(
    `SELECT r.rolsuper, r.rolbypassrls,
            pg_has_role(current_user, 'sophia_api', 'USAGE') AS api,
            EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = 'sophia' AND pg_has_role(current_user, n.nspowner, 'USAGE')) AS owner
       FROM pg_roles r WHERE r.rolname = current_user`,
  )
  const r = rows[0]
  if (!r || r.rolsuper || r.rolbypassrls || r.owner || !r.api) {
    throw new DomainError(
      'unavailable',
      'Database login must be a non-owner, non-superuser, non-BYPASSRLS member of sophia_api',
    )
  }
}

export type TxMode = 'read' | 'write'

/**
 * One connection, one transaction, the verified actor set transaction-locally
 * (`set_config(..., true)`), so a pooled connection never carries a previous actor.
 * Reads use REPEATABLE READ READ ONLY so a snapshot and its cursor are consistent.
 */
export async function withActor<T>(
  pool: pg.Pool,
  actorId: string,
  mode: TxMode,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect().catch((err: unknown) => {
    throw new DomainError('unavailable', 'Database unavailable', { cause: err })
  })
  let committing = false
  try {
    await client.query(mode === 'read' ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    await client.query("SELECT set_config('sophia.actor_id', $1, true)", [actorId])
    const result = await fn(client)
    committing = true
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (!committing) await client.query('ROLLBACK').catch(() => undefined)
    // A failure while committing a write leaves its outcome unknown: the client must
    // retry with the same Idempotency-Key, never a new one.
    if (committing && mode === 'write')
      throw new DomainError('outcome_unknown', 'Commit outcome unknown', { cause: err })
    throw err instanceof DomainError ? err : classifyDbError(err)
  } finally {
    client.release()
  }
}
