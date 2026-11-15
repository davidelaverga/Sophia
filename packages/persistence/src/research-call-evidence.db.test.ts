// INC04-S03A-R07-C2A (0109): durable original-scope call evidence and its bounded, sticky restriction of new paid work,
// level: sql-run on real PostgreSQL with the production split (sophia_api with a transaction-local actor or as the
// service, sophia_worker dispatch, the migration owner as operator). Real admission, dispatch, reservation and settlement
// functions; two-client cases hold a real transaction open. No provider is called: every account, grant, qualification
// and token is SYNTHETIC, and the design and review attempts on a contributed lineage are LABELLED SYNTHETIC fixtures
// (maintained creation does not reach them cheaply here); nothing qualifies a real account, route, provider or bill.
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitGoalCommand,
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  previewContributionAct,
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
  runtimeTokenHash,
  submitContribution,
  withActor,
  withdrawContribution,
  withService,
  type RuntimeCaller,
} from './index.ts'
import {
  ContributionRefusal,
  contributionRefusalOf,
  createApiAccount,
  createApiConnection,
  createContributionGrant,
  qualifyApiAccount,
  registerContributionRuntime,
  revokeApiAccountQualification,
  setContributionGrantState,
  setResearchFundingPin,
  updateApiAccount,
  type AccountProtection,
} from './api-contributions.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let ownerPool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 10 })
  worker = createPool(db.workerUrl, { max: 2 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
  await ownerPool.query(
    `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`,
  )
})
after(async () => {
  await api.end()
  await worker.end()
  await ownerPool.end()
  await db.drop()
})

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const NONE_APPLICABLE: AccountProtection = {
  applicability: 'none_applicable',
  operations: ['research'],
  roles: ['sophia-research-md-v1'],
}
const UNIT = 'sophia-runtime-test'
const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await ownerPool.query(sql, params)).rows[0] as T
const rows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await ownerPool.query(sql, params)).rows as T[]
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function codeOfError(err: unknown): string {
  if (err instanceof ContributionRefusal) return err.refusal
  if (err instanceof DomainError) return contributionRefusalOf(err.cause)?.refusal ?? err.code
  return contributionRefusalOf(err)?.refusal ?? `raw:${String(err)}`
}
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return codeOfError(err)
  }
}
const settledFlag = <T>(p: Promise<T>) => {
  const s = { settled: false }
  void p.then(
    () => (s.settled = true),
    () => (s.settled = true),
  )
  return s
}

const callerOf = (token: string, unit: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: unit,
  bridgeInstanceId: randomUUID(),
})
async function bringUp(who: RuntimeCaller) {
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
}
const qualify = (connectionId: string, expiresAt = new Date(Date.now() + 86400_000)) =>
  qualifyApiAccount(ownerPool, {
    connectionId,
    operations: ['research'],
    verification: 'operator_verified_call',
    evidenceRef: 'synthetic: not a live account qualification',
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: expiresAt.toISOString(),
  })

/**
 * A project with an enabled research gate and a ready legacy runtime (`legacy`); an owner with an account (or, with
 * `owner`, that owner's existing account: the same account in another project), a connection, a grant to it, a
 * connected and qualified contribution runtime (`who`); a requester. All SYNTHETIC.
 */
async function world(o: { owner?: string; accountCap?: number; qualifiedUntil?: Date } = {}) {
  const OWNER = o.owner ?? randomUUID()
  const REQ = randomUUID()
  const ADMIN = randomUUID()
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [] })
  await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const reg = await registerRuntime(db.ownerUrl, { projectId, admin: ADMIN })
  const legacy = callerOf(reg.token, reg.runtimeUnitId)
  await bringUp(legacy)
  let account: string
  if (o.owner) {
    account = (
      await one<{ id: string }>(
        `SELECT id FROM sophia.api_accounts WHERE owner_id=$1 AND separate_ownership_note IS NULL`,
        [OWNER],
      )
    ).id
  } else {
    account = (
      await withActor(api, OWNER, 'write', (c) =>
        createApiAccount(c, {
          label: 'My API',
          totalCapUsd: o.accountCap ?? 10,
          concurrency: 3,
          provenance: 'owner_declared',
        }),
      )
    ).accountId
    await withActor(api, OWNER, 'write', (c) => updateApiAccount(c, account, 1, { protection: NONE_APPLICABLE }))
  }
  const conn = await withActor(api, OWNER, 'write', (c) =>
    createApiConnection(c, account, 'Research key', 'Operator host'),
  )
  const accountTotal = Number(
    (await one<{ t: string }>(`SELECT total_cap_usd AS t FROM sophia.api_accounts WHERE id=$1`, [account])).t,
  )
  const grantId = (
    await withActor(api, OWNER, 'write', (c) =>
      createContributionGrant(c, conn.connectionId, projectId, {
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        taskCapUsd: 2,
        totalCapUsd: Math.min(5, accountTotal),
        fundingPolicy: 'bounded_total_spend',
        fundingAcknowledgementRef: 'synthetic acknowledgement',
      }),
    )
  ).grantId
  const token = randomUUID() + randomUUID()
  await registerContributionRuntime(ownerPool, {
    projectId,
    connectionId: conn.connectionId,
    runtimeUnitId: UNIT,
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: false,
  })
  const who = callerOf(token, UNIT)
  await bringUp(who)
  await qualify(conn.connectionId, o.qualifiedUntil)
  return { projectId, OWNER, REQ, ADMIN, account, connectionId: conn.connectionId, grantId, who, legacy, token }
}
type World = Awaited<ReturnType<typeof world>>

const grantRevision = async (w: World) =>
  Number(
    (await one<{ r: string }>(`SELECT revision AS r FROM sophia.api_contribution_grants WHERE id=$1`, [w.grantId])).r,
  )
const pin = async (w: World) =>
  withActor(api, w.REQ, 'write', async (c) => setResearchFundingPin(c, w.projectId, w.grantId, await grantRevision(w)))
const ask = (w: World) =>
  withActor(api, w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
async function admitted(w: World) {
  const r = await ask(w)
  assert.ok('admitted' in r, JSON.stringify(r))
  return r.admitted
}
async function dispatchAll() {
  for (const row of await claimRuntimeOutbox(worker, 'c2a-worker', 50, 30))
    await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
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
/** A contributed (pinned) research task delivered to its contribution runtime. */
async function started(w: World) {
  await pin(w)
  const r = await admitted(w)
  await dispatchAll()
  return { taskId: r.taskId, at: await deliver(w.who, r.attemptId) }
}
/** A project-funded (unpinned) research task delivered to the legacy runtime: a genuinely account-null scope. */
async function projectFunded(w: World) {
  const r = await admitted(w)
  await dispatchAll()
  const job = await one<{ state: string; reason: string | null }>(`SELECT state, reason FROM sophia.jobs WHERE id=$1`, [
    r.taskId,
  ])
  assert.deepEqual(job, { state: 'pending', reason: null }, 'dispatched to the legacy runtime')
  return { taskId: r.taskId, at: await deliver(w.legacy, r.attemptId) }
}

type Contract = 'c1p_complete_report' | 'legacy_report'
const tracked = (contract: Contract = 'c1p_complete_report') => ({
  mode: 'tracked_v1' as const,
  contract,
  declared: {
    routeId: 'research-sol-medium-v1',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'medium',
    prices: { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 },
  },
})
type Ask2 = { amountUsd?: number; mode?: object }
const reserveIn = (c: pg.PoolClient, who: RuntimeCaller, at: At, callId: string, o: Ask2 = {}) =>
  runtimeResearchReserve(c, who, {
    ...at,
    callId,
    kind: 'model',
    provider: 'openai-research',
    amountUsd: o.amountUsd ?? 0.1,
    ...(o.mode ?? tracked()),
  })
const reserve = (who: RuntimeCaller, at: At, callId: string, amountUsd = 0.1, mode: object = tracked()) =>
  service((c) => reserveIn(c, who, at, callId, { amountUsd, mode }))

const known = (value: number) => ({ class: 'known' as const, value })
const UNKNOWN = { class: 'unknown' as const }
type Facts = {
  output?: number
  input?: number
  id?: unknown
  cost?: number
  report?: 'complete_report' | 'not_complete'
  contract?: Contract
  correlation?: string
}
/** The id evidence of a fact set: a string is a supported id, a non-string an unsupported one, none unknown. */
function idEvidence(f: Facts) {
  if (f.id === undefined) return { status: 'unknown' as const }
  if (typeof f.id === 'string') return { status: 'supported' as const, value: f.id }
  return {
    status: 'identity_unsupported' as const,
    reason: 'over_bound' as const,
    ...(f.correlation ? { correlation: f.correlation } : {}),
  }
}
const COMPLETE_COUNTS = (f: Facts) => ({
  nonCachedInput: known(f.input ?? 3),
  cacheRead: known(0),
  cacheWrite: { class: 'no_separate_reported_class' as const },
  output: known(f.output ?? 4),
})
const UNKNOWN_COUNTS = { nonCachedInput: UNKNOWN, cacheRead: UNKNOWN, cacheWrite: UNKNOWN, output: UNKNOWN }
/** A tracked settlement's body: complete facts (default) or not_complete, with its id evidence. */
function evidenceBody(at: At, reservationId: string, f: Facts = {}) {
  const complete = (f.report ?? 'complete_report') === 'complete_report'
  const money = complete
    ? {
        outcome: 'settled' as const,
        costUsd: f.cost ?? 0.01,
        usage: { inputTokens: f.input ?? 3, outputTokens: f.output ?? 4 },
      }
    : { outcome: 'uncertain' as const }
  return {
    ...at,
    reservationId,
    ...money,
    evidence: {
      contract: f.contract ?? ('c1p_complete_report' as const),
      report: complete ? ('complete_report' as const) : ('not_complete' as const),
      counts: complete ? COMPLETE_COUNTS(f) : UNKNOWN_COUNTS,
      ending: 'stream_completed' as const,
      responseId: idEvidence(f),
    },
  }
}
/** The evidence a tracked settlement was answered with (present for every tracked one). */
function ev(reply: { evidence?: { disposition: string; replay: boolean; capped: boolean; digest: string } }) {
  assert.ok(reply.evidence, 'a tracked settlement answers its evidence disposition')
  return reply.evidence
}
const corr = (n: number) =>
  createHash('sha256')
    .update(`c${String(n)}`)
    .digest('hex')
const settleIn = (c: pg.PoolClient, who: RuntimeCaller, at: At, reservationId: string, f: Facts = {}) =>
  runtimeResearchSettle(c, who, evidenceBody(at, reservationId, f))
const settle = (who: RuntimeCaller, at: At, reservationId: string, f: Facts = {}) =>
  service((c) => settleIn(c, who, at, reservationId, f))

const allowanceOf = (taskId: string) =>
  one<{ spent: string; uncertain: string; reserved: string; id: string }>(
    `SELECT a.id, a.spent_usd AS spent, a.uncertain_usd AS uncertain, a.reserved_usd AS reserved FROM sophia.research_tasks t
      JOIN sophia.research_allowances a ON a.project_id=t.project_id AND a.id=t.allowance_id WHERE t.job_id=$1`,
    [taskId],
  )
const guardOf = async (account: string) =>
  (
    await rows<{ restricted: boolean }>(`SELECT restricted FROM sophia.research_evidence_guards WHERE account_id=$1`, [
      account,
    ])
  )[0]?.restricted ?? null
const truthOf = (reservationId: string) =>
  one<Record<string, unknown>>(`SELECT * FROM sophia.research_call_truth WHERE reservation_id=$1`, [reservationId])
const reservationOf = (reservationId: string) =>
  one<{ state: string; settled_usd: string | null; usage: unknown; provider_request_id: string | null }>(
    `SELECT state, settled_usd, usage, provider_request_id FROM sophia.research_reservations WHERE id=$1`,
    [reservationId],
  )

describe('C2A identity: a tracked reservation freezes its original scope and answers its closed call binding (C01)', () => {
  it('echoes this exact call from the authenticated rows and freezes the original payer, grant, credential and qualification', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-a')
    assert.deepEqual(r.binding, {
      mode: 'tracked_v1',
      contract: 'c1p_complete_report',
      evidenceId: r.binding?.evidenceId,
      callId: 'llm-a',
      attemptId: s.at.attemptId,
      nativeSessionId: s.at.nativeSessionId,
      projectId: w.projectId,
      runtimeUnitId: UNIT,
      // REPAIR-001 (F03): the executor resource the authenticated execution binding froze.
      resourceId: (
        await one<{ r: string }>(`SELECT resource_id AS r FROM sophia.execution_bindings WHERE attempt_id=$1`, [
          s.at.attemptId,
        ])
      ).r,
    })
    assert.match(r.binding?.evidenceId ?? '', /^[0-9a-f-]{36}$/)
    const q = await one<{ id: string; revision: string }>(
      `SELECT id, revision FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w.connectionId],
    )
    const i = await one<Record<string, unknown>>(
      `SELECT * FROM sophia.research_call_identities WHERE reservation_id=$1`,
      [r.reservationId],
    )
    assert.deepEqual(
      [
        i.mode,
        i.contract,
        i.operation,
        i.payer,
        i.account_id,
        i.grant_id,
        i.connection_id,
        i.qualification_id,
        String(i.qualification_revision),
        i.call_id,
        i.attempt_id,
        i.native_session_id,
        i.runtime_unit_id,
        i.route_id,
        i.provider,
      ],
      [
        'tracked_v1',
        'c1p_complete_report',
        'research',
        'contributor_api_account',
        w.account,
        w.grantId,
        w.connectionId,
        q.id,
        q.revision,
        'llm-a',
        s.at.attemptId,
        s.at.nativeSessionId,
        UNIT,
        'research-sol-medium-v1',
        'openai-research',
      ],
    )
    assert.equal(await guardOf(w.account), false, 'the guard was initialized under the account row, unrestricted')
    // The identity is frozen: no edit, even by the migration owner.
    await assert.rejects(
      ownerPool.query(`UPDATE sophia.research_call_identities SET contract='legacy_report' WHERE reservation_id=$1`, [
        r.reservationId,
      ]),
      (e: { code?: string }) => e.code === '55000',
    )
    // An exact replay answers the same binding; a changed mode, contract or declared basis is another reservation.
    assert.deepEqual((await reserve(w.who, s.at, 'llm-a')).binding, r.binding)
    assert.equal(await codeOf(reserve(w.who, s.at, 'llm-a', 0.1, tracked('legacy_report'))), 'idempotency_conflict')
    assert.equal(await codeOf(reserve(w.who, s.at, 'llm-a', 0.1, {})), 'idempotency_conflict')
    assert.equal(
      await codeOf(
        reserve(w.who, s.at, 'llm-a', 0.1, { ...tracked(), declared: { ...tracked().declared, model: 'gpt-x' } }),
      ),
      'idempotency_conflict',
    )
  })

  it('keeps a legacy reservation legacy (no binding, no facts) and refuses to mix the two', async () => {
    const w = await world()
    const s = await started(w)
    const legacyReserve = await reserve(w.who, s.at, 'llm-l', 0.1, {})
    assert.equal('binding' in legacyReserve, false)
    assert.equal(
      await codeOf(settle(w.who, s.at, legacyReserve.reservationId)),
      'invalid_request',
      'a legacy reservation settles without evidence',
    )
    const plain = await service((c) =>
      runtimeResearchSettle(c, w.who, {
        ...s.at,
        reservationId: legacyReserve.reservationId,
        outcome: 'settled',
        costUsd: 0.02,
      }),
    )
    assert.deepEqual(plain, { reservationId: legacyReserve.reservationId, state: 'settled', settledUsd: 0.02 })
    // The legacy boundary is byte-unchanged (0029): the same cost again with other usage is a silent no-op that keeps
    // no record. Only a tracked reservation retains such a difference as a conflict.
    const again = await service((c) =>
      runtimeResearchSettle(c, w.who, {
        ...s.at,
        reservationId: legacyReserve.reservationId,
        outcome: 'settled',
        costUsd: 0.02,
        usage: { inputTokens: 9 },
      }),
    )
    assert.deepEqual(again, plain)
    assert.equal(
      (await rows(`SELECT 1 FROM sophia.research_call_truth WHERE reservation_id=$1`, [legacyReserve.reservationId]))
        .length,
      0,
    )
    const t = await reserve(w.who, s.at, 'llm-t')
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSettle(c, w.who, {
            ...s.at,
            reservationId: t.reservationId,
            outcome: 'settled',
            costUsd: 0.01,
          }),
        ),
      ),
      'invalid_request',
      'a tracked settlement cannot opt out',
    )
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchSettle(c, w.who, { ...evidenceBody(s.at, t.reservationId), providerRequestId: 'req_x' }),
        ),
      ),
      'invalid_request',
    )
    assert.equal(
      (await reservationOf(t.reservationId)).state,
      'reserved',
      'a refused settlement leaves the original commitment',
    )
  })
})

describe('C2A facts: monotone truth on the one ledger; conflicts are retained, raise nothing and change no money', () => {
  it('settles complete facts once; an exact replay returns its stored disposition; the same USD with other counts conflicts', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    const first = await settle(w.who, s.at, r.reservationId, { id: 'resp_1', cost: 0.01 })
    assert.equal(ev(first).disposition, 'accepted')
    assert.equal(first.state, 'settled')
    const money = await allowanceOf(s.taskId)
    const again = await settle(w.who, s.at, r.reservationId, { id: 'resp_1', cost: 0.01 })
    assert.deepEqual([ev(again).disposition, ev(again).replay, ev(again).digest], ['accepted', true, ev(first).digest])
    const conflict = await settle(w.who, s.at, r.reservationId, { id: 'resp_1', cost: 0.01, output: 9 })
    assert.deepEqual([ev(conflict).disposition, ev(conflict).replay], ['conflict', false])
    assert.deepEqual(await allowanceOf(s.taskId), money, 'no respending and no money change')
    const truth = await truthOf(r.reservationId)
    assert.deepEqual(
      [String(truth.output), truth.first_conflict_reason, truth.response_id],
      ['4', 'count_changed', 'resp_1'],
      'the known truth is kept; the first conflict is retained',
    )
    assert.equal(await guardOf(w.account), true, 'the account is restricted')
    const r2 = await reservationOf(r.reservationId)
    assert.equal(r2.provider_request_id, null, 'no raw id in the legacy field')
    assert.equal(JSON.stringify(r2.usage).includes('resp_1'), false, 'no raw id in the legacy usage')
    // The guard cannot be cleared, by anyone.
    await assert.rejects(
      ownerPool.query(
        `UPDATE sophia.research_evidence_guards SET restricted=false, restricted_at=NULL, first_reservation_id=NULL, first_project_id=NULL WHERE account_id=$1`,
        [w.account],
      ),
      (e: { code?: string }) => e.code === '55000',
    )
  })

  it('extends unknown -> known once (uncertain -> settled), and an id learnt later spends nothing', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1', 0.2)
    assert.equal((await settle(w.who, s.at, r.reservationId, { report: 'not_complete' })).state, 'uncertain')
    assert.equal(Number((await allowanceOf(s.taskId)).uncertain), 0.2)
    const ext = await settle(w.who, s.at, r.reservationId, { cost: 0.03 })
    assert.deepEqual([ev(ext).disposition, ext.state, ext.settledUsd], ['extended', 'settled', 0.03])
    const a = await allowanceOf(s.taskId)
    assert.deepEqual(
      [Number(a.spent), Number(a.uncertain)],
      [0.03, 0],
      'the late known money moved the commitment once',
    )
    const idOnly = await settle(w.who, s.at, r.reservationId, { cost: 0.03, id: 'resp_late' })
    assert.equal(ev(idOnly).disposition, 'extended')
    assert.deepEqual(await allowanceOf(s.taskId), a, 'an identity-only extension spends nothing')
    assert.equal((await truthOf(r.reservationId)).response_id, 'resp_late')
    assert.equal(await guardOf(w.account), false)
  })

  it('bounds history at 16, extends the truth after the cap once, keeps the first overflow and the first conflict apart', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-cap', 0.3)
    const at = s.at
    assert.equal(ev(await settle(w.who, at, r.reservationId, { report: 'not_complete' })).disposition, 'accepted')
    const dispositions = []
    for (let n = 1; n <= 15; n++)
      dispositions.push(
        ev(await settle(w.who, at, r.reservationId, { report: 'not_complete', id: 42, correlation: corr(n) }))
          .disposition,
      )
    assert.deepEqual(dispositions, ['extended', ...Array(14).fill('subsumed')])
    assert.equal(Number((await truthOf(r.reservationId)).history_count), 16)
    // After the cap: a valid complete extension still updates the truth and the money exactly once.
    const post = await settle(w.who, at, r.reservationId, { cost: 0.05, id: 42, correlation: corr(99) })
    assert.deepEqual(
      [ev(post).disposition, ev(post).capped, post.state, post.settledUsd],
      ['extended', true, 'settled', 0.05],
    )
    const truth = await truthOf(r.reservationId)
    assert.equal(truth.first_overflow_digest, ev(post).digest, 'the first overflow is the valid extension')
    assert.equal(truth.first_conflict_digest, null, 'and it is not a conflict')
    const repeat = await settle(w.who, at, r.reservationId, { cost: 0.05, id: 42, correlation: corr(99) })
    assert.deepEqual(
      [ev(repeat).disposition, ev(repeat).replay, ev(repeat).capped],
      ['capped', false, true],
      'an unretained post-cap repeat is stably capped: no respending',
    )
    assert.equal(Number((await allowanceOf(s.taskId)).spent), 0.05)
    // Then the first actual conflict, after the cap: retained separately, write-once; the known truth unchanged.
    const conflict = await settle(w.who, at, r.reservationId, { cost: 0.05, id: 42, correlation: corr(99), output: 7 })
    assert.deepEqual([ev(conflict).disposition, ev(conflict).capped], ['conflict', true])
    const later = await settle(w.who, at, r.reservationId, { cost: 0.06, id: 42, correlation: corr(99) })
    assert.equal(ev(later).disposition, 'conflict')
    const truthAfter = await truthOf(r.reservationId)
    assert.deepEqual(
      [
        truthAfter.first_conflict_digest,
        truthAfter.first_overflow_digest,
        String(truthAfter.output),
        String(truthAfter.cost_usd),
      ],
      [ev(conflict).digest, ev(post).digest, '4', '0.050000'],
    )
    // A retained input replays its ORIGINAL disposition even after the truth moved on; an unretained one is stable.
    const retained = await settle(w.who, at, r.reservationId, { report: 'not_complete', id: 42, correlation: corr(5) })
    assert.deepEqual([ev(retained).disposition, ev(retained).replay], ['subsumed', true])
    const unretained = await settle(w.who, at, r.reservationId, {
      report: 'not_complete',
      id: 42,
      correlation: corr(77),
    })
    assert.deepEqual([ev(unretained).disposition, ev(unretained).capped], ['capped', true])
    assert.equal(Number((await truthOf(r.reservationId)).history_count), 16, 'nothing grew past the cap')
    assert.equal(Number((await allowanceOf(s.taskId)).spent), 0.05, 'money moved once')
  })

  it('keeps late known facts after the grant is revoked and after the qualification is revoked', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-late', 0.1)
    await withActor(api, w.OWNER, 'write', async (c) =>
      setContributionGrantState(c, w.grantId, await grantRevision(w), 'revoked'),
    )
    const q = await one<{ id: string }>(
      `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w.connectionId],
    )
    await revokeApiAccountQualification(ownerPool, q.id, 'synthetic revocation')
    const late = await settle(w.who, s.at, r.reservationId, { cost: 0.02, id: 'resp_late' })
    assert.deepEqual([ev(late).disposition, late.state], ['accepted', 'settled'])
    assert.equal(await codeOf(reserve(w.who, s.at, 'llm-new')), 'grant_revoked', 'while new paid work is refused')
  })
})

describe('C2A restriction: the original account (or the allowance alone) restricts NEW paid work; settlement stays available', () => {
  it('restricts a new admission in ANOTHER project of the same account', async () => {
    const w = await world()
    const other = await world({ owner: w.OWNER })
    const s = await started(w)
    await pin(other)
    const r = await reserve(w.who, s.at, 'llm-1')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    await settle(w.who, s.at, r.reservationId, { cost: 0.01, output: 99 })
    assert.equal(await codeOf(ask(other)), 'evidence_conflict_unreconciled')
    assert.equal(
      Number(
        (
          await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.research_tasks WHERE project_id=$1`, [
            other.projectId,
          ])
        ).n,
      ),
      0,
    )
  })

  it('restricts a new model call (tracked or legacy) and a queued dispatch in ANOTHER project of the same account', async () => {
    const w = await world()
    const other = await world({ owner: w.OWNER })
    const third = await world({ owner: w.OWNER })
    const s = await started(w)
    const o = await started(other)
    await pin(third)
    const queued = await admitted(third) // admitted before the conflict, dispatched after it (a normal-funded create)
    const r = await reserve(w.who, s.at, 'llm-1')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    const earlier = await reserve(other.who, o.at, 'llm-before')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01, output: 99 })
    assert.equal(await guardOf(w.account), true)
    assert.equal(await codeOf(reserve(other.who, o.at, 'llm-after')), 'evidence_conflict_unreconciled')
    assert.equal(
      await codeOf(reserve(other.who, o.at, 'llm-after-legacy', 0.1, {})),
      'evidence_conflict_unreconciled',
      'a legacy caller too',
    )
    await dispatchAll()
    const job = await one<{ state: string; reason: string | null }>(
      `SELECT state, reason FROM sophia.jobs WHERE id=$1`,
      [queued.taskId],
    )
    assert.equal(job.state, 'cancelled')
    assert.match(
      job.reason ?? '',
      /evidence_conflict_unreconciled/,
      'the normal-funded queued create is denied at its dispatch',
    )
    // A call reserved before the conflict still settles (late facts stay available), and a replay is not new work.
    assert.equal(ev(await settle(other.who, o.at, earlier.reservationId, { cost: 0.01 })).disposition, 'accepted')
    assert.deepEqual((await reserve(other.who, o.at, 'llm-before')).binding?.callId, 'llm-before')
  })

  it('an account-null project-funded call restricts only its own allowance', async () => {
    const w = await world()
    const a = await projectFunded(w)
    const r = await reserve(w.legacy, a.at, 'llm-p')
    const i = await one<{ payer: string; account_id: string | null }>(
      `SELECT payer, account_id FROM sophia.research_call_identities WHERE reservation_id=$1`,
      [r.reservationId],
    )
    assert.deepEqual([i.payer, i.account_id], ['project', null])
    await settle(w.legacy, a.at, r.reservationId, { cost: 0.01 })
    await settle(w.legacy, a.at, r.reservationId, { cost: 0.02 })
    const allowance = await allowanceOf(a.taskId)
    assert.equal(
      (await rows(`SELECT 1 FROM sophia.research_allowance_restrictions WHERE allowance_id=$1`, [allowance.id])).length,
      1,
    )
    assert.equal(await codeOf(reserve(w.legacy, a.at, 'llm-p2')), 'evidence_conflict_unreconciled')
    assert.equal(await guardOf(w.account), null, 'no account-wide guard was touched')
    // The project's research worker takes one task at a time: end this one, then a new lineage (a new allowance).
    await service((c) =>
      runtimeResearchSubmit(c, w.legacy, { ...a.at, callId: 'end', blocker: { reason: 'ended for the test' } }),
    )
    const b = await projectFunded(w)
    assert.notEqual((await allowanceOf(b.taskId)).id, allowance.id)
    assert.ok((await reserve(w.legacy, b.at, 'llm-q')).binding, 'another allowance is not restricted')
  })
})

describe('C2A serialization: two real connections; the guard is read after every wait, and nothing deadlocks', () => {
  it('a conflict committed while a new model call waits on the guard refuses that call (different projects, one account)', async () => {
    const w = await world()
    const other = await world({ owner: w.OWNER })
    const s = await started(w)
    const o = await started(other)
    const r = await reserve(w.who, s.at, 'llm-1')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    const writer = await api.connect()
    const reader = await api.connect()
    try {
      await writer.query('BEGIN')
      await settleIn(writer, w.who, s.at, r.reservationId, { cost: 0.01, output: 50 }) // holds the guard update
      await reader.query('BEGIN')
      const waiting = codeOf(reserveIn(reader, other.who, o.at, 'llm-wait'))
      const flag = settledFlag(waiting)
      await sleep(600)
      assert.equal(flag.settled, false, 'the new call waits on the guard')
      await writer.query('COMMIT')
      assert.equal(await waiting, 'evidence_conflict_unreconciled', 'read after the wait')
      await reader.query('ROLLBACK')
    } finally {
      writer.release()
      reader.release()
    }
  })

  it('a conflict writer waits for a new call holding the guard, then records its conflict (no deadlock, nothing lost)', async () => {
    const w = await world()
    const other = await world({ owner: w.OWNER })
    const s = await started(w)
    const o = await started(other)
    const r = await reserve(w.who, s.at, 'llm-1')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    const reader = await api.connect()
    const writer = await api.connect()
    try {
      await reader.query('BEGIN')
      const fresh = await reserveIn(reader, other.who, o.at, 'llm-first') // holds the guard FOR SHARE
      assert.ok(fresh.binding)
      await writer.query('BEGIN')
      const conflict = settleIn(writer, w.who, s.at, r.reservationId, { cost: 0.01, output: 51 })
      const flag = settledFlag(conflict)
      await sleep(600)
      assert.equal(flag.settled, false, 'the guard is written last, after the reader')
      await reader.query('COMMIT')
      assert.equal(ev(await conflict).disposition, 'conflict')
      await writer.query('COMMIT')
    } finally {
      reader.release()
      writer.release()
    }
    assert.equal(await guardOf(w.account), true)
    assert.equal(
      (
        await reservationOf(
          (
            await rows<{ id: string }>(
              `SELECT r.id FROM sophia.research_reservations r WHERE r.reservation_key LIKE '%:llm-first'`,
            )
          )[0]!.id,
        )
      ).state,
      'reserved',
      'the earlier call keeps its commitment',
    )
  })

  it('a qualification revoked while a new call waits on the account row refuses it after the wait', async () => {
    const w = await world()
    const s = await started(w)
    const holder = await ownerPool.connect()
    const reader = await api.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.api_accounts WHERE id=$1 FOR UPDATE`, [w.account])
      await reader.query('BEGIN')
      const waiting = codeOf(reserveIn(reader, w.who, s.at, 'llm-q'))
      await sleep(400)
      const q = await one<{ id: string }>(
        `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
        [w.connectionId],
      )
      await revokeApiAccountQualification(ownerPool, q.id, 'synthetic revocation during the wait')
      await holder.query('COMMIT')
      assert.equal(await waiting, 'account_unqualified')
      await reader.query('ROLLBACK')
    } finally {
      holder.release()
      reader.release()
    }
  })
})

describe('C2A all three wrappers: design and review derive the original funding from authoritative rows (C02)', () => {
  /**
   * LABELLED SYNTHETIC FIXTURE: a design (or source review) attempt on the runtime of the research attempt `s`, sharing
   * the research lineage's allowance (design) or an independent project allowance (review), inserted by the migration
   * owner with triggers off. It stands for a lineage maintained creation would reach only through a published artifact.
   */
  async function syntheticAttempt(
    w: World,
    s: { taskId: string; at: At },
    kind: 'design' | 'source_review',
  ): Promise<At> {
    const c = await ownerPool.connect()
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
            seq: Number(row.command.seq) + 1000,
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
  const designReserve = (w: World, who: RuntimeCaller, at: At, callId: string, mode: object = tracked()) =>
    service((c) =>
      runtimeDesignReserve(c, who, {
        ...at,
        callId,
        kind: 'model',
        provider: 'openai-research',
        amountUsd: 0.1,
        purpose: 'call',
        ...mode,
      }),
    )

  it('an account-backed design (sharing a contributed lineage allowance) reaches the original account gate and is restricted by it', async () => {
    const w = await world()
    const s = await started(w)
    const at = await syntheticAttempt(w, s, 'design')
    const d = await designReserve(w, w.who, at, 'llm-d1')
    const i = await one<{ payer: string; account_id: string; operation: string; route_id: string }>(
      `SELECT payer, account_id, operation, route_id FROM sophia.research_call_identities WHERE reservation_id=$1`,
      [d.reservationId],
    )
    assert.deepEqual(
      [i.payer, i.account_id, i.operation, i.route_id],
      ['contributor_api_account', w.account, 'design', 'research-sol-medium-v1'],
    )
    assert.equal(
      (await rows(`SELECT 1 FROM sophia.api_contribution_reservations WHERE reservation_id=$1`, [d.reservationId]))
        .length,
      1,
      'counted on the contributor ledger',
    )
    assert.equal(
      ev(await service((c) => runtimeDesignSettle(c, w.who, evidenceBody(at, d.reservationId, { cost: 0.01 }))))
        .disposition,
      'accepted',
    )
    // A conflict on the research call of the same account restricts the design's next paid call.
    const r = await reserve(w.who, s.at, 'llm-r')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    await settle(w.who, s.at, r.reservationId, { cost: 0.01, output: 77 })
    assert.equal(await codeOf(designReserve(w, w.who, at, 'llm-d2')), 'evidence_conflict_unreconciled')
    assert.equal(
      await codeOf(designReserve(w, w.who, at, 'llm-d3', {})),
      'evidence_conflict_unreconciled',
      'legacy design callers too',
    )
  })

  it('an account-backed review on another provider is refused before any effect; an account-null review is tracked and restricted alone', async () => {
    const w = await world()
    const s = await started(w)
    const reviewReserve = (who: RuntimeCaller, at: At, callId: string) =>
      service((c) =>
        runtimeSourceReviewReserve(c, who, {
          ...at,
          callId,
          kind: 'model',
          provider: 'openai-review',
          amountUsd: 0.1,
          purpose: 'call',
          ...tracked(),
        }),
      )
    // Account-null review (its own project allowance): tracked as project-funded.
    const at = await syntheticAttempt(w, s, 'source_review')
    const rv = await reviewReserve(w.who, at, 'llm-v1')
    const i = await one<{ payer: string; operation: string; route_id: string }>(
      `SELECT payer, operation, route_id FROM sophia.research_call_identities WHERE reservation_id=$1`,
      [rv.reservationId],
    )
    assert.deepEqual([i.payer, i.operation, i.route_id], ['project', 'source_review', 'source-review-luna-high-v1'])
    // Account-backed review (SYNTHETIC: the review allowance pointed at the contributed lineage's): refused.
    const contributed = await allowanceOf(s.taskId)
    await ownerPool.query(`UPDATE sophia.work_items SET allowance_id=$2 WHERE project_id=$1 AND allowance_id<>$2`, [
      w.projectId,
      contributed.id,
    ])
    assert.equal(await codeOf(reviewReserve(w.who, at, 'llm-v2')), 'provider_not_contributed')
  })
})

// --- REPAIR-001: the formal findings C2A-F01/F02/F03 and the finite proofs C02-02..04 ----------------------------------

/** Sixteen retained inputs and no conflict: a not_complete one (accepted), then 15 distinct unsupported-id ones. */
async function fillCap(who: RuntimeCaller, at: At, reservationId: string) {
  assert.equal(ev(await settle(who, at, reservationId, { report: 'not_complete' })).disposition, 'accepted')
  for (let n = 1; n <= 15; n++)
    await settle(who, at, reservationId, { report: 'not_complete', id: 42, correlation: corr(n) })
  const truth = await truthOf(reservationId)
  assert.deepEqual(
    [Number(truth.history_count), truth.first_overflow_digest, truth.first_conflict_digest],
    [16, null, null],
  )
}
const historyRows = async (reservationId: string) =>
  Number(
    (
      await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.research_call_history WHERE reservation_id=$1`, [
        reservationId,
      ])
    ).n,
  )
const restrictionsOf = async (allowanceId: string) =>
  (await rows(`SELECT 1 FROM sophia.research_allowance_restrictions WHERE allowance_id=$1`, [allowanceId])).length
const triple = (e: { disposition: string; replay: boolean; capped: boolean }) => [e.disposition, e.replay, e.capped]

describe('REPAIR-001 C2A-F01/F02: the first valid overflow restricts at once; an unretained post-cap truth is never a replay', () => {
  it('account-backed: a valid complete overflow restricts the ORIGINAL account before any conflict; another account is not', async () => {
    const w = await world()
    const other = await world({ owner: w.OWNER })
    const third = await world({ owner: w.OWNER })
    const unrelated = await world()
    const s = await started(w)
    const o = await started(other)
    const u = await started(unrelated)
    await pin(third)
    const r = await reserve(w.who, s.at, 'llm-cap', 0.3)
    await fillCap(w.who, s.at, r.reservationId)
    assert.equal(await guardOf(w.account), false, 'sixteen valid inputs restrict nothing')
    // The first unretained input: a VALID complete extension with a supported id (known counts and money).
    const post = await settle(w.who, s.at, r.reservationId, { cost: 0.05, id: 'resp_after_cap' })
    assert.deepEqual(
      [ev(post).disposition, ev(post).capped, post.state, post.settledUsd],
      ['extended', true, 'settled', 0.05],
    )
    const truth = await truthOf(r.reservationId)
    assert.deepEqual(
      [truth.first_overflow_digest, truth.first_conflict_digest, truth.response_id, truth.digest],
      [ev(post).digest, null, 'resp_after_cap', ev(post).digest],
      'the merged truth IS that unretained input',
    )
    assert.equal(await guardOf(w.account), true, 'the first overflow restricted the original account, with no conflict')
    assert.equal(await codeOf(reserve(other.who, o.at, 'llm-tracked')), 'evidence_conflict_unreconciled')
    assert.equal(await codeOf(reserve(other.who, o.at, 'llm-legacy', 0.1, {})), 'evidence_conflict_unreconciled')
    assert.equal(await codeOf(ask(third)), 'evidence_conflict_unreconciled', 'a new admission of the same account')
    assert.ok((await reserve(unrelated.who, u.at, 'llm-other-account')).binding, 'another account is not restricted')
    const money = await allowanceOf(s.taskId)
    assert.deepEqual([Number(money.spent), Number(money.uncertain), Number(money.reserved)], [0.05, 0, 0])
    // C2A-F02 (supported id): its exact repeat is stably capped, never a replay and never the current truth again.
    const repeat = await settle(w.who, s.at, r.reservationId, { cost: 0.05, id: 'resp_after_cap' })
    assert.deepEqual([...triple(ev(repeat)), ev(repeat).digest], ['capped', false, true, ev(post).digest])
    // Retained inputs keep their ORIGINAL receipts after the truth gain; an unretained intermediate stays capped.
    assert.deepEqual(triple(ev(await settle(w.who, s.at, r.reservationId, { report: 'not_complete' }))), [
      'accepted',
      true,
      false,
    ])
    assert.deepEqual(
      triple(ev(await settle(w.who, s.at, r.reservationId, { report: 'not_complete', id: 42, correlation: corr(5) }))),
      ['subsumed', true, false],
    )
    assert.deepEqual(
      triple(ev(await settle(w.who, s.at, r.reservationId, { report: 'not_complete', id: 42, correlation: corr(77) }))),
      ['capped', false, true],
    )
    const settledTruth = await truthOf(r.reservationId)
    assert.deepEqual(
      [
        Number(settledTruth.history_count),
        await historyRows(r.reservationId),
        settledTruth.first_overflow_digest,
        settledTruth.first_conflict_digest,
      ],
      [16, 16, ev(post).digest, null],
      'bounded rows, the first overflow immutable, still no conflict',
    )
    assert.deepEqual(await allowanceOf(s.taskId), money, 'the late known money moved exactly once')
    assert.equal(await guardOf(w.account), true, 'sticky')
  })

  it('account-null: the first valid overflow restricts only its own allowance; another allowance is not', async () => {
    const w = await world()
    const a = await projectFunded(w)
    const r = await reserve(w.legacy, a.at, 'llm-cap', 0.3)
    await fillCap(w.legacy, a.at, r.reservationId)
    const allowance = await allowanceOf(a.taskId)
    assert.equal(await restrictionsOf(allowance.id), 0)
    const post = await settle(w.legacy, a.at, r.reservationId, { cost: 0.04, id: 'resp_project_cap' })
    assert.deepEqual([ev(post).disposition, ev(post).capped, post.state], ['extended', true, 'settled'])
    assert.equal(
      await restrictionsOf(allowance.id),
      1,
      'the first overflow restricted this allowance, with no conflict',
    )
    assert.equal(await codeOf(reserve(w.legacy, a.at, 'llm-next')), 'evidence_conflict_unreconciled')
    assert.equal(await codeOf(reserve(w.legacy, a.at, 'llm-next-legacy', 0.1, {})), 'evidence_conflict_unreconciled')
    assert.equal(await guardOf(w.account), null, 'no account-wide guard was touched')
    assert.deepEqual(
      triple(ev(await settle(w.legacy, a.at, r.reservationId, { cost: 0.04, id: 'resp_project_cap' }))),
      ['capped', false, true],
    )
    assert.equal(Number((await allowanceOf(a.taskId)).spent), 0.04, 'money once')
    await service((c) =>
      runtimeResearchSubmit(c, w.legacy, { ...a.at, callId: 'end', blocker: { reason: 'ended for the test' } }),
    )
    const b = await projectFunded(w)
    assert.ok((await reserve(w.legacy, b.at, 'llm-q')).binding, 'another allowance is not restricted')
  })

  it('C2A-F02 (supported id): the exact repeat of an unretained post-cap complete truth is capped, not current/replay', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-f02-supported', 0.3)
    await fillCap(w.who, s.at, r.reservationId)
    const post = await settle(w.who, s.at, r.reservationId, { cost: 0.05, id: 'resp_f02_supported' })
    assert.deepEqual([ev(post).disposition, ev(post).capped], ['extended', true])
    assert.equal((await truthOf(r.reservationId)).digest, ev(post).digest, 'the merged truth is that unretained input')
    const money = await allowanceOf(s.taskId)
    const repeat = await settle(w.who, s.at, r.reservationId, { cost: 0.05, id: 'resp_f02_supported' })
    assert.deepEqual(triple(ev(repeat)), ['capped', false, true], 'never current/replay')
    assert.deepEqual(await allowanceOf(s.taskId), money, 'no respending')
    assert.equal(await historyRows(r.reservationId), 16)
  })

  it('C2A-F02 (unknown id): an unretained post-cap extension equal to the truth repeats as capped; retained receipts stay', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-legacy-cap', 0.3, tracked('legacy_report'))
    // Legacy-report facts: input and output known, the cache read optional; the response id stays unknown throughout.
    const body = (output: number, cacheRead?: number) => ({
      ...s.at,
      reservationId: r.reservationId,
      outcome: 'settled' as const,
      costUsd: 0.02,
      usage: { inputTokens: 3, outputTokens: output },
      evidence: {
        contract: 'legacy_report' as const,
        report: 'legacy_usage' as const,
        counts: {
          nonCachedInput: known(3),
          cacheRead: cacheRead === undefined ? UNKNOWN : known(cacheRead),
          cacheWrite: UNKNOWN,
          output: known(output),
        },
        ending: 'stream_completed' as const,
        responseId: { status: 'unknown' as const },
      },
    })
    const go = (b: ReturnType<typeof body>) => service((c) => runtimeResearchSettle(c, w.who, b))
    assert.equal(ev(await go(body(4))).disposition, 'accepted')
    for (let n = 5; n <= 19; n++) assert.equal(ev(await go(body(n))).disposition, 'conflict') // retained; truth unchanged
    assert.equal(Number((await truthOf(r.reservationId)).history_count), 16)
    const post = await go(body(4, 0))
    assert.deepEqual([ev(post).disposition, ev(post).capped], ['extended', true])
    const truth = await truthOf(r.reservationId)
    assert.deepEqual(
      [truth.digest, truth.response_id_status, String(truth.cache_read)],
      [ev(post).digest, 'unknown', '0'],
    )
    assert.deepEqual(triple(ev(await go(body(4, 0)))), ['capped', false, true], 'never current/replay')
    assert.deepEqual(triple(ev(await go(body(4)))), ['accepted', true, false], 'the retained first input')
    assert.deepEqual(triple(ev(await go(body(5)))), ['conflict', true, false], 'a retained conflict')
    assert.equal(await historyRows(r.reservationId), 16)
    assert.equal(Number((await allowanceOf(s.taskId)).spent), 0.02, 'money once')
  })
})

/** The backend pids blocking `pid` (pg_blocking_pids), observed until it names `holder`: a lock-graph proof, not a sleep. */
async function blockedBy(pid: number, holder: number, what: string) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const r = await one<{ b: number[] }>(`SELECT pg_blocking_pids($1) AS b`, [pid])
    if (r.b.includes(holder)) return
    if (Date.now() > deadline) throw new Error(`${what}: never blocked by ${String(holder)} (${JSON.stringify(r.b)})`)
    await sleep(25)
  }
}
const pidOf = async (c: pg.PoolClient) => (await c.query<{ p: number }>(`SELECT pg_backend_pid() AS p`)).rows[0]!.p

/** R1: wait until a backend whose query matches `like` is blocked by `holder` (the lock graph proves the wait). */
async function blockedQuery(holder: number, like: string, what: string) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const blocked = await rows(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2`, [
      holder,
      like,
    ])
    if (blocked.length) return
    if (Date.now() > deadline) throw new Error(`${what}: never blocked by ${String(holder)}`)
    await sleep(25)
  }
}
/**
 * R1: wait until the DATABASE's own clock is past `t` (the authority is the DB clock, not this test's sleep). R2: within a
 * finite local budget (the time until `t` plus `slackMs`), so a predicate that never becomes true fails the test loudly;
 * running out of budget only fails the test, it never stands in for the expiry.
 */
async function untilDbPast(t: Date, slackMs = 60_000) {
  const deadline = Date.now() + Math.max(0, t.getTime() - Date.now()) + slackMs
  for (;;) {
    if ((await one<{ past: boolean }>(`SELECT clock_timestamp()>$1::timestamptz AS past`, [t])).past) return
    if (Date.now() > deadline) throw new Error(`the DB clock never passed ${t.toISOString()} within the test budget`)
    await sleep(100)
  }
}
const qualificationExpiry = async (connectionId: string) =>
  (
    await one<{ expires: Date }>(
      `SELECT expires_at AS expires FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [connectionId],
    )
  ).expires
const countIn = async (table: string, projectId: string) =>
  Number((await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.${table} WHERE project_id=$1`, [projectId])).n)
/** R1: a holder that locks ONLY the account's evidence guard row. */
async function guardHolder(account: string) {
  const holder = await ownerPool.connect()
  await holder.query('BEGIN')
  await holder.query(`SELECT 1 FROM sophia.research_evidence_guards WHERE account_id=$1 FOR UPDATE`, [account])
  return holder
}

describe('REPAIR-001 C2A-C02-02: authority and expiry are read at a fresh instant AFTER the last (guard) wait', () => {
  /** A holder that locks ONLY the account's guard row, and a new model reserve that waits on it (proved by the lock graph). */
  async function waitingOnGuard(w: World, s: { at: At }, callId: string) {
    const holder = await ownerPool.connect()
    const reader = await api.connect()
    await holder.query('BEGIN')
    await holder.query(`SELECT 1 FROM sophia.research_evidence_guards WHERE account_id=$1 FOR UPDATE`, [w.account])
    await reader.query('BEGIN')
    const waiting = codeOf(reserveIn(reader, w.who, s.at, callId))
    await blockedBy(await pidOf(reader), await pidOf(holder), 'the new model reserve')
    return { holder, reader, waiting }
  }

  it('matched positive: released before expiry, the waiting reserve is admitted', async () => {
    const w = await world()
    const s = await started(w)
    await reserve(w.who, s.at, 'llm-init') // initializes the guard under the account row
    const { holder, reader, waiting } = await waitingOnGuard(w, s, 'llm-wait')
    try {
      await holder.query('COMMIT')
      assert.equal(await waiting, 'resolved')
      await reader.query('COMMIT')
    } finally {
      holder.release()
      reader.release()
    }
  })

  it('the qualification expires while the reserve waits on the guard: refused after the wait, by the DB clock', async () => {
    const w = await world({ qualifiedUntil: new Date(Date.now() + 9_000) })
    const s = await started(w)
    await reserve(w.who, s.at, 'llm-init')
    const { expires } = await one<{ expires: Date }>(
      `SELECT expires_at AS expires FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w.connectionId],
    )
    const { holder, reader, waiting } = await waitingOnGuard(w, s, 'llm-wait')
    try {
      // The DB's own clock, not this test's sleep, establishes that the expiry has passed while the reserve waits
      // (R2: through the bounded untilDbPast).
      await untilDbPast(expires)
      await holder.query('COMMIT')
      assert.equal(await waiting, 'account_unqualified', 'decided at clock_timestamp() after the guard wait')
      await reader.query('ROLLBACK')
    } finally {
      holder.release()
      reader.release()
    }
    assert.equal(await codeOf(reserve(w.who, s.at, 'llm-after')), 'account_unqualified')
  })

  it('a revocation started during the guard wait waits for the reserve (serialized after it), and refuses the next one', async () => {
    const w = await world()
    const s = await started(w)
    await reserve(w.who, s.at, 'llm-init')
    const { holder, reader, waiting } = await waitingOnGuard(w, s, 'llm-wait')
    const q = await one<{ id: string }>(
      `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w.connectionId],
    )
    const revoking = revokeApiAccountQualification(ownerPool, q.id, 'synthetic revocation during the guard wait')
    const revoked = settledFlag(revoking)
    try {
      await sleep(300)
      assert.equal(revoked.settled, false, 'the revocation waits on the reserve, which holds the qualification row')
      await holder.query('COMMIT')
      assert.equal(await waiting, 'resolved', 'the reserve serialized before the revocation')
      await reader.query('COMMIT')
      await revoking
    } finally {
      holder.release()
      reader.release()
    }
    assert.equal(await codeOf(reserve(w.who, s.at, 'llm-after')), 'account_unqualified')
  })

  /** A second project of `w`'s account whose own connection's qualification ends at `until`; `w` has initialized the guard. */
  async function sharedAccount(until: Date) {
    const w = await world()
    const s = await started(w)
    await reserve(w.who, s.at, 'llm-init') // initializes the account's guard under the account row
    const other = await world({ owner: w.OWNER, qualifiedUntil: until })
    return { w, other }
  }

  for (const expire of [false, true]) {
    it(`R1 admission waits on the last guard; ${expire ? 'the qualification expires by the DB clock first: refused, nothing admitted' : 'released before expiry: admitted (matched positive)'}`, async () => {
      const { w, other } = await sharedAccount(new Date(Date.now() + (expire ? 12_000 : 3_600_000)))
      await pin(other)
      const holder = await guardHolder(w.account)
      let asking: Promise<string> | null = null
      try {
        asking = codeOf(ask(other))
        await blockedQuery(await pidOf(holder), '%admit_research_task%', 'the admission')
        if (expire) await untilDbPast(await qualificationExpiry(other.connectionId))
        await holder.query('COMMIT')
      } finally {
        holder.release()
      }
      const code = await asking
      if (expire) {
        assert.equal(code, 'account_unqualified', 'decided at clock_timestamp() after the guard wait')
        assert.deepEqual(
          [await countIn('research_tasks', other.projectId), await countIn('api_contribution_claims', other.projectId)],
          [0, 0],
          'no admission and no paid claim',
        )
        assert.equal(await countIn('research_reservations', other.projectId), 0, 'no reservation')
      } else {
        assert.equal(code, 'resolved')
        assert.equal(await countIn('research_tasks', other.projectId), 1)
      }
    })

    it(`R1 a queued create's dispatch waits on the last guard; ${expire ? 'the qualification expires by the DB clock first: no command, claim or reservation' : 'released before expiry: dispatched (matched positive)'}`, async () => {
      const { w, other } = await sharedAccount(new Date(Date.now() + (expire ? 15_000 : 3_600_000)))
      await pin(other)
      const queued = await admitted(other) // admitted while still qualified
      const claims = await claimsOf(other.projectId)
      const reservations = await countIn('research_reservations', other.projectId)
      const holder = await guardHolder(w.account)
      try {
        const [row] = (await claimRuntimeOutbox(worker, 'c2a-r1-expiry', 50, 30)).filter(
          (o) => o.project_id === other.projectId,
        )
        assert.ok(row, 'the queued create is claimed for dispatch')
        const dispatching = dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
        await blockedQuery(await pidOf(holder), '%dispatch_runtime_outbox%', 'the dispatch')
        if (expire) await untilDbPast(await qualificationExpiry(other.connectionId))
        await holder.query('COMMIT')
        await dispatching
      } finally {
        holder.release()
      }
      if (expire) {
        const job = await one<{ state: string; reason: string | null }>(
          `SELECT state, reason FROM sophia.jobs WHERE id=$1`,
          [queued.taskId],
        )
        assert.equal(job.state, 'cancelled')
        assert.match(job.reason ?? '', /account_unqualified/, 'decided at clock_timestamp() after the guard wait')
        assert.deepEqual(await runtimeCommandsOf(queued.attemptId), [], 'no runtime command')
        assert.deepEqual(await claimsOf(other.projectId), claims, 'no new paid claim')
      } else {
        assert.deepEqual(await runtimeCommandsOf(queued.attemptId), ['create'])
      }
      assert.equal(await countIn('research_reservations', other.projectId), reservations, 'no reservation either way')
    })
  }

  it('R1 revocation: once it has actually committed, the NEXT admission and the NEXT dispatch are refused (no interleaving invented)', async () => {
    const { other } = await sharedAccount(new Date(Date.now() + 3_600_000))
    await pin(other)
    const queued = await admitted(other)
    const q = await one<{ id: string }>(
      `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [other.connectionId],
    )
    await revokeApiAccountQualification(ownerPool, q.id, 'synthetic revocation, committed before the next operations')
    await dispatchAll()
    const job = await one<{ state: string; reason: string | null }>(
      `SELECT state, reason FROM sophia.jobs WHERE id=$1`,
      [queued.taskId],
    )
    assert.equal(job.state, 'cancelled')
    // The maintained dispatch sees the committed revocation at its readiness predicate, before the funding gate.
    assert.equal(job.reason, "not dispatched: its contribution's account is not currently qualified")
    assert.deepEqual(await runtimeCommandsOf(queued.attemptId), [])
    assert.equal(await codeOf(ask(other)), 'account_unqualified')
  })
})

/** The project's maintained goal command (hold/resume/steer/stop) for the goal of `taskId`, by its requester. */
async function control(
  w: World,
  kind: 'hold' | 'resume' | 'steer' | 'stop',
  taskId: string,
  body: string | null = null,
) {
  const g = await one<{ goal_id: string; revision: string; authority_epoch: string }>(
    `SELECT wa.goal_id, g.revision, g.authority_epoch FROM sophia.jobs j
      JOIN sophia.work_attempts wa ON wa.project_id=j.project_id AND wa.id=j.attempt_id
      JOIN sophia.goals g ON g.project_id=wa.project_id AND g.id=wa.goal_id WHERE j.id=$1`,
    [taskId],
  )
  return withActor(api, w.REQ, 'write', (c) =>
    admitGoalCommand(c, w.projectId, randomUUID(), {
      kind,
      goalId: g.goal_id,
      expectedGoalRevision: Number(g.revision),
      expectedAuthorityEpoch: Number(g.authority_epoch),
      bodySourceId: body,
    }),
  )
}
/** Answer every new command `who` holds as its runtime would (Hold and Stop are checked; the rest delivered). */
async function answer(who: RuntimeCaller, seen: Set<string>) {
  const commands = (await service((c) => runtimePoll(c, who, 0))).commands
    .map((q) => q.command as RuntimeCommand)
    .filter((cmd) => !seen.has(cmd.commandId))
  for (const cmd of commands) seen.add(cmd.commandId)
  const receipts: RuntimeReceipt[] = commands.map((cmd) => ({
    commandId: cmd.commandId,
    attemptId: cmd.binding.attemptId,
    stage: cmd.kind === 'hold' || cmd.kind === 'stop' ? 'checked' : 'delivered',
    nativeSessionId: `sophia-${cmd.binding.attemptId}`,
    nativeSequence: 1,
    evidenceRefs: [],
    observedAt: new Date().toISOString(),
    reason: null,
  }))
  if (receipts.length) await service((c) => recordRuntimeReceipts(c, who, receipts))
  return commands
}
const runtimeCommandsOf = async (attemptId: string) =>
  (
    await rows<{ kind: string }>(
      `SELECT rc.kind FROM sophia.runtime_commands rc WHERE rc.attempt_id=$1 ORDER BY rc.created_at, rc.seq`,
      [attemptId],
    )
  ).map((r) => r.kind)
const outboxOf = (projectId: string, destination: string) =>
  rows<{ id: string; state: string; reason: string | null }>(
    `SELECT id, state, outcome_reason AS reason FROM sophia.outbox WHERE project_id=$1 AND destination=$2 ORDER BY created_at`,
    [projectId, destination],
  )
const claimsOf = async (projectId: string) =>
  (
    await rows<{ job_id: string; state: string }>(
      `SELECT job_id, state FROM sophia.api_contribution_claims WHERE project_id=$1 ORDER BY job_id`,
      [projectId],
    )
  ).map((r) => `${r.job_id}:${r.state}`)
const contributorReservations = async (projectId: string) =>
  Number(
    (
      await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.api_contribution_reservations WHERE project_id=$1`, [
        projectId,
      ])
    ).n,
  )
/** A committed conflict on a fresh reservation of `w`'s task: its account's guard is now restricted. */
async function conflictOn(w: World, s: { at: At }) {
  const r = await reserve(w.who, s.at, `llm-c-${randomUUID().slice(0, 8)}`)
  await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
  await settle(w.who, s.at, r.reservationId, { cost: 0.01, output: 99 })
  assert.equal(await guardOf(w.account), true)
}

describe('REPAIR-001 C2A-C02-03: the maintained dispatch gates normal-funded create/resume/steer and rebuilt reacquire', () => {
  /** A delivered, then held, task of a second project of `w`'s account, with a queued Resume and a queued Steer. */
  async function queuedControls(w: World, seen: Set<string>) {
    const tw = await world({ owner: w.OWNER })
    const t = await started(tw)
    await control(tw, 'steer', t.taskId, (await steerBody(tw)).sourceId)
    return { tw, t, seen }
  }
  const steerBody = (w: World) =>
    withActor(api, w.REQ, 'write', (c) =>
      submitContribution(c, w.projectId, randomUUID(), {
        source: null,
        text: 'Also compare the costs.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
  async function heldThenResumed(tw: World, t: { taskId: string }, seen: Set<string>) {
    await control(tw, 'hold', t.taskId)
    await dispatchAll()
    await answer(tw.who, seen)
    await control(tw, 'resume', t.taskId)
  }

  it('matched positives: an unrestricted account dispatches the funded steer and resume as runtime commands', async () => {
    const w = await world()
    const seen = new Set<string>()
    const { tw, t } = await queuedControls(w, seen)
    await dispatchAll()
    await answer(tw.who, seen)
    await heldThenResumed(tw, t, seen)
    await dispatchAll()
    assert.deepEqual(
      (await runtimeCommandsOf(t.at.attemptId)).filter((k) => k !== 'create'),
      ['steer', 'hold', 'resume'],
    )
  })

  it('a restriction committed BEFORE dispatch: no steer or resume command, no new claim or reservation; Stop and late facts stay', async () => {
    const w = await world()
    const s = await started(w)
    const seen = new Set<string>()
    const { tw, t } = await queuedControls(w, seen)
    const late = await reserve(tw.who, t.at, 'llm-before') // reserved before the restriction
    await conflictOn(w, s)
    const claims = await claimsOf(tw.projectId)
    const reservations = await contributorReservations(tw.projectId)
    await dispatchAll()
    const steer = await outboxOf(tw.projectId, 'native.steer')
    assert.deepEqual(
      steer.map((o) => o.state),
      ['denied'],
    )
    assert.match(steer[0]!.reason ?? '', /evidence_conflict_unreconciled/)
    await answer(tw.who, seen)
    await heldThenResumed(tw, t, seen) // the Hold is no new paid work: it is dispatched
    await dispatchAll()
    const resume = await outboxOf(tw.projectId, 'native.resume')
    assert.deepEqual(
      resume.map((o) => o.state),
      ['denied'],
    )
    assert.match(resume[0]!.reason ?? '', /evidence_conflict_unreconciled/)
    assert.deepEqual(
      (await runtimeCommandsOf(t.at.attemptId)).filter((k) => k !== 'create'),
      ['hold'],
      'no steer or resume',
    )
    assert.deepEqual(await claimsOf(tw.projectId), claims, 'no new paid claim')
    assert.equal(await contributorReservations(tw.projectId), reservations, 'no new reservation')
    assert.equal(
      ev(await settle(tw.who, t.at, late.reservationId, { cost: 0.01 })).disposition,
      'accepted',
      'late facts',
    )
    await control(tw, 'stop', t.taskId)
    await dispatchAll()
    assert.ok((await runtimeCommandsOf(t.at.attemptId)).includes('stop'), 'Stop is never gated')
  })

  it('a restriction committed WHILE the queued create waits at the last guard: no runtime command, no new claim', async () => {
    const w = await world()
    const queuedWorld = await world({ owner: w.OWNER })
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-1')
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    await pin(queuedWorld)
    const queued = await admitted(queuedWorld)
    const claims = await claimsOf(queuedWorld.projectId)
    const reservations = await countIn('research_reservations', queuedWorld.projectId) // R1: conservation
    const contributed = await contributorReservations(queuedWorld.projectId)
    const writer = await api.connect()
    try {
      await writer.query('BEGIN')
      await settleIn(writer, w.who, s.at, r.reservationId, { cost: 0.01, output: 61 }) // holds the guard update
      const [row] = (await claimRuntimeOutbox(worker, 'c2a-guard-wait', 50, 30)).filter(
        (o) => o.project_id === queuedWorld.projectId,
      )
      assert.ok(row, 'the queued create is claimed for dispatch')
      const dispatching = dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
      const writerPid = await pidOf(writer)
      const deadline = Date.now() + 10_000
      for (;;) {
        const blocked = await rows(
          `SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%dispatch_runtime_outbox%'`,
          [writerPid],
        )
        if (blocked.length) break
        if (Date.now() > deadline) throw new Error('the dispatch never waited on the guard writer')
        await sleep(25)
      }
      await writer.query('COMMIT')
      await dispatching
    } finally {
      writer.release()
    }
    const job = await one<{ state: string; reason: string | null }>(
      `SELECT state, reason FROM sophia.jobs WHERE id=$1`,
      [queued.taskId],
    )
    assert.equal(job.state, 'cancelled')
    assert.match(job.reason ?? '', /evidence_conflict_unreconciled/, 'decided after the guard wait')
    assert.deepEqual(await runtimeCommandsOf(queued.attemptId), [], 'no runtime command')
    assert.deepEqual(await claimsOf(queuedWorld.projectId), claims, 'no new paid claim')
    assert.deepEqual(
      [
        await countIn('research_reservations', queuedWorld.projectId),
        await contributorReservations(queuedWorld.projectId),
      ],
      [reservations, contributed],
      'R1: no new reservation, on either ledger',
    )
    for (const o of await claimRuntimeOutbox(worker, 'c2a-guard-wait-rest', 50, 30))
      await dispatchRuntimeOutbox(worker, o.project_id, o.id, o.lease_token!)
  })

  /**
   * R1: a guard writer of `w`'s account (a conflict settlement holding the guard UPDATE, uncommitted), then `dispatchOne`
   * dispatches its claimed row and is proved by the lock graph to wait on that writer; the conflict then commits.
   */
  async function restrictedDuringWait(w: World, s: { at: At }, projectId: string, destination: string) {
    const r = await reserve(w.who, s.at, `llm-w-${randomUUID().slice(0, 8)}`)
    await settle(w.who, s.at, r.reservationId, { cost: 0.01 })
    // Every other claimed row is dispatched normally first (e.g. a withdrawal's Stop of the old attempt): not gated.
    const claimed = await claimRuntimeOutbox(worker, 'c2a-r1-wait', 50, 30)
    const target = await rows<{ id: string }>(
      `SELECT id FROM sophia.outbox WHERE project_id=$1 AND destination=$2 AND state='dispatching'`,
      [projectId, destination],
    )
    assert.equal(target.length, 1, `exactly one ${destination} row is claimed for dispatch`)
    for (const o of claimed.filter((c) => c.id !== target[0]!.id))
      await dispatchRuntimeOutbox(worker, o.project_id, o.id, o.lease_token!)
    const row = claimed.find((c) => c.id === target[0]!.id)!
    const writer = await api.connect()
    try {
      await writer.query('BEGIN')
      await settleIn(writer, w.who, s.at, r.reservationId, { cost: 0.01, output: 71 })
      const dispatching = dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
      await blockedQuery(await pidOf(writer), '%dispatch_runtime_outbox%', 'the dispatch')
      await writer.query('COMMIT')
      await dispatching
    } finally {
      writer.release()
    }
    assert.equal(await guardOf(w.account), true)
  }

  for (const kind of ['steer', 'resume'] as const) {
    it(`R1 a funded ${kind} waits at its own last guard while a restriction commits: denied, no command, claim or reservation`, async () => {
      const w = await world()
      const s = await started(w)
      const tw = await world({ owner: w.OWNER })
      const t = await started(tw)
      const seen = new Set<string>()
      if (kind === 'steer') await control(tw, 'steer', t.taskId, (await steerBody(tw)).sourceId)
      else await heldThenResumed(tw, t, seen)
      const claims = await claimsOf(tw.projectId)
      const reservations = await countIn('research_reservations', tw.projectId)
      await restrictedDuringWait(w, s, tw.projectId, `native.${kind}`)
      const out = await outboxOf(tw.projectId, `native.${kind}`)
      assert.deepEqual(
        out.map((o) => o.state),
        ['denied'],
      )
      assert.match(out[0]!.reason ?? '', /evidence_conflict_unreconciled/, 'decided after the guard wait')
      assert.equal((await runtimeCommandsOf(t.at.attemptId)).includes(kind), false, `no ${kind} command`)
      assert.deepEqual(await claimsOf(tw.projectId), claims, 'no new paid claim')
      assert.equal(await countIn('research_reservations', tw.projectId), reservations, 'no reservation')
    })
  }

  /** A pinned task that read a contribution, a settled call, then the contribution withdrawn: a queued unfunded successor. */
  async function rebuilt(w: World) {
    await pin(w)
    const input = await withActor(api, w.REQ, 'write', (c) =>
      submitContribution(c, w.projectId, randomUUID(), {
        source: null,
        text: 'Our pilot hosts render PDFs in a sandbox.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      }),
    )
    const r = await withActor(api, w.REQ, 'write', (c) =>
      admitResearchTask(c, w.projectId, {
        key: randomUUID(),
        exchangeId: randomUUID(),
        request: {
          question: 'Which sandboxes do PDF rendering services use?',
          outputs: ['markdown'],
          inputSourceIds: [input.sourceId],
        },
        specialist: { role: MD.id, route: MD.route },
      }),
    )
    assert.ok('admitted' in r, JSON.stringify(r))
    await dispatchAll()
    const at = await deliver(w.who, r.admitted.attemptId)
    const m = await reserve(w.who, at, 'm1', 0.2)
    await settle(w.who, at, m.reservationId, { cost: 0.2 })
    const preview = await withActor(api, w.REQ, 'read', (c) =>
      previewContributionAct(c, w.projectId, input.contributionId, 'withdraw'),
    )
    await withActor(api, w.REQ, 'write', (c) =>
      withdrawContribution(c, w.projectId, input.contributionId, randomUUID(), {
        expectedRevision: preview.revision,
        reach: preview.reach.map(({ taskId, kind, restarts }) => ({ taskId, kind, restarts })),
        previewToken: preview.previewToken,
      }),
    )
    const succ = await one<{ id: string; attempt_id: string }>(
      `SELECT j.id, j.attempt_id FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
        WHERE t.project_id=$1 AND t.rebuilt_from_job_id=$2`,
      [w.projectId, r.admitted.taskId],
    )
    assert.ok(succ, 'the withdrawal queued a successor')
    const claim = await one<{ state: string }>(`SELECT state FROM sophia.api_contribution_claims WHERE job_id=$1`, [
      succ.id,
    ])
    assert.equal(claim.state, 'unfunded')
    return succ
  }

  it('matched positive: an unrestricted rebuilt successor reacquires at its dispatch and is created', async () => {
    const w = await world({ accountCap: 3 })
    const succ = await rebuilt(w)
    await dispatchAll()
    const claim = await one<{ state: string }>(`SELECT state FROM sophia.api_contribution_claims WHERE job_id=$1`, [
      succ.id,
    ])
    assert.equal(claim.state, 'funded')
    assert.deepEqual(await runtimeCommandsOf(succ.attempt_id), ['create'])
  })

  it('a restriction before the rebuilt successor dispatches: no reacquire, no create; the claim stays unfunded', async () => {
    const w = await world({ accountCap: 10 })
    const other = await world({ owner: w.OWNER })
    const o = await started(other)
    const succ = await rebuilt(w)
    await conflictOn(other, o)
    await dispatchAll()
    const job = await one<{ state: string; reason: string | null }>(
      `SELECT state, reason FROM sophia.jobs WHERE id=$1`,
      [succ.id],
    )
    assert.equal(job.state, 'cancelled')
    assert.match(job.reason ?? '', /cannot fund its remainder: evidence_conflict_unreconciled/)
    const claim = await one<{ state: string }>(`SELECT state FROM sophia.api_contribution_claims WHERE job_id=$1`, [
      succ.id,
    ])
    assert.equal(claim.state, 'unfunded', 'no reacquire')
    assert.deepEqual(await runtimeCommandsOf(succ.attempt_id), [], 'no runtime command')
  })

  it('R1 a rebuilt successor waits at its reacquire guard while a restriction commits: cancelled, unfunded, no create or reservation', async () => {
    const w = await world({ accountCap: 10 })
    const other = await world({ owner: w.OWNER })
    const o = await started(other)
    const succ = await rebuilt(w)
    const reservations = await countIn('research_reservations', w.projectId)
    const contributed = await contributorReservations(w.projectId)
    await restrictedDuringWait(other, o, w.projectId, 'native.create')
    const job = await one<{ state: string; reason: string | null }>(
      `SELECT state, reason FROM sophia.jobs WHERE id=$1`,
      [succ.id],
    )
    assert.equal(job.state, 'cancelled')
    assert.match(
      job.reason ?? '',
      /cannot fund its remainder: evidence_conflict_unreconciled/,
      'decided after the guard wait',
    )
    const claim = await one<{ state: string }>(`SELECT state FROM sophia.api_contribution_claims WHERE job_id=$1`, [
      succ.id,
    ])
    assert.equal(claim.state, 'unfunded', 'no reacquire')
    assert.deepEqual(await runtimeCommandsOf(succ.attempt_id), [], 'no create')
    assert.deepEqual(
      [await countIn('research_reservations', w.projectId), await contributorReservations(w.projectId)],
      [reservations, contributed],
      'no new reservation',
    )
  })
})

describe('REPAIR-001 C2A-C02-04: original-authority retries count cumulatively; late facts after Stop and a new lease land once', () => {
  const committedOf = async (account: string) =>
    Number((await one<{ v: string }>(`SELECT sophia.contribution_committed($1,NULL) AS v`, [account])).v)

  it('a first uncertain call and a distinct retry both count; a capped third cannot reprice, fall back or release the first', async () => {
    const w = await world()
    const s = await started(w)
    const first = await reserve(w.who, s.at, 'llm-try-1', 0.3)
    assert.equal((await settle(w.who, s.at, first.reservationId, { report: 'not_complete' })).state, 'uncertain')
    const second = await reserve(w.who, s.at, 'llm-try-2', 0.4)
    assert.notEqual(second.reservationId, first.reservationId)
    assert.equal(await committedOf(w.account), 0.7, 'the uncertain first and the reserved second, cumulatively')
    const ids = await rows<{ account_id: string; grant_id: string; qualification_id: string }>(
      `SELECT account_id, grant_id, qualification_id FROM sophia.research_call_identities WHERE reservation_id IN ($1,$2)`,
      [first.reservationId, second.reservationId],
    )
    assert.equal(
      new Set(ids.map((i) => `${i.account_id}/${i.grant_id}/${i.qualification_id}`)).size,
      1,
      'one original authority',
    )
    const refused = await codeOf(reserve(w.who, s.at, 'llm-try-3', 1.5))
    assert.notEqual(refused, 'resolved', 'over the task cap')
    const r1 = await reservationOf(first.reservationId)
    assert.deepEqual([r1.state, r1.settled_usd], ['uncertain', null], 'the first is neither repriced nor released')
    assert.equal(await committedOf(w.account), 0.7, 'the refusal changed nothing')
    const known1 = await settle(w.who, s.at, first.reservationId, { cost: 0.05 })
    assert.deepEqual([ev(known1).disposition, known1.state], ['extended', 'settled'])
    assert.equal(await committedOf(w.account), 0.45, 'the late known first replaces its exposure once')
    assert.equal(ev(await settle(w.who, s.at, first.reservationId, { cost: 0.05 })).replay, true)
    assert.equal(await committedOf(w.account), 0.45)
  })

  it('late known facts after Stop, through a NEW runtime lease, land exactly once; no new paid work starts', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-stop', 0.2)
    // The runtime restarts: a new bridge instance takes the lease the reservation was made under.
    const next: RuntimeCaller = { ...w.who, bridgeInstanceId: randomUUID() }
    await bringUp(next)
    await control(w, 'stop', s.taskId)
    await dispatchAll()
    await answer(next, new Set())
    const preStop = await allowanceOf(s.taskId)
    const late = await settle(next, s.at, r.reservationId, { cost: 0.03, id: 'resp_after_stop' })
    assert.deepEqual([ev(late).disposition, late.state], ['accepted', 'settled'])
    const postStop = await allowanceOf(s.taskId)
    assert.deepEqual(
      [Number(postStop.spent) - Number(preStop.spent), Number(preStop.reserved) - Number(postStop.reserved)],
      [0.03, 0.2],
      'the known money replaced the reservation once; nothing was auto-released before',
    )
    assert.deepEqual(triple(ev(await settle(next, s.at, r.reservationId, { cost: 0.03, id: 'resp_after_stop' }))), [
      'accepted',
      true,
      false,
    ])
    assert.deepEqual(await allowanceOf(s.taskId), postStop)
    assert.notEqual(await codeOf(reserve(next, s.at, 'llm-after-stop')), 'resolved', 'no new paid action after Stop')
  })
  it('R1 the reserving runtime goes STALE (readiness/liveness), a new hello SUPERSEDES its lease, the exposure is kept, then late facts land once under the current lease', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-lease', 0.2)
    const exposure = await allowanceOf(s.taskId)
    const runtime = await one<{ id: string; lease_epoch: string }>(
      `SELECT id, lease_epoch FROM sophia.runtime_instances WHERE token_sha256=$1`,
      [w.who.tokenSha256],
    )
    // R2 (label correction): readiness/liveness STALENESS, as the effective runtime_unavailable (0094:1122-1130) reports
    // it: seen more than 90 seconds ago, read from the DB's own state and clock; nothing here touches seen_at or any other
    // column. This is not a time-expired authentication: runtime_authenticate and runtime_lease (0012:373-395) have no
    // TTL; the old lease stops authenticating only when a new hello supersedes it (below).
    const stale = async () =>
      (
        await one<{ why: string | null }>(
          `SELECT sophia.runtime_unavailable(r) AS why FROM sophia.runtime_instances r WHERE r.id=$1`,
          [runtime.id],
        )
      ).why
    // R2: a finite budget for the real 90-second staleness; exceeding it fails the test, it is never the staleness itself.
    const staleBy = Date.now() + 180_000
    for (;;) {
      if ((await stale()) === "waiting for Sophia's runtime to reconnect") break
      if (Date.now() > staleBy) throw new Error('the runtime never became stale within the test budget')
      await sleep(1000)
    }
    const r1 = await reservationOf(r.reservationId)
    assert.deepEqual([r1.state, r1.settled_usd], ['reserved', null], 'no timeout auto-release')
    assert.deepEqual(await allowanceOf(s.taskId), exposure, 'the original exposure stays committed')
    // The runtime comes back: a new hello takes a new lease; the stale one is SUPERSEDED and no longer authenticates.
    const next: RuntimeCaller = { ...w.who, bridgeInstanceId: randomUUID() }
    await bringUp(next)
    const leaseAfter = await one<{ lease_epoch: string }>(
      `SELECT lease_epoch FROM sophia.runtime_instances WHERE id=$1`,
      [runtime.id],
    )
    assert.equal(Number(leaseAfter.lease_epoch), Number(runtime.lease_epoch) + 1)
    assert.notEqual(
      await codeOf(settle(w.who, s.at, r.reservationId, { cost: 0.03 })),
      'resolved',
      'the old lease is not authority',
    )
    assert.deepEqual(await allowanceOf(s.taskId), exposure, 'and changed nothing')
    // Late known facts under the authenticated current lease: once; a replay changes nothing; no new paid work started.
    const reservationsBefore = await countIn('research_reservations', w.projectId)
    const late = await settle(next, s.at, r.reservationId, { cost: 0.03, id: 'resp_after_lease' })
    assert.deepEqual([ev(late).disposition, late.state], ['accepted', 'settled'])
    const settled = await allowanceOf(s.taskId)
    assert.deepEqual(
      [Number(settled.spent) - Number(exposure.spent), Number(exposure.reserved) - Number(settled.reserved)],
      [0.03, 0.2],
    )
    assert.equal(ev(await settle(next, s.at, r.reservationId, { cost: 0.03, id: 'resp_after_lease' })).replay, true)
    assert.deepEqual(await allowanceOf(s.taskId), settled)
    assert.equal(await countIn('research_reservations', w.projectId), reservationsBefore, 'no new paid effect')
  })
})
