import type { VerifyActor } from './auth.ts'
import { Socket } from 'node:net'
import { EventEmitter } from 'node:events'
import pg from 'pg'
import { ownerHostFixtures, fixtureDeadline } from '../../../tests/helpers/owner-host-fixture-resources.ts'
import { DomainError } from '@sophia/domain'
import type { TestContext } from 'node:test'
// The real stock entry/auth/schema crossing. Only pool/safety/listen are doubled; no database or remote listener.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test, mock } from 'node:test'
import Fastify, { type FastifyServerOptions, type FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import * as persistence from '@sophia/persistence'
const CHILD = 'SOPHIA_H_ENTRY_TEST'
const ID = '10000000-0000-4000-8000-000000000001'
const SECRET = 'local-synthetic-signing-key-for-entry-tests'
const ISSUER = 'https://fixture.invalid/auth/v1'
async function boundary(app: FastifyInstance, enabled: boolean) {
  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ID)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
  const headers = { authorization: `Bearer ${token}` }
  const unauth = await app.inject('/api/v1/owner-hosts')
  assert.equal(unauth.statusCode, 401)
  const disabled = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host-pairings',
    headers,
    payload: { connectionId: ID, ttlSeconds: 10 },
  })
  assert.equal(disabled.statusCode, enabled ? 503 : 403)
  assert.equal(disabled.headers['cache-control'], 'no-store')
  const spoof = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host-pairings',
    headers,
    payload: { connectionId: ID, ttlSeconds: 10, ownerId: ID },
  })
  assert.equal(spoof.statusCode, 422)
  assert.equal(spoof.body.includes('ownerId'), false)
  const host = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host/poll',
    headers: { authorization: 'Bearer ' + 'a'.repeat(43) },
    payload: { limit: 1, redeliverSeconds: 15 },
  })
  assert.equal(host.statusCode, 503) // dedicated capability branch reached DB; JWT verification would be 401
  const actorHost = await app.inject({
    method: 'POST',
    url: '/api/v1/owner-host/poll',
    headers,
    payload: { limit: 1, redeliverSeconds: 15 },
  })
  assert.equal(actorHost.statusCode, 403)
  const escaped = await app.inject({
    method: 'POST',
    url: '/%61pi/v1/owner-host/redeem',
    payload: { code: 'private-canary', capability: 'private-canary' },
  })
  assert.equal(escaped.statusCode, 422)
  assert.equal(escaped.body.includes('private-canary'), false)
  const legacyText = await app.inject({
    method: 'POST',
    url: `/api/v1/owner-host/exchanges/${ID}/answer`,
    headers: { authorization: 'Bearer ' + 'a'.repeat(43) },
    payload: {
      kind: 'run',
      status: 'running',
      terminal: false,
      reportedModels: { state: 'collected', text: 'private-canary' },
    },
  })
  assert.equal(legacyText.statusCode, 422)
  assert.equal(legacyText.body.includes('private-canary'), false)
  await app.close()
}
async function child(scenario: string) {
  let pools = 0
  let listens = 0
  const logs: string[] = []
  mock.module('@sophia/persistence', {
    namedExports: {
      ...persistence,
      createPool: () => {
        pools++
        return {
          connect: () => Promise.reject(new Error('private-db-canary')),
          query: () => Promise.reject(new Error('private-db-canary')),
        }
      },
      checkRoleSafety: () => Promise.resolve(),
    },
  })
  mock.module('fastify', {
    defaultExport: (options: FastifyServerOptions) => {
      const app = Fastify({
        ...options,
        logger: {
          stream: {
            write: (line: string) => {
              logs.push(line)
            },
          },
        },
      })
      mock.method(app, 'listen', async () => {
        listens++
        await boundary(app, scenario === 'on')
        return 'fixture-no-listener'
      })
      return app
    },
  })
  if (scenario === 'invalid')
    await assert.rejects(import('./server.ts'), { message: 'SOPHIA_OWNER_HOST_ENROLLMENT is on, off or unset' })
  else await import('./server.ts')
  assert.equal(pools, scenario === 'invalid' ? 0 : 1)
  assert.equal(listens, pools)
  for (const secret of ['private-canary', 'private-db-canary', 'a'.repeat(43)])
    assert.equal(logs.join('').includes(secret), false)
  console.log('stock-entry-checked:' + scenario)
}
const childScenario = process.env[CHILD]
if (childScenario) await child(childScenario)
else
  for (const mode of ['unset', 'off', 'on', 'invalid'])
    test('stock enrollment entry ' + mode, () => {
      const env: NodeJS.ProcessEnv = { [CHILD]: mode }
      if (mode !== 'invalid')
        Object.assign(env, {
          SOPHIA_API_DATABASE_URL: 'postgres://fixture.invalid/unused',
          SUPABASE_JWT_ISSUER: ISSUER,
          SUPABASE_JWT_SECRET: SECRET,
        })
      if (mode !== 'unset') env.SOPHIA_OWNER_HOST_ENROLLMENT = mode === 'invalid' ? 'private-canary' : mode
      const r = spawnSync(process.execPath, ['--experimental-test-module-mocks', import.meta.filename], {
        env,
        encoding: 'utf8',
        timeout: 30_000,
      })
      assert.ifError(r.error)
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr)
      assert.equal(r.stdout.includes('stock-entry-checked:' + mode), true)
    })

// Real incoming HTTP sockets, with only verified identity and data-access work doubled. No injected lifecycle shortcut.

const localActor = { id: ID, name: null, contact: null, anonymous: false }
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function condition(check: () => boolean): Promise<void> {
  const until = Date.now() + 3000
  while (!check()) {
    if (Date.now() >= until) throw new Error('Mounted fixture condition deadline')
    await pause(10)
  }
}
function refusalPool(t: TestContext) {
  const pool = ownerHostFixtures(t).pool(new pg.Pool())
  let accesses = 0
  mock.method(pool, 'connect', () => {
    accesses++
    throw new DomainError('forbidden', 'Synthetic fixture access refused', {
      cause: Object.assign(new Error('Synthetic fixture access refused'), { code: '42501' }),
    })
  })
  return { pool, accesses: () => accesses }
}
async function mounted(t: TestContext, pool: pg.Pool, verifyActor: VerifyActor) {
  const { buildApp } = await import('./app.ts')
  const app = ownerHostFixtures(t).app(buildApp({ pool, ownerHostEnrollment: false, verifyActor }))
  return fixtureDeadline(app.listen({ host: '127.0.0.1', port: 0 }))
}
async function rawClient(t: TestContext, origin: string, partial = true, authorization = 'synthetic-slow') {
  const socket = new Socket()
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
  // Errors after our deliberate disconnect are client outcomes; connect/write errors below still reject setup.
  socket.on('error', () => undefined)
  // Drain the fixed refusal response so a remote FIN becomes an observed client close.
  socket.resume()
  ownerHostFixtures(t).own('incoming client close', async () => {
    socket.destroy()
    await fixtureDeadline(closed)
  })
  const url = new URL(origin)
  const wire = partial
    ? 'POST /api/v1/owner-host/redeem HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n{'
    : `GET /api/v1/owner-hosts HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${authorization}\r\nConnection: close\r\n\r\n`
  await fixtureDeadline(
    new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.connect(Number(url.port), '127.0.0.1', () => socket.write(wire, (err) => (err ? reject(err) : resolve())))
    }),
  )
  return { socket, closed }
}
async function management(origin: string, path = '/api/v1/owner-hosts'): Promise<number> {
  const response = await fetch(origin + path, {
    headers: { authorization: 'Bearer synthetic-owner' },
    signal: AbortSignal.timeout(3000),
  })
  await response.text()
  assert.equal(response.headers.get('cache-control'), 'no-store')
  return response.status
}
async function recovered(origin: string): Promise<void> {
  const until = Date.now() + 3000
  let status = await management(origin)
  while (status !== 403 && Date.now() < until) {
    await pause(25)
    status = await management(origin)
  }
  assert.equal(status, 403, 'management reaches its synthetic access refusal, not admission exhaustion')
}
if (!childScenario) {
  for (const ending of ['client disconnect', 'body deadline'] as const)
    test('mounted admission recovers after real partial-body ' + ending, async (t) => {
      const f = refusalPool(t),
        origin = await mounted(t, f.pool, () => Promise.resolve(localActor))
      assert.equal(await management(origin), 403)
      const clients = []
      for (let n = 0; n < 32; n++) clients.push(await rawClient(t, origin))
      let full = false
      for (let n = 0; n < 10 && !full; n++) {
        full = (await management(origin)) === 503
        if (!full) await pause(25)
      }
      assert.equal(full, true)
      if (ending === 'client disconnect') for (const c of clients) c.socket.destroy()
      await fixtureDeadline(Promise.all(clients.map((c) => c.closed)), 12_000)
      await recovered(origin)
      const response = await fetch(origin + '/api/v1/owner-host/poll', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + 'a'.repeat(43), 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 1, redeliverSeconds: 15 }),
        signal: AbortSignal.timeout(3000),
      })
      await response.text()
      assert.equal(response.status, 403)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.ok(f.accesses() > 1)
    })
  test('mounted admission retains aborted authorization work until the actual promise drains', async (t) => {
    const f = refusalPool(t),
      gate = Promise.withResolvers<void>()
    let pending = 0
    ownerHostFixtures(t).own(
      'authorization gate release',
      () => {
        gate.resolve()
      },
      'fences',
    )
    const origin = await mounted(t, f.pool, async (header) => {
      if (header === 'Bearer synthetic-slow') {
        pending++
        await gate.promise
      }
      return localActor
    })
    const clients = []
    for (let n = 0; n < 32; n++) clients.push(await rawClient(t, origin, false))
    await condition(() => pending === 32)
    for (const c of clients) c.socket.destroy()
    await fixtureDeadline(Promise.all(clients.map((c) => c.closed)))
    await pause(50)
    assert.equal(await management(origin), 503, 'no slot is released while authorization is still executing')
    assert.equal(f.accesses(), 0)
    gate.resolve()
    await recovered(origin)
    assert.equal(f.accesses(), 1, 'aborted authorization never advances into data access')
  })
  test('mounted admission retains an aborted executing handler until its actual query promise drains', async (t) => {
    const pool = ownerHostFixtures(t).pool(new pg.Pool()),
      gate = Promise.withResolvers<void>()
    let executing = 0
    ownerHostFixtures(t).own(
      'query gate release',
      () => {
        gate.resolve()
      },
      'fences',
    )
    mock.method(pool, 'connect', () =>
      Promise.resolve(
        Object.assign(new EventEmitter(), {
          query: async (sql: string) => {
            if (sql.includes('owner_host_list')) {
              executing++
              await gate.promise
              return { rows: [{ r: { hosts: [], pairings: [] } }] }
            }
            return { rows: [] }
          },
          release: () => undefined,
        }),
      ),
    )
    const origin = await mounted(t, pool, () => Promise.resolve(localActor)),
      clients = []
    for (let n = 0; n < 32; n++) {
      clients.push(await rawClient(t, origin, false, 'synthetic-owner'))
      await condition(() => executing === n + 1)
    }
    for (const c of clients) c.socket.destroy()
    await fixtureDeadline(Promise.all(clients.map((c) => c.closed)))
    await pause(50)
    assert.equal(await management(origin), 503, 'aborting a socket is not evidence that its handler finished')
    gate.resolve()
    await condition(() => executing === 32)
    await pause(50)
    const response = await fetch(origin + '/api/v1/owner-host-pairings', {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-owner', 'content-type': 'application/json' },
      body: JSON.stringify({ connectionId: ID, ttlSeconds: 60 }),
      signal: AbortSignal.timeout(3000),
    })
    await response.text()
    assert.equal(response.status, 403, 'OFF enrollment is reached again after all real handler promises drain')
  })
}
