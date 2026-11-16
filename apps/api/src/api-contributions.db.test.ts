// Member API contributions through the API's real routes (contract amendment A48, migration 0094), level: sql-run on
// real PostgreSQL with synthetic JWTs. The actor is the token subject; authority is the database's. Every write goes
// through the actor-scoped idempotent entry. The route qualification and the contribution runtime are SYNTHETIC
// fixtures written by the migration owner: no key, account, provider or route is real or qualified here.
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeRole } from '@sophia/contracts'
import {
  admitResearchTask,
  classifyDbError,
  contributionWrite,
  createPool,
  recordRuntimeReady,
  runtimeHello,
  runtimeTokenHash,
  withActor,
  withService,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { startResearch } from './research-tools.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
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

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type Body = any
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
/** One request: `route` is `<METHOD> <path>`; a write carries an Idempotency-Key (fresh unless given). */
async function http(
  app: FastifyInstance,
  who: string | null,
  route: `${Method} ${string}`,
  body?: unknown,
  key?: string,
) {
  const space = route.indexOf(' ')
  const method = route.slice(0, space) as Method
  const url = route.slice(space + 1)
  const res = await app.inject({
    method,
    url,
    headers: {
      ...(who ? { authorization: `Bearer ${await token(who)}` } : {}),
      ...(method === 'GET' ? {} : { 'idempotency-key': key ?? randomUUID() }),
    },
    ...(body === undefined ? {} : { payload: body as object }),
  })
  const json: Body = res.body ? JSON.parse(res.body) : null
  return { status: res.statusCode, json }
}

const settings = (over: Record<string, unknown> = {}) => ({
  expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  taskCapUsd: 1,
  totalCapUsd: 5,
  fundingPolicy: 'bounded_total_spend',
  fundingAcknowledgementRef: 'synthetic acknowledgement: provider may draw on mixed funds',
  ...over,
})

const pgErr = (code: string, message: string) => Object.assign(new Error(message), { code })

const grantPath = (suffix: string) => (id: string) => `/api/v1/api-contribution-grants/${id}${suffix}`
/** Status and one field (or the error code) of each reply, for the diagnostics written before the assertions. */
const brief = (replies: { status: number; json: Body }[], field: string): unknown[] =>
  replies.map((r): unknown => [r.status, r.json === null ? null : (r.json[field] ?? r.json.code)])
interface At {
  who: string
  method: 'PATCH' | 'POST' | 'PUT' | 'DELETE'
  path: (id: string) => string
}

describe('member API contributions over HTTP (A48, 0094)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let app: FastifyInstance
  let off: FastifyInstance

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 8 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 3 })
    app = buildApp({ pool, verifyActor, apiContributions: true })
    off = buildApp({ pool, verifyActor })
    await app.ready()
    await off.ready()
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`,
    )
  })
  after(async () => {
    await app.close()
    await off.close()
    await pool.end()
    await owner.end()
    await db.drop()
  })

  const count = async (sql: string, args: unknown[]) => (await owner.query<{ n: number }>(sql, args)).rows[0]?.n ?? -1

  /** A project with an enabled research gate; an owner and a requester (editors), an admin, a viewer, an outsider. */
  async function world() {
    const [OWNER, REQ, ADMIN, VIEW, OUT] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const p = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [VIEW] })
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      p.projectId,
    ])
    return { ...p, OWNER, REQ, ADMIN, VIEW, OUT }
  }
  type World = Awaited<ReturnType<typeof world>>

  /** Owner records over HTTP; the operator registers the runtime (migration owner) and it connects (synthetic). */
  async function contributed(w: World) {
    const account = await http(app, w.OWNER, 'POST /api/v1/me/api-accounts', { label: 'My API', totalCapUsd: 10 })
    assert.equal(account.status, 201, JSON.stringify(account.json))
    const conn = await http(app, w.OWNER, 'POST /api/v1/me/api-connections', {
      accountId: account.json.accountId,
      label: 'Research key',
      custodianLabel: 'Operator host',
    })
    assert.equal(conn.status, 201)
    const grant = await http(app, w.OWNER, `POST /api/v1/me/api-connections/${conn.json.connectionId}/grants`, {
      projectId: w.projectId,
      settings: settings(),
    })
    assert.equal(grant.status, 201, JSON.stringify(grant.json))
    const runtimeToken = randomUUID() + randomUUID()
    await owner.query(`SELECT sophia.register_contribution_runtime($1, $2, 'sophia-runtime-test', $3, false)`, [
      w.projectId,
      conn.json.connectionId,
      createHash('sha256').update(runtimeToken, 'utf8').digest(),
    ])
    const who = {
      tokenSha256: runtimeTokenHash(runtimeToken),
      runtimeUnitId: 'sophia-runtime-test',
      bridgeInstanceId: randomUUID(),
    }
    await withService(pool, (c) =>
      runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }),
    )
    await withService(pool, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
    return {
      accountId: account.json.accountId as string,
      connectionId: conn.json.connectionId as string,
      grantId: grant.json.grantId as string,
    }
  }
  const grantRevision = async (grantId: string) =>
    Number(
      (
        await owner.query<{ r: string }>(`SELECT revision AS r FROM sophia.api_contribution_grants WHERE id=$1`, [
          grantId,
        ])
      ).rows[0]?.r,
    )

  it('is not served unless the API is built with it (default off), and refuses the anonymous', async () => {
    const w = await world()
    assert.equal((await http(off, w.OWNER, 'GET /api/v1/me/api-resources')).status, 404)
    assert.equal((await http(off, w.OWNER, 'POST /api/v1/me/api-accounts', { label: 'x', totalCapUsd: 1 })).status, 404)
    assert.equal((await http(off, w.REQ, `GET /api/v1/projects/${w.projectId}/api-contributions`)).status, 404)
    assert.equal((await http(app, null, 'GET /api/v1/me/api-resources')).status, 401)
    assert.equal((await http(app, null, 'POST /api/v1/me/api-accounts', { label: 'x', totalCapUsd: 1 })).status, 401)
  })

  it('refuses any field naming an owner, payer, credential, runtime or capability before the database', async () => {
    const w = await world()
    for (const [url, body] of [
      ['/api/v1/me/api-accounts', { label: 'x', totalCapUsd: 1, ownerId: w.REQ }],
      ['/api/v1/me/api-accounts', { label: 'x', totalCapUsd: 1, credentialRef: 'OPENAI_API_KEY' }],
      [
        '/api/v1/me/api-connections',
        { accountId: randomUUID(), label: 'x', custodianLabel: 'y', apiKey: 'sk-synthetic' },
      ],
      [
        '/api/v1/me/api-connections',
        { accountId: randomUUID(), label: 'x', custodianLabel: 'y', runtimeId: randomUUID() },
      ],
    ] as const) {
      const r = await http(app, w.OWNER, `POST ${url}`, body)
      assert.equal(r.status, 422, `${url} ${JSON.stringify(body)}: ${JSON.stringify(r.json)}`)
    }
    assert.equal(await count(`SELECT count(*)::int AS n FROM sophia.api_accounts WHERE owner_id=$1`, [w.OWNER]), 0)
  })

  it('replays a create for the same key and request, conflicts on another, and never duplicates under concurrency', async () => {
    const w = await world()
    const key = randomUUID()
    const body = { label: 'My API', totalCapUsd: 10 }
    const first = await http(app, w.OWNER, 'POST /api/v1/me/api-accounts', body, key)
    const again = await http(app, w.OWNER, 'POST /api/v1/me/api-accounts', body, key)
    assert.deepEqual([first.status, again.status], [201, 201])
    assert.deepEqual(again.json, first.json, 'the original receipt')
    const other = await http(app, w.OWNER, 'POST /api/v1/me/api-accounts', { ...body, totalCapUsd: 11 }, key)
    assert.deepEqual([other.status, other.json.code], [409, 'idempotency_conflict'])
    assert.equal(await count(`SELECT count(*)::int AS n FROM sophia.api_accounts WHERE owner_id=$1`, [w.OWNER]), 1)
    // Another actor's identical key is their own: no collision, no probe.
    const theirs = await http(app, w.REQ, 'POST /api/v1/me/api-accounts', body, key)
    assert.equal(theirs.status, 201)
    assert.notEqual(theirs.json.accountId, first.json.accountId)
    // Concurrent retries of one connection create: one connection, one receipt.
    const ckey = randomUUID()
    const cbody = { accountId: first.json.accountId, label: 'Research key', custodianLabel: 'Operator host' }
    const many = await Promise.all(
      [1, 2, 3, 4].map(() => http(app, w.OWNER, 'POST /api/v1/me/api-connections', cbody, ckey)),
    )
    assert.deepEqual(new Set(many.map((r) => r.status)), new Set([201]))
    assert.equal(new Set(many.map((r): string => String(r.json.connectionId))).size, 1)
    assert.equal(await count(`SELECT count(*)::int AS n FROM sophia.api_connections WHERE owner_id=$1`, [w.OWNER]), 1)
    // Concurrent retries of one grant create: one grant.
    const gkey = randomUUID()
    const gbody = { projectId: w.projectId, settings: settings() }
    const url = `/api/v1/me/api-connections/${many[0]?.json.connectionId}/grants`
    const grantsMade = await Promise.all([1, 2, 3].map(() => http(app, w.OWNER, `POST ${url}`, gbody, gkey)))
    assert.deepEqual(new Set(grantsMade.map((r) => r.status)), new Set([201]))
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM sophia.api_contribution_grants WHERE project_id=$1`, [w.projectId]),
      1,
    )
    // The ledger holds hashes and receipts only.
    const ledger = await owner.query(`SELECT * FROM sophia.api_contribution_requests WHERE actor_id=$1`, [w.OWNER])
    assert.ok(ledger.rows.length >= 3)
    assert.ok(!JSON.stringify(ledger.rows).includes('Operator host'), 'no request body is stored')
  })

  it('records nothing for a refused write, so its key stays free, and refuses a write without a key', async () => {
    const w = await world()
    const c = await contributed(w)
    const key = randomUUID()
    const route = `PATCH /api/v1/me/api-accounts/${c.accountId}` as const
    const refused = await http(app, w.OWNER, route, { expectedRevision: 9, patch: { label: 'Never' } }, key)
    assert.deepEqual([refused.status, refused.json.code], [409, 'stale_revision'])
    const recorded = `SELECT count(*)::int AS n FROM sophia.api_contribution_requests WHERE request_key=$1`
    assert.equal(await count(recorded, [key]), 0, 'the rollback took the ledger row with it')
    // The same key is now a first attempt: no replayed failure, no conflict with the refused request.
    const done = await http(app, w.OWNER, route, { expectedRevision: 1, patch: { label: 'Renamed' } }, key)
    assert.deepEqual([done.status, done.json.revision], [200, 2])
    assert.equal(await count(recorded, [key]), 1)
    // Without an Idempotency-Key nothing reaches the database.
    const keyless = await app.inject({
      method: 'PATCH',
      url: `/api/v1/me/api-accounts/${c.accountId}`,
      headers: { authorization: `Bearer ${await token(w.OWNER)}` },
      payload: { expectedRevision: 2, patch: { label: 'Keyless' } },
    })
    assert.deepEqual([keyless.statusCode, JSON.parse(keyless.body).code], [422, 'invalid_request'])
    const now = await owner.query(`SELECT revision::int AS revision, label FROM sophia.api_accounts WHERE id=$1`, [
      c.accountId,
    ])
    assert.deepEqual(now.rows[0], { revision: 2, label: 'Renamed' })
  })

  it('orders replay before revision: a retried edit returns its receipt, a new key at the old revision is stale', async () => {
    const w = await world()
    const c = await contributed(w)
    const key = randomUUID()
    const edit = { expectedRevision: 1, patch: { label: 'Renamed' } }
    const first = await http(app, w.OWNER, `PATCH /api/v1/me/api-accounts/${c.accountId}`, edit, key)
    assert.deepEqual([first.status, first.json.revision], [200, 2])
    const retried = await http(app, w.OWNER, `PATCH /api/v1/me/api-accounts/${c.accountId}`, edit, key)
    assert.deepEqual([retried.status, retried.json], [200, first.json])
    const stale = await http(app, w.OWNER, `PATCH /api/v1/me/api-accounts/${c.accountId}`, edit)
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
    // Grant state: revoke, replay the revoke, then a new revoke is final.
    const rev = await grantRevision(c.grantId)
    const rkey = randomUUID()
    const revoke = await http(
      app,
      w.OWNER,
      `POST /api/v1/api-contribution-grants/${c.grantId}/state`,
      { expectedRevision: rev, state: 'revoked' },
      rkey,
    )
    assert.deepEqual([revoke.status, revoke.json.state], [200, 'revoked'])
    const replay = await http(
      app,
      w.OWNER,
      `POST /api/v1/api-contribution-grants/${c.grantId}/state`,
      { expectedRevision: rev, state: 'revoked' },
      rkey,
    )
    assert.deepEqual([replay.status, replay.json], [200, revoke.json])
    const again = await http(app, w.OWNER, `POST /api/v1/api-contribution-grants/${c.grantId}/state`, {
      expectedRevision: rev + 1,
      state: 'enabled',
    })
    assert.equal(again.status, 409)
  })

  it('answers a foreign or missing record as forbidden, and shows each owner only their own records', async () => {
    const w = await world()
    const c = await contributed(w)
    for (const [route, body] of [
      [`PATCH /api/v1/me/api-accounts/${c.accountId}`, { expectedRevision: 1, patch: { label: 'x' } }],
      ['POST /api/v1/me/api-connections', { accountId: c.accountId, label: 'x', custodianLabel: 'y' }],
      [`POST /api/v1/me/api-connections/${c.connectionId}/state`, { expectedRevision: 1, state: 'paused' }],
      [`POST /api/v1/me/api-connections/${c.connectionId}/grants`, { projectId: w.projectId, settings: settings() }],
      [`POST /api/v1/api-contribution-grants/${c.grantId}/state`, { expectedRevision: 1, state: 'paused' }],
      [`PATCH /api/v1/api-contribution-grants/${c.grantId}`, { expectedRevision: 1, settings: { taskCapUsd: 0.5 } }],
      [`POST /api/v1/api-contribution-grants/${randomUUID()}/state`, { expectedRevision: 1, state: 'paused' }],
    ] as const) {
      const r = await http(app, w.REQ, route, body)
      assert.deepEqual([r.status, r.json.code], [403, 'forbidden'], route)
    }
    const theirs = await http(app, w.REQ, 'GET /api/v1/me/api-resources')
    assert.deepEqual([theirs.json.accounts, theirs.json.connections, theirs.json.grants], [[], [], []])
    const mine = await http(app, w.OWNER, 'GET /api/v1/me/api-resources')
    assert.equal(mine.json.connections[0].credentialRef, 'OPENAI_RESEARCH_API_KEY', 'a reference NAME, never a value')
    assert.equal(mine.json.accounts[0].providerBalance, 'unknown')
    assert.ok(!JSON.stringify(mine.json).toLowerCase().includes('sk-'), 'no key-shaped value')
  })

  it('shows project members only the safe whitelist, with permission apart from readiness, and no other project', async () => {
    const w = await world()
    const c = await contributed(w)
    const other = await world()
    const forReq = await http(app, w.REQ, `GET /api/v1/projects/${w.projectId}/api-contributions`)
    assert.equal(forReq.status, 200)
    const row = forReq.json.contributions[0]
    assert.deepEqual(Object.keys(row).toSorted(), [
      'activeSettlement',
      'adminDisabled',
      'concurrency',
      'effort',
      'eligibleForMe',
      'expiresAt',
      'fundingPolicy',
      'grantId',
      'label',
      'model',
      'output',
      'ownerId',
      'readiness',
      'revision',
      'route',
      'state',
      'taskCapUsd',
      'totalCapUsd',
    ])
    assert.equal(row.grantId, c.grantId)
    assert.deepEqual([row.eligibleForMe, row.readiness], [true, []])
    const forViewer = await http(app, w.VIEW, `GET /api/v1/projects/${w.projectId}/api-contributions`)
    assert.deepEqual(
      [forViewer.json.contributions[0].eligibleForMe, forViewer.json.contributions[0].readiness],
      [false, ['requester_ineligible']],
    )
    assert.equal((await http(app, w.OUT, `GET /api/v1/projects/${w.projectId}/api-contributions`)).status, 403)
    assert.deepEqual(
      (await http(app, other.ADMIN, `GET /api/v1/projects/${other.projectId}/api-contributions`)).json.contributions,
      [],
    )
    // Unqualified: permission stays, readiness says so.
    await owner.query(`UPDATE sophia.api_route_qualifications SET revoked_at=now() WHERE revoked_at IS NULL`)
    try {
      const unq = await http(app, w.REQ, `GET /api/v1/projects/${w.projectId}/api-contributions`)
      assert.deepEqual(
        [unq.json.contributions[0].eligibleForMe, unq.json.contributions[0].readiness],
        [true, ['route_unqualified']],
      )
    } finally {
      await owner.query(
        `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`,
      )
    }
  })

  it('pins through HTTP, funds a real admission by the contributor for model calls only, and clears without fallback', async () => {
    const w = await world()
    const c = await contributed(w)
    const pkey = randomUUID()
    const pinned = await http(
      app,
      w.REQ,
      `PUT /api/v1/projects/${w.projectId}/research-funding`,
      { grantId: c.grantId, expectedRevision: 1 },
      pkey,
    )
    assert.deepEqual(
      [pinned.status, pinned.json],
      [200, { projectId: w.projectId, grantId: c.grantId, grantRevision: 1 }],
    )
    const replay = await http(
      app,
      w.REQ,
      `PUT /api/v1/projects/${w.projectId}/research-funding`,
      { grantId: c.grantId, expectedRevision: 1 },
      pkey,
    )
    assert.deepEqual(replay.json, pinned.json)
    assert.equal(
      (
        await http(app, w.VIEW, `PUT /api/v1/projects/${w.projectId}/research-funding`, {
          grantId: c.grantId,
          expectedRevision: 1,
        })
      ).status,
      403,
    )
    const admitted = await withActor(pool, w.REQ, 'write', (cl) =>
      admitResearchTask(cl, w.projectId, {
        key: randomUUID(),
        exchangeId: randomUUID(),
        request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
        specialist: { role: MD.id, route: MD.route },
      }),
    )
    assert.ok('admitted' in admitted)
    const funding = await http(
      app,
      w.REQ,
      `GET /api/v1/projects/${w.projectId}/research-tasks/${admitted.admitted.taskId}/funding`,
    )
    assert.equal(funding.status, 200)
    assert.deepEqual(funding.json.payers, { model: 'contributor_api_account', search: 'project', read: 'project' })
    assert.deepEqual(
      [funding.json.grantId, funding.json.settings.accepted, funding.json.settings.observedEffort],
      [c.grantId, 'unknown', 'unknown'],
    )
    const cleared = await http(app, w.REQ, `DELETE /api/v1/projects/${w.projectId}/research-funding`)
    assert.deepEqual([cleared.status, cleared.json], [200, { projectId: w.projectId, grantId: null }])
    assert.equal(
      (await http(app, w.OUT, `GET /api/v1/projects/${w.projectId}/research-tasks/${admitted.admitted.taskId}/funding`))
        .status,
      403,
    )
  })

  it('says why a contribution cannot fund now (contribution_unavailable), paused or expired, and never falls back', async () => {
    const w = await world()
    const c = await contributed(w)
    const paused = await http(app, w.OWNER, `POST /api/v1/api-contribution-grants/${c.grantId}/state`, {
      expectedRevision: 1,
      state: 'paused',
    })
    assert.equal(paused.status, 200)
    const pin = await http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, {
      grantId: c.grantId,
      expectedRevision: 2,
    })
    assert.deepEqual(
      [pin.status, pin.json.code, pin.json.message, pin.json.retry],
      [409, 'contribution_unavailable', 'Contribution unavailable: grant_paused', 'never'],
    )
    await owner.query(
      `UPDATE sophia.api_contribution_grants SET state='enabled', expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
      [c.grantId],
    )
    const expired = await http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, {
      grantId: c.grantId,
      expectedRevision: await grantRevision(c.grantId),
    })
    assert.deepEqual([expired.status, expired.json.message], [409, 'Contribution unavailable: grant_expired'])
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM sophia.research_funding_pins WHERE project_id=$1`, [w.projectId]),
      0,
    )
  })

  it("lets an admin of the grant's own project narrow, disable and lift, never enlarge; nobody else", async () => {
    const w = await world()
    const c = await contributed(w)
    const base = `/api/v1/api-contribution-grants/${c.grantId}`
    const narrow = await http(app, w.ADMIN, `POST ${base}/admin-narrow`, {
      expectedRevision: 1,
      patch: { taskCapUsd: 0.5 },
    })
    assert.deepEqual([narrow.status, narrow.json.revision], [200, 2])
    const enlarge = await http(app, w.ADMIN, `POST ${base}/admin-narrow`, {
      expectedRevision: 2,
      patch: { totalCapUsd: 9 },
    })
    assert.deepEqual([enlarge.status, enlarge.json.code], [403, 'forbidden'], 'an admin may only narrow')
    assert.equal(await grantRevision(c.grantId), 2, 'nothing was enlarged')
    const disable = await http(app, w.ADMIN, `POST ${base}/admin-disable`, {
      expectedRevision: 2,
      reason: 'Team review',
    })
    assert.deepEqual([disable.status, disable.json.adminDisabled], [200, true])
    const lift = await http(app, w.ADMIN, `POST ${base}/admin-lift`, { expectedRevision: 3 })
    assert.deepEqual([lift.status, lift.json.adminDisabled], [200, false])
    for (const who of [w.REQ, w.OWNER, w.OUT]) {
      const r = await http(app, who, `POST ${base}/admin-disable`, { expectedRevision: 4, reason: 'x' })
      assert.equal(r.status, 403, who)
    }
    // An admin of another project is not an admin of this grant.
    const other = await world()
    assert.equal(
      (await http(app, other.ADMIN, `POST ${base}/admin-disable`, { expectedRevision: 4, reason: 'x' })).status,
      403,
    )
  })

  it('never answers a stored receipt to a caller who has since lost the authority', async () => {
    const w = await world()
    const c = await contributed(w)
    const pkey = randomUUID()
    const pinBody = { grantId: c.grantId, expectedRevision: 1 }
    assert.equal(
      (await http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, pinBody, pkey)).status,
      200,
    )
    const akey = randomUUID()
    const disableBody = { expectedRevision: 1, reason: 'Team review' }
    assert.equal(
      (await http(app, w.ADMIN, `POST /api/v1/api-contribution-grants/${c.grantId}/admin-disable`, disableBody, akey))
        .status,
      200,
    )
    await owner.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id IN ($2, $3)`, [
      w.projectId,
      w.REQ,
      w.ADMIN,
    ])
    const pinReplay = await http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, pinBody, pkey)
    assert.deepEqual([pinReplay.status, pinReplay.json.code], [403, 'forbidden'])
    const adminReplay = await http(
      app,
      w.ADMIN,
      `POST /api/v1/api-contribution-grants/${c.grantId}/admin-disable`,
      disableBody,
      akey,
    )
    assert.deepEqual([adminReplay.status, adminReplay.json.code], [403, 'forbidden'])
  })

  it('tells the research tool which contribution reason refused it, and that no other payer was used', async () => {
    const w = await world()
    const c = await contributed(w)
    const pin = { grantId: c.grantId, expectedRevision: 1 }
    assert.equal((await http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, pin)).status, 200)
    const pause = { expectedRevision: 1, state: 'paused' }
    assert.equal(
      (await http(app, w.OWNER, `POST /api/v1/api-contribution-grants/${c.grantId}/state`, pause)).status,
      200,
    )
    const out = await startResearch({
      pool,
      projectId: w.projectId,
      actorId: w.REQ,
      key: randomUUID(),
      call: {
        exchangeId: randomUUID(),
        connectionGeneration: 1,
        callId: 'r-1',
        name: 'start_research',
        args: {},
        inputEpoch: 1,
        actorId: w.REQ,
        guide: 'v1.2',
      },
      args: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
    })
    assert.equal(out.status, 'refused', JSON.stringify(out))
    const output = out.output as { code: string; reason: string }
    assert.equal(output.code, 'not_started:contribution_unavailable')
    assert.match(output.reason, /\(grant_paused\).*No other payer was used\./)
    assert.equal(
      await count(`SELECT count(*)::int AS n FROM sophia.jobs WHERE project_id=$1 AND kind='research'`, [w.projectId]),
      0,
    )
  })

  // r2 (API-S5B-F01): A48's `format: uuid` accepts the 8-4-4-4-12 hex form in any case, optionally prefixed
  // `urn:uuid:` (ajv-formats). Every accepted spelling names one record, and a retry that only respells an id replays.
  const spell = {
    upper: (id: string) => id.toUpperCase(),
    mixed: (id: string) =>
      id
        .split('')
        .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch))
        .join(''),
    urn: (id: string) => `urn:uuid:${id}`,
    URN: (id: string) => `URN:UUID:${id.toUpperCase()}`,
  }
  const rows = (table: string, column: string, id: string) =>
    count(`SELECT count(*)::int AS n FROM sophia.${table} WHERE ${column}=$1`, [id])

  it('names one account and project in every accepted spelling, and replays a respelled same-key retry', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const other = await http(app, w.OWNER, 'POST /api/v1/me/api-accounts', {
      label: 'Second',
      totalCapUsd: 3,
      separateOwnershipNote: 'synthetic: a separately owned account',
    })
    const key = randomUUID()
    const conn = (accountId: string, k = key) =>
      http(
        app,
        w.OWNER,
        'POST /api/v1/me/api-connections',
        { accountId, label: 'Same KEY', custodianLabel: 'Host A' },
        k,
      )
    // Every observation first, then the assertions.
    const first = await conn(spell.upper(c.accountId))
    const retries = [
      await conn(c.accountId),
      await conn(spell.mixed(c.accountId)),
      await conn(spell.urn(c.accountId)),
      await conn(spell.URN(c.accountId)),
    ]
    const changed = await conn(other.json.accountId)
    const ckey = randomUUID()
    const racing = await Promise.all(Object.values(spell).map((f) => conn(f(c.accountId), ckey)))
    const connections = await rows('api_connections', 'owner_id', w.OWNER)
    const gkey = randomUUID()
    const gs = settings({ eligible: 'listed' })
    const grant = (projectId: string, actor: string) =>
      http(
        app,
        w.OWNER,
        `POST /api/v1/me/api-connections/${first.json?.connectionId ?? c.connectionId}/grants`,
        { projectId, settings: { ...gs, eligibleActors: [actor] } },
        gkey,
      )
    const g1 = await grant(spell.upper(w.projectId), spell.mixed(w.REQ))
    const g2 = await grant(w.projectId, w.REQ)
    const g3 = await grant(spell.urn(w.projectId), spell.upper(w.REQ))
    const gChanged = await grant(w.projectId, w.ADMIN)
    const grants = await rows('api_contribution_grants', 'project_id', w.projectId)
    t.diagnostic(
      JSON.stringify({
        first: [first.status, first.json],
        retries: retries.map((r): unknown => [r.status, r.json]),
        other: [other.status, other.json],
        changed: [changed.status, changed.json],
        racing: racing.map((r): unknown => [r.status, r.json?.connectionId ?? r.json?.code]),
        connections,
        grants: [g1, g2, g3, gChanged].map((r): unknown => [r.status, r.json?.grantId ?? r.json?.code]),
        grantRows: grants,
      }),
    )
    assert.equal(first.status, 201, JSON.stringify(first.json))
    for (const r of retries) assert.deepEqual([r.status, r.json], [201, first.json])
    const text = await owner.query(`SELECT label, custodian_label AS c FROM sophia.api_connections WHERE id=$1`, [
      first.json.connectionId,
    ])
    assert.deepEqual(text.rows[0], { label: 'Same KEY', c: 'Host A' }, 'only ids are respelled, never text')
    // The account is this operation's target, and the ledger is scoped by target (r1): another account under the same
    // key is its own first request, never a replay of this one.
    assert.equal(other.status, 201, 'fixture: a second, separately owned account')
    assert.equal(changed.status, 201)
    assert.notEqual(changed.json.connectionId, first.json.connectionId)
    assert.deepEqual(new Set(racing.map((r) => r.status)), new Set([201]))
    assert.equal(new Set(racing.map((r) => String(r.json.connectionId))).size, 1)
    assert.equal(connections, 4, 'contributed, first, the other account and racing: no row per spelling')
    assert.equal(g1.status, 201, JSON.stringify(g1.json))
    assert.deepEqual([g2.status, g2.json], [201, g1.json])
    assert.deepEqual([g3.status, g3.json], [201, g1.json])
    assert.deepEqual([gChanged.status, gChanged.json.code], [409, 'idempotency_conflict'])
    assert.equal(grants, 2, 'contributed and this one')
    const stored = await owner.query(
      `SELECT eligible_actors::text[] AS a FROM sophia.api_contribution_grants WHERE id=$1`,
      [g1.json.grantId],
    )
    assert.deepEqual(stored.rows[0]?.a, [w.REQ])
  })

  it('pins one grant in every accepted spelling, and replays a respelled pin without a new pin', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const conn2 = await http(app, w.OWNER, 'POST /api/v1/me/api-connections', {
      accountId: c.accountId,
      label: 'Second key',
      custodianLabel: 'Operator host',
    })
    const second = await http(app, w.OWNER, `POST /api/v1/me/api-connections/${conn2.json.connectionId}/grants`, {
      projectId: w.projectId,
      settings: settings(),
    })
    assert.equal(second.status, 201, 'fixture: a second grant in the project')
    const key = randomUUID()
    const pin = (grantId: string) =>
      http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, { grantId, expectedRevision: 1 }, key)
    const pinned = async () =>
      (
        await owner.query<{ grant_id: string; set_at: Date }>(
          `SELECT grant_id, set_at FROM sophia.research_funding_pins WHERE project_id=$1`,
          [w.projectId],
        )
      ).rows
    const first = await pin(spell.upper(c.grantId))
    const pinBefore = await pinned()
    const again = [await pin(c.grantId), await pin(spell.mixed(c.grantId)), await pin(spell.URN(c.grantId))]
    const changed = await pin(String(second.json?.grantId))
    const pinAfter = await pinned()
    t.diagnostic(
      JSON.stringify({ first: [first.status, first.json], again: again.map((r): unknown => [r.status, r.json]) }),
    )
    t.diagnostic(JSON.stringify({ changed: [changed.status, changed.json?.code], pinBefore, pinAfter }))
    assert.equal(first.status, 200, JSON.stringify(first.json))
    for (const r of again) assert.deepEqual([r.status, r.json], [200, first.json])
    assert.deepEqual([changed.status, changed.json.code], [409, 'idempotency_conflict'])
    assert.equal(pinAfter.length, 1)
    assert.deepEqual(pinAfter, pinBefore, 'the same pin: same grant, same time')
    assert.equal(pinAfter[0]?.grant_id, c.grantId)
  })

  it('replays a respelled eligibleActors edit and narrow at their original revision, and conflicts on another actor', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const key = randomUUID()
    const edit = (actors: string[], expectedRevision = 1, k = key) =>
      http(
        app,
        w.OWNER,
        `PATCH /api/v1/api-contribution-grants/${c.grantId}`,
        { expectedRevision, settings: settings({ eligible: 'listed', eligibleActors: actors }) },
        k,
      )
    // One settings object per spelling, built once so only the ids differ.
    const fixed = settings({ eligible: 'listed' })
    const editFixed = (actors: string[]) =>
      http(
        app,
        w.OWNER,
        `PATCH /api/v1/api-contribution-grants/${c.grantId}`,
        { expectedRevision: 1, settings: { ...fixed, eligibleActors: actors } },
        key,
      )
    const first = await editFixed([w.REQ, w.ADMIN])
    const respelled = [
      await editFixed([spell.upper(w.REQ), spell.mixed(w.ADMIN)]),
      await editFixed([spell.urn(w.REQ), spell.URN(w.ADMIN)]),
    ]
    const otherActor = await editFixed([w.REQ, w.VIEW])
    const reordered = await editFixed([w.ADMIN, w.REQ])
    const revAfterEdit = await grantRevision(c.grantId)
    const nkey = randomUUID()
    const narrow = (actors: string[]) =>
      http(
        app,
        w.ADMIN,
        `POST /api/v1/api-contribution-grants/${c.grantId}/admin-narrow`,
        { expectedRevision: 2, patch: { eligible: 'listed', eligibleActors: actors } },
        nkey,
      )
    const n1 = await narrow([spell.upper(w.REQ)])
    const n2 = await narrow([w.REQ])
    const nOther = await narrow([w.ADMIN])
    const revAfterNarrow = await grantRevision(c.grantId)
    const stale = await edit([spell.upper(w.REQ)], 2, randomUUID())
    t.diagnostic(
      JSON.stringify({
        first: [first.status, first.json?.revision],
        respelled: respelled.map((r): unknown => [r.status, r.json?.revision ?? r.json?.code]),
        otherActor: [otherActor.status, otherActor.json?.code],
        reordered: [reordered.status, reordered.json?.code],
        revAfterEdit,
        narrow: [n1, n2, nOther].map((r): unknown => [r.status, r.json?.revision ?? r.json?.code]),
        revAfterNarrow,
        stale: [stale.status, stale.json?.code],
      }),
    )
    assert.deepEqual([first.status, first.json.revision], [200, 2])
    for (const r of respelled) assert.deepEqual([r.status, r.json], [200, first.json])
    assert.deepEqual([otherActor.status, otherActor.json.code], [409, 'idempotency_conflict'])
    assert.deepEqual([reordered.status, reordered.json.code], [409, 'idempotency_conflict'], 'order is not respelling')
    assert.equal(revAfterEdit, 2)
    assert.deepEqual([n1.status, n1.json.revision], [200, 3])
    assert.deepEqual([n2.status, n2.json], [200, n1.json])
    assert.deepEqual([nOther.status, nOther.json.code], [409, 'idempotency_conflict'])
    assert.equal(revAfterNarrow, 3)
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
  })

  it('keeps refusing malformed, foreign and missing ids and lost authority in any spelling, with no effect', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const theirs = await http(app, w.REQ, 'POST /api/v1/me/api-accounts', { label: 'Theirs', totalCapUsd: 2 })
    const conn = (who: string, accountId: string) =>
      http(app, who, 'POST /api/v1/me/api-connections', { accountId, label: 'x', custodianLabel: 'y' })
    const id = c.accountId
    const schemaRefused = await Promise.all(
      [`{${id}}`, id.replaceAll('-', ''), `${id} `, `urn:uuid:{${id}}`, `uuid:${id}`, `${id.slice(0, 35)}g`].map(
        (bad) => conn(w.OWNER, bad),
      ),
    )
    // Past the schema, the database itself refuses what PostgreSQL's own uuid input would accept but A48 does not.
    const direct: string[] = []
    for (const bad of [
      `{${id}}`,
      id.replaceAll('-', ''),
      spell.upper(`{${id}}`),
      `urn:uuid:${id.replaceAll('-', '')}`,
    ]) {
      direct.push(
        await withActor(pool, w.OWNER, 'write', (cl) =>
          contributionWrite(cl, 'connection_create', randomUUID(), { accountId: bad, label: 'x', custodianLabel: 'y' }),
        ).then(
          () => 'accepted',
          (err: unknown) => `${(err as { code?: string }).code}:${(err as Error).message}`,
        ),
      )
    }
    const foreign = [
      await conn(w.OWNER, spell.upper(theirs.json.accountId)),
      await conn(w.OWNER, spell.URN(randomUUID())),
    ]
    const pkey = randomUUID()
    const pinBody = { grantId: c.grantId, expectedRevision: 1 }
    const pin1 = await http(app, w.REQ, `PUT /api/v1/projects/${w.projectId}/research-funding`, pinBody, pkey)
    await owner.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [
      w.projectId,
      w.REQ,
    ])
    const lost = await http(
      app,
      w.REQ,
      `PUT /api/v1/projects/${w.projectId}/research-funding`,
      { ...pinBody, grantId: spell.upper(c.grantId) },
      pkey,
    )
    t.diagnostic(
      JSON.stringify({
        schemaRefused: schemaRefused.map((r): unknown => [r.status, r.json?.code]),
        direct,
        foreign: foreign.map((r): unknown => [r.status, r.json?.code]),
        pin1: pin1.status,
        lost: [lost.status, lost.json?.code],
      }),
    )
    for (const r of schemaRefused) assert.deepEqual([r.status, r.json.code], [422, 'invalid_request'])
    for (const d of direct) assert.equal(d, 'invalid_request:Invalid request: accountId is not an id')
    for (const r of foreign) assert.deepEqual([r.status, r.json.code], [403, 'forbidden'])
    assert.equal(await rows('api_connections', 'owner_id', w.OWNER), 1)
    assert.equal(pin1.status, 200)
    assert.deepEqual([lost.status, lost.json.code], [403, 'forbidden'])
    const account = await owner.query(`SELECT revision::int AS revision, label FROM sophia.api_accounts WHERE id=$1`, [
      c.accountId,
    ])
    assert.deepEqual(account.rows[0], { revision: 1, label: 'My API' })
  })

  // r3 (API-S5B-F01, paths): A48 declares every owned path id `format: uuid` too. Each accepted path spelling names the
  // same record for writes and reads alike, and a same-key retry in another path spelling replays.
  const variants = (id: string) => [id, spell.upper(id), spell.mixed(id), spell.urn(id), spell.URN(id)]

  it('names every write path id in every accepted spelling, replays a respelled same-key retry, keeps the body', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const seen: Record<string, unknown> = {}
    // Each write: one key, the first spelling writes, every other spelling replays the same receipt.
    const replayed = async (name: string, at: At, id: string, body?: unknown) => {
      const key = randomUUID()
      const [first, ...rest] = variants(id).toReversed()
      const r0 = await http(app, at.who, `${at.method} ${at.path(String(first))}`, body, key)
      const again = []
      for (const v of rest) again.push(await http(app, at.who, `${at.method} ${at.path(v)}`, body, key))
      seen[name] = [r0.status, r0.json, brief(again, 'revision')]
      return { r0, again, key }
    }
    const acc = await replayed(
      'account_update',
      { who: w.OWNER, method: 'PATCH', path: (id) => `/api/v1/me/api-accounts/${id}` },
      c.accountId,
      {
        expectedRevision: 1,
        patch: { label: 'Path KEY label' },
      },
    )
    // A path id is the operation's target: another account under the same key is its own first request (r2 scope).
    const second = await http(app, w.OWNER, 'POST /api/v1/me/api-accounts', {
      label: 'Second',
      totalCapUsd: 3,
      separateOwnershipNote: 'synthetic: a separately owned account',
    })
    const otherTarget = await http(
      app,
      w.OWNER,
      `PATCH /api/v1/me/api-accounts/${spell.URN(String(second.json?.accountId))}`,
      { expectedRevision: 1, patch: { label: 'Path KEY label' } },
      acc.key,
    )
    const conn = await http(app, w.OWNER, 'POST /api/v1/me/api-connections', {
      accountId: c.accountId,
      label: 'Fresh KEY',
      custodianLabel: 'Operator HOST',
    })
    const state = await replayed(
      'connection_state',
      { who: w.OWNER, method: 'POST', path: (id) => `/api/v1/me/api-connections/${id}/state` },
      conn.json.connectionId,
      {
        expectedRevision: 1,
        state: 'paused',
      },
    )
    const gs = settings({ eligible: 'listed', eligibleActors: [w.REQ, w.ADMIN] })
    const grant = await replayed(
      'grant_create',
      { who: w.OWNER, method: 'POST', path: (id) => `/api/v1/me/api-connections/${id}/grants` },
      conn.json.connectionId,
      {
        projectId: w.projectId,
        settings: gs,
      },
    )
    // The nil id stands in if the create was refused, so every observation is still recorded before the assertions.
    const g = String(grant.r0.json?.grantId ?? '00000000-0000-0000-0000-000000000000')
    const edit = await replayed('grant_update', { who: w.OWNER, method: 'PATCH', path: grantPath('') }, g, {
      expectedRevision: 1,
      settings: { ...gs, taskCapUsd: 0.75 },
    })
    const narrow = await replayed(
      'admin_narrow',
      { who: w.ADMIN, method: 'POST', path: grantPath('/admin-narrow') },
      g,
      {
        expectedRevision: 2,
        patch: { eligible: 'listed', eligibleActors: [w.REQ] },
      },
    )
    const disable = await replayed(
      'admin_disable',
      { who: w.ADMIN, method: 'POST', path: grantPath('/admin-disable') },
      g,
      { expectedRevision: 3, reason: 'Team REVIEW Note' },
    )
    // The reason as stored while disabled (lifting clears it).
    const reason = await owner.query<{ r: string }>(
      `SELECT admin_disabled_reason AS r FROM sophia.api_contribution_grants WHERE id=$1`,
      [g],
    )
    const lift = await replayed('admin_lift', { who: w.ADMIN, method: 'POST', path: grantPath('/admin-lift') }, g, {
      expectedRevision: 4,
    })
    const gstate = await replayed('grant_state', { who: w.OWNER, method: 'POST', path: grantPath('/state') }, g, {
      expectedRevision: 5,
      state: 'paused',
    })
    const counts = {
      accountRevision: await count(`SELECT revision::int AS n FROM sophia.api_accounts WHERE id=$1`, [c.accountId]),
      connectionRevision: await count(`SELECT revision::int AS n FROM sophia.api_connections WHERE id=$1`, [
        conn.json.connectionId,
      ]),
      grantRevision: await grantRevision(g),
      grants: await rows('api_contribution_grants', 'project_id', w.projectId),
      ledger: await count(`SELECT count(*)::int AS n FROM sophia.api_contribution_requests WHERE actor_id=ANY($1)`, [
        [w.OWNER, w.ADMIN],
      ]),
    }
    const stored = await owner.query(
      `SELECT a.label AS account, cn.label AS connection, cn.custodian_label AS custodian,
        g.eligible_actors::text[] AS actors, g.task_cap_usd::float8 AS cap
       FROM sophia.api_accounts a, sophia.api_connections cn, sophia.api_contribution_grants g
       WHERE a.id=$1 AND cn.id=$2 AND g.id=$3`,
      [c.accountId, conn.json.connectionId, g],
    )
    t.diagnostic(JSON.stringify({ seen, counts, stored: stored.rows[0], reason: reason.rows[0] }))
    for (const [r, status] of [
      [acc, 200],
      [state, 200],
      [grant, 201],
      [edit, 200],
      [narrow, 200],
      [disable, 200],
      [lift, 200],
      [gstate, 200],
    ] as const) {
      assert.equal(r.r0.status, status, JSON.stringify(r.r0.json))
      for (const a of r.again) assert.deepEqual([a.status, a.json], [status, r.r0.json])
    }
    assert.equal(second.status, 201, 'fixture: a second, separately owned account')
    assert.deepEqual(
      [otherTarget.status, otherTarget.json.accountId, otherTarget.json.revision],
      [200, second.json.accountId, 2],
    )
    assert.deepEqual(
      [acc.r0.json.revision, state.r0.json.revision, edit.r0.json.revision, narrow.r0.json.revision],
      [2, 2, 2, 3],
    )
    assert.deepEqual([disable.r0.json.revision, lift.r0.json.revision, gstate.r0.json.revision], [4, 5, 6])
    assert.deepEqual(counts, { accountRevision: 2, connectionRevision: 2, grantRevision: 6, grants: 2, ledger: 14 })
    assert.equal(reason.rows[0]?.r, 'Team REVIEW Note')
    assert.deepEqual(stored.rows[0], {
      account: 'Path KEY label',
      connection: 'Fresh KEY',
      custodian: 'Operator HOST',
      actors: [w.REQ],
      cap: 0.75,
    })
  })

  it('reads one project and task in every accepted path spelling, and pins and clears through any spelling', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const pkey = randomUUID()
    const pins = []
    for (const p of variants(w.projectId).toReversed())
      pins.push(
        await http(
          app,
          w.REQ,
          `PUT /api/v1/projects/${p}/research-funding`,
          { grantId: c.grantId, expectedRevision: 1 },
          pkey,
        ),
      )
    const admitted = await withActor(pool, w.REQ, 'write', (cl) =>
      admitResearchTask(cl, w.projectId, {
        key: randomUUID(),
        exchangeId: randomUUID(),
        request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
        specialist: { role: MD.id, route: MD.route },
      }),
    )
    assert.ok('admitted' in admitted)
    const taskId = admitted.admitted.taskId
    const lists = []
    for (const p of variants(w.projectId))
      lists.push(await http(app, w.REQ, `GET /api/v1/projects/${p}/api-contributions`))
    const fundings = []
    for (const [p, tk] of variants(w.projectId).map((pv, i): [string, string] => [pv, variants(taskId)[(i + 2) % 5]!]))
      fundings.push(await http(app, w.REQ, `GET /api/v1/projects/${p}/research-tasks/${tk}/funding`))
    const mine = await http(app, w.OWNER, 'GET /api/v1/me/api-resources')
    const ckey = randomUUID()
    const clears = []
    for (const p of [spell.URN(w.projectId), spell.mixed(w.projectId), w.projectId])
      clears.push(await http(app, w.REQ, `DELETE /api/v1/projects/${p}/research-funding`, undefined, ckey))
    const outsider = await http(app, w.OUT, `GET /api/v1/projects/${spell.URN(w.projectId)}/api-contributions`)
    const missing = await http(app, w.REQ, `GET /api/v1/projects/${spell.urn(randomUUID())}/api-contributions`)
    const otherTask = await http(
      app,
      w.OUT,
      `GET /api/v1/projects/${spell.upper(w.projectId)}/research-tasks/${spell.URN(taskId)}/funding`,
    )
    const pinRows = await rows('research_funding_pins', 'project_id', w.projectId)
    t.diagnostic(
      JSON.stringify({
        pins: brief(pins, 'grantId'),
        lists: brief(lists, 'contributions'),
        fundings: brief(fundings, 'grantId'),
        clears: brief(clears, 'grantId'),
        guards: brief([outsider, missing, otherTask], 'code'),
        pinRows,
      }),
    )
    assert.equal(pins[0]!.status, 200, JSON.stringify(pins[0]!.json))
    for (const r of pins) assert.deepEqual([r.status, r.json], [200, pins[0]!.json])
    assert.equal(pins[0]!.json.projectId, w.projectId)
    for (const r of lists) assert.deepEqual([r.status, r.json], [200, lists[0]!.json])
    assert.equal(lists[0]!.json.contributions[0].grantId, c.grantId)
    for (const r of fundings) assert.deepEqual([r.status, r.json], [200, fundings[0]!.json])
    assert.deepEqual([fundings[0]!.json.taskId, fundings[0]!.json.grantId], [taskId, c.grantId])
    assert.equal(mine.status, 200)
    for (const r of clears) assert.deepEqual([r.status, r.json], [200, clears[0]!.json])
    assert.equal(clears[0]!.json.grantId, null)
    assert.equal(pinRows, 0)
    for (const r of [outsider, missing, otherTask]) assert.deepEqual([r.status, r.json.code], [403, 'forbidden'])
  })

  it('keeps refusing invalid path syntax, foreign and missing ids, a lost role, stale edits and body hints', async (t) => {
    const w = await world()
    const c = await contributed(w)
    const id = c.accountId
    const bad = [
      `{${id}}`,
      id.replaceAll('-', ''),
      `urn:uuid:${id.replaceAll('-', '')}`,
      `uuid:${id}`,
      `${id}0`,
      `urn:${id}`,
      ` ${id}`,
    ]
    const syntax = []
    for (const b of bad) {
      const p = encodeURIComponent(b)
      syntax.push(
        await http(app, w.OWNER, `PATCH /api/v1/me/api-accounts/${p}`, { expectedRevision: 1, patch: { label: 'No' } }),
      )
      syntax.push(await http(app, w.REQ, `GET /api/v1/projects/${p}/api-contributions`))
      syntax.push(await http(app, w.REQ, `GET /api/v1/projects/${w.projectId}/research-tasks/${p}/funding`))
    }
    const foreign = await http(app, w.REQ, `PATCH /api/v1/me/api-accounts/${spell.URN(id)}`, {
      expectedRevision: 1,
      patch: { label: 'Mine' },
    })
    const missingGrant = await http(
      app,
      w.OWNER,
      `POST /api/v1/api-contribution-grants/${spell.upper(randomUUID())}/state`,
      {
        expectedRevision: 1,
        state: 'paused',
      },
    )
    const notAdmin = await http(
      app,
      w.REQ,
      `POST /api/v1/api-contribution-grants/${spell.urn(c.grantId)}/admin-disable`,
      {
        expectedRevision: 1,
        reason: 'x',
      },
    )
    const viewer = await http(app, w.VIEW, `PUT /api/v1/projects/${spell.URN(w.projectId)}/research-funding`, {
      grantId: c.grantId,
      expectedRevision: 1,
    })
    const stale = await http(app, w.OWNER, `PATCH /api/v1/api-contribution-grants/${spell.mixed(c.grantId)}`, {
      expectedRevision: 7,
      settings: settings(),
    })
    const hints = [
      await http(app, w.OWNER, `PATCH /api/v1/me/api-accounts/${spell.upper(id)}`, {
        expectedRevision: 1,
        patch: { label: 'x' },
        ownerId: w.REQ,
      }),
      await http(app, w.OWNER, `PATCH /api/v1/me/api-accounts/${spell.urn(id)}`, {
        expectedRevision: 1,
        patch: { label: 'x', credentialRef: 'K' },
      }),
      await http(app, w.REQ, `PUT /api/v1/projects/${spell.URN(w.projectId)}/research-funding`, {
        grantId: c.grantId,
        expectedRevision: 1,
        payerId: w.OWNER,
      }),
      await http(app, w.OWNER, `POST /api/v1/me/api-connections/${spell.upper(c.connectionId)}/grants`, {
        projectId: w.projectId,
        settings: settings(),
        requesterId: w.REQ,
      }),
    ]
    // The same key, a lost role, another spelling: no stored receipt answers.
    const pkey = randomUUID()
    const pin = await http(
      app,
      w.REQ,
      `PUT /api/v1/projects/${w.projectId}/research-funding`,
      { grantId: c.grantId, expectedRevision: 1 },
      pkey,
    )
    await owner.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [
      w.projectId,
      w.REQ,
    ])
    const lost = await http(
      app,
      w.REQ,
      `PUT /api/v1/projects/${spell.URN(w.projectId)}/research-funding`,
      { grantId: c.grantId, expectedRevision: 1 },
      pkey,
    )
    t.diagnostic(
      JSON.stringify({
        syntax: brief(syntax, 'code'),
        refused: brief([foreign, missingGrant, notAdmin, viewer, stale], 'code'),
        hints: brief(hints, 'code'),
        pin: pin.status,
        lost: brief([lost], 'code'),
      }),
    )
    for (const r of syntax) assert.deepEqual([r.status, r.json.code], [422, 'invalid_request'])
    for (const r of [foreign, missingGrant, notAdmin, viewer])
      assert.deepEqual([r.status, r.json.code], [403, 'forbidden'])
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
    for (const r of hints) assert.deepEqual([r.status, r.json.code], [422, 'invalid_request'])
    assert.equal(pin.status, 200)
    assert.deepEqual([lost.status, lost.json.code], [403, 'forbidden'])
    const account = await owner.query(`SELECT revision::int AS revision, label FROM sophia.api_accounts WHERE id=$1`, [
      id,
    ])
    assert.deepEqual(account.rows[0], { revision: 1, label: 'My API' })
    assert.equal(await grantRevision(c.grantId), 1)
  })

  it('maps only the owned contribution refusals and leaves every other database error as it was', () => {
    const cases: [string, string, string, string][] = [
      [
        '55000',
        'Contribution unavailable: grant_paused',
        'contribution_unavailable',
        'Contribution unavailable: grant_paused',
      ],
      [
        '42501',
        'Contribution not permitted: requester_ineligible',
        'forbidden',
        'Contribution not permitted: requester_ineligible',
      ],
      [
        '0A000',
        'Unsupported funding policy x: benefit-only use cannot be enforced or proven here; only bounded_total_spend',
        'invalid_request',
        '',
      ],
      [
        '0A000',
        'Only Markdown research on research-sol-medium-v1 (gpt-6.1-sol, medium) can be contributed',
        'invalid_request',
        '',
      ],
      ['0A000', 'feature not supported by something else', 'unavailable', 'Unexpected database error'],
      ['55000', 'No research runtime is ready for this project', 'native_capability_unavailable', ''],
      ['42501', 'Some other refusal', 'forbidden', 'Not permitted'],
    ]
    for (const [code, message, expected, publicMessage] of cases) {
      const e = classifyDbError(pgErr(code, message))
      assert.equal(e.code, expected, message)
      if (publicMessage) assert.equal(e.message, publicMessage, message)
    }
    assert.deepEqual([classifyDbError(pgErr('55000', 'Contribution unavailable: grant_paused')).status], [409])
  })
})

describe('on a database that never had 0094', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let app: FastifyInstance
  const dir = mkdtempSync(join(tmpdir(), 'sophia-no-0094-'))

  before(async () => {
    const migrations = resolve('db/migrations')
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0094')) {
      symlinkSync(join(migrations, f), join(dir, f))
    }
    db = await createTestDatabase(dir)
    pool = createPool(db.apiUrl, { max: 2 })
    app = buildApp({ pool, verifyActor, apiContributions: true })
    await app.ready()
  })
  after(async () => {
    await app.close()
    await pool.end()
    await db.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers projection_unavailable, never an empty list or a database message', async () => {
    const who = randomUUID()
    const read = await http(app, who, 'GET /api/v1/me/api-resources')
    assert.deepEqual(
      [read.status, read.json.code, read.json.message],
      [503, 'projection_unavailable', 'Member API contributions are not installed on this database'],
    )
    const write = await http(app, who, 'POST /api/v1/me/api-accounts', { label: 'x', totalCapUsd: 1 })
    assert.deepEqual([write.status, write.json.code], [503, 'projection_unavailable'])
  })
})
