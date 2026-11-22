import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
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
  assert.ok(procedures.includes('sophia.retain_managed_explore_output(uuid,uuid,uuid,jsonb,bytea)'))
  return Promise.resolve({ rows: [{ ready: false }] })
}

test('configured observation and sending refuse startup without dispatch and retention SQL', async () => {
  for (const mode of ['observe', 'send'] as const) {
    const config = managedExploreConfig({ ...ENV, SOPHIA_MANAGED_EXPLORE_WORKER: mode }, WORKER)

    await assert.rejects(
      managedExploreWorkerFromConfig(
        { query: missingReadiness } as unknown as pg.Pool,
        config,
        () => assert.fail('unexpected retention'),
        assert.fail,
      ),
      /must be ready/,
    )
  }
})

test('one worker pass drains with the outbound gate closed and no later pass', async () => {
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  let passes = 0
  const worker = new ManagedExploreWorker(async (maySend) => {
    passes += 1
    assert.equal(maySend(), true)
    entered.resolve()
    await resume.promise
    assert.equal(maySend(), false)
  }, assert.fail)
  worker.tick()
  await entered.promise
  worker.tick()
  const stop = worker.stop()
  worker.tick()
  resume.resolve()
  await stop
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
    assert.ok(['BEGIN', 'COMMIT'].includes(sql), sql)
    return Promise.resolve({ rows: [] })
  }
  const pool = {
    query: () => Promise.resolve({ rows: [{ ready: true }] }),
    connect: () => Promise.resolve({ query, release: () => undefined }),
  } as unknown as pg.Pool
  let writes = 0
  const worker = await managedExploreWorkerFromConfig(
    pool,
    config,
    (usedPool, identity, output) => {
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
      return Promise.resolve({ kind: 'completed' })
    },
    assert.fail,
  )
  assert.ok(worker)
  worker.tick()
  await worker.stop()
  assert.equal(writes, 1)
  assert.equal(requests.length, 4)
})
