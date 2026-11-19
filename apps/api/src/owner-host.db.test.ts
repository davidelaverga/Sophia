import { OwnerHostFixtureResources } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  constants,
  openSync,
  closeSync,
  writeSync,
  fstatSync,
  lstatSync,
  realpathSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve as resolvedPath, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { SignJWT } from 'jose'
import { createActorVerifier } from './auth.ts'
import { runnerDispatchOnce } from '../../worker/src/runner-dispatch.ts'
import { HttpHostChannel } from '@sophia/coordination/owner-host-http'
import { OwnerHostAgent } from '@sophia/coordination/owner-host-agent'
import { RunnerResultsController } from '../../worker/src/runner-results.ts'
import {
  resultWorld,
  admitResultOperation,
  requestResult,
  withResultResources,
  serveUntil,
  RESULT_TEXT,
} from '../../../packages/persistence/src/runner-results.db.test.ts'
import { withActor, readRunnerResult, admitRunnerOperation } from '@sophia/persistence'
// Real restricted API role and actual HTTP injection. All credentials/identities are synthetic in an owned cluster.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { Socket } from 'node:net'
import type { IncomingMessage } from 'node:http'
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
const PHYSICAL_CASE = 'hquota-linux-physical-v1'
const PHYSICAL_FILE = 'hquota-physical.json'
const DOMAIN_CHECKS = [
  'ownerRead',
  'wrongJWT',
  'anonymous',
  'foreignStop',
  'send',
  'stopAdmission',
  'stopReplay',
  'stopReceived',
  'retired',
  'revokeRace',
  'noDuplicate',
  'ownerRevoke',
] as const
const HEAT_STAGES = [
  'saturated',
  'owner_auth',
  'matching_send',
  'stop_acknowledged',
  'retired_maintenance',
  'revoke_after_precheck',
] as const
const domainComplete = (report: PhysicalReport) =>
  Object.keys(report.domain).length === DOMAIN_CHECKS.length &&
  DOMAIN_CHECKS.every((key) => report.domain[key] === true)
const LOCAL_ISSUER = 'https://hquota-fixture.invalid/auth'
const LOCAL_KEY = 'synthetic-local-hquota-jwt-verification-key'
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
const pendingWorlds = new Set<symbol>()
let suiteDatabaseDropped = false
let pendingPhysical:
  | {
      config: PhysicalConfig
      report: PhysicalReport
      primary: Error | undefined
      cleanup: Error | undefined
      expectedNonce: string
      expectedHead: string
    }
  | undefined
before(async () =>
  suiteResources.setup(async () => {
    physicalConfiguration()
    const created = await createTestDatabase()
    db = suiteResources.database({
      ...created,
      drop: async () => {
        assert.equal(pendingWorlds.size, 0, 'unproved nested world drain; suite database retained')
        await created.drop()
        suiteDatabaseDropped = true
      },
    })
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

after(async () => {
  let failure: Error | undefined
  try {
    await suiteResources.close()
  } catch (err) {
    failure = fixtureError(err)
  }
  let reporting: Error | undefined
  if (pendingPhysical) {
    try {
      finalizePhysical(pendingPhysical, failure)
    } catch (err) {
      reporting = fixtureError(err)
    }
  }
  if (failure && reporting) throw new AggregateError([failure, reporting], 'HQUOTA suite cleanup and reporting failed')
  if (failure) throw failure
  if (reporting) throw reporting
})
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

// HQUOTA Linux crossing. These are test-only inputs, never production admission flags.
interface PhysicalConfig {
  required: boolean
  report?: string
  temp?: string
}
function fixtureError(value: unknown): Error {
  return value instanceof Error ? value : new Error('HQUOTA non-Error fixture failure', { cause: value })
}
function contractError(code: string): never {
  throw new Error('HQUOTA_CONTRACT:' + code)
}
function existingPath(path: string) {
  try {
    return lstatSync(path)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return undefined
    throw err
  }
}
function reportTemp(): string {
  const temp = process.env.RUNNER_TEMP
  if (!temp || !isAbsolute(temp)) contractError('runner_temp')
  const stat = existingPath(temp)
  if (!stat?.isDirectory() || stat.isSymbolicLink() || realpathSync(temp) !== resolvedPath(temp))
    contractError('runner_temp')
  return temp
}
function reportDestination(requested: string): { report: string; temp: string } {
  const temp = reportTemp()
  const report = join(temp, 'sophia-ci-diagnostics', PHYSICAL_FILE)
  if (requested !== report) contractError('report_path')
  const dir = existingPath(dirname(report))
  if (dir?.isSymbolicLink()) contractError('report_symlink')
  if (dir && !dir.isDirectory()) contractError('report_directory')
  if (existingPath(report)) contractError('stale_report')
  return { report, temp }
}
function checkDisposableInput(required: boolean): void {
  const input = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
  if (!input) {
    if (required) contractError('missing_disposable')
    return
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    contractError('disposable_shape')
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/postgres'
  )
    contractError('disposable_shape')
}
function physicalConfiguration(): PhysicalConfig {
  const mode = process.env.SOPHIA_HQUOTA_PHYSICAL_REQUIRED
  if (mode !== undefined && mode !== '1') contractError('required_value')
  if (process.env.GITHUB_ACTIONS === 'true' && mode === undefined) contractError('required_missing')
  const required = mode === '1',
    requested = process.env.SOPHIA_HQUOTA_PHYSICAL_REPORT
  if (required && !requested) contractError('missing_report')
  const destination = requested ? reportDestination(requested) : {}
  checkDisposableInput(required)
  if (required && process.platform !== 'linux') contractError('non_linux')
  return { required, ...destination }
}
interface PhysicalSource {
  head: string
  tree: string
  testSha256: string
  workflowSha256: string
  committed: boolean
}
const sourceDigest = (value: Buffer) => createHash('sha256').update(value).digest('hex')
function physicalSource(): PhysicalSource {
  const cwd = fileURLToPath(new URL('../../../', import.meta.url))
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
  const testSha256 = sourceDigest(readFileSync(import.meta.filename)),
    workflowSha256 = sourceDigest(readFileSync(join(cwd, '.github/workflows/ci.yml')))
  return {
    head: git('rev-parse', 'HEAD').toString().trim(),
    tree: git('rev-parse', 'HEAD^{tree}').toString().trim(),
    testSha256,
    workflowSha256,
    committed:
      testSha256 === sourceDigest(git('show', 'HEAD:apps/api/src/owner-host.db.test.ts')) &&
      workflowSha256 === sourceDigest(git('show', 'HEAD:.github/workflows/ci.yml')),
  }
}
interface PeerEvidence {
  id: string
  client: string
  server: string
  quotaIP: string
  port: number
  body: boolean
  closed: boolean
  status: number | null
}
interface PhysicalReport {
  version: 1
  caseId: string
  nonce: string
  required: boolean
  platform: string
  arch: string
  node: string
  pnpm: string
  run: { id: string; attempt: string; event: string }
  source: PhysicalSource
  outcome: 'QUALIFIED' | 'NOT_QUALIFIED' | 'FAILED'
  failure: string | null
  unavailable: string | null
  heat: 'PHYSICAL_FOUR' | 'LOCAL_ONE_IP' | 'NONE'
  peers: PeerEvidence[]
  milestones: { stage: string; held: number; incomplete: boolean; elapsedMs: number }[]
  perIpRefused: boolean
  globalRefused: boolean
  domain: Record<string, boolean>
  database: Record<string, boolean | string | number>
  identities: Record<string, string | number>
  events: { route: string; status: number }[]
  cleanup: { clients: boolean; server: boolean; work: boolean; world: boolean; database: boolean }
}
function newPhysicalReport(config: PhysicalConfig): PhysicalReport {
  return {
    version: 1,
    caseId: PHYSICAL_CASE,
    nonce: randomUUID(),
    required: config.required,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim(),
    run: {
      id: process.env.GITHUB_RUN_ID ?? 'local',
      attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'local',
      event: process.env.GITHUB_EVENT_NAME ?? 'local',
    },
    source: physicalSource(),
    outcome: 'NOT_QUALIFIED',
    failure: null,
    unavailable: null,
    heat: 'NONE',
    peers: [],
    milestones: [],
    perIpRefused: false,
    globalRefused: false,
    domain: {},
    database: {},
    identities: {},
    events: [],
    cleanup: { clients: true, server: true, work: true, world: false, database: false },
  }
}
function identityIssues(report: PhysicalReport, nonce: string, head: string): string[] {
  const issues: string[] = []
  if (report.version !== 1 || report.caseId !== PHYSICAL_CASE || report.nonce !== nonce) issues.push('case_nonce')
  if (!report.source.committed || report.source.head !== head || !/^[a-f0-9]{40}$/.test(report.source.tree))
    issues.push('source')
  if (report.node !== 'v24.21.0' || report.pnpm !== '11.7.0') issues.push('toolchain')
  return issues
}
function runIssues(report: PhysicalReport): string[] {
  const issues: string[] = []
  if (!report.required || report.platform !== 'linux' || !['x64', 'arm64'].includes(report.arch))
    issues.push('required_linux')
  if (
    !/^\d+$/.test(report.run.id) ||
    !/^[1-9]\d*$/.test(report.run.attempt) ||
    !['push', 'pull_request'].includes(report.run.event)
  )
    issues.push('run')
  return issues
}
function peerIssues(report: PhysicalReport): string[] {
  const issues: string[] = [],
    held = report.peers.filter((p) => p.body)
  if (
    held.length !== 4 ||
    new Set(held.map((p) => p.server)).size !== 2 ||
    held.some((p) => p.client !== p.server || p.quotaIP !== p.server || !p.closed)
  )
    issues.push('peers')
  for (const [id, address] of [
    ['A1', '127.0.0.2'],
    ['A2', '127.0.0.2'],
    ['B1', '127.0.0.3'],
    ['B2', '127.0.0.3'],
  ])
    if (!held.some((p) => p.id === id && p.client === address && p.server === address)) issues.push('measured_peer')
  for (const [id, address] of [
    ['A3', '127.0.0.2'],
    ['C1', '127.0.0.4'],
  ])
    if (
      !report.peers.some(
        (p) =>
          p.id === id &&
          p.client === address &&
          p.server === address &&
          p.quotaIP === address &&
          p.status === 503 &&
          !p.body &&
          p.closed,
      )
    )
      issues.push('measured_refusal')
  return issues
}
function pressureIssues(report: PhysicalReport): string[] {
  const issues: string[] = []
  if (report.heat !== 'PHYSICAL_FOUR' || report.unavailable || !report.perIpRefused || !report.globalRefused)
    issues.push('physical')
  if (
    report.milestones.length !== HEAT_STAGES.length ||
    !HEAT_STAGES.every((stage) => report.milestones.some((m) => m.stage === stage)) ||
    report.milestones.some((m) => m.held !== 4 || !m.incomplete || m.elapsedMs >= 10_000)
  )
    issues.push('sustained')
  return issues
}
function databaseIssues(report: PhysicalReport): string[] {
  const d = report.database
  return typeof d.version !== 'string' ||
    !d.version.startsWith('PostgreSQL 16.') ||
    d.major !== 16 ||
    d.encoding !== 'UTF8' ||
    d.libc !== true ||
    d.xml !== true ||
    d.crypto !== true ||
    d.apiSafe !== true ||
    d.wrongPasswordRefused !== true
    ? ['database']
    : []
}
function domainStateCorrect(i: Record<string, string | number>): boolean {
  return (
    i.stopTarget === i.operation &&
    i.stop !== i.operation &&
    i.exchange !== i.stopExchange &&
    i.goCount === 1 &&
    i.stopGoCount === 1 &&
    i.sendState === 'answered' &&
    i.stopState === 'received' &&
    i.stopDelivery === 'stop_requested' &&
    i.bindingState === 'stopping'
  )
}
function exchangeIssues(report: PhysicalReport): string[] {
  const i = report.identities,
    ids = ['operation', 'exchange', 'stop', 'stopExchange', 'binding', 'host', 'journal']
  if (!ids.every((key) => typeof i[key] === 'string' && /^[a-f0-9-]{36}$/.test(i[key]))) return ['domain_identity']
  if (!domainStateCorrect(i)) return ['domain_state']
  for (const id of [i.exchange, i.stopExchange])
    for (const phase of ['go', 'answer'])
      if (!report.events.some((e) => e.route === `/api/v1/owner-host/exchanges/${id}/${phase}` && e.status === 200))
        return ['matching_http']
  return report.events.some((e) => e.route === '/api/v1/owner-host/poll' && e.status === 200) ? [] : ['matching_http']
}
function qualificationIssues(report: PhysicalReport, nonce: string, head: string): string[] {
  const issues = [
    ...identityIssues(report, nonce, head),
    ...runIssues(report),
    ...peerIssues(report),
    ...pressureIssues(report),
    ...databaseIssues(report),
    ...exchangeIssues(report),
  ]
  if (!domainComplete(report)) issues.push('domain')
  if (Object.values(report.cleanup).some((ok) => !ok) || report.failure) issues.push('cleanup_or_failure')
  return issues
}
function writePhysicalReport(config: PhysicalConfig, report: PhysicalReport): void {
  if (!config.report) return
  reportDestination(config.report)
  const dir = dirname(config.report)
  if (!existingPath(dir)) mkdirSync(dir, { mode: 0o700 })
  const stat = lstatSync(dir)
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(dir) !== dir ||
    (typeof process.getuid === 'function' && stat.uid !== process.getuid())
  )
    contractError('report_symlink')
  const bytes = Buffer.from(JSON.stringify(report) + '\n')
  if (bytes.length > 32_768) contractError('report_size')
  const fd = openSync(
    config.report,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    assert.ok(fstatSync(fd).isFile())
    let offset = 0
    while (offset < bytes.length) {
      const n = writeSync(fd, bytes, offset)
      assert.ok(n > 0)
      offset += n
    }
  } finally {
    closeSync(fd)
  }
  verifyPhysicalBytes(readFileSync(config.report), bytes)
}

function verifyPhysicalBytes(actual: Buffer, expected: Buffer): void {
  assert.ok(
    actual.length > 0 && actual.length <= 32_768 && actual.equals(expected),
    'finite report must round-trip without missing, incomplete or truncated bytes',
  )
}
interface PressureClient {
  id: string
  socket: Socket
  closed: Promise<void>
  serverClosed: Promise<void>
  headers: Promise<void>
  bodyReady: Promise<void>
  evidence: PeerEvidence
  raw?: IncomingMessage
  started: number
  headerSeen(): void
  entered(): void
  requestClosed(): void
  complete(value: unknown): void
}
const peerAddress = (address: string) => address.replace(/^::ffff:/, '')
class PhysicalSockets {
  readonly clients: PressureClient[] = []
  private readonly ports = new Map<number, PressureClient>()
  private readonly own: OwnerHostFixtureResources
  constructor(own: OwnerHostFixtureResources) {
    this.own = own
  }
  observe(raw: IncomingMessage): void {
    const client = this.ports.get(raw.socket.remotePort ?? 0)
    if (!client) return
    client.raw = raw
    client.started = performance.now()
    client.evidence.server = peerAddress(raw.socket.remoteAddress ?? '')
    raw.once('close', () => client.requestClosed())
    client.headerSeen()
  }
  key(raw: IncomingMessage, ip: string): void {
    const client = this.ports.get(raw.socket.remotePort ?? 0)
    if (client) client.evidence.quotaIP = peerAddress(ip)
  }
  body(raw: IncomingMessage, ip: string): void {
    this.key(raw, ip)
    const client = this.ports.get(raw.socket.remotePort ?? 0)
    if (client) {
      client.evidence.body = true
      client.entered()
    }
  }
  async partial(
    origin: string,
    id: string,
    address?: string,
    path = '/api/v1/owner-host/redeem',
    capability?: string,
  ): Promise<PressureClient> {
    const socket = new Socket(),
      close = Promise.withResolvers<void>(),
      headerGate = Promise.withResolvers<void>(),
      body = Promise.withResolvers<void>(),
      server = Promise.withResolvers<void>()
    let response = ''
    const evidence: PeerEvidence = {
      id,
      client: '',
      server: '',
      quotaIP: '',
      port: 0,
      body: false,
      closed: false,
      status: null,
    }
    const client: PressureClient = {
      id,
      socket,
      evidence,
      closed: close.promise,
      serverClosed: server.promise,
      headers: headerGate.promise,
      bodyReady: body.promise,
      started: 0,
      headerSeen: () => headerGate.resolve(),
      entered: () => body.resolve(),
      requestClosed: () => server.resolve(),
      complete: (value) => {
        socket.write(JSON.stringify(value).padEnd(1000).slice(1))
      },
    }
    this.clients.push(client)
    socket.on('error', () => undefined)
    socket.on('data', (b: Buffer) => {
      response += b.toString()
      if (response.length > 65_536) socket.destroy()
    })
    socket.once('close', () => {
      evidence.closed = true
      evidence.status = Number(/^HTTP\/1\.1 (\d+)/.exec(response)?.[1]) || null
      close.resolve()
    })
    this.own.own('physical client join ' + id, () => this.close(client))
    await fixtureDeadline(
      new Promise<void>((resolveConnect, reject) => {
        socket.once('error', reject)
        socket.connect(
          { host: '127.0.0.1', port: Number(new URL(origin).port), ...(address ? { localAddress: address } : {}) },
          () => {
            evidence.client = peerAddress(socket.localAddress ?? '')
            evidence.port = socket.localPort ?? 0
            this.ports.set(evidence.port, client)
            socket.write(
              `POST ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\nConnection: close\r\n${capability ? `Authorization: Bearer ${capability}\r\n` : ''}\r\n{`,
              (err) => (err ? reject(err) : resolveConnect()),
            )
          },
        )
      }),
    )
    await fixtureDeadline(client.headers)
    assert.equal(evidence.client, evidence.server, 'actual client/server peer endpoints must agree')
    return client
  }
  async close(client: PressureClient): Promise<void> {
    client.socket.destroy()
    await fixtureDeadline(client.closed)
    if (client.raw) await fixtureDeadline(client.serverClosed)
  }
  async refused(client: PressureClient): Promise<void> {
    await fixtureDeadline(client.closed)
    assert.equal(client.evidence.status, 503, 'excess real peer must receive an admission refusal')
    assert.equal(client.evidence.body, false, 'refused peer must not enter body parsing')
    await fixtureDeadline(client.serverClosed)
  }
  milestone(report: PhysicalReport, held: PressureClient[], stage: string): void {
    const incomplete = held.every(
      (c) => c.raw && !c.raw.complete && !c.raw.destroyed && !c.socket.destroyed && c.evidence.body,
    )
    const elapsedMs = performance.now() - Math.min(...held.map((c) => c.started))
    report.milestones.push({ stage, held: held.length, incomplete, elapsedMs })
    assert.ok(
      incomplete && elapsedMs < 10_000,
      'same original pressure bodies must remain unfinished within their original deadline',
    )
  }
}
async function physicalHeat(net: PhysicalSockets, origin: string, report: PhysicalReport): Promise<PressureClient[]> {
  report.cleanup.clients = false
  const attempted: PressureClient[] = []
  try {
    for (const id of ['A1', 'A2']) {
      const c = await net.partial(origin, id, '127.0.0.2')
      attempted.push(c)
      await fixtureDeadline(c.bodyReady)
    }
    await net.refused(await net.partial(origin, 'A3', '127.0.0.2'))
    report.perIpRefused = true
    for (const id of ['B1', 'B2']) {
      const c = await net.partial(origin, id, '127.0.0.3')
      attempted.push(c)
      await fixtureDeadline(c.bodyReady)
    }
    await net.refused(await net.partial(origin, 'C1', '127.0.0.4'))
    report.globalRefused = true
    report.heat = 'PHYSICAL_FOUR'
    return attempted
  } catch (err: unknown) {
    if (!(err instanceof Error) || !('code' in err) || !['EADDRNOTAVAIL', 'EINVAL'].includes(String(err.code)))
      throw err
    report.unavailable = String(err.code)
    if (report.required) throw new Error('HQUOTA physical peer unavailable in required mode', { cause: err })
    for (const c of attempted) await net.close(c)
    const local: PressureClient[] = []
    for (const id of ['L1', 'L2']) {
      const c = await net.partial(origin, id)
      local.push(c)
      await fixtureDeadline(c.bodyReady)
    }
    await net.refused(await net.partial(origin, 'L3'))
    report.perIpRefused = true
    report.heat = 'LOCAL_ONE_IP'
    return local
  }
}
async function localJwt(subject: string, anonymous = false, wrong = false): Promise<string> {
  return new SignJWT({ role: 'authenticated', is_anonymous: anonymous })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuer(LOCAL_ISSUER)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(wrong ? 'wrong-synthetic-fixture-key' : LOCAL_KEY))
}
async function crossingHttp(
  origin: string,
  path: string,
  token: string,
  report: PhysicalReport,
  options: { method?: string; body?: unknown; key?: string } = {},
) {
  const { method = 'GET', body, key } = options
  const response = await fetch(origin + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key ? { 'idempotency-key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(3000),
  })
  const text = await response.text()
  assert.ok(report.events.length < 64, 'finite metadata-only HTTP census')
  report.events.push({ route: path, status: response.status })
  return {
    status: response.status,
    json: (): Record<string, unknown> => {
      const value: unknown = JSON.parse(text)
      assert.ok(value && typeof value === 'object' && !Array.isArray(value))
      return Object.fromEntries(Object.entries(value))
    },
  }
}
type PhysicalWorld = Awaited<ReturnType<typeof resultWorld>>
async function crossingDatabase(
  w: PhysicalWorld,
  fixture: TestDatabase,
  own: OwnerHostFixtureResources,
  report: PhysicalReport,
): Promise<void> {
  await checkRoleSafety(w.api)
  const result = await w.api.query<{
    version: string
    major: number
    encoding: string
    libc: boolean
    xml: boolean
    crypto: boolean
    safe: boolean
  }>(`SELECT version(),current_setting('server_version_num')::int/10000 AS major,current_setting('server_encoding') AS encoding,
    (SELECT datlocprovider='c' FROM pg_database WHERE datname=current_database()) AS libc,xml_is_well_formed_document('<hquota/>') AS xml,
    length(sha256('hquota'::bytea))=32 AS crypto,(SELECT NOT rolsuper AND NOT rolbypassrls AND pg_has_role(current_user,'sophia_api','member') FROM pg_roles WHERE rolname=current_user) AS safe`)
  const data = result.rows[0]
  assert.ok(data)
  const wrong = new URL(fixture.apiUrl)
  wrong.password = 'wrong-synthetic-fixture-password'
  const client = new pg.Client({ connectionString: wrong.toString() })
  own.own('wrong-password client join', async () => {
    try {
      await client.end()
    } catch (err) {
      report.cleanup.clients = false
      throw err
    }
  })
  await assert.rejects(client.connect(), { code: '28P01' })
  report.database = {
    version: data.version,
    major: data.major,
    encoding: data.encoding,
    libc: data.libc,
    xml: data.xml,
    crypto: data.crypto,
    apiSafe: data.safe,
    wrongPasswordRefused: true,
  }
  assert.ok(data.major === 16 && data.encoding === 'UTF8' && data.libc && data.xml && data.crypto && data.safe)
}
async function runningCreate(w: PhysicalWorld) {
  return withActor(w.api, w.who, 'write', (c) =>
    admitRunnerOperation(c, w.projectId, randomUUID(), {
      kind: 'create',
      resourceId: w.resourceId,
      goalId: w.goalId,
      title: 'Synthetic physical crossing',
      message: 'Synthetic local instruction',
      sourceIds: [w.sourceId],
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: 1,
      baseCommit: '0123456789abcdef0123456789abcdef01234567',
      writeScope: 'read_only',
      settings: { instanceId: 'claudeAgent', model: 'synthetic-model', options: [] },
    }),
  )
}

function trackWork<T>(promise: Promise<T>, work: Promise<unknown>[]): Promise<T> {
  work.push(promise)
  void promise.catch(() => undefined)
  return promise
}
function drivePhysical(
  w: PhysicalWorld,
  agent: OwnerHostAgent,
  sends: boolean,
  work: Promise<unknown>[],
  report: PhysicalReport,
) {
  report.cleanup.work = false
  const task = trackWork(
    runnerDispatchOnce(w.worker, {
      workerId: 'hquota-physical-fixture',
      runner: { ownerId: w.who, environmentRef: 'env-result' },
      port: w.port,
      sends,
      followupMinAgeSeconds: 3600,
    }),
    work,
  )
  return trackWork(serveUntil(agent, task), work)
}
async function physicalSend(
  w: PhysicalWorld,
  agent: OwnerHostAgent,
  created: Awaited<ReturnType<typeof runningCreate>>,
  report: PhysicalReport,
  work: Promise<unknown>[],
): Promise<void> {
  const pass = await drivePhysical(w, agent, true, work, report)
  assert.deepEqual(pass.sent, ['received'])
  const { rows } = await w.owner.query<{ id: string; state: string; go_count: number; operation_id: string }>(
    "SELECT id,state,go_count,operation_id FROM sophia.owner_host_exchanges WHERE operation_id=$1 AND kind='send'",
    [created.operationId],
  )
  assert.equal(rows.length, 1)
  const exchange = rows[0]
  assert.ok(exchange)
  assert.ok(exchange.state === 'answered' && exchange.go_count === 1 && exchange.operation_id === created.operationId)
  for (const phase of ['go', 'answer'])
    assert.ok(
      report.events.some((e) => e.route === `/api/v1/owner-host/exchanges/${exchange.id}/${phase}` && e.status === 200),
    )
  assert.ok(report.events.some((e) => e.route === '/api/v1/owner-host/poll' && e.status === 200))
  const binding = await w.owner.query<{ binding_id: string }>(
    'SELECT binding_id FROM sophia.owner_runner_operations WHERE project_id=$1 AND id=$2',
    [w.projectId, created.operationId],
  )
  assert.ok(binding.rows[0]?.binding_id)
  Object.assign(report.identities, {
    operation: created.operationId,
    exchange: exchange.id,
    goCount: exchange.go_count,
    sendState: exchange.state,
    binding: binding.rows[0].binding_id,
    journal: w.journal.id,
  })
  report.domain.send = true
}
async function physicalStop(
  context: {
    w: PhysicalWorld
    agent: OwnerHostAgent
    origin: string
    token: string
    report: PhysicalReport
    work: Promise<unknown>[]
  },
  target: string,
): Promise<void> {
  const { w, agent, origin, token, report, work } = context
  const path = `/api/v1/projects/${w.projectId}/runner-operations`,
    body = { kind: 'stop', resourceId: w.resourceId, targetOperationId: target },
    key = randomUUID()
  const foreign = await crossingHttp(origin, path, await localJwt(w.teammate), report, {
    method: 'POST',
    body,
    key: randomUUID(),
  })
  assert.equal(foreign.json().code, 'not_found')
  report.domain.foreignStop = true
  const stopped = await crossingHttp(origin, path, token, report, { method: 'POST', body, key }),
    receipt = stopped.json()
  assert.ok(
    stopped.status === 202 &&
      receipt.kind === 'stop' &&
      receipt.state === 'admitted' &&
      typeof receipt.operationId === 'string',
  )
  const operationId = receipt.operationId
  report.domain.stopAdmission = true
  const replay = await crossingHttp(origin, path, token, report, { method: 'POST', body, key })
  assert.ok(replay.status === 202 && replay.json().operationId === operationId)
  report.domain.stopReplay = true
  const pass = await drivePhysical(w, agent, false, work, report)
  assert.deepEqual(pass.sent, ['received'])
  const { rows } = await w.owner.query<{ state: string; native_delivery: string; target_operation_id: string }>(
    'SELECT state,native_delivery,target_operation_id FROM sophia.owner_runner_operations WHERE project_id=$1 AND id=$2',
    [w.projectId, operationId],
  )
  assert.ok(
    rows[0]?.state === 'received' &&
      rows[0].native_delivery === 'stop_requested' &&
      rows[0].target_operation_id === target,
    'Stop acknowledgement must not become settlement',
  )
  const binding = await w.owner.query<{ state: string }>(
    'SELECT b.state FROM sophia.execution_bindings b JOIN sophia.owner_runner_operations o ON o.binding_id=b.id WHERE o.project_id=$1 AND o.id=$2',
    [w.projectId, target],
  )
  assert.equal(binding.rows[0]?.state, 'stopping')
  await recordStopIdentity(w, report, {
    operationId,
    target,
    state: rows[0].state,
    delivery: rows[0].native_delivery,
    bindingState: binding.rows[0]?.state ?? 'unknown',
  })
  report.domain.stopReceived = true
  const duplicate = await w.owner.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM sophia.owner_runner_operations WHERE project_id=$1 AND kind IN ('create','stop')",
    [w.projectId],
  )
  assert.equal(duplicate.rows[0]?.n, 2)
  report.domain.noDuplicate = true
}
async function recordStopIdentity(
  w: PhysicalWorld,
  report: PhysicalReport,
  state: { operationId: string; target: string; state: string; delivery: string; bindingState: string },
): Promise<void> {
  const stopExchange = await w.owner.query<{ id: string; go_count: number; state: string }>(
    "SELECT id,go_count,state FROM sophia.owner_host_exchanges WHERE operation_id=$1 AND kind='send'",
    [state.operationId],
  )
  assert.ok(
    stopExchange.rows.length === 1 && stopExchange.rows[0]?.go_count === 1 && stopExchange.rows[0].state === 'answered',
  )
  Object.assign(report.identities, {
    stop: state.operationId,
    stopTarget: state.target,
    stopExchange: stopExchange.rows[0].id,
    stopGoCount: stopExchange.rows[0].go_count,
    stopState: state.state,
    stopDelivery: state.delivery,
    bindingState: state.bindingState,
  })
}
async function physicalOwner(
  w: PhysicalWorld,
  origin: string,
  token: string,
  hostId: string,
  report: PhysicalReport,
): Promise<void> {
  const own = await crossingHttp(origin, '/api/v1/owner-hosts', token, report),
    hosts = own.json().hosts
  assert.ok(
    own.status === 200 &&
      Array.isArray(hosts) &&
      hosts.some((h: unknown) => h && typeof h === 'object' && 'hostId' in h && h.hostId === hostId),
  )
  report.domain.ownerRead = true
  assert.equal(
    (await crossingHttp(origin, '/api/v1/owner-hosts', await localJwt(w.who, false, true), report)).status,
    401,
  )
  report.domain.wrongJWT = true
  assert.equal((await crossingHttp(origin, '/api/v1/owner-hosts', await localJwt(w.who, true), report)).status, 403)
  report.domain.anonymous = true
}
async function physicalRevoke(
  context: {
    w: PhysicalWorld
    origin: string
    token: string
    channel: HttpHostChannel
    net: PhysicalSockets
    report: PhysicalReport
    checkpoint: (stage: string) => void
  },
  hostId: string,
): Promise<void> {
  const { w, origin, token, channel, net, report, checkpoint } = context
  assert.equal(
    (await crossingHttp(origin, `/api/v1/owner-hosts/${hostId}/retire`, token, report, { method: 'POST' })).status,
    200,
  )
  await channel.poll(1, 15)
  report.domain.retired = true
  checkpoint('retired_maintenance')
  const race = await net.partial(origin, 'RACE', undefined, '/api/v1/owner-host/poll', w.capability)
  await fixtureDeadline(race.bodyReady)
  assert.equal(
    (await crossingHttp(origin, `/api/v1/owner-hosts/${hostId}/revoke`, token, report, { method: 'POST' })).status,
    200,
  )
  report.domain.ownerRevoke = true
  race.complete({ limit: 1, redeliverSeconds: 15 })
  await fixtureDeadline(race.closed)
  assert.equal(race.evidence.status, 403)
  report.domain.revokeRace = true
  checkpoint('revoke_after_precheck')
}
function metadataFetch(report: PhysicalReport): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init)
    assert.ok(report.events.length < 64, 'finite metadata-only HTTP census')
    report.events.push({
      route: new URL(input instanceof Request ? input.url : input).pathname,
      status: response.status,
    })
    return response
  }
}
async function physicalScenario(t: TestContext, own: OwnerHostFixtureResources, report: PhysicalReport): Promise<void> {
  const fixture = db,
    work: Promise<unknown>[] = [],
    worldToken = Symbol('physical world')
  pendingWorlds.add(worldToken)
  const w = await resultWorld(fixture)
  own.own('physical nested world drain', async () => {
    assert.ok(
      report.cleanup.work && report.cleanup.server && report.cleanup.clients,
      'unproved reader join; nested world retained',
    )
    await w.close()
    report.cleanup.world = true
    pendingWorlds.delete(worldToken)
  })
  await crossingDatabase(w, fixture, own, report)
  const served = buildApp({
    pool: w.api,
    ownerHostEnrollment: false,
    ownerRunnerAdmissions: 'off',
    verifyActor: createActorVerifier({ issuer: LOCAL_ISSUER, audience: 'authenticated', secret: LOCAL_KEY }),
  })
  report.cleanup.server = false
  own.own('physical app drain', async () => {
    await fixtureDeadline(served.close(), 15_000)
    report.cleanup.server = true
  })
  own.own('physical dispatcher joins', async () => {
    await fixtureDeadline(Promise.allSettled(work), 15_000)
    report.cleanup.work = true
  })
  const net = new PhysicalSockets(own)
  own.own('physical client census', () => {
    assert.ok(
      net.clients.every((c) => c.evidence.closed && (!c.raw || c.raw.destroyed || c.raw.complete)),
      'owned clients did not close',
    )
    report.cleanup.clients = true
  })
  served.server.on('request', (raw) => net.observe(raw))
  served.addHook('onError', (req, _reply, _error, done) => {
    net.key(req.raw, req.ip)
    done()
  })
  served.addHook('preParsing', (req, _reply, payload, done) => {
    net.body(req.raw, req.ip)
    done(null, payload)
  })
  const origin = await served.listen({ host: '127.0.0.1', port: 0 }),
    directory = mkdtempSync(join(tmpdir(), 'hquota-physical-'))
  suiteResources.own(
    'physical private files',
    () => {
      assert.ok(
        report.cleanup.world && suiteDatabaseDropped,
        'unproved nested drain/database drop; private files retained',
      )
      rmSync(directory, { recursive: true, force: true })
    },
    'files',
  )
  const file = join(directory, 'capability')
  writeFileSync(file, w.capability, { mode: 0o600 })
  const channel = new HttpHostChannel({
    origin,
    loopbackTest: true,
    capabilityFile: file,
    fetch: metadataFetch(report),
  })
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
      accountKey: w.accountKey,
      t3Namespace: w.t3.namespace(),
    },
  })
  await agent.greet()
  const token = await localJwt(w.who),
    created = await runningCreate(w),
    host = await w.owner.query<{ id: string }>('SELECT id FROM sophia.owner_hosts WHERE journal_id=$1', [w.journal.id]),
    hostId = host.rows[0]?.id
  assert.ok(hostId)
  report.identities.host = hostId
  const held = await physicalHeat(net, origin, report),
    checkpoint = (stage: string) => net.milestone(report, held, stage)
  checkpoint('saturated')
  try {
    await physicalOwner(w, origin, token, hostId, report)
    checkpoint('owner_auth')
    await physicalSend(w, agent, created, report, work)
    checkpoint('matching_send')
    await physicalStop({ w, agent, origin, token, report, work }, created.operationId)
    checkpoint('stop_acknowledged')
    await physicalRevoke({ w, origin, token, channel, net, report, checkpoint }, hostId)
  } finally {
    report.peers = net.clients.filter((c) => c.id !== 'RACE').map((c) => c.evidence)
  }
  if (report.unavailable)
    t.diagnostic(
      'NOT_QUALIFIED: physical alternate peer unavailable; real local one-IP/auth/HTTP/Stop domain evidence is separate',
    )
}

test('HQUOTA Linux physical peers preserve authenticated control and exact matching HTTP crossing', async (t) => {
  const config = physicalConfiguration(),
    report = newPhysicalReport(config),
    own = ownerHostFixtures(t)
  const expectedNonce = report.nonce,
    expectedHead = report.source.head
  let primary: Error | undefined, cleanup: Error | undefined
  try {
    await physicalScenario(t, own, report)
  } catch (err) {
    primary = fixtureError(err)
    report.failure = 'crossing_failed'
  }
  try {
    await own.close()
  } catch (err) {
    cleanup = fixtureError(err)
    report.failure = 'cleanup_failed'
  }
  pendingPhysical = { config, report, primary, cleanup, expectedNonce, expectedHead }
  if (primary && cleanup) throw new AggregateError([primary, cleanup], 'HQUOTA crossing and cleanup failed')
  if (primary) throw primary
  if (cleanup) throw cleanup
  assert.ok(domainComplete(report), 'local domain crossing must complete even when physical Linux is not qualified')
})

// Synthetic report-data fixtures exercise the actual validator only; they are never physical Linux evidence.
test('HQUOTA qualification rejects logical, stale, incomplete and unproved report data', () => {
  const source = physicalSource(),
    nonce = randomUUID()
  const fixture: PhysicalReport = {
    version: 1,
    caseId: PHYSICAL_CASE,
    nonce,
    required: true,
    platform: 'linux',
    arch: 'x64',
    node: 'v24.21.0',
    pnpm: '11.7.0',
    run: { id: '1', attempt: '1', event: 'push' },
    source: { ...source, committed: true },
    outcome: 'QUALIFIED',
    failure: null,
    unavailable: null,
    heat: 'PHYSICAL_FOUR',
    peers: [
      ['A1', '127.0.0.2', true],
      ['A2', '127.0.0.2', true],
      ['B1', '127.0.0.3', true],
      ['B2', '127.0.0.3', true],
      ['A3', '127.0.0.2', false],
      ['C1', '127.0.0.4', false],
    ].map(([id, address, body]) => ({
      id: String(id),
      client: String(address),
      server: String(address),
      quotaIP: String(address),
      port: 1,
      body: body === true,
      closed: true,
      status: body ? null : 503,
    })),
    milestones: HEAT_STAGES.map((stage) => ({ stage, held: 4, incomplete: true, elapsedMs: 1 })),
    perIpRefused: true,
    globalRefused: true,
    domain: Object.fromEntries(DOMAIN_CHECKS.map((key) => [key, true])),
    database: {
      version: 'PostgreSQL 16.fixture (synthetic data only)',
      major: 16,
      encoding: 'UTF8',
      libc: true,
      xml: true,
      crypto: true,
      apiSafe: true,
      wrongPasswordRefused: true,
    },
    identities: {},
    events: [],
    cleanup: { clients: true, server: true, work: true, world: true, database: true },
  }
  const operation = randomUUID(),
    exchange = randomUUID(),
    stop = randomUUID(),
    stopExchange = randomUUID()
  fixture.identities = {
    operation,
    exchange,
    stop,
    stopExchange,
    binding: randomUUID(),
    host: randomUUID(),
    journal: randomUUID(),
    stopTarget: operation,
    goCount: 1,
    stopGoCount: 1,
    sendState: 'answered',
    stopState: 'received',
    stopDelivery: 'stop_requested',
    bindingState: 'stopping',
  }
  fixture.events = [
    { route: '/api/v1/owner-host/poll', status: 200 },
    ...[exchange, stopExchange].flatMap((id) =>
      ['go', 'answer'].map((phase) => ({ route: `/api/v1/owner-host/exchanges/${id}/${phase}`, status: 200 })),
    ),
  ]
  assert.deepEqual(
    qualificationIssues(fixture, nonce, source.head),
    [],
    'format-only synthetic fixture, no measured Linux claim',
  )
  const mutations: ((r: PhysicalReport) => void)[] = [
    (r) => {
      r.required = false
    },
    (r) => {
      r.platform = 'darwin'
    },
    (r) => {
      r.nonce = randomUUID()
    },
    (r) => {
      r.source.committed = false
    },
    (r) => {
      r.run.id = 'old'
    },
    (r) => {
      r.heat = 'LOCAL_ONE_IP'
    },
    (r) => {
      r.unavailable = 'EADDRNOTAVAIL'
    },
    (r) => {
      r.peers[0]!.server = 'logical-peer'
    },
    (r) => {
      r.peers.splice(0, 1)
    },
    (r) => {
      r.milestones.splice(1, 1)
    },
    (r) => {
      r.milestones[0]!.incomplete = false
    },
    (r) => {
      r.milestones[0]!.elapsedMs = 10_000
    },
    (r) => {
      delete r.domain.stopReceived
    },
    (r) => {
      r.database.apiSafe = false
    },
    (r) => {
      r.cleanup.world = false
    },
    (r) => {
      delete r.identities.operation
    },
    (r) => {
      r.events = []
    },
    (r) => {
      delete r.database.version
    },
    (r) => {
      r.failure = 'unproved'
    },
  ]
  for (const mutate of mutations) {
    const candidate = structuredClone(fixture)
    mutate(candidate)
    assert.ok(qualificationIssues(candidate, nonce, source.head).length > 0)
  }
})

function finalizePhysical(pending: NonNullable<typeof pendingPhysical>, suiteFailure: unknown): void {
  const { config, report, primary, cleanup } = pending
  report.cleanup.database = !suiteFailure && suiteDatabaseDropped && pendingWorlds.size === 0
  if (suiteFailure) report.failure = 'suite_cleanup_failed'
  const issues = qualificationIssues(report, pending.expectedNonce, pending.expectedHead)
  report.outcome = primary || cleanup || suiteFailure ? 'FAILED' : issues.length ? 'NOT_QUALIFIED' : 'QUALIFIED'
  writePhysicalReport(config, report)
  console.log(
    JSON.stringify({
      caseId: PHYSICAL_CASE,
      nonce: report.nonce,
      source: report.source,
      run: report.run,
      outcome: report.outcome,
      required: report.required,
      heat: report.heat,
      unavailable: report.unavailable,
      domainComplete: domainComplete(report),
      cleanup: report.cleanup,
      qualificationIssues: issues,
      fixture: 'actual HTTP/restricted PG/local JWT; existing FakeT3 only',
    }),
  )
  if (config.required)
    assert.deepEqual(issues, [], 'required Linux physical crossing and final suite cleanup must qualify')
}

test('HQUOTA actual nested-world gate refuses database drop before issuing DDL', async () => {
  const token = Symbol('held cleanup witness')
  pendingWorlds.add(token)
  try {
    await assert.rejects(db.drop(), { message: /unproved nested world drain/ })
  } finally {
    pendingWorlds.delete(token)
  }
  assert.equal(
    (await api.query<{ one: number }>('SELECT 1 AS one')).rows[0]?.one,
    1,
    'owned database remains usable after guarded refusal',
  )
})

test('HQUOTA actual report readback rejects missing incomplete and truncated bytes', () => {
  const expected = Buffer.from(
    JSON.stringify({ caseId: PHYSICAL_CASE, nonce: randomUUID(), outcome: 'format-only-data-fixture' }) + '\n',
  )
  verifyPhysicalBytes(expected, expected)
  for (const actual of [
    Buffer.alloc(0),
    expected.subarray(0, expected.length - 3),
    Buffer.from('{}\n'),
    Buffer.alloc(32_769),
  ])
    assert.throws(() => verifyPhysicalBytes(actual, expected), /missing, incomplete or truncated/)
})
