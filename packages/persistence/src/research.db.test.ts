// SMC-M03 S4 part 1: research admission, dispatch and the runtime research operations (migration 0025, amendment
// A11), level: sql-run. Member calls use the non-owner sophia_api login with a transaction-local actor, runtime calls
// the same login with no actor, dispatch the sophia_worker login; grants are the owner's (a Codex operation).
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
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
  listReportSources,
  readArtifactVersions,
  readNativeTask,
  recordRuntimeObservations,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchCapture,
  runtimeResearchContext,
  runtimeResearchDraft,
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
async function started(w: World, request: Partial<ResearchAdmissionRequest> = {}) {
  const admission = await ask(w, request, { exchange: randomUUID() })
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
) {
  const r = await service((c) =>
    runtimeResearchReserve(c, w.who, {
      ...at,
      callId: 'read_1',
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
      text: '# Hosts\nThe sandbox is a microVM.',
      title: 'Hosts and their sandboxes',
    }),
  )
}

const bytes = (t: string) => Buffer.byteLength(t)
const V1 = '# Hosts\nA and B.\n\n## Costs\nUnknown.\n\n## Conclusion\nUse A.\n\n```\n# not a heading\n```\n'
const V2 = '# Hosts\nA and B.\n\n## Costs\nA is $1 a page.\n\n## Pricing tiers\nThree tiers.\n'

/** A first version (V1) and an admitted amendment with its V2 draft: what the truth-gate tests submit. */
async function amending(w: World) {
  const first = await started(w)
  const cited = await citable(w, first.at)
  const d1 = await service((c) =>
    runtimeResearchDraft(c, w.who, { ...first.at, callId: 'd1', expectedSha256: null, text: V1 }),
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
    runtimeResearchDraft(c, w.who, { ...amended.at, callId: 'd2', expectedSha256: null, text: V2 }),
  )
  const submit = (callId: string, notes: { changeNote: string; retainedNote?: string }) =>
    service((c) =>
      runtimeResearchSubmit(c, w.who, { ...amended.at, callId, result: resultOf(d2.sha256, [cited.sourceId], notes) }),
    )
  return { first, cited, v1, amended, submit }
}

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

const control = (w: World, kind: 'hold' | 'resume' | 'steer', goalId: string, bodySourceId: string | null = null) =>
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
