// SMC-M03 S4 part 1 through real HTTP (level: sql-run): start_research over /v1/media/tool-calls, the guide-versioned
// tool surface, and the runtime research routes (A11), which take a runtime capability, validate the declared
// schemas and answer the database's typed refusals. Synthetic HS256 tokens stand in for Supabase Auth.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand } from '@sophia/contracts'
import { admitResearchTask, createPool, readSnapshot, startExchange, withActor } from '@sophia/persistence'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  type RegisteredRuntime,
  type TestDatabase,
} from '@sophia/test-support'
import { dispatchOnce } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-research-tests-01'
const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer

let db: TestDatabase
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

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256 })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})
after(async () => {
  await app.close()
  await pool.end()
  await worker.end()
  await db.drop()
})

const ROLES = [{ id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }]
const PDF_ROLE = { id: 'sophia-research-pdf-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:pdf' }

/** A project with a research grant, a ready runtime advertising the Markdown specialist, and an open exchange. */
async function world(roles = ROLES) {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  const owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  await owner.end()
  const rt: RegisteredRuntime = await registerRuntime(db.ownerUrl, { projectId, admin: A })
  const bridge = randomUUID()
  const headers = {
    'x-sophia-runtime-unit': rt.runtimeUnitId,
    'x-sophia-bridge-instance': bridge,
    'x-sophia-bridge-protocol': '1',
  }
  const runtime = (path: string, body?: unknown, bearer = rt.token) => call(path, { bearer, headers, body })
  const hello = await runtime('/v1/runtime/hello', {
    bundle: 'test',
    protocolVersion: 1,
    dshVersion: 'x',
    roles,
  })
  assert.equal(hello.status, 200, JSON.stringify(hello.json))
  assert.equal((await runtime('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
  const snap = await withActor(pool, E, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const exchange = await withActor(pool, E, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { projectId, rt, runtime, exchangeId: exchange.exchangeId }
}

let n = 0
interface ToolOptions {
  name?: string
  callId?: string
  guide?: 'v1.1' | 'v1.2' | undefined
}
async function tool(w: { exchangeId: string }, args: object, actorId = E, opts: ToolOptions = {}) {
  n += 1
  const body = {
    exchangeId: w.exchangeId,
    connectionGeneration: 1,
    callId: opts.callId ?? `r-${String(n)}`,
    name: opts.name ?? 'start_research',
    args,
    inputEpoch: 1,
    actorId,
    // The research tools are v1.2's: a call says so unless the test names another guide (or none, for v1.1).
    ...('guide' in opts ? (opts.guide ? { guide: opts.guide } : {}) : { guide: 'v1.2' }),
  }
  const res = await call('/v1/media/tool-calls', { bearer: MEDIA_TOKEN, body })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res.json as { status: string; output: ResponseBody }
}

describe('the guide’s tool surface is versioned (A11)', () => {
  it('answers v1.1’s six operations by default, adds the research tools for v1.2, and refuses an unknown guide', async () => {
    const six = [
      'project_status',
      'read_selected_source',
      'record_mission_note',
      'propose_mission_change',
      'decide_mission_change',
      'control_work',
    ]
    assert.deepEqual((await call('/v1/media/tool-surface', { bearer: MEDIA_TOKEN })).json.names, six)
    assert.deepEqual((await call('/v1/media/tool-surface?guide=v1.1', { bearer: MEDIA_TOKEN })).json.names, six)
    assert.deepEqual((await call('/v1/media/tool-surface?guide=v1.2', { bearer: MEDIA_TOKEN })).json.names, [
      ...six,
      'start_research',
      'render_research',
    ])
    assert.equal((await call('/v1/media/tool-surface?guide=v9', { bearer: MEDIA_TOKEN })).status, 422)
  })
})

describe('start_research over /v1/media/tool-calls', () => {
  it('admits for the bound speaker, returns the task under way to a repeat, and types every refusal', async () => {
    const w = await world([...ROLES, PDF_ROLE])
    const first = await tool(w, { question: 'Which sandboxes do PDF rendering services use?' })
    assert.equal(first.status, 'admitted', JSON.stringify(first))
    assert.equal(first.output.stage, 'admitted')
    const repeat = await tool(w, { question: 'Which sandboxes do PDF rendering services use?' })
    assert.deepEqual([repeat.status, repeat.output.existingTaskId], ['ok', first.output.taskId])
    // A viewer's refusal (not_started:forbidden) is the database suite's: here the floor is the editor's.
    const pdf = await tool(w, { question: 'As a PDF, please.', outputs: ['markdown', 'pdf'], newRequest: true })
    assert.deepEqual([pdf.status, pdf.output.code], ['refused', 'not_started:pdf_unavailable'], 'no renderer running')
    const runner = new pg.Client({ connectionString: db.ownerUrl })
    await runner.connect()
    const label = `start-research-${String(Date.now())}`
    await runner.query(
      `INSERT INTO sophia.render_runners(label, token_sha256, seen_at) VALUES($1, $2, now() - interval '11 minutes')`,
      [label, createHash('sha256').update(label).digest()],
    )
    const stale = await tool(w, { question: 'As a PDF, please.', outputs: ['markdown', 'pdf'], newRequest: true })
    assert.equal(stale.output.code, 'not_started:pdf_unavailable', 'a renderer silent for over ten minutes')
    await runner.query(`UPDATE sophia.render_runners SET seen_at=now() WHERE label=$1`, [label])
    const ready = await tool(w, { question: 'As a PDF, please.', outputs: ['markdown', 'pdf'], newRequest: true })
    assert.equal(ready.status, 'admitted', JSON.stringify(ready))
    await runner.query(`UPDATE sophia.render_runners SET state='revoked', revoked_at=now() WHERE label=$1`, [label])
    await runner.end()
    const vague = await tool(w, { question: '  ' })
    assert.equal(vague.status, 'clarify')
    const bad = await tool(w, { question: 'Read this', urls: ['ftp://example.org/x'] })
    assert.equal(bad.status, 'clarify')

    const closed = await world()
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    await owner.query(`SELECT sophia.set_research_grant($1, 'disabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      closed.projectId,
    ])
    await owner.end()
    const gate = await tool(closed, { question: 'Anything at all?' })
    assert.deepEqual([gate.status, gate.output.code], ['refused', 'not_started:research_gate_closed'])
  })
})

describe('the runtime research routes (A11)', () => {
  it('run the research tools’ operations for the session the runtime owns, with typed refusals', async () => {
    const w = await world()
    const admitted = await tool(w, { question: 'Which sandboxes do PDF rendering services use?' })
    await dispatchOnce(worker, { workerId: 'test-worker' })
    const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
    const create = (batch.json.commands as Array<{ command: RuntimeCommand }>).at(-1)?.command
    assert.ok(create)
    assert.deepEqual(
      [create.kind, create.payload.role, create.payload.route],
      ['create', ROLES[0]?.id, ROLES[0]?.route],
    )
    const at = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }

    const context = await w.runtime('/v1/runtime/research/context', at)
    assert.equal(context.status, 200, JSON.stringify(context.json))
    assert.equal(context.json.taskId, admitted.output.taskId)
    assert.equal(context.json.question, 'Which sandboxes do PDF rendering services use?')

    const reserve = await w.runtime('/v1/runtime/research/reserve', {
      ...at,
      callId: 'call_1',
      kind: 'search',
      provider: 'tavily',
      amountUsd: 0.01,
      query: 'pdf rendering sandbox',
    })
    assert.equal(reserve.status, 200, JSON.stringify(reserve.json))
    const capture = await w.runtime('/v1/runtime/research/capture', {
      ...at,
      reservationId: reserve.json.reservationId,
      kind: 'search_results',
      provider: 'tavily',
      providerHttpStatus: 200,
      coverage: 'complete',
      limitations: [],
      results: [{ url: 'https://hosts.example.org/a', title: 'Hosts', score: 0.7 }],
    })
    assert.equal(capture.status, 200, JSON.stringify(capture.json))
    assert.deepEqual(capture.json.refs, [`search:${String(capture.json.sourceId)}#1`])
    const settle = await w.runtime('/v1/runtime/research/settle', {
      ...at,
      reservationId: reserve.json.reservationId,
      outcome: 'settled',
      costUsd: 0.008,
    })
    assert.deepEqual([settle.status, settle.json.state], [200, 'settled'])
    const draft = await w.runtime('/v1/runtime/research/draft', {
      ...at,
      callId: 'd1',
      expectedSha256: null,
      text: '# Draft',
    })
    assert.deepEqual([draft.status, draft.json.seq], [200, 1])

    const stale = await w.runtime('/v1/runtime/research/draft', {
      ...at,
      callId: 'd2',
      expectedSha256: null,
      text: '# Again',
    })
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'])
    const neither = await w.runtime('/v1/runtime/research/submit', { ...at, callId: 's0' })
    assert.equal(neither.status, 422, 'a submit carries a result or a blocker')
    const other = await w.runtime('/v1/runtime/research/context', { ...at, nativeSessionId: 'sophia-not-mine' })
    assert.deepEqual([other.status, other.json.code], [403, 'forbidden'])
    const spend = await w.runtime('/v1/runtime/research/reserve', {
      ...at,
      callId: 'm1',
      kind: 'model',
      provider: 'openai-research',
      amountUsd: 4.6,
    })
    assert.deepEqual([spend.status, spend.json.code], [409, 'research_limit_reached'])
    const free = await w.runtime('/v1/runtime/research/reserve', {
      ...at,
      callId: 'r1',
      kind: 'read',
      provider: 'jina',
      amountUsd: 0.02,
      targetRef: 'https://example.org/free',
    })
    assert.equal(free.status, 422, 'a read names a target ref, never a URL')
    const unknownField = await w.runtime('/v1/runtime/research/context', { ...at, url: 'https://example.org' })
    assert.equal(unknownField.status, 422)
    const member = await w.runtime('/v1/runtime/research/context', at, await token(E))
    assert.equal(member.status, 401, 'a member token is not a runtime capability')

    const result = {
      draftSha256: draft.json.sha256,
      title: 'Sandboxed PDF hosts',
      summary: 'Which hosts render PDFs in a sandbox.',
      resultSummary: 'One host found.',
      limitations: [],
      citations: [capture.json.sourceId],
    }
    const submitted = await w.runtime('/v1/runtime/research/submit', { ...at, callId: 's1', result })
    assert.deepEqual([submitted.status, submitted.json.outcome, submitted.json.versionNumber], [200, 'published', 1])
    const again = await w.runtime('/v1/runtime/research/submit', { ...at, callId: 's2', result })
    assert.deepEqual([again.status, again.json.code], [409, 'invalid_state'], 'the task has ended')
  })
})

describe("the research PDF's runtime routes (A11, 0031)", () => {
  it('print the draft as the PDF package, answer a failing report with its checks, and take no markup', async () => {
    const w = await world([...ROLES, PDF_ROLE])
    await withActor(pool, E, 'write', (c) =>
      admitResearchTask(c, w.projectId, {
        key: randomUUID(),
        exchangeId: null,
        request: { question: 'Which hosts render PDFs in a sandbox?', outputs: ['markdown', 'pdf'] },
        specialist: { role: PDF_ROLE.id, route: PDF_ROLE.route },
      }),
    )
    await dispatchOnce(worker, { workerId: 'test-worker' })
    const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
    const create = (batch.json.commands as Array<{ command: RuntimeCommand }>).at(-1)?.command
    assert.ok(create)
    assert.equal(create.payload.role, PDF_ROLE.id)
    const at = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
    const reserve = await w.runtime('/v1/runtime/research/reserve', {
      ...at,
      callId: 'call_1',
      kind: 'search',
      provider: 'tavily',
      amountUsd: 0.01,
      query: 'pdf rendering sandbox',
    })
    const capture = await w.runtime('/v1/runtime/research/capture', {
      ...at,
      reservationId: reserve.json.reservationId,
      kind: 'search_results',
      provider: 'tavily',
      providerHttpStatus: 200,
      coverage: 'complete',
      limitations: [],
      results: [{ url: 'https://hosts.example.org/a', title: 'Hosts' }],
    })
    assert.equal(capture.status, 200, JSON.stringify(capture.json))
    const thin = await w.runtime('/v1/runtime/research/draft', {
      ...at,
      callId: 'd1',
      expectedSha256: null,
      text: '# Notes',
    })
    const rejected = await w.runtime('/v1/runtime/research/render', {
      ...at,
      callId: 'p1',
      draftSha256: thin.json.sha256,
    })
    assert.deepEqual([rejected.status, rejected.json.state], [200, 'rejected'], JSON.stringify(rejected.json))
    const checks = rejected.json.reportChecks as Array<{ name: string; outcome: string }>
    assert.ok(checks.some((c) => c.outcome === 'failed'))

    const filler = Array.from({ length: 60 }, (_, i) => `w${String(i)}`).join(' ')
    const text = `# Hosts\n\n## Summary\n\n${filler} [${String(capture.json.sourceId)}]\n\n## Findings\n\n${filler}\n\n## Conclusion\n\n${filler}\n`
    const draft = await w.runtime('/v1/runtime/research/draft', {
      ...at,
      callId: 'd2',
      expectedSha256: thin.json.sha256,
      text,
    })
    const markup = await w.runtime('/v1/runtime/research/render', {
      ...at,
      callId: 'p2',
      draftSha256: draft.json.sha256,
      html: '<script>x</script>',
    })
    assert.equal(markup.status, 422, 'the request carries no markup')
    const queued = await w.runtime('/v1/runtime/research/render', {
      ...at,
      callId: 'p3',
      draftSha256: draft.json.sha256,
    })
    assert.deepEqual(
      [queued.status, queued.json.state, queued.json.repair, queued.json.report.sections.length],
      [200, 'queued', 'none', 3],
      JSON.stringify(queued.json),
    )
    const read = await w.runtime('/v1/runtime/research/render-result', at)
    assert.deepEqual([read.status, read.json.renderJobId, read.json.state], [200, queued.json.renderJobId, 'queued'])
    const twice = await w.runtime('/v1/runtime/research/render', {
      ...at,
      callId: 'p4',
      draftSha256: draft.json.sha256,
    })
    assert.deepEqual([twice.status, twice.json.code], [409, 'invalid_state'], 'one render at a time')
    const early = await w.runtime('/v1/runtime/research/submit', {
      ...at,
      callId: 's1',
      result: {
        draftSha256: draft.json.sha256,
        title: 'Hosts',
        summary: 'Which hosts render PDFs in a sandbox.',
        resultSummary: 'One host found.',
        limitations: [],
        citations: [capture.json.sourceId],
      },
    })
    assert.deepEqual([early.status, early.json.code], [409, 'invalid_state'], 'the render is still running')
  })
})

/** A PDF task published without its PDF (no render), through the runtime routes as the runtime would. */
async function publishedWithoutPdf() {
  const w = await world([...ROLES, PDF_ROLE])
  await withActor(pool, E, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: null,
      request: { question: 'Which hosts render PDFs in a sandbox?', outputs: ['markdown', 'pdf'] },
      specialist: { role: PDF_ROLE.id, route: PDF_ROLE.route },
    }),
  )
  await dispatchOnce(worker, { workerId: 'test-worker' })
  const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
  const create = (batch.json.commands as Array<{ command: RuntimeCommand }>).at(-1)?.command
  assert.ok(create)
  const at = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
  const reserve = await w.runtime('/v1/runtime/research/reserve', {
    ...at,
    callId: 'call_1',
    kind: 'search',
    provider: 'tavily',
    amountUsd: 0.01,
    query: 'pdf rendering sandbox',
  })
  const capture = await w.runtime('/v1/runtime/research/capture', {
    ...at,
    reservationId: reserve.json.reservationId,
    kind: 'search_results',
    provider: 'tavily',
    providerHttpStatus: 200,
    coverage: 'complete',
    limitations: [],
    results: [{ url: 'https://hosts.example.org/a', title: 'Hosts' }],
  })
  const filler = Array.from({ length: 60 }, (_, i) => `w${String(i)}`).join(' ')
  const text = `# Hosts\n\n## Summary\n\n${filler} [${String(capture.json.sourceId)}]\n\n## Findings\n\n${filler}\n\n## Conclusion\n\n${filler}\n`
  const draft = await w.runtime('/v1/runtime/research/draft', { ...at, callId: 'd1', expectedSha256: null, text })
  const done = await w.runtime('/v1/runtime/research/submit', {
    ...at,
    callId: 's1',
    result: {
      draftSha256: draft.json.sha256,
      title: 'Hosts',
      summary: 'Which hosts render PDFs in a sandbox.',
      resultSummary: 'One host found.',
      limitations: [],
      citations: [capture.json.sourceId],
    },
  })
  assert.deepEqual([done.status, done.json.pdf?.state], [200, 'not_produced'], JSON.stringify(done.json))
  return { w, taskId: String(done.json.taskId), at }
}

describe('Try PDF again over HTTP (A11, 0032)', () => {
  it('queues a rendition of a report published without its PDF, for editors, once per key', async () => {
    const { w, taskId } = await publishedWithoutPdf()
    const path = `/api/v1/projects/${w.projectId}/native-tasks/${taskId}/rendition`
    const again = async (actor: string, key: string | null) =>
      call(path, {
        bearer: await token(actor),
        body: {},
        headers: key === null ? {} : { 'idempotency-key': key },
      })

    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      await owner.query(`DELETE FROM sophia.render_runners WHERE label='api-test-runner'`)
      const none = await again(E, 'try-0')
      assert.deepEqual([none.status, none.json.code], [503, 'native_capability_unavailable'], 'no render runner')
      await owner.query(
        `INSERT INTO sophia.render_runners(label,token_sha256,seen_at) VALUES('api-test-runner',$1,now())
          ON CONFLICT (label) DO UPDATE SET seen_at=now(), state='active', revoked_at=NULL`,
        [createHash('sha256').update('api-test-runner-token', 'utf8').digest()],
      )
    } finally {
      await owner.end()
    }
    const viewer = await again(V, 'try-v')
    assert.deepEqual([viewer.status, viewer.json.code], [403, 'forbidden'], 'a viewer')
    assert.equal((await again(E, null)).status, 422, 'an Idempotency-Key is required')
    const queued = await again(E, 'try-1')
    assert.deepEqual(
      [queued.status, Object.keys(queued.json), queued.json.state],
      [202, ['state', 'renderJobId'], 'queued'],
      'the rendition, and nothing of the printed report',
    )
    assert.deepEqual(await again(E, 'try-1'), queued, 'a replay answers the same')
    const twice = await again(E, 'try-2')
    assert.deepEqual([twice.status, twice.json.code], [409, 'invalid_state'], 'one rendition at a time')
    const detail = await call(`/api/v1/projects/${w.projectId}/native-tasks/${taskId}`, {
      bearer: await token(E),
    })
    assert.deepEqual([detail.status, detail.json.research.pdfRendering], [200, true])
  })
})

describe('the guide’s v1.2 research operations over /v1/media/tool-calls (S6)', () => {
  const renderer = async (seen: 'now' | 'stale') => {
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      await owner.query(
        `INSERT INTO sophia.render_runners(label,token_sha256,seen_at) VALUES('s6-runner',$1,now())
          ON CONFLICT (label) DO UPDATE SET state='active', revoked_at=NULL, seen_at=EXCLUDED.seen_at`,
        [createHash('sha256').update('s6-runner-token').digest()],
      )
      // Stale: no runner of this database asked for work in the last ten minutes.
      if (seen === 'stale') await owner.query(`UPDATE sophia.render_runners SET seen_at=now()-interval '11 minutes'`)
    } finally {
      await owner.end()
    }
  }

  it('render_research: Try PDF again by voice, for the bound speaker, once per call, with typed refusals', async () => {
    const { w, taskId } = await publishedWithoutPdf()
    const render = (opts: ToolOptions = {}, args: object = { taskId }) =>
      tool(w, args, E, { name: 'render_research', guide: 'v1.2', ...opts })
    await renderer('stale')
    const none = await render()
    assert.deepEqual([none.status, none.output.code], ['refused', 'not_started:native_capability_unavailable'])
    await renderer('now')
    const queued = await render({ callId: 'pdf-1' })
    assert.deepEqual([queued.status, queued.output.taskId, queued.output.stage], ['admitted', taskId, 'queued'])
    assert.match(String(queued.output.renderJobId), /^[0-9a-f-]{36}$/)
    assert.deepEqual(await render({ callId: 'pdf-1' }), queued, 'a provider retry is the same call')
    const twice = await render()
    assert.deepEqual([twice.status, twice.output.code], ['refused', 'not_started:invalid_state'], 'one at a time')
    assert.equal((await render({}, { taskId: 'not-a-task' })).status, 'clarify')
    // A viewer's refusal is the database suite's (forbidden): here the floor is the editor's.
  })

  it('control_work steers research with the speaker’s brief, kept as their own contribution', async () => {
    const w = await world()
    const admitted = await tool(w, { question: 'Which sandboxes do PDF rendering services use?' })
    const taskId = String(admitted.output.taskId)
    const steer = (args: object) => tool(w, { taskId, ...args }, E, { name: 'control_work', guide: 'v1.2' })
    assert.equal((await steer({ action: 'steer' })).status, 'clarify', 'a steer says what to change')
    const done = await steer({ action: 'steer', brief: 'Focus on accessibility and the rollout.' })
    assert.equal(done.status, 'ok', JSON.stringify(done))
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      const { rows } = await owner.query<{ kind: string; origin: string; actor: string; body: string }>(
        `SELECT c.kind, d.origin, d.actor_id AS actor, t.body FROM sophia.commands c
           JOIN sophia.contributions d ON d.project_id=c.project_id AND d.source_id=c.body_source_id
           JOIN sophia.source_texts t ON t.project_id=c.project_id AND t.source_id=c.body_source_id
          WHERE c.project_id=$1 AND c.id=$2`,
        [w.projectId, done.output.commandId],
      )
      assert.deepEqual(rows, [
        { kind: 'steer', origin: 'voice', actor: E, body: 'Focus on accessibility and the rollout.' },
      ])
    } finally {
      await owner.end()
    }
  })

  it('project_status lists the research operations and the work’s kind to a v1.2 guide only', async () => {
    const w = await world()
    await tool(w, { question: 'Which sandboxes do PDF rendering services use?' })
    const status = (guide?: 'v1.1' | 'v1.2') => tool(w, {}, E, { name: 'project_status', guide })
    const v12 = await status('v1.2')
    assert.deepEqual(Object.keys(v12.output.operations).slice(-2), ['start_research', 'render_research'])
    assert.equal(v12.output.operations.start_research.available, true)
    assert.equal(v12.output.work[v12.output.work.length - 1]?.kind, 'research')
    for (const older of [await status('v1.1'), await status()]) {
      assert.equal('start_research' in older.output.operations, false, 'a v1.1 guide never hears of them')
    }
  })

  it('records how an announcement reached the room: heard, as text to readers, or both (0035)', async () => {
    const w = await world()
    const announce = (taskId: string, extra: object) =>
      call('/v1/media/announced', { bearer: MEDIA_TOKEN, body: { exchangeId: w.exchangeId, taskId, ...extra } })
    // Three separate requests (newRequest: true), so three tasks to announce.
    const task = async (question: string) => String((await tool(w, { question, newRequest: true })).output.taskId)
    const a = await task('Which sandboxes do PDF services use?')
    const b = await task('Which fonts cover Italian and Spanish?')
    const c = await task('Which hosts allow user namespaces?')
    assert.equal(new Set([a, b, c]).size, 3)
    // Readers got it as text while the room did not hear it; a later retry the room heard adds "heard" and keeps
    // the readers (RF-0017). A replay or a late receipt never takes anything back.
    assert.equal((await announce(a, { resultRevision: 1, heard: false, textRecipients: 2 })).status, 204)
    assert.equal((await announce(a, { resultRevision: 1, heard: true, textRecipients: 1 })).status, 204, 'heard later')
    assert.equal((await announce(a, { resultRevision: 1, heard: false, textRecipients: 2 })).status, 204, 'a replay')
    assert.equal((await announce(b, { resultRevision: 1 })).status, 204, 'an older bridge: heard')
    assert.equal((await announce(b, { resultRevision: 1, heard: false, textRecipients: 1 })).status, 204, 'a reader')
    const nobody = await announce(c, { resultRevision: 1, heard: false, textRecipients: 0 })
    assert.deepEqual([nobody.status, nobody.json.code], [422, 'invalid_request'], 'told to nobody is no announcement')
    assert.equal((await announce(c, { resultRevision: 1, textRecipients: 1001 })).status, 422, 'bounded')
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      const { rows } = await owner.query<{ job: string; heard: boolean; text: number }>(
        `SELECT job_id AS job, heard, text_recipients AS text FROM sophia.exchange_announcements
          WHERE exchange_id=$1 ORDER BY announced_at, job_id`,
        [w.exchangeId],
      )
      const byJob = new Map(rows.map((r) => [r.job, [r.heard, r.text]]))
      assert.deepEqual([byJob.size, byJob.get(a), byJob.get(b)], [2, [true, 2], [true, 1]])
    } finally {
      await owner.end()
    }
  })

  it('refuses what the bridge’s guide does not declare, before reading or writing anything', async () => {
    const w = await world()
    const question = { question: 'Which sandboxes do PDF rendering services use?' }
    for (const guide of ['v1.1', undefined] as const) {
      const research = await tool(w, question, E, { guide })
      assert.deepEqual([research.status, research.output.code], ['refused', 'not_started:not_declared'])
      const render = await tool(w, { taskId: randomUUID() }, E, { name: 'render_research', guide })
      assert.deepEqual([render.status, render.output.code], ['refused', 'not_started:not_declared'])
    }
    const taskId = String((await tool(w, question)).output.taskId)
    const steer = await tool(w, { taskId, action: 'steer', brief: 'Only Linux.' }, E, {
      name: 'control_work',
      guide: 'v1.1',
    })
    assert.deepEqual([steer.status, steer.output.code], ['refused', 'not_started:not_declared'], 'steer is v1.2’s')
    const hold = await tool(w, { taskId, action: 'hold' }, E, { name: 'control_work', guide: 'v1.1' })
    // An admitted goal is not active yet, so the work refuses the Hold: the call passed the guide and reached it.
    assert.deepEqual([hold.status, hold.output.code], ['refused', 'invalid_state'], 'v1.1’s controls reach the work')
  })
})
