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
import {
  installNamespace,
  memoryPaperclip,
  NAMESPACE,
  type MemoryPaperclip,
  type MemoryPaperclipOptions,
} from '@sophia/paperclip-plugin/memory-host'
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
async function world(plugin: Pick<MemoryPaperclipOptions, 'fails'> = {}) {
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
    ...plugin,
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

/** One worker pass whose plugin calls go through `f`. */
const passWith = (f: typeof fetch) =>
  coordinateOnce(worker, {
    workerId: 'test-coordinator',
    client: httpPaperclipClient({ origin: 'http://paperclip.test', token: 'board-api-key', fetch: f }),
    signingKey: signing.privateKey,
  })

/** Each world's deliveries to its own plugin (any other to the first's, as `deliver` does). */
function routed(...worlds: World[]): typeof fetch {
  return async (input, init) => {
    const raw = typeof init?.body === 'string' ? init.body : ''
    const [first, ...rest] = worlds
    assert.ok(first)
    const target = rest.find((x) => raw.includes(x.projectId)) ?? first
    return pluginFetch(target.paperclip)(input, init)
  }
}

/** A pass's outcomes for one world's deliveries only: a pass claims every due delivery in the database. */
async function outcomesOf(w: World, pass: Awaited<ReturnType<typeof deliver>>) {
  const ids = new Set(
    await asOwner(async (o) =>
      (
        await o.query<{ id: string }>(`SELECT id::text AS id FROM sophia.coordination_outbox WHERE project_id=$1`, [
          w.projectId,
        ])
      ).rows.map((r) => r.id),
    ),
  )
  return pass.outcomes.filter((o) => ids.has(o.id)).map((o) => [o.op, o.outcome])
}

/** Due now: a world's deliveries waiting out a backoff are made due. */
const dueNow = (w: World) =>
  asOwner((o) => o.query(`UPDATE sophia.coordination_outbox SET available_at=now() WHERE project_id=$1`, [w.projectId]))

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

/** A receipt no page was served with: what a reviewer whose page was lost could only guess. */
const UNSERVED = '0123456789abcdef0123456789abcdef'

/** One page of a source, and the receipt it carries. */
async function pageOf(w: World, at: { attemptId: string; nativeSessionId: string }, sourceId: string) {
  const page = await w.runtime('/v1/runtime/source-review/context', { ...at, sourceId })
  assert.equal(page.status, 200, JSON.stringify(page.json))
  assert.match(String(page.json.receipt), /^[0-9a-f]{32}$/)
  return String(page.json.receipt)
}

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
  const receipts = [await pageOf(w, at, w.sourceA), await pageOf(w, at, w.sourceB)]
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
    result: { verdict: 'changes_required', report: REPORT, findings, receipts },
  })
}

/** One model call of the attempt, reserved and settled at `cost`. */
async function modelCall(w: World, attemptId: string, callId: string, cost: number) {
  const at = { attemptId, nativeSessionId: `sophia-${attemptId}` }
  const reserve = await w.runtime('/v1/runtime/source-review/reserve', {
    ...at,
    callId,
    kind: 'model',
    provider: 'openai-review',
    amountUsd: 0.01,
  })
  assert.equal(reserve.status, 200, JSON.stringify(reserve.json))
  const usage = { inputTokens: 10, outputTokens: 5, provider: 'openai-review', model: 'gpt-6-luna' }
  const settle = await w.runtime('/v1/runtime/source-review/settle', {
    ...at,
    reservationId: reserve.json.reservationId,
    outcome: 'settled',
    costUsd: cost,
    usage,
  })
  assert.equal(settle.status, 200, JSON.stringify(settle.json))
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

/** Until `n` backends of this database wait for a lock: a barrier on observed state, never a timed wait. */
async function untilWaiting(n: number) {
  const waiting = async () =>
    asOwner(
      async (o) =>
        (
          await o.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
              WHERE NOT l.granted AND a.datname=current_database()`,
          )
        ).rows[0]?.n ?? 0,
    )
  for (let looked = 0; (await waiting()) < n; looked += 1) {
    assert.ok(looked < 500, `${String(n)} backend(s) waiting on a lock`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

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
    const cite = (sourceIds: string[], receipts: string[]) =>
      w.runtime('/v1/runtime/source-review/submit', {
        ...at,
        callId: 's0',
        result: {
          verdict: 'supported',
          report: REPORT,
          findings: [{ status: 'supported', statement: 'x', sourceIds }],
          receipts,
        },
      })
    const unread = await cite([w.sourceA], [UNSERVED])
    assert.equal(unread.status, 422, 'a finding may cite only a source the review read')
    assert.match(String(unread.json.message), /not served to this review/)
    // Codex on #107: a page served but whose reply was lost never reached the model, nor its receipt. Serving it
    // records nothing as read: citing the source with only another source's receipt is refused.
    await pageOf(w, at, w.sourceA)
    const otherReceipt = await pageOf(w, at, w.sourceB)
    const lost = await cite([w.sourceA], [otherReceipt])
    assert.equal(lost.status, 422, JSON.stringify(lost.json))
    assert.match(String(lost.json.message), /did not read/)
    const reads = await asOwner(
      async (o) =>
        (await o.query(`SELECT 1 FROM sophia.work_review_reads WHERE project_id=$1`, [w.projectId])).rowCount,
    )
    assert.equal(reads, 0, 'a refused submit records no read')
    const published = await reviewed(w, started.attemptId)
    assert.equal(published.json.outcome, 'published', JSON.stringify(published.json))
    // INT-09: a submit whose answer was lost is answered with the same immutable result; nothing runs again.
    const again = [{ status: 'supported', statement: 'A different submission.', sourceIds: [w.sourceA] }]
    const replay = await w.runtime('/v1/runtime/source-review/submit', {
      ...at,
      callId: 's1',
      result: { verdict: 'supported', report: REPORT, findings: again, receipts: [UNSERVED] },
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

  /** A world whose commission's first send never reached Paperclip: its outcome is unknown, and nothing was created. */
  async function unsent() {
    const w = await world()
    const proposal = await accepted(w)
    const unreachable: typeof fetch = async (input, init) => {
      if ((typeof init?.body === 'string' ? init.body : '').includes(w.projectId)) {
        throw new TypeError('fetch failed: connection refused')
      }
      return routed(w)(input, init)
    }
    assert.deepEqual(await outcomesOf(w, await passWith(unreachable)), [['commission', 'unknown']])
    assert.equal(w.paperclip.issues.size, 0)
    return { w, proposal }
  }

  const outboxOf = (w: World) =>
    asOwner(
      async (o) =>
        (
          await o.query<{ op: string; state: string }>(
            `SELECT op, state FROM sophia.coordination_outbox WHERE project_id=$1 ORDER BY seq`,
            [w.projectId],
          )
        ).rows,
    )

  const commissionStateOf = (w: World) =>
    asOwner(
      async (o) =>
        (
          await o.query<{ state: string }>(`SELECT state FROM sophia.work_commissions WHERE project_id=$1`, [
            w.projectId,
          ])
        ).rows[0]?.state,
    )

  /** Withdrawn with its Stop: nothing more is sent, and Paperclip holds no issue. */
  async function withdrawn(w: World) {
    assert.deepEqual(await outboxOf(w), [
      { op: 'commission', state: 'superseded' },
      { op: 'stop', state: 'superseded' },
    ])
    assert.equal(await commissionStateOf(w), 'superseded')
    await dueNow(w)
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [], 'nothing more is sent')
    assert.equal(w.paperclip.issues.size, 0, 'no issue was created, cancelled or otherwise')
  }

  it('a commission proved absent after its work was stopped is withdrawn, never created only to be cancelled (Codex on #107)', async () => {
    const { w, proposal } = await unsent()
    const stop = await command(w, proposal, 'stop', null)
    assert.equal(stop.status, 202, JSON.stringify(stop.json))
    await dueNow(w)
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['commission', 'absent']])
    await withdrawn(w)
  })

  it('a Stop committing while a commission is proved absent is seen under the commission lock (Codex on #107)', async () => {
    const { w, proposal } = await unsent()
    // The Stop's transaction takes the goal, then the commission (its mirror), and holds them while the pass reconciles.
    const stopping = new pg.Client({ connectionString: db.ownerUrl })
    await stopping.connect()
    let pass: ReturnType<typeof passWith> | null = null
    try {
      await stopping.query('BEGIN')
      await stopping.query(
        `SELECT sophia.work_control($1, w, 'stop', sophia.integration_actor(), 'concurrent-stop', 'studio')
           FROM sophia.work_items w WHERE w.project_id=$1 AND w.id=$2`,
        [w.projectId, proposal.workId],
      )
      await dueNow(w)
      pass = passWith(routed(w))
      // The pass records the absence only once it holds the commission: it waits for the Stop's transaction.
      await untilWaiting(1)
      await stopping.query('COMMIT')
      assert.deepEqual(await outcomesOf(w, await pass), [['commission', 'absent']])
      await withdrawn(w)
    } finally {
      await stopping.end()
      await pass?.catch(() => undefined)
    }
  })

  // Codex's probe on b39ebb66 (r4207737097): the commission held elsewhere, a Stop queued on it first, then the pass that
  // records the absence. Both wait for the same row; the Stop, released first, commits first.
  it('a Stop and a proved absence queued on the commission, the Stop first: the commission is withdrawn (Codex on #107)', async () => {
    const { w, proposal } = await unsent()
    await dueNow(w)
    const holder = new pg.Client({ connectionString: db.ownerUrl })
    const stopping = new pg.Client({ connectionString: db.ownerUrl })
    await holder.connect()
    await stopping.connect()
    let stopped: Promise<unknown> | null = null
    let pass: ReturnType<typeof passWith> | null = null
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.work_commissions WHERE project_id=$1 FOR UPDATE`, [w.projectId])
      await stopping.query('BEGIN')
      // The Stop moves the goal, then its mirror waits for the commission.
      stopped = stopping.query(
        `SELECT sophia.work_control($1, w, 'stop', sophia.integration_actor(), 'queued-stop', 'studio')
           FROM sophia.work_items w WHERE w.project_id=$1 AND w.id=$2`,
        [w.projectId, proposal.workId],
      )
      await untilWaiting(1)
      // The pass proves the absence, then waits for the commission behind the Stop.
      pass = passWith(routed(w))
      await untilWaiting(2)
      await holder.query('COMMIT')
      await stopped
      await stopping.query('COMMIT')
      assert.deepEqual(await outcomesOf(w, await pass), [['commission', 'absent']])
      await withdrawn(w)
    } finally {
      // Each lock is released before what waits on it is awaited: a failed assertion never leaves the test hanging.
      await holder.end()
      await stopped?.catch(() => undefined)
      await stopping.end()
      await pass?.catch(() => undefined)
    }
  })

  it('a commission found after its work was stopped is delivered, and its Stop cancels that one issue', async () => {
    const w = await world()
    const proposal = await accepted(w)
    assert.deepEqual(await outcomesOf(w, await passWith(pluginFetch(w.paperclip, () => true))), [
      ['commission', 'unknown'],
    ])
    assert.equal(w.paperclip.issues.size, 1, 'the effect happened; its reply was lost')
    const stop = await command(w, proposal, 'stop', null)
    assert.equal(stop.status, 202, JSON.stringify(stop.json))
    await dueNow(w)
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['commission', 'delivered']])
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['stop', 'delivered']])
    assert.equal(w.paperclip.issues.size, 1, 'never a second issue')
    assert.equal(issueOf(w).status, 'cancelled')
  })

  it('a commission proved absent while its work is active is sent again, and creates its one issue', async () => {
    const { w } = await unsent()
    await dueNow(w)
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['commission', 'absent']])
    assert.deepEqual(await outboxOf(w), [{ op: 'commission', state: 'pending' }])
    await dueNow(w)
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['commission', 'delivered']])
    assert.equal(w.paperclip.issues.size, 1)
    assert.equal(issueOf(w).status, 'todo')
  })

  it('a review cites a source only with a receipt its own pages carried; a page is partial coverage (Codex on #107)', async () => {
    const w = await world()
    const { attemptId } = await running(w)
    const at = { attemptId, nativeSessionId: `sophia-${attemptId}` }
    const submit = (callId: string, receipts: string[], sourceIds: string[]) =>
      w.runtime('/v1/runtime/source-review/submit', {
        ...at,
        callId,
        result: {
          verdict: 'changes_required',
          report: REPORT,
          findings: [{ status: 'contradicted', statement: 'The two budgets differ.', sourceIds }],
          receipts,
        },
      })
    // Another review's page, and its receipt, grant nothing in this one.
    const v = await world()
    const theirs = await running(v)
    const foreign = await pageOf(
      v,
      { attemptId: theirs.attemptId, nativeSessionId: `sophia-${theirs.attemptId}` },
      v.sourceA,
    )
    const refused = await submit('s-foreign', [foreign], [w.sourceA])
    assert.equal(refused.status, 422, JSON.stringify(refused.json))
    assert.match(String(refused.json.message), /not served to this review/)
    // A page asked past the source's end carries a receipt and no text: it proves no read (Codex on #107).
    const past = await w.runtime('/v1/runtime/source-review/context', { ...at, sourceId: w.sourceB, offset: 100_000 })
    assert.deepEqual([past.status, past.json.text, past.json.nextOffset], [200, '', null], JSON.stringify(past.json))
    const empty = await submit('s-past', [past.json.receipt], [w.sourceB])
    assert.equal(empty.status, 422, JSON.stringify(empty.json))
    assert.match(String(empty.json.message), /did not read/)
    // A page lost on its way, then read again: the reread's receipt, which did arrive, lets the source be cited.
    await pageOf(w, at, w.sourceA)
    const page = (sourceId: string, from: Record<string, number> = {}) =>
      w.runtime('/v1/runtime/source-review/context', { ...at, sourceId, ...from })
    const partial = await page(w.sourceA, { limit: 10 })
    assert.equal(partial.status, 200, JSON.stringify(partial.json))
    // Asked at the source's end exactly: no text, so its receipt proves no read either.
    const atEnd = await page(w.sourceA, { offset: Number(partial.json.totalChars) })
    assert.deepEqual([atEnd.json.text, atEnd.json.nextOffset], ['', null], JSON.stringify(atEnd.json))
    const end = await submit('s-end', [atEnd.json.receipt], [w.sourceA])
    assert.equal(end.status, 422, JSON.stringify(end.json))
    assert.match(String(end.json.message), /did not read/)
    // Paging on from the first page: the next page's receipt counts with the first's.
    const next = await page(w.sourceA, { offset: Number(partial.json.nextOffset), limit: 10 })
    assert.deepEqual([next.json.offset, next.json.nextOffset], [10, 20], JSON.stringify(next.json))
    const whole = await page(w.sourceB)
    assert.equal(whole.json.truncated, false)
    // The empty pages' receipts, presented too, change nothing: served to this review, they prove no read.
    const receipts = [partial, next, whole, atEnd, past].map((p) => String(p.json.receipt))
    const published = await submit('s-ok', receipts, [w.sourceA, w.sourceB])
    assert.equal(published.json.outcome, 'published', JSON.stringify(published.json))
    const stored = await asOwner(
      async (o) =>
        (
          await o.query<{ coverage: unknown; inspected: string[] }>(
            `SELECT checks->'coverage' AS coverage, inspected_source_ids::text[] AS inspected FROM sophia.work_results WHERE project_id=$1`,
            [w.projectId],
          )
        ).rows[0],
    )
    const expected = [
      { sourceId: w.sourceA, deliveredChars: 20, totalChars: partial.json.totalChars, complete: false },
      { sourceId: w.sourceB, deliveredChars: whole.json.totalChars, totalChars: whole.json.totalChars, complete: true },
    ].toSorted((a, b) => a.sourceId.localeCompare(b.sourceId))
    assert.deepEqual(stored?.coverage, expected, 'one page of a source is not the whole source')
    assert.deepEqual(stored?.inspected.toSorted(), [w.sourceA, w.sourceB].toSorted())
    // The published review's completion is mirrored to its issue: delivered here, so no later test's pass claims it.
    assert.deepEqual(await mine(w, await deliver(w)), [['complete', 'delivered']])
  })

  /** The plugin stopped after its create landed: its reply lost, the issue's wakeup never asked (Codex on #107). */
  async function crashedAfterCreate(w: World) {
    await accepted(w)
    assert.deepEqual(
      (await mine(w, await deliver(w, () => true))).map(([, outcome]) => outcome),
      ['unknown'],
    )
    const issue = issueOf(w)
    await pc.query(`DELETE FROM ${NAMESPACE}.wakes WHERE issue_id = $1`, [issue.id])
    await pc.query(`DELETE FROM public.heartbeat_runs WHERE context_snapshot->>'issueId' = $1`, [issue.id])
    w.paperclip.wakeups.length = 0
    return issue
  }

  /** The next pass, now: the outbox's backoff is skipped. */
  async function nextPass(w: World) {
    await asOwner((o) =>
      o.query(`UPDATE sophia.coordination_outbox SET available_at=now() WHERE project_id=$1`, [w.projectId]),
    )
    return mine(w, await deliver(w))
  }

  /**
   * A pass's outcomes for this world's deliveries only: a pass claims every due delivery in the database, and an
   * earlier test's work may still have one queued (its completion's mirrored control).
   */
  async function mine(w: World, pass: Awaited<ReturnType<typeof deliver>>) {
    const ids = new Set(
      await asOwner(async (o) =>
        (
          await o.query<{ id: string }>(`SELECT id::text AS id FROM sophia.coordination_outbox WHERE project_id=$1`, [
            w.projectId,
          ])
        ).rows.map((r) => r.id),
      ),
    )
    return pass.outcomes.filter((o) => ids.has(o.id)).map((o) => [o.op, o.outcome])
  }

  const commissionRow = async (w: World) =>
    asOwner(
      async (o) =>
        (
          await o.query<{ state: string; result: Record<string, unknown> | null }>(
            `SELECT state, result FROM sophia.coordination_outbox WHERE project_id=$1 AND op='commission'`,
            [w.projectId],
          )
        ).rows[0],
    )

  it('reconciles a found issue whose wakeup was never asked: woken first, then delivered (Codex on #107)', async () => {
    const w = await world()
    const issue = await crashedAfterCreate(w)
    assert.deepEqual(await nextPass(w), [['commission', 'delivered']])
    assert.equal(w.paperclip.wakeups.length, 1, 'the found issue was woken before the delivery was recorded')
    assert.equal(w.paperclip.issues.size, 1)
    assert.deepEqual(await commissionRow(w), {
      state: 'delivered',
      result: { issueId: issue.id, status: 'todo', outcome: 'existing', wakeQueued: true, reconciled: true },
    })
    assert.equal(
      (await sophia().permit({ companyId: COMPANY, runId: runId('r1'), issueId: issue.id })).decision,
      'start',
    )
  })

  it('a found issue whose wakeup the host does not queue stays unknown, never delivered; later it is woken once', async () => {
    let wake: 'not_queued' | null = null
    const w = await world({ fails: { wake: () => wake } })
    const issue = await crashedAfterCreate(w)
    wake = 'not_queued'
    assert.deepEqual(await nextPass(w), [['commission', 'unknown']])
    assert.equal(w.paperclip.wakeups.length, 0)
    assert.equal((await commissionRow(w))?.state, 'outcome_unknown')
    wake = null
    // The ask the host answered without a run is asked again only once a run had time to appear.
    assert.deepEqual(await nextPass(w), [['commission', 'unknown']])
    assert.equal(w.paperclip.wakeups.length, 0)
    await pc.query(
      `UPDATE ${NAMESPACE}.wakes SET asked_at = asked_at - interval '2 minutes', answered_at = answered_at - interval '2 minutes'
        WHERE issue_id = $1`,
      [issue.id],
    )
    assert.deepEqual(await nextPass(w), [['commission', 'delivered']])
    assert.equal(w.paperclip.wakeups.length, 1)
    assert.equal(w.paperclip.issues.size, 1)
  })

  it('a found issue whose wakeup was durable but whose reply was lost is delivered by its run, never woken twice', async () => {
    let wake: 'after' | null = null
    const w = await world({ fails: { wake: () => wake } })
    const issue = await crashedAfterCreate(w)
    wake = 'after'
    assert.deepEqual(await nextPass(w), [['commission', 'unknown']])
    assert.equal(w.paperclip.wakeups.length, 1, 'the wakeup is durable; its reply is lost')
    wake = null
    assert.deepEqual(await nextPass(w), [['commission', 'delivered']])
    assert.equal(w.paperclip.wakeups.length, 1, 'confirmed by its run, not asked again')
    assert.deepEqual((await commissionRow(w))?.result, {
      issueId: issue.id,
      status: 'todo',
      outcome: 'existing',
      wakeQueued: false,
      reconciled: true,
    })
    assert.equal(w.paperclip.issues.size, 1)
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

  // Codex on #107 (r4206869533): a delivery's created_at is its transaction's start. A Stop whose transaction began
  // before a Hold's, and committed after it, was stamped earlier than the Hold; while the Hold was in flight, a second
  // worker sent the Stop alongside it, and the Hold reaching the plugin last undid the Stop.
  it('a control whose transaction began before the one it follows waits for it, even unanswered; other work goes on', async () => {
    const w = await world()
    const other = await world()
    const proposal = await accepted(w)
    const otherProposal = await accepted(other)
    await passWith(routed(w, other))
    const issue = issueOf(w)
    const otherIssue = issueOf(other)

    // w's Hold is sent and held at the plugin's door; released, it lands and its reply is lost.
    let atHost!: () => void
    const arrived = new Promise<void>((resolve) => (atHost = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    const gated: typeof fetch = async (input, init) => {
      const body: ResponseBody = JSON.parse(typeof init?.body === 'string' ? init.body : 'null')
      if (body?.control?.op !== 'hold' || body.control.workId !== proposal.workId) return routed(w, other)(input, init)
      atHost()
      await released
      return pluginFetch(w.paperclip, () => true)(input, init)
    }

    const early = new pg.Client({ connectionString: db.ownerUrl })
    await early.connect()
    let first: ReturnType<typeof passWith> | null = null
    try {
      await early.query('BEGIN')
      await early.query('SELECT now()')
      const hold = await command(w, proposal, 'hold', null)
      assert.equal(hold.status, 202, JSON.stringify(hold.json))
      first = passWith(gated)
      await Promise.race([arrived, first.then(() => assert.fail('the pass ended without sending the Hold'))])

      // Meanwhile another work item is held, and w's Stop, from the transaction begun before its Hold, commits.
      const otherHold = await command(other, otherProposal, 'hold', null)
      assert.equal(otherHold.status, 202, JSON.stringify(otherHold.json))
      await early.query(
        `SELECT sophia.work_control($1, w, 'stop', sophia.integration_actor(), 'early-stop', 'studio')
           FROM sophia.work_items w WHERE w.project_id=$1 AND w.id=$2`,
        [w.projectId, proposal.workId],
      )
      await early.query('COMMIT')
      const stamped = await asOwner(
        async (o) =>
          (
            await o.query<{ earlier: boolean; after: boolean }>(
              `SELECT s.created_at<h.created_at AS earlier, s.seq>h.seq AS after
                 FROM sophia.coordination_outbox s JOIN sophia.coordination_outbox h ON h.project_id=s.project_id
                  AND h.work_id=s.work_id AND h.op='hold'
                WHERE s.project_id=$1 AND s.op='stop'`,
              [w.projectId],
            )
          ).rows[0],
      )
      assert.deepEqual(stamped, { earlier: true, after: true }, 'stamped before the Hold, written after it')

      // A second worker passes while w's Hold is in flight: w's Stop waits; the other work's Hold is delivered.
      const second = await passWith(routed(w, other))
      assert.deepEqual(await outcomesOf(w, second), [])
      assert.deepEqual(await outcomesOf(other, second), [['hold', 'delivered']])
      assert.equal(other.paperclip.issues.get(otherIssue.id)?.status, 'blocked')

      release()
      assert.deepEqual(await outcomesOf(w, await first), [['hold', 'unknown']])
      assert.equal(w.paperclip.issues.get(issue.id)?.status, 'blocked', 'the Hold landed; its reply was lost')
      // Its reconciliation comes first; the Stop is not sent alongside it.
      await dueNow(w)
      assert.deepEqual(await outcomesOf(w, await passWith(routed(w, other))), [['hold', 'delivered']])
      assert.deepEqual(await outcomesOf(w, await passWith(routed(w, other))), [['stop', 'delivered']])
      assert.equal(w.paperclip.issues.get(issue.id)?.status, 'cancelled', 'the Stop, sent last, stands')
    } finally {
      release()
      await first?.catch(() => undefined)
      await early.end()
    }
  })

  it('controls written in one transaction, stamped alike, are sent one at a time in the order written', async () => {
    const w = await world()
    const proposal = await accepted(w)
    await passWith(routed(w))
    const issue = issueOf(w)
    await asOwner(async (o) => {
      await o.query('BEGIN')
      await o.query(
        `SELECT sophia.work_control($1, w, 'hold', sophia.integration_actor(), 'batched-hold', 'studio')
           FROM sophia.work_items w WHERE w.project_id=$1 AND w.id=$2`,
        [w.projectId, proposal.workId],
      )
      await o.query(`SELECT sophia.work_fail($1, $2, 'batched with a Hold')`, [w.projectId, proposal.workId])
      await o.query('COMMIT')
    })
    const stamps = await asOwner(
      async (o) =>
        (
          await o.query<{ alike: boolean; ordered: boolean }>(
            `SELECT h.created_at=f.created_at AS alike, h.seq<f.seq AS ordered
               FROM sophia.coordination_outbox h JOIN sophia.coordination_outbox f ON f.project_id=h.project_id
                AND f.work_id=h.work_id AND f.op='fail'
              WHERE h.project_id=$1 AND h.op='hold'`,
            [w.projectId],
          )
        ).rows[0],
    )
    assert.deepEqual(stamps, { alike: true, ordered: true })
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['hold', 'delivered']])
    assert.deepEqual(await outcomesOf(w, await passWith(routed(w))), [['fail', 'delivered']])
    assert.equal(w.paperclip.issues.get(issue.id)?.status, 'cancelled', 'the failure, written last, stands')
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

  it('a blocker sent again after its answer was lost is answered as recorded; nothing publishes after it (Codex on #107)', async () => {
    const w = await world()
    const { attemptId } = await running(w)
    const at = { attemptId, nativeSessionId: `sophia-${attemptId}` }
    const blocker = {
      ...at,
      callId: 'b1',
      blocker: { reason: 'The CI log is not among the sources.', missing: 'CI log' },
    }
    const first = await w.runtime('/v1/runtime/source-review/submit', blocker)
    assert.equal(first.status, 200, JSON.stringify(first.json))
    assert.equal(first.json.outcome, 'blocked')
    const again = await w.runtime('/v1/runtime/source-review/submit', blocker)
    assert.equal(again.status, 200, JSON.stringify(again.json))
    assert.deepEqual(again.json, { ...first.json, replayed: true }, 'the blocker recorded, once')
    const failed = await asOwner(
      async (o) =>
        (
          await o.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM sophia.jobs WHERE project_id=$1 AND kind='source_review' AND state='failed'`,
            [w.projectId],
          )
        ).rows[0]?.n,
    )
    assert.equal(failed, 1, 'one ending')
    const late = await w.runtime('/v1/runtime/source-review/submit', {
      ...at,
      callId: 's1',
      result: {
        verdict: 'supported',
        report: REPORT,
        findings: [{ status: 'supported', statement: 'x', sourceIds: [w.sourceA] }],
        receipts: [UNSERVED],
      },
    })
    assert.equal(late.status, 409, 'the review ended blocked: nothing publishes after it')
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

// Codex on #107 (r4206690881): a run that paused past its permit's five minutes before starting was answered the same
// expired permit for ever, and every start was refused. A start permit not yet used is decided again under current
// authority: kept or renewed, attached to another run's attempt, or denied with the run's record as it was.
describe('a start permit asked for again before it was used (Codex on #107)', () => {
  type Run = { companyId: string; runId: string }

  const ask = (w: World, run: Run, bearer = INTEGRATION_TOKEN) =>
    sophia(bearer).permit({ ...run, issueId: issueOf(w).id, agentId: 'agent-source-reviewer' })

  /** A new run of the world's one issue, permitted to start and not started yet. */
  async function permitted(w: World, name: string, bearer = INTEGRATION_TOKEN): Promise<Run> {
    const run = { companyId: COMPANY, runId: runId(name) }
    const permit = await ask(w, run, bearer)
    assert.deepEqual(
      [permit.decision, permit.state, permit.attemptId],
      ['start', 'permitted', null],
      JSON.stringify(permit),
    )
    return run
  }

  /** Its expiry passed before any start, as Codex reproduced it: only the durable expiry is aged. */
  const expire = (run: Run) =>
    asOwner((o) =>
      o.query(`UPDATE sophia.work_runs SET permit_expires_at=now()-interval '6 minutes' WHERE paperclip_run_id=$1`, [
        run.runId,
      ]),
    )

  /** The run's record, as Sophia keeps it. */
  const recordOf = (run: Run) =>
    asOwner(
      async (o) =>
        (
          await o.query<{
            decision: string
            state: string
            attempt_id: string | null
            generation: number
            expires: string
          }>(
            `SELECT decision, state, attempt_id, assignment_generation AS generation, permit_expires_at::text AS expires
               FROM sophia.work_runs WHERE paperclip_run_id=$1`,
            [run.runId],
          )
        ).rows[0],
    )

  const attempts = (w: World) =>
    asOwner(
      async (o) =>
        (
          await o.query<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.work_attempts WHERE project_id=$1`, [
            w.projectId,
          ])
        ).rows[0]?.n,
    )

  /** Accepted and commissioned: the issue's runs may ask for permits. */
  async function commissioned() {
    const w = await world()
    const proposal = await accepted(w)
    await deliver(w)
    return { w, proposal }
  }

  it('an expired one is renewed for its own run, and starts one attempt however often and concurrently asked', async () => {
    const { w } = await commissioned()
    const run = await permitted(w, 'paused')
    await expire(run)
    await assert.rejects(sophia().start(run), /ask for a permit again/)
    assert.equal(await attempts(w), 0)

    const [a, b] = await Promise.all([ask(w, run), ask(w, run)])
    assert.deepEqual(a, b, 'asked twice at once: renewed once, answered the same')
    assert.deepEqual([a.decision, a.state, a.attemptId, a.generation], ['start', 'permitted', null, 1])
    assert.ok(Date.parse(String(a.permitExpiresAt)) > Date.now() + 60_000, JSON.stringify(a))
    assert.deepEqual(await ask(w, run), a, 'a valid permit asked again is kept as it is, not extended')

    const [s1, s2] = await Promise.all([sophia().start(run), sophia().start(run)])
    assert.equal(s1.attemptId, s2.attemptId)
    assert.equal([s1.started, s2.started].filter((s) => s === true).length, 1, 'one of the two started it')
    assert.equal(await attempts(w), 1)
    const started = await ask(w, run)
    assert.deepEqual(
      [started.decision, started.state, started.attemptId, started.nativeSessionId],
      ['start', 'started', s1.attemptId, `sophia-${String(s1.attemptId)}`],
      'a started run is answered as recorded, with its attempt',
    )
    await sophia().observe({ ...run, final: true })
    assert.equal((await recordOf(run))?.state, 'ended')
    const ended = await sophia().start(run)
    assert.deepEqual(
      [ended.attemptId, ended.started],
      [s1.attemptId, false],
      'its own attempt, even once the run ended',
    )
    assert.equal(await attempts(w), 1)
  })

  it('one asked again while the work is held, its allowance spent or no runtime carries it is denied, and kept as it was', async () => {
    const { w, proposal } = await commissioned()
    const run = await permitted(w, 'paused')
    await expire(run)
    const kept = await recordOf(run)
    const deniedAs = async (code: string) => {
      const reply = await ask(w, run)
      assert.deepEqual([reply.decision, reply.code], ['deny', code], JSON.stringify(reply))
      assert.deepEqual(await recordOf(run), kept, `${code}: the run's record is as it was`)
      await assert.rejects(sophia().start(run), /ask for a permit again/, `${code}: still nothing to start with`)
      assert.equal(await attempts(w), 0, code)
    }

    const hold = await command(w, proposal, 'hold', null)
    assert.equal(hold.status, 202, JSON.stringify(hold.json))
    await dispatchDue()
    const held = await member(E, `/api/v1/projects/${w.projectId}/work/operations/${String(hold.json.operation_id)}`)
    assert.equal(held.json.effect, 'held', JSON.stringify(held.json))
    await deniedAs('held')
    const resume = await command(w, proposal, 'resume', null)
    assert.equal(resume.status, 202, JSON.stringify(resume.json))

    const spend = (to: 'cap_usd' | '0') =>
      asOwner((o) =>
        o.query(
          `UPDATE sophia.research_allowances a SET spent_usd=${to} FROM sophia.work_items wi
            WHERE wi.project_id=a.project_id AND wi.allowance_id=a.id AND wi.project_id=$1`,
          [w.projectId],
        ),
      )
    await spend('cap_usd')
    await deniedAs('allowance_spent')
    await spend('0')

    const roles = await asOwner(
      async (o) =>
        (
          await o.query<{ roles: unknown }>(`SELECT roles FROM sophia.runtime_instances WHERE project_id=$1`, [
            w.projectId,
          ])
        ).rows[0]?.roles,
    )
    const carry = (value: unknown) =>
      asOwner((o) =>
        o.query(`UPDATE sophia.runtime_instances SET roles=$2::jsonb WHERE project_id=$1`, [
          w.projectId,
          JSON.stringify(value),
        ]),
      )
    await carry([])
    await deniedAs('runtime_unavailable')
    await carry(roles)

    // Authority whole again: renewed, and started once.
    const renewed = await ask(w, run)
    assert.deepEqual([renewed.decision, renewed.state], ['start', 'permitted'], JSON.stringify(renewed))
    assert.notEqual((await recordOf(run))?.expires, kept?.expires)
    const started = await sophia().start(run)
    assert.equal(started.started, true, JSON.stringify(started))
    assert.equal(await attempts(w), 1)
  })

  it("only the run's own credential asks again; a revoked one, an earlier assignment or a withdrawn input renew nothing", async () => {
    const { w } = await commissioned()
    const SECOND = 'sophia-dsh-adapter-capability-for-tests-0003'
    const second = await asOwner(
      async (o) =>
        (
          await o.query<{ id: string }>(
            `SELECT sophia.register_coordination_integration($1, $2, 'a second adapter') AS id`,
            [COMPANY, sha256(SECOND)],
          )
        ).rows[0]?.id,
    )
    const theirs = await permitted(w, 'theirs', SECOND)
    const ours = await permitted(w, 'ours')
    await expire(theirs)
    await expire(ours)
    const keptTheirs = await recordOf(theirs)
    const keptOurs = await recordOf(ours)

    await assert.rejects(
      ask(w, theirs),
      refusedAs('forbidden'),
      "another credential of the same company: not this run's",
    )
    await assert.rejects(ask(w, ours, SECOND), refusedAs('forbidden'))
    await assert.rejects(sophia(SECOND).start(ours), refusedAs('forbidden'))
    await asOwner((o) => o.query(`SELECT sophia.revoke_coordination_integration($1)`, [second]))
    await assert.rejects(ask(w, theirs, SECOND), refusedAs('forbidden'), 'a revoked credential')
    await assert.rejects(sophia(SECOND).start(theirs), refusedAs('forbidden'))
    assert.deepEqual(await recordOf(theirs), keptTheirs)

    // The work's assignment changed since the run was permitted: the run belongs to the earlier one.
    await asOwner(async (o) => {
      await o.query(`UPDATE sophia.work_assignments SET state='ended' WHERE project_id=$1 AND state='active'`, [
        w.projectId,
      ])
      await o.query(
        `INSERT INTO sophia.work_assignments(project_id,id,work_id,generation,executor_kind,role,route)
         SELECT project_id,gen_random_uuid(),work_id,generation+1,executor_kind,role,route FROM sophia.work_assignments
          WHERE project_id=$1`,
        [w.projectId],
      )
    })
    const stale = await ask(w, ours)
    assert.deepEqual([stale.decision, stale.code], ['deny', 'stale_assignment'], JSON.stringify(stale))
    assert.deepEqual(await recordOf(ours), keptOurs)
    const current = await ask(w, { companyId: COMPANY, runId: runId('current') })
    assert.deepEqual([current.decision, current.generation], ['start', 2], 'a run of the current assignment may start')

    // An input withdrawn stops the work: nothing is renewed.
    await asOwner((o) =>
      o.query(`UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        w.sourceA,
      ]),
    )
    const withdrawn = await ask(w, ours)
    assert.deepEqual([withdrawn.decision, withdrawn.code], ['deny', 'stopped'], JSON.stringify(withdrawn))
    assert.deepEqual(await recordOf(ours), keptOurs)
    assert.equal(await attempts(w), 0)
  })

  it('one asked again after another run started the work attaches to that attempt; once it ended, nothing starts', async () => {
    const { w } = await commissioned()
    const late = await permitted(w, 'late')
    const waiting = await permitted(w, 'waiting')
    const raced = await permitted(w, 'raced')
    await expire(late)
    await expire(waiting)
    const other = await permitted(w, 'other')
    const started = await sophia().start(other)
    assert.equal(started.started, true, JSON.stringify(started))

    const attach = await ask(w, late)
    assert.deepEqual(
      [attach.decision, attach.state, attach.attemptId, attach.nativeSessionId],
      ['attach', 'attached', started.attemptId, `sophia-${String(started.attemptId)}`],
    )
    assert.deepEqual(await ask(w, late), attach, 'asked again, the same attempt')
    await assert.rejects(sophia().start(late), /attaches/)
    // A permit still valid that lost the race is told to ask again, and asking again attaches it.
    await assert.rejects(sophia().start(raced), /another run started this work/)
    assert.equal((await ask(w, raced)).attemptId, started.attemptId)
    assert.equal(await attempts(w), 1)

    // The attempt ends while the work is neither held, stopped nor finished: a new decision is needed, not a restart.
    await asOwner((o) =>
      o.query(`UPDATE sophia.execution_bindings SET state='settled' WHERE project_id=$1 AND attempt_id=$2`, [
        w.projectId,
        started.attemptId,
      ]),
    )
    const kept = await recordOf(waiting)
    const ended = await ask(w, waiting)
    assert.deepEqual([ended.decision, ended.code], ['deny', 'attempt_ended'], JSON.stringify(ended))
    assert.deepEqual(await recordOf(waiting), kept)
    await assert.rejects(sophia().start(waiting), /ask for a permit again/)
    assert.equal(await attempts(w), 1)
  })
})

describe('the coordination grant, and the runs of one attempt (Codex on #107)', () => {
  /** The owner's disable of the world's grant, made in a transaction left open: it holds what the setter locks. */
  async function disabling(w: World) {
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    await owner.query('BEGIN')
    await owner.query(`SELECT sophia.set_coordination_grant($1, 'disabled', 2, $2, $3, 'approval:test-off')`, [
      w.projectId,
      COMPANY,
      PC_PROJECT,
    ])
    let open = true
    const finish = async (how: 'COMMIT' | 'ROLLBACK') => {
      if (!open) return
      open = false
      await owner.query(how)
      await owner.end()
    }
    return { commit: () => finish('COMMIT'), abandon: () => finish('ROLLBACK') }
  }

  const countOf = (w: World, table: 'work_items' | 'coordination_outbox' | 'work_attempts') =>
    asOwner(
      async (o) =>
        (
          await o.query<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [
            w.projectId,
          ])
        ).rows[0]?.n,
    )

  it('an acceptance asked while a disable is in flight waits for it, and once it committed admits nothing', async () => {
    const w = await world()
    const proposal = await propose(w)
    assert.equal(proposal.status, 201, JSON.stringify(proposal.json))
    const off = await disabling(w)
    try {
      const answering = answer(w, proposal.json, 'accept')
      // Without the grant's lock order, the acceptance read the grant the disable was replacing and admitted at once.
      await untilWaiting(1)
      await off.commit()
      const answered = await answering
      assert.deepEqual(
        [answered.json.admission, answered.json.rejection],
        ['rejected', 'unavailable'],
        JSON.stringify(answered.json),
      )
    } finally {
      await off.abandon()
    }
    assert.equal(await countOf(w, 'work_items'), 0, 'no work was admitted')
    assert.equal(await countOf(w, 'coordination_outbox'), 0, 'nothing is to be commissioned')
    assert.equal((await deliver(w)).outcomes.length, 0)
    assert.equal(w.paperclip.issues.size, 0)
  })

  it('a start asked while a disable is in flight waits for it, and once it committed starts nothing', async () => {
    const w = await world()
    await accepted(w)
    await deliver(w)
    const run = { companyId: COMPANY, runId: runId('run') }
    const permit = await sophia().permit({ ...run, issueId: issueOf(w).id, agentId: 'agent-source-reviewer' })
    assert.equal(permit.decision, 'start', JSON.stringify(permit))
    const off = await disabling(w)
    try {
      const starting = sophia().start(run)
      await untilWaiting(1)
      await off.commit()
      const started = await starting
      assert.deepEqual([started.denied, started.code], [true, 'not_enrolled'], JSON.stringify(started))
    } finally {
      await off.abandon()
    }
    assert.equal(await countOf(w, 'work_attempts'), 0, 'no attempt, so no model call')
    const again = await sophia().permit({ companyId: COMPANY, runId: runId('later'), issueId: issueOf(w).id })
    assert.deepEqual([again.decision, again.code], ['deny', 'not_enrolled'], JSON.stringify(again))
  })

  it('an acceptance queued on the project before a disable is admitted under the grant it read; the disable follows', async () => {
    const w = await world()
    const proposal = await propose(w)
    assert.equal(proposal.status, 201, JSON.stringify(proposal.json))
    // A third transaction holds the project; the acceptance queues on it, then the disable (each wait observed).
    const holder = new pg.Client({ connectionString: db.ownerUrl })
    await holder.connect()
    await holder.query('BEGIN')
    await holder.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [w.projectId])
    let answering: ReturnType<typeof answer> | undefined
    let disabled: Promise<unknown> | undefined
    try {
      answering = answer(w, proposal.json, 'accept')
      await untilWaiting(1)
      disabled = asOwner((o) =>
        o.query(`SELECT sophia.set_coordination_grant($1, 'disabled', 2, $2, $3, 'approval:test-off')`, [
          w.projectId,
          COMPANY,
          PC_PROJECT,
        ]),
      )
      // Without the grant's lock order, the disable did not queue: it committed while the acceptance waited.
      await untilWaiting(2)
    } finally {
      await holder.query('COMMIT')
      await holder.end()
    }
    const answered = await answering
    assert.equal(answered?.json.admission, 'recorded', JSON.stringify(answered?.json))
    await disabled
    assert.equal(await countOf(w, 'work_items'), 1, 'admitted under the grant it read')
    const grant = await asOwner(
      async (o) =>
        (
          await o.query<{ state: string }>(`SELECT state FROM sophia.coordination_grants WHERE project_id=$1`, [
            w.projectId,
          ])
        ).rows[0]?.state,
    )
    assert.equal(grant, 'disabled', 'and the disable after it')
  })

  it("a run that attached and ends first claims none of the starting run's spend; the starting run claims it", async () => {
    const w = await world()
    const { run, attemptId } = await running(w)
    const duplicate = { companyId: COMPANY, runId: runId('duplicate') }
    const attach = await sophia().permit({ ...duplicate, issueId: issueOf(w).id })
    assert.deepEqual([attach.decision, attach.attemptId], ['attach', attemptId], JSON.stringify(attach))
    assert.equal((await reviewed(w, attemptId)).json.outcome, 'published')

    const first = await sophia().observe({ ...duplicate, final: true })
    assert.deepEqual([first.usage?.calls, first.usage?.costUsd], [0, 0], JSON.stringify(first.usage))
    assert.deepEqual(
      (await sophia().observe({ ...duplicate, final: true })).usage,
      first.usage,
      'asked again, the same',
    )
    const starter = await sophia().observe({ ...run, final: true })
    assert.deepEqual([starter.usage?.calls, starter.usage?.costUsd], [1, 0.000275], JSON.stringify(starter.usage))
  })

  it('once the starting run let go, the run that attached after it claims the spend made since, and only that', async () => {
    const w = await world()
    const { run, attemptId } = await running(w)
    await modelCall(w, attemptId, 'm1', 0.0001)
    // The starting run lets go while the attempt continues (its observer's bound): it claims what was spent so far.
    const released = await sophia().observe({ ...run, final: true })
    assert.deepEqual([released.usage?.calls, released.usage?.costUsd], [1, 0.0001], JSON.stringify(released.usage))
    const next = { companyId: COMPANY, runId: runId('next') }
    const attach = await sophia().permit({ ...next, issueId: issueOf(w).id })
    assert.deepEqual([attach.decision, attach.attemptId], ['attach', attemptId], JSON.stringify(attach))
    await modelCall(w, attemptId, 'm2', 0.0002)
    const later = await sophia().observe({ ...next, final: true })
    assert.deepEqual([later.usage?.calls, later.usage?.costUsd], [1, 0.0002], JSON.stringify(later.usage))
    assert.deepEqual(
      (await sophia().observe({ ...run, final: true })).usage,
      released.usage,
      'the first run answers as it did',
    )
  })
})
