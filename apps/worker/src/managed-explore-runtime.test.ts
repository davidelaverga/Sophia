import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type pg from 'pg'
import {
  ManagedExploreWorker,
  managedExploreConfig,
  managedExploreWorkerFromConfig,
} from './managed-explore-runtime.ts'

const ENV = {
  SOPHIA_MANAGED_EXPLORE: 'on',
  SOPHIA_MANAGED_EXPLORE_ROUTE_ID: 'fixture-route:v1',
  SOPHIA_MANAGED_EXPLORE_OPENAI_ORGANIZATION: 'org_fixture',
  SOPHIA_MANAGED_EXPLORE_OPENAI_PROJECT: 'proj_fixture',
  SOPHIA_MANAGED_EXPLORE_CREDENTIAL_GENERATION: '3',
  SOPHIA_MANAGED_EXPLORE_OPENAI_API_KEY: 'fake-fixture-key',
}
const WORKER = 'fixture:7'

test('worker dispatch is independently off by default, and configured modes require a complete fixed scope', async () => {
  const off = managedExploreConfig(ENV, WORKER)
  assert.deepEqual(off, { mode: 'off' })
  assert.equal(
    await managedExploreWorkerFromConfig({} as pg.Pool, off, () => assert.fail('unexpected retention'), assert.fail),
    null,
  )
  for (const mode of ['observe', 'send'] as const) {
    const config = managedExploreConfig({ ...ENV, SOPHIA_MANAGED_EXPLORE_WORKER: mode }, WORKER)
    assert.ok(config.mode !== 'off')
    assert.deepEqual(config.scope, {
      workerId: WORKER,
      routeId: ENV.SOPHIA_MANAGED_EXPLORE_ROUTE_ID,
      providerOrg: ENV.SOPHIA_MANAGED_EXPLORE_OPENAI_ORGANIZATION,
      providerProject: ENV.SOPHIA_MANAGED_EXPLORE_OPENAI_PROJECT,
      credentialGeneration: 3,
      leaseSeconds: 60,
      allowSend: mode === 'send',
    })
    assert.throws(() => managedExploreConfig({ SOPHIA_MANAGED_EXPLORE_WORKER: mode }, WORKER), /required/)
  }
  assert.throws(
    () => managedExploreConfig({ SOPHIA_MANAGED_EXPLORE_WORKER: 'invalid-configuration' }, WORKER),
    (error: Error) => {
      assert.doesNotMatch(error.message, /invalid-configuration/)
      return true
    },
  )
})

const missingReadiness = (statement: string, [procedures]: [string[]]) => {
  assert.match(statement, /managed_explore_provider_input/)
  assert.match(statement, /has_function_privilege/)
  assert.ok(procedures.includes('sophia.refuse_managed_explore_session(uuid,uuid,uuid,text,text,text,text)'))
  assert.ok(procedures.includes('sophia.retain_managed_explore_output(uuid,uuid,uuid,jsonb,bytea)'))
  return Promise.resolve({ rows: [{ ready: false }] })
}

function setupStatement(statement: string) {
  assert.ok(['BEGIN', 'COMMIT'].includes(statement) || statement.includes("set_config('statement_timeout'"), statement)
  return Promise.resolve({ rows: [] })
}

async function assertSettles(pending: Promise<void>) {
  const sentinel = Symbol('sentinel')
  const timeout = new AbortController()
  try {
    assert.equal(await Promise.race([pending, delay(750, sentinel, { signal: timeout.signal })]), undefined)
  } finally {
    timeout.abort()
  }
}

test('configured observation and sending refuse startup without dispatch and retention SQL', async () => {
  for (const mode of ['observe', 'send'] as const) {
    const config = managedExploreConfig({ ...ENV, SOPHIA_MANAGED_EXPLORE_WORKER: mode }, WORKER)

    const pool = {
      connect: () =>
        Promise.resolve({
          query: (statement: string, args: [string[]]) =>
            statement.includes('to_regprocedure') ? missingReadiness(statement, args) : setupStatement(statement),
          release: () => undefined,
        }),
    } as unknown as pg.Pool
    await assert.rejects(
      managedExploreWorkerFromConfig(pool, config, () => assert.fail('unexpected retention'), assert.fail),
      /must be ready/,
    )
  }
})

test('one worker pass drains with the outbound gate closed and no later pass', async () => {
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  let passes = 0
  const worker = new ManagedExploreWorker(async (maySend, control) => {
    passes += 1
    assert.equal(maySend(), true)
    entered.resolve()
    await resume.promise
    assert.equal(maySend(), false)
    assert.equal(control.signal.aborted, true)
  }, assert.fail)
  worker.tick()
  await entered.promise
  worker.tick()
  const stop = worker.stop()
  worker.tick()
  resume.resolve()
  await assertSettles(stop)
  worker.tick()
  assert.equal(passes, 1)
})

test('the configured observe pass uses the restricted store and retains through the production adapter without a provider mutation', async (t) => {
  const config = managedExploreConfig({ ...ENV, SOPHIA_MANAGED_EXPLORE_WORKER: 'observe' }, WORKER)
  const input = 'saved typed input'
  const payloadSha256 = createHash('sha256').update(input).digest('hex')
  const claim = {
    projectId: 'project_fixture',
    turnId: 'local_turn_fixture',
    leaseToken: 'lease_fixture',
    providerSessionId: 'session_fixture',
    environmentId: 'environment_fixture',
    submissionId: 'submission_fixture',
    rootId: 'root_fixture',
    rootStatus: 'completed',
    turnKind: 'directions',
    allowSend: false,
    leaseUntil: new Date(Date.now() + 60_000).toISOString(),
    previousRootId: null,
    eventPossibleAt: new Date().toISOString(),
    payloadSha256,
  }
  const card = {
    label: 'Shore starts',
    firstActor: 'shore',
    nextStep: 'Assign',
    rationale: 'One queue',
    tradeoff: 'Shore starts',
    steps: [
      { id: 'a', label: 'Assign', lane: 'shore' },
      { id: 'b', label: 'Confirm', lane: 'vessel' },
    ],
    edges: [{ from: 'a', to: 'b' }],
  }
  const directions = [card, { ...card, label: 'Vessel starts', firstActor: 'vessel', nextStep: 'Request' }]
  const items = [
    {
      type: 'message',
      role: 'user',
      status: 'completed',
      turn_id: claim.rootId,
      content: [{ type: 'input_text', text: input }],
    },
    {
      type: 'message',
      role: 'assistant',
      status: 'completed',
      phase: 'final_answer',
      turn_id: claim.rootId,
      content: [{ type: 'output_text', text: JSON.stringify({ directions }) }],
    },
  ]
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', (url: string, init: RequestInit) => {
    const parsed = new URL(url)
    assert.equal(parsed.origin, 'https://api.openai.com')
    assert.equal(init.method, 'GET')
    const headers = new Headers(init.headers)
    assert.equal(headers.get('OpenAI-Organization'), ENV.SOPHIA_MANAGED_EXPLORE_OPENAI_ORGANIZATION)
    assert.equal(headers.get('OpenAI-Project'), ENV.SOPHIA_MANAGED_EXPLORE_OPENAI_PROJECT)
    requests.push(parsed.pathname)
    if (parsed.pathname.endsWith('/items')) return Promise.resolve(Response.json({ data: items, has_more: false }))
    assert.ok(parsed.pathname.endsWith(`/turns/${claim.rootId}`))
    return Promise.resolve(
      Response.json({
        id: claim.rootId,
        session_id: claim.providerSessionId,
        subagent_id: null,
        status: 'completed',
        created_at: 1,
        started_at: 1,
        completed_at: 2,
      }),
    )
  })
  const query = (sql: string, args?: unknown[]) => {
    if (sql.includes('claim_managed_explore_dispatch')) {
      assert.deepEqual(args, [
        WORKER,
        ENV.SOPHIA_MANAGED_EXPLORE_ROUTE_ID,
        3,
        ENV.SOPHIA_MANAGED_EXPLORE_OPENAI_ORGANIZATION,
        ENV.SOPHIA_MANAGED_EXPLORE_OPENAI_PROJECT,
        60,
        false,
      ])
      return Promise.resolve({ rows: [{ result: claim }] })
    }
    if (sql.includes('to_regprocedure')) return Promise.resolve({ rows: [{ ready: true }] })
    return setupStatement(sql)
  }
  const pool = {
    connect: () => Promise.resolve({ query, release: () => undefined }),
  } as unknown as pg.Pool
  let writes = 0
  const retained = Promise.withResolvers<void>()
  const worker = await managedExploreWorkerFromConfig(
    pool,
    config,
    (usedPool, identity, output, control) => {
      assert.ok(control)
      assert.equal(control.signal.aborted, false)
      assert.ok(control.deadline > performance.now())
      assert.equal(usedPool, pool)
      assert.deepEqual(
        { projectId: identity.projectId, turnId: identity.turnId, leaseToken: identity.leaseToken },
        {
          projectId: claim.projectId,
          turnId: claim.turnId,
          leaseToken: claim.leaseToken,
        },
      )
      assert.deepEqual(output, {
        kind: 'directions',
        providerSessionId: claim.providerSessionId,
        environmentId: claim.environmentId,
        rootId: claim.rootId,
        submissionId: claim.submissionId,
        payloadSha256,
        previousRootId: null,
        directions,
      })
      writes += 1
      retained.resolve()
      return Promise.resolve({ kind: 'completed' })
    },
    assert.fail,
  )
  assert.ok(worker)
  worker.tick()
  await assertSettles(retained.promise)
  await assertSettles(worker.stop())
  assert.equal(writes, 1)
  assert.equal(requests.length, 4)
})

test('drain settles an Explore pass waiting for a connection, and late checkout runs no SQL', async () => {
  const config = managedExploreConfig({ ...ENV, SOPHIA_MANAGED_EXPLORE_WORKER: 'send' }, WORKER)
  const queued = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<void>()
  const late = Promise.withResolvers<{ query: () => never; release: () => void }>()
  let checkouts = 0
  const pool = {
    connect: () => {
      if (checkouts++ === 0) {
        return Promise.resolve({
          query: (sql: string) =>
            sql.includes('to_regprocedure') ? Promise.resolve({ rows: [{ ready: true }] }) : setupStatement(sql),
          release: () => undefined,
        })
      }
      queued.resolve()
      return late.promise
    },
  } as unknown as pg.Pool
  const logs: string[] = []
  const worker = await managedExploreWorkerFromConfig(
    pool,
    config,
    () => assert.fail('unexpected retention'),
    (line) => logs.push(line),
  )
  assert.ok(worker)
  worker.tick()
  await assertSettles(queued.promise)
  await assertSettles(worker.stop())
  late.resolve({
    query: () => assert.fail('late checkout ran SQL after drain'),
    release: () => returned.resolve(),
  })
  await assertSettles(returned.promise)
  assert.equal(checkouts, 2)
  assert.equal(logs.length, 1)
})
