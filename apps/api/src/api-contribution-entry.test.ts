// Import the actual stock entry in a separate process, with real Fastify routes, schemas and JWT verification.
// Only pool startup/safety and listen are doubled: any database access fails; no socket, companion or provider starts.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it, mock } from 'node:test'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import { SignJWT } from 'jose'
import * as persistence from '@sophia/persistence'

const CHILD = 'SOPHIA_API_ENTRY_TEST_CASE'
const SECRET = 'entry-test-only-synthetic-signing-key'
const ISSUER = 'https://entry-test.invalid/auth/v1'
const PROJECT = '10000000-0000-4000-8000-000000000001'
const FUNDING = `/api/v1/projects/${PROJECT}/research-funding`
const TASK_FUNDING = `/api/v1/projects/${PROJECT}/research-tasks/${PROJECT}/funding`
const CONFIG_ERROR = 'SOPHIA_API_CONTRIBUTIONS is on, off or unset'

/** A valid synthetic actor token exercises the real verifier without JWKS, account credentials or a remote call. */
function actorToken(): Promise<string> {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('20000000-0000-4000-8000-000000000002')
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
}

async function checkExposedBoundary(app: FastifyInstance): Promise<void> {
  const unauthenticated = await app.inject({ method: 'PUT', url: FUNDING, payload: {} })
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal((await app.inject(TASK_FUNDING)).statusCode, 401)
  const authorization = `Bearer ${await actorToken()}`
  for (const field of ['actorId', 'requesterId', 'ownerId', 'payer', 'credential']) {
    const spoofed = await app.inject({
      method: 'PUT',
      url: FUNDING,
      headers: { authorization, 'idempotency-key': `entry-test-${field}` },
      payload: { grantId: PROJECT, expectedRevision: 1, [field]: PROJECT },
    })
    assert.equal(spoofed.statusCode, 422, field)
    assert.match(spoofed.body, /must NOT have additional properties/, field)
  }
}

/** Assertions run at the actual entry's listen boundary; route injection never opens a network listener. */
async function checkStockApp(app: FastifyInstance, scenario: string): Promise<void> {
  const enabled = scenario === 'on'
  assert.equal(app.hasRoute({ method: 'PUT', url: '/api/v1/projects/:projectId/research-funding' }), enabled)
  assert.equal(
    app.hasRoute({ method: 'GET', url: '/api/v1/projects/:projectId/research-tasks/:taskId/funding' }),
    enabled,
  )
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/v1/me/api-resources' }), enabled)
  assert.equal(app.hasRoute({ method: 'POST', url: '/v1/runtime/research/reserve' }), true)
  assert.equal(app.hasRoute({ method: 'POST', url: '/v1/runtime/research/bound/apply' }), false)
  assert.equal((await app.inject('/health')).statusCode, 200)
  if (enabled) await checkExposedBoundary(app)
  await app.close()
}

async function runStockEntry(scenario: string): Promise<void> {
  let pools = 0
  let safetyChecks = 0
  let listens = 0
  let databaseAccesses = 0
  const refuseDatabase = () => {
    databaseAccesses += 1
    throw new Error('Entry test must not access a database')
  }
  mock.module('@sophia/persistence', {
    namedExports: {
      ...persistence,
      createPool: () => {
        pools += 1
        return { query: refuseDatabase, connect: refuseDatabase }
      },
      checkRoleSafety: () => {
        safetyChecks += 1
        return Promise.resolve()
      },
    },
  })
  mock.module('fastify', {
    defaultExport: (options: FastifyServerOptions) => {
      const app = Fastify(options)
      mock.method(app, 'listen', async () => {
        listens += 1
        await checkStockApp(app, scenario)
        return 'entry-test-no-listener'
      })
      return app
    },
  })
  if (scenario === 'invalid') await assert.rejects(import('./server.ts'), { message: CONFIG_ERROR })
  else await import('./server.ts')
  assert.equal(pools, scenario === 'invalid' ? 0 : 1)
  assert.equal(safetyChecks, pools)
  assert.equal(listens, pools)
  assert.equal(databaseAccesses, 0)
  process.stdout.write(`entry-tested:${scenario}\n`)
}

function runChild(scenario: string, value: string | undefined): void {
  const env: NodeJS.ProcessEnv = { [CHILD]: scenario }
  // Invalid config must fail even before the otherwise-required database/auth setup is read.
  if (scenario !== 'invalid') {
    env.SOPHIA_API_DATABASE_URL = 'postgres://entry-test.invalid/not-used'
    env.SUPABASE_JWT_ISSUER = ISSUER
    env.SUPABASE_JWT_SECRET = SECRET
  }
  if (value !== undefined) env.SOPHIA_API_CONTRIBUTIONS = value
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', import.meta.filename], {
    env,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null, result.stderr)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.ok(result.stdout.includes(`entry-tested:${scenario}`), result.stdout)
}

const scenario = process.env[CHILD]
if (scenario !== undefined) {
  await runStockEntry(scenario)
} else {
  describe('actual stock entry contribution exposure (no database or provider)', () => {
    for (const [name, value] of [
      ['unset', undefined],
      ['off', 'off'],
      ['on', 'on'],
      ['invalid', 'true'],
    ] as const) {
      it(name, () => runChild(name, value))
    }
  })
}
