import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

export interface TestDatabase {
  /** Migration-owner connection: seeding and assertions only, never the API path. */
  ownerUrl: string
  /** Login granted sophia_api, as in production. */
  apiUrl: string
  apiRole: string
  /** Login granted sophia_worker (outbox claims, lease maintenance). */
  workerUrl: string
  /**
   * A synthetic, bare LOGIN member of the conversation assembler role (0070), made after the migrations for a fixture
   * whose schema grants that role; null when the schema does not, or when the fixture asked for none. A test binding,
   * NOT a Q13 admission certificate: no activation check or fresh-denial proof stands behind it.
   */
  assemblerUrl: string | null
  assemblerRole: string | null
  drop(): Promise<void>
}

export interface TestDatabaseOptions {
  /** false: no assembler login, e.g. for a refusal that needs none admitted. Default: one when the schema grants it. */
  assembler?: boolean
}

/** The conversation assembler role (0070): cluster-global, so its logins and installations never overlap in tests. */
const ASSEMBLER = 'sophia_conversation_assembler'

export interface EmptyDatabase {
  ownerUrl: string
  drop(): Promise<void>
}

function adminUrl(): string {
  const url = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
  if (!url) throw new Error('SOPHIA_DISPOSABLE_DATABASE_URL is required (run through scripts/with-postgres.ts)')
  return url
}

function withDatabase(url: string, database: string): string {
  const u = new URL(url)
  u.pathname = `/${database}`
  return u.toString()
}

async function onAdmin<T>(fn: (admin: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: adminUrl() })
  await admin.connect()
  try {
    return await fn(admin)
  } finally {
    await admin.end()
  }
}

/**
 * Serialize anything that runs migrations. Test files run in parallel, and migration 0002 creates
 * cluster-wide roles (sophia_api, sophia_worker) with IF NOT EXISTS, which races across databases.
 * The advisory lock lives on the shared admin database, so it spans every test database.
 */
export async function withClusterMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  return onAdmin(async (admin) => {
    await admin.query(`SELECT pg_advisory_lock(hashtext('sophia-test-migrations'))`)
    try {
      return await fn()
    } finally {
      await admin.query(`SELECT pg_advisory_unlock(hashtext('sophia-test-migrations'))`)
    }
  })
}

/** An empty database (no migrations, no logins), e.g. for testing the migration runner itself. */
export async function createEmptyDatabase(prefix = 'sophia_e'): Promise<EmptyDatabase> {
  const name = `${prefix}_${randomBytes(6).toString('hex')}`
  await onAdmin((admin) => admin.query(`CREATE DATABASE ${name}`))
  return {
    ownerUrl: withDatabase(adminUrl(), name),
    drop: () => onAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)).then(() => undefined),
  }
}

async function applyMigrations(ownerUrl: string, dir: string): Promise<void> {
  const owner = new pg.Client({ connectionString: ownerUrl })
  await owner.connect()
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .toSorted()
    for (const file of files) await owner.query(readFileSync(join(dir, file), 'utf8'))
  } finally {
    await owner.end()
  }
}

/** A LOGIN role granted `groupRole`, like the production API/worker logins. */
async function createLogin(ownerUrl: string, role: string, groupRole: string, password: string): Promise<string> {
  const owner = new pg.Client({ connectionString: ownerUrl })
  await owner.connect()
  try {
    await owner.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    )
    await owner.query(`GRANT ${groupRole} TO ${role}`)
    await owner.query(`GRANT CONNECT ON DATABASE ${new URL(ownerUrl).pathname.slice(1)} TO ${role}`)
  } finally {
    await owner.end()
  }
  const u = new URL(ownerUrl)
  u.username = role
  u.password = password
  return u.toString()
}

/**
 * Fresh database + migrations + API and worker logins on the server at
 * SOPHIA_DISPOSABLE_DATABASE_URL (scripts/with-postgres.ts starts one in Docker when unset).
 * Never a shared or legacy database.
 */
export async function createTestDatabase(
  migrationsDir = 'db/migrations',
  options: TestDatabaseOptions = {},
): Promise<TestDatabase> {
  const suffix = randomBytes(6).toString('hex')
  const password = randomBytes(12).toString('hex')
  const apiRole = `sophia_api_t_${suffix}`
  const workerRole = `sophia_worker_t_${suffix}`
  const assemblerLogin = `sophia_assembler_t_${suffix}`
  const db = await createEmptyDatabase('sophia_t')
  // The database first, then every login this fixture made; each step tolerates what never got created, so a failed
  // setup and a repeated drop leave nothing behind for the next installation (0070 refuses a role with leftovers).
  const drop = async () => {
    await db.drop()
    await onAdmin(async (admin) => {
      for (const role of [assemblerLogin, apiRole, workerRole]) await admin.query(`DROP ROLE IF EXISTS ${role}`)
    })
  }
  try {
    const [apiUrl, workerUrl, assemblerUrl] = await withClusterMigrationLock(async () => {
      await applyMigrations(db.ownerUrl, migrationsDir)
      return [
        await createLogin(db.ownerUrl, apiRole, 'sophia_api', password),
        await createLogin(db.ownerUrl, workerRole, 'sophia_worker', password),
        options.assembler !== false && (await grantsAssembler(db.ownerUrl))
          ? await createLogin(db.ownerUrl, assemblerLogin, ASSEMBLER, password)
          : null,
      ]
    })
    return {
      ownerUrl: db.ownerUrl,
      apiUrl,
      apiRole,
      workerUrl,
      assemblerUrl,
      assemblerRole: assemblerUrl ? assemblerLogin : null,
      drop,
    }
  } catch (error) {
    await drop()
    throw error
  }
}

/** Whether this database's schema grants the assembler role anything (0070 installed here). */
async function grantsAssembler(ownerUrl: string): Promise<boolean> {
  const owner = new pg.Client({ connectionString: ownerUrl })
  await owner.connect()
  try {
    const { rows } = await owner.query<{ ok: boolean }>(
      `SELECT EXISTS(SELECT FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid
        WHERE d.refclassid='pg_authid'::regclass AND r.rolname=$1
         AND d.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())) AS ok`,
      [ASSEMBLER],
    )
    return rows[0]?.ok === true
  } finally {
    await owner.end()
  }
}
