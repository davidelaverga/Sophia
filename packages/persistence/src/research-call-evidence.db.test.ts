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
  runtimeTokenHash,
  withActor,
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
async function world(o: { owner?: string; accountCap?: number } = {}) {
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
  await qualify(conn.connectionId)
  return { projectId, OWNER, REQ, ADMIN, account, connectionId: conn.connectionId, grantId, who, legacy }
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
