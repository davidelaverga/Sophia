// S1-05A through real HTTP (level: sql-run): the runtime routes (A04) authenticate a runtime capability and
// nothing else, the member routes (A05) record discussion and admit one draft_brief, and a waiting command poll
// wakes when the worker dispatches. Synthetic HS256 tokens stand in for Supabase Auth.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseContributionReceipt,
  parseNativeTaskDetail,
  parseNativeTaskReceipt,
  parseSnapshot,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  type RegisteredRuntime,
  type SeededProject,
  type TestDatabase,
} from '@sophia/test-support'
import { dispatchOnce } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID()
const E = randomUUID()
const V = randomUUID()

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool
let app: FastifyInstance
let base: string
let seed: SeededProject
let rt: RegisteredRuntime

async function token(sub: string, anonymous = false): Promise<string> {
  return new SignJWT({ role: 'authenticated', ...(anonymous ? { is_anonymous: true } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
}

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any

async function call(
  path: string,
  init: { method?: string; bearer?: string; body?: unknown; headers?: Record<string, string> },
) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

const bridgeHeaders = (bridge: string, unit = rt.runtimeUnitId) => ({
  'x-sophia-runtime-unit': unit,
  'x-sophia-bridge-instance': bridge,
  'x-sophia-bridge-protocol': '1',
})

const hello = (bearer: string, bridge: string, unit?: string) =>
  call('/v1/runtime/hello', {
    method: 'POST',
    bearer,
    headers: bridgeHeaders(bridge, unit),
    body: { bundle: '@sophia/dsh-bundle@test', protocolVersion: 1, dshVersion: '0.1.7-rc.1' },
  })

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  seed = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  rt = await registerRuntime(db.ownerUrl, { projectId: seed.projectId, admin: A })
})
after(async () => {
  await app.close()
  await pool.end()
  await worker.end()
  await db.drop()
})

describe('runtime route authentication (A04)', () => {
  it('takes a runtime capability on the runtime routes only, and refuses member tokens there', async () => {
    assert.equal((await hello('', randomUUID())).status, 401, 'no capability')
    const member = await hello(await token(A), randomUUID())
    assert.equal(member.status, 401, 'a member JWT is not a runtime capability')
    assert.equal(member.json.code, 'runtime_capability_required')
    assert.equal((await hello(rt.token, randomUUID(), 'another-unit')).status, 403, 'another runtime unit')
    const onMemberRoute = await call(`/api/v1/projects/${seed.projectId}/snapshot`, { bearer: rt.token })
    assert.equal(onMemberRoute.status, 401, 'a runtime capability is not a member token')
    const ok = await hello(rt.token, randomUUID())
    assert.equal(ok.status, 200)
    assert.deepEqual(Object.keys(ok.json).toSorted(), ['authorityEpoch', 'bindings', 'cursor', 'leaseId', 'projectId'])
  })

  it('fences a superseded lease and refuses a runtime route that forgets the transport headers', async () => {
    const first = randomUUID()
    await hello(rt.token, first)
    await hello(rt.token, randomUUID())
    const stale = await call('/v1/runtime/commands?after=0&waitMs=0', {
      bearer: rt.token,
      headers: bridgeHeaders(first),
    })
    assert.equal(stale.status, 409)
    const bare = await call('/v1/runtime/commands?after=0&waitMs=0', { bearer: rt.token })
    assert.equal(bare.status, 422)
  })
})

describe('discussion and a draft_brief through the API (A05)', () => {
  it('records discussion, admits one brief idempotently, and wakes the waiting runtime poll on dispatch', async () => {
    const said = await call(`/api/v1/projects/${seed.projectId}/contributions`, {
      method: 'POST',
      bearer: await token(E),
      headers: { 'idempotency-key': randomUUID() },
      body: {
        source: null,
        text: 'Say what the room needs first.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      },
    })
    assert.equal(said.status, 202)
    const contribution = parseContributionReceipt(said.json)
    const key = randomUUID()
    const admit = async (actor: string) =>
      call(`/api/v1/projects/${seed.projectId}/native-tasks`, {
        method: 'POST',
        bearer: await token(actor),
        headers: { 'idempotency-key': key },
        body: {
          kind: 'draft_brief',
          instruction: 'Draft the brief.',
          contributionIds: [contribution.contributionId],
          expectedMissionRevision: 1,
        },
      })
    assert.equal((await admit(V)).status, 403, 'a viewer cannot admit work')
    const first = await admit(E)
    assert.equal(first.status, 202)
    const receipt = parseNativeTaskReceipt(first.json)
    assert.deepEqual((await admit(E)).json, first.json, 'a retry returns the same admission')

    const bridge = randomUUID()
    const opened = await hello(rt.token, bridge)
    const ready = await call('/v1/runtime/ready', {
      method: 'POST',
      bearer: rt.token,
      headers: bridgeHeaders(bridge),
      body: { state: 'ready', reason: null, unrecovered: [] },
    })
    assert.equal(ready.status, 204, 'nothing is dispatched to a runtime that has not reported ready')
    const waiting = call(`/v1/runtime/commands?after=${opened.json.cursor}&waitMs=10000`, {
      bearer: rt.token,
      headers: bridgeHeaders(bridge),
    })
    const started = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const pass = await dispatchOnce(worker, { workerId: 'api-test' })
    assert.deepEqual(
      pass.outcomes.map((o) => o.result),
      ['enqueued'],
    )
    const batch = await waiting
    assert.equal(batch.status, 200)
    assert.ok(Date.now() - started < 5000, 'the poll woke on the dispatch, not the timeout')
    assert.equal(batch.json.commands.length, 1)
    assert.equal(batch.json.commands[0].command.kind, 'create')
    assert.equal(batch.json.commands[0].command.binding.attemptId, receipt.attemptId)

    const detail = await call(`/api/v1/projects/${seed.projectId}/native-tasks/${receipt.taskId}`, {
      bearer: await token(V),
    })
    assert.equal(parseNativeTaskDetail(detail.json).task.phase, 'dispatched')
    const snap = parseSnapshot(
      (await call(`/api/v1/projects/${seed.projectId}/snapshot`, { bearer: await token(V) })).json,
    )
    assert.equal(snap.discussion.at(-1)?.text, 'Say what the room needs first.')
    const runtime = snap.resources.find((r) => r.harness === 'dsh')
    assert.deepEqual(
      [runtime?.hostState, runtime?.nativeState],
      ['online', 'running'],
      'its ready report reaches the room',
    )
  })

  it('keeps guests out of discussion and work', async () => {
    const guest = await token(randomUUID(), true)
    const said = await call(`/api/v1/projects/${seed.projectId}/contributions`, {
      method: 'POST',
      bearer: guest,
      headers: { 'idempotency-key': randomUUID() },
      body: { source: null, text: 'hello', threadId: null, artifactVersionId: null, intent: 'discuss' },
    })
    assert.equal(said.status, 403)
  })
})
