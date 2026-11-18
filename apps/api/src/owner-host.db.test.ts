import { OwnerHostFixtureResources } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpHostChannel } from '@sophia/coordination/owner-host-http'
import { OwnerHostAgent } from '@sophia/coordination/owner-host-agent'
import { RunnerResultsController } from '../../worker/src/runner-results.ts'
import {
  resultWorld,
  admitResultOperation,
  requestResult,
  withResultResources,
  RESULT_TEXT,
} from '../../../packages/persistence/src/runner-results.db.test.ts'
import { withActor, readRunnerResult } from '@sophia/persistence'
// Real restricted API role and actual HTTP injection. All credentials/identities are synthetic in an owned cluster.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, test } from 'node:test'
import pg from 'pg'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { createPool, checkRoleSafety } from '@sophia/persistence'
import { buildApp } from './app.ts'
import type { FastifyInstance } from 'fastify'
const OWNER = randomUUID(),
  FOREIGN = randomUUID(),
  CONNECTION = randomUUID()
const CAP = 'a'.repeat(43),
  OTHER = 'b'.repeat(43)
let db: TestDatabase, api: pg.Pool, owner: pg.Pool, app: FastifyInstance
const logs: string[] = []
function application(enrollment: boolean) {
  return buildApp({
    pool: api,
    ownerHostEnrollment: enrollment,
    logger: {
      stream: {
        write: (line: string) => {
          logs.push(line)
        },
      },
    },
    verifyActor: (header) => {
      const id = header === 'Bearer synthetic-owner' ? OWNER : header === 'Bearer synthetic-foreign' ? FOREIGN : null
      if (!id) return Promise.reject(new DomainError('actor_context_required', 'Authentication required'))
      return Promise.resolve({ id, name: null, contact: null, anonymous: false })
    },
  })
}
const suiteResources = new OwnerHostFixtureResources()
before(async () =>
  suiteResources.setup(async () => {
    db = suiteResources.database(await createTestDatabase())
    api = suiteResources.pool(createPool(db.apiUrl))
    owner = suiteResources.pool(new pg.Pool({ connectionString: db.ownerUrl }))
    await checkRoleSafety(api)
    await owner.query(
      "INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES($1,$2,'synthetic-local-fixture','synthetic','linked')",
      [CONNECTION, OWNER],
    )
    app = suiteResources.app(application(true))
  }),
)

after(() => suiteResources.close())
const headers = { authorization: 'Bearer synthetic-owner' }
async function pairing(ttlSeconds = 60) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host-pairings',
    headers,
    payload: { connectionId: CONNECTION, ttlSeconds },
  })
  assert.equal(r.statusCode, 200)
  const v: unknown = r.json()
  assert.ok(
    v &&
      typeof v === 'object' &&
      'code' in v &&
      typeof v.code === 'string' &&
      'pairingId' in v &&
      typeof v.pairingId === 'string',
  )
  return { code: v.code, pairingId: v.pairingId }
}
async function redeem(code: string, capability = CAP) {
  return app.inject({ method: 'POST', url: '/api/v1/owner-host/redeem', payload: { code, capability } })
}
function hello(journalId: string) {
  return {
    v: 1,
    journalId,
    environmentRef: 'fixture-env',
    adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
    profileId: 'fixture-profile',
    profileRevision: 1,
    accountKey: 'fixture-account',
    t3Namespace: 'client:fixture',
  }
}
test('verified owner creates, foreign owner cannot pair or see the host; one use and same-key replay', async () => {
  const foreign = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host-pairings',
    headers: { authorization: 'Bearer synthetic-foreign' },
    payload: { connectionId: CONNECTION, ttlSeconds: 60 },
  })
  assert.ok([403, 422].includes(foreign.statusCode))
  const p = await pairing()
  const first = await redeem(p.code)
  assert.equal(first.statusCode, 200)
  assert.equal(first.json().result, 'bound')
  const replay = await redeem(p.code)
  assert.equal(replay.json().replayed, true)
  assert.equal(replay.json().hostId, first.json().hostId)
  assert.equal((await redeem(p.code, OTHER)).json().result, 'refused')
  const list = await app.inject({ url: '/api/v1/owner-hosts', headers: { authorization: 'Bearer synthetic-foreign' } })
  assert.deepEqual(list.json().hosts, [])
  const own = await app.inject({ url: '/api/v1/owner-hosts', headers })
  assert.equal(own.json().hosts.length, 1)
  for (const value of [p.code, CAP, OTHER]) assert.equal(own.body.includes(value), false)
})
test('capability hello binds once, conflicts distinctly, and rejected identities never reach JWT fallback', async () => {
  const p = await pairing()
  const r = await redeem(p.code, OTHER)
  assert.equal(r.json().result, 'bound')
  const h = hello(randomUUID()),
    hostHeaders = { authorization: `Bearer ${OTHER}` }
  const first = await app.inject({ method: 'POST', url: '/api/v1/owner-host/hello', headers: hostHeaders, payload: h })
  assert.equal(first.json().result, 'ok')
  const conflict = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host/hello',
    headers: hostHeaders,
    payload: { ...h, profileRevision: 2 },
  })
  assert.equal(conflict.json().result, 'conflict')
  assert.deepEqual(conflict.json().changed, ['profileRevision'])
  const missing = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host/poll',
    payload: { limit: 1, redeliverSeconds: 15 },
  })
  assert.equal(missing.statusCode, 403)
  const foreign = await app.inject({
    method: 'POST',
    url: `/api/v1/owner-host/exchanges/${randomUUID()}/go`,
    headers: hostHeaders,
    payload: {},
  })
  assert.equal(foreign.statusCode, 403)
  assert.equal(foreign.json().code, 'owner_host_refused')
  const revoked = await app.inject({ method: 'POST', url: `/api/v1/owner-hosts/${r.json().hostId}/revoke`, headers })
  assert.equal(revoked.statusCode, 200)
  const refused = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host/poll',
    headers: hostHeaders,
    payload: { limit: 1, redeliverSeconds: 15 },
  })
  assert.equal(refused.statusCode, 403)
})
test('expiry, OFF enrollment, management, byte caps and error/log redaction', async () => {
  const p = await pairing()
  await owner.query(
    "UPDATE sophia.owner_host_pairings SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",
    [p.pairingId],
  )
  assert.equal((await redeem(p.code, 'd'.repeat(43))).json().result, 'refused')
  const offResources = new OwnerHostFixtureResources()
  await offResources.run(async () => {
    const off = offResources.app(application(false))
    const create = await off.inject({
      method: 'POST',
      url: '/api/v1/owner-host-pairings',
      headers,
      payload: { connectionId: CONNECTION, ttlSeconds: 60 },
    })
    assert.equal(create.statusCode, 403)
    const denied = await off.inject({
      method: 'POST',
      url: '/api/v1/owner-host/redeem',
      payload: { code: p.code, capability: CAP },
    })
    assert.equal(denied.statusCode, 403)
    const list = await off.inject({ url: '/api/v1/owner-hosts', headers })
    assert.equal(list.statusCode, 200)
    const revoke = await off.inject({
      method: 'POST',
      url: `/api/v1/owner-host-pairings/${p.pairingId}/revoke`,
      headers,
    })
    assert.equal(revoke.statusCode, 200)
    const oversized = await off.inject({
      method: 'POST',
      url: '/api/v1/owner-host/redeem',
      payload: { code: 'é'.repeat(32768), capability: CAP },
    })
    assert.equal(oversized.statusCode, 413)
    assert.equal(oversized.headers['cache-control'], 'no-store')
    assert.ok(oversized.body.length < 500)
  })
  for (const value of [p.code, CAP, OTHER]) assert.equal(logs.join('').includes(value), false)
})

// Full H answer crossing on accepted S: actual schema/auth -> final S channel -> stock metadata-only consume/redaction.

function injectionFetch(serverApp: FastifyInstance): typeof fetch {
  return async (input, init) => {
    assert.ok(typeof input === 'string')
    assert.ok(typeof init?.body === 'string')
    const reply = await serverApp.inject({
      method: 'POST',
      url: new URL(input).pathname,
      headers: Object.fromEntries(new Headers(init.headers)),
      payload: init.body,
    })
    return new Response(reply.body, { status: reply.statusCode, headers: { 'content-type': 'application/json' } })
  }
}
test('bound HTTP host collection preserves final S current-rights staging, one Source and raw answer redaction', async () =>
  withResultResources(async (resources) => {
    const w = await resultWorld(db)
    resources.add(() => w.close())
    const lines: string[] = []
    const served = buildApp({
      pool: w.api,
      ownerHostEnrollment: false,
      logger: {
        stream: {
          write: (line) => {
            lines.push(line)
          },
        },
      },
      verifyActor: () => Promise.reject(new DomainError('actor_context_required', 'Actor required')),
    })
    resources.add(() => served.close())
    const dir = mkdtempSync(join(tmpdir(), 'h-answer-'))
    resources.add(() => {
      rmSync(dir, { recursive: true, force: true })
      return Promise.resolve()
    })
    const capabilityFile = join(dir, 'capability')
    writeFileSync(capabilityFile, w.capability, { mode: 0o600 })
    const channel = new HttpHostChannel({
      origin: 'https://h-fixture.invalid',
      capabilityFile,
      fetch: injectionFetch(served),
    })
    const host = await w.owner.query<{ account_key: string }>(
      'SELECT account_key FROM sophia.owner_hosts WHERE journal_id=$1',
      [w.journal.id],
    )
    const accountKey = host.rows[0]?.account_key
    assert.ok(accountKey)
    const agent = new OwnerHostAgent({
      channel,
      gateway: w.gateway,
      journal: w.journal,
      pollLimit: 1,
      hello: {
        v: 1,
        journalId: w.journal.id,
        environmentRef: 'env-result',
        adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
        profileId: 'read-only-v1',
        profileRevision: 1,
        accountKey,
        t3Namespace: w.t3.namespace(),
      },
    })
    const controller = new RunnerResultsController(w.worker, { enabled: true })
    resources.add(() => controller.stop())
    const op = await admitResultOperation(w)
    await requestResult(w, op)
    controller.pass()
    let resultId: string | null = null
    for (let n = 0; n < 200 && !resultId; n++) {
      await agent.serveOnce()
      await new Promise((resolve) => setTimeout(resolve, 10))
      const rows = await w.owner.query<{ result_id: string | null }>(
        'SELECT result_id FROM sophia.owner_runner_collections WHERE operation_id=$1',
        [op.operationId],
      )
      resultId = rows.rows[0]?.result_id ?? null
      controller.pass()
    }
    assert.ok(resultId)
    const retained = await withActor(w.api, w.who, 'read', (c) => readRunnerResult(c, w.projectId, resultId))
    assert.equal(retained.text, RESULT_TEXT)
    const raw = await w.owner.query(
      "SELECT answer FROM sophia.owner_host_exchanges WHERE operation_id=$1 AND kind='collect'",
      [op.operationId],
    )
    assert.equal(raw.rows[0]?.answer, null)
    for (const value of [RESULT_TEXT, w.capability]) assert.equal(lines.join('').includes(value), false)
  }))
