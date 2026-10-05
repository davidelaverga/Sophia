// WBC-02 end to end through real HTTP (level: sql-run): a member proposes a source review and accepts it; the worker
// commissions one Paperclip issue through the sophia.coordination plugin (memory-host.ts: synthetic core issues, the
// plugin's namespace in its own PostgreSQL database); the sophia_dsh adapter is permitted, starts the one attempt
// through Sophia's native path, and observes; the runtime reviews over /v1/runtime/source-review/*; Hold, Resume and Stop,
// a cancelled run, a lost reply and a withdrawn source each settle where Sophia's records say. Synthetic HS256 tokens
// stand in for Supabase Auth; no model, provider or Paperclip service is contacted.
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { CoordinationObservation, RuntimeCommand } from '@sophia/contracts'
import { execute, httpSophiaClient, SophiaRefusal, type ExecuteDeps } from '@sophia/paperclip-adapters/sophia-dsh'
import { installNamespace, memoryPaperclip, type MemoryPaperclip } from '@sophia/paperclip-plugin/memory-host'
import { createPool, readSnapshot, withActor } from '@sophia/persistence'
import {
  createEmptyDatabase,
  createTestDatabase,
  registerRuntime,
  seedProject,
  type EmptyDatabase,
  type RegisteredRuntime,
  type TestDatabase,
} from '@sophia/test-support'
import { coordinateOnce, dispatchOnce, httpPaperclipClient } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const INTEGRATION_TOKEN = 'sophia-dsh-adapter-capability-for-tests-0001'
const OTHER_TOKEN = 'sophia-dsh-adapter-capability-for-tests-0002'
const COMPANY = 'company-a'
const PC_PROJECT = 'pc-project-a'
const REVIEW_ROLE = {
  id: 'sophia-source-review-v1',
  route: 'source-review-luna-high-v1',
  presetDigest: 'sha256:review',
}
const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const signing = generateKeyPairSync('ed25519')

let db: TestDatabase
let pcDb: EmptyDatabase
let pc: pg.Client
let pool: pg.Pool
let worker: pg.Pool
let app: FastifyInstance
let base: string

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any

async function call(path: string, init: { bearer?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: init.body === undefined ? 'GET' : 'POST',
    headers: {
      ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest()

async function asOwner<T>(fn: (owner: pg.Client) => Promise<T>): Promise<T> {
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  try {
    return await fn(owner)
  } finally {
    await owner.end()
  }
}

before(async () => {
  db = await createTestDatabase()
  pcDb = await createEmptyDatabase('sophia_pc')
  pc = new pg.Client({ connectionString: pcDb.ownerUrl })
  await pc.connect()
  await installNamespace(pc)
  pool = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({
    pool,
    verifyActor,
    ...(process.env.SOPHIA_TEST_LOG
      ? { logger: { stream: { write: (line: string) => process.stderr.write(line) } } }
      : {}),
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  await asOwner(async (owner) => {
    await owner.query(`SELECT sophia.register_coordination_integration($1, $2, 'paperclip test')`, [
      COMPANY,
      sha256(INTEGRATION_TOKEN),
    ])
    await owner.query(`SELECT sophia.register_coordination_integration('company-b', $1, 'another company')`, [
      sha256(OTHER_TOKEN),
    ])
  })
})
after(async () => {
  await app.close()
  await pool.end()
  await worker.end()
  await pc.end()
  await pcDb.drop()
  await db.drop()
})

const SOURCE_A =
  '# Launch brief\n\nThe launch is on 3 March. The budget is 40,000 EUR. Owners: Ana (site), Ben (press).\n'
const SOURCE_B = '# Press plan\n\nPress outreach starts 1 March. The budget is 25,000 EUR.\n'

/** A project enrolled for source review (both grants), two text sources, a ready runtime carrying the reviewer. */
async function world() {
  const { projectId, goalId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  const [sourceA, sourceB] = await asOwner(async (owner) => {
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      projectId,
    ])
    await owner.query(`SELECT sophia.set_coordination_grant($1, 'enabled', 2, $2, $3, 'approval:test')`, [
      projectId,
      COMPANY,
      PC_PROJECT,
    ])
    const put = async (body: string) =>
      (
        await owner.query<{ id: string }>(`SELECT (sophia.put_text_source($1, $2, 'text/markdown', $3)).id`, [
          projectId,
          A,
          body,
        ])
      ).rows[0]?.id ?? ''
    return [await put(SOURCE_A), await put(SOURCE_B)]
  })
  const rt: RegisteredRuntime = await registerRuntime(db.ownerUrl, { projectId, admin: A })
  const headers = {
    'x-sophia-runtime-unit': rt.runtimeUnitId,
    'x-sophia-bridge-instance': randomUUID(),
    'x-sophia-bridge-protocol': '1',
  }
  const runtime = (path: string, body?: unknown) => call(path, { bearer: rt.token, headers, body })
  const hello = await runtime('/v1/runtime/hello', {
    bundle: 'test',
    protocolVersion: 1,
    dshVersion: 'x',
    roles: [REVIEW_ROLE],
  })
  assert.equal(hello.status, 200, JSON.stringify(hello.json))
  assert.equal((await runtime('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
  const paperclip = memoryPaperclip(pc, {
    config: {
      signingPublicKey: signing.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      integrationUserId: 'user-sophia-integration',
      projects: [{ sophiaProjectId: projectId, companyId: COMPANY, paperclipProjectId: PC_PROJECT }],
    },
  })
  return { projectId, goalId, sourceA, sourceB, rt, runtime, paperclip }
}
type World = Awaited<ReturnType<typeof world>>

const member = async (actor: string, path: string, body?: unknown, key?: string) =>
  call(path, { bearer: await token(actor), body, headers: key ? { 'idempotency-key': key } : {} })

async function propose(w: World, over: Record<string, unknown> = {}, actor = E) {
  const body = { goalId: w.goalId, goalRevision: 1, sourceIds: [w.sourceA, w.sourceB], allowanceUsd: 0.5, ...over }
  return member(actor, `/api/v1/projects/${w.projectId}/plans/source-review`, body, randomUUID())
}

async function answer(
  w: World,
  proposal: ResponseBody,
  choice: 'accept' | 'decline',
  actor = E,
  key: string = randomUUID(),
) {
  const body = {
    operation_id: key,
    decision_id: proposal.decisionId,
    revision: proposal.decisionRevision,
    choice,
    work_id: proposal.workId,
    plan_id: proposal.planId,
    plan_revision: proposal.planRevision,
    candidate_version_ref: null,
  }
  return member(actor, `/api/v1/projects/${w.projectId}/decisions/${String(proposal.decisionId)}/answer`, body, key)
}

/** Proposed and accepted by the editor. */
async function accepted(w: World): Promise<ResponseBody> {
  const proposal = await propose(w)
  assert.equal(proposal.status, 201, JSON.stringify(proposal.json))
  const answered = await answer(w, proposal.json, 'accept')
  assert.equal(answered.status, 200, JSON.stringify(answered.json))
  assert.equal(answered.json.admission, 'recorded', JSON.stringify(answered.json))
  return proposal.json
}

/** The plugin route a path names, as the host matches it. */
function routeOf(path: string): { routeKey: string; issueId: string | null } {
  const control = /^\/issues\/([^/]+)\/control$/.exec(path)
  if (control?.[1]) return { routeKey: 'control', issueId: decodeURIComponent(control[1]) }
  const keys: Record<string, string> = { '/commissions/lookup': 'lookup', '/commissions': 'commission' }
  return { routeKey: keys[path] ?? 'unknown', issueId: null }
}

/** A Paperclip reached over the plugin's HTTP routes; `lose` drops the reply of a request after its effect. */
function pluginFetch(p: MemoryPaperclip, lose: () => boolean = () => false): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const path = url.pathname.replace('/api/plugins/sophia.coordination/api', '')
    const body: ResponseBody = JSON.parse(typeof init?.body === 'string' ? init.body : 'null')
    const { routeKey, issueId } = routeOf(path)
    const companyId = issueId ? (p.issues.get(issueId)?.companyId ?? '') : String(body.companyId)
    const res = await p.request({ routeKey, params: issueId ? { issueId } : {}, body, companyId })
    if (lose()) throw new TypeError('fetch failed: connection reset')
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  }
}

async function deliver(w: World, lose?: () => boolean) {
  const client = httpPaperclipClient({
    origin: 'http://paperclip.test',
    token: 'board-api-key',
    fetch: pluginFetch(w.paperclip, lose),
  })
  return coordinateOnce(worker, { workerId: 'test-coordinator', client, signingKey: signing.privateKey })
}

/** A Paperclip run id: unique, as Paperclip's are, since Sophia keys runs by company and run. */
const runId = (name: string) => `${name}-${randomUUID()}`

const sophia = (bearer = INTEGRATION_TOKEN) => httpSophiaClient({ origin: base, token: bearer })
const issueOf = (w: World) => {
  const [issue, ...more] = [...w.paperclip.issues.values()]
  assert.ok(issue, 'Paperclip holds the commissioned issue')
  assert.equal(more.length, 0, 'exactly one issue')
  return issue
}

const dispatchDue = () => dispatchOnce(worker, { workerId: 'test-worker', batchSize: 50 })

async function commandsFor(w: World, attemptId: string): Promise<RuntimeCommand[]> {
  await dispatchDue()
  const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
  return (batch.json.commands as Array<{ command: RuntimeCommand }>)
    .map((q) => q.command)
    .filter((c) => c.binding.attemptId === attemptId)
}

async function receipt(w: World, sent: RuntimeCommand, stage: 'delivered' | 'checked') {
  const res = await w.runtime('/v1/runtime/receipts', {
    receipts: [
      {
        commandId: sent.commandId,
        attemptId: sent.binding.attemptId,
        stage,
        nativeSessionId: `sophia-${sent.binding.attemptId}`,
        nativeSequence: 1,
        evidenceRefs: [],
        observedAt: new Date().toISOString(),
        reason: null,
      },
    ],
  })
  assert.equal(res.status, 204, JSON.stringify(res.json))
}

/** The runtime receives the create of an attempt and confirms it. */
async function created(w: World, attemptId: string): Promise<RuntimeCommand> {
  const create = (await commandsFor(w, attemptId)).find((c) => c.kind === 'create')
  assert.ok(create, 'the review was dispatched to the runtime')
  await receipt(w, create, 'delivered')
  return create
}

const REPORT = [
  '## Goal',
  'Check the launch brief against the press plan.',
  '## Evidence inspected',
  '- S1 launch brief, S2 press plan',
  '## Findings',
  '- The budgets differ: 40,000 EUR against 25,000 EUR.',
  '## What remains unknown',
  'Which budget is current.',
  '## Suggested next action',
  'Ask the owner which budget stands.',
].join('\n')

/** What the bridge does for one review: the task, one metered model call, each source read, then a submit. */
async function reviewed(w: World, attemptId: string, cost = 0.000275) {
  const at = { attemptId, nativeSessionId: `sophia-${attemptId}` }
  const task = await w.runtime('/v1/runtime/source-review/context', at)
  assert.equal(task.status, 200, JSON.stringify(task.json))
  const reserve = await w.runtime('/v1/runtime/source-review/reserve', {
    ...at,
    callId: 'm1',
    kind: 'model',
    provider: 'openai-review',
    amountUsd: 0.01,
  })
  assert.equal(reserve.status, 200, JSON.stringify(reserve.json))
  const usage = {
    inputTokens: 1200,
    outputTokens: 300,
    cacheReadTokens: 100,
    provider: 'openai-review',
    model: 'gpt-6-luna',
  }
  const settle = await w.runtime('/v1/runtime/source-review/settle', {
    ...at,
    reservationId: reserve.json.reservationId,
    outcome: 'settled',
    costUsd: cost,
    usage,
  })
  assert.equal(settle.status, 200, JSON.stringify(settle.json))
  for (const sourceId of [w.sourceA, w.sourceB]) {
    const page = await w.runtime('/v1/runtime/source-review/context', { ...at, sourceId })
    assert.equal(page.status, 200, JSON.stringify(page.json))
  }
  const findings = [
    {
      status: 'contradicted',
      statement: 'The two budgets differ.',
      sourceIds: [w.sourceA, w.sourceB],
      criterionId: 'c1',
    },
  ]
  return w.runtime('/v1/runtime/source-review/submit', {
    ...at,
    callId: 's1',
    result: { verdict: 'changes_required', report: REPORT, findings },
  })
}

const board = async (w: World, actor = E) => member(actor, `/api/v1/projects/${w.projectId}/plans`)

/** The work item of the board's one review. */
async function itemOf(w: World, actor = E): Promise<ResponseBody> {
  const view = await board(w, actor)
  assert.equal(view.status, 200, JSON.stringify(view.json))
  const goals: ResponseBody[] = view.json.goals
  const goal = goals.find((g) => g.goal_id === w.goalId)
  assert.ok(goal, 'the reviewed goal is on the board')
  return goal.items[0]
}

/** Commissioned in Paperclip and started by a permitted run; the runtime has confirmed the create. */
async function running(w: World) {
  const proposal = await accepted(w)
  await deliver(w)
  const issue = issueOf(w)
  const run = { companyId: COMPANY, runId: runId('run') }
  const permit = await sophia().permit({ ...run, issueId: issue.id, agentId: 'agent-source-reviewer' })
  assert.equal(permit.decision, 'start', JSON.stringify(permit))
  const started = await sophia().start(run)
  assert.ok(started.attemptId)
  const create = await created(w, started.attemptId)
  return { proposal, issue, run, attemptId: started.attemptId, create }
}

async function command(
  w: World,
  proposal: ResponseBody,
  kind: string,
  attemptId: string | null,
  as: { actor?: string; generation?: number } = {},
) {
  const key = randomUUID()
  const item = await itemOf(w)
  const { actor = E, generation = 1 } = as
  const body = {
    operation_id: key,
    kind,
    work_id: proposal.workId,
    assignment_id: item.assignment.assignment_id,
    assignment_generation: generation,
    attempt_id: attemptId,
  }
  return member(
    actor,
    `/api/v1/projects/${w.projectId}/assignments/${String(item.assignment.assignment_id)}/commands`,
    body,
    key,
  )
}

const refusedAs = (code: string) => (err: unknown) => err instanceof SophiaRefusal && err.code === code

describe('one Paperclip-managed source review', () => {
  it('is proposed, accepted, commissioned once, started once, reviewed, and shown on the board (INT-03/04/06/09/15/16/17)', async () => {
    const w = await world()
    const open = await member(E, `/api/v1/projects/${w.projectId}/plans/source-review`)
    assert.equal(open.status, 200, JSON.stringify(open.json))
    assert.deepEqual([open.json.enabled, open.json.runtimeReady, open.json.maxAllowanceUsd], [true, true, 2])
    assert.equal(open.json.route.role, REVIEW_ROLE.id)
    assert.equal((await member(V, `/api/v1/projects/${w.projectId}/plans/source-review`)).json.enabled, false)

    const proposal = await propose(w)
    assert.equal(proposal.status, 201, JSON.stringify(proposal.json))
    assert.equal((await propose(w, { allowanceUsd: 3 })).status, 422, 'above the cap')
    const goals: ResponseBody[] = (await board(w)).json.goals
    const proposed = goals.find((g) => g.goal_id === w.goalId)
    assert.deepEqual([proposed.current_plan, proposed.proposed_plans.length, proposed.items.length], [null, 1, 0])
    assert.equal(proposed.decisions[0].state, 'proposed')
    assert.equal((await answer(w, proposal.json, 'accept', V)).json.rejection, 'denied', 'only the proposer decides')
    assert.equal(w.paperclip.issues.size, 0, 'a proposal commissions nothing')

    const key = randomUUID()
    const accept = await answer(w, proposal.json, 'accept', E, key)
    assert.equal(accept.json.effect, 'choice_recorded', JSON.stringify(accept.json))
    assert.deepEqual(
      (await answer(w, proposal.json, 'accept', E, key)).json.receipt_id,
      accept.json.receipt_id,
      'a replay answers the same receipt',
    )

    const pass = await deliver(w)
    assert.deepEqual(
      pass.outcomes.map((o) => [o.op, o.outcome]),
      [['commission', 'delivered']],
    )
    const issue = issueOf(w)
    assert.equal(issue.assigneeAgentId, 'agent-source-reviewer')
    assert.equal(issue.title.startsWith('Source review'), true)
    assert.ok(!issue.description.includes('40,000'), 'no source text leaves Sophia')
    assert.equal(w.paperclip.wakeups.length, 1)

    assert.equal(
      (await sophia().permit({ companyId: COMPANY, runId: runId('runx'), issueId: 'not-ours' })).code,
      'not_commissioned',
    )
    const run = { companyId: COMPANY, runId: runId('run1') }
    assert.equal((await sophia().permit({ ...run, issueId: issue.id })).decision, 'start')
    const started = await sophia().start(run)
    assert.equal(started.started, true)
    assert.equal((await sophia().start(run)).attemptId, started.attemptId, 'the same run starts nothing twice')
    const run2 = { companyId: COMPANY, runId: runId('run2') }
    const attach = await sophia().permit({ ...run2, issueId: issue.id })
    assert.deepEqual(
      [attach.decision, attach.attemptId],
      ['attach', started.attemptId],
      'a second run attaches, never a second attempt',
    )
    await assert.rejects(sophia().start(run2), /attaches/)

    assert.ok(started.attemptId)
    const create = await created(w, started.attemptId)
    assert.equal(create.payload?.role, REVIEW_ROLE.id)
    assert.match(String(create.payload?.text), /Source review task/)
    assert.ok(
      String(create.payload?.text).includes(w.sourceA) && !String(create.payload?.text).includes('40,000'),
      'the task names sources, not their text',
    )
    assert.equal((await itemOf(w)).lifecycle, 'running')

    const at = { attemptId: started.attemptId, nativeSessionId: `sophia-${started.attemptId}` }
    const unread = await w.runtime('/v1/runtime/source-review/submit', {
      ...at,
      callId: 's0',
      result: {
        verdict: 'supported',
        report: REPORT,
        findings: [{ status: 'supported', statement: 'x', sourceIds: [w.sourceA] }],
      },
    })
    assert.equal(unread.status, 422, 'a finding may cite only a source the review read')
    const published = await reviewed(w, started.attemptId)
    assert.equal(published.json.outcome, 'published', JSON.stringify(published.json))
    // INT-09: a submit whose answer was lost is answered with the same immutable result; nothing runs again.
    const again = [{ status: 'supported', statement: 'A different submission.', sourceIds: [w.sourceA] }]
    const replay = await w.runtime('/v1/runtime/source-review/submit', {
      ...at,
      callId: 's1',
      result: { verdict: 'supported', report: REPORT, findings: again },
    })
    assert.deepEqual(
      [replay.json.replayed, replay.json.resultId, replay.json.sourceId],
      [true, published.json.resultId, published.json.sourceId],
    )

    const first = await sophia().observe({ ...run, final: true })
    assert.equal(first.phase, 'result_ready')
    assert.deepEqual(first.usage, {
      calls: 1,
      uncertainCalls: 0,
      inputTokens: 1200,
      outputTokens: 300,
      cachedInputTokens: 100,
      costUsd: 0.000275,
      models: ['gpt-6-luna'],
      providers: ['openai-review'],
      basis: 'per_run',
    })
    const second = await sophia().observe({ ...run2, final: true })
    assert.equal(second.usage?.calls, 0, 'a call is reported by one run only')

    const done = await deliver(w)
    assert.deepEqual(
      done.outcomes.map((o) => [o.op, o.outcome]),
      [['complete', 'delivered']],
    )
    assert.equal(issueOf(w).status, 'done')

    const item = await itemOf(w)
    assert.equal(item.lifecycle, 'complete')
    assert.equal(item.candidates.length, 1)
    // INT-16: the result is served at its exact version, with the hash of its bytes; another version is not this one.
    const version = String(item.candidates[0]?.version_id)
    const result = await member(
      E,
      `/api/v1/projects/${w.projectId}/work/${String(proposal.json.workId)}/result?version=${version}`,
    )
    assert.deepEqual([result.json.state, result.json.verdict, result.json.text], ['ready', 'changes_required', REPORT])
    assert.equal(result.json.sha256, createHash('sha256').update(REPORT).digest('hex'))
    const other = await member(
      E,
      `/api/v1/projects/${w.projectId}/work/${String(proposal.json.workId)}/result?version=${randomUUID()}`,
    )
    assert.equal(other.json.state, 'unavailable')
    // INT-15: an adverse review completes its own work and accepts nothing: the reviewed goal is as it was.
    const snap = await withActor(pool, E, 'read', (c) => readSnapshot(c, w.projectId))
    assert.deepEqual(
      snap?.goals.map((g) => [g.id, g.status]),
      [[w.goalId, 'running']],
      'the reviewed goal is untouched and the execution goal is not a project goal',
    )
  })

  it('reconciles a commission whose reply was lost by its key, never creating a second issue (INT-05)', async () => {
    const w = await world()
    await accepted(w)
    const lost = await deliver(w, () => true)
    assert.deepEqual(
      lost.outcomes.map((o) => o.outcome),
      ['unknown'],
    )
    assert.equal(w.paperclip.issues.size, 1, 'the effect happened; its reply did not arrive')
    assert.equal((await itemOf(w)).waiting_on[0]?.state, 'unknown')
    await asOwner((o) =>
      o.query(`UPDATE sophia.coordination_outbox SET available_at=now() WHERE project_id=$1`, [w.projectId]),
    )
    const reconciled = await deliver(w)
    assert.deepEqual(
      reconciled.outcomes.map((o) => [o.op, o.outcome]),
      [['commission', 'delivered']],
    )
    assert.equal(w.paperclip.issues.size, 1)
    const issue = issueOf(w)
    assert.equal(
      (await sophia().permit({ companyId: COMPANY, runId: runId('r1'), issueId: issue.id })).decision,
      'start',
    )
  })

  it('an expired decision is refused as expired and commissions nothing (INT-03)', async () => {
    const w = await world()
    const proposal = await propose(w)
    await asOwner((o) =>
      o.query(`UPDATE sophia.work_decisions SET expires_at = now() - interval '1 minute' WHERE project_id=$1`, [
        w.projectId,
      ]),
    )
    const late = await answer(w, proposal.json, 'accept')
    assert.deepEqual([late.json.admission, late.json.rejection], ['rejected', 'expired'])
    assert.equal((await deliver(w)).outcomes.length, 0)
    assert.equal(w.paperclip.issues.size, 0)
  })

  it('declining commissions nothing', async () => {
    const w = await world()
    const proposal = await propose(w)
    const declined = await answer(w, proposal.json, 'decline')
    assert.equal(declined.json.effect, 'choice_recorded')
    assert.equal((await deliver(w)).outcomes.length, 0)
    assert.equal(w.paperclip.issues.size, 0)
  })
})

describe('control', () => {
  it('Hold, Resume and Stop from Sophia fence the runtime and reach the issue; nothing restarts a stopped review (INT-10/11)', async () => {
    const w = await world()
    const { proposal, issue, attemptId } = await running(w)
    assert.equal(
      (await command(w, proposal, 'hold', attemptId, { actor: V })).json.rejection,
      'denied',
      'a viewer cannot hold',
    )
    assert.equal(
      (await command(w, proposal, 'hold', attemptId, { generation: 2 })).json.rejection,
      'conflict',
      'a stale generation',
    )
    assert.equal((await command(w, proposal, 'guidance', attemptId)).json.rejection, 'unavailable')

    const hold = await command(w, proposal, 'hold', attemptId)
    assert.equal(hold.status, 202, JSON.stringify(hold.json))
    assert.equal(hold.json.effect, 'pending')
    const holdCommand = (await commandsFor(w, attemptId)).find((c) => c.kind === 'hold')
    assert.ok(holdCommand, 'the Hold reached the runtime')
    const at = { attemptId, nativeSessionId: `sophia-${attemptId}` }
    assert.equal(
      (
        await w.runtime('/v1/runtime/source-review/reserve', {
          ...at,
          callId: 'm9',
          kind: 'model',
          provider: 'openai-review',
          amountUsd: 0.01,
        })
      ).status,
      409,
      'fenced at once',
    )
    await receipt(w, holdCommand, 'checked')
    const settled = await member(E, `/api/v1/projects/${w.projectId}/work/operations/${String(hold.json.operation_id)}`)
    assert.deepEqual([settled.json.effect, settled.json.revision], ['held', 4])
    await deliver(w)
    assert.equal(w.paperclip.issues.get(issue.id)?.status, 'blocked')
    assert.equal((await itemOf(w)).lifecycle, 'held')
    assert.equal((await sophia().permit({ companyId: COMPANY, runId: runId('runh'), issueId: issue.id })).code, 'held')

    const resume = await command(w, proposal, 'resume', attemptId)
    assert.equal(resume.status, 202, JSON.stringify(resume.json))
    await deliver(w)
    assert.equal(w.paperclip.issues.get(issue.id)?.status, 'todo')
    assert.ok(w.paperclip.wakeups.length >= 2, 'a Resume wakes the assignee')

    const stop = await command(w, proposal, 'stop', null)
    assert.equal(stop.status, 202, JSON.stringify(stop.json))
    const stopCommand = (await commandsFor(w, attemptId)).find((c) => c.kind === 'stop')
    if (stopCommand) await receipt(w, stopCommand, 'checked')
    await deliver(w)
    assert.equal(w.paperclip.issues.get(issue.id)?.status, 'cancelled')
    assert.equal(
      (await sophia().permit({ companyId: COMPANY, runId: runId('runs'), issueId: issue.id })).code,
      'stopped',
    )
  })

  it('a cancelled Paperclip run holds the work and says held only once Sophia settled it', async () => {
    const w = await world()
    await accepted(w)
    await deliver(w)
    const issue = issueOf(w)
    const controller = new AbortController()
    const log: string[] = []
    let clock = 0
    const deps: ExecuteDeps = {
      client: sophia(),
      pollMs: 1000,
      settleMs: 10_000,
      maxRunMs: 60_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
        const attempt = await asOwner(
          async (o) =>
            (await o.query<{ id: string }>(`SELECT id FROM sophia.work_attempts WHERE project_id=$1`, [w.projectId]))
              .rows[0]?.id,
        )
        if (!attempt) return
        const commands = await commandsFor(w, attempt)
        const create = commands.find((c) => c.kind === 'create')
        if (create && !log.includes('created')) {
          await receipt(w, create, 'delivered')
          log.push('created')
          controller.abort()
          return
        }
        const hold = commands.find((c) => c.kind === 'hold')
        if (hold && !log.includes('settled')) {
          await receipt(w, hold, 'checked')
          log.push('settled')
        }
      },
    }
    const result = await execute(
      {
        signal: controller.signal,
        onCancellationReady: () => Promise.resolve(),
        onDispatch: () => log.push('dispatch'),
        runId: runId('runc'),
        agent: { id: 'agent-source-reviewer', companyId: COMPANY, name: 'Sophia source reviewer' },
        runtime: { sessionParams: null, sessionDisplayId: null },
        config: {},
        context: { issueId: issue.id },
        onLog: () => Promise.resolve(),
      },
      deps,
    )
    assert.equal(result.errorCode, 'sophia_held', JSON.stringify(result))
    assert.deepEqual(log, ['dispatch', 'created', 'settled'])
    assert.equal((await itemOf(w)).lifecycle, 'held')
    await deliver(w)
    assert.equal(w.paperclip.issues.get(issue.id)?.status, 'blocked', 'the Hold is mirrored back')
  })

  it('a run of the adapter publishes the review and reports its own usage (G3)', async () => {
    const w = await world()
    await accepted(w)
    await deliver(w)
    const issue = issueOf(w)
    let reviewedOnce = false
    const deps: ExecuteDeps = {
      client: sophia(),
      pollMs: 1000,
      settleMs: 10_000,
      maxRunMs: 60_000,
      now: () => 0,
      sleep: async () => {
        if (reviewedOnce) return
        const attempt = await asOwner(
          async (o) =>
            (await o.query<{ id: string }>(`SELECT id FROM sophia.work_attempts WHERE project_id=$1`, [w.projectId]))
              .rows[0]?.id,
        )
        assert.ok(attempt)
        await created(w, attempt)
        assert.equal((await reviewed(w, attempt, 0.0005)).json.outcome, 'published')
        reviewedOnce = true
      },
    }
    const result = await execute(
      {
        runId: runId('runa'),
        agent: { id: 'agent-source-reviewer', companyId: COMPANY, name: 'Sophia source reviewer' },
        runtime: { sessionParams: null, sessionDisplayId: null },
        config: {},
        context: { issueId: issue.id },
        onLog: () => Promise.resolve(),
      },
      deps,
    )
    assert.equal(result.exitCode, 0, JSON.stringify(result))
    assert.deepEqual(
      [result.usageBasis, result.costUsd, result.model, result.provider],
      ['per_run', 0.0005, 'gpt-6-luna', 'openai-review'],
    )
  })
})

describe('bounds and recovery', () => {
  it('caps a review at eight model requests and buys no web search (INT-06/18)', async () => {
    const w = await world()
    const { attemptId } = await running(w)
    const at = { attemptId, nativeSessionId: `sophia-${attemptId}` }
    for (let i = 1; i <= 8; i += 1) {
      const r = await w.runtime('/v1/runtime/source-review/reserve', {
        ...at,
        callId: `m${String(i)}`,
        kind: 'model',
        provider: 'openai-review',
        amountUsd: 0.01,
      })
      assert.equal(r.status, 200, JSON.stringify(r.json))
    }
    const ninth = await w.runtime('/v1/runtime/source-review/reserve', {
      ...at,
      callId: 'm9',
      kind: 'model',
      provider: 'openai-review',
      amountUsd: 0.01,
    })
    assert.equal(ninth.json.code, 'research_limit_reached', JSON.stringify(ninth.json))
    const search = await w.runtime('/v1/runtime/source-review/reserve', {
      ...at,
      callId: 'w1',
      kind: 'search',
      provider: 'tavily',
      amountUsd: 0.01,
      query: 'x',
    })
    assert.equal(search.status, 422, 'a review buys no web search')
  })

  it('nudges a turn that ended without a result once, then fails the work (no_result_submitted)', async () => {
    const w = await world()
    const { issue, run, attemptId, create } = await running(w)
    const session = `sophia-${attemptId}`
    const seen = (nativeSeq: number, type: string, data: unknown) => ({
      runtimeUnitId: w.rt.runtimeUnitId,
      attemptId,
      nativeSessionId: session,
      nativeSeq,
      type,
      durable: true,
      data,
    })
    const turn = async (from: number) => {
      const res = await w.runtime('/v1/runtime/observations', {
        observations: [
          seen(from, 'turn/start', { turn: from }),
          seen(from + 1, 'assistant/message', {
            text: 'I reviewed it.',
            truncated: false,
            provider: 'p',
            model: 'm',
            interrupted: false,
          }),
          seen(from + 2, 'turn/end', { turn: from, reason: { kind: 'completed' } }),
        ],
      })
      assert.equal(res.status, 204, JSON.stringify(res.json))
    }
    await turn(2)
    const nudge = (await commandsFor(w, attemptId)).find((c) => c.kind === 'input')
    assert.ok(nudge, 'one nudge is sent')
    assert.match(String(nudge.payload?.text), /submit_source_review/)
    assert.notEqual(nudge.commandId, create.commandId)
    const delivered = await w.runtime('/v1/runtime/receipts', {
      receipts: [
        {
          commandId: nudge.commandId,
          attemptId,
          stage: 'delivered',
          nativeSessionId: session,
          nativeSequence: 5,
          evidenceRefs: [],
          observedAt: new Date().toISOString(),
          reason: null,
        },
      ],
    })
    assert.equal(delivered.status, 204, JSON.stringify(delivered.json))
    await turn(6)
    assert.equal((await commandsFor(w, attemptId)).filter((c) => c.kind === 'input').length, 1, 'never a second nudge')
    const observed = await sophia().observe(run)
    assert.deepEqual([observed.phase, observed.reason?.startsWith('no_result_submitted')], ['failed', true])
    await deliver(w)
    assert.equal(w.paperclip.issues.get(issue.id)?.status, 'cancelled')
    assert.equal((await itemOf(w)).lifecycle, 'failed')
  })

  it('withdrawing an input stops the work, and withdraws a published result (INT-13)', async () => {
    const w = await world()
    const { proposal, run, attemptId } = await running(w)
    assert.equal((await reviewed(w, attemptId)).json.outcome, 'published')
    await asOwner((o) =>
      o.query(`UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        w.sourceB,
      ]),
    )
    const observed: CoordinationObservation = await sophia().observe(run)
    assert.equal(observed.phase, 'withdrawn')
    const result = await member(E, `/api/v1/projects/${w.projectId}/work/${String(proposal.workId)}/result`)
    assert.equal(result.json.state, 'withdrawn')
    assert.equal(result.json.text, undefined, 'a withdrawn result is not served')
  })

  it('refuses a withdrawn input before any start (INT-13)', async () => {
    const w = await world()
    await accepted(w)
    await deliver(w)
    await asOwner((o) =>
      o.query(`UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        w.sourceA,
      ]),
    )
    const permit = await sophia().permit({ companyId: COMPANY, runId: runId('r'), issueId: issueOf(w).id })
    assert.equal(permit.decision, 'deny')
  })

  it("takes only the adapter's own capability, for its own company, never a member's token (INT-02)", async () => {
    const w = await world()
    await accepted(w)
    await deliver(w)
    const issueId = issueOf(w).id
    await assert.rejects(
      sophia('not-a-registered-capability-at-all-000').permit({ companyId: COMPANY, runId: runId('r'), issueId }),
      refusedAs('coordination_capability_required'),
    )
    await assert.rejects(
      sophia(OTHER_TOKEN).permit({ companyId: COMPANY, runId: runId('r'), issueId }),
      refusedAs('forbidden'),
    )
    const asMember = await call('/v1/coordination/permit', {
      bearer: await token(E),
      body: { companyId: COMPANY, runId: runId('r'), issueId },
    })
    assert.notEqual(asMember.status, 200)
  })
})
