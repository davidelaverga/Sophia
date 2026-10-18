// /ready across a migration (Codex on #107): an API on a database that a migration its routes call hasn't reached takes
// no traffic. On a database migrated through 0042 only, the capture routes of 0043 (#117) would fail on undefined
// functions: not ready. Once 0043 is applied, ready. The previous API requires nothing of 0043, so during a rolling
// deployment it stays ready on either database. An API given a byte store also requires 0044's write claim
// (writeOnce): not ready without it, and an API without a store requires nothing of 0044. The brief and the room's
// chat read the authors' names of 0048 and 0049 (Codex P1 on #336), and a voice write the room names of 0050: not
// ready on a database short of any.
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createPool, readSnapshot, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore } from './byte-store.ts'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const DELIVERY = '0043_design_delivery.sql'
const WRITE_ONCE = '0044_object_write_once.sql'
const DISCUSSION_NAMES = '0048_discussion_author_name.sql'
const MISSION_NAMES = '0049_mission_author_names.sql'
const ROOM_NAMES = '0050_room_names.sql'
const PROJECT_RENAME = '0051_project_rename.sql'
const PROJECT_LEAVE = '0052_project_leave.sql'
const GOAL_TARGETS = '0054_goal_targets.sql'
const INVITABLE = '0055_invitable_people.sql'
const MEMBER_ROLES = '0056_member_roles.sql'
const ACTIVITY = '0057_project_activity.sql'
const REMOVE_MEMBER = '0058_remove_member.sql'
const ARCHIVE = '0059_archive_project.sql'
const ROOM_ACTS = '0060_room_acts.sql'
const ACTIVITY_NAMES = '0061_activity_names.sql'
const PROFILES = '0062_actor_profiles.sql'
const RETIREMENTS = '0075_completed_goal_session_retirement.sql'

let dir: string
let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let stored: FastifyInstance

before(async () => {
  // The migrations before 0043, exactly as written.
  dir = mkdtempSync(join(tmpdir(), 'sophia-0042-'))
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < DELIVERY))
    copyFileSync(join(MIGRATIONS, file), join(dir, file))
  db = await createTestDatabase(dir)
  pool = createPool(db.apiUrl, { max: 2 })
  const verifyActor = createActorVerifier({
    issuer: 'https://synthetic.supabase.test/auth/v1',
    audience: 'authenticated',
    secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
  })
  app = buildApp({ pool, verifyActor })
  stored = buildApp({ pool, verifyActor, byteStore: memoryByteStore() })
})

after(async () => {
  await app.close()
  await stored.close()
  await pool.end()
  await db.drop()
  rmSync(dir, { recursive: true, force: true })
})

const ready = async (api = app): Promise<unknown[]> => {
  const res = await api.inject({ method: 'GET', url: '/ready' })
  return [res.statusCode, res.json()]
}

/** The migrations applied by a test, so each test can run alone (`--test-name-pattern`). */
const applied = new Set<string>()

/** Apply one migration as written, as the owner. */
async function migrate(file: string) {
  applied.add(file)
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  try {
    await owner.query(readFileSync(join(MIGRATIONS, file), 'utf8'))
  } finally {
    await owner.end()
  }
}

/** Every migration after 0044 and before `until`, as written, that this run hasn't applied (none needs 0044). */
async function through(until: string) {
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && f > WRITE_ONCE && f < until)
    .toSorted())
    if (!applied.has(file)) await migrate(file)
}

/** The database as the API needs it, short of 0044: 0043 and every migration after 0044. */
async function current() {
  if (!applied.has(DELIVERY)) await migrate(DELIVERY)
  await through('9999')
}

describe('readiness across 0043', () => {
  it('is not ready on a database migrated through 0042, nor short of 0048, 0049, 0050 or 0051; ready with all', async () => {
    assert.ok(readdirSync(dir).includes('0042_source_review_coordination.sql'), 'migrated through 0042')
    assert.ok(!readdirSync(dir).includes(DELIVERY))
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0043')
    await migrate(DELIVERY)
    await through(DISCUSSION_NAMES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0048')
    await migrate(DISCUSSION_NAMES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0049')
    await migrate(MISSION_NAMES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0050')
    await migrate(ROOM_NAMES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0051')
    await migrate(PROJECT_RENAME)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0052')
    await migrate(PROJECT_LEAVE)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0054')
    await migrate(GOAL_TARGETS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0055')
    await migrate(INVITABLE)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0056')
    await migrate(MEMBER_ROLES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0057')
    await migrate(ACTIVITY)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0058')
    await migrate(REMOVE_MEMBER)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0059')
    await migrate(ARCHIVE)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0060')
    await migrate(ROOM_ACTS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0061')
    await migrate(ACTIVITY_NAMES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0062')
    await migrate(PROFILES)
    // The snapshot reads goal_retirements (0075) unconditionally, whatever the flags: without it, not ready.
    await through(RETIREMENTS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0075')
    const admin = randomUUID()
    const { projectId } = await seedProject(db.ownerUrl, { admin })
    await assert.rejects(
      withActor(pool, admin, 'read', (c) => readSnapshot(c, projectId)),
      'its snapshot needs 0075',
    )
    await migrate(RETIREMENTS)
    await current()
    assert.deepEqual(await ready(), [200, { ready: true }], 'with all')
    const snapshot = await withActor(pool, admin, 'read', (c) => readSnapshot(c, projectId))
    assert.equal(snapshot?.projectId, projectId, 'and its snapshot reads')
  })

  it('with a byte store, is not ready until 0044 lets every write claim its key; without one, needs no 0044', async () => {
    assert.ok(!readdirSync(dir).includes(WRITE_ONCE))
    await current()
    assert.deepEqual(await ready(stored), [503, { ready: false, reason: 'schema' }], 'a store, no 0044')
    assert.deepEqual(await ready(), [200, { ready: true }], 'no store, no 0044')
    await migrate(WRITE_ONCE)
    assert.deepEqual(await ready(stored), [200, { ready: true }], 'a store, with 0044')
    assert.deepEqual(await ready(), [200, { ready: true }], 'no store, with 0044')
  })
})
