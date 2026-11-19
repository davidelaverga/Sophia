// Stock server, real result controller/persistence; only pool and the long-running dispatcher listener are doubled.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mock, test } from 'node:test'
import * as persistence from '@sophia/persistence'
import * as runtime from './runtime-dispatch.ts'
import type { ResultController } from './runner-results.ts'
const CHILD = 'SOPHIA_WORKER_RESULT_ENTRY_CASE'

async function child(scenario: string) {
  let pools = 0
  let claims = 0
  let forwarded: ResultController | undefined
  mock.module('@sophia/persistence', {
    namedExports: {
      ...persistence,
      createPool: () => {
        pools += 1
        return {
          query: (sql: string) => {
            if (sql.includes('to_regprocedure')) return Promise.resolve({ rows: [{ ok: true }] })
            if (sql.includes('claim_runner_result() AS')) claims += 1
            return Promise.resolve({ rows: [{ r: sql.includes('maintain_runner_results') ? 0 : null }] })
          },
        }
      },
      checkRoleSafety: () => Promise.resolve(),
    },
  })
  mock.module('./runtime-dispatch.ts', {
    namedExports: {
      ...runtime,
      RuntimeDispatcher: class {
        constructor(_pool: unknown, options: { runnerResults: ResultController }) {
          forwarded = options.runnerResults
        }
        start() {
          forwarded?.pass()
        }
        async stop() {
          await forwarded?.stop()
        }
      },
    },
  })
  if (scenario === 'invalid')
    await assert.rejects(import('./server.ts'), { message: 'SOPHIA_OWNER_RUNNER_RESULTS is on, off or unset' })
  else {
    await import('./server.ts')
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.ok(forwarded, 'actual stock server forwarded controller to RuntimeDispatcher')
    await forwarded.stop()
    assert.equal(claims, scenario === 'on' ? 1 : 0)
  }
  assert.equal(pools, scenario === 'invalid' ? 0 : 1)
}
const scenario = process.env[CHILD]
if (scenario) await child(scenario)
else
  for (const [name, value] of [
    ['unset', undefined],
    ['off', 'off'],
    ['on', 'on'],
    ['invalid', 'true'],
  ] as const) {
    test(`stock worker result flag ${name} reaches its real result controller`, () => {
      const env: NodeJS.ProcessEnv = { [CHILD]: name }
      if (value !== undefined) env.SOPHIA_OWNER_RUNNER_RESULTS = value
      if (name !== 'invalid') env.SOPHIA_WORKER_DATABASE_URL = 'postgres://synthetic.invalid/unused'
      const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', import.meta.filename], {
        env,
        encoding: 'utf8',
        timeout: 30_000,
      })
      assert.ifError(result.error)
      assert.equal(result.status, 0, result.stdout + result.stderr)
    })
  }
