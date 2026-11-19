// /ready across a migration (Codex on #107): an API on a database that a migration its routes call hasn't reached takes
// no traffic. On a database migrated through 0042 only, the capture routes of 0043 (#117) would fail on undefined
// functions: not ready. Once 0043 is applied, ready. The previous API requires nothing of 0043, so during a rolling
// deployment it stays ready on either database. An API given a byte store also requires 0044's write claim
// (writeOnce): not ready without it, and an API without a store requires nothing of 0044. The brief and the room's
// chat read the authors' names of 0048 and 0049 (Codex P1 on #336), and a voice write the room names of 0050: not
// ready on a database short of any. A report's Sources read a cited project text through 0090's guard: not ready
// without it. The atomic contributed admission (0105) is core whatever the switches say (INC04-S02a coherent): short
// of it, no API is ready, so the optional voice contrast (0085, 0087) is shown with every other migration installed.
// The tracked model-call boundary (0109) and its observed-facts opt-in (0110) are core too: through 0109 only, no API is
// ready; with 0110, it is. The C4/C5 W1 capacity exposure (0114) is NOT core: only an API built with its default-off
// capacityExposure switch requires it; off, a database without 0114 stays ready. Likewise the C2 bound output (0115):
// only an API built with its default-off boundOutput switch requires its nine wrappers.
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { SignJWT } from 'jose'
import { OwnerHostFixtureResources } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createPool, readSnapshot, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore } from './byte-store.ts'

const MIGRATIONS = fileURLToPath(new URL('../../../db/migrations', import.meta.url))
const HOST_ADMISSION = '0118_owner_host_admission.sql'
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
const NEEDS = '0065_needs_served.sql'
const UPDATES = '0066_project_updates.sql'
const MESSAGE_ACTS = '0068_contribution_revisions.sql'
const MENTIONS = '0069_contribution_mentions.sql'
const SEARCH = '0072_project_search.sql'
const TASKS = '0074_project_human_tasks.sql'
const RETIREMENTS = '0075_completed_goal_session_retirement.sql'
const MENTION_VISIBILITY = '0076_mention_source_visibility.sql'
const VOICE = '0085_voice_qualification.sql'
const KEYS = '0086_live_call_keys.sql'
const NUMBERING = '0087_voice_evidence_numbering.sql'
const PRESENCE = '0088_presence_order.sql'
const CITED_TEXT = '0090_cited_report_text.sql'

let dir: string
let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let stored: FastifyInstance
/** The same API with voice qualification on (A45). */
let voiced: FastifyInstance

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
  voiced = buildApp({ pool, verifyActor, voiceQualification: true })
})

after(async () => {
  await app.close()
  await stored.close()
  await voiced.close()
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
/** Work as the migration owner (RLS bypassed on purpose), on a client closed after. */
async function asOwner<T>(work: (c: pg.Client) => Promise<T>): Promise<T> {
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  try {
    return await work(owner)
  } finally {
    await owner.end()
  }
}

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

/**
 * The core an API needs whatever its switches say, 0105's atomic admission included, without the optional voice
 * qualification: every migration after 0044 not yet applied, as written and in order, except 0085 and 0087 (no later
 * migration replaces or calls their objects, so they can follow it; nothing of 0044 is needed, as in through()).
 */
async function atomicCore() {
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && f > WRITE_ONCE && f !== VOICE && f !== NUMBERING)
    .toSorted())
    if (!applied.has(file)) await migrate(file)
}

/** An API's answer to a GET: its status and body. */
async function answers(api: FastifyInstance, url: string): Promise<unknown[]> {
  const res = await api.inject({ method: 'GET', url })
  return [res.statusCode, res.json()]
}

// The host service is always mounted: enrollment and new-work switches do not remove its 0118 dependency.
describe('readiness across 0118 (the always-served host channel)', () => {
  const resources = new OwnerHostFixtureResources()
  const key = 'synthetic-readiness-host-jwt-key-at-least-32-bytes'
  const issuer = 'https://readiness-fixture.invalid/auth'
  let admissionDir: string
  let admissionDb: TestDatabase
  let admissionPool: pg.Pool
  const apis: FastifyInstance[] = []

  before(async () =>
    resources.setup(async () => {
      admissionDir = mkdtempSync(join(tmpdir(), 'sophia-0117-readiness-'))
      for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < HOST_ADMISSION))
        copyFileSync(join(MIGRATIONS, file), join(admissionDir, file))
      admissionDb = resources.database(await createTestDatabase(admissionDir))
      admissionPool = resources.pool(createPool(admissionDb.apiUrl, { max: 2 }))
      const verifyActor = createActorVerifier({ issuer, audience: 'authenticated', secret: key })
      for (const ownerHostEnrollment of [false, true])
        apis.push(
          resources.app(
            buildApp({
              pool: admissionPool,
              verifyActor,
              ownerHostEnrollment,
              ownerRunnerAdmissions: 'off',
              ownerRunnerResults: false,
            }),
          ),
        )
    }),
  )
  after(async () => {
    await resources.close()
    if (admissionDir) rmSync(admissionDir, { recursive: true, force: true })
  })
  async function owner(sql: string, values: unknown[] = []): Promise<void> {
    const c = new pg.Client({ connectionString: admissionDb.ownerUrl })
    await c.connect()
    try {
      await c.query(sql, values)
    } finally {
      await c.end()
    }
  }
  async function expectReady(installed: boolean): Promise<void> {
    for (const api of apis) {
      assert.deepEqual(
        await answers(api, '/ready'),
        installed ? [200, { ready: true }] : [503, { ready: false, reason: 'schema' }],
      )
      assert.deepEqual(await answers(api, '/health'), [200, { ok: true, commit: null }])
    }
  }
  const install = () => owner(readFileSync(join(MIGRATIONS, HOST_ADMISSION), 'utf8'))

  it('requires the exact helper with enrollment OFF or ON and runner/results OFF; the real migration restores readiness', async () => {
    assert.equal(
      (await admissionPool.query("SELECT to_regprocedure('sophia.owner_host_admission_allowed(bytea)') AS fn")).rows[0]
        ?.fn,
      null,
    )
    await expectReady(false)
    await install()
    await expectReady(true)
  })

  it('requires API EXECUTE and schema USAGE in both enrollment states; restored grants restore readiness', async () => {
    // Apply only if the preceding test was filtered out: each case has a valid installed positive baseline.
    if (
      (await admissionPool.query("SELECT to_regprocedure('sophia.owner_host_admission_allowed(bytea)') AS fn")).rows[0]
        ?.fn === null
    )
      await install()
    await expectReady(true)
    const signature = 'sophia.owner_host_admission_allowed(bytea)'
    await owner(`REVOKE EXECUTE ON FUNCTION ${signature} FROM sophia_api`)
    try {
      await expectReady(false)
    } finally {
      await owner(`GRANT EXECUTE ON FUNCTION ${signature} TO sophia_api`)
    }
    await expectReady(true)
    await owner('REVOKE USAGE ON SCHEMA sophia FROM sophia_api')
    try {
      await expectReady(false)
    } finally {
      await owner('GRANT USAGE ON SCHEMA sophia TO sophia_api')
    }
    await expectReady(true)
  })

  it('keeps ordinary existing-host hello/poll and owner maintenance working with enrollment OFF', async () => {
    if (
      (await admissionPool.query("SELECT to_regprocedure('sophia.owner_host_admission_allowed(bytea)') AS fn")).rows[0]
        ?.fn === null
    )
      await install()
    await expectReady(true)
    const actor = randomUUID(),
      connection = randomUUID(),
      capability = 'r'.repeat(43)
    await owner(
      "INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES($1,$2,'synthetic-readiness','fixture','linked')",
      [connection, actor],
    )
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(actor)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(key))
    const headers = { authorization: `Bearer ${token}` }
    const off = apis[0],
      on = apis[1]
    assert.ok(off && on)
    const payload = { connectionId: connection, ttlSeconds: 60 }
    assert.equal(
      (await off.inject({ method: 'POST', url: '/api/v1/owner-host-pairings', headers, payload })).statusCode,
      403,
    )
    const pair = await on.inject({ method: 'POST', url: '/api/v1/owner-host-pairings', headers, payload })
    assert.equal(pair.statusCode, 200)
    const bound = await on.inject({
      method: 'POST',
      url: '/api/v1/owner-host/redeem',
      payload: { code: pair.json().code, capability },
    })
    assert.equal(bound.statusCode, 200)
    assert.equal(bound.json().result, 'bound')
    const hostHeaders = { authorization: `Bearer ${capability}` }
    const hello = await off.inject({
      method: 'POST',
      url: '/api/v1/owner-host/hello',
      headers: hostHeaders,
      payload: {
        v: 1,
        journalId: randomUUID(),
        environmentRef: 'fixture-env',
        adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
        profileId: 'fixture-profile',
        profileRevision: 1,
        accountKey: 'fixture-account',
        t3Namespace: 'client:fixture',
      },
    })
    assert.equal(hello.statusCode, 200)
    assert.equal(hello.json().result, 'ok')
    const poll = await off.inject({
      method: 'POST',
      url: '/api/v1/owner-host/poll',
      headers: hostHeaders,
      payload: { limit: 1, redeliverSeconds: 15 },
    })
    assert.equal(poll.statusCode, 200)
    assert.deepEqual(poll.json(), [])
    assert.equal((await off.inject({ url: '/api/v1/owner-hosts', headers })).statusCode, 200)
    const retired = await off.inject({
      method: 'POST',
      url: `/api/v1/owner-hosts/${bound.json().hostId}/retire`,
      headers,
    })
    assert.equal(retired.statusCode, 200)
    await expectReady(true)
  })
})

// Codex review 5911393845 (P1, app.ts): every maintained model-call wrapper sends a tracked_v1 reserve and refuses a
// reply without its binding, which only 0109 adds (research_call_ack, folded into the reply by research_call_reply).
// The research and runtime routes are served whatever the switches say, so /ready requires 0109 like 0105: on a
// database migrated through 0108, 0105 included, no switch makes this API ready. Codex review 5916589022 (P1, app.ts):
// a qualified research or review call also opts into observed facts (`facts: observed_v1`) and refuses a binding without
// `facts`, which only 0110's research_call_ack echoes; with the independent 0118 host prerequisite installed, through
// 0109 it is still not ready and adding 0110 restores readiness. No optional 0111-0117 requirement is added here.
// Removing either of 0110's own objects, in this database only, makes it not
// ready again. It runs before the 0043 walk: its own database installs 0070, which refuses a second installation in the
// cluster while another database holds one (0070's Q13 check), so it is made and dropped while the file's database is at
// 0042.
describe('readiness across 0109 and 0110', () => {
  const TRACKED_CALLS = '0109_research_call_evidence.sql'
  const OBSERVED_FACTS = '0110_research_call_observed_facts.sql'
  let trackedDir: string
  let trackedDb: TestDatabase
  let trackedPool: pg.Pool
  /** The API with its switches off (the default), then with each switch whose part this database already has. */
  let apis: Array<[string, FastifyInstance]>
  /** The migrations after 0108 this block has applied, so each test can run alone. */
  const trackedApplied = new Set<string>()

  before(async () => {
    // Every migration before 0109, exactly as written: the core through 0108, 0105 and the voice migrations included.
    trackedDir = mkdtempSync(join(tmpdir(), 'sophia-0108-'))
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < TRACKED_CALLS))
      copyFileSync(join(MIGRATIONS, file), join(trackedDir, file))
    trackedDb = await createTestDatabase(trackedDir)
    // Isolate0109/0110: the independent always-served host prerequisite is installed as written.
    await applyTracked(HOST_ADMISSION)
    trackedPool = createPool(trackedDb.apiUrl, { max: 2 })
    const verifyActor = createActorVerifier({
      issuer: 'https://synthetic.supabase.test/auth/v1',
      audience: 'authenticated',
      secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
    })
    const base = { pool: trackedPool, verifyActor }
    apis = [
      ['switches off', buildApp(base)],
      ['API contributions on', buildApp({ ...base, apiContributions: true })],
      ['owner-runner admissions on', buildApp({ ...base, ownerRunnerAdmissions: 'admit' })],
      ['voice qualification on', buildApp({ ...base, voiceQualification: true })],
      [
        'conversations, inputs and a byte store on',
        buildApp({ ...base, conversations: true, conversationInputs: true, byteStore: memoryByteStore() }),
      ],
    ]
  })

  after(async () => {
    for (const [, api] of apis) await api.close()
    await trackedPool.end()
    await trackedDb.drop()
    rmSync(trackedDir, { recursive: true, force: true })
  })

  /** Run one statement as this block's database owner, on a client closed after. */
  async function asTrackedOwner(sql: string): Promise<void> {
    const owner = new pg.Client({ connectionString: trackedDb.ownerUrl })
    await owner.connect()
    try {
      await owner.query(sql)
    } finally {
      await owner.end()
    }
  }

  /** Apply one migration after 0108 as written, once. */
  async function applyTracked(file: string): Promise<void> {
    if (trackedApplied.has(file)) return
    trackedApplied.add(file)
    await asTrackedOwner(readFileSync(join(MIGRATIONS, file), 'utf8'))
  }

  /** Every API answers /ready as expected, and /health stays alive. */
  async function expectEvery(expected: 'ready' | 'schema', label: string): Promise<void> {
    const want = expected === 'ready' ? [200, { ready: true }] : [503, { ready: false, reason: 'schema' }]
    for (const [name, api] of apis) {
      assert.deepEqual(await answers(api, '/ready'), want, `${name}, ${label}`)
      assert.deepEqual(await answers(api, '/health'), [200, { ok: true, commit: null }], `${name}: alive, ${label}`)
    }
  }

  it('is not ready through 0108 with 0105, nor through 0109, whatever the switches; with the host prerequisite installed, ready once 0110 is applied', async () => {
    assert.ok(readdirSync(trackedDir).includes('0105_contribution_atomic_admission.sql'), 'migrated with 0105')
    assert.ok(readdirSync(trackedDir).includes('0108_owner_runner_model_reports.sql'), 'migrated through 0108')
    assert.ok(!readdirSync(trackedDir).includes(TRACKED_CALLS), 'without 0109')
    await expectEvery('schema', 'without 0109')
    await applyTracked(TRACKED_CALLS)
    await expectEvery('schema', 'with 0109, without 0110')
    await applyTracked(OBSERVED_FACTS)
    await expectEvery('ready', 'with 0109 and 0110')
  })

  it('is not ready once either object of 0110 is removed from its own database; ready again once restored', async () => {
    await applyTracked(TRACKED_CALLS)
    await applyTracked(OBSERVED_FACTS)
    await expectEvery('ready', 'with 0110')
    const column = 'ALTER TABLE sophia.research_call_identities RENAME COLUMN'
    await asTrackedOwner(`${column} facts_version TO facts_version_removed`)
    await expectEvery('schema', 'without the facts_version column')
    await asTrackedOwner(`${column} facts_version_removed TO facts_version`)
    await expectEvery('ready', 'with the column restored')
    const fn = 'ALTER FUNCTION sophia.research_call_facts_version'
    await asTrackedOwner(`${fn}(jsonb) RENAME TO research_call_facts_version_removed`)
    await expectEvery('schema', 'without research_call_facts_version')
    await asTrackedOwner(`${fn}_removed(jsonb) RENAME TO research_call_facts_version`)
    await expectEvery('ready', 'with the function restored')
  })
})

// C4/C5 W1 (INC04-R07, 0114): an API built with the default-off capacityExposure switch serves the preview's restrictive
// exposure, which reads 0114's custody; so /ready requires 0114's own objects only with the switch on. Off, the default,
// a database short of 0114 stays ready (never a core requirement). Each of 0114's two markers, removed in this block's
// own database only, makes the switched API not ready and leaves the default one ready; the core 0110 check still holds
// with 0114 installed. Like the block above, its database (it installs 0070) is made and dropped before the 0043 walk.
describe('readiness across 0114 (the capacityExposure switch)', () => {
  const EXPOSURE = '0114_capacity_exposure_custody.sql'
  let exposureDir: string
  let exposureDb: TestDatabase
  let exposurePool: pg.Pool
  let off: FastifyInstance
  let on: FastifyInstance

  before(async () => {
    // Every migration before 0114, exactly as written: 0105, 0109, 0110, 0111 and 0112 included.
    exposureDir = mkdtempSync(join(tmpdir(), 'sophia-0113-'))
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < EXPOSURE))
      copyFileSync(join(MIGRATIONS, file), join(exposureDir, file))
    exposureDb = await createTestDatabase(exposureDir)
    //0118 needs only0093's existing host table; it does not install optional0114.
    await asExposureOwner(readFileSync(join(MIGRATIONS, HOST_ADMISSION), 'utf8'))
    exposurePool = createPool(exposureDb.apiUrl, { max: 2 })
    const verifyActor = createActorVerifier({
      issuer: 'https://synthetic.supabase.test/auth/v1',
      audience: 'authenticated',
      secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
    })
    off = buildApp({ pool: exposurePool, verifyActor })
    on = buildApp({ pool: exposurePool, verifyActor, capacityExposure: true })
  })

  after(async () => {
    await off.close()
    await on.close()
    await exposurePool.end()
    await exposureDb.drop()
    rmSync(exposureDir, { recursive: true, force: true })
  })

  async function asExposureOwner(sql: string): Promise<void> {
    const owner = new pg.Client({ connectionString: exposureDb.ownerUrl })
    await owner.connect()
    try {
      await owner.query(sql)
    } finally {
      await owner.end()
    }
  }

  const READY = [200, { ready: true }]
  const SCHEMA = [503, { ready: false, reason: 'schema' }]
  async function expect(offWant: unknown[], onWant: unknown[], label: string): Promise<void> {
    assert.deepEqual(await answers(off, '/ready'), offWant, `switch off, ${label}`)
    assert.deepEqual(await answers(on, '/ready'), onWant, `switch on, ${label}`)
    for (const api of [off, on]) assert.deepEqual(await answers(api, '/health'), [200, { ok: true, commit: null }])
  }

  it('off is ready without 0114 and on is not; both are ready once 0114 is applied; each marker is required on', async () => {
    assert.ok(readdirSync(exposureDir).includes('0112_research_runtime_reconciliation.sql'), 'migrated through 0112')
    assert.ok(!readdirSync(exposureDir).includes(EXPOSURE), 'without 0114')
    await expect(READY, SCHEMA, 'without 0114')
    await asExposureOwner(readFileSync(join(MIGRATIONS, EXPOSURE), 'utf8'))
    await expect(READY, READY, 'with 0114')
    const fn = 'ALTER FUNCTION sophia.selection_capacity_exposure_0114'
    await asExposureOwner(`${fn}() RENAME TO selection_capacity_exposure_0114_removed`)
    await expect(READY, SCHEMA, 'without the 0114 marker')
    await asExposureOwner(`${fn}_removed() RENAME TO selection_capacity_exposure_0114`)
    await expect(READY, READY, 'with the marker restored')
    const table = 'ALTER TABLE sophia.capacity_window_registrations'
    await asExposureOwner(`${table} RENAME TO capacity_window_registrations_removed`)
    await expect(READY, SCHEMA, 'without the window registrations')
    await asExposureOwner(
      `ALTER TABLE sophia.capacity_window_registrations_removed RENAME TO capacity_window_registrations`,
    )
    await expect(READY, READY, 'with the table restored')
  })

  it('keeps the core 0110 requirement for both, with 0114 installed', async () => {
    const fn = 'ALTER FUNCTION sophia.research_call_facts_version'
    await asExposureOwner(`${fn}(jsonb) RENAME TO research_call_facts_version_removed`)
    try {
      await expect(SCHEMA, SCHEMA, 'without research_call_facts_version')
    } finally {
      await asExposureOwner(`${fn}_removed(jsonb) RENAME TO research_call_facts_version`)
    }
  })
})

// INC04-R07 C2 bound output (A59, 0115; coherent-010): an API built with the default-off boundOutput switch serves the
// nine bound steps, which call 0115's public wrappers; so /ready requires all nine (and this login's EXECUTE on each) only
// with the switch on. Off, the default, a database short of 0115 stays ready (never a core requirement). Each wrapper,
// removed in this block's own database only, makes the switched API not ready and leaves the default one ready, and so
// does a revoked EXECUTE. Like the blocks above, its database is made and dropped before the 0043 walk.
describe('readiness across 0115 (the boundOutput switch)', () => {
  const BOUND = '0115_runtime_bound_output.sql'
  const WRAPPERS = ['apply', 'claim', 'outcome'].flatMap((step) =>
    ['', '_design', '_review'].map((op) => `runtime_bound_output_${step}${op}`),
  )
  let boundDir: string
  let boundDb: TestDatabase
  let boundPool: pg.Pool
  let off: FastifyInstance
  let on: FastifyInstance

  before(async () => {
    // Every migration before 0115, exactly as written: 0113 and 0114 included.
    boundDir = mkdtempSync(join(tmpdir(), 'sophia-0114-'))
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && f < BOUND))
      copyFileSync(join(MIGRATIONS, file), join(boundDir, file))
    boundDb = await createTestDatabase(boundDir)
    // Keep the independent host prerequisite valid without installing optional0115.
    await asBoundOwner(readFileSync(join(MIGRATIONS, HOST_ADMISSION), 'utf8'))
    boundPool = createPool(boundDb.apiUrl, { max: 2 })
    const verifyActor = createActorVerifier({
      issuer: 'https://synthetic.supabase.test/auth/v1',
      audience: 'authenticated',
      secret: 'synthetic-test-secret-at-least-32-bytes-long!!',
    })
    off = buildApp({ pool: boundPool, verifyActor })
    on = buildApp({ pool: boundPool, verifyActor, boundOutput: true })
  })

  after(async () => {
    await off.close()
    await on.close()
    await boundPool.end()
    await boundDb.drop()
    rmSync(boundDir, { recursive: true, force: true })
  })

  async function asBoundOwner(sql: string): Promise<void> {
    const owner = new pg.Client({ connectionString: boundDb.ownerUrl })
    await owner.connect()
    try {
      await owner.query(sql)
    } finally {
      await owner.end()
    }
  }

  const READY = [200, { ready: true }]
  const SCHEMA = [503, { ready: false, reason: 'schema' }]
  async function expect(offWant: unknown[], onWant: unknown[], label: string): Promise<void> {
    assert.deepEqual(await answers(off, '/ready'), offWant, `switch off, ${label}`)
    assert.deepEqual(await answers(on, '/ready'), onWant, `switch on, ${label}`)
    for (const api of [off, on]) assert.deepEqual(await answers(api, '/health'), [200, { ok: true, commit: null }])
  }

  it('off is ready without 0115 and on is not; both are ready once 0115 is applied; each of the nine is required on', async () => {
    assert.ok(readdirSync(boundDir).includes('0114_capacity_exposure_custody.sql'), 'migrated through 0114')
    assert.ok(!readdirSync(boundDir).includes(BOUND), 'without 0115')
    await expect(READY, SCHEMA, 'without 0115')
    await asBoundOwner(readFileSync(join(MIGRATIONS, BOUND), 'utf8'))
    await expect(READY, READY, 'with 0115')
    assert.equal(WRAPPERS.length, 9)
    for (const name of WRAPPERS) {
      const fn = `ALTER FUNCTION sophia.${name}`
      await asBoundOwner(`${fn}(bytea,text,text,jsonb) RENAME TO ${name}_removed`)
      await expect(READY, SCHEMA, `without ${name}`)
      await asBoundOwner(`ALTER FUNCTION sophia.${name}_removed(bytea,text,text,jsonb) RENAME TO ${name}`)
      await expect(READY, READY, `with ${name} restored`)
    }
  })

  it('on requires the API login to execute each wrapper; the core 0110 requirement holds for both', async () => {
    const wrapper = 'sophia.runtime_bound_output_claim_review(bytea,text,text,jsonb)'
    await asBoundOwner(`REVOKE EXECUTE ON FUNCTION ${wrapper} FROM sophia_api`)
    try {
      await expect(READY, SCHEMA, 'without EXECUTE on one wrapper')
    } finally {
      await asBoundOwner(`GRANT EXECUTE ON FUNCTION ${wrapper} TO sophia_api`)
    }
    await expect(READY, READY, 'with EXECUTE restored')
    const fn = 'ALTER FUNCTION sophia.research_call_facts_version'
    await asBoundOwner(`${fn}(jsonb) RENAME TO research_call_facts_version_removed`)
    try {
      await expect(SCHEMA, SCHEMA, 'without research_call_facts_version')
    } finally {
      await asBoundOwner(`${fn}_removed(jsonb) RENAME TO research_call_facts_version`)
    }
  })
})

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
    await through(NEEDS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0065')
    // A space that exists at rollout starts its seen mark at its person's own last turn; one with no turn of theirs, 0.
    const [talked, quiet] = [randomUUID(), randomUUID()]
    await asOwner(async (c) => {
      await c.query(`INSERT INTO sophia.personal_spaces(owner_id, turn_seq) VALUES ($1, 4), ($2, 1)`, [talked, quiet])
      const turn = (owner: string, seq: number, author: string, replyTo: string | null) =>
        c.query(
          `INSERT INTO sophia.personal_turns(owner_id,id,seq,author,body,reply_to,reply,asked_at)
           VALUES ($1,$2,$3,$4,'words',$5,$6,$7)`,
          author === 'person'
            ? [owner, replyTo ?? randomUUID(), seq, 'person', null, 'answered', new Date()]
            : [owner, randomUUID(), seq, 'sophia', replyTo, null, null],
        )
      const asked = randomUUID()
      await turn(talked, 1, 'person', asked)
      await turn(talked, 2, 'sophia', asked)
      await turn(talked, 3, 'person', null)
      await turn(talked, 4, 'sophia', null)
      await turn(quiet, 1, 'sophia', null)
    })
    await migrate(NEEDS)
    const marks = await asOwner(
      async (c) =>
        (
          await c.query<{ owner_id: string; last_seen_turn_seq: string }>(
            `SELECT owner_id, last_seen_turn_seq FROM sophia.personal_spaces WHERE owner_id = ANY($1)`,
            [[talked, quiet]],
          )
        ).rows,
    )
    assert.deepEqual(
      Object.fromEntries(marks.map((r) => [r.owner_id, Number(r.last_seen_turn_seq)])),
      { [talked]: 3, [quiet]: 0 },
      'the seen mark at rollout',
    )
    await through(UPDATES)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0066')
    await migrate(UPDATES)
    await through(MESSAGE_ACTS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0068')
    await migrate(MESSAGE_ACTS)
    await through(MENTIONS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0069')
    await migrate(MENTIONS)
    await through(SEARCH)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0072')
    await migrate(SEARCH)
    await through(TASKS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0074')
    await migrate(TASKS)
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
    // Everything else current, but 0069's list_needs(boolean) not yet repaired by 0076 (4308526636): not ready.
    await through(MENTION_VISIBILITY)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0076')
    await migrate(MENTION_VISIBILITY)
    // G7 (A45, A46): every API claims each voice tool call's key (0086) and orders the bridge's presence reports
    // (0088); one with voice qualification on also calls 0085's functions and 0087's numbering. 0086 and 0088 need
    // nothing of 0085, so they are applied first here, to show what each API requires.
    await through(VOICE)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0086 and 0088')
    await migrate(KEYS)
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0088')
    await migrate(PRESENCE)
    // Every API reads a report's cited project text through 0090 (getCitedReportText), which needs nothing of 0085.
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'without 0090')
    await migrate(CITED_TEXT)
    // Everything the earlier source required is here; this source also requires the atomic admission (0105) as core.
    assert.deepEqual(
      await ready(),
      [503, { ready: false, reason: 'schema' }],
      'without 0105, the core atomic admission',
    )
    assert.deepEqual(await ready(voiced), [503, { ready: false, reason: 'schema' }], 'voice on, without 0105')
    await atomicCore()
    assert.ok(!applied.has(VOICE) && !applied.has(NUMBERING), 'the core, without 0085 or 0087')
    assert.deepEqual(await ready(), [200, { ready: true }], 'voice qualification off: needs nothing of 0085 or 0087')
    assert.deepEqual(await ready(voiced), [503, { ready: false, reason: 'schema' }], 'voice on, without 0085')
    await migrate(VOICE)
    assert.deepEqual(await ready(voiced), [503, { ready: false, reason: 'schema' }], 'voice on, without 0087')
    await migrate(NUMBERING)
    assert.deepEqual(await ready(voiced), [200, { ready: true }], 'voice on, with 0085 and 0087')
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
