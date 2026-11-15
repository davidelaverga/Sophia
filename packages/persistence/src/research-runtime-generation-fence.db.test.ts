// INC04-R07-C3-FENCE-001 (0111), level: sql-run on real PostgreSQL, two real connections. The nonfinancial runtime
// generation fence: a runtime call authenticated BEFORE a fence waits on the project row and is refused AFTER it (research,
// design and source-review settlement, and hello); an active draining runtime still settles late; an existing writer that
// holds the project first finishes and the fence sees its final state; the fence freezes its target, generation and two
// separate snapshots (monetary-open; retained causes, settled rows included) and replays once through both entries; the
// complete cohort is encoded or nothing happens (E01); application roles cannot reach it, whatever they set. Nothing
// here settles, releases or clears anything. Projects, accounts, runtimes and tokens are SYNTHETIC; no provider is called.
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitGoalCommand,
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeDesignReserve,
  runtimeDesignSettle,
  runtimeHello,
  runtimePoll,
  runtimeResearchReserve,
  runtimeResearchSettle,
  runtimeResearchSubmit,
  runtimeSourceReviewReserve,
  runtimeSourceReviewSettle,
  runtimeTokenHash,
  withActor,
  withService,
  type RuntimeCaller,
} from './index.ts'
import {
  createApiAccount,
  createApiConnection,
  createContributionGrant,
  qualifyApiAccount,
  registerContributionRuntime,
  retireContributionRuntime,
  revokeApiAccountQualification,
  setResearchFundingPin,
  updateApiAccount,
  type AccountProtection,
} from './api-contributions.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 10 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 6 })
  await owner.query(
    `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`,
  )
})
after(async () => {
  await api.end()
  await worker.end()
  await owner.end()
  await db.drop()
})

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const NONE_APPLICABLE: AccountProtection = {
  applicability: 'none_applicable',
  operations: ['research'],
  roles: ['sophia-research-md-v1'],
}
const UNIT = 'sophia-runtime-test'
const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await owner.query(sql, params)).rows[0] as T
const rows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await owner.query(sql, params)).rows as T[]
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
/** Every message and code along an error's cause chain (a refusal is asserted by its words, never by a stack). */
function chain(err: unknown): string {
  const out: string[] = []
  for (let e: unknown = err, n = 0; e && n < 6; n++) {
    const x = e as { code?: unknown; message?: unknown; cause?: unknown }
    out.push(`${text(x.code)}:${text(x.message)}`)
    e = x.cause
  }
  return out.join(' | ')
}
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return chain(err)
  }
}
const REVOKED = /Runtime capability revoked/

const callerOf = (token: string, unit: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: unit,
  bridgeInstanceId: randomUUID(),
})
const hello = (who: RuntimeCaller) =>
  service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }))
async function bringUp(who: RuntimeCaller) {
  await hello(who)
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
}
const qualify = (connectionId: string) =>
  qualifyApiAccount(owner, {
    connectionId,
    operations: ['research'],
    verification: 'operator_verified_call',
    evidenceRef: 'synthetic: not a live account qualification',
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  })

/** A project with an enabled research gate and a ready legacy runtime; an account, connection, grant and a qualified,
 * connected contribution runtime (`who`, credential revision 1). All SYNTHETIC. */
async function world() {
  const OWNER = randomUUID()
  const REQ = randomUUID()
  const ADMIN = randomUUID()
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const reg = await registerRuntime(db.ownerUrl, { projectId, admin: ADMIN })
  const legacy = callerOf(reg.token, reg.runtimeUnitId)
  await bringUp(legacy)
  const account = (
    await withActor(api, OWNER, 'write', (c) =>
      createApiAccount(c, { label: 'My API', totalCapUsd: 10, concurrency: 3, provenance: 'owner_declared' }),
    )
  ).accountId
  await withActor(api, OWNER, 'write', (c) => updateApiAccount(c, account, 1, { protection: NONE_APPLICABLE }))
  const conn = await withActor(api, OWNER, 'write', (c) =>
    createApiConnection(c, account, 'Research key', 'Operator host'),
  )
  const grantId = (
    await withActor(api, OWNER, 'write', (c) =>
      createContributionGrant(c, conn.connectionId, projectId, {
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        taskCapUsd: 2,
        totalCapUsd: 5,
        fundingPolicy: 'bounded_total_spend',
        fundingAcknowledgementRef: 'synthetic acknowledgement',
      }),
    )
  ).grantId
  const token = randomUUID() + randomUUID()
  await registerContributionRuntime(owner, {
    projectId,
    connectionId: conn.connectionId,
    runtimeUnitId: UNIT,
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: false,
  })
  const who = callerOf(token, UNIT)
  await bringUp(who)
  await qualify(conn.connectionId)
  const link = await one<{ resource_id: string; runtime_id: string }>(
    `SELECT resource_id, runtime_id FROM sophia.api_contribution_runtimes WHERE project_id=$1 AND connection_id=$2`,
    [projectId, conn.connectionId],
  )
  return {
    projectId,
    REQ,
    account,
    connectionId: conn.connectionId,
    grantId,
    who,
    legacy,
    resourceId: link.resource_id,
    runtimeId: link.runtime_id,
  }
}
type World = Awaited<ReturnType<typeof world>>

/** Rotate the connection: the world's resource drains (its runtime stays active); a new current runtime takes over. */
async function rotate(w: World, unit = `${UNIT}-2`) {
  const token = randomUUID() + randomUUID()
  const r = await registerContributionRuntime(owner, {
    projectId: w.projectId,
    connectionId: w.connectionId,
    runtimeUnitId: unit,
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: true,
  })
  const who = callerOf(token, unit)
  await bringUp(who)
  return { who, resourceId: r.resourceId, credentialRevision: r.credentialRevision }
}

async function admitted(w: World) {
  const rev = Number(
    (await one<{ r: string }>(`SELECT revision AS r FROM sophia.api_contribution_grants WHERE id=$1`, [w.grantId])).r,
  )
  await withActor(api, w.REQ, 'write', (c) => setResearchFundingPin(c, w.projectId, w.grantId, rev))
  const r = await withActor(api, w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
  assert.ok('admitted' in r, JSON.stringify(r))
  return r.admitted
}
type At = { attemptId: string; nativeSessionId: string }
async function deliver(who: RuntimeCaller, attemptId: string): Promise<At> {
  const create = (await service((c) => runtimePoll(c, who, 0))).commands
    .map((q) => q.command as RuntimeCommand)
    .find((cmd) => cmd.binding.attemptId === attemptId)
  assert.ok(create, `the create of ${attemptId} reached its runtime`)
  const receipt: RuntimeReceipt = {
    commandId: create.commandId,
    attemptId,
    stage: 'delivered',
    nativeSessionId: `sophia-${attemptId}`,
    nativeSequence: 1,
    evidenceRefs: [],
    observedAt: new Date().toISOString(),
    reason: null,
  }
  await service((c) => recordRuntimeReceipts(c, who, [receipt]))
  return { attemptId, nativeSessionId: `sophia-${attemptId}` }
}
/** A contributed (pinned) research task delivered to the world's contribution runtime. */
async function started(w: World) {
  const r = await admitted(w)
  for (const row of await claimRuntimeOutbox(worker, 'c3-fence', 50, 30))
    await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
  return { taskId: r.taskId, at: await deliver(w.who, r.attemptId) }
}

const TRACKED = {
  mode: 'tracked_v1' as const,
  contract: 'c1p_complete_report' as const,
  declared: {
    routeId: 'research-sol-medium-v1',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'medium',
    prices: { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 },
  },
}
const reserve = (who: RuntimeCaller, at: At, callId: string) =>
  service((c) =>
    runtimeResearchReserve(c, who, {
      ...at,
      callId,
      kind: 'model',
      provider: 'openai-research',
      amountUsd: 0.1,
      ...TRACKED,
    }),
  )
const known = (value: number) => ({ class: 'known' as const, value })
/** A complete C1P settlement: 3 input, 0 cache read, `output` output tokens, `cost` USD. */
const complete = (at: At, reservationId: string, o: { cost?: number; output?: number } = {}) => ({
  ...at,
  reservationId,
  outcome: 'settled' as const,
  costUsd: o.cost ?? 0.01,
  usage: { inputTokens: 3, outputTokens: o.output ?? 4 },
  evidence: {
    contract: 'c1p_complete_report' as const,
    report: 'complete_report' as const,
    counts: {
      nonCachedInput: known(3),
      cacheRead: known(0),
      cacheWrite: { class: 'no_separate_reported_class' as const },
      output: known(o.output ?? 4),
    },
    ending: 'stream_completed' as const,
    responseId: { status: 'unknown' as const },
  },
})
const settle = (who: RuntimeCaller, at: At, reservationId: string, o: { cost?: number; output?: number } = {}) =>
  service((c) => runtimeResearchSettle(c, who, complete(at, reservationId, o)))

/**
 * LABELLED SYNTHETIC FIXTURE (as in research-call-evidence.db.test.ts): a design (or source review) attempt on the
 * runtime of the research attempt `s`, sharing the research lineage's allowance (design: account-backed) or an
 * independent project allowance (review: account-null), inserted by the migration owner with triggers off.
 */
async function syntheticAttempt(
  w: World,
  s: { taskId: string; at: At },
  kind: 'design' | 'source_review',
  seqOffset = 1000,
) {
  const c = await owner.connect()
  const att = randomUUID()
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL session_replication_role = replica')
    const base = await c.query<{
      goal_id: string
      binding: Record<string, unknown>
      attempt: Record<string, unknown>
      job: Record<string, unknown>
      command: Record<string, unknown>
      allowance_id: string
    }>(
      `SELECT wa.goal_id, to_jsonb(b) AS binding, to_jsonb(wa) AS attempt, to_jsonb(j) AS job, to_jsonb(rc) AS command, t.allowance_id
        FROM sophia.jobs j JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
        JOIN sophia.execution_bindings b ON b.project_id=j.project_id AND b.attempt_id=j.attempt_id
        JOIN sophia.research_tasks t ON t.project_id=j.project_id AND t.job_id=j.id
        JOIN sophia.runtime_commands rc ON rc.project_id=j.project_id AND rc.binding_id=b.id
        WHERE j.id=$1 ORDER BY rc.seq DESC LIMIT 1`,
      [s.taskId],
    )
    const row = base.rows[0]!
    const job = randomUUID()
    const binding = randomUUID()
    await c.query(
      `INSERT INTO sophia.work_attempts SELECT (jsonb_populate_record(NULL::sophia.work_attempts, $1::jsonb)).*`,
      [{ ...row.attempt, id: att }],
    )
    await c.query(
      `INSERT INTO sophia.execution_bindings SELECT (jsonb_populate_record(NULL::sophia.execution_bindings, $1::jsonb)).*`,
      [{ ...row.binding, id: binding, attempt_id: att, native_session_id: `sophia-${att}` }],
    )
    await c.query(`INSERT INTO sophia.jobs SELECT (jsonb_populate_record(NULL::sophia.jobs, $1::jsonb)).*`, [
      { ...row.job, id: job, kind, attempt_id: att },
    ])
    await c.query(
      `INSERT INTO sophia.runtime_commands SELECT (jsonb_populate_record(NULL::sophia.runtime_commands, $1::jsonb)).*`,
      [
        {
          ...row.command,
          id: randomUUID(),
          outbox_id: randomUUID(),
          binding_id: binding,
          attempt_id: att,
          seq: Number(row.command.seq) + seqOffset,
        },
      ],
    )
    if (kind === 'design') {
      await c.query(
        `INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
          language,targets,role,route) VALUES($1,$2,$3,$3,$4,$5,gen_random_uuid(),gen_random_uuid(),$6,'en','{w390-light}','sophia-html-designer-v1','research-sol-medium-v1')`,
        [w.projectId, job, s.taskId, row.allowance_id, w.REQ, 'a'.repeat(64)],
      )
    } else {
      const manifest = randomUUID()
      await c.query(`INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES($1,$2,$3)`, [
        w.projectId,
        manifest,
        JSON.stringify({ route: { id: 'source-review-luna-high-v1' } }),
      ])
      await c.query(`UPDATE sophia.jobs SET input_source_id=$2 WHERE project_id=$1 AND id=$3`, [
        w.projectId,
        manifest,
        job,
      ])
      const allowance = await c.query<{ id: string }>(
        `INSERT INTO sophia.research_allowances(project_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
        VALUES($1,0.5,0,'web-pilot-v1',0,0) RETURNING id`,
        [w.projectId],
      )
      await c.query(
        `INSERT INTO sophia.work_items(project_id,id,plan_id,plan_revision,execution_goal_id,allowance_id,accepted_by)
        VALUES($1,gen_random_uuid(),gen_random_uuid(),1,$2,$3,$4)`,
        [w.projectId, row.goal_id, allowance.rows[0]!.id, w.REQ],
      )
    }
    await c.query('COMMIT')
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    c.release()
  }
  return { attemptId: att, nativeSessionId: `sophia-${att}` }
}
const designReserve = (who: RuntimeCaller, at: At, callId: string) =>
  service((c) =>
    runtimeDesignReserve(c, who, {
      ...at,
      callId,
      kind: 'model',
      provider: 'openai-research',
      amountUsd: 0.1,
      purpose: 'call',
      ...TRACKED,
    }),
  )
const reviewReserve = (who: RuntimeCaller, at: At, callId: string) =>
  service((c) =>
    runtimeSourceReviewReserve(c, who, {
      ...at,
      callId,
      kind: 'model',
      provider: 'openai-review',
      amountUsd: 0.1,
      purpose: 'call',
      ...TRACKED,
    }),
  )

// --- the fence ----------------------------------------------------------------------------------------------------

type FenceResult = {
  fenceId: string
  projectId: string
  resourceId: string
  connectionId: string
  accountId: string
  credentialRevision: number
  generation: string
  runtimeIds: string[]
  revokedRuntimeIds: string[]
  unresolvedReservations: number
  monetaryOpen: { count: number; digest: string }
  causes: { count: number; digest: string }
  checkpointOnly: boolean
  entry: string
}
const generationOf = async (projectId: string, resourceId: string) =>
  (await one<{ g: string }>(`SELECT sophia.contribution_runtime_generation($1,$2) AS g`, [projectId, resourceId])).g
const fenceIn = async (c: pg.Pool | pg.ClientBase, projectId: string, resourceId: string, generation: string) =>
  (
    await c.query<{ r: FenceResult }>(`SELECT sophia.fence_contribution_runtime($1,$2,$3) AS r`, [
      projectId,
      resourceId,
      generation,
    ])
  ).rows[0]!.r
const fence = (projectId: string, resourceId: string, generation: string) =>
  fenceIn(owner, projectId, resourceId, generation)
type Snapshot = { kind: string; encoding: string; row_count: number; digest: string }
const snapshotsOf = (fenceId: string) =>
  rows<Snapshot>(
    `SELECT kind, encoding, row_count, digest FROM sophia.research_runtime_fence_snapshots WHERE fence_id=$1 ORDER BY kind`,
    [fenceId],
  )
const fencesOf = (projectId: string) =>
  rows<{ id: string; resource_id: string; entry: string; result: FenceResult }>(
    `SELECT id, resource_id, entry, result FROM sophia.research_runtime_fences WHERE project_id=$1 ORDER BY fenced_at`,
    [projectId],
  )
const instancesOf = (projectId: string, resourceId: string) =>
  rows<{ id: string; state: string }>(
    `SELECT id, state FROM sophia.runtime_instances WHERE project_id=$1 AND resource_id=$2 ORDER BY id`,
    [projectId, resourceId],
  )
/** Every reservation of a project, with its retained call evidence: what the fence must never change. */
const moneyAndEvidence = async (projectId: string) => ({
  reservations: await rows(
    `SELECT to_jsonb(r) AS j FROM sophia.research_reservations r WHERE project_id=$1 ORDER BY id`,
    [projectId],
  ),
  allowances: await rows(`SELECT to_jsonb(a) AS j FROM sophia.research_allowances a WHERE project_id=$1 ORDER BY id`, [
    projectId,
  ]),
  truth: await rows(
    `SELECT to_jsonb(t) AS j FROM sophia.research_call_truth t WHERE project_id=$1 ORDER BY reservation_id`,
    [projectId],
  ),
  history: await rows(
    `SELECT to_jsonb(h) AS j FROM sophia.research_call_history h WHERE project_id=$1 ORDER BY reservation_id, ordinal`,
    [projectId],
  ),
  identities: await rows(
    `SELECT to_jsonb(i) AS j FROM sophia.research_call_identities i WHERE project_id=$1 ORDER BY reservation_id`,
    [projectId],
  ),
})
const digestOf = (kind: string, encoding: string) =>
  createHash('sha256').update(`research-runtime-fence-v1|${kind}\n${encoding}`, 'utf8').digest('hex')

// --- two-connection barriers --------------------------------------------------------------------------------------

const pidOf = async (c: pg.ClientBase) => (await c.query<{ p: number }>(`SELECT pg_backend_pid() AS p`)).rows[0]!.p
/** The one backend (other than `except`) blocked by `holder`, within a finite budget. */
async function blockedBy(holder: number, what: string, except: number[] = []): Promise<number> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const r = await rows<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND NOT pid=ANY($2::int[])`,
      [holder, except],
    )
    if (r.length === 1) return r[0]!.pid
    if (Date.now() > deadline) throw new Error(`${what}: never blocked by ${String(holder)} (${JSON.stringify(r)})`)
    await sleep(25)
  }
}
/** The waiter holds the projects row's TUPLE lock and waits for the holder's transaction: it is at the project wait. */
async function atProjectWait(pid: number) {
  const r = await rows<{ locktype: string; rel: string | null; granted: boolean }>(
    `SELECT locktype, relation::regclass::text AS rel, granted FROM pg_locks WHERE pid=$1 AND locktype IN ('tuple','transactionid')`,
    [pid],
  )
  assert.ok(
    r.some((l) => l.locktype === 'tuple' && l.rel === 'sophia.projects' && l.granted),
    `waiting on the projects row: ${JSON.stringify(r)}`,
  )
  assert.ok(
    r.some((l) => l.locktype === 'transactionid' && !l.granted),
    `waiting on a transaction: ${JSON.stringify(r)}`,
  )
}
/**
 * Hold the fence open in its own transaction (its project row, link and runtime rows locked; the revocation not yet
 * committed), start `call` on another connection, prove it passed authentication (it reads the committed, still active
 * capability) and now waits at the project row, then commit the fence and return the call's outcome.
 */
async function fencedWhileWaiting(w: World, call: () => Promise<unknown>) {
  const generation = await generationOf(w.projectId, w.resourceId)
  const op = await owner.connect()
  try {
    await op.query('BEGIN')
    const result = await fenceIn(op, w.projectId, w.resourceId, generation)
    const holder = await pidOf(op)
    const outcome = refusal(call())
    const waiter = await blockedBy(holder, 'the runtime call')
    await atProjectWait(waiter)
    await op.query('COMMIT')
    return { result, outcome: await outcome }
  } catch (err) {
    await op.query('ROLLBACK')
    throw err
  } finally {
    op.release()
  }
}

describe('C3 fence: a call authenticated before the fence waits at the project row and is refused after it', () => {
  it('research settlement (FENCE-LEASE): refused after the wait; its reservation stays open and is in the snapshot', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    await rotate(w)
    const prior = await moneyAndEvidence(w.projectId)
    const { result, outcome } = await fencedWhileWaiting(w, () => settle(w.who, s.at, r.reservationId))
    assert.match(outcome, REVOKED)
    assert.deepEqual(await moneyAndEvidence(w.projectId), prior, 'the late write changed nothing')
    assert.equal(result.monetaryOpen.count, 1)
    const open = JSON.parse((await snapshotsOf(result.fenceId))[1]!.encoding) as {
      reservationId: string
      state: string
    }[]
    assert.deepEqual(
      open.map((o) => [o.reservationId, o.state]),
      [[r.reservationId, 'reserved']],
    )
  })

  it('design settlement (FENCE-LEASE through design_scope_of): refused after the wait', async () => {
    const w = await world()
    const s = await started(w)
    const at = await syntheticAttempt(w, s, 'design')
    const d = await designReserve(w.who, at, 'llm-d1')
    await rotate(w)
    const prior = await moneyAndEvidence(w.projectId)
    const { result, outcome } = await fencedWhileWaiting(w, () =>
      service((c) => runtimeDesignSettle(c, w.who, complete(at, d.reservationId))),
    )
    assert.match(outcome, REVOKED)
    assert.deepEqual(await moneyAndEvidence(w.projectId), prior)
    const open = JSON.parse((await snapshotsOf(result.fenceId))[1]!.encoding) as {
      reservationId: string
      operation: string
      payer: string
    }[]
    assert.deepEqual(
      open.map((o) => [o.reservationId, o.operation, o.payer]),
      [[d.reservationId, 'design', 'contributor_api_account']],
    )
  })

  it('source-review settlement (FENCE-LEASE through review_scope_of), an account-null call: refused after the wait', async () => {
    const w = await world()
    const s = await started(w)
    const at = await syntheticAttempt(w, s, 'source_review')
    const v = await reviewReserve(w.who, at, 'llm-v1')
    await rotate(w)
    const prior = await moneyAndEvidence(w.projectId)
    const { result, outcome } = await fencedWhileWaiting(w, () =>
      service((c) => runtimeSourceReviewSettle(c, w.who, complete(at, v.reservationId))),
    )
    assert.match(outcome, REVOKED)
    assert.deepEqual(await moneyAndEvidence(w.projectId), prior)
    const open = JSON.parse((await snapshotsOf(result.fenceId))[1]!.encoding) as {
      reservationId: string
      operation: string
      payer: string
      accountId: string | null
      ledger: boolean
    }[]
    assert.deepEqual(
      open.map((o) => [o.reservationId, o.operation, o.payer, o.accountId, o.ledger]),
      [[v.reservationId, 'source_review', 'project', null, false]],
      'an account-null call stays account-null in the snapshot',
    )
    assert.equal(result.unresolvedReservations, 0, 'the 0094 count (contribution ledger) does not count it (E02)')
  })

  it('hello (FENCE-HELLO): an independently authenticated hello waits at the project row and is refused; nothing is written', async () => {
    const w = await world()
    await rotate(w)
    const row = async () =>
      one<{ j: Record<string, unknown> }>(`SELECT to_jsonb(r) AS j FROM sophia.runtime_instances r WHERE id=$1`, [
        w.runtimeId,
      ])
    const { outcome } = await fencedWhileWaiting(w, () => hello(w.who))
    assert.match(outcome, REVOKED)
    const revokedRow = (await row()).j
    assert.equal(revokedRow.state, 'revoked')
    assert.equal(
      revokedRow.lease_epoch,
      1,
      'no new lease epoch (bringUp said hello once; the fenced hello wrote nothing)',
    )
  })
})

describe('C3 fence: active late work continues; an existing writer finishes first', () => {
  it('an ACTIVE draining runtime still settles all three kinds and says hello (no fence yet)', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    const dAt = await syntheticAttempt(w, s, 'design')
    const d = await designReserve(w.who, dAt, 'llm-d1')
    const vAt = await syntheticAttempt(w, s, 'source_review', 2000)
    const v = await reviewReserve(w.who, vAt, 'llm-v1')
    await rotate(w)
    await hello(w.who)
    assert.equal((await settle(w.who, s.at, r.reservationId)).state, 'settled')
    assert.equal((await service((c) => runtimeDesignSettle(c, w.who, complete(dAt, d.reservationId)))).state, 'settled')
    assert.equal(
      (await service((c) => runtimeSourceReviewSettle(c, w.who, complete(vAt, v.reservationId)))).state,
      'settled',
    )
  })

  it('a writer holding the project first settles; the fence waits for it, then snapshots its final (settled) state', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    await rotate(w)
    const generation = await generationOf(w.projectId, w.resourceId)
    const holder = await owner.connect()
    const fencer = await owner.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [w.projectId])
      const h = await pidOf(holder)
      const settled = settle(w.who, s.at, r.reservationId)
      const writer = await blockedBy(h, 'the writer')
      await atProjectWait(writer)
      const fenced = fenceIn(fencer, w.projectId, w.resourceId, generation)
      await blockedBy(writer, 'the fence (queued behind the writer at the projects row)')
      await holder.query('COMMIT')
      assert.equal((await settled).state, 'settled', 'the writer queued first finishes first')
      const result = await fenced
      assert.equal(result.monetaryOpen.count, 0, 'its final state: settled, not open')
      assert.equal(result.unresolvedReservations, 0)
      const reservation = await one<{ state: string; settled_usd: string }>(
        `SELECT state, settled_usd FROM sophia.research_reservations WHERE id=$1`,
        [r.reservationId],
      )
      assert.deepEqual(reservation, { state: 'settled', settled_usd: '0.010000' }, 'settled once')
      assert.equal(result.checkpointOnly, true, 'an empty monetary-open snapshot is a checkpoint, not a certificate')
    } finally {
      // A failed assertion must not leave a pooled connection inside an open transaction.
      await holder.query('ROLLBACK')
      await fencer.query('ROLLBACK')
      holder.release()
      fencer.release()
    }
  })

  it('project serialization: a fence waits on a plain project-row holder (FENCE-ORDER), then proceeds', async () => {
    const w = await world()
    await rotate(w)
    const generation = await generationOf(w.projectId, w.resourceId)
    const holder = await owner.connect()
    const fencer = await owner.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [w.projectId])
      const fenced = fenceIn(fencer, w.projectId, w.resourceId, generation)
      const waiter = await blockedBy(await pidOf(holder), 'the fence')
      await atProjectWait(waiter)
      assert.deepEqual(
        (await instancesOf(w.projectId, w.resourceId)).map((i) => i.state),
        ['active'],
        'nothing revoked while it waits',
      )
      await holder.query('COMMIT')
      assert.deepEqual((await fenced).revokedRuntimeIds, [w.runtimeId])
    } finally {
      // A failed assertion must not leave a pooled connection inside an open transaction.
      await holder.query('ROLLBACK')
      await fencer.query('ROLLBACK')
      holder.release()
      fencer.release()
    }
  })
})

describe('C3 fence: target, generation, snapshots, replay and retire compatibility', () => {
  it('freezes the original identities, two separate sorted snapshots (settled causes kept), and replays once', async () => {
    const w = await world()
    const s = await started(w)
    const open = await reserve(w.who, s.at, 'llm-open')
    const late = await reserve(w.who, s.at, 'llm-late')
    const c = await reserve(w.who, s.at, 'llm-conflict')
    await settle(w.who, s.at, c.reservationId)
    await settle(w.who, s.at, c.reservationId, { output: 77 })
    const next = await rotate(w)
    assert.equal((await settle(w.who, s.at, late.reservationId)).state, 'settled', 'active late settlement')
    const prior = await moneyAndEvidence(w.projectId)
    const generation = await generationOf(w.projectId, w.resourceId)
    const result = await fence(w.projectId, w.resourceId, generation)
    assert.deepEqual(await moneyAndEvidence(w.projectId), prior, 'no money, truth, history or identity changed')
    assert.equal(result.generation, generation)
    assert.equal(
      generation,
      createHash('sha256')
        .update(`sophia-runtime-generation-v1|${w.projectId}|${w.resourceId}|${w.connectionId}|1`, 'utf8')
        .digest('hex'),
      'the token is derived from the immutable binding',
    )
    assert.deepEqual(
      [result.resourceId, result.connectionId, result.accountId, result.credentialRevision, result.entry],
      [w.resourceId, w.connectionId, w.account, 1, 'fence'],
    )
    assert.deepEqual(result.runtimeIds, [w.runtimeId])
    assert.deepEqual(result.revokedRuntimeIds, [w.runtimeId])
    assert.equal(result.unresolvedReservations, 1, 'the 0094 count: the one reserved contributed call')
    const [cause, monetary] = await snapshotsOf(result.fenceId)
    assert.deepEqual([cause!.kind, monetary!.kind], ['cause', 'monetary_open'])
    for (const snap of [cause!, monetary!]) {
      assert.equal(snap.digest, digestOf(snap.kind, snap.encoding), 'the digest reproduces from the stored encoding')
      const ids = (JSON.parse(snap.encoding) as { reservationId: string }[]).map((x) => x.reservationId)
      assert.deepEqual(ids, ids.toSorted(), 'sorted by reservation id')
      assert.equal(snap.row_count, ids.length)
    }
    assert.deepEqual(
      [result.monetaryOpen, result.causes],
      [
        { count: monetary!.row_count, digest: monetary!.digest },
        { count: cause!.row_count, digest: cause!.digest },
      ],
    )
    const m = JSON.parse(monetary!.encoding) as Record<string, unknown>[]
    assert.deepEqual(m, [
      {
        reservationId: open.reservationId,
        state: 'reserved',
        kind: 'model',
        purpose: 'call',
        reservedUsd: 0.1,
        allowanceId: m[0]!.allowanceId,
        jobId: s.taskId,
        payer: 'contributor_api_account',
        accountId: w.account,
        grantId: w.grantId,
        grantRevision: m[0]!.grantRevision,
        connectionId: w.connectionId,
        credentialRevision: 1,
        ledger: true,
        tracked: true,
        operation: 'research',
        contract: 'c1p_complete_report',
      },
    ])
    const k = JSON.parse(cause!.encoding) as Record<string, unknown>[]
    assert.deepEqual(
      k.map((x) => [x.reservationId, x.state, x.firstConflictReason, x.restrictsAccount]),
      [[c.reservationId, 'settled', 'count_changed', true]],
      'the settled conflict is retained as a cause, apart from the monetary-open set',
    )
    // Revoked: the old generation is refused everywhere; the new current generation is untouched.
    assert.match(await refusal(hello(w.who)), REVOKED)
    assert.match(await refusal(settle(w.who, s.at, open.reservationId)), REVOKED)
    assert.deepEqual(
      (await instancesOf(w.projectId, next.resourceId)).map((i) => i.state),
      ['active'],
    )
    // Replay through both entries: the one stored result; no second revoke or snapshot.
    assert.deepEqual(await fence(w.projectId, w.resourceId, generation), result)
    assert.deepEqual(await retireContributionRuntime(owner, w.projectId, w.resourceId), {
      resourceId: w.resourceId,
      unresolvedReservations: 1,
    })
    assert.equal((await fencesOf(w.projectId)).length, 1)
    assert.equal((await snapshotsOf(result.fenceId)).length, 2)
    // A changed target or token refuses; frozen rows never change or disappear.
    assert.match(await refusal(fence(w.projectId, w.resourceId, 'a'.repeat(64))), /stale or mismatched/)
    const other = await generationOf(w.projectId, next.resourceId)
    assert.match(await refusal(fence(w.projectId, w.resourceId, other)), /stale or mismatched/)
    assert.match(
      await refusal(fence(w.projectId, next.resourceId, generation)),
      /drained/,
      'the current resource is not draining',
    )
    assert.match(
      await refusal(
        owner.query(`UPDATE sophia.research_runtime_fences SET entry='retire' WHERE id=$1`, [result.fenceId]),
      ),
      /append-only/,
    )
    assert.match(
      await refusal(
        owner.query(`DELETE FROM sophia.research_runtime_fence_snapshots WHERE fence_id=$1`, [result.fenceId]),
      ),
      /append-only/,
    )
    assert.match(await refusal(owner.query(`TRUNCATE sophia.research_runtime_fence_snapshots`)), /append-only/)
  })

  it('retire first (0094 entry, fields and count unchanged), then the fence entry replays the same fence', async () => {
    const w = await world()
    const s = await started(w)
    await reserve(w.who, s.at, 'llm-1')
    await rotate(w)
    const retired = await retireContributionRuntime(owner, w.projectId, w.resourceId)
    assert.deepEqual(retired, { resourceId: w.resourceId, unresolvedReservations: 1 })
    assert.deepEqual(Object.keys(retired).toSorted(), ['resourceId', 'unresolvedReservations'], 'no field added')
    const generation = await generationOf(w.projectId, w.resourceId)
    const f = await fence(w.projectId, w.resourceId, generation)
    assert.equal(f.entry, 'retire')
    assert.deepEqual(await retireContributionRuntime(owner, w.projectId, w.resourceId), retired)
    assert.equal((await fencesOf(w.projectId)).length, 1)
    // A current (not draining) resource is still refused by retire, as before.
    const w2 = await world()
    assert.match(await refusal(retireContributionRuntime(owner, w2.projectId, w2.resourceId)), /drained/)
    assert.deepEqual(
      (await instancesOf(w2.projectId, w2.resourceId)).map((i) => i.state),
      ['active'],
    )
  })

  it('an interrupted fence (rolled back) leaves nothing; an unknown acknowledgement is read back, then replays once', async () => {
    const w = await world()
    await rotate(w)
    const generation = await generationOf(w.projectId, w.resourceId)
    const c = await owner.connect()
    try {
      await c.query('BEGIN')
      await fenceIn(c, w.projectId, w.resourceId, generation)
      await c.query('ROLLBACK')
    } finally {
      c.release()
    }
    assert.equal((await fencesOf(w.projectId)).length, 0, 'interrupted: no fence')
    assert.deepEqual(
      (await instancesOf(w.projectId, w.resourceId)).map((i) => i.state),
      ['active'],
    )
    // The reply is lost: read back by the token first, then repeat; one fence, one effect.
    void (await fence(w.projectId, w.resourceId, generation))
    const readback = await one<{ result: FenceResult }>(
      `SELECT result FROM sophia.research_runtime_fences WHERE generation=$1`,
      [generation],
    )
    const again = new pg.Client({ connectionString: db.ownerUrl })
    await again.connect()
    try {
      assert.deepEqual(await fenceIn(again, w.projectId, w.resourceId, generation), readback.result)
    } finally {
      await again.end()
    }
    assert.equal((await fencesOf(w.projectId)).length, 1)
  })

  it('E01: a cohort past the bound is refused before any effect, never truncated (both entries)', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    await rotate(w)
    // LABELLED SYNTHETIC: 256 more open contributed reservations of the same task, inserted with triggers off.
    const c = await owner.connect()
    try {
      await c.query('BEGIN')
      await c.query('SET LOCAL session_replication_role = replica')
      await c.query(
        `WITH src AS (SELECT r.allowance_id, x.* FROM sophia.research_reservations r JOIN sophia.api_contribution_reservations x
           ON x.project_id=r.project_id AND x.reservation_id=r.id WHERE r.id=$1),
         n AS (SELECT gen_random_uuid() AS id, g FROM generate_series(1,256) g),
         ins AS (INSERT INTO sophia.research_reservations(project_id,id,allowance_id,reservation_key,kind,provider,reserved_usd)
           SELECT src.project_id, n.id, src.allowance_id, 'synthetic-e01-'||n.g, 'model', 'openai-research', 0.01 FROM src, n RETURNING id)
         INSERT INTO sophia.api_contribution_reservations(project_id,reservation_id,job_id,grant_id,grant_revision,account_id,connection_id,credential_revision)
         SELECT src.project_id, ins.id, src.job_id, src.grant_id, src.grant_revision, src.account_id, src.connection_id, src.credential_revision FROM src, ins`,
        [r.reservationId],
      )
      await c.query('COMMIT')
    } finally {
      c.release()
    }
    const generation = await generationOf(w.projectId, w.resourceId)
    assert.match(await refusal(fence(w.projectId, w.resourceId, generation)), /exceeds its bound/)
    assert.match(await refusal(retireContributionRuntime(owner, w.projectId, w.resourceId)), /exceeds its bound/)
    assert.equal((await fencesOf(w.projectId)).length, 0)
    assert.deepEqual(
      (await instancesOf(w.projectId, w.resourceId)).map((i) => i.state),
      ['active'],
      'nothing revoked',
    )
  })
})

describe('C3 fence: scopes, later effects and registration', () => {
  it('a turn end before and a qualification revoke after the fence keep the unsettled money and exposure', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    await service((c) =>
      runtimeResearchSubmit(c, w.who, { ...s.at, callId: 'end', blocker: { reason: 'ended for the test' } }),
    )
    const ended = await one<{ state: string }>(`SELECT state FROM sophia.research_reservations WHERE id=$1`, [
      r.reservationId,
    ])
    await rotate(w)
    const result = await fence(w.projectId, w.resourceId, await generationOf(w.projectId, w.resourceId))
    const open = JSON.parse((await snapshotsOf(result.fenceId))[1]!.encoding) as {
      state: string
      reservedUsd: number
    }[]
    assert.deepEqual(
      open.map((o) => [o.state, o.reservedUsd]),
      [[ended.state, 0.1]],
      'the open exposure at the fence',
    )
    assert.ok(['reserved', 'uncertain'].includes(ended.state))
    assert.equal(result.unresolvedReservations, 1)
    const prior = await moneyAndEvidence(w.projectId)
    const q = await one<{ id: string }>(
      `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w.connectionId],
    )
    await revokeApiAccountQualification(owner, q.id, 'synthetic: revoked after the fence')
    assert.deepEqual(await moneyAndEvidence(w.projectId), prior, 'a revoke releases or zeroes nothing')
    assert.deepEqual((await fencesOf(w.projectId))[0]!.result, result)
  })

  it('unrelated resources and projects, and the legacy (account-null) runtime, are untouched; a new registration follows its own revision', async () => {
    const w = await world()
    const other = await world()
    const s = await started(w)
    await rotate(w)
    const prior = {
      other: await rows(`SELECT to_jsonb(r) AS j FROM sophia.runtime_instances r WHERE project_id=$1 ORDER BY id`, [
        other.projectId,
      ]),
      legacy: await rows(
        `SELECT to_jsonb(r) AS j FROM sophia.runtime_instances r WHERE project_id=$1 AND resource_id<>$2 AND state='active' ORDER BY id`,
        [w.projectId, w.resourceId],
      ),
    }
    const result = await fence(w.projectId, w.resourceId, await generationOf(w.projectId, w.resourceId))
    assert.deepEqual(
      await rows(`SELECT to_jsonb(r) AS j FROM sophia.runtime_instances r WHERE project_id=$1 ORDER BY id`, [
        other.projectId,
      ]),
      prior.other,
    )
    assert.deepEqual(
      await rows(
        `SELECT to_jsonb(r) AS j FROM sophia.runtime_instances r WHERE project_id=$1 AND resource_id<>$2 AND state='active' ORDER BY id`,
        [w.projectId, w.resourceId],
      ),
      prior.legacy,
      'the legacy runtime and the new current runtime stay active',
    )
    await hello(w.legacy)
    // The legacy resource is not a contribution resource: nothing to fence.
    const legacyResource = await one<{ resource_id: string }>(
      `SELECT resource_id FROM sophia.runtime_instances WHERE token_sha256=$1`,
      [w.legacy.tokenSha256],
    )
    assert.equal(await generationOf(w.projectId, legacyResource.resource_id), null)
    assert.match(await refusal(fence(w.projectId, legacyResource.resource_id, 'b'.repeat(64))), /drained/)
    // Another rotation: revision 3; the revision-2 resource drains; the first fence is unchanged and the old token stays refused.
    const frozen = await rows(`SELECT to_jsonb(f) AS j FROM sophia.research_runtime_fences f WHERE id=$1`, [
      result.fenceId,
    ])
    const third = await rotate(w, `${UNIT}-3`)
    assert.equal(third.credentialRevision, 3)
    assert.deepEqual(
      await rows(`SELECT to_jsonb(f) AS j FROM sophia.research_runtime_fences f WHERE id=$1`, [result.fenceId]),
      frozen,
    )
    assert.match(await refusal(hello(w.who)), REVOKED)
    await hello(third.who)
    assert.match(
      await refusal(settle(w.who, s.at, randomUUID())),
      REVOKED,
      'the fenced generation stays refused after a new registration',
    )
  })

  it('no application role executes the fence or reads or writes its tables, whatever it sets', async () => {
    const w = await world()
    await rotate(w)
    const generation = await generationOf(w.projectId, w.resourceId)
    for (const pool of [api, worker]) {
      const c = await pool.connect()
      try {
        for (const set of [
          `SET sophia.fence_authority = 'operator'`,
          `SET app.role = 'migration_owner'`,
          `SET sophia.actor_id = '${randomUUID()}'`,
        ])
          await c.query(set)
        for (const sql of [
          [`SELECT sophia.fence_contribution_runtime($1,$2,$3)`, [w.projectId, w.resourceId, generation]],
          [`SELECT sophia.research_runtime_fence($1,$2,$3,'fence')`, [w.projectId, w.resourceId, generation]],
          [`SELECT sophia.retire_contribution_runtime($1,$2)`, [w.projectId, w.resourceId]],
          [`SELECT sophia.contribution_runtime_generation($1,$2)`, [w.projectId, w.resourceId]],
          [`SELECT * FROM sophia.research_runtime_fences`, []],
          [`SELECT * FROM sophia.research_runtime_fence_snapshots`, []],
          [
            `INSERT INTO sophia.research_runtime_fence_snapshots(fence_id,kind,encoding,row_count,digest) VALUES(gen_random_uuid(),'cause','[]',0,$1)`,
            ['c'.repeat(64)],
          ],
        ] as const)
          assert.match(await refusal(c.query(sql[0], [...sql[1]])), /42501|permission denied/)
      } finally {
        // R1: the session GUCs set above must not leak into a pooled connection a later runtime call reuses.
        c.release(true)
      }
    }
    assert.equal((await fencesOf(w.projectId)).length, 0)
    assert.deepEqual(
      (await instancesOf(w.projectId, w.resourceId)).map((i) => i.state),
      ['active'],
    )
  })
})

// --- R1 (C3F-01): the maintained goal Stop against the fence, both orders at the real project wait ----------------

/** The goal of a research task and its current revision and authority epoch, as a member's Stop names them. */
const goalOf = (taskId: string) =>
  one<{ goal_id: string; revision: string; authority_epoch: string }>(
    `SELECT wa.goal_id, g.revision, g.authority_epoch FROM sophia.jobs j
      JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
      JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id WHERE j.id=$1`,
    [taskId],
  )
const goalRow = async (goalId: string) =>
  (await one<{ j: Record<string, unknown> }>(`SELECT to_jsonb(g) AS j FROM sophia.goals g WHERE id=$1`, [goalId])).j
const changedKeys = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(b)
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .toSorted()
/** The maintained goal Stop (the persistence goal-command entry, kind 'stop'), as the requester with write access. */
async function goalStop(w: World, taskId: string) {
  const g = await goalOf(taskId)
  return withActor(api, w.REQ, 'write', (c) =>
    admitGoalCommand(c, w.projectId, randomUUID(), {
      kind: 'stop',
      goalId: g.goal_id,
      expectedGoalRevision: Number(g.revision),
      expectedAuthorityEpoch: Number(g.authority_epoch),
      bodySourceId: null,
    }),
  )
}
type Outcome = { ok: unknown } | { refused: string }
const outcomeOf = (p: Promise<unknown>): Promise<Outcome> =>
  p.then(
    (ok) => ({ ok }),
    (err: unknown) => ({ refused: chain(err) }),
  )
/** The Stop's own outbox effect (0012 admit_goal_command): one cleanup 'native.stop' row for the goal's one binding. */
const stopOutboxOf = async (commandId: string) =>
  (
    await rows<{ destination: string; cleanup: boolean }>(
      `SELECT destination, cleanup FROM sophia.outbox WHERE command_id=$1 ORDER BY destination`,
      [commandId],
    )
  ).map((o) => [o.destination, o.cleanup])
/** The goal fields the maintained Stop moves (observed in R1 probes 01/02, then pinned): running -> stopping, one epoch. */
const STOP_GOAL_CHANGES = [
  ['authority_epoch', 1, 2],
  ['state_revision', 2, 3],
  ['status', 'running', 'stopping'],
]
/** A contributed task with one OPEN tracked reservation on the world's resource, then rotated (the resource drains). */
async function stopWorld() {
  const w = await world()
  const s = await started(w)
  const r = await reserve(w.who, s.at, 'llm-open')
  await rotate(w)
  const goal = (await goalOf(s.taskId)).goal_id
  return { w, s, r, goal, generation: await generationOf(w.projectId, w.resourceId) }
}
/** The frozen fence: its row and both snapshot rows, exactly as stored. */
const frozenOf = async (fenceId: string) => ({
  fence: await rows(`SELECT to_jsonb(f) AS j FROM sophia.research_runtime_fences f WHERE id=$1`, [fenceId]),
  snapshots: await snapshotsOf(fenceId),
})
/** Replay through a NEW connection (a lost acknowledgement): the one stored result, nothing new. */
async function replayAfterReconnect(w: World, generation: string) {
  const again = new pg.Client({ connectionString: db.ownerUrl })
  await again.connect()
  try {
    return await fenceIn(again, w.projectId, w.resourceId, generation)
  } finally {
    await again.end()
  }
}
const openOf = async (fenceId: string) =>
  (
    JSON.parse((await snapshotsOf(fenceId))[1]!.encoding) as {
      reservationId: string
      state: string
      reservedUsd: number
    }[]
  ).map((o) => [o.reservationId, o.state, o.reservedUsd])

describe('C3F-01: the maintained goal Stop and the fence, both orders at the real project wait', () => {
  it('fence first: the goal Stop waits at the project row behind the open fence, then is admitted; money, evidence and the frozen fence are unchanged', async () => {
    const { w, s, r, goal, generation } = await stopWorld()
    const goalBefore = await goalRow(goal)
    const prior = await moneyAndEvidence(w.projectId)
    const op = await owner.connect()
    let result: FenceResult
    let stopped: Outcome
    try {
      await op.query('BEGIN')
      result = await fenceIn(op, w.projectId, w.resourceId, generation)
      const pending = outcomeOf(goalStop(w, s.taskId))
      const waiter = await blockedBy(await pidOf(op), 'the goal Stop')
      await atProjectWait(waiter)
      await op.query('COMMIT')
      stopped = await pending
    } catch (err) {
      await op.query('ROLLBACK')
      throw err
    } finally {
      op.release()
    }
    assert.ok('ok' in stopped, `the Stop is admitted after the fence: ${JSON.stringify(stopped)}`)
    const goalAfter = await goalRow(goal)
    // The maintained Stop changes exactly these goal fields (characterized: no refusal semantics invented).
    assert.deepEqual(
      changedKeys(goalBefore, goalAfter).map((k) => [k, goalBefore[k], goalAfter[k]]),
      STOP_GOAL_CHANGES,
    )
    assert.equal((stopped.ok as { stage: string }).stage, 'admitted')
    assert.deepEqual(await stopOutboxOf((stopped.ok as { commandId: string }).commandId), [['native.stop', true]])
    assert.deepEqual(
      await moneyAndEvidence(w.projectId),
      prior,
      'neither the Stop nor the fence moves money or evidence',
    )
    assert.deepEqual(await openOf(result.fenceId), [[r.reservationId, 'reserved', 0.1]], 'the open exposure, frozen')
    const frozen = await frozenOf(result.fenceId)
    assert.deepEqual(await replayAfterReconnect(w, generation), result, 'replay after the Stop, on a new connection')
    assert.deepEqual(await frozenOf(result.fenceId), frozen, 'the frozen fence and snapshots never change')
    assert.equal((await fencesOf(w.projectId)).length, 1)
    assert.match(await refusal(settle(w.who, s.at, r.reservationId)), REVOKED, 'the fenced generation stays refused')
  })

  it('Stop first: the fence queues behind the goal Stop at the project row, then snapshots the post-Stop state; money and evidence are unchanged', async () => {
    const { w, s, r, goal, generation } = await stopWorld()
    const goalBefore = await goalRow(goal)
    const prior = await moneyAndEvidence(w.projectId)
    const holder = await owner.connect()
    const fencer = await owner.connect()
    let stopped: Outcome
    let fenced: { ok: unknown } | { refused: string }
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [w.projectId])
      const h = await pidOf(holder)
      const pendingStop = outcomeOf(goalStop(w, s.taskId))
      const stopper = await blockedBy(h, 'the goal Stop')
      await atProjectWait(stopper)
      const pendingFence = outcomeOf(fenceIn(fencer, w.projectId, w.resourceId, generation))
      await blockedBy(stopper, 'the fence (queued behind the goal Stop at the projects row)')
      await holder.query('COMMIT')
      stopped = await pendingStop
      fenced = await pendingFence
    } finally {
      await holder.query('ROLLBACK')
      await fencer.query('ROLLBACK')
      holder.release()
      fencer.release()
    }
    assert.ok('ok' in stopped, `the Stop is admitted first: ${JSON.stringify(stopped)}`)
    assert.ok('ok' in fenced, `the fence follows: ${JSON.stringify(fenced)}`)
    assert.equal((stopped.ok as { stage: string }).stage, 'admitted')
    assert.deepEqual(await stopOutboxOf((stopped.ok as { commandId: string }).commandId), [['native.stop', true]])
    const result = fenced.ok as FenceResult
    const goalAfter = await goalRow(goal)
    // The maintained Stop changes exactly these goal fields (characterized: no refusal semantics invented).
    assert.deepEqual(
      changedKeys(goalBefore, goalAfter).map((k) => [k, goalBefore[k], goalAfter[k]]),
      STOP_GOAL_CHANGES,
    )
    assert.deepEqual(
      await moneyAndEvidence(w.projectId),
      prior,
      'neither the Stop nor the fence moves money or evidence',
    )
    assert.deepEqual(
      await openOf(result.fenceId),
      [[r.reservationId, 'reserved', 0.1]],
      'the post-Stop exposure, frozen',
    )
    assert.equal(result.unresolvedReservations, 1, 'the 0094 count')
    const frozen = await frozenOf(result.fenceId)
    assert.deepEqual(await replayAfterReconnect(w, generation), result)
    assert.deepEqual(await frozenOf(result.fenceId), frozen)
    assert.deepEqual(await retireContributionRuntime(owner, w.projectId, w.resourceId), {
      resourceId: w.resourceId,
      unresolvedReservations: 1,
    })
    assert.equal((await fencesOf(w.projectId)).length, 1)
  })
})
