import { OwnerHostFixtureResources } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
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
import { Socket } from 'node:net'
import type { TestContext } from 'node:test'
import { ownerHostFixtures, fixtureDeadline } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import { newSecret, secretDigest } from '@sophia/coordination/owner-host-channel'
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

async function partial(
  t: TestContext,
  origin: string,
  path = '/api/v1/owner-host/redeem',
  capability?: string,
  localAddress?: string,
) {
  const socket = new Socket()
  let wire = ''
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
  socket.on('error', () => undefined)
  socket.on('data', (b: Buffer) => {
    wire += b.toString()
    if (wire.length > 65_536) socket.destroy()
  })
  ownerHostFixtures(t).own('quota socket close', async () => {
    socket.destroy()
    await fixtureDeadline(closed)
  })
  await fixtureDeadline(
    new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.connect(
        { host: '127.0.0.1', port: Number(new URL(origin).port), ...(localAddress ? { localAddress } : {}) },
        () => {
          socket.write(
            `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\nConnection: close\r\n${capability ? `Authorization: Bearer ${capability}\r\n` : ''}\r\n{`,
            (err) => (err ? reject(err) : resolve()),
          )
        },
      )
    }),
  )
  return {
    socket,
    closed,
    status: () => Number(/^HTTP\/1\.1 (\d+)/.exec(wire)?.[1]),
    complete: (body: unknown) => socket.write(JSON.stringify(body).padEnd(1000).slice(1)),
  }
}
async function http(origin: string, path: string, method = 'GET', body?: unknown, credential = 'synthetic-owner') {
  const r = await fetch(origin + path, {
    method,
    headers: {
      authorization: `Bearer ${credential}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(3000),
  })
  const text = await r.text()
  assert.equal(r.headers.get('cache-control'), 'no-store')
  return { status: r.status, json: () => JSON.parse(text) as unknown }
}
test('HQUOTA restricted predicate exposes only boolean and preserves state and grants', async () => {
  await owner.query(readFileSync('db/tests/0118_owner_host_admission.sql', 'utf8'))
  const capability = newSecret(),
    p = await pairing(),
    redeemed = await redeem(p.code, capability)
  assert.equal(redeemed.statusCode, 200)
  const hostId = redeemed.json().hostId
  const hostBefore = await owner.query('SELECT state,last_seen_at,hello_ok FROM sophia.owner_hosts WHERE id=$1', [
    hostId,
  ])
  for (const state of ['bound', 'active', 'retired', 'revoked']) {
    await owner.query('UPDATE sophia.owner_hosts SET state=$2 WHERE id=$1', [hostId, state])
    const result = await api.query('SELECT sophia.owner_host_admission_allowed($1) AS allowed', [
      secretDigest(capability),
    ])
    assert.deepEqual(result.rows, [{ allowed: state !== 'revoked' }])
  }
  await owner.query("UPDATE sophia.owner_hosts SET state='bound' WHERE id=$1", [hostId])
  const hostAfter = await owner.query('SELECT state,last_seen_at,hello_ok FROM sophia.owner_hosts WHERE id=$1', [
    hostId,
  ])
  assert.deepEqual(hostAfter.rows, hostBefore.rows)
  assert.equal(
    (await api.query('SELECT sophia.owner_host_admission_allowed($1) AS allowed', [secretDigest(newSecret())])).rows[0]
      ?.allowed,
    false,
  )
  assert.equal(
    await withActor(
      api,
      OWNER,
      'read',
      async (c) =>
        (
          await c.query<{ allowed: boolean }>('SELECT sophia.owner_host_admission_allowed($1) AS allowed', [
            secretDigest(capability),
          ])
        ).rows[0]?.allowed,
    ),
    false,
  )
  assert.deepEqual((await api.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows, [
    { rolsuper: false, rolbypassrls: false },
  ])
})
test('HQUOTA unknown host is refused before partial body parsing', async (t) => {
  const served = ownerHostFixtures(t).app(application(false)),
    parsed = Promise.withResolvers<string>()
  served.addHook('preParsing', (_req, _reply, payload, done) => {
    parsed.resolve('body')
    done(null, payload)
  })
  const origin = await served.listen({ host: '127.0.0.1', port: 0 }),
    client = await partial(t, origin, '/api/v1/owner-host/poll', newSecret())
  const outcome = await fixtureDeadline(Promise.race([parsed.promise, client.closed.then(() => 'refused')]))
  assert.equal(outcome, 'refused', 'unknown capability must never acquire reserved host/body admission')
  assert.equal(client.status(), 403)
})
test('HQUOTA actual restricted HTTP management survives public saturation and reauthenticates after revoke', async (t) => {
  const served = ownerHostFixtures(t).app(application(false)),
    prechecked = Promise.withResolvers<void>(),
    fourBodies = Promise.withResolvers<void>()
  let publicBodies = 0
  served.addHook('preParsing', (req, _reply, payload, done) => {
    if (req.routeOptions.url === '/api/v1/owner-host/redeem') {
      publicBodies++
      if (publicBodies === 4) fourBodies.resolve()
    }
    if (req.routeOptions.url === '/api/v1/owner-host/poll') prechecked.resolve()
    done(null, payload)
  })
  const origin = await served.listen({ host: '127.0.0.1', port: 0 })
  const a = await partial(t, origin),
    b = await partial(t, origin),
    excess = await partial(t, origin)
  await fixtureDeadline(excess.closed)
  assert.equal(excess.status(), 503)
  assert.equal(publicBodies, 2)
  assert.equal(a.socket.destroyed || b.socket.destroyed, false)
  const list = await http(origin, '/api/v1/owner-hosts')
  assert.equal(list.status, 200)
  assert.ok(list.json() && typeof list.json() === 'object')
  const capability = newSecret(),
    p = await pairing(),
    bound = await redeem(p.code, capability),
    hostId = bound.json().hostId
  assert.equal(bound.statusCode, 200)
  assert.equal((await http(origin, '/api/v1/owner-host/hello', 'POST', hello(randomUUID()), capability)).status, 200)
  assert.equal(
    (await http(origin, `/api/v1/owner-host/exchanges/${randomUUID()}/go`, 'POST', {}, capability)).status,
    403,
  )
  assert.equal(
    (
      await http(
        origin,
        `/api/v1/owner-host/exchanges/${randomUUID()}/answer`,
        'POST',
        { kind: 'unknown', reason: 'fixture' },
        capability,
      )
    ).status,
    403,
  )
  assert.equal((await http(origin, `/api/v1/owner-hosts/${hostId}/retire`, 'POST')).status, 200)
  const waiting = await partial(t, origin, '/api/v1/owner-host/poll', capability)
  await fixtureDeadline(prechecked.promise)
  // The predicate's connection/host read is over: owner revocation can complete while the body remains partial.
  assert.equal((await http(origin, `/api/v1/owner-hosts/${hostId}/revoke`, 'POST')).status, 200)
  waiting.complete({ limit: 1, redeliverSeconds: 15 })
  await fixtureDeadline(waiting.closed)
  assert.equal(waiting.status(), 403, 'handler must reauthenticate current revocation after admission success')
  assert.equal((await http(origin, `/api/v1/owner-host-pairings/${p.pairingId}/revoke`, 'POST')).status, 200)
  try {
    const alternate = await partial(t, origin, '/api/v1/owner-host/redeem', undefined, '127.0.0.2')
    const alternate2 = await partial(t, origin, '/api/v1/owner-host/redeem', undefined, '127.0.0.2')
    await fixtureDeadline(fourBodies.promise)
    assert.equal(publicBodies, 4)
    assert.equal((await http(origin, '/api/v1/owner-hosts')).status, 200)
    const globalExcess = await partial(t, origin, '/api/v1/owner-host/redeem', undefined, '127.0.0.3')
    await fixtureDeadline(globalExcess.closed)
    assert.equal(globalExcess.status(), 503)
    alternate.socket.destroy()
    alternate2.socket.destroy()
    await Promise.all([alternate.closed, alternate2.closed])
  } catch (err: unknown) {
    assert.ok(err instanceof Error && 'code' in err && ['EADDRNOTAVAIL', 'EINVAL'].includes(String(err.code)))
    t.diagnostic(
      'Physical alternate loopback source address unavailable; logical-peer multi-IP/global accounting is separate evidence, Linux multi-IP remains open',
    )
  }
  a.socket.destroy()
  b.socket.destroy()
  await fixtureDeadline(Promise.all([a.closed, b.closed]))
  assert.equal((await http(origin, '/api/v1/owner-hosts')).status, 200)
})

test('HQUOTA missing predicate fails unavailable before body parsing with no shape fallback', async (t) => {
  const served = ownerHostFixtures(t).app(application(false))
  let parsed = false
  served.addHook('preParsing', (_req, _reply, payload, done) => {
    parsed = true
    done(null, payload)
  })
  const origin = await served.listen({ host: '127.0.0.1', port: 0 })
  await owner.query('ALTER FUNCTION sophia.owner_host_admission_allowed(bytea) RENAME TO fixture_withheld_admission')
  try {
    const client = await partial(t, origin, '/api/v1/owner-host/poll', newSecret())
    await fixtureDeadline(client.closed)
    assert.equal(client.status(), 503)
    assert.equal(parsed, false)
  } finally {
    await owner.query('ALTER FUNCTION sophia.fixture_withheld_admission(bytea) RENAME TO owner_host_admission_allowed')
  }
})
