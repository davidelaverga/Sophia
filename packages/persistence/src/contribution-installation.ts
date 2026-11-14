// INC04-S02a coherent (0105 + 0106): whether this database has the atomic contributed admission installed. A database
// can hold 0106 without 0105 (an installation of the earlier source, migrated before 0105 existed), and every object
// those earlier callers use keeps its signature in 0105, so neither an old signature nor the highest applied migration
// tells the two apart. Only 0105's own new objects do: its claim table, its lineage-holds and dispatch-fund helpers, and
// the seven checked facts it adds to sophia.api_contribution_tasks.
//
// A dependency leaf: the API's readiness and route guards, the maintained research admission and paid reserve, and the
// worker's new-work dispatch all use this one proof, so they cannot drift. It reads catalog metadata only: no private
// helper is executed and no candidate, account or grant fact is read. A migration is never undone under a running
// process, so a caller may remember a true answer; nothing here remembers false, so the same process proceeds once the
// migration has run. This is an installation check, not a defence against later tampering by the database owner, and
// it does not protect a raw SQL caller or an older binary: migration before traffic stays the release boundary.
import { DomainError } from '@sophia/domain'

/** The seven facts 0105 adds to sophia.api_contribution_tasks and freezes on every new binding. */
export const ATOMIC_ADMISSION_COLUMNS = [
  'lineage_cap_usd',
  'account_revision',
  'account_provenance',
  'account_qualification_id',
  'account_qualification_revision',
  'protection_witness',
  'checked_at',
] as const

/** A boolean SQL fragment: 0105's unique objects are installed. Each part is false, never an error, when missing. */
export const ATOMIC_ADMISSION_INSTALLED = `to_regclass('sophia.api_contribution_claims') IS NOT NULL
  AND to_regprocedure('sophia.contribution_lineage_holds(uuid,uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('sophia.contribution_dispatch_fund(sophia.execution_bindings)') IS NOT NULL
  AND (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid = to_regclass('sophia.api_contribution_tasks')
    AND attname IN (${ATOMIC_ADMISSION_COLUMNS.map((c) => `'${c}'`).join(', ')}) AND NOT attisdropped) = ${String(ATOMIC_ADMISSION_COLUMNS.length)}`

/** The whole proof as one query. */
export const ATOMIC_ADMISSION_SCHEMA = `SELECT ${ATOMIC_ADMISSION_INSTALLED} AS ok`

/** Anything that runs a query: a pool, a pooled client or a client. */
export interface CatalogReader {
  query(sql: string): Promise<{ rows: unknown[] }>
}

/** Whether 0105 is installed. A failed lookup is thrown as it came: the caller decides what that means for it. */
export async function atomicAdmissionInstalled(q: CatalogReader): Promise<boolean> {
  const { rows } = await q.query(ATOMIC_ADMISSION_SCHEMA)
  const row: unknown = rows[0]
  return typeof row === 'object' && row !== null && 'ok' in row && row.ok === true
}

/**
 * Refuse before any SQL effect unless 0105 is installed: unavailable when the lookup itself fails, and
 * projection_unavailable when it answers that 0105 is missing. Both are 503 and neither reaches the old SQL.
 */
export async function requireAtomicAdmission(q: CatalogReader): Promise<void> {
  let installed: boolean
  try {
    installed = await atomicAdmissionInstalled(q)
  } catch (err) {
    throw new DomainError('unavailable', 'Database unavailable', { cause: err })
  }
  if (!installed) {
    throw new DomainError(
      'projection_unavailable',
      'The atomic contributed admission (0105) is not installed on this database',
    )
  }
}
