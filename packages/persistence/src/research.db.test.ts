// SMC-M03 S4 part 1: research admission, dispatch and the runtime research operations (migration 0025, amendment
// A11), level: sql-run. Member calls use the non-owner sophia_api login with a transaction-local actor, runtime calls
// the same login with no actor, dispatch the sophia_worker login; grants are the owner's (a Codex operation).
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RenderJob, RenderReceipt, RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { parseArtifactVersionList } from '@sophia/contracts/validate'
import { DomainError } from '@sophia/domain'
import { compareSections } from '@sophia/report/markdown'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  type RegisteredRuntime,
  type TestDatabase,
} from '@sophia/test-support'
import {
  admitGoalCommand,
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  editReportSummary,
  enqueueRenderJob,
  listReportSources,
  readArtifactVersions,
  readNativeTask,
  readReportSource,
  recordRuntimeObservations,
  recordRuntimeReady,
  recordRuntimeReceipts,
  rendererClaim,
  rendererFile,
  rendererHeartbeat,
  rendererOutputSlot,
  rendererRecordOutput,
  rendererSettle,
  requestResearchRendition,
  researchGateOpen,
  runtimeHello,
  runtimePoll,
  runtimeResearchCapture,
  runtimeResearchContext,
  runtimeResearchDraft,
  runtimeResearchRender,
  runtimeResearchRenderResult,
  runtimeResearchReserve,
  runtimeResearchSettle,
  runtimeResearchSubmit,
  runtimeTokenHash,
  submitContribution,
  withActor,
  withService,
  type ResearchAdmissionRequest,
  type RuntimeCaller,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const C = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
})
after(async () => {
  await pool.end()
  await worker.end()
  await db.drop()
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

const one = async <T>(sql: string, params: unknown[]): Promise<T> =>
  owner(async (c) => (await c.query(sql, params)).rows[0] as T)

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const PDF: RuntimeRole = { id: 'sophia-research-pdf-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:pdf' }
const specialist = { role: MD.id, route: MD.route }

const caller = (rt: RegisteredRuntime, bridge: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(rt.token),
  runtimeUnitId: rt.runtimeUnitId,
  bridgeInstanceId: bridge,
})

const grant = (projectId: string, state = 'enabled') =>
  owner((c) =>
    c.query(`SELECT sophia.set_research_grant($1, $2, 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId, state]),
  )

/** Claim and dispatch everything pending (every test's rows); the outcomes for `projectId`, in claim order. */
async function dispatchAll(projectId: string) {
  const rows = await claimRuntimeOutbox(worker, 'test-worker', 50, 30)
  const outcomes = []
  for (const row of rows) {
    const outcome = await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
    if (row.project_id === projectId) outcomes.push(outcome)
  }
  return outcomes
}

const delivered = (command: RuntimeCommand): RuntimeReceipt => ({
  commandId: command.commandId,
  attemptId: command.binding.attemptId,
  stage: 'delivered',
  nativeSessionId: `sophia-${command.binding.attemptId}`,
  nativeSequence: 1,
  evidenceRefs: [],
  observedAt: new Date().toISOString(),
  reason: null,
})

/** A project with a granted gate and a ready runtime advertising both research roles, plus one shared input. */
async function world(opts: { roles?: RuntimeRole[]; granted?: boolean } = {}) {
  const project = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  const projectId = project.projectId
  if (opts.granted ?? true) await grant(projectId)
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A })
  const bridge = randomUUID()
  const who = caller(rt, bridge)
  await withService(pool, (c) =>
    runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: opts.roles ?? [MD, PDF] }),
  )
  await withService(pool, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  const input = await withActor(pool, E, 'write', (c) =>
    submitContribution(c, projectId, randomUUID(), {
      source: null,
      text: 'Our pilot hosts render PDFs in a sandbox.',
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )
  return { projectId, rt, who, inputSourceId: input.sourceId }
}

type World = Awaited<ReturnType<typeof world>>

const ask = (
  w: World,
  request: Partial<ResearchAdmissionRequest> = {},
  opts: { actor?: string; key?: string; exchange?: string | null; as?: typeof specialist } = {},
) =>
  withActor(pool, opts.actor ?? E, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: opts.key ?? randomUUID(),
      exchangeId: opts.exchange === undefined ? 'exchange-1' : opts.exchange,
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'], ...request },
      specialist: opts.as ?? specialist,
    }),
  )

/** Admit one task, dispatch its create and deliver it; the attempt and the session a research tool runs in. */
async function started(w: World, request: Partial<ResearchAdmissionRequest> = {}, as = specialist) {
  const admission = await ask(w, request, { exchange: randomUUID(), as })
  assert.ok('admitted' in admission)
  await dispatchAll(w.projectId)
  const batch = await withService(pool, (c) => runtimePoll(c, w.who, 0))
  const create = batch.commands
    .map((q) => q.command as RuntimeCommand)
    .find((cmd) => cmd.binding.attemptId === admission.admitted.attemptId)
  assert.ok(create, 'the create was queued')
  await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [delivered(create)]))
  const at = { attemptId: admission.admitted.attemptId, nativeSessionId: `sophia-${admission.admitted.attemptId}` }
  return { receipt: admission.admitted, create, at }
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex')

const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(pool, fn)

describe('a runtime advertises its research roles', () => {
  it('records the roles of its hello, refuses malformed ones, and an older hello advertises none', async () => {
    const w = await world()
    const roles = await one<{ roles: RuntimeRole[] }>(`SELECT roles FROM sophia.runtime_instances WHERE id=$1`, [
      w.rt.runtimeId,
    ])
    assert.deepEqual(roles.roles, [MD, PDF])
    const bad = {
      bundle: 'test',
      protocolVersion: 1 as const,
      dshVersion: 'x',
      roles: [{ ...MD, route: 'Not A Route' }],
    }
    assert.equal(await codeOf(service((c) => runtimeHello(c, w.who, bad))), 'invalid_request')
    await service((c) => runtimeHello(c, w.who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x' }))
    const none = await one<{ roles: RuntimeRole[] }>(`SELECT roles FROM sophia.runtime_instances WHERE id=$1`, [
      w.rt.runtimeId,
    ])
    assert.deepEqual(none.roles, [])
  })
})

describe('research admission (start_research)', () => {
  it('admits nothing without a grant, with the gate closed, or onto a runtime that does not carry the specialist', async () => {
    assert.equal(await codeOf(ask(await world({ granted: false }))), 'research_gate_closed')
    const closed = await world()
    await grant(closed.projectId, 'disabled')
    assert.equal(await codeOf(ask(closed)), 'research_gate_closed')
    assert.equal(await codeOf(ask(await world({ roles: [PDF] }))), 'native_capability_unavailable')
    const wrongRoute = await world({ roles: [{ ...MD, route: 'default' }] })
    assert.equal(await codeOf(ask(wrongRoute)), 'native_capability_unavailable', 'the role must come with its route')
  })

  it('reads the research gate as admission does: no grant or a disabled one is closed, and outsiders read it closed', async () => {
    const open = (projectId: string, actor = E) => withActor(pool, actor, 'read', (c) => researchGateOpen(c, projectId))
    const none = await world({ granted: false })
    assert.equal(await open(none.projectId), false, 'no grant')
    await grant(none.projectId, 'disabled')
    assert.equal(await open(none.projectId), false, 'a disabled grant')
    await grant(none.projectId, 'enabled')
    assert.deepEqual([await open(none.projectId), await open(none.projectId, V)], [true, true], 'members read it open')
    assert.equal(await open(none.projectId, C), false, 'an outsider')
  })

  it('admits one task with the ordinary records, its lineage and a new allowance from the grant', async () => {
    const w = await world()
    const admission = await ask(w, {
      inputSourceIds: [w.inputSourceId],
      urls: ['https://example.org/sandbox'],
      preferences: { depth: 'standard' },
      assumptions: ['English sources are enough'],
    })
    assert.ok('admitted' in admission)
    const r = admission.admitted
    assert.deepEqual([r.kind, r.stage, r.goalRevision, r.authorityEpoch], ['research', 'admitted', 1, 1])
    const rows = await one<Record<string, unknown>>(
      `SELECT j.kind, j.state, t.role, t.route, t.exchange_id, t.root_job_id=j.id AS is_root, t.urls,
         a.cap_usd::float AS cap, a.headroom_usd::float AS headroom, o.destination, b.native_session_id
       FROM sophia.jobs j JOIN sophia.research_tasks t ON t.project_id=j.project_id AND t.job_id=j.id
       JOIN sophia.research_allowances a ON a.project_id=t.project_id AND a.id=t.allowance_id
       JOIN sophia.outbox o ON o.project_id=j.project_id AND o.command_id=j.command_id
       JOIN sophia.execution_bindings b ON b.project_id=j.project_id AND b.attempt_id=j.attempt_id
       WHERE j.project_id=$1 AND j.id=$2`,
      [w.projectId, r.taskId],
    )
    assert.deepEqual(rows, {
      kind: 'research',
      state: 'pending',
      role: MD.id,
      route: MD.route,
      exchange_id: 'exchange-1',
      is_root: true,
      urls: ['https://example.org/sandbox'],
      cap: 5,
      headroom: 0.5,
      destination: 'native.create',
      native_session_id: `sophia-${r.attemptId}`,
    })
    const manifest = await one<{ body: string }>(
      `SELECT body FROM sophia.source_texts WHERE project_id=$1 AND source_id=$2`,
      [w.projectId, r.contextSourceId],
    )
    const m = JSON.parse(manifest.body) as Record<string, unknown>
    assert.equal(m.schema, 'sophia.research-manifest.v1')
    assert.deepEqual(m.outputs, ['markdown'])
    assert.equal((m.inputs as Array<{ ref: string }>)[0]?.ref, `input:${w.inputSourceId}`)
    assert.match((m.urls as Array<{ ref: string }>)[0]?.ref ?? '', /^input:[0-9a-f-]{36}#1$/)
  })

  it('is idempotent by key, refuses a reused key, and returns the task already under way in the same exchange', async () => {
    const w = await world()
    const key = randomUUID()
    const first = await ask(w, {}, { key })
    assert.deepEqual(await ask(w, {}, { key }), first, 'a retry returns the first receipt')
    assert.equal(await codeOf(ask(w, { question: 'Something else?' }, { key })), 'idempotency_conflict')
    assert.ok('admitted' in first)
    const again = await ask(w, { question: 'Same exchange, asked again?' })
    assert.ok('existingTaskId' in again)
    assert.equal(again.existingTaskId, first.admitted.taskId)
    const declared = await ask(w, { question: 'A second, separate question?', newRequest: true })
    assert.ok('admitted' in declared, 'a declared new request is admitted (and queued behind the first)')
    const elsewhere = await ask(w, { question: 'From another exchange?' }, { exchange: 'exchange-2' })
    assert.ok('admitted' in elsewhere)
  })

  it('refuses viewers, outsiders, unknown outputs, ineligible inputs and bad web addresses', async () => {
    const w = await world()
    assert.equal(await codeOf(ask(w, {}, { actor: V })), 'forbidden')
    assert.equal(await codeOf(ask(w, {}, { actor: C })), 'forbidden')
    assert.equal(
      await codeOf(ask(w, { outputs: ['pdf'] })),
      'invalid_request',
      'Markdown is always the authored format',
    )
    assert.equal(await codeOf(ask(w, { outputs: ['markdown', 'markdown'] as never })), 'invalid_request')
    assert.equal(await codeOf(ask(w, { inputSourceIds: [randomUUID()] })), 'source_ineligible')
    assert.equal(await codeOf(ask(w, { urls: ['javascript:alert(1)'] })), 'invalid_request')
    assert.equal(await codeOf(ask(w, { question: '   ' })), 'invalid_request')
  })

  it('amends an ended task as a new attempt under the same goal and allowance, and never forks a lineage', async () => {
    const w = await world()
    const { receipt: first } = await started(w)
    assert.equal(await codeOf(ask(w, { amendsTaskId: first.taskId })), 'invalid_state', 'steer a task still under way')
    await owner((c) =>
      c.query(`UPDATE sophia.jobs SET state='succeeded' WHERE project_id=$1 AND id=$2`, [w.projectId, first.taskId]),
    )
    const amended = await ask(w, { question: 'Add the costs.', amendsTaskId: first.taskId })
    assert.ok('admitted' in amended)
    assert.equal(amended.admitted.goalId, first.goalId)
    assert.equal(amended.admitted.goalRevision, 2)
    const lineage = await one<{ same: boolean; root: string }>(
      `SELECT a.allowance_id=b.allowance_id AS same, b.root_job_id AS root FROM sophia.research_tasks a, sophia.research_tasks b
       WHERE a.project_id=$1 AND a.job_id=$2 AND b.project_id=$1 AND b.job_id=$3`,
      [w.projectId, first.taskId, amended.admitted.taskId],
    )
    assert.deepEqual(lineage, { same: true, root: first.taskId })
    await owner((c) =>
      c.query(`UPDATE sophia.jobs SET state='succeeded' WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        amended.admitted.taskId,
      ]),
    )
    assert.equal(await codeOf(ask(w, { amendsTaskId: first.taskId })), 'stale_revision', 'a later task continues it')
    assert.equal(await codeOf(ask(w, { amendsTaskId: randomUUID() })), 'not_found')
  })
})

describe('research dispatch', () => {
  it('creates with the manifest role and route, and keeps a second research task queued while one is under way', async () => {
    const w = await world()
    const first = await ask(w, {}, { exchange: 'x-1' })
    const second = await ask(
      w,
      { question: 'And the second question?' },
      { exchange: 'x-2', as: { role: PDF.id, route: PDF.route } },
    )
    assert.ok('admitted' in first && 'admitted' in second)
    const outcomes = await dispatchAll(w.projectId)
    assert.deepEqual(
      outcomes.map((o) => o.result),
      ['enqueued', 'deferred'],
    )
    const [queued] = (await service((c) => runtimePoll(c, w.who, 0))).commands
    const create = queued?.command as RuntimeCommand
    assert.equal(create.kind, 'create')
    assert.deepEqual([create.payload.role, create.payload.route], [MD.id, MD.route])
    assert.match(create.payload.text ?? '', /^Research task\./)
    assert.match(create.payload.text ?? '', /Which sandboxes do PDF rendering services use\?/)
    const waiting = await one<{ reason: string }>(`SELECT reason FROM sophia.jobs WHERE project_id=$1 AND id=$2`, [
      w.projectId,
      second.admitted.taskId,
    ])
    assert.match(waiting.reason, /^waiting for the research worker/)
    await owner((c) =>
      c.query(`UPDATE sophia.jobs SET state='succeeded' WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        first.admitted.taskId,
      ]),
    )
    await owner((c) => c.query(`UPDATE sophia.outbox SET available_at=now() WHERE project_id=$1`, [w.projectId]))
    assert.deepEqual(
      (await dispatchAll(w.projectId)).map((o) => o.result),
      ['enqueued'],
      'once the first has ended',
    )
    const reason = await one<{ reason: string | null }>(
      `SELECT reason FROM sophia.jobs WHERE project_id=$1 AND id=$2`,
      [w.projectId, second.admitted.taskId],
    )
    assert.equal(reason.reason, null, 'the waiting reason clears when it is dispatched')
  })
})

describe('runtime research operations', () => {
  it('reads the task: request, inputs, allowance and roster, and pages a stored source', async () => {
    const w = await world()
    await owner((c) =>
      c.query(`INSERT INTO sophia.room_state(project_id) VALUES($1) ON CONFLICT DO NOTHING`, [w.projectId]),
    )
    await owner((c) =>
      c.query(
        `INSERT INTO sophia.room_invitations(project_id,id,room_id,kind,member_role,email,token_sha256,max_uses,expires_at,created_by,creation_key)
         SELECT $1,gen_random_uuid(),r.id,'member','editor','Giulia@Example.com',sha256(gen_random_uuid()::text::bytea),1,now()+interval '1 day',$2,'k'
         FROM sophia.room_state r WHERE r.project_id=$1 LIMIT 1`,
        [w.projectId, A],
      ),
    )
    const { at, receipt } = await started(w, { inputSourceIds: [w.inputSourceId] })
    const context = await service((c) => runtimeResearchContext(c, w.who, at))
    assert.ok('question' in context)
    assert.equal(context.taskId, receipt.taskId)
    assert.deepEqual(context.allowance, { capUsd: 5, headroomUsd: 0.5, committedUsd: 0, searchesLeft: 5, readsLeft: 8 })
    assert.equal(context.inputs[0]?.sourceId, w.inputSourceId)
    assert.equal(context.draft, null)
    assert.deepEqual(context.roster, [{ name: '', email: 'giulia@example.com' }], 'the guard roster, lower-cased')
    const page = await service((c) =>
      runtimeResearchContext(c, w.who, { ...at, sourceId: w.inputSourceId, offset: 4, limit: 10 }),
    )
    assert.ok('text' in page)
    assert.deepEqual([page.text, page.offset, page.nextOffset, page.totalChars > 14], ['pilot host', 4, 14, true])
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, w.who, { ...at, sourceId: randomUUID() }))),
      'not_found',
      'only what the task may read',
    )
  })

  it('refuses a session or attempt this runtime does not own, and a stale lease', async () => {
    const w = await world()
    const { at } = await started(w)
    const other = await world()
    assert.equal(await codeOf(service((c) => runtimeResearchContext(c, other.who, at))), 'forbidden', 'another runtime')
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, w.who, { ...at, nativeSessionId: 'sophia-other' }))),
      'forbidden',
    )
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, { ...w.who, bridgeInstanceId: randomUUID() }, at))),
      'invalid_state',
      'another bridge holds the lease',
    )
  })

  it('reserves, captures and settles a search, then reads a result it named, its links and an admitted URL', async () => {
    const w = await world()
    const { at } = await started(w, { urls: ['https://example.org/given'] })
    const search = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'call_1',
        kind: 'search',
        provider: 'tavily',
        amountUsd: 0.01,
        query: 'pdf sandbox',
      }),
    )
    assert.deepEqual([search.state, search.kind, search.purpose, search.target], ['reserved', 'search', 'call', null])
    const replay = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'call_1',
        kind: 'search',
        provider: 'tavily',
        amountUsd: 0.01,
        query: 'pdf sandbox',
      }),
    )
    assert.equal(replay.reservationId, search.reservationId, 'idempotent by session and call id')
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...at,
            callId: 'call_1',
            kind: 'search',
            provider: 'tavily',
            amountUsd: 0.01,
            query: 'other',
          }),
        ),
      ),
      'idempotency_conflict',
    )
    const results = await service((c) =>
      runtimeResearchCapture(c, w.who, {
        ...at,
        reservationId: search.reservationId,
        kind: 'search_results',
        provider: 'tavily',
        providerHttpStatus: 200,
        providerRequestId: 'req_1',
        coverage: 'complete',
        limitations: [],
        results: [
          { url: 'https://hosts.example.org/a', title: 'Hosts', snippet: 'Sandboxed rendering', score: 0.9 },
          { url: 'https://hosts.example.org/b' },
        ],
      }),
    )
    assert.deepEqual(results.refs, [`search:${results.sourceId}#1`, `search:${results.sourceId}#2`])
    await service((c) =>
      runtimeResearchSettle(c, w.who, {
        ...at,
        reservationId: search.reservationId,
        outcome: 'settled',
        costUsd: 0.008,
        usage: { credits: 1 },
      }),
    )

    const read = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'call_2',
        kind: 'read',
        provider: 'jina',
        amountUsd: 0.02,
        targetRef: results.refs[0]!,
      }),
    )
    assert.deepEqual(
      read.target,
      { ref: results.refs[0], url: 'https://hosts.example.org/a' },
      'the URL is resolved here',
    )
    // A page with no text at all (one that renders only with JavaScript) is a request refused, never a service fault.
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchCapture(c, w.who, {
            ...at,
            reservationId: read.reservationId,
            kind: 'web_read',
            provider: 'jina',
            providerHttpStatus: 200,
            coverage: 'complete',
            limitations: [],
            text: '',
          }),
        ),
      ),
      'invalid_request',
    )
    const page = await service((c) =>
      runtimeResearchCapture(c, w.who, {
        ...at,
        reservationId: read.reservationId,
        kind: 'web_read',
        provider: 'jina',
        providerHttpStatus: 200,
        originHttpStatus: null,
        reportedFinalUrl: null,
        extraction: 'jina-reader/markdown',
        coverage: 'complete',
        limitations: ['redirects: unverifiable (hosted extractor)'],
        text: '# Hosts\nSee [the sandbox](https://hosts.example.org/sandbox).',
        links: ['https://hosts.example.org/sandbox'],
      }),
    )
    assert.deepEqual(page.refs, [`link:${page.sourceId}#1`])
    const again = await service((c) =>
      runtimeResearchCapture(c, w.who, {
        ...at,
        reservationId: read.reservationId,
        kind: 'web_read',
        provider: 'jina',
        providerHttpStatus: 200,
        coverage: 'complete',
        limitations: [],
        text: 'a different body',
      }),
    )
    assert.equal(again.sourceId, page.sourceId, 'one capture per call; a replay returns it')
    const provenance = await one<Record<string, unknown>>(
      `SELECT kind, target_ref, parent_source_id, requested_url, provider_http_status, origin_http_status FROM sophia.source_provenance
       WHERE project_id=$1 AND source_id=$2`,
      [w.projectId, page.sourceId],
    )
    assert.deepEqual(provenance, {
      kind: 'web_read',
      target_ref: results.refs[0],
      parent_source_id: results.sourceId,
      requested_url: 'https://hosts.example.org/a',
      provider_http_status: 200,
      origin_http_status: null,
    })
    const link = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'call_3',
        kind: 'read',
        provider: 'jina',
        amountUsd: 0.02,
        targetRef: page.refs[0]!,
      }),
    )
    assert.equal(link.target?.url, 'https://hosts.example.org/sandbox')
    const context = await service((c) => runtimeResearchContext(c, w.who, at))
    assert.ok('urls' in context)
    const given = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'call_4',
        kind: 'read',
        provider: 'jina',
        amountUsd: 0.02,
        targetRef: context.urls[0]!.ref,
      }),
    )
    assert.equal(given.target?.url, 'https://example.org/given')
    const stored = await service((c) => runtimeResearchContext(c, w.who, { ...at, sourceId: page.sourceId }))
    assert.ok('text' in stored)
    assert.match(stored.text, /^# Hosts/, 'a captured page is re-read at no cost')
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...at,
            callId: 'call_5',
            kind: 'read',
            provider: 'jina',
            amountUsd: 0.02,
            targetRef: `search:${results.sourceId}#9`,
          }),
        ),
      ),
      'not_found',
      'no ninth result',
    )
  })

  it('never resolves a target from another lineage, and never reads a free URL', async () => {
    const w = await world()
    const { at: mine } = await started(w)
    const search = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...mine,
        callId: 's',
        kind: 'search',
        provider: 'tavily',
        amountUsd: 0.01,
        query: 'q',
      }),
    )
    const captured = await service((c) =>
      runtimeResearchCapture(c, w.who, {
        ...mine,
        reservationId: search.reservationId,
        kind: 'search_results',
        provider: 'tavily',
        providerHttpStatus: 200,
        coverage: 'complete',
        limitations: [],
        results: [{ url: 'https://example.org/x' }],
      }),
    )
    await owner((c) =>
      c.query(`UPDATE sophia.jobs SET state='succeeded' WHERE project_id=$1 AND kind='research'`, [w.projectId]),
    )
    const { at: theirs } = await started(w, { question: 'Another lineage?' })
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...theirs,
            callId: 'r',
            kind: 'read',
            provider: 'jina',
            amountUsd: 0.02,
            targetRef: captured.refs[0]!,
          }),
        ),
      ),
      'not_found',
    )
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, w.who, { ...theirs, sourceId: captured.sourceId }))),
      'not_found',
    )
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...theirs,
            callId: 'm',
            kind: 'model',
            provider: 'openai-research',
            amountUsd: 0.5,
            targetRef: captured.refs[0]!,
          }),
        ),
      ),
      'invalid_request',
      'only a read names a target',
    )
  })

  it('writes the draft with an expected hash: a stale write is refused, a replay returns the same draft', async () => {
    const w = await world()
    const { at } = await started(w)
    const d1 = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Draft one' }),
    )
    assert.deepEqual([d1.seq, d1.sha256], [1, sha('# Draft one')])
    assert.equal(
      await codeOf(
        service((c) => runtimeResearchDraft(c, w.who, { ...at, callId: 'd2', expectedSha256: null, text: '# Two' })),
      ),
      'stale_revision',
    )
    const d2 = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd2', expectedSha256: d1.sha256, text: '# Two' }),
    )
    assert.equal(d2.seq, 2)
    assert.deepEqual(
      await service((c) =>
        runtimeResearchDraft(c, w.who, { ...at, callId: 'd2', expectedSha256: d1.sha256, text: '# Two' }),
      ),
      d2,
    )
    const context = await service((c) => runtimeResearchContext(c, w.who, at))
    assert.ok('draft' in context)
    assert.deepEqual(context.draft, { sourceId: d2.sourceId, sha256: d2.sha256, seq: 2 })
  })

  it('stops at Hold: every operation but settle is refused, and a paid call still settles', async () => {
    const w = await world()
    const { at, receipt } = await started(w)
    const model = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'llm_1',
        kind: 'model',
        provider: 'openai-research',
        amountUsd: 0.4,
      }),
    )
    await withActor(pool, E, 'write', (c) =>
      admitGoalCommand(c, w.projectId, randomUUID(), {
        kind: 'hold',
        goalId: receipt.goalId,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        bodySourceId: null,
      }),
    )
    assert.equal(await codeOf(service((c) => runtimeResearchContext(c, w.who, at))), 'invalid_state')
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...at,
            callId: 'llm_2',
            kind: 'model',
            provider: 'openai-research',
            amountUsd: 0.1,
          }),
        ),
      ),
      'invalid_state',
    )
    assert.equal(
      await codeOf(
        service((c) => runtimeResearchDraft(c, w.who, { ...at, callId: 'd', expectedSha256: null, text: 'x' })),
      ),
      'invalid_state',
    )
    const settled = await service((c) =>
      runtimeResearchSettle(c, w.who, { ...at, reservationId: model.reservationId, outcome: 'settled', costUsd: 0.31 }),
    )
    assert.deepEqual([settled.state, settled.settledUsd], ['settled', 0.31])
  })

  it('holds the allowance: the cap less headroom, then the partial result alone', async () => {
    const w = await world()
    const { at } = await started(w)
    await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'm1',
        kind: 'model',
        provider: 'openai-research',
        amountUsd: 4.5,
      }),
    )
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...at,
            callId: 's1',
            kind: 'search',
            provider: 'tavily',
            amountUsd: 0.01,
            query: 'q',
          }),
        ),
      ),
      'research_limit_reached',
    )
    const partial = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'm2',
        kind: 'model',
        provider: 'openai-research',
        amountUsd: 0.5,
        purpose: 'partial_result',
      }),
    )
    assert.equal(partial.purpose, 'partial_result')
  })

  it('settles only its own session’s calls', async () => {
    const w = await world()
    const { at } = await started(w)
    const mine = await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'm1',
        kind: 'model',
        provider: 'openai-research',
        amountUsd: 0.2,
      }),
    )
    await owner((c) =>
      c.query(`UPDATE sophia.jobs SET state='succeeded' WHERE project_id=$1 AND kind='research'`, [w.projectId]),
    )
    const { at: next } = await started(w, { question: 'A later task?' })
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSettle(c, w.who, { ...next, reservationId: mine.reservationId, outcome: 'released' }),
        ),
      ),
      'not_found',
    )
  })

  it('lets members read research tasks and drafts, and outsiders nothing', async () => {
    const w = await world()
    const { at } = await started(w)
    await service((c) => runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Draft' }))
    const count = (actor: string) =>
      withActor(pool, actor, 'read', async (c) => {
        const { rows } = await c.query<{ tasks: number; drafts: number }>(
          `SELECT (SELECT count(*) FROM sophia.research_tasks WHERE project_id=$1)::int AS tasks,
                  (SELECT count(*) FROM sophia.research_drafts WHERE project_id=$1)::int AS drafts`,
          [w.projectId],
        )
        return rows[0]
      })
    assert.deepEqual(await count(V), { tasks: 1, drafts: 1 })
    assert.deepEqual(await count(C), { tasks: 0, drafts: 0 })
  })
})

/** A search the task made and captured: a source it may cite. */
async function citable(w: World, at: { attemptId: string; nativeSessionId: string }, callId = 'search_1') {
  const r = await service((c) =>
    runtimeResearchReserve(c, w.who, {
      ...at,
      callId,
      kind: 'search',
      provider: 'tavily',
      amountUsd: 0.01,
      query: 'q',
    }),
  )
  return service((c) =>
    runtimeResearchCapture(c, w.who, {
      ...at,
      reservationId: r.reservationId,
      kind: 'search_results',
      provider: 'tavily',
      providerHttpStatus: 200,
      coverage: 'complete',
      limitations: [],
      results: [{ url: 'https://hosts.example.org/a' }],
    }),
  )
}

const resultOf = (draftSha256: string, citations: string[], extra: Record<string, unknown> = {}) => ({
  draftSha256,
  title: 'Sandboxes for PDF rendering',
  summary: 'Which hosts render PDFs in a sandbox, with sources.',
  resultSummary: 'Two hosts render in a sandbox; one does not say.',
  limitations: ['One vendor page could not be read.'],
  citations,
  ...extra,
})

/** A turn end, as the runtime observes it, after the receipt of the command it ran under. */
async function turnEnd(w: World, attemptId: string, seq: number, kind: string) {
  await service((c) =>
    recordRuntimeObservations(c, w.who, [
      {
        runtimeUnitId: w.rt.runtimeUnitId,
        attemptId,
        nativeSessionId: `sophia-${attemptId}`,
        nativeSeq: seq,
        type: 'turn/end',
        durable: true,
        data: { reason: { kind } },
      },
    ]),
  )
}

describe('research submission (0026)', () => {
  it('publishes the current draft as the first stable version of a new report, once', async () => {
    const w = await world()
    const { at, receipt } = await started(w)
    const cited = await citable(w, at)
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Report' }),
    )
    const submit = (callId: string) =>
      service((c) => runtimeResearchSubmit(c, w.who, { ...at, callId, result: resultOf(d.sha256, [cited.sourceId]) }))
    const done = await submit('submit_1')
    assert.deepEqual(
      [done.outcome, done.versionNumber, done.sha256, done.sourceId],
      ['published', 1, d.sha256, d.sourceId],
    )
    assert.deepEqual(await submit('submit_1'), done, 'a replay returns the same version')
    assert.equal(await codeOf(submit('submit_2')), 'invalid_state', 'another submit on an ended task')
    assert.equal(await codeOf(service((c) => runtimeResearchContext(c, w.who, at))), 'invalid_state', 'the tools stop')
    const row = await one<Record<string, unknown>>(
      `SELECT a.format, a.summary, a.stable_version_id=v.id AS current, v.state, v.change_note, v.checks_passed,
         v.validation_source_id IS NOT NULL AS validated, v.change_facts->>'cited' AS cited, v.trigger->>'kind' AS trigger,
         j.state AS job, j.artifact_id=a.id AS linked, j.result_source_id IS NOT NULL AS summarized, g.status AS goal, wa.state AS attempt,
         (SELECT count(*)::int FROM sophia.source_dependencies d WHERE d.project_id=v.project_id AND d.derived_source_id=v.source_id
            AND d.source_id=$3) AS cites
       FROM sophia.artifact_versions v JOIN sophia.artifacts a ON a.project_id=v.project_id AND a.id=v.artifact_id
       JOIN sophia.jobs j ON j.project_id=v.project_id AND j.id=v.job_id
       JOIN sophia.goals g ON g.project_id=v.project_id AND g.id=v.goal_id
       JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
       WHERE v.project_id=$1 AND v.id=$2`,
      [w.projectId, done.versionId, cited.sourceId],
    )
    assert.deepEqual(row, {
      format: 'markdown',
      summary: 'Which hosts render PDFs in a sandbox, with sources.',
      current: true,
      state: 'stable',
      change_note: 'First version',
      checks_passed: true,
      validated: true,
      cited: '1',
      trigger: 'research',
      job: 'succeeded',
      linked: true,
      summarized: true,
      goal: 'completed',
      attempt: 'accepted',
      cites: 1,
    })
    assert.equal(done.taskId, receipt.taskId)
  })

  it('refuses a stale draft, no draft, a citation the task may not read, and a result with a blocker', async () => {
    const w = await world()
    const { at } = await started(w)
    const cited = await citable(w, at)
    const submit = (result: ReturnType<typeof resultOf>) =>
      codeOf(service((c) => runtimeResearchSubmit(c, w.who, { ...at, callId: randomUUID(), result })))
    assert.equal(await submit(resultOf('a'.repeat(64), [cited.sourceId])), 'not_found', 'no draft yet')
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Report' }),
    )
    assert.equal(await submit(resultOf('b'.repeat(64), [cited.sourceId])), 'stale_revision')
    assert.equal(await submit(resultOf(d.sha256, [randomUUID()])), 'not_found')
    assert.equal(await submit(resultOf(d.sha256, [d.sourceId])), 'not_found', 'the report does not cite itself')
    const other = await world()
    const { at: theirs } = await started(other)
    const foreign = await citable(other, theirs)
    assert.equal(await submit(resultOf(d.sha256, [foreign.sourceId])), 'not_found', 'another project')
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSubmit(c, w.who, {
            ...at,
            callId: 'x',
            result: resultOf(d.sha256, [cited.sourceId]),
            blocker: { reason: 'r' },
          }),
        ),
      ),
      'invalid_request',
    )
  })

  it('adds an amendment as the next version of the same report, which must say what changed', async () => {
    const w = await world()
    const first = await started(w)
    const cited = await citable(w, first.at)
    const d1 = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...first.at, callId: 'd1', expectedSha256: null, text: '# V1' }),
    )
    const v1 = await service((c) =>
      runtimeResearchSubmit(c, w.who, { ...first.at, callId: 's1', result: resultOf(d1.sha256, [cited.sourceId]) }),
    )
    const amended = await started(w, { question: 'Add the costs.', amendsTaskId: first.receipt.taskId })
    const more = await citable(w, amended.at, 'search_2')
    const d2 = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...amended.at, callId: 'd2', expectedSha256: null, text: '# V2' }),
    )
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSubmit(c, w.who, {
            ...amended.at,
            callId: 's2',
            result: resultOf(d2.sha256, [more.sourceId]),
          }),
        ),
      ),
      'invalid_request',
      'what changed is required',
    )
    const v2 = await service((c) =>
      runtimeResearchSubmit(c, w.who, {
        ...amended.at,
        callId: 's3',
        result: resultOf(d2.sha256, [cited.sourceId, more.sourceId], {
          changeNote: 'Added the costs.',
          retainedNote: 'The host list.',
        }),
      }),
    )
    assert.deepEqual([v2.artifactId, v2.versionNumber], [v1.artifactId, 2])
    const versions = await owner(
      async (c) =>
        (
          await c.query<{
            n: number
            state: string
            parent: string | null
            facts: { added: string[]; dropped: string[] }
          }>(
            `SELECT version_number AS n, state, parent_id AS parent, change_facts AS facts FROM sophia.artifact_versions
           WHERE project_id=$1 AND artifact_id=$2 ORDER BY version_number`,
            [w.projectId, v1.artifactId],
          )
        ).rows,
    )
    assert.deepEqual(
      versions.map((v) => [v.n, v.state, v.parent]),
      [
        [1, 'superseded', null],
        [2, 'stable', v1.versionId],
      ],
    )
    assert.deepEqual(versions[1]?.facts.added, [more.sourceId])
    assert.deepEqual(versions[1]?.facts.dropped, [])
  })

  it('CX-0019 · a version cites every source its draft cites that the task may read, whatever the model listed', async () => {
    const w = await world()
    const own = (taskId: string) =>
      one<{ question: string; manifest: string }>(
        `SELECT t.question_source_id AS question, j.input_source_id AS manifest FROM sophia.research_tasks t
         JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id WHERE t.project_id=$1 AND t.job_id=$2`,
        [w.projectId, taskId],
      )
    const factsOf = (versionId: string) =>
      one<{ facts: { cited: number; added: string[]; dropped: string[]; notesFromFacts: boolean }; note: string }>(
        `SELECT change_facts AS facts, change_note AS note FROM sophia.artifact_versions WHERE project_id=$1 AND id=$2`,
        [w.projectId, versionId],
      )
    const sourcesOf = async (artifactId: string, versionId: string) =>
      (await withActor(pool, A, 'read', (c) => listReportSources(c, artifactId, versionId))).sources
        .map((s) => s.sourceId)
        .toSorted()
    const other = await world()
    const foreign = await citable(other, (await started(other)).at)
    const stray = randomUUID()

    // A first version: a search, a page read from it and an input, cited as models write them; the model lists one.
    const first = await started(w, { inputSourceIds: [w.inputSourceId], urls: ['https://hosts.example.org/start'] })
    const a = await citable(w, first.at, 'search_1')
    const page = await readPage(w, first.at, a)
    const q1 = await own(first.receipt.taskId)
    const kept = `A [1](<${a.sourceId}>), its page [2](${page.sourceId}) and our notes [3](input:${w.inputSourceId}).`
    const asked = `Asked as [4](input:${q1.question}#1) under [5](${q1.manifest}); never [6](${stray}) or [${foreign.sourceId}].`
    const d1 = await service((c) =>
      runtimeResearchDraft(c, w.who, {
        ...first.at,
        callId: 'd1',
        expectedSha256: null,
        text: `# Hosts\n\n${kept}\n\n${asked}\n`,
      }),
    )
    const v1 = await service((c) =>
      runtimeResearchSubmit(c, w.who, { ...first.at, callId: 's1', result: resultOf(d1.sha256, [a.sourceId]) }),
    )
    assert.equal(v1.outcome, 'published')
    assert.deepEqual(
      await sourcesOf(v1.artifactId!, v1.versionId!),
      [a.sourceId, page.sourceId, w.inputSourceId].toSorted(),
    )
    assert.equal((await factsOf(v1.versionId!)).facts.cited, 3)

    // An amendment keeps v1's citations and adds a search; the model lists only the base, as the pilot's did.
    const amended = await started(w, {
      question: 'Add the costs.',
      amendsTaskId: first.receipt.taskId,
      inputSourceIds: [w.inputSourceId],
    })
    const more = await citable(w, amended.at, 'search_2')
    const q2 = await own(amended.receipt.taskId)
    const text = [
      `# Hosts\n\n${kept}\n\n## Costs\n\nA is $1 a page [4](search:${more.sourceId}#1).`,
      `Asked as [5](${q2.question}) under [6](${q2.manifest}), earlier [7](${q1.question}); never [8](${stray}).\n`,
    ].join('\n\n')
    const d2 = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...amended.at, callId: 'd2', expectedSha256: null, text }),
    )
    const submit = () =>
      service((c) =>
        runtimeResearchSubmit(c, w.who, {
          ...amended.at,
          callId: 's2',
          result: resultOf(d2.sha256, [v1.sourceId!], amendNotes),
        }),
      )
    const v2 = await submit()
    assert.deepEqual([v2.outcome, v2.versionNumber, v2.notesFromFacts], ['published', 2, false])
    assert.deepEqual(
      await sourcesOf(v2.artifactId!, v2.versionId!),
      [v1.sourceId!, a.sourceId, page.sourceId, w.inputSourceId, more.sourceId].toSorted(),
      'the base stays a cited source; never the task’s own question or manifest, an earlier question, a stray or foreign id',
    )
    const facts = await factsOf(v2.versionId!)
    assert.deepEqual(facts.facts.added, [v1.sourceId!, more.sourceId].toSorted())
    assert.deepEqual(facts.facts.dropped, [])
    assert.equal(facts.facts.cited, 5)
    // The notes are judged against the sections (0027), so the model's own notes stand: never ones from the facts.
    assert.deepEqual([facts.facts.notesFromFacts, facts.note], [false, amendNotes.changeNote])
    assert.deepEqual(await submit(), v2, 'a replay of the ended task returns the same version')
  })

  it('CX-0019 · adds an input or a page whatever its text, never an earlier draft, and checks at most 50 ids', async () => {
    const w = await world()
    const json = await withActor(pool, E, 'write', (c) =>
      submitContribution(c, w.projectId, randomUUID(), {
        source: null,
        text: '{"schema": "sophia.research-manifest.v1", "note": "a copy we keep"}',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    const { at } = await started(w, { inputSourceIds: [json.sourceId] })
    const a = await citable(w, at, 'search_1')
    const braced = await readPage(w, at, a, '{{Infobox host}}\nThe sandbox is a microVM {"cut": ')
    const api = await citable(w, at, 'search_2')
    // A page of JSON-like text too long to read whole (6,000 characters a page): it never names the manifest's schema.
    const long = await readPage(w, at, api, `{"items": [${'"a host", '.repeat(4000)}`, 'read_2')
    const late = await citable(w, at, 'search_3')
    const draft = (callId: string, text: string, expectedSha256: string | null) =>
      service((c) => runtimeResearchDraft(c, w.who, { ...at, callId, expectedSha256, text }))
    const d1 = await draft('d1', `# Hosts\n\nA [${a.sourceId}].\n`, null)
    const strays = Array.from({ length: 46 }, () => `[x](${randomUUID()})`).join(' ')
    const text = [
      `# Hosts\n\nA [1](${a.sourceId}), our copy [2](input:${json.sourceId}), a wiki page [3](<${braced.sourceId}>), an API [4](${long.sourceId}).`,
      `As drafted [4](${d1.sourceId}). ${strays} Past the checks [5](${late.sourceId}).\n`,
    ].join('\n\n')
    const d2 = await draft('d2', text, d1.sha256)
    const v = await service((c) =>
      runtimeResearchSubmit(c, w.who, { ...at, callId: 's', result: resultOf(d2.sha256, [a.sourceId]) }),
    )
    assert.equal(v.outcome, 'published')
    const sources = (await withActor(pool, A, 'read', (c) => listReportSources(c, v.artifactId!, v.versionId!))).sources
    assert.deepEqual(
      sources.map((s) => s.sourceId).toSorted(),
      [a.sourceId, json.sourceId, braced.sourceId, long.sourceId].toSorted(),
      'an input that reads as a manifest and pages that are not JSON are added; an earlier draft and the 51st id are not',
    )
  })

  it('records a blocker with the remaining work and keeps the draft; a replay returns it', async () => {
    const w = await world()
    const { at } = await started(w)
    await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Partial' }),
    )
    const block = {
      reason: 'Every source is behind a login.',
      remainingWork: 'Find an open mirror of the vendor docs.',
    }
    const out = await service((c) => runtimeResearchSubmit(c, w.who, { ...at, callId: 'b1', blocker: block }))
    assert.equal(out.outcome, 'blocked')
    assert.deepEqual(
      await service((c) => runtimeResearchSubmit(c, w.who, { ...at, callId: 'b1', blocker: block })),
      out,
    )
    const job = await one<{ state: string; reason: string; body: string; drafts: number }>(
      `SELECT j.state, j.reason, t.body, (SELECT count(*)::int FROM sophia.research_drafts d WHERE d.project_id=j.project_id AND d.attempt_id=j.attempt_id) AS drafts
       FROM sophia.jobs j JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.result_source_id WHERE j.project_id=$1 AND j.id=$2`,
      [w.projectId, out.taskId],
    )
    assert.deepEqual([job.state, job.reason, job.drafts], ['failed', 'blocked: Every source is behind a login.', 1])
    assert.match(job.body, /Remaining work:\nFind an open mirror/)
  })
})

describe('research turn-end rules (0026)', () => {
  it('nudges a completed turn without a submit once, then fails the task with no_result_submitted', async () => {
    const w = await world()
    const { at, receipt } = await started(w)
    await turnEnd(w, at.attemptId, 5, 'completed')
    await turnEnd(w, at.attemptId, 5, 'completed')
    const nudges = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.commands WHERE project_id=$1 AND kind='input' AND idempotency_key=$2`,
      [w.projectId, `research-nudge:${at.attemptId}`],
    )
    assert.equal(nudges.n, 1, 'once, also when the turn is judged again')
    assert.deepEqual(
      (await dispatchAll(w.projectId)).map((o) => o.result),
      ['enqueued'],
    )
    const input = (await service((c) => runtimePoll(c, w.who, 1))).commands
      .map((q) => q.command as RuntimeCommand)
      .at(-1)
    assert.ok(input)
    assert.equal(input.kind, 'input')
    assert.match(input.payload.text ?? '', /research_submit_result/)
    await service((c) => recordRuntimeReceipts(c, w.who, [{ ...delivered(input), nativeSequence: 6 }]))
    const pending = await one<{ state: string }>(`SELECT state FROM sophia.jobs WHERE project_id=$1 AND id=$2`, [
      w.projectId,
      receipt.taskId,
    ])
    assert.notEqual(pending.state, 'failed', 'the nudged turn has not ended yet')
    await turnEnd(w, at.attemptId, 9, 'completed')
    const failed = await one<{ state: string; reason: string }>(
      `SELECT state, reason FROM sophia.jobs WHERE project_id=$1 AND id=$2`,
      [w.projectId, receipt.taskId],
    )
    assert.deepEqual([failed.state, failed.reason], ['failed', 'no_result_submitted: the draft is kept'])
  })

  it('fails an errored turn and keeps its unsettled calls committed as uncertain', async () => {
    const w = await world()
    const { at, receipt } = await started(w)
    await service((c) =>
      runtimeResearchReserve(c, w.who, {
        ...at,
        callId: 'llm_1',
        kind: 'model',
        provider: 'openai-research',
        amountUsd: 0.4,
      }),
    )
    await turnEnd(w, at.attemptId, 4, 'error')
    const row = await one<{ state: string; reserved: number; uncertain: number; r: string }>(
      `SELECT j.state, a.reserved_usd::float AS reserved, a.uncertain_usd::float AS uncertain,
         (SELECT state FROM sophia.research_reservations r WHERE r.project_id=a.project_id AND r.allowance_id=a.id) AS r
       FROM sophia.jobs j JOIN sophia.research_tasks t ON t.project_id=j.project_id AND t.job_id=j.id
       JOIN sophia.research_allowances a ON a.project_id=t.project_id AND a.id=t.allowance_id WHERE j.project_id=$1 AND j.id=$2`,
      [w.projectId, receipt.taskId],
    )
    assert.deepEqual(row, { state: 'failed', reserved: 0, uncertain: 0.4, r: 'uncertain' })
  })

  it('leaves a submitted task alone, and a turn from before a Hold changes nothing', async () => {
    const w = await world()
    const { at, receipt } = await started(w)
    await withActor(pool, E, 'write', (c) =>
      admitGoalCommand(c, w.projectId, randomUUID(), {
        kind: 'hold',
        goalId: receipt.goalId,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        bodySourceId: null,
      }),
    )
    await turnEnd(w, at.attemptId, 5, 'completed')
    const held = await one<{ state: string; nudge: string | null }>(
      `SELECT j.state, t.nudge_command_id AS nudge FROM sophia.jobs j JOIN sophia.research_tasks t ON t.project_id=j.project_id AND t.job_id=j.id
       WHERE j.project_id=$1 AND j.id=$2`,
      [w.projectId, receipt.taskId],
    )
    assert.deepEqual(held, { state: 'running', nudge: null }, 'no nudge while held')
  })
})

/** A page the task read through a search result, captured with the title the extractor reported. */
async function readPage(
  w: World,
  at: { attemptId: string; nativeSessionId: string },
  results: { refs: readonly string[]; sourceId: string },
  text = '# Hosts\nThe sandbox is a microVM.',
  callId = 'read_1',
) {
  const r = await service((c) =>
    runtimeResearchReserve(c, w.who, {
      ...at,
      callId,
      kind: 'read',
      provider: 'jina',
      amountUsd: 0.02,
      targetRef: results.refs[0]!,
    }),
  )
  return service((c) =>
    runtimeResearchCapture(c, w.who, {
      ...at,
      reservationId: r.reservationId,
      kind: 'web_read',
      provider: 'jina',
      providerHttpStatus: 200,
      originHttpStatus: null,
      reportedFinalUrl: null,
      extraction: 'jina-reader/markdown',
      coverage: 'partial',
      limitations: ['truncated: the page was cut at 256 KiB'],
      text,
      title: 'Hosts and their sandboxes',
    }),
  )
}

const bytes = (t: string) => Buffer.byteLength(t)
const V1 = '# Hosts\nA and B.\n\n## Costs\nUnknown.\n\n## Conclusion\nUse A.\n\n```\n# not a heading\n```\n'
const V2 = '# Hosts\nA and B.\n\n## Costs\nA is $1 a page.\n\n## Pricing tiers\nThree tiers.\n'

/** A first version (V1) and an admitted amendment with its V2 draft: what the truth-gate tests submit. */
async function amending(w: World, texts: { v1: string; v2: string } = { v1: V1, v2: V2 }) {
  const first = await started(w)
  const cited = await citable(w, first.at)
  const d1 = await service((c) =>
    runtimeResearchDraft(c, w.who, { ...first.at, callId: 'd1', expectedSha256: null, text: texts.v1 }),
  )
  const v1 = await service((c) =>
    runtimeResearchSubmit(c, w.who, {
      ...first.at,
      callId: 's1',
      result: resultOf(d1.sha256, [cited.sourceId], { retainedNote: 'Everything.' }),
    }),
  )
  const amended = await started(w, { question: 'Add the costs.', amendsTaskId: first.receipt.taskId })
  const d2 = await service((c) =>
    runtimeResearchDraft(c, w.who, { ...amended.at, callId: 'd2', expectedSha256: null, text: texts.v2 }),
  )
  const submit = (callId: string, notes: { changeNote: string; retainedNote?: string }) =>
    service((c) =>
      runtimeResearchSubmit(c, w.who, { ...amended.at, callId, result: resultOf(d2.sha256, [cited.sourceId], notes) }),
    )
  return { first, cited, v1, amended, submit }
}

/** A report whose recommendations and conclusion are separate sections. */
const REPORT = '# Hosts\n\n## Findings\nA is fast.\n\n## Recommendations\nUse A.\n\n## Conclusion\nA wins.\n'
/** Options with the same subheadings under each. */
const OPTIONS =
  '# Options\n\n## Option A\nFast.\n\n### Pros\nCheap.\n\n### Cons\nLoud.\n\n## Option B\nSlow.\n\n### Pros\nQuiet.\n\n### Cons\nCostly.\n'
/** OPTIONS with Option A's pros revised and an Option C, with its own pros, between A and B. */
const OPTIONS_V2 = OPTIONS.replace('Cheap.', 'Cheap and simple.').replace(
  '## Option B',
  '## Option C\nNew.\n\n### Pros\nFree.\n\n## Option B',
)

describe('report facts, each section once (0036)', () => {
  it('publishes "conclusion unchanged" as written when only the recommendations changed', async () => {
    const w = await world()
    const { submit } = await amending(w, { v1: REPORT, v2: REPORT.replace('Use A.', 'Use A; budget for B.') })
    const done = await submit('s2', { changeNote: 'Recommendations expanded; conclusion unchanged.' })
    assert.deepEqual([done.outcome, done.notesFromFacts], ['published', false])
    const row = await one<{ change_note: string }>(`SELECT change_note FROM sophia.artifact_versions WHERE id=$1`, [
      done.versionId,
    ])
    assert.equal(row.change_note, 'Recommendations expanded; conclusion unchanged.')
  })

  it('refuses "recommendations unchanged" when they changed, with the facts', async () => {
    const w = await world()
    const { submit } = await amending(w, { v1: REPORT, v2: REPORT.replace('Use A.', 'Use A; budget for B.') })
    const refused = await submit('s2', {
      changeNote: 'Findings tightened.',
      retainedNote: 'Recommendations unchanged.',
    })
    assert.deepEqual(
      [refused.outcome, refused.problems, refused.sections],
      [
        'notes_rejected',
        ['The note calls the recommendations unchanged, but they changed.'],
        {
          added: [],
          revised: ['Recommendations'],
          removed: [],
          unchanged: ['Hosts', 'Findings', 'Conclusion'],
          conclusionChanged: true,
        },
      ],
    )
  })

  it('counts a repeated subheading once, and Studio compares as the service counted', async () => {
    const w = await world()
    const { v1, submit } = await amending(w, { v1: OPTIONS, v2: OPTIONS_V2 })
    const done = await submit('s2', {
      changeNote: "Revised Option A's pros; added Option C.",
      retainedNote: 'Option B as it was.',
    })
    assert.deepEqual([done.outcome, done.notesFromFacts], ['published', false])
    const history = await withActor(pool, V, 'read', (c) => readArtifactVersions(c, v1.artifactId!))
    assert.deepEqual(parseArtifactVersionList(history), history, 'the deployed readers parse the facts')
    const sections = {
      added: ['Option C', 'Pros'],
      revised: ['Pros'],
      removed: [],
      unchanged: ['Options', 'Option A', 'Cons', 'Option B', 'Pros', 'Cons'],
      conclusionChanged: false,
    }
    assert.deepEqual(history[0]?.changeFacts?.sections, sections)
    assert.deepEqual(compareSections(OPTIONS, OPTIONS_V2), sections, 'Studio compares as the service counted')
  })

  it('accepts "No changes." for an amendment whose repeated headings are all as they were', async () => {
    const w = await world()
    const { submit } = await amending(w, { v1: OPTIONS, v2: `${OPTIONS}\n` })
    const done = await submit('s2', { changeNote: 'No changes.' })
    assert.deepEqual([done.outcome, done.notesFromFacts], ['published', false])
  })
})

describe('report facts (0027)', () => {
  it('splits Markdown into sections by heading, skipping fenced code, and compares two versions', async () => {
    const sections = await one<{ s: { heading: string | null; anchor: string }[] }>(
      `SELECT jsonb_agg(jsonb_build_object('heading',heading,'anchor',anchor) ORDER BY ord) AS s
         FROM sophia.markdown_sections($1)`,
      ['Intro line.\n' + V1],
    )
    assert.deepEqual(sections.s, [
      { heading: null, anchor: '' },
      { heading: 'Hosts', anchor: 'hosts' },
      { heading: 'Costs', anchor: 'costs' },
      { heading: 'Conclusion', anchor: 'conclusion' },
    ])
    const facts = await one<{ f: unknown; first: unknown }>(
      `SELECT sophia.section_facts($1, $2) AS f, sophia.section_facts(NULL, $1) AS first`,
      [V1, V2],
    )
    assert.deepEqual(facts.f, {
      added: ['Pricing tiers'],
      revised: ['Costs'],
      removed: ['Conclusion'],
      unchanged: ['Hosts'],
      conclusionChanged: true,
    })
    assert.deepEqual(facts.first, {
      added: ['Hosts', 'Costs', 'Conclusion'],
      revised: [],
      removed: [],
      unchanged: [],
      conclusionChanged: false,
    })
  })

  it('refuses notes that contradict the facts once (a retry of that call alike), then publishes notes from the facts', async () => {
    const w = await world()
    const { first, cited, v1, amended, submit } = await amending(w)
    const bad = { changeNote: 'No changes.', retainedNote: 'The conclusion stays the same.' }
    const sections = {
      added: ['Pricing tiers'],
      revised: ['Costs'],
      removed: ['Conclusion'],
      unchanged: ['Hosts'],
      conclusionChanged: true,
    }
    const refused = await submit('s2', bad)
    assert.deepEqual(refused, {
      taskId: amended.receipt.taskId,
      outcome: 'notes_rejected',
      problems: [
        'The note says nothing changed, but 3 sections changed.',
        'The note calls the conclusion unchanged, but it changed.',
        'The kept note names "Conclusion", which was removed.',
      ],
      sections,
    })
    assert.deepEqual(await submit('s2', bad), refused, 'a retry of the refused call is refused the same way')
    const stable = await one<{ id: string }>(`SELECT stable_version_id AS id FROM sophia.artifacts WHERE id=$1`, [
      v1.artifactId,
    ])
    assert.equal(stable.id, v1.versionId, 'nothing was published')

    const done = await submit('s3', bad)
    assert.deepEqual([done.outcome, done.versionNumber, done.notesFromFacts], ['published', 2, true])
    const [latest, previous] = (await withActor(pool, V, 'read', (c) => readArtifactVersions(c, v1.artifactId!))).map(
      (v) => ({ note: v.changeNote, kept: v.retainedNote, facts: v.changeFacts, trigger: v.trigger }),
    )
    assert.deepEqual(latest, {
      note: '1 revised: Costs; 1 added: Pricing tiers; 1 removed: Conclusion.',
      kept: '1 unchanged: Hosts.',
      facts: {
        cited: 1,
        added: [],
        dropped: [],
        bytes: bytes(V2),
        previousBytes: bytes(V1),
        sections,
        notesFromFacts: true,
      },
      trigger: { kind: 'research', taskId: done.taskId, amendsTaskId: first.receipt.taskId },
    })
    assert.deepEqual(
      previous,
      {
        note: 'First version',
        kept: undefined,
        facts: {
          cited: 1,
          added: [cited.sourceId],
          dropped: [],
          bytes: bytes(V1),
          previousBytes: null,
          sections: {
            added: ['Hosts', 'Costs', 'Conclusion'],
            revised: [],
            removed: [],
            unchanged: [],
            conclusionChanged: false,
          },
          notesFromFacts: false,
        },
        trigger: { kind: 'research', taskId: first.receipt.taskId },
      },
      'a first version keeps nothing',
    )
  })

  it('publishes notes that agree with the facts as written', async () => {
    const w = await world()
    const { submit } = await amending(w)
    const done = await submit('s2', {
      changeNote: 'Priced the hosts and dropped the conclusion.',
      retainedNote: 'The host list.',
    })
    assert.deepEqual([done.outcome, done.notesFromFacts], ['published', false])
    const row = await one<{ change_note: string; retained_note: string }>(
      `SELECT change_note, retained_note FROM sophia.artifact_versions WHERE id=$1`,
      [done.versionId],
    )
    assert.deepEqual(row, {
      change_note: 'Priced the hosts and dropped the conclusion.',
      retained_note: 'The host list.',
    })
  })

  it('lists the sources a version cites with their provenance, to members only', async () => {
    const w = await world()
    const { at } = await started(w, { inputSourceIds: [w.inputSourceId] })
    const results = await citable(w, at)
    const page = await readPage(w, at, results)
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Report' }),
    )
    const done = await service((c) =>
      runtimeResearchSubmit(c, w.who, {
        ...at,
        callId: 's1',
        result: resultOf(d.sha256, [results.sourceId, page.sourceId, w.inputSourceId]),
      }),
    )
    const list = (actor: string, versionId = done.versionId!) =>
      withActor(pool, actor, 'read', (c) => listReportSources(c, done.artifactId!, versionId))
    const { sources } = await list(V)
    assert.deepEqual(
      sources.map((s) => [
        s.sourceId,
        s.kind,
        s.provider,
        s.title,
        s.url,
        s.coverage,
        s.originHttpStatus,
        s.limitations,
      ]),
      [
        [results.sourceId, 'search_results', 'tavily', 'Search: q', null, 'complete', null, []],
        [
          page.sourceId,
          'web_read',
          'jina',
          'Hosts and their sandboxes',
          'https://hosts.example.org/a',
          'partial',
          null,
          ['truncated: the page was cut at 256 KiB'],
        ],
        [w.inputSourceId, 'input', null, null, null, null, null, []],
      ],
    )
    for (const s of sources.slice(0, 2)) assert.ok(s.retrievedAt)
    assert.equal(sources[2]?.retrievedAt, null)
    assert.equal(await codeOf(list(C)), 'not_found', 'an outsider')
    assert.equal(await codeOf(list(V, randomUUID())), 'not_found', 'another version')
  })

  it("lets an editor change a report's description, attributed and against the revision they saw", async () => {
    const w = await world()
    const { v1, submit } = await amending(w)
    const seen = await withActor(pool, V, 'read', (c) =>
      c.query<{ summary_revision: string }>(`SELECT summary_revision FROM sophia.artifacts WHERE id=$1`, [
        v1.artifactId,
      ]),
    )
    const revision = Number(seen.rows[0]?.summary_revision)
    const edit = (actor: string, expectedRevision: number, summary = 'Sandboxed PDF hosts, priced.') =>
      withActor(pool, actor, 'write', (c) => editReportSummary(c, v1.artifactId!, { summary, expectedRevision }))
    assert.equal(await codeOf(edit(V, revision)), 'forbidden', 'a viewer')
    assert.equal(await codeOf(edit(C, revision)), 'not_found', 'an outsider')
    assert.equal(await codeOf(edit(E, revision, '   ')), 'invalid_request')
    const edited = await edit(E, revision)
    assert.deepEqual(
      [edited.summary, edited.summaryAuthorId, edited.summaryRevision],
      ['Sandboxed PDF hosts, priced.', E, revision + 1],
    )
    assert.ok(edited.summaryUpdatedAt)
    assert.equal(await codeOf(edit(A, revision, 'Another.')), 'stale_revision', 'the revision they saw is gone')
    await submit('s2', { changeNote: 'Priced the hosts and dropped the conclusion.' })
    const kept = await one<{ summary: string; summary_author_id: string }>(
      `SELECT summary, summary_author_id FROM sophia.artifacts WHERE id=$1`,
      [v1.artifactId],
    )
    assert.deepEqual(
      kept,
      { summary: 'Sandboxed PDF hosts, priced.', summary_author_id: E },
      "a member's description stays",
    )
  })

  it('reads a research task with its question, specialist and how far its allowance has gone', async () => {
    const w = await world()
    const { at, receipt } = await started(w, { question: 'Which hosts sandbox PDFs?', outputs: ['markdown', 'pdf'] })
    await citable(w, at)
    const read = (actor: string) =>
      withActor(pool, actor, 'read', (c) => readNativeTask(c, w.projectId, receipt.taskId))
    const detail = await read(V)
    const research = detail.research
    assert.ok(research)
    assert.deepEqual(
      [research.question, research.specialist, research.outputs, research.rootTaskId, 'amendsTaskId' in research],
      ['Which hosts sandbox PDFs?', MD.id, ['markdown', 'pdf'], receipt.taskId, false],
    )
    assert.equal(research.capUsd, 5)
    assert.equal(research.searches.used, 1)
    assert.ok(research.searches.max >= 1 && research.reads.max >= 1)
    assert.equal(research.reads.used, 0)
    assert.ok(research.committedUsd >= 0.01 && research.spentUsd === 0, 'the search is reserved, not yet settled')
    assert.equal(await codeOf(read(C)), 'not_found')
  })
})

const byText = (a: string, b: string) => a.localeCompare(b)

/** Withdraw a source the way forgetting a mission note does (0018 mission_erase_source, which revokes since 0028). */
const withdraw = (w: World, sourceId: string) =>
  owner((c) => c.query(`SELECT sophia.mission_erase_source($1, $2)`, [w.projectId, sourceId]))

interface TaskRows {
  job: string
  state: string
  reason: string | null
  attempt: string
  binding: string
  rebuiltFrom: string | null
  allowance: string
  root: string
  manifest: { inputs: unknown[]; withdrawnInputs?: number; lineage: Record<string, unknown> }
}

/** The project's research tasks, oldest first, with their attempt and binding states and their manifest. */
const tasks = (w: World) =>
  owner(
    async (c) =>
      (
        await c.query<TaskRows>(
          `SELECT j.id AS job, j.state, j.reason, wa.state AS attempt, b.state AS binding, t.rebuilt_from_job_id AS "rebuiltFrom",
                  t.allowance_id AS allowance, t.root_job_id AS root, s.body::jsonb AS manifest
             FROM sophia.jobs j JOIN sophia.research_tasks t ON t.project_id=j.project_id AND t.job_id=j.id
             JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
             JOIN sophia.execution_bindings b ON b.project_id=j.project_id AND b.attempt_id=j.attempt_id
             JOIN sophia.source_texts s ON s.project_id=j.project_id AND s.source_id=j.input_source_id
            WHERE j.project_id=$1 ORDER BY t.created_at, j.id`,
          [w.projectId],
        )
      ).rows,
  )

/** The project's outbox rows: destination, state, the command's kind, and the reason when denied. */
const outbox = (w: World) =>
  owner(
    async (c) =>
      (
        await c.query<{
          destination: string
          state: string
          kind: string
          binding: string | null
          reason: string | null
        }>(
          `SELECT o.destination, o.state, c.kind, o.binding_id AS binding, o.outcome_reason AS reason
             FROM sophia.outbox o JOIN sophia.commands c ON c.project_id=o.project_id AND c.id=o.command_id
            WHERE o.project_id=$1 ORDER BY o.created_at, o.id`,
          [w.projectId],
        )
      ).rows,
  )

const goalOf = (w: World, goalId: string) =>
  one<{ revision: string; authority_epoch: string; status: string }>(
    `SELECT revision, authority_epoch, status FROM sophia.goals WHERE project_id=$1 AND id=$2`,
    [w.projectId, goalId],
  )

const control = (
  w: World,
  kind: 'hold' | 'resume' | 'steer' | 'stop',
  goalId: string,
  bodySourceId: string | null = null,
) =>
  goalOf(w, goalId).then((g) =>
    withActor(pool, E, 'write', (c) =>
      admitGoalCommand(c, w.projectId, randomUUID(), {
        kind,
        goalId,
        expectedGoalRevision: Number(g.revision),
        expectedAuthorityEpoch: Number(g.authority_epoch),
        bodySourceId,
      }),
    ),
  )

/**
 * Dispatch everything, then answer each command not answered before (`seen`) the way the runtime would. Returns the
 * new commands.
 */
async function deliverAll(
  w: World,
  seen: Set<string>,
  stage: (cmd: RuntimeCommand) => RuntimeReceipt['stage'] = () => 'delivered',
) {
  await dispatchAll(w.projectId)
  const batch = await withService(pool, (c) => runtimePoll(c, w.who, 0))
  const commands = batch.commands.map((q) => q.command as RuntimeCommand).filter((cmd) => !seen.has(cmd.commandId))
  for (const cmd of commands) seen.add(cmd.commandId)
  await service((c) =>
    recordRuntimeReceipts(
      c,
      w.who,
      commands.map((cmd) => ({ ...delivered(cmd), stage: stage(cmd) })),
    ),
  )
  return commands
}

describe('research revocation (0028, T19)', () => {
  it('revokes running research when an input it read is withdrawn, stops its session and rebuilds it without the input', async () => {
    const w = await world()
    const { at, receipt, create: first } = await started(w, { inputSourceIds: [w.inputSourceId] })
    const seen = new Set([first.commandId])
    await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Quotes the input' }),
    )
    await withdraw(w, w.inputSourceId)

    const [old, rebuilt] = await tasks(w)
    assert.ok(old && rebuilt)
    assert.deepEqual([old.job, old.state, old.attempt, old.binding], [receipt.taskId, 'failed', 'revoked', 'stopping'])
    assert.match(old.reason ?? '', /^revoked: /)
    assert.deepEqual(
      [rebuilt.state, rebuilt.attempt, rebuilt.binding, rebuilt.rebuiltFrom, rebuilt.allowance, rebuilt.root],
      ['pending', 'admitted', 'created', old.job, old.allowance, old.root],
    )
    assert.deepEqual([rebuilt.manifest.inputs, rebuilt.manifest.withdrawnInputs], [[], 1])
    assert.equal(rebuilt.manifest.lineage.rebuiltFromTaskId, old.job)
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, w.who, at))),
      'invalid_state',
      'the revoked session is fenced',
    )

    // A steer admitted before the revoked session has stopped is refused for it.
    const steer = await withActor(pool, E, 'write', (c) =>
      submitContribution(c, w.projectId, randomUUID(), {
        source: null,
        text: 'Look at costs too.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    await control(w, 'steer', receipt.goalId, steer.sourceId)

    // A restart: the hello reports the revoked binding stopped, so it is never loaded.
    const hello = await withService(pool, (c) =>
      runtimeHello(c, w.who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD, PDF] }),
    )
    await withService(pool, (c) => recordRuntimeReady(c, w.who, { state: 'ready', reason: null, unrecovered: [] }))
    assert.deepEqual(
      hello.bindings.filter((b) => b.attemptId === at.attemptId).map((b) => b.state),
      ['stopped'],
    )

    const commands = await deliverAll(w, seen, (cmd) => (cmd.kind === 'stop' ? 'checked' : 'delivered'))
    assert.deepEqual(
      commands
        .map((cmd) => `${cmd.kind}:${cmd.binding.attemptId === at.attemptId ? 'old' : 'rebuilt'}`)
        .toSorted(byText),
      ['create:rebuilt', 'steer:rebuilt', 'stop:old'],
      'the steer reaches the rebuilt task only',
    )
    const rows = await outbox(w)
    const oldSteer = rows.find((r) => r.destination === 'native.steer' && r.state === 'denied')
    assert.equal(oldSteer?.reason, 'a source its work read was withdrawn')
    const [stopped, running] = await tasks(w)
    assert.deepEqual(
      [stopped?.attempt, stopped?.binding, running?.state, running?.attempt],
      ['revoked', 'settled', 'running', 'running'],
    )

    // The rebuilt task reads its task without the input, under the same allowance, and cannot read the withdrawn text.
    const create = commands.find((cmd) => cmd.kind === 'create')
    assert.ok(create)
    const next = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
    const context = await service((c) => runtimeResearchContext(c, w.who, next))
    assert.ok('inputs' in context)
    assert.deepEqual([context.inputs, context.draft], [[], null])
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, w.who, { ...next, sourceId: w.inputSourceId }))),
      'not_found',
    )
  })

  it('leaves a held task waiting until Resume, which queues the rebuilt task and never resumes the revoked one', async () => {
    const w = await world()
    const { receipt, create: first } = await started(w, { inputSourceIds: [w.inputSourceId] })
    const seen = new Set([first.commandId])
    await control(w, 'hold', receipt.goalId)
    await deliverAll(w, seen, () => 'checked')
    assert.equal((await goalOf(w, receipt.goalId)).status, 'held')

    await withdraw(w, w.inputSourceId)
    const [old, rebuilt] = await tasks(w)
    assert.deepEqual([old?.attempt, rebuilt?.state, rebuilt?.binding], ['revoked', 'pending', 'created'])
    assert.equal(
      (await outbox(w)).some((r) => r.destination === 'native.create' && r.state === 'pending'),
      false,
      'nothing is queued while held',
    )

    await control(w, 'resume', receipt.goalId)
    const queued = (await outbox(w)).filter((r) => r.state === 'pending')
    assert.deepEqual(
      queued.map((r) => `${r.destination}:${r.kind}`).toSorted(byText),
      ['control.settle:resume', 'native.create:native_task', 'native.stop:stop'],
      'the rebuilt task is queued under the Resume; no resume row names a revoked or unstarted session',
    )
    const commands = await deliverAll(w, seen, (cmd) => (cmd.kind === 'stop' ? 'checked' : 'delivered'))
    assert.deepEqual(commands.map((cmd) => cmd.kind).toSorted(byText), ['create', 'stop'])
    const resume = await one<{ state: string }>(
      `SELECT state FROM sophia.commands WHERE project_id=$1 AND goal_id=$2 AND kind='resume'`,
      [w.projectId, receipt.goalId],
    )
    assert.equal(resume.state, 'checked', 'the Resume is settled, never denied')
    const [, running] = await tasks(w)
    assert.deepEqual([running?.state, running?.attempt, running?.binding], ['running', 'running', 'running'])
  })

  it('revokes nothing for a source no running task consumed, nor for one still eligible', async () => {
    const w = await world()
    const { receipt } = await started(w)
    const none = await owner(
      async (c) =>
        (
          await c.query<{ r: string[] }>(`SELECT sophia.research_revoke_source($1, $2) AS r`, [
            w.projectId,
            w.inputSourceId,
          ])
        ).rows[0],
    )
    assert.deepEqual(none?.r, [])
    await withdraw(w, w.inputSourceId)
    const [only] = await tasks(w)
    assert.deepEqual([only?.job, only?.state, only?.attempt], [receipt.taskId, 'running', 'running'])
  })
})

// --- 0033: what research drew on is the whole closure (M03-RF-0013..0015) ------------------------------------

/**
 * A report (v1) published by a task admitted with the world's input. Its text quotes the input; `cites` also lists the
 * input among its citations (otherwise only the capture is cited, and the quote is reached through the task).
 */
async function publishedWithInput(w: World, cites = true) {
  const t1 = await started(w, { inputSourceIds: [w.inputSourceId] })
  const cap = await citable(w, t1.at)
  const text = `# Hosts\n\nAs the input put it, our pilot hosts render PDFs in a sandbox [${cap.sourceId}]${cites ? ` [${w.inputSourceId}]` : ''}.\n`
  const d = await service((c) => runtimeResearchDraft(c, w.who, { ...t1.at, callId: 'd1', expectedSha256: null, text }))
  const citations = cites ? [cap.sourceId, w.inputSourceId] : [cap.sourceId]
  const v1 = await service((c) =>
    runtimeResearchSubmit(c, w.who, { ...t1.at, callId: 's1', result: resultOf(d.sha256, citations) }),
  )
  assert.equal(v1.outcome, 'published')
  return { t1, cap, v1 }
}

/** The artifact a research task writes into. */
const artifactOf = async (taskId: string) =>
  (await one<{ artifact_id: string | null }>(`SELECT artifact_id FROM sophia.jobs WHERE id=$1`, [taskId])).artifact_id

const amendNotes = { changeNote: 'Added the costs.', retainedNote: 'The host list.' }

describe('withdrawal reaches what research drew on (0033, M03-RF-0013..0015)', () => {
  it('revokes an amendment reading a report that quoted a withdrawn input, cited or not, and rebuilds it without that base', async () => {
    for (const cites of [true, false]) {
      const w = await world()
      const { t1, v1 } = await publishedWithInput(w, cites)
      const t2 = await started(w, { question: 'Add the costs.', amendsTaskId: t1.receipt.taskId })
      const seen = new Set([t1.create.commandId, t2.create.commandId])
      const base = await service((c) => runtimeResearchContext(c, w.who, { ...t2.at, sourceId: v1.sourceId! }))
      assert.ok('text' in base, 'the amendment reads its base while it is clean')

      await withdraw(w, w.inputSourceId)
      const [first, old, rebuilt, ...more] = await tasks(w)
      assert.ok(first && old && rebuilt && more.length === 0, `cites=${cites}`)
      assert.deepEqual(
        [first.state, old.job, old.attempt],
        ['succeeded', t2.receipt.taskId, 'revoked'],
        `cites=${cites}`,
      )
      assert.equal(rebuilt.rebuiltFrom, old.job)
      const manifest = rebuilt.manifest as TaskRows['manifest'] & { base?: unknown; withdrawnBase?: boolean }
      assert.deepEqual([manifest.base, manifest.withdrawnBase], [undefined, true], 'the base is dropped')
      assert.equal(
        await artifactOf(rebuilt.job),
        await artifactOf(t1.receipt.taskId),
        'it still writes into the report',
      )

      const commands = await deliverAll(w, seen, (cmd) => (cmd.kind === 'stop' ? 'checked' : 'delivered'))
      const create = commands.find((cmd) => cmd.kind === 'create')
      assert.ok(create, 'the rebuilt task starts')
      const next = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
      const context = await service((c) => runtimeResearchContext(c, w.who, next))
      assert.ok('base' in context)
      assert.equal(context.base, null)
      assert.equal(
        await codeOf(service((c) => runtimeResearchContext(c, w.who, { ...next, sourceId: v1.sourceId! }))),
        'not_found',
        'the report that quoted it is not read',
      )
    }
  })

  it('after publication, refuses an amendment of that report, an input drawn from it, and a create held back since', async () => {
    const w = await world()
    const { t1, v1 } = await publishedWithInput(w)
    const queued = await ask(w, { question: 'Add the costs.', amendsTaskId: t1.receipt.taskId }, { exchange: null })
    assert.ok('admitted' in queued, 'clean when admitted')
    // Eligibility can also end without an erase (no revocation runs): the create is refused at dispatch.
    await owner((c) =>
      c.query(`UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        w.inputSourceId,
      ]),
    )
    await dispatchAll(w.projectId)
    const denied = (await outbox(w)).find((r) => r.destination === 'native.create' && r.state === 'denied')
    assert.equal(denied?.reason, 'a source its work would read was withdrawn')
    await owner((c) =>
      c.query(`UPDATE sophia.source_objects SET eligible=true WHERE project_id=$1 AND id=$2`, [
        w.projectId,
        w.inputSourceId,
      ]),
    )

    const v = await world()
    const p = await publishedWithInput(v)
    await withdraw(v, v.inputSourceId)
    assert.equal(
      await codeOf(ask(v, { question: 'Add the costs.', amendsTaskId: p.t1.receipt.taskId })),
      'source_ineligible',
      'the report it would amend draws on a withdrawn source',
    )
    assert.equal(
      await codeOf(ask(v, { question: 'Compare.', inputSourceIds: [p.v1.sourceId!], newRequest: true })),
      'source_ineligible',
      'an input drawn from it',
    )
    assert.equal(v1.outcome, 'published')
  })

  it('a held amendment: revoked and rebuilt without its base, started at Resume; a restart never loads the old one', async () => {
    const w = await world()
    const { t1 } = await publishedWithInput(w)
    const t2 = await started(w, { question: 'Add the costs.', amendsTaskId: t1.receipt.taskId })
    const seen = new Set([t1.create.commandId, t2.create.commandId])
    await control(w, 'hold', t2.receipt.goalId)
    await deliverAll(w, seen, () => 'checked')
    await withdraw(w, w.inputSourceId)
    const [, old, rebuilt] = await tasks(w)
    assert.ok(old && rebuilt)
    assert.deepEqual([old.attempt, rebuilt.state, rebuilt.binding], ['revoked', 'pending', 'created'])
    assert.equal((rebuilt.manifest as { withdrawnBase?: boolean }).withdrawnBase, true)
    const hello = await withService(pool, (c) =>
      runtimeHello(c, w.who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD, PDF] }),
    )
    await withService(pool, (c) => recordRuntimeReady(c, w.who, { state: 'ready', reason: null, unrecovered: [] }))
    assert.deepEqual(
      hello.bindings.filter((b) => b.attemptId === t2.at.attemptId).map((b) => b.state),
      ['stopped'],
    )
    await control(w, 'resume', t2.receipt.goalId)
    const commands = await deliverAll(w, seen, (cmd) => (cmd.kind === 'stop' ? 'checked' : 'delivered'))
    assert.deepEqual(commands.map((cmd) => cmd.kind).toSorted(byText), ['create', 'stop'])
    assert.equal(commands.find((cmd) => cmd.kind === 'create')?.binding.attemptId === t2.at.attemptId, false)
  })

  it('rebuilds without a withdrawn base, never reads or cites it, and publishes into the same report', async () => {
    const w = await world()
    const { t1, v1 } = await publishedWithInput(w)
    const t2 = await started(w, { question: 'Add the costs.', amendsTaskId: t1.receipt.taskId })
    const seen = new Set([t1.create.commandId, t2.create.commandId])
    await withdraw(w, v1.sourceId!)
    const [, old, rebuilt] = await tasks(w)
    assert.ok(old && rebuilt)
    assert.deepEqual([old.attempt, (rebuilt.manifest as { base?: unknown }).base], ['revoked', undefined])
    assert.equal(rebuilt.allowance, old.allowance)
    const create = (await deliverAll(w, seen, (cmd) => (cmd.kind === 'stop' ? 'checked' : 'delivered'))).find(
      (cmd) => cmd.kind === 'create',
    )
    assert.ok(create)
    const next = { attemptId: create.binding.attemptId, nativeSessionId: `sophia-${create.binding.attemptId}` }
    const cap = await citable(w, next, 'search_2')
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, {
        ...next,
        callId: 'd2',
        expectedSha256: null,
        text: `# Costs\n\nNew [${cap.sourceId}].`,
      }),
    )
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSubmit(c, w.who, {
            ...next,
            callId: 's1',
            result: resultOf(d.sha256, [cap.sourceId, v1.sourceId!], amendNotes),
          }),
        ),
      ),
      'not_found',
      'the withdrawn base is not a citation',
    )
    const v2 = await service((c) =>
      runtimeResearchSubmit(c, w.who, {
        ...next,
        callId: 's2',
        result: resultOf(d.sha256, [cap.sourceId], amendNotes),
      }),
    )
    assert.deepEqual([v2.outcome, v2.artifactId], ['published', v1.artifactId])
  })

  it('rebuilds a task without an input that drew on a withdrawn source', async () => {
    const w = await world()
    const { v1 } = await publishedWithInput(w)
    const { receipt } = await started(w, { question: 'Compare.', inputSourceIds: [v1.sourceId!], newRequest: true })
    await withdraw(w, w.inputSourceId)
    const rows = await tasks(w)
    const old = rows.find((r) => r.job === receipt.taskId)
    const rebuilt = rows.find((r) => r.rebuiltFrom === receipt.taskId)
    assert.deepEqual(
      [old?.attempt, rebuilt?.manifest.inputs, rebuilt?.manifest.withdrawnInputs],
      ['revoked', [], 1],
      'the report it was given quoted the withdrawn input',
    )
  })

  it('never reads or cites a capture once it is withdrawn', async () => {
    const w = await world()
    const { at } = await started(w)
    const cap = await citable(w, at)
    const keep = await citable(w, at, 'search_2')
    await withdraw(w, cap.sourceId)
    assert.equal(
      await codeOf(service((c) => runtimeResearchContext(c, w.who, { ...at, sourceId: cap.sourceId }))),
      'not_found',
    )
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, {
        ...at,
        callId: 'd1',
        expectedSha256: null,
        text: `# Hosts\n\n[${keep.sourceId}]`,
      }),
    )
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSubmit(c, w.who, {
            ...at,
            callId: 's1',
            result: resultOf(d.sha256, [keep.sourceId, cap.sourceId]),
          }),
        ),
      ),
      'not_found',
    )
  })

  it('orders rebuilds in one transaction by their successor, not their clock, and keeps one allowance', async () => {
    const w = await world()
    const second = await withActor(pool, E, 'write', (c) =>
      submitContribution(c, w.projectId, randomUUID(), {
        source: null,
        text: 'Host B renders with seccomp.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    const { receipt } = await started(w, { inputSourceIds: [w.inputSourceId, second.sourceId] })
    // A Forget of several notes erases them in one transaction: two rebuilds share its timestamp.
    await owner(async (c) => {
      await c.query('BEGIN')
      await c.query(`SELECT sophia.mission_erase_source($1, $2)`, [w.projectId, w.inputSourceId])
      await c.query(`SELECT sophia.mission_erase_source($1, $2)`, [w.projectId, second.sourceId])
      await c.query('COMMIT')
    })
    // Their rows share a timestamp: follow the explicit links, not the order.
    const rows = await tasks(w)
    const t = rows.find((r) => r.job === receipt.taskId)
    const r1 = rows.find((r) => r.rebuiltFrom === t?.job)
    const r2 = rows.find((r) => r.rebuiltFrom === r1?.job)
    assert.ok(t && r1 && r2 && rows.length === 3)
    assert.deepEqual(
      [t.job, t.attempt, r1.attempt, r1.rebuiltFrom, r2.state, r2.rebuiltFrom],
      [receipt.taskId, 'revoked', 'revoked', t.job, 'pending', r1.job],
    )
    assert.deepEqual([r1.manifest.withdrawnInputs, r2.manifest.withdrawnInputs, r2.manifest.inputs], [1, 2, []])
    assert.deepEqual([r1.allowance, r2.allowance], [t.allowance, t.allowance], 'one allowance throughout')
    assert.equal(await codeOf(ask(w, { amendsTaskId: r1.job })), 'stale_revision', 'the intermediate was replaced')
    assert.equal(await codeOf(ask(w, { amendsTaskId: t.job })), 'stale_revision', 'the first was replaced')
    assert.equal(await codeOf(ask(w, { amendsTaskId: r2.job })), 'invalid_state', 'the replacement is under way')
  })
})

// --- 0029: spend bounds (M03-RF-0010, M03-RF-0011) ------------------------------------------------------------

type At = Awaited<ReturnType<typeof started>>['at']
const PROVIDER = { model: 'openai-research', search: 'tavily', read: 'jina' } as const

interface Call {
  callId: string
  kind: 'model' | 'search' | 'read'
  amountUsd: number
  purpose?: 'call' | 'partial_result'
  query?: string
  targetRef?: string
}

const reserveAt = (w: World, at: At, call: Call) =>
  service((c) =>
    runtimeResearchReserve(c, w.who, {
      ...at,
      provider: PROVIDER[call.kind],
      ...(call.kind === 'search' && !call.query ? { query: 'sandboxed renderers' } : {}),
      ...call,
    }),
  )

const settleAt = (
  w: World,
  at: At,
  reservationId: string,
  outcome: 'settled' | 'released' | 'uncertain',
  costUsd?: number,
) =>
  service((c) =>
    runtimeResearchSettle(c, w.who, { ...at, reservationId, outcome, ...(costUsd === undefined ? {} : { costUsd }) }),
  )

const allowanceOf = (w: World) =>
  one<{ id: string; spent: number; reserved: number; overrun: number; reconciled: number; ref: string | null }>(
    `SELECT id, spent_usd::float8 AS spent, reserved_usd::float8 AS reserved, overrun_usd::float8 AS overrun,
      reconciled_overrun_usd::float8 AS reconciled, reconciliation_ref AS ref FROM sophia.research_allowances WHERE project_id=$1`,
    [w.projectId],
  )

/** The finalize step of the world's one research task. */
const finalizeOf = (w: World) =>
  one<{ finalizing: boolean; calls: number }>(
    `SELECT finalizing_at IS NOT NULL AS finalizing, finalize_calls AS calls FROM sophia.research_tasks WHERE project_id=$1`,
    [w.projectId],
  )

describe('research spend bounds (0029)', () => {
  it("keeps a settlement above its reservation as billed, records the overrun once and stops the allowance (Codex's reproduction)", async () => {
    const w = await world()
    const { at } = await started(w)
    const call = await reserveAt(w, at, { callId: 'm1', kind: 'model', amountUsd: 0.01 })
    const settled = await settleAt(w, at, call.reservationId, 'settled', 6)
    assert.deepEqual([settled.state, settled.settledUsd], ['settled', 6], 'the billed cost is kept, not clipped')
    const row = await one<{ settled: number; overrun: number }>(
      `SELECT settled_usd::float8 AS settled, overrun_usd::float8 AS overrun FROM sophia.research_reservations WHERE project_id=$1 AND id=$2`,
      [w.projectId, call.reservationId],
    )
    assert.deepEqual(row, { settled: 6, overrun: 5.99 })
    const replay = await settleAt(w, at, call.reservationId, 'settled', 6)
    assert.equal(replay.settledUsd, 6)
    const a = await allowanceOf(w)
    assert.deepEqual([a.spent, a.overrun, a.reconciled], [6, 5.99, 0], 'counted once')
    assert.equal(await codeOf(settleAt(w, at, call.reservationId, 'settled', 0.01)), 'invalid_state', 'never rewritten')
    for (const [id, kind, extra] of [
      ['m2', 'model', {}],
      ['p1', 'model', { purpose: 'partial_result' }],
      ['s1', 'search', {}],
    ] as const) {
      assert.equal(
        await codeOf(reserveAt(w, at, { callId: id, kind, amountUsd: 0.01, ...extra })),
        'research_limit_reached',
        `${id} refused`,
      )
    }
  })

  it('records an oversized search, read and uncertain-then-settled call the same way', async () => {
    const cases = [
      { kind: 'search' as const, reserved: 0.01, billed: 0.016 },
      { kind: 'read' as const, reserved: 0.02, billed: 0.05 },
      { kind: 'model' as const, reserved: 0.2, billed: 0.35, uncertainFirst: true },
    ]
    for (const k of cases) {
      const w = await world()
      const { at } = await started(w, { urls: ['https://example.org/given'] })
      const context = await service((c) => runtimeResearchContext(c, w.who, at))
      assert.ok('urls' in context)
      const call = await reserveAt(w, at, {
        callId: 'c1',
        kind: k.kind,
        amountUsd: k.reserved,
        ...(k.kind === 'read' ? { targetRef: context.urls[0]!.ref } : {}),
      })
      if (k.uncertainFirst) await settleAt(w, at, call.reservationId, 'uncertain')
      await settleAt(w, at, call.reservationId, 'settled', k.billed)
      const a = await allowanceOf(w)
      assert.deepEqual(
        [a.spent, Number(a.overrun.toFixed(6)), a.reserved],
        [k.billed, Number((k.billed - k.reserved).toFixed(6)), 0],
        k.kind,
      )
      assert.equal(
        await codeOf(reserveAt(w, at, { callId: 'c2', kind: 'model', amountUsd: 0.01 })),
        'research_limit_reached',
        `${k.kind}: stopped`,
      )
    }
  })

  it('leaves a settlement within its reservation alone, and resumes an overrun allowance only on the owner’s reconciliation', async () => {
    const w = await world()
    const { at } = await started(w)
    const within = await reserveAt(w, at, { callId: 'm1', kind: 'model', amountUsd: 0.3 })
    await settleAt(w, at, within.reservationId, 'settled', 0.3)
    assert.equal((await allowanceOf(w)).overrun, 0)
    const over = await reserveAt(w, at, { callId: 'm2', kind: 'model', amountUsd: 0.1 })
    await settleAt(w, at, over.reservationId, 'settled', 0.12)
    assert.equal(
      await codeOf(reserveAt(w, at, { callId: 'm3', kind: 'model', amountUsd: 0.1 })),
      'research_limit_reached',
    )
    const { id } = await allowanceOf(w)
    // Not the API's to run: reconciliation is the owner's.
    assert.equal(
      await codeOf(service((c) => c.query(`SELECT sophia.reconcile_research_overrun($1,$2,'r')`, [w.projectId, id]))),
      'forbidden',
    )
    await assert.rejects(owner((c) => c.query(`SELECT sophia.reconcile_research_overrun($1,$2,'')`, [w.projectId, id])))
    await owner((c) => c.query(`SELECT sophia.reconcile_research_overrun($1,$2,'OP-test')`, [w.projectId, id]))
    await owner((c) => c.query(`SELECT sophia.reconcile_research_overrun($1,$2,'OP-again')`, [w.projectId, id]))
    const a = await allowanceOf(w)
    assert.deepEqual(
      [a.spent, a.overrun, a.reconciled, a.ref],
      [0.42, 0.02, 0.02, 'OP-test'],
      'billed costs stay spent',
    )
    const next = await reserveAt(w, at, { callId: 'm3', kind: 'model', amountUsd: 0.1 })
    assert.equal(next.state, 'reserved', 'reserving resumes within the cap')
  })

  it('refuses a partial-result call while an ordinary call of that size still fits', async () => {
    const w = await world()
    const { at } = await started(w)
    assert.equal(
      await codeOf(reserveAt(w, at, { callId: 'p1', kind: 'model', amountUsd: 0.5, purpose: 'partial_result' })),
      'invalid_request',
    )
    assert.deepEqual(await finalizeOf(w), { finalizing: false, calls: 0 })
  })

  it('enters the finalize step once the allowance is spent: no ordinary call after it, and four partial calls in all', async () => {
    const w = await world()
    const { at } = await started(w)
    const big = await reserveAt(w, at, { callId: 'm1', kind: 'model', amountUsd: 4.5 })
    assert.equal(
      await codeOf(reserveAt(w, at, { callId: 'm2', kind: 'model', amountUsd: 0.1 })),
      'research_limit_reached',
    )
    const p1 = await reserveAt(w, at, { callId: 'p1', kind: 'model', amountUsd: 0.1, purpose: 'partial_result' })
    assert.deepEqual(await finalizeOf(w), { finalizing: true, calls: 1 })
    const again = await reserveAt(w, at, { callId: 'p1', kind: 'model', amountUsd: 0.1, purpose: 'partial_result' })
    assert.equal(again.reservationId, p1.reservationId, 'a replay is the same call')
    assert.equal((await finalizeOf(w)).calls, 1, 'and is not counted again')
    await settleAt(w, at, p1.reservationId, 'settled', 0.05)
    // Money frees up (the big call never left), but the task is finalizing: no ordinary call, search or read.
    await settleAt(w, at, big.reservationId, 'released')
    for (const [id, kind] of [
      ['m3', 'model'],
      ['s1', 'search'],
    ] as const) {
      assert.equal(
        await codeOf(reserveAt(w, at, { callId: id, kind, amountUsd: 0.01 })),
        'research_limit_reached',
        `${id} refused`,
      )
    }
    for (const id of ['p2', 'p3', 'p4']) {
      const p = await reserveAt(w, at, { callId: id, kind: 'model', amountUsd: 0.01, purpose: 'partial_result' })
      await settleAt(w, at, p.reservationId, 'settled', 0.01)
    }
    assert.equal(
      await codeOf(reserveAt(w, at, { callId: 'p5', kind: 'model', amountUsd: 0.01, purpose: 'partial_result' })),
      'research_limit_reached',
      'a fifth finalize call',
    )
    assert.deepEqual(await finalizeOf(w), { finalizing: true, calls: 4 })
  })
})

// --- 0030: render jobs and the render runner -------------------------------------------------------------------

const RUNNER_TOKEN = 'render-runner-test-token-0123456789abcdef'
const runnerHash = (token = RUNNER_TOKEN) => createHash('sha256').update(token).digest()
const HTML = '<html lang="en"><body><h1>Report</h1><img src="img/b.png"><img src="img/a.png"></body></html>'

/** The package identity as the kernel computes it (renderers/web/pdf/source-manifest.mjs). */
const manifestOf = (entry: { path: string; sha256: string }, assets: { path: string; sha256: string }[]) =>
  sha(
    [
      `entry\t${entry.path}\t${entry.sha256}\n`,
      ...assets.toSorted((a, b) => (a.path < b.path ? -1 : 1)).map((a) => `asset\t${a.path}\t${a.sha256}\n`),
    ].join(''),
  )

/** A started research task with an HTML entry and two byte-stored images, and a registered runner. */
async function renderWorld() {
  const w = await world()
  const { receipt, at, create } = await started(w)
  const taskJob = await one<{ job_id: string }>(
    `SELECT t.job_id FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
      WHERE t.project_id=$1 AND j.attempt_id=$2`,
    [w.projectId, at.attemptId],
  )
  const entry = await one<{ id: string; sha256: string }>(
    `SELECT id, sha256 FROM sophia.put_text_source($1, $2, 'text/html; charset=utf-8', $3)`,
    [w.projectId, E, HTML],
  )
  const image = async (name: string) => {
    const id = randomUUID()
    const hash = sha(name)
    await owner((c) =>
      c.query(
        `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
          VALUES($1,$2,$3,'project',$4,'image/png',$5,10,true,'ready')`,
        [w.projectId, id, E, hash, `objects/${w.projectId}/${id}`],
      ),
    )
    return { id, sha256: hash }
  }
  const a = await image('a')
  const b = await image('b')
  await owner((c) =>
    c.query(`INSERT INTO sophia.render_runners(label,token_sha256) VALUES($1,$2) ON CONFLICT (label) DO NOTHING`, [
      'test-runner',
      runnerHash(),
    ]),
  )
  const files = [
    { path: 'report.html', role: 'entry' as const, sourceId: entry.id },
    { path: 'img/b.png', role: 'asset' as const, sourceId: b.id },
    { path: 'img/a.png', role: 'asset' as const, sourceId: a.id },
  ]
  const enqueue = (pkg = files) => owner((c) => enqueueRenderJob(c, w.projectId, taskJob.job_id, 'en', pkg))
  const expected = manifestOf({ path: 'report.html', sha256: entry.sha256 }, [
    { path: 'img/a.png', sha256: a.sha256 },
    { path: 'img/b.png', sha256: b.sha256 },
  ])
  /** Settle a Hold the way the runtime would (the create was answered by `started`). */
  const settleHold = () => deliverAll(w, new Set([create.commandId]), () => 'checked')
  return { w, receipt, at, taskJobId: taskJob.job_id, entry, a, b, files, enqueue, expected, settleHold }
}

/** Drain every other test's pending renders, so a claim here takes this test's job. */
async function claimMine(jobId: string): Promise<RenderJob> {
  for (let i = 0; i < 50; i += 1) {
    const job = await service((c) => rendererClaim(c, runnerHash()))
    assert.ok(job, 'a render to claim')
    if (job.jobId === jobId) return job
  }
  throw new Error('the render was never claimed')
}

const renderState = (w: World, jobId: string) =>
  one<{ state: string; reason: string | null; claims: number; result_source_id: string | null }>(
    `SELECT j.state, j.reason, r.claims, j.result_source_id FROM sophia.jobs j
      JOIN sophia.render_jobs r ON r.project_id=j.project_id AND r.job_id=j.id WHERE j.project_id=$1 AND j.id=$2`,
    [w.projectId, jobId],
  )

const receiptFor = (
  manifestSha256: string,
  outputSha: string | null,
  status: RenderReceipt['status'] = 'succeeded',
): RenderReceipt => ({
  schema: 'sophia.pdf-render-receipt.v1',
  jobId: null,
  status,
  error: status === 'succeeded' ? null : { code: 'render_error', message: 'x' },
  renderer: {
    kernel: 'renderers/web/pdf/render-html.mjs',
    rendererSha256: 'f'.repeat(64),
    donor: { repository: 'r', commit: 'd'.repeat(40), path: 'p', blob: 'b'.repeat(40) },
    playwrightCore: '1.56.1',
    browser: 'HeadlessChrome/141.0.7390.37',
  },
  source: { manifestSha256, entry: { path: 'report.html', sha256: 'e'.repeat(64) }, assets: [] },
  language: 'en',
  sandbox: null,
  output: outputSha
    ? { path: 'report.pdf', sha256: outputSha, bytes: 100, header: '%PDF-1.4', eof: true, pageCount: 1, pdfImages: 2 }
    : null,
  measurements: null,
  undeclaredAssets: [],
  blockedRequests: [],
  checks: [],
  warnings: [],
  elapsedMs: 300,
})

describe('render jobs (0030)', () => {
  it("queues a render of a task's package and leases it to a registered runner, files in package order", async () => {
    const r = await renderWorld()
    const queued = await r.enqueue()
    assert.equal(queued.manifestSha256, r.expected, "the kernel's package identity")
    assert.equal(await codeOf(service((c) => rendererClaim(c, runnerHash('unknown')))), 'runtime_capability_required')
    const job = await claimMine(queued.jobId)
    assert.deepEqual(
      job.files.map((f) => [f.path, f.role]),
      [
        ['report.html', 'entry'],
        ['img/a.png', 'asset'],
        ['img/b.png', 'asset'],
      ],
    )
    assert.deepEqual(
      [job.format, job.language, job.sourceManifestHash, job.timeoutMs],
      ['pdf', 'en', r.expected, 120000],
    )
    assert.equal(job.files[0]?.sha256, r.entry.sha256)
    assert.deepEqual(await renderState(r.w, queued.jobId), {
      state: 'running',
      reason: null,
      claims: 1,
      result_source_id: null,
    })
  })

  it('serves its files under the lease and records the output once, derived from the package', async () => {
    const r = await renderWorld()
    const queued = await r.enqueue()
    const job = await claimMine(queued.jobId)
    const lease = job.leaseToken
    const entry = await service((c) => rendererFile(c, runnerHash(), job.jobId, lease, 'report.html'))
    assert.deepEqual([entry.text, entry.sha256], [HTML, r.entry.sha256])
    const asset = await service((c) => rendererFile(c, runnerHash(), job.jobId, lease, 'img/a.png'))
    assert.deepEqual([asset.text, asset.storageKey], [null, `objects/${r.w.projectId}/${r.a.id}`])
    assert.equal(
      await codeOf(service((c) => rendererFile(c, runnerHash(), job.jobId, lease, 'img/c.png'))),
      'not_found',
    )
    assert.equal(
      await codeOf(service((c) => rendererFile(c, runnerHash(), job.jobId, randomUUID(), 'report.html'))),
      'invalid_state',
    )
    const slot = await service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, lease))
    assert.equal(slot.projectId, r.w.projectId)
    const out = await service((c) =>
      rendererRecordOutput(c, runnerHash(), job.jobId, lease, {
        sourceId: slot.sourceId,
        sha256: sha('pdf'),
        byteLength: 3,
      }),
    )
    assert.equal(out.sourceId, slot.sourceId)
    const source = await one<{ mime: string; state: string; eligible: boolean; storage_key: string; deps: string }>(
      `SELECT s.mime, s.state, s.eligible, s.storage_key,
        (SELECT count(*) FROM sophia.source_dependencies d WHERE d.project_id=s.project_id AND d.derived_source_id=s.id) AS deps
        FROM sophia.source_objects s WHERE s.project_id=$1 AND s.id=$2`,
      [r.w.projectId, slot.sourceId],
    )
    assert.deepEqual(source, {
      mime: 'application/pdf',
      state: 'ready',
      eligible: true,
      storage_key: `objects/${r.w.projectId}/${slot.sourceId}`,
      deps: '3',
    })
    assert.equal(
      await codeOf(service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, lease))),
      'invalid_state',
      'once',
    )
  })

  it('settles a succeeded render only for its package and its output; a replay returns the same', async () => {
    const r = await renderWorld()
    const queued = await r.enqueue()
    const job = await claimMine(queued.jobId)
    const slot = await service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, job.leaseToken))
    await service((c) =>
      rendererRecordOutput(c, runnerHash(), job.jobId, job.leaseToken, {
        sourceId: slot.sourceId,
        sha256: sha('pdf'),
        byteLength: 3,
      }),
    )
    const settle = (receipt: RenderReceipt) =>
      service((c) => rendererSettle(c, runnerHash(), job.jobId, job.leaseToken, receipt))
    assert.equal(await codeOf(settle(receiptFor(sha('other package'), sha('pdf')))), 'invalid_request')
    assert.equal(await codeOf(settle(receiptFor(r.expected, sha('other bytes')))), 'invalid_request')
    const good = receiptFor(r.expected, sha('pdf'))
    assert.deepEqual(await settle(good), { state: 'succeeded', reason: null })
    assert.deepEqual(await settle(good), { state: 'succeeded', reason: null }, 'a replay')
    assert.equal(await codeOf(settle(receiptFor(r.expected, sha('pdf'), 'failed'))), 'invalid_state')
    assert.equal((await renderState(r.w, queued.jobId)).result_source_id, slot.sourceId)
  })

  it('sends a render back to the queue at a Hold, claims it again after Resume, and cancels it at a Stop', async () => {
    const r = await renderWorld()
    const queued = await r.enqueue()
    const first = await claimMine(queued.jobId)
    const beat = (lease: string) => service((c) => rendererHeartbeat(c, runnerHash(), first.jobId, lease))
    assert.equal((await beat(first.leaseToken)).state, 'continue')
    await control(r.w, 'hold', r.receipt.goalId)
    assert.deepEqual(await beat(first.leaseToken), { state: 'cancel' })
    assert.deepEqual(await renderState(r.w, queued.jobId), {
      state: 'pending',
      reason: null,
      claims: 0,
      result_source_id: null,
    })
    assert.equal(await codeOf(beat(first.leaseToken)), 'invalid_state', 'the old lease is gone')
    const held = await service((c) => rendererClaim(c, runnerHash()))
    assert.notEqual(held?.jobId, queued.jobId, 'not claimed while held')
    await r.settleHold()
    await control(r.w, 'resume', r.receipt.goalId)
    const second = await claimMine(queued.jobId)
    assert.notEqual(second.leaseToken, first.leaseToken)
    await control(r.w, 'stop', r.receipt.goalId)
    assert.deepEqual(await service((c) => rendererHeartbeat(c, runnerHash(), second.jobId, second.leaseToken)), {
      state: 'cancel',
    })
    assert.deepEqual(await renderState(r.w, queued.jobId), {
      state: 'cancelled',
      reason: 'stopped: the work was stopped',
      claims: 1,
      result_source_id: null,
    })
  })

  it('never makes a render that ends after a Stop the result, and queues one that ends under a Hold again', async () => {
    const r = await renderWorld()
    const queued = await r.enqueue()
    const job = await claimMine(queued.jobId)
    const slot = await service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, job.leaseToken))
    await service((c) =>
      rendererRecordOutput(c, runnerHash(), job.jobId, job.leaseToken, {
        sourceId: slot.sourceId,
        sha256: sha('pdf'),
        byteLength: 3,
      }),
    )
    await control(r.w, 'hold', r.receipt.goalId)
    const held = await service((c) =>
      rendererSettle(c, runnerHash(), job.jobId, job.leaseToken, receiptFor(r.expected, sha('pdf'))),
    )
    assert.deepEqual(held, { state: 'pending', reason: 'held: queued again for after Resume' })
    await r.settleHold()
    await control(r.w, 'resume', r.receipt.goalId)
    const again = await claimMine(queued.jobId)
    const slot2 = await service((c) => rendererOutputSlot(c, runnerHash(), again.jobId, again.leaseToken))
    await service((c) =>
      rendererRecordOutput(c, runnerHash(), again.jobId, again.leaseToken, {
        sourceId: slot2.sourceId,
        sha256: sha('pdf2'),
        byteLength: 4,
      }),
    )
    await control(r.w, 'stop', r.receipt.goalId)
    const stale = await service((c) =>
      rendererSettle(c, runnerHash(), again.jobId, again.leaseToken, receiptFor(r.expected, sha('pdf2'))),
    )
    assert.deepEqual(stale, { state: 'cancelled', reason: 'stale: the work was stopped or ended while it rendered' })
    assert.equal((await renderState(r.w, queued.jobId)).result_source_id, null)
  })

  it('claims a render whose lease ran out again, three times at most, then fails it as renderer_lost', async () => {
    const r = await renderWorld()
    const queued = await r.enqueue()
    const expire = () =>
      owner((c) =>
        c.query(`UPDATE sophia.jobs SET lease_until=now()-interval '1 second' WHERE project_id=$1 AND id=$2`, [
          r.w.projectId,
          queued.jobId,
        ]),
      )
    let job = await claimMine(queued.jobId)
    for (const claims of [2, 3]) {
      await expire()
      const next = await claimMine(queued.jobId)
      assert.notEqual(next.leaseToken, job.leaseToken)
      assert.equal((await renderState(r.w, queued.jobId)).claims, claims)
      job = next
    }
    await expire()
    await service((c) => rendererClaim(c, runnerHash()))
    assert.deepEqual(await renderState(r.w, queued.jobId), {
      state: 'failed',
      reason: 'renderer_lost: the render runner stopped answering',
      claims: 3,
      result_source_id: null,
    })
  })

  it('refuses a revoked runner, a fourth render of one task and a malformed package; members read renders, outsiders nothing', async () => {
    const r = await renderWorld()
    for (const bad of [
      [...r.files, { path: 'second.html', role: 'entry' as const, sourceId: r.entry.id }],
      [{ ...r.files[0]!, path: '../report.html' }],
      [{ ...r.files[0]!, path: '/report.html' }],
      [r.files[0]!, { ...r.files[1]!, path: 'img/b.svg' }],
      [r.files[0]!, { ...r.files[1]!, sourceId: randomUUID() }],
      [r.files[0]!, { ...r.files[1]!, path: 'report.html' }],
    ]) {
      assert.match(await codeOf(r.enqueue(bad)), /^raw:error: A render package/, JSON.stringify(bad))
    }
    for (let i = 0; i < 3; i += 1) await r.enqueue()
    assert.match(await codeOf(r.enqueue()), /Research render limit reached/)
    const count = (actor: string) =>
      withActor(pool, actor, 'read', async (c) =>
        Number(
          (
            await c.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.render_jobs WHERE project_id=$1`, [
              r.w.projectId,
            ])
          ).rows[0]?.n,
        ),
      )
    assert.deepEqual([await count(V), await count(C)], [3, 0])
    await owner((c) => c.query(`SELECT sophia.revoke_render_runner('test-runner')`))
    try {
      assert.equal(await codeOf(service((c) => rendererClaim(c, runnerHash()))), 'runtime_capability_required')
    } finally {
      await owner((c) =>
        c.query(`UPDATE sophia.render_runners SET state='active', revoked_at=NULL WHERE label='test-runner'`),
      )
    }
  })
})

// --- the research PDF (0031) ----------------------------------------------------------------------------------

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
const reportOf = (cite: string, extra = '') =>
  `# Sandboxes for PDF rendering\n\n## Summary\n\n${words(60)} [${cite}]\n\n## Hosts\n\n${words(60)}\n\n## Conclusion\n\n${words(30)}${extra}\n`

/** A started PDF task with a cited source and a full draft, a registered runner, and the kernel's side of a render. */
async function pdfWorld(as = { role: PDF.id, route: PDF.route }) {
  const w = await world()
  const { at, create } = await started(w, { outputs: ['markdown', 'pdf'] }, as)
  await owner((c) =>
    c.query(`INSERT INTO sophia.render_runners(label,token_sha256) VALUES($1,$2) ON CONFLICT (label) DO NOTHING`, [
      'test-runner',
      runnerHash(),
    ]),
  )
  const cited = await citable(w, at)
  let last: string | null = null
  const draft = async (text: string) => {
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: randomUUID(), expectedSha256: last, text }),
    )
    last = d.sha256
    return d
  }
  const d = await draft(reportOf(cited.sourceId))
  const render = (draftSha256: string, callId: string = randomUUID()) =>
    service((c) => runtimeResearchRender(c, w.who, { ...at, callId, draftSha256 }))
  /** Claim the render and end it as the kernel would: a PDF and its receipt (with these checks), or a failure. */
  const settle = async (
    jobId: string,
    status: 'succeeded' | 'failed' = 'succeeded',
    checks: RenderReceipt['checks'] = [{ name: 'blank_pages', outcome: 'unknown', detail: null }],
  ) => {
    const job = await claimMine(jobId)
    const outSha = status === 'succeeded' ? sha(`pdf ${jobId}`) : null
    if (outSha) {
      const slot = await service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, job.leaseToken))
      await service((c) =>
        rendererRecordOutput(c, runnerHash(), job.jobId, job.leaseToken, {
          sourceId: slot.sourceId,
          sha256: outSha,
          byteLength: 3,
        }),
      )
    }
    const receipt = { ...receiptFor(job.sourceManifestHash, outSha, status), checks }
    return service((c) => rendererSettle(c, runnerHash(), job.jobId, job.leaseToken, receipt))
  }
  const submit = (draftSha256: string, callId: string = randomUUID()) =>
    service((c) => runtimeResearchSubmit(c, w.who, { ...at, callId, result: resultOf(draftSha256, [cited.sourceId]) }))
  const renders = () =>
    owner(
      async (c) =>
        (
          await c.query<{ job_id: string; repair: string; layout: string; state: string }>(
            `SELECT r.job_id, r.repair, r.layout, j.state FROM sophia.render_jobs r JOIN sophia.jobs j ON j.project_id=r.project_id AND j.id=r.job_id
              JOIN sophia.jobs p ON p.project_id=r.project_id AND p.id=r.parent_job_id WHERE p.attempt_id=$1 ORDER BY r.created_at`,
            [at.attemptId],
          )
        ).rows,
    )
  return { w, at, create, cited, d, draft, render, settle, submit, renders }
}

const entryOf = (jobId: string) =>
  one<{ body: string; mime: string; deps: string[] }>(
    `SELECT t.body, s.mime, (SELECT array_agg(d.source_id::text ORDER BY d.source_id) FROM sophia.source_dependencies d
       WHERE d.project_id=s.project_id AND d.derived_source_id=s.id) AS deps
      FROM sophia.render_job_files f JOIN sophia.source_objects s ON s.project_id=f.project_id AND s.id=f.source_id
      JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id WHERE f.job_id=$1 AND f.role='entry'`,
    [jobId],
  )

/** A kernel check that passed. */
const passed = (name: string) => ({ name, outcome: 'passed' as const, detail: null })

describe('the research PDF (0031)', () => {
  it('prints the current draft with the report template and queues that HTML as the package, once per call', async () => {
    const p = await pdfWorld()
    const queued = await p.render(p.d.sha256, 'render_1')
    assert.deepEqual(
      [queued.state, queued.repair, queued.layout, queued.draftSha256],
      ['queued', 'none', 'standard', p.d.sha256],
    )
    assert.deepEqual(
      queued.report?.sections.map((s) => [s.id, s.role]),
      [
        ['summary', 'summary'],
        ['hosts', 'body'],
        ['conclusion', 'conclusion'],
      ],
    )
    assert.deepEqual(await p.render(p.d.sha256, 'render_1'), queued, 'a replay returns the same render')
    const entry = await entryOf(queued.renderJobId!)
    assert.equal(entry.mime, 'text/html; charset=utf-8')
    assert.match(entry.body, /<h1>Sandboxes for PDF rendering<\/h1>/)
    assert.match(entry.body, /<section id="hosts" data-report-role="body">/)
    assert.match(entry.body, /<li id="cite-1">/, 'the cited source is listed')
    assert.doesNotMatch(entry.body, new RegExp(p.cited.sourceId), 'by its title and URL, not its id')
    assert.deepEqual(entry.deps, [p.d.sourceId, p.cited.sourceId].toSorted(), 'derived from the draft and the source')
  })

  it('answers a report that fails its checks with them, and queues nothing', async () => {
    const p = await pdfWorld()
    const thin = await p.draft('# Notes\n\nToo short to be a report.')
    const rejected = await p.render(thin.sha256)
    assert.equal(rejected.state, 'rejected')
    assert.deepEqual(
      rejected.reportChecks?.filter((c) => c.outcome === 'failed').map((c) => c.name),
      ['report_sections', 'report_words'],
    )
    assert.equal(rejected.renderJobId, undefined)
    assert.deepEqual(await p.renders(), [])
  })

  it("refuses a render that is not this task's to make now", async () => {
    const md = await pdfWorld(specialist)
    await owner((c) =>
      c.query(
        `UPDATE sophia.source_texts SET body=jsonb_set(body::jsonb,'{outputs}','["markdown"]')::text
          WHERE source_id=(SELECT j.input_source_id FROM sophia.jobs j WHERE j.attempt_id=$1)`,
        [md.at.attemptId],
      ),
    )
    assert.equal(await codeOf(md.render(md.d.sha256)), 'invalid_request', 'a task admitted without a PDF')
    const p = await pdfWorld()
    assert.equal(await codeOf(p.render('a'.repeat(64))), 'stale_revision', 'not the current draft')
    const queued = await p.render(p.d.sha256)
    assert.equal(await codeOf(p.render(p.d.sha256)), 'invalid_state', 'one render at a time')
    await p.settle(queued.renderJobId!)
    assert.equal(await codeOf(p.render(p.d.sha256)), 'invalid_request', 'a draft that already has its PDF')
    const f = await pdfWorld()
    await owner((c) =>
      c.query(
        `UPDATE sophia.research_tasks t SET finalizing_at=now(), finalize_calls=1 FROM sophia.jobs j
          WHERE j.project_id=t.project_id AND j.id=t.job_id AND j.attempt_id=$1`,
        [f.at.attemptId],
      ),
    )
    assert.equal(await codeOf(f.render(f.d.sha256)), 'research_limit_reached', 'finalizing: no render')
  })

  it('allows one format repair and one revision, then refuses', async () => {
    const p = await pdfWorld()
    const first = await p.render(p.d.sha256)
    await p.settle(first.renderJobId!, 'failed')
    const format = await p.render(p.d.sha256)
    assert.deepEqual([format.repair, format.layout], ['format', 'compact'], 'the same draft again, compact')
    assert.match((await entryOf(format.renderJobId!)).body, /<body class="compact">/)
    await p.settle(format.renderJobId!, 'failed')
    const d2 = await p.draft(reportOf(p.cited.sourceId, ' Revised.'))
    const revision = await p.render(d2.sha256)
    assert.deepEqual([revision.repair, revision.layout], ['semantic', 'compact'], 'a revision keeps the layout')
    await p.settle(revision.renderJobId!, 'failed')
    const d3 = await p.draft(reportOf(p.cited.sourceId, ' Again.'))
    assert.equal(await codeOf(p.render(d3.sha256)), 'research_limit_reached')
    assert.deepEqual(
      (await p.renders()).map((r) => [r.repair, r.state]),
      [
        ['none', 'failed'],
        ['format', 'failed'],
        ['semantic', 'failed'],
      ],
    )

    // A second revision is refused on its own rule, before the three-render cap.
    const q = await pdfWorld()
    await q.settle((await q.render(q.d.sha256)).renderJobId!, 'failed')
    const r2 = await q.draft(reportOf(q.cited.sourceId, ' Revised.'))
    await q.settle((await q.render(r2.sha256)).renderJobId!, 'failed')
    const r3 = await q.draft(reportOf(q.cited.sourceId, ' Revised again.'))
    assert.equal(await codeOf(q.render(r3.sha256)), 'research_limit_reached', 'one revision')
    assert.equal((await q.renders()).length, 2)
  })

  it('waits for a render in flight, then publishes its PDF as the rendition of exactly that draft', async () => {
    const p = await pdfWorld()
    const queued = await p.render(p.d.sha256)
    assert.equal(await codeOf(p.submit(p.d.sha256)), 'invalid_state', 'a render still running')
    await p.settle(queued.renderJobId!)
    const done = await p.submit(p.d.sha256, 'submit_1')
    assert.equal(done.outcome, 'published')
    assert.equal(await codeOf(p.render(p.d.sha256)), 'invalid_state', 'the task has ended: no more renders')
    const rendition = await one<{ source_id: string; page_count: number; job_id: string; limitations: string[] }>(
      `SELECT source_id, page_count, job_id, limitations FROM sophia.artifact_renditions WHERE artifact_version_id=$1 AND format='pdf'`,
      [done.versionId],
    )
    assert.deepEqual(done.pdf, { state: 'produced', sourceId: rendition.source_id, renderJobId: queued.renderJobId })
    assert.deepEqual(
      [rendition.page_count, rendition.job_id, rendition.limitations],
      [1, queued.renderJobId, ['The PDF check blank_pages could not be confirmed']],
    )
    assert.deepEqual(await p.submit(p.d.sha256, 'submit_1'), done, 'a replay returns the same, PDF included')
    const [version] = await withActor(pool, E, 'read', (c) => readArtifactVersions(c, done.artifactId!))
    assert.deepEqual(
      version?.renditions?.map((r) => r.format),
      ['pdf'],
    )
  })

  it('never lets a silent renderer cost the report: past ten minutes, or finalizing, the render is given up', async () => {
    const p = await pdfWorld()
    const queued = await p.render(p.d.sha256)
    await owner((c) =>
      c.query(`UPDATE sophia.render_jobs SET created_at=now()-interval '11 minutes' WHERE job_id=$1`, [
        queued.renderJobId,
      ]),
    )
    const done = await p.submit(p.d.sha256)
    assert.deepEqual(done.pdf, {
      state: 'not_produced',
      reason: 'The PDF could not be produced (cancelled: the report was submitted while the PDF was still rendering)',
    })
    assert.equal((await renderState(p.w, queued.renderJobId!)).state, 'cancelled')
    const f = await pdfWorld()
    const running = await f.render(f.d.sha256)
    await owner((c) =>
      c.query(
        `UPDATE sophia.research_tasks t SET finalizing_at=now(), finalize_calls=1 FROM sophia.jobs j
          WHERE j.project_id=t.project_id AND j.id=t.job_id AND j.attempt_id=$1`,
        [f.at.attemptId],
      ),
    )
    assert.equal((await f.submit(f.d.sha256)).outcome, 'published', 'the finalize step does not wait')
    assert.equal((await renderState(f.w, running.renderJobId!)).state, 'cancelled')
  })

  it('publishes the Markdown alone when no render of this version succeeded, and says why', async () => {
    const earlier = await pdfWorld()
    await earlier.settle((await earlier.render(earlier.d.sha256)).renderJobId!)
    const d2 = await earlier.draft(reportOf(earlier.cited.sourceId, ' Changed after the PDF.'))
    const a = await earlier.submit(d2.sha256)
    assert.deepEqual(a.pdf, {
      state: 'not_produced',
      reason: 'The PDF was rendered from an earlier draft, not from this version',
    })
    const failed = await pdfWorld()
    await failed.settle((await failed.render(failed.d.sha256)).renderJobId!, 'failed')
    assert.deepEqual((await failed.submit(failed.d.sha256)).pdf, {
      state: 'not_produced',
      reason: 'The PDF could not be produced (failed: render_error)',
    })
    const none = await pdfWorld()
    const b = await none.submit(none.d.sha256)
    assert.deepEqual(b.pdf, { state: 'not_produced', reason: 'The PDF was not rendered' })
    assert.equal(
      (
        await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.artifact_renditions WHERE artifact_version_id=$1`, [
          b.versionId,
        ])
      ).n,
      '0',
    )
    const state = await one<{ pdf_state: string; pdf_reason: string }>(
      `SELECT t.pdf_state, t.pdf_reason FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
        WHERE j.attempt_id=$1`,
      [none.at.attemptId],
    )
    assert.deepEqual(state, { pdf_state: 'not_produced', pdf_reason: 'The PDF was not rendered' })
    const read = await withActor(pool, E, 'read', (c) => readNativeTask(c, none.w.projectId, b.taskId))
    assert.equal(read.research?.pdfReason, 'The PDF was not rendered', 'the work card reads the reason')
    const w = await world()
    const md = await started(w)
    const c = await citable(w, md.at)
    const d = await service((cl) =>
      runtimeResearchDraft(cl, w.who, { ...md.at, callId: 'd', expectedSha256: null, text: reportOf(c.sourceId) }),
    )
    const plain = await service((cl) =>
      runtimeResearchSubmit(cl, w.who, { ...md.at, callId: 's', result: resultOf(d.sha256, [c.sourceId]) }),
    )
    assert.equal(plain.pdf, undefined, 'a Markdown task has no PDF to speak of')
  })

  it('fails a PDF that fails a check, so the format repair follows; a nearly empty page is a limitation (0034)', async () => {
    const p = await pdfWorld()
    const first = await p.render(p.d.sha256)
    const overflow = { name: 'layout_overflow', outcome: 'failed' as const, detail: '412px past the printable width' }
    assert.deepEqual(await p.settle(first.renderJobId!, 'succeeded', [overflow, passed('blank_pages')]), {
      state: 'failed',
      reason: 'failed: layout_overflow',
    })
    assert.equal((await renderState(p.w, first.renderJobId!)).result_source_id, null, 'never a result')
    const format = await p.render(p.d.sha256)
    assert.deepEqual([format.repair, format.layout], ['format', 'compact'], 'the format repair follows')
    const short = { name: 'short_pages', outcome: 'failed' as const, detail: 'page 3' }
    assert.equal((await p.settle(format.renderJobId!, 'succeeded', [passed('blank_pages'), short])).state, 'succeeded')
    const done = await p.submit(p.d.sha256)
    assert.equal(done.pdf?.state, 'produced')
    const rendition = await one<{ limitations: string[] }>(
      `SELECT limitations FROM sophia.artifact_renditions WHERE artifact_version_id=$1 AND format='pdf'`,
      [done.versionId],
    )
    assert.deepEqual(rendition.limitations, ['Some pages of the PDF are nearly empty (page 3)'])

    const b = await pdfWorld()
    const blank = { name: 'blank_pages', outcome: 'failed' as const, detail: 'page 2' }
    const r = await b.render(b.d.sha256)
    assert.deepEqual(await b.settle(r.renderJobId!, 'succeeded', [blank, short]), {
      state: 'failed',
      reason: 'failed: blank_pages',
    })
    assert.deepEqual((await b.submit(b.d.sha256)).pdf, {
      state: 'not_produced',
      reason: 'The PDF could not be produced (failed: blank_pages)',
    })
  })

  it("reads a render back: its state, then the kernel's checks and its render-result.v1 record", async () => {
    const p = await pdfWorld()
    const queued = await p.render(p.d.sha256)
    const read = (renderJobId?: string) =>
      service((c) => runtimeResearchRenderResult(c, p.w.who, { ...p.at, ...(renderJobId ? { renderJobId } : {}) }))
    assert.equal((await read()).state, 'queued', 'the latest render')
    await p.settle(queued.renderJobId!)
    const done = await read(queued.renderJobId)
    assert.equal(done.state, 'succeeded')
    assert.deepEqual([done.pdf?.bytes, done.pdf?.pages], [3, 1])
    assert.deepEqual(done.checks, [{ name: 'blank_pages', outcome: 'unknown', detail: null }])
    assert.deepEqual(done.result, {
      schema: 'sophia.render-result.v1',
      jobId: queued.renderJobId,
      sourceVersionId: p.d.sourceId,
      sourceManifestHash: queued.manifestSha256,
      status: 'succeeded',
      rendererUnitId: 'test-runner',
      outputs: [{ sourceId: done.pdf?.sourceId, sha256: done.pdf?.sha256, bytes: 3 }],
      previewSourceIds: [],
      checks: [
        { name: 'blank_pages', outcome: 'unknown', evidenceRef: `render-job:${queued.renderJobId}#checks/blank_pages` },
      ],
      warnings: [],
      exportEditability: 'source_editable',
    })
    const other = await pdfWorld()
    const theirs = await other.render(other.d.sha256)
    assert.equal(await codeOf(read(theirs.renderJobId)), 'not_found', "another task's render")
  })
})

// --- Try PDF again (0032) ---------------------------------------------------------------------------------------

/** A PDF task published without its PDF (no render), and an editor's "Try PDF again" on it; `text` is its report. */
async function partialWorld(text?: (p: Awaited<ReturnType<typeof pdfWorld>>) => Promise<string>) {
  const p = await pdfWorld()
  const done = await p.submit(text ? (await p.draft(await text(p))).sha256 : p.d.sha256)
  assert.equal(done.pdf?.state, 'not_produced')
  // The runner asks for work: a render runner is live.
  await owner((c) => c.query(`UPDATE sophia.render_runners SET seen_at=now() WHERE label='test-runner'`))
  const taskId = done.taskId
  const { goal_id: goalId } = await one<{ goal_id: string }>(`SELECT goal_id FROM sophia.work_attempts WHERE id=$1`, [
    p.at.attemptId,
  ])
  const again = (key: string, actor = E) =>
    withActor(pool, actor, 'write', (c) => requestResearchRendition(c, p.w.projectId, taskId, key))
  const goal = async () => (await goalOf(p.w, goalId)).status
  const task = () =>
    one<{ pdf_state: string; pdf_reason: string | null }>(
      `SELECT pdf_state, pdf_reason FROM sophia.research_tasks WHERE job_id=$1`,
      [taskId],
    )
  const read = () => withActor(pool, E, 'read', (c) => readNativeTask(c, p.w.projectId, taskId))
  return { ...p, done, taskId, goalId, again, goal, task, read }
}

/** The version number and format a source's download is named with, as an editor reads it. */
async function downloadName(sourceId: string): Promise<[number | null, string]> {
  const source = await withActor(pool, E, 'read', (c) => readReportSource(c, sourceId))
  return [source.versionNumber, source.format]
}

/** The PDF a task's result delivers. */
const pdfSourceOf = (reading: Awaited<ReturnType<typeof readNativeTask>>): string =>
  reading.result?.outputs?.find((o) => o.format === 'pdf')?.sourceId ?? ''

const versionsOf = (artifactId: string) =>
  owner(
    async (c) =>
      (
        await c.query<{
          id: string
          version_number: number
          state: string
          source_id: string
          change_note: string | null
          retained_note: string | null
          change_facts: Record<string, unknown>
          trigger: Record<string, unknown>
          limitations: string[]
        }>(
          `SELECT id, version_number, state, source_id, change_note, retained_note, change_facts, trigger, limitations
             FROM sophia.artifact_versions WHERE artifact_id=$1 ORDER BY version_number`,
          [artifactId],
        )
      ).rows,
  )

describe('Try PDF again (0032)', () => {
  it('prints the published version with the report template and queues it as a rendition, reopening the goal', async () => {
    const p = await partialWorld()
    const queued = await p.again('try-1')
    assert.deepEqual(
      [queued.state, queued.repair, queued.layout, queued.draftSha256],
      ['queued', 'none', 'standard', undefined],
    )
    assert.deepEqual(await p.again('try-1'), queued, 'a replay returns the same rendition')
    const entry = await entryOf(queued.renderJobId!)
    assert.match(entry.body, /<h1>Sandboxes for PDF rendering<\/h1>/)
    assert.match(entry.body, /<li id="cite-1">/)
    const [v1] = await versionsOf(p.done.artifactId!)
    assert.deepEqual(
      entry.deps,
      [v1!.source_id, p.cited.sourceId].toSorted(),
      'derived from the version and its source',
    )
    const kind = await one<{ kind: string; base_version_id: string; requested_by: string; reopened_goal: boolean }>(
      `SELECT kind, base_version_id, requested_by, reopened_goal FROM sophia.render_jobs WHERE job_id=$1`,
      [queued.renderJobId],
    )
    assert.deepEqual(kind, {
      kind: 'rendition',
      base_version_id: p.done.versionId,
      requested_by: E,
      reopened_goal: true,
    })
    assert.equal(await p.goal(), 'running', 'the goal reopens while it renders')
    const reading = await p.read()
    assert.deepEqual([reading.task.phase, reading.research?.pdfRendering], ['result_ready', true])
    assert.equal(await codeOf(p.again('try-2')), 'invalid_state', 'one rendition at a time')
  })

  it('CX-0019 · reads the version as Studio does: a link outside its sources prints as its label, never refusing it', async () => {
    const stray = randomUUID()
    const p = await partialWorld(async ({ at, cited }) => {
      const { question } = await one<{ question: string }>(
        `SELECT t.question_source_id AS question FROM sophia.research_tasks t
           JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id WHERE j.attempt_id=$1`,
        [at.attemptId],
      )
      // The pilot's shape: links to sources the version does not list (a stray here) and to the user's URL ref.
      return reportOf(
        cited.sourceId,
        ` A link [2](<${stray}>), the ask [3](input:${question}#1), ours [4](${cited.sourceId}).`,
      )
    })
    const queued = await p.again('try-links')
    assert.equal(queued.state, 'queued')
    const { body } = await entryOf(queued.renderJobId!)
    assert.match(body, /A link 2, the ask 3, ours <sup class="cite"><a href="#cite-1">\[1\]<\/a><\/sup>\./)
    assert.match(body, /<li id="cite-1">/)
    assert.doesNotMatch(body, /id="cite-2"/, 'it numbers only the version’s own sources')
  })

  it('publishes a rendition-only version with the PDF, and completes the goal again', async () => {
    const p = await partialWorld()
    // A limitation the report gave about its missing PDF (as a model might write it), which the PDF now answers.
    await owner((c) =>
      c.query(
        `UPDATE sophia.artifact_versions SET limitations=limitations||'{"No PDF: the render failed."}' WHERE id=$1`,
        [p.done.versionId],
      ),
    )
    const queued = await p.again('try-1')
    await p.settle(queued.renderJobId!)
    assert.equal(await p.goal(), 'completed')
    assert.deepEqual(await p.task(), { pdf_state: 'produced', pdf_reason: null })
    const [v1, v2, ...more] = await versionsOf(p.done.artifactId!)
    assert.ok(v1 && v2 && more.length === 0, 'two versions')
    assert.deepEqual([v1.state, v2.state, v2.version_number], ['superseded', 'stable', 2])
    assert.equal(v2.source_id, v1.source_id, 'the same text')
    assert.deepEqual(
      [v2.change_note, v2.retained_note],
      ['Adds the PDF that could not be produced in v1', 'Everything in v1 is kept'],
    )
    const { renditionOnly, notesFromFacts, previousVersionId } = v2.change_facts
    assert.deepEqual([renditionOnly, notesFromFacts, previousVersionId], [true, true, v1.id])
    assert.deepEqual(v2.trigger, { kind: 'rendition', taskId: p.taskId, renderJobId: queued.renderJobId })
    assert.deepEqual(
      [v1.limitations, v2.limitations],
      [['One vendor page could not be read.', 'No PDF: the render failed.'], ['One vendor page could not be read.']],
      'the limitations of v1 less the one about the PDF',
    )
    const reading = await p.read()
    assert.deepEqual(
      reading.result?.outputs?.map((o) => [o.artifactVersionId, o.format]),
      [
        [v2.id, 'markdown'],
        [v2.id, 'pdf'],
      ],
      'the card reads the new version, PDF included',
    )
    assert.equal(reading.research?.pdfRendering, undefined)
    // The text both versions hold downloads under the name the card and the viewer show: v2.
    assert.deepEqual(await downloadName(v2.source_id), [2, 'markdown'])
    assert.deepEqual(await downloadName(pdfSourceOf(reading)), [2, 'pdf'])
    const history = await withActor(pool, E, 'read', (c) => readArtifactVersions(c, p.done.artifactId!))
    assert.deepEqual(parseArtifactVersionList(history), history, 'a client reads the history as the contract has it')
    const [read2] = history
    assert.deepEqual(
      [
        read2?.versionNumber,
        read2?.trigger,
        read2?.changeFacts?.renditionOnly,
        read2?.renditions?.map((r) => r.format),
      ],
      [2, { kind: 'rendition', taskId: p.taskId, renderJobId: queued.renderJobId }, true, ['pdf']],
      'the history reads it as the contract has it',
    )
    const event = await one<{ type: string; entity_id: string }>(
      `SELECT type, entity_id FROM sophia.project_events WHERE project_id=$1 AND type='artifact.rendition_ready'`,
      [p.w.projectId],
    )
    assert.equal(event.entity_id, p.done.artifactId)
    assert.equal((await p.again('try-1')).state, 'succeeded', 'a replay reads the rendition it queued')
    assert.equal(await codeOf(p.again('try-2')), 'invalid_request', 'the report has its PDF now')
  })

  it('refuses a version that draws on a withdrawn source (M03-RF-0013)', async () => {
    const p = await partialWorld()
    await withdraw(p.w, p.cited.sourceId)
    assert.equal(await codeOf(p.again('try-1')), 'source_ineligible')
    assert.deepEqual(await p.renders(), [])
    assert.equal(await p.goal(), 'completed')
  })

  it('fails a rendition whose PDF fails a check, and says why (0034)', async () => {
    const p = await partialWorld()
    const blank = { name: 'blank_pages', outcome: 'failed' as const, detail: 'page 2' }
    await p.settle((await p.again('try-1')).renderJobId!, 'succeeded', [blank])
    assert.deepEqual(await p.task(), {
      pdf_state: 'not_produced',
      pdf_reason: 'The PDF could not be produced again (failed: blank_pages)',
    })
    assert.equal((await versionsOf(p.done.artifactId!)).length, 1, 'nothing published')
    assert.equal(await p.goal(), 'completed')
  })

  it('records why a rendition failed, completes the goal, and allows three per version', async () => {
    const p = await partialWorld()
    for (const key of ['a', 'b', 'c']) {
      await p.settle((await p.again(key)).renderJobId!, 'failed')
      assert.equal(await p.goal(), 'completed')
    }
    assert.deepEqual(await p.task(), {
      pdf_state: 'not_produced',
      pdf_reason: 'The PDF could not be produced again (failed: render_error)',
    })
    assert.equal((await p.read()).research?.pdfReason, 'The PDF could not be produced again (failed: render_error)')
    assert.equal((await versionsOf(p.done.artifactId!)).length, 1, 'nothing published')
    assert.equal(await codeOf(p.again('d')), 'research_limit_reached')
  })

  it("refuses a rendition that is not the member's to ask for, or not the report's to have", async () => {
    const p = await partialWorld()
    assert.equal(await codeOf(p.again('v', V)), 'forbidden', 'a viewer')
    assert.equal(await codeOf(p.again('c', C)), 'not_found', 'an outsider')
    assert.equal(await codeOf(p.again('not a key')), 'invalid_request')
    const other = await pdfWorld()
    const running = await one<{ job_id: string }>(
      `SELECT t.job_id FROM sophia.research_tasks t JOIN sophia.jobs j ON j.id=t.job_id WHERE j.attempt_id=$1`,
      [other.at.attemptId],
    )
    assert.equal(
      await codeOf(
        withActor(pool, E, 'write', (c) => requestResearchRendition(c, other.w.projectId, running.job_id, 'k')),
      ),
      'invalid_request',
      'not published yet',
    )
    const w = await world()
    const md = await started(w)
    const cited = await citable(w, md.at)
    const d = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...md.at, callId: 'd', expectedSha256: null, text: reportOf(cited.sourceId) }),
    )
    const plain = await service((c) =>
      runtimeResearchSubmit(c, w.who, { ...md.at, callId: 's', result: resultOf(d.sha256, [cited.sourceId]) }),
    )
    assert.equal(
      await codeOf(withActor(pool, E, 'write', (c) => requestResearchRendition(c, w.projectId, plain.taskId, 'k'))),
      'invalid_request',
      'a Markdown task',
    )
    await owner((c) => c.query(`UPDATE sophia.render_runners SET seen_at=now()-interval '11 minutes'`))
    try {
      assert.equal(await codeOf(p.again('r')), 'native_capability_unavailable', 'no render runner')
    } finally {
      await owner((c) => c.query(`UPDATE sophia.render_runners SET seen_at=now()`))
    }
    assert.equal(await p.goal(), 'completed', 'nothing reopened')
    assert.deepEqual(await p.renders(), [])
  })

  it('waits under a Hold, renders after Resume, and is cancelled by a Stop that completes the goal again', async () => {
    const p = await partialWorld()
    const seen = new Set([p.create.commandId])
    const queued = await p.again('try-1')
    const job = await claimMine(queued.renderJobId!)
    const slot = await service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, job.leaseToken))
    await service((c) =>
      rendererRecordOutput(c, runnerHash(), job.jobId, job.leaseToken, {
        sourceId: slot.sourceId,
        sha256: sha('held pdf'),
        byteLength: 3,
      }),
    )
    await control(p.w, 'hold', p.goalId)
    await deliverAll(p.w, seen, () => 'checked')
    assert.equal(await p.goal(), 'held')
    const late = await service((c) =>
      rendererSettle(c, runnerHash(), job.jobId, job.leaseToken, receiptFor(job.sourceManifestHash, sha('held pdf'))),
    )
    assert.deepEqual(late, { state: 'pending', reason: 'held: queued again for after Resume' })
    assert.equal((await versionsOf(p.done.artifactId!)).length, 1, 'nothing published under a Hold')
    assert.equal(await codeOf(p.again('try-2')), 'invalid_state', 'held: resume it first')
    const claimed = await service((c) => rendererClaim(c, runnerHash()))
    assert.notEqual(claimed?.jobId, queued.renderJobId, 'not claimed while held')
    await control(p.w, 'resume', p.goalId)
    await deliverAll(p.w, seen)
    assert.equal(await p.goal(), 'running')
    await p.settle(queued.renderJobId!)
    assert.equal(await p.goal(), 'completed')
    assert.equal((await versionsOf(p.done.artifactId!)).length, 2)

    const q = await partialWorld()
    const qSeen = new Set([q.create.commandId])
    const stopped = await q.again('try-1')
    await claimMine(stopped.renderJobId!)
    await control(q.w, 'stop', q.goalId)
    await deliverAll(q.w, qSeen, () => 'checked')
    assert.equal(await q.goal(), 'completed', 'a Stop that ended only the rendition')
    assert.deepEqual(await renderState(q.w, stopped.renderJobId!), {
      state: 'cancelled',
      reason: 'stopped: the work was stopped',
      claims: 1,
      result_source_id: null,
    })
    assert.deepEqual(await q.task(), {
      pdf_state: 'not_produced',
      pdf_reason: 'The PDF could not be produced again (stopped: the work was stopped)',
    })
    assert.equal((await q.read()).task.phase, 'result_ready')
    assert.equal((await versionsOf(q.done.artifactId!)).length, 1)
  })

  it('publishes nothing once a newer version is the report’s, and cancels a rendition still waiting for it', async () => {
    const newer = async (p: Awaited<ReturnType<typeof partialWorld>>) =>
      owner(async (c) => {
        const base = p.done.versionId!
        await c.query(`UPDATE sophia.artifact_versions SET state='superseded' WHERE id=$1`, [base])
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
             authority_epoch,state,validation_source_id,checks_passed,version_number,change_note,retained_note,change_facts,trigger,
             job_id,limitations)
           SELECT project_id,artifact_id,id,source_id,source_hash,goal_id,goal_revision,authority_epoch,'stable',validation_source_id,
             checks_passed,version_number+1,'An amendment','The rest',change_facts,trigger,job_id,limitations
             FROM sophia.artifact_versions WHERE id=$1 RETURNING id`,
          [base],
        )
        await c.query(`UPDATE sophia.artifacts SET stable_version_id=$1 WHERE id=$2`, [rows[0]!.id, p.done.artifactId])
      })
    const p = await partialWorld()
    const running = await p.again('try-1')
    const job = await claimMine(running.renderJobId!)
    await newer(p)
    const slot = await service((c) => rendererOutputSlot(c, runnerHash(), job.jobId, job.leaseToken))
    await service((c) =>
      rendererRecordOutput(c, runnerHash(), job.jobId, job.leaseToken, {
        sourceId: slot.sourceId,
        sha256: sha('late pdf'),
        byteLength: 3,
      }),
    )
    const settled = await service((c) =>
      rendererSettle(c, runnerHash(), job.jobId, job.leaseToken, receiptFor(job.sourceManifestHash, sha('late pdf'))),
    )
    assert.equal(settled.state, 'succeeded')
    assert.deepEqual(
      (await versionsOf(p.done.artifactId!)).map((v) => [v.version_number, v.state]),
      [
        [1, 'superseded'],
        [2, 'stable'],
      ],
      'the newer version wins',
    )
    assert.equal(await p.goal(), 'completed')

    const q = await partialWorld()
    const waiting = await q.again('try-1')
    await newer(q)
    await service((c) => rendererClaim(c, runnerHash()))
    assert.deepEqual(await renderState(q.w, waiting.renderJobId!), {
      state: 'cancelled',
      reason: 'cancelled: a newer version of the report was published',
      claims: 0,
      result_source_id: null,
    })
  })
})
