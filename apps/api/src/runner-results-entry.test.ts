// Stock entry with real Fastify/JWT and only startup pool/listen doubled. No listener or remote service.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test, mock } from 'node:test'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { SignJWT } from 'jose'
import * as persistence from '@sophia/persistence'
const CHILD = 'SOPHIA_RESULT_ENTRY_CASE'
const SECRET = 'synthetic-result-entry-signing-key-only'
const ISSUER = 'https://result-entry.invalid/auth/v1'
const ID = '10000000-0000-4000-8000-000000000001'

async function child(scenario: string) {
  let pools = 0
  let queries = 0
  mock.module('@sophia/persistence', {
    namedExports: {
      ...persistence,
      createPool: () => {
        pools += 1
        return {
          query: () => {
            queries += 1
            return Promise.resolve({ rows: [{ ok: false }] })
          },
          connect: () => {
            throw new Error('No connection permitted')
          },
        }
      },
      checkRoleSafety: () => Promise.resolve(),
    },
  })
  mock.module('fastify', {
    defaultExport: (options: FastifyServerOptions) => {
      const app = Fastify(options)
      mock.method(app, 'listen', async () => {
        const token = await new SignJWT({ role: 'authenticated' })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(ID)
          .setIssuer(ISSUER)
          .setAudience('authenticated')
          .setExpirationTime('5m')
          .sign(new TextEncoder().encode(SECRET))
        const headers = { authorization: `Bearer ${token}`, 'idempotency-key': 'same-original-key' }
        const response = await app.inject({
          method: 'POST',
          url: `/api/v1/projects/${ID}/runner-operations/${ID}/results`,
          headers,
          payload: { expectedOperationRevision: 1, maxPages: 8, maxBytes: 8192 },
        })
        assert.equal(response.statusCode, scenario === 'on' ? 503 : 403)
        assert.ok(response.body.includes(scenario === 'on' ? 'projection_unavailable' : 'runner_admission_disabled'))
        assert.equal(queries, scenario === 'on' ? 1 : 0)
        const retained = await app.inject({ url: `/api/v1/projects/${ID}/runner-results/${ID}`, headers })
        assert.equal(retained.statusCode, 503)
        assert.ok(retained.body.includes('projection_unavailable'), 'retained GET mounted independently of switch')
        await app.close()
        return 'no-listener'
      })
      return app
    },
  })
  if (scenario === 'invalid')
    await assert.rejects(import('./server.ts'), { message: 'SOPHIA_OWNER_RUNNER_RESULTS is on, off or unset' })
  else await import('./server.ts')
  assert.equal(pools, scenario === 'invalid' ? 0 : 1)
}
const scenario = process.env[CHILD]
if (scenario) await child(scenario)
else
  for (const [name, value] of [
    ['unset', undefined],
    ['off', 'off'],
    ['on', 'on'],
    ['invalid', ' on'],
  ] as const) {
    test(`stock API result flag ${name} reaches real router before any side effect`, () => {
      const env: NodeJS.ProcessEnv = { [CHILD]: name }
      if (value !== undefined) env.SOPHIA_OWNER_RUNNER_RESULTS = value
      if (name !== 'invalid')
        Object.assign(env, {
          SOPHIA_API_DATABASE_URL: 'postgres://synthetic.invalid/unused',
          SUPABASE_JWT_ISSUER: ISSUER,
          SUPABASE_JWT_SECRET: SECRET,
        })
      const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', import.meta.filename], {
        env,
        encoding: 'utf8',
        timeout: 30_000,
      })
      assert.ifError(result.error)
      assert.equal(result.status, 0, result.stdout + result.stderr)
    })
  }
