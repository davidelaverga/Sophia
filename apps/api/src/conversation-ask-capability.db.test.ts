// 0089 through the real API (level: sql-run): the conversation list's Ask capability over HTTP, against the A33 wire
// validator, and /ready, which takes no traffic while the list could not read it. Real PostgreSQL, the API login, a
// synthetic grant, a runtime that is a hello and ready through the API login's functions, and the synthetic assembler
// login; no runtime process, model or provider.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import { parseConversationList } from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID() // admin, outside the cohort
const E = randomUUID() // editor in the cohort
const V = randomUUID() // viewer
const ROUTE = 'route-test'
const MIGRATION = new URL('../../../db/migrations/0089_conversation_ask_capability.sql', import.meta.url)

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Pool
let app: FastifyInstance
let base: string
let projectId: string

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 6)}@example.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

/** The list as `as` reads it over HTTP, checked against A33. */
async function list(as: string) {
  const res = await fetch(`${base}/api/v1/projects/${projectId}/conversations`, {
    headers: { authorization: `Bearer ${await token(as)}` },
  })
  assert.equal(res.status, 200)
  return parseConversationList(await res.json())
}

const ready = async (): Promise<unknown[]> => {
  const res = await app.inject({ method: 'GET', url: '/ready' })
  return [res.statusCode, res.json()]
}

before(async () => {
  db = await createTestDatabase(undefined, { assembler: true })
  pool = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, conversations: true })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  ;({ projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] }))
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con-ask-capability-api-test')", [projectId])
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId: 'sophia-runtime-test' })
  const hash = createHash('sha256').update(rt.token).digest()
  const bridge = randomUUID()
  const call = (op: string, body: unknown) =>
    pool.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
  await call('hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'synthetic' }],
  })
  await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
  await owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: ROUTE,
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: `con-ask-capability-api-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 100_000,
      totalTokenCap: 500_000,
      subjects: [E],
    },
  ])
})

after(async () => {
  await app.close()
  await Promise.all([pool.end(), owner.end()])
  await db.drop()
})

describe('the list’s Ask capability over HTTP (0089, A33)', () => {
  it('a cohort writer reads Sophia available; a viewer and a writer outside the cohort, the generic reason', async () => {
    assert.deepEqual((await list(E)).capability, {
      state: 'enabled',
      write: true,
      moderate: false,
      ask: 'available',
      askReason: null,
    })
    for (const as of [V, A]) {
      const c = (await list(as)).capability
      assert.deepEqual({ ask: c.ask, askReason: c.askReason }, { ask: 'unavailable', askReason: 'replies_not_enabled' })
    }
  })

  it('a grant disabled since: the next read says so, to its cohort alone', async () => {
    await owner.query('SELECT sophia.conversation_set_grant($1,$2)', [projectId, { state: 'disabled' }])
    try {
      const e = (await list(E)).capability
      assert.deepEqual({ ask: e.ask, askReason: e.askReason }, { ask: 'unavailable', askReason: 'grant_disabled' })
      const v = (await list(V)).capability
      assert.deepEqual({ ask: v.ask, askReason: v.askReason }, { ask: 'unavailable', askReason: 'replies_not_enabled' })
    } finally {
      await owner.query('SELECT sophia.conversation_set_grant($1,$2)', [projectId, { state: 'enabled' }])
    }
  })
})

describe('/ready with conversations on needs 0089, callable by this login', () => {
  it('ready with it; not ready (schema) without EXECUTE, or without the function; ready again once restored', async () => {
    assert.deepEqual(await ready(), [200, { ready: true }])
    await owner.query('REVOKE EXECUTE ON FUNCTION sophia.conversation_ask_capability(uuid) FROM sophia_api')
    assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'no EXECUTE')
    await owner.query('GRANT EXECUTE ON FUNCTION sophia.conversation_ask_capability(uuid) TO sophia_api')
    assert.deepEqual(await ready(), [200, { ready: true }])
    await owner.query('DROP FUNCTION sophia.conversation_ask_capability(uuid)')
    try {
      assert.deepEqual(await ready(), [503, { ready: false, reason: 'schema' }], 'no function')
      // A list read while it is missing fails; it never answers a default capability.
      const res = await fetch(`${base}/api/v1/projects/${projectId}/conversations`, {
        headers: { authorization: `Bearer ${await token(E)}` },
      })
      assert.ok(res.status >= 500, `status ${String(res.status)}`)
    } finally {
      await owner.query(readFileSync(MIGRATION, 'utf8'))
    }
    assert.deepEqual(await ready(), [200, { ready: true }])
  })
})
