// The migration runner itself (level: sql-run): ledger with checksums, idempotent reruns, drift
// detection, atomic failure and concurrent runners.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createEmptyDatabase, withClusterMigrationLock } from '@sophia/test-support'
import { migrate, MigrationDrift, readMigrations } from './migrate.ts'

/** Every migration run in tests holds the cluster-wide lock (cluster roles race across databases). */
const run = (url: string, dir: string, opts?: { dryRun?: boolean }) =>
  withClusterMigrationLock(() => migrate(url, dir, opts))

const DIR = 'db/migrations'
const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function fresh() {
  const db = await createEmptyDatabase()
  cleanups.push(() => db.drop())
  return db.ownerUrl
}
async function query<T extends pg.QueryResultRow>(url: string, sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}
function tempMigrations(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sophia-mig-'))
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql)
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

describe('migration runner', () => {
  it('applies every migration once and records its exact checksum', async () => {
    const url = await fresh()
    const files = readMigrations(DIR)
    const first = await run(url, DIR)
    assert.deepEqual(
      first.rows.map((r) => r.status),
      files.map(() => 'applied'),
    )
    const ledger = await query<{ version: string; sha256: string }>(
      url,
      `SELECT version, sha256 FROM sophia_meta.schema_migrations ORDER BY version`,
    )
    assert.deepEqual(
      ledger,
      files.map((f) => ({ version: f.version, sha256: f.sha256 })),
    )

    const again = await run(url, DIR)
    assert.equal(
      again.rows.every((r) => r.status === 'already_applied'),
      true,
    )
    assert.deepEqual(await query(url, `SELECT count(*)::int AS n FROM sophia_meta.schema_migrations`), [
      { n: files.length },
    ])
  })

  it('reports pending migrations on a dry run without touching the database', async () => {
    const url = await fresh()
    const report = await run(url, DIR, { dryRun: true })
    assert.equal(
      report.rows.every((r) => r.status === 'pending'),
      true,
    )
    assert.deepEqual(
      await query(url, `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('sophia', 'sophia_meta')`),
      [{ n: 0 }],
    )
  })

  it('stops on checksum drift instead of skipping or re-applying an edited migration', async () => {
    const url = await fresh()
    await run(url, DIR)
    await query(url, `UPDATE sophia_meta.schema_migrations SET sha256 = repeat('0', 64) WHERE version = '0003'`)
    await assert.rejects(run(url, DIR), MigrationDrift)
  })

  it('rolls back a failing migration together with its ledger row', async () => {
    const url = await fresh()
    const dir = tempMigrations({
      '0001_ok.sql': 'BEGIN;\nCREATE TABLE public.mig_ok(id int);\nCOMMIT;\n',
      '0002_broken.sql':
        '-- fails halfway\nBEGIN;\nCREATE TABLE public.mig_half(id int);\nSELECT no_such_column FROM public.mig_ok;\nCOMMIT;\n',
    })
    await assert.rejects(run(url, dir), /0002_broken\.sql failed and was rolled back/)
    assert.deepEqual(await query(url, `SELECT version FROM sophia_meta.schema_migrations`), [{ version: '0001' }])
    assert.deepEqual(await query(url, `SELECT to_regclass('public.mig_half') IS NULL AS gone`), [{ gone: true }])
  })

  it('refuses a migration that does not own its transaction', async () => {
    const url = await fresh()
    const dir = tempMigrations({ '0001_loose.sql': 'CREATE TABLE public.loose(id int);\n' })
    await assert.rejects(run(url, dir), /must be wrapped in BEGIN/)
  })

  it('serializes two concurrent runners: one applies, the other finds everything applied', async () => {
    const url = await fresh()
    // One lock around both: the concurrency under test is on the same database, not across the cluster.
    const [a, b] = await withClusterMigrationLock(() => Promise.all([migrate(url, DIR), migrate(url, DIR)]))
    const statuses = [a, b].map((r) => [...new Set(r.rows.map((x) => x.status))].join())
    assert.deepEqual(statuses.toSorted(), ['already_applied', 'applied'])
  })
})
