import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test, mock } from 'node:test'
import pg from 'pg'
import * as persistence from '@sophia/persistence'
import * as runtime from './runtime-dispatch.ts'
import { ownerHostRouteFromEnv, requireOwnerHostRoute, OwnerHostRouteController } from './owner-host-route.ts'
const ID = '10000000-0000-4000-8000-000000000001'
const tuple = {
  SOPHIA_OWNER_RUNNER_OWNER_ID: ID,
  SOPHIA_OWNER_RUNNER_ENVIRONMENT_REF: 'fixture-env',
  SOPHIA_OWNER_RUNNER_JOURNAL_ID: ID,
}
const route = {
  hostId: ID,
  journalId: ID,
  accountKey: 'fixture-account',
  profileId: 'fixture-profile',
  profileRevision: 1,
  t3Namespace: 'client:fixture',
  state: 'active',
  newWorkQualified: true,
}
const config = { ownerId: ID, environmentRef: 'fixture-env', journalId: ID, sends: true }
function poolFixture(qualified = true) {
  const pool = new pg.Pool()
  const calls: { sql: string; values: unknown[] }[] = []
  mock.method(pool, 'query', (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values })
    if (sql.includes('owner_host_original_route'))
      return Promise.resolve({ rows: [{ r: { ...route, newWorkQualified: qualified } }] })
    if (sql.includes('claim_owner_runner_outbox') || sql.includes('owner_runner_followups'))
      return Promise.resolve({ rows: [] })
    return Promise.resolve({ rows: [{ r: 0, n: 0 }] })
  })
  return { pool, calls }
}
const CHILD = 'SOPHIA_H_WORKER_ENTRY'
async function entry(scenario: string) {
  let pools = 0
  let starts = 0
  const f = poolFixture(scenario !== 'unqualified')
  mock.module('@sophia/persistence', {
    namedExports: {
      ...persistence,
      createPool: () => {
        pools++
        return f.pool
      },
      checkRoleSafety: () => Promise.resolve(),
    },
  })
  mock.module('./runtime-dispatch.ts', {
    namedExports: {
      ...runtime,
      RuntimeDispatcher: class {
        private readonly options: runtime.DispatcherOptions
        constructor(_pool: unknown, options: runtime.DispatcherOptions) {
          this.options = options
        }
        start() {
          starts++
          assert.ok(this.options.ownerHost instanceof OwnerHostRouteController)
          this.options.ownerHost.pass()
        }
        async stop() {
          await this.options.ownerHost?.stop()
        }
      },
    },
  })
  if (scenario === 'invalid') await assert.rejects(import('./server.ts'), /SOPHIA_OWNER_RUNNER_DISPATCH/)
  else if (scenario === 'unqualified') await assert.rejects(import('./server.ts'), /no currently qualified/)
  else await import('./server.ts')
  assert.equal(pools, scenario === 'invalid' ? 0 : 1)
  assert.equal(starts, ['invalid', 'unqualified'].includes(scenario) ? 0 : 1)
  if (scenario === 'on')
    assert.equal(
      f.calls.some((c) => c.sql.includes('owner_host_original_route') && c.values[2] === ID),
      true,
    )
  await f.pool.end()
  console.log('worker-entry-checked:' + scenario)
}
const childScenario = process.env[CHILD]
if (childScenario) await entry(childScenario)
else {
  test('dispatch config OFF preserves only explicitly configured maintenance; ON needs the entire tuple', () => {
    assert.equal(ownerHostRouteFromEnv({}), null)
    assert.deepEqual(ownerHostRouteFromEnv({ ...tuple, SOPHIA_OWNER_RUNNER_DISPATCH: 'off' }), {
      ...config,
      sends: false,
    })
    assert.deepEqual(ownerHostRouteFromEnv({ ...tuple, SOPHIA_OWNER_RUNNER_DISPATCH: 'on' }), config)
    for (const value of ['', 'on ', 'true', 'private-canary'])
      assert.throws(() => ownerHostRouteFromEnv({ ...tuple, SOPHIA_OWNER_RUNNER_DISPATCH: value }), {
        message: 'SOPHIA_OWNER_RUNNER_DISPATCH is on, off or unset',
      })
    assert.throws(() => ownerHostRouteFromEnv({ SOPHIA_OWNER_RUNNER_DISPATCH: 'on' }), /explicitly configured/)
    assert.throws(() => ownerHostRouteFromEnv({ SOPHIA_OWNER_RUNNER_OWNER_ID: ID }), /complete explicit/)
  })
  test('ON requires current records, OFF needs no qualification for maintenance', async () => {
    const f = poolFixture(false)
    try {
      await assert.rejects(requireOwnerHostRoute(f.pool, config), /no currently qualified/)
      await requireOwnerHostRoute(f.pool, { ...config, sends: false })
    } finally {
      await f.pool.end()
    }
  })
  test('controller has one owned promise and stock calls keep newWork false for OFF', async () => {
    const f = poolFixture()
    const c = new OwnerHostRouteController(f.pool, { ...config, sends: false }, 'fixture')
    c.pass()
    c.pass()
    await new Promise<void>((resolve) => setImmediate(resolve))
    await c.stop()
    assert.equal(f.calls.filter((v) => v.sql.includes('claim_owner_runner_outbox')).length, 1)
    assert.equal(f.calls.find((v) => v.sql.includes('claim_owner_runner_outbox'))?.values[3], false)
    const count = f.calls.length
    c.pass()
    assert.equal(f.calls.length, count)
    await f.pool.end()
  })
  for (const scenario of ['off', 'on', 'invalid', 'unqualified'])
    test('actual stock worker entry ' + scenario, () => {
      const env: NodeJS.ProcessEnv = { [CHILD]: scenario }
      if (scenario !== 'invalid') env.SOPHIA_WORKER_DATABASE_URL = 'postgres://fixture.invalid/unused'
      Object.assign(env, tuple, {
        SOPHIA_OWNER_RUNNER_DISPATCH: scenario === 'invalid' ? 'private-canary' : scenario === 'off' ? 'off' : 'on',
      })
      const r = spawnSync(process.execPath, ['--experimental-test-module-mocks', import.meta.filename], {
        env,
        encoding: 'utf8',
        timeout: 15000,
      })
      assert.ifError(r.error)
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr)
      assert.equal(r.stdout.includes('worker-entry-checked:' + scenario), true)
    })
}
