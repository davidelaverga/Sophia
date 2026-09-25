// Forward-only migration runner with a checksum ledger (S1-02 exit: "exact migration checksums,
// database version"). Each migration and its ledger row commit in one transaction; an applied file
// whose bytes changed stops the run (drift) instead of being silently re-applied or skipped.
// Runs as the migration owner, never as the API or worker login.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { pgError } from './errors.ts'
import { onlyRow } from './rows.ts'

export interface MigrationFile {
  version: string
  filename: string
  sha256: string
  sql: string
}

export type MigrationStatus = 'applied' | 'already_applied' | 'pending'

export interface MigrationReport {
  serverVersion: string
  database: string
  role: string
  rows: Array<{ version: string; filename: string; sha256: string; status: MigrationStatus }>
}

interface LedgerRow {
  version: string
  filename: string
  sha256: string
}

export class MigrationDrift extends Error {}

const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/
/** Migrations own their transaction; the runner re-wraps the body with its ledger row. */
const WRAPPED = /^(?:\s*--[^\n]*\n)*\s*BEGIN;\s*\n([\s\S]*)\n\s*COMMIT;\s*$/
const LOCK = "hashtext('sophia-migrations')"
const UNDEFINED_TABLE = '42P01'

export function readMigrations(dir: string): MigrationFile[] {
  const seen = new Set<string>()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()
    .map((filename) => {
      const version = NAME.exec(filename)?.[1]
      if (!version) throw new Error(`Migration name must look like 0001_slug.sql: ${filename}`)
      if (seen.has(version)) throw new Error(`Duplicate migration version ${version}`)
      seen.add(version)
      const bytes = readFileSync(join(dir, filename))
      return {
        version,
        filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sql: bytes.toString('utf8'),
      }
    })
}

function bodyOf(file: MigrationFile): string {
  const body = WRAPPED.exec(file.sql)?.[1]
  if (body === undefined) throw new Error(`${file.filename} must be wrapped in BEGIN; … COMMIT;`)
  return body
}

export async function migrate(
  connectionString: string,
  dir: string,
  opts: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const files = readMigrations(dir)
  const dryRun = opts.dryRun ?? false
  const c = new pg.Client({ connectionString, application_name: 'sophia-migrate' })
  await c.connect()
  try {
    await c.query(`SELECT pg_advisory_lock(${LOCK})`)
    const server = await describeServer(c)
    if (!dryRun) await ensureLedger(c)
    const applied = await readLedger(c, dryRun)
    assertNoMissingFiles(applied, files, dir)

    const rows: MigrationReport['rows'] = []
    for (const file of files) {
      const status = await reconcile(c, file, applied.get(file.version), dryRun)
      rows.push({ version: file.version, filename: file.filename, sha256: file.sha256, status })
    }
    return { ...server, rows }
  } finally {
    await c.query(`SELECT pg_advisory_unlock(${LOCK})`).catch(() => undefined)
    await c.end()
  }
}

async function describeServer(c: pg.Client): Promise<Omit<MigrationReport, 'rows'>> {
  const { rows } = await c.query<{ server_version: string; database: string; role: string }>(
    `SELECT current_setting('server_version') AS server_version, current_database() AS database, current_user AS role`,
  )
  const info = onlyRow(rows, 'server description')
  return { serverVersion: info.server_version, database: info.database, role: info.role }
}

async function ensureLedger(c: pg.Client): Promise<void> {
  await c.query(`CREATE SCHEMA IF NOT EXISTS sophia_meta`)
  await c.query(`REVOKE ALL ON SCHEMA sophia_meta FROM PUBLIC`)
  await c.query(`CREATE TABLE IF NOT EXISTS sophia_meta.schema_migrations (
    version text PRIMARY KEY, filename text NOT NULL, sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now(), applied_by text NOT NULL DEFAULT current_user,
    server_version text NOT NULL DEFAULT current_setting('server_version'))`)
}

/** A dry run on a never-migrated database has no ledger yet: everything is pending. */
async function readLedger(c: pg.Client, dryRun: boolean): Promise<Map<string, LedgerRow>> {
  try {
    const { rows } = await c.query<LedgerRow>(`SELECT version, filename, sha256 FROM sophia_meta.schema_migrations`)
    return new Map(rows.map((r) => [r.version, r]))
  } catch (err: unknown) {
    if (dryRun && pgError(err).code === UNDEFINED_TABLE) return new Map()
    throw err
  }
}

function assertNoMissingFiles(applied: Map<string, LedgerRow>, files: MigrationFile[], dir: string): void {
  for (const row of applied.values()) {
    if (!files.some((f) => f.version === row.version)) {
      throw new MigrationDrift(`Applied migration ${row.version} (${row.filename}) is missing from ${dir}`)
    }
  }
}

async function reconcile(
  c: pg.Client,
  file: MigrationFile,
  prior: LedgerRow | undefined,
  dryRun: boolean,
): Promise<MigrationStatus> {
  if (prior) {
    if (prior.sha256 !== file.sha256) {
      throw new MigrationDrift(
        `Checksum drift in ${file.filename}: ledger ${prior.sha256.slice(0, 12)}…, file ${file.sha256.slice(0, 12)}…. ` +
          'Add a new migration instead of editing an applied one.',
      )
    }
    return 'already_applied'
  }
  if (dryRun) return 'pending'
  await applyWithLedgerRow(c, file)
  return 'applied'
}

async function applyWithLedgerRow(c: pg.Client, file: MigrationFile): Promise<void> {
  const body = bodyOf(file)
  await c.query('BEGIN')
  try {
    await c.query(body)
    await c.query(`INSERT INTO sophia_meta.schema_migrations(version, filename, sha256) VALUES ($1, $2, $3)`, [
      file.version,
      file.filename,
      file.sha256,
    ])
    await c.query('COMMIT')
  } catch (err: unknown) {
    await c.query('ROLLBACK').catch(() => undefined)
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`${file.filename} failed and was rolled back: ${reason}`, { cause: err })
  }
}
