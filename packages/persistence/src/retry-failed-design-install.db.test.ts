// 0081 reserves one routine name, sophia.retry_failed_design, and creates it once: a database where a routine of that
// name already exists (an object no migration recorded) refuses the migration before it changes anything, and a fresh
// installation gets the routine, granted to the API alone, with design_tasks_edit_binding letting a create carry a key.
// Run on the serialized test:db cluster, one installation at a time (0070's role guard).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import pg from 'pg'
import { createEmptyDatabase, withClusterMigrationLock } from '@sophia/test-support'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations/', import.meta.url))
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .toSorted()
const RETRY = '0081_retry_failed_design.sql'

async function query<T extends pg.QueryResultRow>(url: string, sql: string): Promise<T[]> {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query<T>(sql)).rows
  } finally {
    await c.end()
  }
}

/** One migration file, or its database error. */
async function applyOne(c: pg.Client, file: string): Promise<pg.DatabaseError | null> {
  try {
    await c.query(readFileSync(join(MIGRATIONS, file), 'utf8'))
    return null
  } catch (error) {
    if (error instanceof pg.DatabaseError) return error
    throw error
  }
}

/** The migrations in order up to (not including) `stop`, or all; then `between` runs, then the rest. */
async function install(url: string, stop: string | null, between = ''): Promise<pg.DatabaseError | null> {
  return withClusterMigrationLock(async () => {
    const c = new pg.Client({ connectionString: url })
    await c.connect()
    try {
      for (const file of files) {
        if (file === stop && between) await c.query(between)
        const error = await applyOne(c, file)
        if (error) return error
      }
      return null
    } finally {
      await c.end()
    }
  })
}

const routines = (url: string) =>
  query<{ signature: string }>(
    url,
    `SELECT p.oid::regprocedure::text AS signature FROM pg_proc p WHERE p.pronamespace='sophia'::regnamespace
      AND p.proname='retry_failed_design' ORDER BY 1`,
  )
const binding = async (url: string) =>
  (
    await query<{ def: string }>(
      url,
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid='sophia.design_tasks'::regclass AND conname='design_tasks_edit_binding'`,
    )
  )[0]?.def

describe('0081 creates sophia.retry_failed_design once (FND-B-HTML-RETAINED-RECOVERY-01)', () => {
  it('refuses over an unrecorded routine of that name, changing nothing; a fresh installation gets it, granted to the API only', async () => {
    const decoyed = await createEmptyDatabase('sophia_r')
    try {
      const failure = await install(
        decoyed.ownerUrl,
        RETRY,
        `CREATE FUNCTION sophia.retry_failed_design(p uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$`,
      )
      assert.ok(failure, 'the migration is refused')
      assert.equal(failure.code, '42723')
      assert.match(failure.message, /a routine sophia\.retry_failed_design already exists/)
      assert.deepEqual(
        await routines(decoyed.ownerUrl),
        [{ signature: 'sophia.retry_failed_design(uuid)' }],
        'the decoy is left as it was',
      )
      assert.match(
        (await binding(decoyed.ownerUrl)) ?? '',
        /\(mode = 'edit'::text\) = \(request_key IS NOT NULL\)/,
        '0041’s constraint stands',
      )
    } finally {
      await decoyed.drop()
    }
    const fresh = await createEmptyDatabase('sophia_r')
    try {
      assert.equal(await install(fresh.ownerUrl, null), null)
      assert.deepEqual(await routines(fresh.ownerUrl), [{ signature: 'sophia.retry_failed_design(uuid,uuid,jsonb)' }])
      const [grants] = await query<{ api: boolean; worker: boolean; anyone: boolean }>(
        fresh.ownerUrl,
        `SELECT has_function_privilege('sophia_api','sophia.retry_failed_design(uuid,uuid,jsonb)','EXECUTE') AS api,
                has_function_privilege('sophia_worker','sophia.retry_failed_design(uuid,uuid,jsonb)','EXECUTE') AS worker,
                EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid='sophia.retry_failed_design(uuid,uuid,jsonb)'::regprocedure
                  AND x.grantee=0) AS anyone`,
      )
      assert.deepEqual(grants, { api: true, worker: false, anyone: false })
      const def = (await binding(fresh.ownerUrl)) ?? ''
      assert.match(def, /\(mode <> 'edit'::text\) OR \(request_key IS NOT NULL\)/)
      assert.match(def, /\(mode <> 'audit'::text\) OR \(request_key IS NULL\)/)
    } finally {
      await fresh.drop()
    }
  })
})
