// The native resource catalog over HTTP (A51, migration 0097): buildApp with a verified token, the production API role
// and real PostgreSQL. Served whatever new owner-runner work admits; 404 alike for a nonmember and a missing project;
// 503 projection_unavailable, never an empty list, on a database without 0097; ids as A51 declares them, read in one
// spelling. Fixtures are SYNTHETIC rows written by the migration owner, with private markers the API must never return.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { atomicAdmissionInstalled, createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const PRIVATE = /PRIVATE|SECRET|\/home|password|postgres|sophia\./

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })

async function get(app: FastifyInstance, who: string | null, url: string) {
  const res = await app.inject({
    method: 'GET',
    url,
    headers: who ? { authorization: `Bearer ${await token(who)}` } : {},
  })
  return { status: res.statusCode, body: res.body, cache: res.headers['cache-control'] }
}
const url = (projectId: string, query = '') => `/api/v1/projects/${projectId}/native-resources${query}`

describe('with 0097 installed', () => {
  let db: TestDatabase
  let api: pg.Pool
  let owner: pg.Pool
  let off: FastifyInstance
  let admit: FastifyInstance
  const [O, E, X] = [randomUUID(), randomUUID(), randomUUID()]
  let projectId = ''
  let resourceId = ''

  before(async () => {
    db = await createTestDatabase()
    api = createPool(db.apiUrl, { max: 4 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
    off = buildApp({ pool: api, verifyActor })
    admit = buildApp({ pool: api, verifyActor, ownerRunnerAdmissions: 'admit' })
    await off.ready()
    await admit.ready()
    projectId = (await seedProject(db.ownerUrl, { admin: O, editors: [E] })).projectId
    const conn = randomUUID()
    resourceId = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
       VALUES ($1, $2, 'synthetic', 'SECRET-subject', 'linked')`,
      [conn, O],
    )
    await owner.query(
      `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
       VALUES ($1, $2, $3, $4, 'codex-native', 'PRIVATE-label', '/home/PRIVATE', 'active')`,
      [projectId, resourceId, O, conn],
    )
  })
  after(async () => {
    await off.close()
    await admit.close()
    await api.end()
    await owner.end()
    await db.drop()
  })

  it('serves the owner and a teammate their views, no-store, with new owner-runner work off or on', async () => {
    for (const app of [off, admit]) {
      const mine = await get(app, O, url(projectId))
      assert.equal(mine.status, 200, mine.body)
      assert.equal(mine.cache, 'no-store')
      const page = JSON.parse(mine.body) as {
        resources: { id: string; mine: unknown; tool: string }[]
        complete: boolean
      }
      assert.equal(page.complete, true)
      assert.equal(page.resources[0]?.id, resourceId)
      assert.equal(page.resources[0]?.tool, 'codex')
      assert.notEqual(page.resources[0]?.mine, null)
      const theirs = await get(app, E, url(projectId))
      assert.equal(theirs.status, 200)
      assert.equal((JSON.parse(theirs.body) as { resources: { mine: unknown }[] }).resources[0]?.mine, null)
      for (const r of [mine, theirs]) assert.doesNotMatch(r.body, PRIVATE)
    }
  })

  it('serves the owner records with repeated operations and an infinity or year-9999 expiry, as the qualifier accepted them (r1)', async () => {
    const other = (await seedProject(db.ownerUrl, { admin: O, editors: [E] })).projectId
    const conn = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
       VALUES ($1, $2, 'synthetic', 'SECRET-subject', 'linked')`,
      [conn, O],
    )
    const recorded: [string, string[], string][] = [
      [randomUUID(), ['create', 'input', 'stop', 'stop'], 'infinity'],
      [randomUUID(), ['stop', 'stop'], '9999-12-31 00:00:00+00'],
    ]
    for (const [res, operations, expires] of recorded) {
      await owner.query(
        `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
         VALUES ($1, $2, $3, $4, 'claude-native', 'PRIVATE-label', '/home/PRIVATE', 'active')`,
        [other, res, O, conn],
      )
      await owner.query(
        `SELECT sophia.qualify_owner_runner($1, $2, 'ade473018d32003658b7d38693e083ee2e314bd8', 'env-owner-1',
           'project-sophia', 'read-only-v1', 1, 'gateway_enforced', 'acct-SECRET', $3::text[], 5, $4::timestamptz,
           'SECRET evidence')`,
        [other, res, operations, expires],
      )
    }
    const mine = await get(off, O, url(other))
    assert.equal(mine.status, 200, mine.body)
    type Read = {
      id: string
      mine: { recordedQualification: { state: string; operations: string[]; expiresAt: string | null } }
    }
    const read = new Map(
      (JSON.parse(mine.body) as { resources: Read[] }).resources.map((r) => [r.id, r.mine.recordedQualification]),
    )
    assert.deepEqual(
      recorded.map(([res]) => {
        const q = read.get(res)
        return [q?.state, q?.operations, q?.expiresAt?.slice(0, 11) ?? null]
      }),
      [
        ['current', ['create', 'input', 'stop'], null],
        ['current', ['stop'], '9999-12-31T'],
      ],
    )
    assert.doesNotMatch(mine.body, PRIVATE)
    const theirs = await get(off, E, url(other))
    assert.equal(theirs.status, 200)
    for (const r of (JSON.parse(theirs.body) as { resources: { mine: unknown }[] }).resources)
      assert.equal(r.mine, null)
  })

  it('answers 404 alike for a nonmember and a missing project, and 401 without a token', async () => {
    const outsider = await get(off, X, url(projectId))
    const missing = await get(off, O, url(randomUUID()))
    for (const r of [outsider, missing]) {
      assert.equal(r.status, 404)
      assert.equal((JSON.parse(r.body) as { code: string }).code, 'not_found')
      assert.doesNotMatch(r.body, PRIVATE)
    }
    assert.equal(
      (JSON.parse(outsider.body) as { message: string }).message,
      (JSON.parse(missing.body) as { message: string }).message,
    )
    assert.equal((await get(off, null, url(projectId))).status, 401)
  })

  it('reads ids as declared (any case, urn:uuid:) in one spelling, and refuses malformed ids, cursors and fields', async () => {
    const plain = JSON.parse((await get(off, O, url(projectId))).body) as { resources: unknown[] }
    for (const spelled of [projectId.toUpperCase(), `urn:uuid:${projectId}`, `URN:UUID:${projectId.toUpperCase()}`]) {
      const r = await get(off, O, url(spelled))
      assert.equal(r.status, 200, `${spelled}: ${r.body}`)
      assert.deepEqual((JSON.parse(r.body) as { resources: unknown[] }).resources, plain.resources)
    }
    const earlier = resourceId.replace(/.$/, '0')
    const cursor = await get(off, O, url(projectId, `?after=${earlier.toUpperCase()}`))
    assert.equal(cursor.status, 200, cursor.body)
    for (const bad of [
      url('not-a-uuid'),
      url(`${projectId}0`),
      url(projectId, '?after=nope'),
      url(projectId, '?after='),
      url(projectId, `?after=${projectId}&limit=5`),
    ]) {
      const r = await get(off, O, bad)
      assert.equal(r.status, 422, `${bad}: ${r.status} ${r.body}`)
      assert.doesNotMatch(r.body, PRIVATE)
    }
  })
})

describe('on a database that never had 0097', () => {
  let db: TestDatabase
  let api: pg.Pool
  let off: FastifyInstance
  const dir = mkdtempSync(join(tmpdir(), 'sophia-before-0097-'))
  const O = randomUUID()

  before(async () => {
    const migrations = resolve('db/migrations')
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0097')) {
      symlinkSync(join(migrations, f), join(dir, f))
    }
    db = await createTestDatabase(dir)
    api = createPool(db.apiUrl, { max: 2 })
    off = buildApp({ pool: api, verifyActor })
    await off.ready()
  })
  after(async () => {
    await off.close()
    await api.end()
    await db.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers projection_unavailable (503), never an empty list; /ready needs the core atomic admission (0105)', async () => {
    const projectId = (await seedProject(db.ownerUrl, { admin: O })).projectId
    const r = await get(off, O, url(projectId))
    assert.equal(r.status, 503)
    assert.equal((JSON.parse(r.body) as { code: string }).code, 'projection_unavailable')
    assert.doesNotMatch(r.body, PRIVATE)
    // INC04-S02a coherent: this database also lacks 0105, which every API requires whatever its switches say; that the
    // catalog is not a /ready dependency is shown below, on a database with the whole core.
    assert.equal(
      (await off.inject({ method: 'GET', url: '/ready' })).statusCode,
      503,
      'not ready without the core atomic admission (0105)',
    )
  })
})

// The catalog stays optional for readiness: a database with every migration, on which 0097's catalog function alone is
// hidden by a committed, reversible rename. A SYNTHETIC missing capability, never a real installation history: the
// function object, its ACL and its body are kept and restored, and the database is this suite's own. The catalog route
// remembers only a true installation check, so the app that reads during the hiding has never read before, and the
// restored read uses a fresh app.
describe('with the whole core installed and the 0097 catalog function SYNTHETICALLY hidden', () => {
  const CATALOG = 'project_native_resources(uuid,uuid)'
  const HIDDEN = 'project_native_resources__hidden_synthetic'
  let db: TestDatabase
  let api: pg.Pool
  let owner: pg.Pool
  const O = randomUUID()
  const opened: FastifyInstance[] = []
  const fresh = async () => {
    const app = buildApp({ pool: api, verifyActor })
    opened.push(app)
    await app.ready()
    return app
  }
  const identity = async (signature: string) =>
    (
      await owner.query<{ oid: string; acl: string | null; src: string; definer: boolean }>(
        `SELECT p.oid::text AS oid, p.proacl::text AS acl, p.prosrc AS src, p.prosecdef AS definer
           FROM pg_catalog.pg_proc p WHERE p.oid = to_regprocedure($1)`,
        [signature],
      )
    ).rows[0]

  before(async () => {
    db = await createTestDatabase()
    api = createPool(db.apiUrl, { max: 2 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 1 })
  })
  after(async () => {
    for (const a of opened) await a.close()
    await api.end()
    await owner.end()
    await db.drop()
  })

  it('answers the catalog projection_unavailable, never an empty list, while /ready stays 200; restored, it reads', async () => {
    const projectId = (await seedProject(db.ownerUrl, { admin: O })).projectId
    assert.equal(await atomicAdmissionInstalled(api), true, 'the core atomic admission is installed')
    const hiding = await fresh()
    const original = await identity(`sophia.${CATALOG}`)
    assert.ok(original)
    await owner.query(`ALTER FUNCTION sophia.${CATALOG} RENAME TO ${HIDDEN}`)
    try {
      assert.deepEqual(await identity(`sophia.${HIDDEN}(uuid,uuid)`), original, 'the same object, renamed')
      assert.equal(await atomicAdmissionInstalled(api), true, 'the core is untouched')
      const r = await get(hiding, O, url(projectId))
      assert.equal(r.status, 503, r.body)
      assert.equal((JSON.parse(r.body) as { code: string }).code, 'projection_unavailable')
      assert.doesNotMatch(r.body, PRIVATE)
      assert.equal((await hiding.inject({ method: 'GET', url: '/ready' })).statusCode, 200, 'the catalog is optional')
    } finally {
      await owner.query(`ALTER FUNCTION sophia.${HIDDEN}(uuid,uuid) RENAME TO project_native_resources`)
    }
    assert.deepEqual(await identity(`sophia.${CATALOG}`), original, 'restored: the same object, ACL and body')
    const restored = await fresh()
    const page = await get(restored, O, url(projectId))
    assert.equal(page.status, 200, page.body)
    assert.equal((JSON.parse(page.body) as { complete: boolean }).complete, true)
    assert.equal((await restored.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
  })
})

type R2Mine = {
  host: { lastSeenAt: string | null; secondsSinceSeen: number | null } | null
  recordedQualification: Record<string, unknown>
}
type R2Page = { observedAt: string; resources: { id: string; mine: R2Mine }[] }
const R2_UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00:00$/
const pick = (q: Record<string, unknown> | undefined, keys: string[]) => keys.map((key) => q?.[key])

/** What one zone's owner and teammate reads show, for comparison across zones (r2). */
function r2Summary(page: R2Page, theirs: { status: number; body: string }, ids: Record<string, string>) {
  const by = new Map(page.resources.map((r) => [r.id, r.mine]))
  const q = (name: string) => by.get(ids[name] ?? '')?.recordedQualification
  const host = by.get(ids.seen1900 ?? '')?.host
  const age = Math.floor((Date.parse(page.observedAt) - Date.parse('1900-01-01T00:00:00Z')) / 1000)
  return {
    theirs: [
      theirs.status,
      (JSON.parse(theirs.body) as { resources: { mine: unknown }[] }).resources.map((r) => r.mine),
    ],
    observedAt: R2_UTC_TIME.test(page.observedAt),
    qualified1900: pick(q('qualified1900'), ['state', 'qualifiedAt', 'expiresAt']),
    expired1900: pick(q('expired1900'), ['state', 'qualifiedAt', 'expiresAt']),
    qualifiedYear1: pick(q('qualifiedYear1'), ['state', 'qualifiedAt']),
    expiresYear9999: pick(q('expiresYear9999'), ['state', 'expiresAt']),
    seen1900: [host?.lastSeenAt, Math.abs((host?.secondsSinceSeen ?? -9) - age) <= 1],
  }
}

describe('full RFC 3339 times over HTTP, whatever the API session time zone (r2, CC006-R1-F01)', () => {
  const ZONES = ['UTC', 'Asia/Kathmandu', 'America/New_York', 'Pacific/Kiritimati']
  let db: TestDatabase
  let owner: pg.Pool
  const [O, E] = [randomUUID(), randomUUID()]
  let projectId = ''
  const ids: Record<string, string> = {}

  /** The production API role's pool, its sessions in `zone` (the connection's own options), and an app on it. */
  async function appIn(zone: string) {
    const u = new URL(db.apiUrl)
    u.searchParams.set('options', `-c TimeZone=${zone}`)
    const pool = createPool(u.toString(), { max: 2 })
    const { rows } = await pool.query<{ tz: string }>('SELECT current_setting($1) AS tz', ['TimeZone'])
    assert.equal(rows[0]?.tz, zone, 'the API session runs in the zone under test')
    const app = buildApp({ pool, verifyActor })
    await app.ready()
    return { app, pool }
  }

  before(async () => {
    db = await createTestDatabase()
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
    projectId = (await seedProject(db.ownerUrl, { admin: O, editors: [E] })).projectId
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
    const fixtures: [string, string, string | null, string | null][] = [
      // [name, expiry through the qualifier, qualification update, host last seen]
      ['qualified1900', 'infinity', `qualified_at = '1900-01-01T00:00:00Z'`, null],
      ['expired1900', tomorrow, `qualified_at = '-infinity', expires_at = '1900-01-01T00:00:00Z'`, null],
      ['qualifiedYear1', 'infinity', `qualified_at = '0001-01-01T00:00:00Z'`, null],
      ['expiresYear9999', '9999-12-31T20:00:00Z', null, null],
      ['seen1900', 'infinity', null, '1900-01-01T00:00:00Z'],
    ]
    for (const [name, expires, update, seen] of fixtures) {
      const conn = randomUUID()
      const res = randomUUID()
      ids[name] = res
      await owner.query(
        `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
         VALUES ($1, $2, 'synthetic', 'SECRET-subject', 'linked')`,
        [conn, O],
      )
      await owner.query(
        `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
         VALUES ($1, $2, $3, $4, 'claude-native', 'PRIVATE-label', '/home/PRIVATE', 'active')`,
        [projectId, res, O, conn],
      )
      await owner.query(
        `SELECT sophia.qualify_owner_runner($1, $2, 'ade473018d32003658b7d38693e083ee2e314bd8', 'env-owner-1',
           'project-sophia', 'read-only-v1', 1, 'gateway_enforced', 'acct-SECRET', ARRAY['stop'], 5, $3::timestamptz,
           'SECRET evidence')`,
        [projectId, res, expires],
      )
      if (update)
        await owner.query(`UPDATE sophia.owner_runner_qualifications SET ${update} WHERE resource_id = $1`, [res])
      if (seen) {
        const pairing = randomUUID()
        await owner.query(
          `INSERT INTO sophia.owner_host_pairings(id, owner_id, connection_id, code_sha256, expires_at)
           VALUES ($1, $2, $3, sha256(convert_to($4, 'UTF8')), now() + interval '5 minutes')`,
          [pairing, O, conn, `code-${pairing}`],
        )
        await owner.query(
          `INSERT INTO sophia.owner_hosts(owner_id, connection_id, pairing_id, capability_sha256, state, hello_ok,
             last_seen_at, environment_ref, account_key)
           VALUES ($1, $2, $3, sha256(gen_random_uuid()::text::bytea), 'active', true, $4, 'env-owner-SECRET', 'acct-SECRET')`,
          [O, conn, pairing, seen],
        )
      }
    }
  })
  after(async () => {
    await owner.end()
    await db.drop()
  })

  it('serves the owner the same exact UTC times in every zone, and a teammate no owner part', async () => {
    const seen: Record<string, unknown> = {}
    for (const zone of ZONES) {
      const { app, pool } = await appIn(zone)
      try {
        const mine = await get(app, O, url(projectId))
        const theirs = await get(app, E, url(projectId))
        assert.equal(mine.status, 200, `${zone}: ${mine.body}`)
        assert.doesNotMatch(mine.body, PRIVATE)
        seen[zone] = r2Summary(JSON.parse(mine.body) as R2Page, theirs, ids)
      } finally {
        await app.close()
        await pool.end()
      }
    }
    const expected = {
      theirs: [200, Object.keys(ids).map(() => null)],
      observedAt: true,
      qualified1900: ['current', '1900-01-01T00:00:00+00:00', null],
      expired1900: ['expired', null, '1900-01-01T00:00:00+00:00'],
      qualifiedYear1: ['current', '0001-01-01T00:00:00+00:00'],
      expiresYear9999: ['current', '9999-12-31T20:00:00+00:00'],
      seen1900: ['1900-01-01T00:00:00+00:00', true],
    }
    assert.deepEqual(seen, Object.fromEntries(ZONES.map((z) => [z, expected])))
  })
})
