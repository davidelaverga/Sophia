// INC04-S03a (0107): an API candidate's scoped capacity reading crossing the real selection preview, through buildApp
// with a verified token, the production API role and real PostgreSQL. Level: sql-run.
// * The genuine no-reading baseline and a fresh, complete, admitting reading select the owner's contribution; a fresh
//   exhausted window, a stale reading and a reading left unbound by a requalification do not. No reading fact (id,
//   window, unit, evidence) reaches the body or a log line, and opening previews writes nothing.
// * Membership is unchanged: a current viewer gets the uniform restricted view even when the new read helper raises (a
//   SYNTHETIC fault: it is never called for them), a nonmember 404, no token 401.
// * Installation: on a database migrated by the real migrator to just before 0107, the preview is 503 for every role,
//   never an empty or unobserved pool; once the same migrator applies the pending 0107, the same running app serves.
// Every account, grant, qualification, reading and token is SYNTHETIC; nothing here qualifies a real owner, account,
// route, provider or telemetry source, or passes an AC-04 case.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeRole } from '@sophia/contracts'
import { parseSelectionView } from '@sophia/contracts/validate'
import {
  createPool,
  migrate,
  recordCapacityObservation,
  recordRuntimeReady,
  runtimeHello,
  runtimeTokenHash,
  withActor,
  withService,
  type CapacityObservationInput,
  type RuntimeCaller,
} from '@sophia/persistence'
import {
  createEmptyDatabase,
  createTestDatabase,
  seedProject,
  withClusterMigrationLock,
  type EmptyDatabase,
  type TestDatabase,
} from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { SELECTION_PREVIEW_SCHEMA } from './routes/selection-preview.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
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
const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const RESTRICTED = {
  contract: 'inc04.selection.input.v1',
  policyVersion: 'inc04-s01-policy-v1',
  disclosure: 'restricted',
}
/** The tables a preview could touch: none may change. */
const LEDGERS = [
  'commands',
  'outbox',
  'project_events',
  'jobs',
  'research_allowances',
  'research_reservations',
  'api_contribution_tasks',
  'api_contribution_reservations',
  'api_contribution_claims',
  'capacity_observations',
]

const at = (ms: number) => new Date(Date.now() + ms).toISOString()
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
const previewUrl = (projectId: string) => `/api/v1/projects/${projectId}/selection-preview?operation=research`

async function preview(app: FastifyInstance, who: string | null, projectId: string) {
  const res = await app.inject({
    method: 'GET',
    url: previewUrl(projectId),
    headers: who ? { authorization: `Bearer ${await token(who)}` } : {},
  })
  return { status: res.statusCode, body: res.body, cache: res.headers['cache-control'] }
}
/** An evaluated (shared) view's outcome and the one candidate's limitation. */
function decided(r: { status: number; body: string }) {
  assert.equal(r.status, 200, r.body)
  const v = parseSelectionView(JSON.parse(r.body))
  assert.ok(v.disclosure === 'shared' && v.candidates, r.body)
  return { outcome: v.outcome, limitation: v.candidates[0]?.limitation }
}

/**
 * A project with an enabled research gate; an owner (editor) contributing one qualified, protected, runtime-ready API
 * grant; a viewer; and the operator's account and route qualifications. Built through the real 0094/0104 functions.
 */
async function contribution(ownerUrl: string, api: pg.Pool, owner: pg.Pool) {
  const [EDIT, VIEW] = [randomUUID(), randomUUID()]
  const { projectId } = await seedProject(ownerUrl, { admin: randomUUID(), editors: [EDIT], viewers: [VIEW] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const sql = <T>(text: string, params: unknown[]) =>
    withActor(api, EDIT, 'write', async (c) => (await c.query<{ r: T }>(text, params)).rows[0]!.r)
  const acc = await sql<{ accountId: string; revision: number }>(`SELECT sophia.api_account_create($1, $2) AS r`, [
    'My API',
    10,
  ])
  await sql(`SELECT sophia.api_account_update($1, $2, $3) AS r`, [
    acc.accountId,
    acc.revision,
    JSON.stringify({
      protection: { applicability: 'none_applicable', operations: ['research'], roles: ['sophia-research-md-v1'] },
    }),
  ])
  const conn = await sql<{ connectionId: string }>(`SELECT sophia.api_connection_create($1, $2, $3) AS r`, [
    acc.accountId,
    'Research key',
    'Operator host',
  ])
  const grant = await sql<{ grantId: string }>(`SELECT sophia.api_grant_create($1, $2, $3) AS r`, [
    conn.connectionId,
    projectId,
    JSON.stringify({
      expiresAt: at(30 * 86400_000),
      taskCapUsd: 1,
      totalCapUsd: 5,
      fundingPolicy: 'bounded_total_spend',
      fundingAcknowledgementRef: 'synthetic acknowledgement',
    }),
  ])
  const runtimeToken = randomUUID() + randomUUID()
  await owner.query(`SELECT sophia.register_contribution_runtime($1, $2, $3, $4, false)`, [
    projectId,
    conn.connectionId,
    'sophia-runtime-test',
    createHash('sha256').update(runtimeToken, 'utf8').digest(),
  ])
  const who: RuntimeCaller = {
    tokenSha256: runtimeTokenHash(runtimeToken),
    runtimeUnitId: 'sophia-runtime-test',
    bridgeInstanceId: randomUUID(),
  }
  await withService(api, (c) =>
    runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }),
  )
  await withService(api, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  const qualify = () =>
    owner.query(
      `SELECT sophia.qualify_api_account($1, '{research}', 'operator_verified_call', 'synthetic', now()-interval '1 minute', now()+interval '1 day')`,
      [conn.connectionId],
    )
  await qualify()
  return { projectId, EDIT, VIEW, connectionId: conn.connectionId, grantId: grant.grantId, qualify }
}
type Contribution = Awaited<ReturnType<typeof contribution>>

/** The operator records a SYNTHETIC reading under the connection's current qualifications, observed once both held. */
async function record(owner: pg.Pool, w: Contribution, over: Partial<CapacityObservationInput> = {}) {
  const { rows } = await owner.query<{ aq: string; rev: string; rq: string; since: string }>(
    `SELECT a.id AS aq, a.revision AS rev, r.id AS rq, to_char(greatest(a.observed_at, r.qualified_at) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS since FROM sophia.api_account_qualifications a, sophia.api_route_qualifications r
     WHERE a.connection_id=$1 AND a.revoked_at IS NULL AND r.revoked_at IS NULL AND r.expires_at>now()
     ORDER BY r.qualified_at DESC LIMIT 1`,
    [w.connectionId],
  )
  const q = rows[0]!
  return recordCapacityObservation(owner, {
    observationKey: `k-${randomUUID()}`,
    connectionId: w.connectionId,
    credentialRevision: 1,
    accountQualificationId: q.aq,
    accountQualificationRevision: Number(q.rev),
    routeQualificationId: q.rq,
    operation: 'research',
    verification: 'operator_verified_console',
    evidenceRef: 'SYNTHETIC evidence ref',
    sourceChannel: 'synthetic-console',
    windowSetRef: 'synthetic-limits',
    windowSetVersion: 'v1',
    coverage: 'complete',
    requiredWindowRefs: ['requests-per-day'],
    reflection: 'unknown',
    observedAt: q.since,
    freshUntil: at(600_000),
    windows: [
      {
        windowRef: 'requests-per-day',
        scope: 'account',
        unit: 'requests',
        value: 7,
        verdict: 'admits',
        applicability: 'known',
      },
    ],
    ...over,
  })
}

describe('scoped readings through the real preview (0107)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let app: FastifyInstance
  const lines: string[] = []

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 6 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic',now()+interval '1 day')`,
    )
    app = buildApp({ pool, verifyActor, logger: { stream: { write: (line: string) => lines.push(line) } } })
    await app.ready()
  })
  after(async () => {
    await app.close()
    await pool.end()
    await owner.end()
    await db.drop()
  })
  const counts = async () =>
    Promise.all(
      LEDGERS.map(async (t) =>
        Number((await owner.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.${t}`)).rows[0]?.n),
      ),
    )

  it('selects on the genuine baseline and a fresh admitting reading; a fresh exhausted window does not', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    assert.deepEqual(decided(await preview(app, w.EDIT, w.projectId)), { outcome: 'selected', limitation: 'eligible' })
    const admits = await record(owner, w)
    const from = lines.length
    const initial = await counts()
    const positive = await preview(app, w.EDIT, w.projectId)
    assert.equal(decided(positive).outcome, 'selected')
    assert.equal(positive.cache, 'no-store')
    await record(owner, w, {
      observedAt: at(-200),
      windows: [
        {
          windowRef: 'requests-per-day',
          scope: 'account',
          unit: 'requests',
          verdict: 'exhausted',
          applicability: 'known',
        },
      ],
    })
    const exhausted = await preview(app, w.EDIT, w.projectId)
    assert.notEqual(decided(exhausted).outcome, 'selected')
    assert.equal(decided(exhausted).limitation, 'unavailable_now')
    for (const text of [positive.body, exhausted.body, lines.slice(from).join('')])
      for (const secret of [admits.observationId, 'requests-per-day', 'SYNTHETIC evidence', 'synthetic-console'])
        assert.equal(text.includes(secret), false, secret)
    const after1 = await counts()
    assert.deepEqual(after1.slice(0, -1), initial.slice(0, -1), 'previews wrote nothing (one reading was recorded)')
  })

  it('leaves a stale or requalification-unbound reading unproven, and the viewer always restricted', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    await record(owner, w, { freshUntil: at(800) })
    assert.equal(decided(await preview(app, w.EDIT, w.projectId)).outcome, 'selected', 'the paired fresh positive')
    await wait(1_000)
    assert.notEqual(decided(await preview(app, w.EDIT, w.projectId)).outcome, 'selected', 'stale is unproven')
    const w2 = await contribution(db.ownerUrl, pool, owner)
    await record(owner, w2)
    const live = await owner.query<{ id: string }>(
      `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w2.connectionId],
    )
    await owner.query(`SELECT sophia.revoke_api_account_qualification($1, 'synthetic: requalify')`, [live.rows[0]!.id])
    await w2.qualify()
    assert.notEqual(
      decided(await preview(app, w2.EDIT, w2.projectId)).outcome,
      'selected',
      'an old reading is not current',
    )
    for (const x of [w, w2]) {
      const v = await preview(app, x.VIEW, x.projectId)
      assert.deepEqual([v.status, JSON.parse(v.body)], [200, RESTRICTED])
    }
  })

  it('keeps membership: a viewer is restricted even when the new read helper faults; nonmember 404; no token 401', async (t) => {
    const w = await contribution(db.ownerUrl, pool, owner)
    await record(owner, w)
    const helper =
      'sophia.selection_capacity_observation_at(sophia.api_contribution_grants,sophia.api_connections,timestamptz)'
    const original = (await owner.query<{ d: string }>(`SELECT pg_get_functiondef($1::regprocedure) AS d`, [helper]))
      .rows[0]!.d
    t.after(() => owner.query(original))
    // SYNTHETIC fault: the helper raises. The viewer never reaches it; the matched editor does.
    await owner.query(`CREATE OR REPLACE FUNCTION ${helper.replace(/\((.*)\)$/, '(gr sophia.api_contribution_grants, conn sophia.api_connections, p_now timestamptz)')}
      RETURNS jsonb LANGUAGE plpgsql STABLE AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC observation fault'; END $$`)
    const viewer = await preview(app, w.VIEW, w.projectId)
    assert.deepEqual([viewer.status, JSON.parse(viewer.body)], [200, RESTRICTED])
    const editor = await preview(app, w.EDIT, w.projectId)
    assert.equal(editor.status >= 500, true, `the editor meets the fault: ${editor.body}`)
    assert.equal(editor.body.includes('SYNTHETIC observation fault'), false, 'the database message never reaches HTTP')
    await owner.query(original)
    assert.equal(decided(await preview(app, w.EDIT, w.projectId)).outcome, 'selected', 'restored')
    assert.equal((await preview(app, randomUUID(), w.projectId)).status, 404)
    assert.equal((await preview(app, null, w.projectId)).status, 401)
  })
})

describe('installation: the real migrator before and after 0107', () => {
  let empty: EmptyDatabase
  let owner: pg.Pool
  let pool: pg.Pool
  let app: FastifyInstance
  const suffix = randomBytes(6).toString('hex')
  const login = `sophia_api_o_${suffix}`
  const dir = mkdtempSync(join(tmpdir(), 'sophia-before-0107-'))

  before(async () => {
    const migrations = resolve('db/migrations')
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0107'))
      symlinkSync(join(migrations, f), join(dir, f))
    empty = await createEmptyDatabase('sophia_o')
    await withClusterMigrationLock(() => migrate(empty.ownerUrl, dir))
    owner = new pg.Pool({ connectionString: empty.ownerUrl, max: 2 })
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic',now()+interval '1 day')`,
    )
    const password = randomBytes(12).toString('hex')
    await owner.query(
      `CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    )
    await owner.query(`GRANT sophia_api TO ${login}`)
    await owner.query(`GRANT CONNECT ON DATABASE ${new URL(empty.ownerUrl).pathname.slice(1)} TO ${login}`)
    const u = new URL(empty.ownerUrl)
    u.username = login
    u.password = password
    pool = createPool(u.toString(), { max: 4 })
    app = buildApp({ pool, verifyActor })
    await app.ready()
  })
  after(async () => {
    await app.close()
    await pool.end()
    await owner.query(`DROP OWNED BY ${login}; DROP ROLE ${login}`)
    await owner.end()
    await empty.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers 503 for every role without 0107, then serves from the same app once the migrator applies it', async () => {
    // The guard keeps every earlier part (0104, 0105, 0106) and adds 0107's own marker.
    for (const part of [
      'selection_snapshot(uuid,uuid[])',
      'api_contribution_claims',
      'selection_viewer_boundary_0106()',
      'selection_capacity_observations_0107()',
    ])
      assert.ok(SELECTION_PREVIEW_SCHEMA.includes(part), part)
    const w = await contribution(empty.ownerUrl, pool, owner)
    for (const who of [w.EDIT, w.VIEW]) {
      const r = await preview(app, who, w.projectId)
      assert.deepEqual([r.status, JSON.parse(r.body).code], [503, 'projection_unavailable'], r.body)
    }
    const report = await withClusterMigrationLock(() => migrate(empty.ownerUrl, resolve('db/migrations')))
    assert.deepEqual(
      report.rows.filter((r) => r.status !== 'already_applied').map((r) => [r.version, r.status]),
      [['0107', 'applied']],
    )
    assert.deepEqual(JSON.parse((await preview(app, w.VIEW, w.projectId)).body), RESTRICTED)
    assert.equal(
      decided(await preview(app, w.EDIT, w.projectId)).outcome,
      'selected',
      'the no-reading baseline after upgrade',
    )
  })
})
