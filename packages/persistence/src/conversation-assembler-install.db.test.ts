// 0070 keeps the S3 candidate's Q13 guard (R-Q13-01): the cluster-global assembler role is installed only when it holds
// nothing of its own anywhere in the cluster and has no member. So a second installation is refused before it grants
// anything, whether another installation still holds the role's dependencies or a login is still its member; and once
// that installation and its login are gone, a fresh installation succeeds against the bare role. Run on the serialized
// test:db cluster, one installation at a time; the logins here are synthetic, not Q13 admissions.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import pg from 'pg'
import {
  createEmptyDatabase,
  createTestDatabase,
  withClusterMigrationLock,
  type EmptyDatabase,
} from '@sophia/test-support'

const ROLE = 'sophia_conversation_assembler'
const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations/', import.meta.url))
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .toSorted()
const CLAIM = 'sophia.conversation_assembly_claim(uuid,integer)'

async function query<T extends pg.QueryResultRow>(url: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
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

/** Every migration in order, as a fresh installation does; the file that failed and its error, or null. */
async function install(db: EmptyDatabase): Promise<{ file: string; error: pg.DatabaseError } | null> {
  return withClusterMigrationLock(async () => {
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    try {
      for (const file of files) {
        const error = await applyOne(c, file)
        if (error) return { file, error }
      }
      return null
    } finally {
      await c.end()
    }
  })
}

/** What the role holds in this database (pg_shdepend) and whether it may call the claim entry point here. */
async function surface(url: string) {
  const [row] = await query<{ held: number; claim: boolean }>(
    url,
    `SELECT (SELECT count(*)::int FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid
        WHERE d.refclassid='pg_authid'::regclass AND r.rolname=$1
         AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())) AS held,
       has_function_privilege($1,$2,'EXECUTE') AS claim`,
    [ROLE, CLAIM],
  )
  return row
}

async function refused(db: EmptyDatabase, reason: RegExp) {
  const failure = await install(db)
  assert.ok(failure, 'the installation is refused')
  assert.equal(failure.file, '0070_conversation_assembler_role_binding.sql')
  assert.equal(failure.error.code, '42501')
  assert.match(failure.error.message, reason)
  // 0070 is one transaction: nothing of it is left, so the role has no assembly surface in this database.
  assert.deepEqual(await surface(db.ownerUrl), { held: 0, claim: false })
}

describe('0070 installs the assembler role once per cluster (Q13 guard, R-Q13-01)', () => {
  it('refuses a second installation while another holds the role; a member alone also refuses; after teardown it succeeds', async () => {
    // 1. Dependencies only: another installation, no member.
    const first = await createTestDatabase(undefined, { assembler: false })
    const second = await createEmptyDatabase('sophia_i')
    try {
      assert.equal(first.assemblerUrl, null)
      await refused(second, /privileges or objects of its own/)
    } finally {
      await second.drop()
      await first.drop()
    }

    // 2. A member alone: no installation holds the role, but a login is still its member.
    const login = `sophia_assembler_i_${randomBytes(6).toString('hex')}`
    const admin = process.env.SOPHIA_DISPOSABLE_DATABASE_URL ?? ''
    await query(admin, `CREATE ROLE ${login} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`)
    await query(admin, `GRANT ${ROLE} TO ${login}`)
    const third = await createEmptyDatabase('sophia_i')
    try {
      await refused(third, /unexpected memberships/)
    } finally {
      await third.drop()
      await query(admin, `DROP ROLE IF EXISTS ${login}`)
    }

    // 3. Both, and CONNECT is not authority: the first installation's login can connect to the refused database
    //    (PUBLIC CONNECT) yet cannot call its assembly surface as the role there.
    const held = await createTestDatabase()
    const fifth = await createEmptyDatabase('sophia_i')
    try {
      assert.ok(held.assemblerUrl)
      await refused(fifth, /unexpected memberships|privileges or objects of its own/)
      const url = new URL(held.assemblerUrl)
      url.pathname = new URL(fifth.ownerUrl).pathname
      const c = new pg.Client({ connectionString: url.toString() })
      await c.connect()
      try {
        await c.query(`SET ROLE ${ROLE}`)
        await assert.rejects(
          c.query(`SELECT ${CLAIM.replace('(uuid,integer)', '')}(gen_random_uuid(),1000)`),
          (error: unknown) => error instanceof pg.DatabaseError && error.code === '42501',
        )
      } finally {
        await c.end()
      }
    } finally {
      await fifth.drop()
      await held.drop()
    }

    // 4. The control: with every installation and login gone, a fresh installation succeeds against the bare role.
    const fresh = await createEmptyDatabase('sophia_i')
    try {
      assert.equal(await install(fresh), null)
      const installed = await surface(fresh.ownerUrl)
      assert.ok(installed && installed.held > 0 && installed.claim, 'installed here, with its assembly surface')
    } finally {
      await fresh.drop()
    }
    const [bare] = await query<{ held: number; members: number }>(
      admin,
      `SELECT (SELECT count(*)::int FROM pg_shdepend d WHERE d.refobjid=r.oid) AS held,
         (SELECT count(*)::int FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid) AS members
       FROM pg_roles r WHERE r.rolname=$1`,
      [ROLE],
    )
    assert.deepEqual(bare, { held: 0, members: 0 }, 'the role is left bare for the next installation')
  })
})
