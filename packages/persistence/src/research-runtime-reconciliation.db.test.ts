// INC04-R07-C3-RECONCILE-001 (0112), level: sql-run on real PostgreSQL through the private typed operator wrapper.
// Known-evidence reconciliation of monetary-open reservations (exactly once, original binding, D1 disabled), nonmonetary
// adjudication of settled/open conflict and overflow causes, the active allowance gate with recurrence, and the complete,
// fresh account certificate (all aliases and projects, guard LAST) under two-connection barriers. Projects, accounts,
// runtimes, tokens, authorities and evidence references are SYNTHETIC: a migration-owner fixture stands for the external
// operator; nothing here is an actual owner approval, a verified bill or a provider call.
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchReserve,
  runtimeResearchSettle,
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
  setResearchFundingPin,
  updateApiAccount,
  type AccountProtection,
} from './api-contributions.ts'
import {
  adjudicateResearchCause,
  certifyResearchAccount,
  certifyResearchAllowance,
  reconcileResearchReservation,
  recordResearchLateFacts,
  researchLateFactRecords,
  recordResearchFinancialAuthority,
  researchCertificationPreview,
  revokeResearchFinancialAuthority,
  type AuthorityInput,
  type LateFactsInput,
  type ReconcileInput,
} from './research-runtime-reconciliation.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 10 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 8 })
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

/** Every message and code along an error's cause chain (a refusal is asserted by its words). */
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
type Outcome = { ok: unknown } | { refused: string }
const outcomeOf = (p: Promise<unknown>): Promise<Outcome> =>
  p.then(
    (ok) => ({ ok }),
    (err: unknown) => ({ refused: chain(err) }),
  )

const callerOf = (token: string, unit: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: unit,
  bridgeInstanceId: randomUUID(),
})
async function bringUp(who: RuntimeCaller) {
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
}

/**
 * A project with an enabled research gate and a ready legacy runtime (account-null work); an account (or, with `owner`,
 * that owner's existing account: another ALIAS connection of the same account in another project), a grant, and a
 * connected, qualified contribution runtime. All SYNTHETIC.
 */
async function world(o: { owner?: string } = {}) {
  const OWNER = o.owner ?? randomUUID()
  const REQ = randomUUID()
  const ADMIN = randomUUID()
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
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
        createApiAccount(c, { label: 'My API', totalCapUsd: 10, concurrency: 3, provenance: 'owner_declared' }),
      )
    ).accountId
    await withActor(api, OWNER, 'write', (c) => updateApiAccount(c, account, 1, { protection: NONE_APPLICABLE }))
  }
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
  await qualifyApiAccount(owner, {
    connectionId: conn.connectionId,
    operations: ['research'],
    verification: 'operator_verified_call',
    evidenceRef: 'synthetic: not a live account qualification',
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  })
  const resourceId = (
    await one<{ r: string }>(
      `SELECT resource_id AS r FROM sophia.api_contribution_runtimes WHERE project_id=$1 AND connection_id=$2`,
      [projectId, conn.connectionId],
    )
  ).r
  return { projectId, OWNER, REQ, ADMIN, account, connectionId: conn.connectionId, grantId, who, legacy, resourceId }
}
type World = Awaited<ReturnType<typeof world>>

const ask = (w: World) =>
  withActor(api, w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
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
async function dispatchAll() {
  for (const row of await claimRuntimeOutbox(worker, 'c3-reconcile', 50, 30))
    await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
}
/** A contributed (pinned) research task delivered to the world's contribution runtime (account-backed). */
async function started(w: World) {
  const rev = Number(
    (await one<{ r: string }>(`SELECT revision AS r FROM sophia.api_contribution_grants WHERE id=$1`, [w.grantId])).r,
  )
  await withActor(api, w.REQ, 'write', (c) => setResearchFundingPin(c, w.projectId, w.grantId, rev))
  const r = await ask(w)
  assert.ok('admitted' in r, JSON.stringify(r))
  await dispatchAll()
  return { taskId: r.admitted.taskId, at: await deliver(w.who, r.admitted.attemptId) }
}
/** A project-funded (unpinned) research task on the legacy runtime: a genuinely account-null allowance. */
async function projectFunded(w: World) {
  const r = await ask(w)
  assert.ok('admitted' in r, JSON.stringify(r))
  await dispatchAll()
  return { taskId: r.admitted.taskId, at: await deliver(w.legacy, r.admitted.attemptId) }
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
const UNKNOWN = { class: 'unknown' as const }
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
/** A not-complete report (uncertain money); with a correlation, an unsupported id carrying it (the fillCap pattern). */
const notComplete = (at: At, reservationId: string, correlation?: string) => ({
  ...at,
  reservationId,
  outcome: 'uncertain' as const,
  evidence: {
    contract: 'c1p_complete_report' as const,
    report: 'not_complete' as const,
    counts: { nonCachedInput: UNKNOWN, cacheRead: UNKNOWN, cacheWrite: UNKNOWN, output: UNKNOWN },
    ending: 'stream_completed' as const,
    responseId: correlation
      ? { status: 'identity_unsupported' as const, reason: 'over_bound' as const, correlation }
      : { status: 'unknown' as const },
  },
})
const settle = (who: RuntimeCaller, at: At, reservationId: string, o: { cost?: number; output?: number } = {}) =>
  service((c) => runtimeResearchSettle(c, who, complete(at, reservationId, o)))
const settleUncertain = (who: RuntimeCaller, at: At, reservationId: string, correlation?: string) =>
  service((c) => runtimeResearchSettle(c, who, notComplete(at, reservationId, correlation)))
const corr = (n: number) =>
  createHash('sha256')
    .update(`c${String(n)}`)
    .digest('hex')
/** 16 retained inputs (the cap), no overflow or conflict yet (research-call-evidence fillCap pattern). */
async function fillCap(who: RuntimeCaller, at: At, reservationId: string) {
  await settleUncertain(who, at, reservationId)
  for (let n = 1; n <= 15; n++) await settleUncertain(who, at, reservationId, corr(n))
  const t = await one<{ h: number; o: string | null; c: string | null }>(
    `SELECT history_count AS h, first_overflow_digest AS o, first_conflict_digest AS c FROM sophia.research_call_truth WHERE reservation_id=$1`,
    [reservationId],
  )
  assert.deepEqual([t.h, t.o, t.c], [16, null, null])
}

// --- authority, inputs and readbacks -------------------------------------------------------------------------------

const authority = async (kind: AuthorityInput['kind'], scope: AuthorityInput['scope']) =>
  (
    await recordResearchFinancialAuthority(owner, {
      version: 'research-authority-v1',
      authorityKey: `synthetic-${randomUUID()}`,
      kind,
      scope,
      approverRef: 'synthetic: owner approval fixture',
      verifierRef: 'synthetic: independent verifier fixture',
    })
  ).authorityId
/** The original binding of a reservation, read from the authoritative rows (what an operator names). */
async function bindingOf(projectId: string, reservationId: string) {
  const b = await one<{
    state: 'reserved' | 'uncertain'
    reserved: string
    allowance: string
    account: string | null
    resource: string | null
    operation: 'research' | 'design' | 'source_review' | null
    call: string | null
    provider: string
  }>(
    `SELECT r.state, r.reserved_usd::text AS reserved, r.allowance_id AS allowance, coalesce(x.account_id,i.account_id) AS account,
      coalesce(i.resource_id,t.resource_id) AS resource, i.operation, i.call_id AS call, r.provider
     FROM sophia.research_reservations r LEFT JOIN sophia.research_call_identities i ON i.project_id=r.project_id AND i.reservation_id=r.id
     LEFT JOIN sophia.api_contribution_reservations x ON x.project_id=r.project_id AND x.reservation_id=r.id
     LEFT JOIN sophia.api_contribution_tasks t ON t.project_id=x.project_id AND t.job_id=x.job_id
     WHERE r.project_id=$1 AND r.id=$2`,
    [projectId, reservationId],
  )
  const f = b.resource
    ? await one<{ id: string; generation: string } | undefined>(
        `SELECT id, generation FROM sophia.research_runtime_fences WHERE project_id=$1 AND resource_id=$2`,
        [projectId, b.resource],
      )
    : undefined
  return { ...b, fenceId: f?.id ?? null, generation: f?.generation ?? null }
}
const reconcileInput = async (
  projectId: string,
  reservationId: string,
  authorityId: string,
  costUsd: string,
): Promise<ReconcileInput> => {
  const b = await bindingOf(projectId, reservationId)
  return {
    version: 'research-reconcile-v1',
    projectId,
    reservationId,
    expected: {
      state: b.state,
      reservedUsd: b.reserved,
      allowanceId: b.allowance,
      accountId: b.account,
      resourceId: b.resource,
      operation: b.operation,
      callId: b.call,
      provider: b.provider,
      fenceId: b.fenceId,
      generation: b.generation,
    },
    basis: 'provider_billed_attestation',
    costUsd,
    authorityId,
    evidenceRef: 'synthetic: provider invoice line fixture',
  }
}
const causesOf = (scope: { account: string } | { project: string; allowance: string }) =>
  rows<{
    id: string
    seq: number
    project_id: string
    reservation_id: string
    kind: 'conflict' | 'overflow'
    digest: string
  }>(
    'account' in scope
      ? `SELECT id, seq, project_id, reservation_id, kind, digest FROM sophia.research_restriction_causes WHERE scope='account' AND account_id=$1 ORDER BY seq`
      : `SELECT id, seq, project_id, reservation_id, kind, digest FROM sophia.research_restriction_causes WHERE scope='allowance' AND project_id=$1 AND allowance_id=$2 ORDER BY seq`,
    'account' in scope ? [scope.account] : [scope.project, scope.allowance],
  )
async function adjudicate(
  cause: { id: string; project_id: string; reservation_id: string; kind: 'conflict' | 'overflow'; digest: string },
  authorityId: string,
) {
  return adjudicateResearchCause(owner, {
    version: 'research-adjudicate-v1',
    causeId: cause.id,
    projectId: cause.project_id,
    reservationId: cause.reservation_id,
    kind: cause.kind,
    digest: cause.digest,
    outcome: 'original_money_stands',
    authorityId,
    evidenceRef: 'synthetic: cause review fixture',
  })
}
const allowanceOfTask = (taskId: string) =>
  one<{ id: string; spent: string; uncertain: string; reserved: string; overrun: string }>(
    `SELECT a.id, a.spent_usd::text AS spent, a.uncertain_usd::text AS uncertain, a.reserved_usd::text AS reserved, a.overrun_usd::text AS overrun
     FROM sophia.research_tasks t JOIN sophia.research_allowances a ON a.project_id=t.project_id AND a.id=t.allowance_id WHERE t.job_id=$1`,
    [taskId],
  )
/** The retained evidence of a project: never rewritten by reconciliation, adjudication or certification. */
const evidenceOf = async (projectId: string) => ({
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
const guardOf = async (account: string) =>
  (
    await one<{ restricted: boolean }>(`SELECT restricted FROM sophia.research_evidence_guards WHERE account_id=$1`, [
      account,
    ])
  ).restricted
const episodesOf = async (projectId: string, allowanceId: string) =>
  Number(
    (
      await one<{ n: string }>(
        `SELECT count(*) AS n FROM sophia.research_allowance_restriction_episodes WHERE project_id=$1 AND allowance_id=$2`,
        [projectId, allowanceId],
      )
    ).n,
  )
const certifyAllowance = async (projectId: string, allowanceId: string, authorityId: string) => {
  const p = await researchCertificationPreview(owner, { projectId, allowanceId })
  return certifyResearchAllowance(owner, {
    version: 'research-certify-allowance-v1',
    projectId,
    allowanceId,
    episode: String(p.episode),
    causeSetDigest: p.causeSetDigest,
    authorityId,
    evidenceRef: 'synthetic: allowance certification fixture',
  })
}
const accountInput = async (account: string, authorityId: string) => {
  const p = await researchCertificationPreview(owner, { accountId: account })
  return {
    version: 'research-certify-account-v1' as const,
    accountId: account,
    projectIds: p.projectIds!,
    connectionIds: p.connectionIds!,
    causeSetDigest: p.causeSetDigest,
    authorityId,
    evidenceRef: 'synthetic: account certification fixture',
  }
}
const GATE = /evidence_conflict_unreconciled/
/** USD arithmetic in millionths (numeric(12,6)), never in floating point. */
const micro = (v: string | number) => Math.round(Number(v) * 1_000_000)

// --- two-connection barriers (the fence test's helpers) -------------------------------------------------------------

const pidOf = async (c: pg.ClientBase) => (await c.query<{ p: number }>(`SELECT pg_backend_pid() AS p`)).rows[0]!.p
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
/** Whether `pid` is still blocked by `holder` after a bounded settle period (a characterization, not a timing proof). */
async function stillBlocked(pid: number, holder: number) {
  return (
    (await rows(`SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND $2=ANY(pg_blocking_pids(pid))`, [pid, holder]))
      .length === 1
  )
}
async function waitingOn(pid: number, relation: string) {
  const r = await rows<{ locktype: string; rel: string | null; granted: boolean }>(
    `SELECT locktype, relation::regclass::text AS rel, granted FROM pg_locks WHERE pid=$1 AND locktype IN ('tuple','transactionid')`,
    [pid],
  )
  assert.ok(
    r.some((l) => l.locktype === 'tuple' && l.rel === relation && l.granted) &&
      r.some((l) => l.locktype === 'transactionid' && !l.granted),
    `waiting on ${relation}: ${JSON.stringify(r)}`,
  )
}

describe('A. known-evidence reconciliation: original binding, exactly once, D1 disabled', () => {
  it('settles a fenced monetary-open (uncertain) contributed reservation once; replay is stored; every mismatch refuses; no second charge', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'llm-open')
    await settleUncertain(w.who, s.at, r.reservationId)
    const done = await reserve(w.who, s.at, 'llm-done')
    await settle(w.who, s.at, done.reservationId)
    // Drain and fence the contribution resource (0111); the open reservation is frozen as monetary-open.
    const token = randomUUID() + randomUUID()
    await registerContributionRuntime(owner, {
      projectId: w.projectId,
      connectionId: w.connectionId,
      runtimeUnitId: `${UNIT}-2`,
      tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
      rotate: true,
    })
    const gen = (
      await one<{ g: string }>(`SELECT sophia.contribution_runtime_generation($1,$2) AS g`, [w.projectId, w.resourceId])
    ).g
    await owner.query(`SELECT sophia.fence_contribution_runtime($1,$2,$3)`, [w.projectId, w.resourceId, gen])
    // Late facts through the fenced runtime are refused; the governed path is the operator record on the original identity.
    assert.match(await refusal(settle(w.who, s.at, r.reservationId, { cost: 0.034 })), /Runtime capability revoked/)
    const auth = await authority('provider_billed_attestation', { accountId: w.account })
    const input = await reconcileInput(w.projectId, r.reservationId, auth, '0.034000')
    assert.equal(input.expected.state, 'uncertain')
    assert.ok(input.expected.fenceId, 'bound to the fence that froze it')
    const money = await allowanceOfTask(s.taskId)
    const evidence = await evidenceOf(w.projectId)
    // Mismatches refuse before any effect.
    for (const [what, bad, why] of [
      ['another cost spelling (a JSON number)', { ...input, costUsd: 0.034 }, /Invalid reconciliation input/],
      ['D1 conservative_at_reserved', { ...input, basis: 'conservative_at_reserved' }, /disabled \(D1\)/],
      [
        'no fence named',
        { ...input, expected: { ...input.expected, fenceId: null, generation: null } },
        /fence that froze/,
      ],
      [
        'another generation',
        { ...input, expected: { ...input.expected, generation: 'a'.repeat(64) } },
        /fence that froze/,
      ],
      [
        'another account (a current display guess)',
        { ...input, expected: { ...input.expected, accountId: randomUUID() } },
        /original binding/,
      ],
      [
        'another allowance',
        { ...input, expected: { ...input.expected, allowanceId: randomUUID() } },
        /original binding/,
      ],
      [
        'another reserved amount',
        { ...input, expected: { ...input.expected, reservedUsd: '0.200000' } },
        /original binding/,
      ],
      ['another call', { ...input, expected: { ...input.expected, callId: 'llm-other' } }, /original binding/],
      [
        'the wrong expected state',
        { ...input, expected: { ...input.expected, state: 'reserved' } },
        /no longer reserved/,
      ],
    ] as const) {
      assert.match(await refusal(reconcileResearchReservation(owner, bad as unknown as ReconcileInput)), why, what)
    }
    const otherAccount = await authority('provider_billed_attestation', { accountId: randomUUID() })
    assert.match(
      await refusal(reconcileResearchReservation(owner, { ...input, authorityId: otherAccount })),
      /No operator authority/,
    )
    const wrongKind = await authority('certification', { accountId: w.account })
    assert.match(
      await refusal(reconcileResearchReservation(owner, { ...input, authorityId: wrongKind })),
      /No operator authority/,
    )
    const revoked = await authority('provider_billed_attestation', { accountId: w.account })
    await revokeResearchFinancialAuthority(owner, revoked, 'synthetic: revoked before use')
    assert.match(
      await refusal(reconcileResearchReservation(owner, { ...input, authorityId: revoked })),
      /No operator authority/,
    )
    assert.deepEqual(await allowanceOfTask(s.taskId), money, 'refusals changed no money')
    // The one effect.
    const result = await reconcileResearchReservation(owner, input)
    assert.deepEqual(
      [result.priorState, result.state, result.settledUsd, result.overrunUsd, result.accountId, result.fenceId],
      ['uncertain', 'settled', '0.034000', '0.000000', w.account, input.expected.fenceId],
    )
    const after1 = await allowanceOfTask(s.taskId)
    assert.equal(micro(after1.uncertain), micro(money.uncertain) - 100_000, 'the uncertain commitment is released once')
    assert.equal(micro(after1.spent), micro(money.spent) + 34_000, 'spent once, at the evidenced cost')
    assert.deepEqual(await evidenceOf(w.projectId), evidence, 'truth, history and identities unchanged')
    // Exact replay returns the stored result before the now-settled state would refuse; also on a new connection.
    assert.deepEqual(await reconcileResearchReservation(owner, input), result)
    const fresh = new pg.Client({ connectionString: db.ownerUrl })
    await fresh.connect()
    try {
      assert.deepEqual(await reconcileResearchReservation(fresh, input), result)
    } finally {
      await fresh.end()
    }
    assert.match(
      await refusal(reconcileResearchReservation(owner, { ...input, costUsd: '0.035000' })),
      /different reconciliation/,
    )
    assert.deepEqual(await allowanceOfTask(s.taskId), after1, 'no second charge')
    // A reservation its runtime already settled was not frozen as monetary-open by the fence: never charged again.
    const doneBinding = await bindingOf(w.projectId, done.reservationId)
    assert.equal(doneBinding.state, 'settled')
    assert.match(
      await refusal(
        reconcileResearchReservation(owner, {
          ...input,
          reservationId: done.reservationId,
          expected: { ...input.expected, callId: doneBinding.call },
        }),
      ),
      /fence that froze/,
    )
    assert.deepEqual(await allowanceOfTask(s.taskId), after1)
    assert.deepEqual(
      (
        await rows(`SELECT state FROM sophia.runtime_instances WHERE project_id=$1 AND resource_id=$2`, [
          w.projectId,
          w.resourceId,
        ])
      ).map((x) => (x as { state: string }).state),
      ['revoked'],
      'no runtime reactivation',
    )
  })

  it('a genuinely evidenced zero is distinct from unavailable evidence; unknown stays uncertain and blocks; a true overrun is recorded, not clamped', async () => {
    const w = await world()
    const pf = await projectFunded(w)
    const zero = await reserve(w.legacy, pf.at, 'llm-zero')
    const unknown = await reserve(w.legacy, pf.at, 'llm-unknown')
    const over = await reserve(w.legacy, pf.at, 'llm-over')
    for (const x of [zero, unknown, over]) await settleUncertain(w.legacy, pf.at, x.reservationId)
    const a0 = await allowanceOfTask(pf.taskId)
    const auth = await authority('provider_billed_attestation', { projectId: w.projectId, allowanceId: a0.id })
    const z = await reconcileResearchReservation(
      owner,
      await reconcileInput(w.projectId, zero.reservationId, auth, '0.000000'),
    )
    assert.deepEqual(
      [z.state, z.settledUsd, z.accountId, z.fenceId],
      ['settled', '0.000000', null, null],
      'an evidenced zero, account-null',
    )
    const o = await reconcileResearchReservation(
      owner,
      await reconcileInput(w.projectId, over.reservationId, auth, '0.250000'),
    )
    assert.deepEqual(
      [o.settledUsd, o.overrunUsd],
      ['0.250000', '0.150000'],
      'the true cost, never clamped to the reservation',
    )
    const a1 = await allowanceOfTask(pf.taskId)
    assert.equal(micro(a1.uncertain), micro(a0.uncertain) - 200_000)
    assert.equal(micro(a1.spent), micro(a0.spent) + 250_000)
    assert.equal(micro(a1.overrun), 150_000)
    // The evidenced-zero reservation, now settled, is never charged again (no fence here: the state refuses).
    const again = await reconcileInput(w.projectId, zero.reservationId, auth, '0.010000')
    assert.match(
      await refusal(
        reconcileResearchReservation(owner, { ...again, expected: { ...again.expected, state: 'uncertain' } }),
      ),
      /different reconciliation/,
      'its record answers first',
    )
    // The unknown one stays uncertain: no evidence is no settlement and no zero.
    assert.equal(
      (
        await one<{ s: string }>(`SELECT state AS s FROM sophia.research_reservations WHERE id=$1`, [
          unknown.reservationId,
        ])
      ).s,
      'uncertain',
    )
    // The existing overrun rule still blocks new paid work until the overrun itself is reconciled (0029).
    assert.match(await refusal(reserve(w.legacy, pf.at, 'llm-after')), /overrun/)
  })
})

describe('B/C. causes, nonmonetary adjudication and the ACTUAL allowance gate with recurrence (account-null)', () => {
  it('a settled conflict adjudicates without money; the certificate reopens the real gate; a repeat is stable; a fresh conflict restricts again', async () => {
    const w = await world()
    const pf = await projectFunded(w)
    const r1 = await reserve(w.legacy, pf.at, 'c-1')
    await settle(w.legacy, pf.at, r1.reservationId)
    await settle(w.legacy, pf.at, r1.reservationId, { output: 77 })
    const allowance = (await allowanceOfTask(pf.taskId)).id
    const scope = { project: w.projectId, allowance }
    assert.match(await refusal(reserve(w.legacy, pf.at, 'n-1')), GATE, 'the actual gate is closed')
    const [cause] = await causesOf(scope)
    assert.deepEqual([cause!.seq, cause!.kind], [1, 'conflict'])
    const money = await allowanceOfTask(pf.taskId)
    const evidence = await evidenceOf(w.projectId)
    const certAuth = await authority('certification', { projectId: w.projectId, allowanceId: allowance })
    assert.match(
      await refusal(certifyAllowance(w.projectId, allowance, certAuth)),
      /not adjudicated/,
      'no certificate before adjudication',
    )
    const adjAuth = await authority('cause_adjudication', { projectId: w.projectId, allowanceId: allowance })
    const adj = await adjudicate(cause!, adjAuth)
    assert.deepEqual(
      [adj.outcome, adj.reservationState, adj.settledUsd],
      ['original_money_stands', 'settled', '0.010000'],
    )
    assert.deepEqual(await adjudicate(cause!, adjAuth), adj, 'exact replay')
    const cert = await certifyAllowance(w.projectId, allowance, certAuth)
    assert.deepEqual(await allowanceOfTask(pf.taskId), money, 'adjudication and certification move no money')
    assert.deepEqual(await evidenceOf(w.projectId), evidence, 'nor truth, history, identities or witnesses')
    // The ACTUAL reserve gate reopens.
    const n2 = await reserve(w.legacy, pf.at, 'n-2')
    await settle(w.legacy, pf.at, n2.reservationId)
    // Repeating the covered conflicting input is a history replay: no new cause, no new episode, the gate stays open.
    await settle(w.legacy, pf.at, r1.reservationId, { output: 77 })
    assert.equal((await causesOf(scope)).length, 1)
    assert.equal(await episodesOf(w.projectId, allowance), 1)
    await reserve(w.legacy, pf.at, 'n-3')
    assert.deepEqual(
      await certifyResearchAllowance(owner, {
        version: 'research-certify-allowance-v1',
        projectId: w.projectId,
        allowanceId: allowance,
        episode: '1',
        causeSetDigest: cert.causeSetDigest,
        authorityId: certAuth,
        evidenceRef: 'synthetic: allowance certification fixture',
      }),
      cert,
      'exact certificate replay',
    )
    // A fresh conflict (new evidence, new digest) restricts AGAIN; the historical row stays one row.
    await settle(w.legacy, pf.at, n2.reservationId, { output: 88 })
    assert.equal((await causesOf(scope)).length, 2)
    assert.equal(await episodesOf(w.projectId, allowance), 2)
    assert.match(await refusal(reserve(w.legacy, pf.at, 'n-4')), GATE)
    assert.equal(
      (
        await rows(`SELECT 1 FROM sophia.research_allowance_restrictions WHERE project_id=$1 AND allowance_id=$2`, [
          w.projectId,
          allowance,
        ])
      ).length,
      1,
    )
  })

  it('an overflow on an open reservation: money first (known evidence), then adjudication; a first and a later distinct cause both matter', async () => {
    const w = await world()
    const pf = await projectFunded(w)
    const r = await reserve(w.legacy, pf.at, 'o-1')
    await fillCap(w.legacy, pf.at, r.reservationId)
    await settleUncertain(w.legacy, pf.at, r.reservationId, corr(16))
    const allowance = (await allowanceOfTask(pf.taskId)).id
    const scope = { project: w.projectId, allowance }
    const [overflow] = await causesOf(scope)
    assert.deepEqual([overflow!.kind, overflow!.seq], ['overflow', 1])
    assert.match(await refusal(reserve(w.legacy, pf.at, 'n-1')), GATE)
    const adjAuth = await authority('cause_adjudication', { projectId: w.projectId, allowanceId: allowance })
    assert.match(
      await refusal(adjudicate(overflow!, adjAuth)),
      /still open/,
      'nonmonetary adjudication never stands in for money',
    )
    const payAuth = await authority('provider_billed_attestation', { projectId: w.projectId, allowanceId: allowance })
    await reconcileResearchReservation(owner, await reconcileInput(w.projectId, r.reservationId, payAuth, '0.020000'))
    await adjudicate(overflow!, adjAuth)
    // A later distinct cause on another reservation of the same allowance (opened while the episode is still open).
    const r2 = await reserve(w.legacy, pf.at, 'o-2').catch(() => null)
    assert.equal(r2, null, 'still restricted: the episode is open')
    const certAuth = await authority('certification', { projectId: w.projectId, allowanceId: allowance })
    const cert = await certifyAllowance(w.projectId, allowance, certAuth)
    assert.equal(cert.coveredThrough, 1)
    const r3 = await reserve(w.legacy, pf.at, 'o-3')
    await settle(w.legacy, pf.at, r3.reservationId)
    await settle(w.legacy, pf.at, r3.reservationId, { output: 99 })
    const causes = await causesOf(scope)
    assert.deepEqual(
      causes.map((c) => [c.seq, c.kind]),
      [
        [1, 'overflow'],
        [2, 'conflict'],
      ],
    )
    // The post-cap repeat of the covered overflow input is the same cause: nothing new.
    await settleUncertain(w.legacy, pf.at, r.reservationId, corr(16)).catch(() => null)
    assert.equal((await causesOf(scope)).length, 2)
    // Only the first cause adjudicated is not enough: the later distinct cause keeps the gate closed.
    assert.match(await refusal(certifyAllowance(w.projectId, allowance, certAuth)), /not adjudicated/)
    await adjudicate(causes[1]!, adjAuth)
    await certifyAllowance(w.projectId, allowance, certAuth)
    await reserve(w.legacy, pf.at, 'o-4')
  })
})

describe('D. account certificate: every alias, project and cause; fresh after the last wait; guard LAST', () => {
  /** One account, two alias connections in two projects, a settled conflict in each. */
  async function twoProjects() {
    const w1 = await world()
    const w2 = await world({ owner: w1.OWNER })
    assert.equal(w2.account, w1.account, 'the same account (an alias connection)')
    const s1 = await started(w1)
    const s2 = await started(w2)
    const r1 = await reserve(w1.who, s1.at, 'a-1')
    await settle(w1.who, s1.at, r1.reservationId)
    const r2 = await reserve(w2.who, s2.at, 'b-1')
    await settle(w2.who, s2.at, r2.reservationId)
    // A settled call in the other project, used later for a NEW conflicting input while the account is restricted.
    const b2 = await reserve(w2.who, s2.at, 'b-2')
    await settle(w2.who, s2.at, b2.reservationId)
    await settle(w1.who, s1.at, r1.reservationId, { output: 77 })
    await settle(w2.who, s2.at, r2.reservationId, { output: 77 })
    assert.equal(await guardOf(w1.account), true)
    return { w1, w2, s1, s2, r1, r2, b2 }
  }

  it('certifies only the complete set: an uncovered other-project cause, a stale project set or a stale alias set refuses; then recurrence', async () => {
    const { w1, w2, s1, s2, r2 } = await twoProjects()
    const causes = await causesOf({ account: w1.account })
    assert.deepEqual(causes.map((c) => c.project_id).toSorted(), [w1.projectId, w2.projectId].toSorted())
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    const certAuth = await authority('certification', { accountId: w1.account })
    await adjudicate(causes[0]!, adjAuth)
    const input = await accountInput(w1.account, certAuth)
    assert.deepEqual(input.projectIds, [w1.projectId, w2.projectId].toSorted())
    assert.deepEqual(input.connectionIds, [w1.connectionId, w2.connectionId].toSorted())
    assert.match(
      await refusal(certifyResearchAccount(owner, input)),
      /not adjudicated/,
      'the uncovered other-project cause',
    )
    await adjudicate(causes[1]!, adjAuth)
    assert.match(
      await refusal(certifyResearchAccount(owner, { ...input, projectIds: [w1.projectId] })),
      /projects changed/,
      'only the selected project',
    )
    assert.match(
      await refusal(certifyResearchAccount(owner, { ...input, connectionIds: [w1.connectionId] })),
      /connections changed/,
      'only one connection',
    )
    const cert = await certifyResearchAccount(owner, input)
    assert.equal(cert.coveredThrough, 2)
    assert.equal(await guardOf(w1.account), false)
    assert.deepEqual(await certifyResearchAccount(owner, input), cert, 'exact replay')
    // The real account gate reopens (a new paid call through either alias).
    await reserve(w1.who, s1.at, 'a-2')
    // Recurrence: a fresh conflict in the OTHER project restricts the account again; the certificate stays as it was.
    const b3 = await reserve(w2.who, s2.at, 'b-3')
    await settle(w2.who, s2.at, b3.reservationId)
    await settle(w2.who, s2.at, b3.reservationId, { output: 66 })
    assert.equal(await guardOf(w1.account), true)
    assert.equal((await causesOf({ account: w1.account })).length, 3)
    assert.match(await refusal(reserve(w1.who, s1.at, 'a-3')), GATE)
    // The repeat of an adjudicated input is no new cause.
    await settle(w2.who, s2.at, r2.reservationId, { output: 77 })
    assert.equal((await causesOf({ account: w1.account })).length, 3)
  })

  it('writer first: a new cause in another project, committed while the certification waits, refuses it (last-wait freshness)', async () => {
    const { w1, w2, s2, r2, b2 } = await twoProjects()
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    const certAuth = await authority('certification', { accountId: w1.account })
    for (const c of await causesOf({ account: w1.account })) await adjudicate(c, adjAuth)
    const input = await accountInput(w1.account, certAuth)
    const holder = await owner.connect()
    const certifier = await owner.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [w2.projectId])
      const h = await pidOf(holder)
      // The already-restricted writer (the guard is true) waits at the project row with a conflicting input.
      const writing = outcomeOf(settle(w2.who, s2.at, b2.reservationId, { output: 55 }))
      const writer = await blockedBy(h, 'the writer')
      await waitingOn(writer, 'sophia.projects')
      const certifying = outcomeOf(certifyResearchAccount(certifier, input))
      await blockedBy(writer, 'the certification (queued behind the writer)', [])
      await holder.query('COMMIT')
      const wrote = await writing
      assert.ok('ok' in wrote, JSON.stringify(wrote))
      const certified = await certifying
      assert.ok('refused' in certified && /causes changed/.test(certified.refused), JSON.stringify(certified))
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
      certifier.release()
    }
    assert.equal(await guardOf(w1.account), true, 'incomplete coverage leaves the restriction active')
    assert.equal(
      (await causesOf({ account: w1.account })).length,
      3,
      'the already-restricted writer still recorded its cause',
    )
    void r2
  })

  it('certifier first: the certification holds the projects, aliases and guard; the other-project writer waits, then restricts anew', async () => {
    const { w1, w2, s2, b2 } = await twoProjects()
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    const certAuth = await authority('certification', { accountId: w1.account })
    for (const c of await causesOf({ account: w1.account })) await adjudicate(c, adjAuth)
    const input = await accountInput(w1.account, certAuth)
    const certifier = await owner.connect()
    let writing: Promise<Outcome> | null = null
    try {
      await certifier.query('BEGIN')
      await certifyResearchAccount(certifier, input)
      writing = outcomeOf(settle(w2.who, s2.at, b2.reservationId, { output: 55 }))
      const writer = await blockedBy(await pidOf(certifier), 'the writer')
      await waitingOn(writer, 'sophia.projects')
      await certifier.query('COMMIT')
    } catch (err) {
      await certifier.query('ROLLBACK')
      throw err
    } finally {
      certifier.release()
    }
    const wrote = await writing
    assert.ok('ok' in wrote, JSON.stringify(wrote))
    assert.equal(await guardOf(w1.account), true, 'the new cause restricted the account again after the certificate')
    assert.equal(
      (await rows(`SELECT 1 FROM sophia.research_account_certificates WHERE account_id=$1`, [w1.account])).length,
      1,
    )
    assert.equal((await causesOf({ account: w1.account })).length, 3)
  })

  it('membership: a new alias or a new project grant waits for a pending certification (connection/project protocol) and a change before the last wait refuses', async () => {
    const { w1 } = await twoProjects()
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    const certAuth = await authority('certification', { accountId: w1.account })
    for (const c of await causesOf({ account: w1.account })) await adjudicate(c, adjAuth)
    // A third project where the owner is a member, for a new grant on an existing alias connection.
    const ADMIN3 = randomUUID()
    const { projectId: p3 } = await seedProject(db.ownerUrl, { admin: ADMIN3, editors: [w1.OWNER], viewers: [] })
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [p3])
    const grantInput = {
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      taskCapUsd: 2,
      totalCapUsd: 5,
      fundingPolicy: 'bounded_total_spend' as const,
      fundingAcknowledgementRef: 'synthetic acknowledgement',
    }
    // (1) Pending certification: the certifier holds the projects, aliases and guard (uncommitted).
    const input = await accountInput(w1.account, certAuth)
    const certifier = await owner.connect()
    let granting: Promise<Outcome> | null = null
    let aliasing: Promise<Outcome> | null = null
    let grantBlocked = false
    let aliasBlocked = false
    try {
      await certifier.query('BEGIN')
      await certifyResearchAccount(certifier, input)
      const cpid = await pidOf(certifier)
      granting = outcomeOf(
        withActor(api, w1.OWNER, 'write', (c) => createContributionGrant(c, w1.connectionId, p3, grantInput)),
      )
      const g = await blockedBy(cpid, 'the new grant on an alias of the account')
      grantBlocked = await stillBlocked(g, cpid)
      aliasing = outcomeOf(
        withActor(api, w1.OWNER, 'write', (c) => createApiConnection(c, w1.account, 'Alias key', 'Operator host')),
      )
      await sleep(300)
      const a = await rows<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND pid<>$2`,
        [cpid, g],
      )
      aliasBlocked = a.length > 0
      await certifier.query('COMMIT')
    } catch (err) {
      await certifier.query('ROLLBACK')
      throw err
    } finally {
      certifier.release()
    }
    const granted = await granting
    const aliased = await aliasing
    assert.ok('ok' in granted, JSON.stringify(granted))
    assert.ok('ok' in aliased, JSON.stringify(aliased))
    assert.equal(grantBlocked, true, 'a new project grant on the account waits for the pending certification')
    // Characterized, not assumed: a bare new alias (no grant, no project, no cause) does not take the account's
    // existing project/connection locks; it adds nothing a certificate must cover, and any cause through it restricts anew.
    assert.equal(aliasBlocked, false, 'a bare new alias is not serialized with the certification (characterized)')
    // (2) The changed membership, before the last wait of a NEXT certification, refuses it.
    const stale = input
    const fresh = await accountInput(w1.account, certAuth)
    assert.ok(fresh.projectIds.includes(p3) || fresh.connectionIds.length === 3)
    assert.match(
      await refusal(certifyResearchAccount(owner, { ...stale, evidenceRef: 'synthetic: second attempt' })),
      /changed/,
    )
  })

  it('last-wait freshness: a new alias committed while the certification waits at a project row refuses it; the guard stays restricted', async () => {
    const { w1, w2 } = await twoProjects()
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    const certAuth = await authority('certification', { accountId: w1.account })
    for (const c of await causesOf({ account: w1.account })) await adjudicate(c, adjAuth)
    const input = await accountInput(w1.account, certAuth)
    const holder = await owner.connect()
    const certifier = await owner.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE`, [w2.projectId])
      const h = await pidOf(holder)
      const certifying = outcomeOf(certifyResearchAccount(certifier, input))
      const waiter = await blockedBy(h, 'the certification')
      await waitingOn(waiter, 'sophia.projects')
      // A maintained membership change that takes none of the held rows: a new alias connection of the account.
      const alias = await withActor(api, w1.OWNER, 'write', (c) =>
        createApiConnection(c, w1.account, 'Alias key', 'Operator host'),
      )
      assert.ok(alias.connectionId)
      await holder.query('COMMIT')
      const certified = await certifying
      assert.ok(
        'refused' in certified && /changed while the certification waited/.test(certified.refused),
        JSON.stringify(certified),
      )
    } finally {
      await holder.query('ROLLBACK')
      holder.release()
      certifier.release()
    }
    assert.equal(await guardOf(w1.account), true, 'incomplete alias coverage leaves the restriction active')
    assert.equal(
      (await rows(`SELECT 1 FROM sophia.research_account_certificates WHERE account_id=$1`, [w1.account])).length,
      0,
    )
  })

  it('unknown effects stay barriers: an uncertain contributed reservation still blocks admission after a valid account certificate', async () => {
    const w1 = await world()
    const s1 = await started(w1)
    const u = await reserve(w1.who, s1.at, 'a-unknown')
    await settleUncertain(w1.who, s1.at, u.reservationId)
    const r = await reserve(w1.who, s1.at, 'a-1')
    await settle(w1.who, s1.at, r.reservationId)
    await settle(w1.who, s1.at, r.reservationId, { output: 77 })
    assert.equal(await guardOf(w1.account), true)
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    const certAuth = await authority('certification', { accountId: w1.account })
    for (const c of await causesOf({ account: w1.account })) await adjudicate(c, adjAuth)
    await certifyResearchAccount(owner, await accountInput(w1.account, certAuth))
    assert.equal(await guardOf(w1.account), false)
    assert.equal(
      (await one<{ u: boolean }>(`SELECT sophia.contribution_account_uncertain($1) AS u`, [w1.account])).u,
      true,
      'a certificate settles no unknown effect',
    )
    // Admission stays refused by an existing contribution barrier (the uncertain effect is one; the refusal code that fires
    // first is recorded, not assumed).
    // The refusal that fires first at admission is recorded exactly (observed: account_busy, the running lineage); the
    // uncertain-effect barrier itself is the 0105 predicate asserted above.
    assert.match(await refusal(ask(w1)), /Contribution unavailable: (account_busy|uncertain_effects_unreconciled)/)
    // A revoked qualification is still its own barrier after the certificate.
    const q = await one<{ id: string }>(
      `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
      [w1.connectionId],
    )
    await owner.query(`SELECT sophia.revoke_api_account_qualification($1,$2)`, [
      q.id,
      'synthetic: revoked after the certificate',
    ])
    assert.match(await refusal(reserve(w1.who, s1.at, 'a-after')), /Contribution unavailable/)
  })
})

describe('E/T05. authority is durable and operator-only; forged settings and fields reach nothing', () => {
  it('no ordinary role executes or writes, whatever it sets; a forged certificate pointer cannot clear a guard', async () => {
    const { w1 } = await (async () => {
      const w = await world()
      const s = await started(w)
      const r = await reserve(w.who, s.at, 'g-1')
      await settle(w.who, s.at, r.reservationId)
      await settle(w.who, s.at, r.reservationId, { output: 77 })
      return { w1: w }
    })()
    const certAuth = await authority('certification', { accountId: w1.account })
    const forged = randomUUID()
    for (const pool of [api, worker]) {
      const c = await pool.connect()
      try {
        await c.query(`SET sophia.research_certificate = '${forged}'`)
        await c.query(`SET sophia.approval_ref = 'approval:forged'`)
        for (const [sql, params] of [
          [`SELECT sophia.certify_research_account($1)`, [await accountInput(w1.account, certAuth)]],
          [`SELECT sophia.reconcile_research_reservation('{}'::jsonb)`, []],
          [`SELECT sophia.adjudicate_research_cause('{}'::jsonb)`, []],
          [`SELECT sophia.record_research_financial_authority('{}'::jsonb)`, []],
          [`UPDATE sophia.research_evidence_guards SET restricted=false WHERE account_id=$1`, [w1.account]],
          [
            `INSERT INTO sophia.research_account_certificates(id,account_id,covered_through_seq,project_ids,connection_ids,cause_set_digest,authority_id,input,digest,result)
            VALUES(gen_random_uuid(),$1,0,'{}','{}',repeat('a',64),gen_random_uuid(),'{}'::jsonb,repeat('a',64),'{}'::jsonb)`,
            [w1.account],
          ],
          [`SELECT * FROM sophia.research_restriction_causes`, []],
        ] as const)
          assert.match(await refusal(c.query(sql, [...params])), /42501|permission denied/)
      } finally {
        c.release(true)
      }
    }
    // Even the owner, with a pointer to a REAL certificate of another transaction, cannot clear the guard by hand.
    const adjAuth = await authority('cause_adjudication', { accountId: w1.account })
    for (const c of await causesOf({ account: w1.account })) await adjudicate(c, adjAuth)
    const cert = await certifyResearchAccount(owner, await accountInput(w1.account, certAuth))
    const k = await owner.connect()
    try {
      await k.query('BEGIN')
      await k.query(
        `UPDATE sophia.research_evidence_guards SET restricted=true, restricted_at=now(), first_project_id=$2, first_reservation_id=$3 WHERE account_id=$1`,
        [w1.account, w1.projectId, randomUUID()],
      )
      await k.query(`SELECT set_config('sophia.research_certificate',$1,true)`, [cert.certificateId])
      assert.match(
        await refusal(
          k.query(
            `UPDATE sophia.research_evidence_guards SET restricted=false, restricted_at=NULL, first_project_id=NULL, first_reservation_id=NULL WHERE account_id=$1`,
            [w1.account],
          ),
        ),
        /sticky/,
        "another transaction's certificate is not this clearing's authority",
      )
    } finally {
      await k.query('ROLLBACK')
      k.release()
    }
    assert.match(
      await refusal(owner.query(`DELETE FROM sophia.research_account_certificates WHERE id=$1`, [cert.certificateId])),
      /append-only/,
    )
  })
})

// --- R1 (C3REC-F01/F02): governed late facts and rollback controls ------------------------------------------------

const reserveObserved = (who: RuntimeCaller, at: At, callId: string) =>
  service((c) =>
    runtimeResearchReserve(c, who, {
      ...at,
      callId,
      kind: 'model',
      provider: 'openai-research',
      amountUsd: 0.1,
      ...TRACKED,
      facts: 'observed_v1' as const,
    }),
  )
/** A complete C1P report with its observed_v1 facts (consistent raw counts, a supported N1): what the runtime would send. */
const observedComplete = (at: At, reservationId: string, o: { cost?: number; output?: number; n1?: string } = {}) => {
  const b = complete(at, reservationId, o)
  return {
    ...b,
    evidence: {
      ...b.evidence,
      observed: {
        sent: 'observable_transport_response' as const,
        httpStatus: 200,
        n1: { id: { status: 'supported' as const, value: o.n1 ?? 'resp_late_1' }, sources: ['completed' as const] },
        providerTerminal: 'completed' as const,
        rawCounts: { inputTotal: 3, cacheRead: 0, output: o.output ?? 4 },
        deliveryUnknownReason: 'none' as const,
      },
    },
  }
}
/** Drain and fence the world's contribution resource (0111); the new current runtime (`next`) serves later work. */
async function drainAndFence(w: World) {
  const token = randomUUID() + randomUUID()
  await registerContributionRuntime(owner, {
    projectId: w.projectId,
    connectionId: w.connectionId,
    runtimeUnitId: `${UNIT}-2`,
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: true,
  })
  const gen = (
    await one<{ g: string }>(`SELECT sophia.contribution_runtime_generation($1,$2) AS g`, [w.projectId, w.resourceId])
  ).g
  const fence = (
    await one<{ r: { fenceId: string; generation: string } }>(
      `SELECT sophia.fence_contribution_runtime($1,$2,$3) AS r`,
      [w.projectId, w.resourceId, gen],
    )
  ).r
  return fence
}
/**
 * The closed late-fact input for a tracked call: its original binding read from the identity row, the generation token of
 * its ORIGINAL resource, and that resource's fence where it has one (R2 P03: null where it has none).
 */
async function lateInput(
  projectId: string,
  reservationId: string,
  authorityId: string,
  operationKey: string,
  report: Record<string, unknown>,
): Promise<LateFactsInput> {
  const i = await one<{
    attempt_id: string
    native_session_id: string
    call_id: string
    runtime_unit_id: string
    runtime_id: string
    resource_id: string
    operation: 'research' | 'design' | 'source_review'
    provider: string
    account_id: string | null
    grant_id: string | null
    allowance_id: string
  }>(
    `SELECT attempt_id, native_session_id, call_id, runtime_unit_id, runtime_id, resource_id, operation, provider, account_id, grant_id, allowance_id
     FROM sophia.research_call_identities WHERE project_id=$1 AND reservation_id=$2`,
    [projectId, reservationId],
  )
  const f = await one<{ id: string } | undefined>(
    `SELECT id FROM sophia.research_runtime_fences WHERE project_id=$1 AND resource_id=$2`,
    [projectId, i.resource_id],
  )
  const generation = (
    await one<{ g: string | null }>(`SELECT sophia.contribution_runtime_generation($1,$2) AS g`, [
      projectId,
      i.resource_id,
    ])
  ).g
  return {
    version: 'research-late-facts-v1',
    operationKey,
    projectId,
    reservationId,
    expected: {
      attemptId: i.attempt_id,
      nativeSessionId: i.native_session_id,
      callId: i.call_id,
      runtimeUnitId: i.runtime_unit_id,
      runtimeId: i.runtime_id,
      resourceId: i.resource_id,
      operation: i.operation,
      provider: i.provider,
      accountId: i.account_id,
      grantId: i.grant_id,
      allowanceId: i.allowance_id,
      fenceId: f?.id ?? null,
      generation,
    },
    report,
    authorityId,
    evidenceRef: 'synthetic: late provider report fixture',
  }
}
/** The money of a reservation and its allowance, byte for byte. */
const moneyOf = async (projectId: string, reservationId: string) => ({
  reservation: await one<{ j: unknown }>(
    `SELECT to_jsonb(r) - 'usage' AS j FROM sophia.research_reservations r WHERE project_id=$1 AND id=$2`,
    [projectId, reservationId],
  ),
  allowance: await one<{ j: unknown }>(
    `SELECT to_jsonb(a) AS j FROM sophia.research_allowances a JOIN sophia.research_reservations r ON r.project_id=a.project_id AND r.allowance_id=a.id
     WHERE r.project_id=$1 AND r.id=$2`,
    [projectId, reservationId],
  ),
  usage: await one<{ u: unknown }>(
    `SELECT usage AS u FROM sophia.research_reservations WHERE project_id=$1 AND id=$2`,
    [projectId, reservationId],
  ),
})
const truthOf = (reservationId: string) =>
  one<
    | {
        outcome: string
        cost: string | null
        consumer_ending: string
        output: string | null
        n1_status: string
        history_count: number
        first_conflict_digest: string | null
      }
    | undefined
  >(
    `SELECT outcome, cost_usd::text AS cost, consumer_ending, output::text AS output, n1_status, history_count, first_conflict_digest
     FROM sophia.research_call_truth WHERE reservation_id=$1`,
    [reservationId],
  )
/** The truth row, which must exist: its raw facts apart from its financial pair. */
const truthMust = async (reservationId: string) => {
  const t = await truthOf(reservationId)
  assert.ok(t, 'a truth row')
  return t
}
const historyCount = async (reservationId: string) =>
  Number(
    (
      await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.research_call_history WHERE reservation_id=$1`, [
        reservationId,
      ])
    ).n,
  )
const lateOps = async (reservationId: string) =>
  Number(
    (
      await one<{ n: string }>(
        `SELECT count(*) AS n FROM sophia.research_late_fact_operations WHERE reservation_id=$1`,
        [reservationId],
      )
    ).n,
  )

describe('R1 C3REC-F01: governed late original-generation facts (fact-only, never money)', () => {
  it('late facts on a RESERVED and an UNCERTAIN target (unknown billed basis) are recorded durably with money byte-identical; billed cost later, once', async () => {
    const w = await world()
    const w2 = await world({ owner: w.OWNER })
    const s = await started(w)
    const s2 = await started(w2)
    const open = await reserveObserved(w.who, s.at, 'late-reserved')
    const unc = await reserveObserved(w.who, s.at, 'late-uncertain')
    await settleUncertain(w.who, s.at, unc.reservationId)
    const fence = await drainAndFence(w)
    // The native late call stays refused by the fence.
    assert.match(
      await refusal(
        service((c) => runtimeResearchSettle(c, w.who, observedComplete(s.at, open.reservationId, { cost: 0.02 }))),
      ),
      /Runtime capability revoked/,
    )
    const auth = await authority('late_fact_attestation', { accountId: w.account })
    const money0 = await moneyOf(w.projectId, open.reservationId)
    const moneyU0 = await moneyOf(w.projectId, unc.reservationId)
    // RESERVED target, a COMPLETE observed report: recorded, no charge.
    const input = await lateInput(
      w.projectId,
      open.reservationId,
      auth,
      'late:open:1',
      observedComplete(s.at, open.reservationId, { cost: 0.02 }),
    )
    assert.equal(input.expected.fenceId, fence.fenceId)
    const result = await recordResearchLateFacts(owner, input)
    assert.deepEqual(
      [result.disposition, result.replay, result.newCause, result.fenceId, result.generation, result.originalBasis],
      ['accepted', false, false, fence.fenceId, fence.generation, 'fence'],
    )
    // R2 P02: the report's claim is kept as a claim; the money is the money.
    assert.deepEqual(result.reported, { outcome: 'settled', costUsd: '0.020000', basis: 'reported_unverified' })
    assert.deepEqual(result.financial, { reservationState: 'reserved', settledUsd: null })
    assert.deepEqual(
      await moneyOf(w.projectId, open.reservationId),
      money0,
      'reservation and allowance money byte-identical',
    )
    const t = await truthMust(open.reservationId)
    // R2 P02: the raw facts are complete and durable (a complete ending, its counts and witnesses), while the truth's
    // financial pair stays the open money's: unknown, never the unverified reported cost.
    assert.deepEqual(
      [t.consumer_ending, t.output, t.n1_status, t.history_count],
      ['stream_completed', '4', 'supported', 1],
      'the raw facts are durable',
    )
    assert.deepEqual([t.outcome, t.cost], ['uncertain', null], 'no unverified cost reads as settled truth')
    assert.deepEqual(
      (await researchLateFactRecords(owner, w.projectId, open.reservationId)).map((x) => [
        x.operationKey,
        x.originalBasis,
        x.reported,
        x.moneyAtOperation,
      ]),
      [
        [
          'late:open:1',
          'fence',
          { outcome: 'settled', costUsd: '0.020000', basis: 'reported_unverified' },
          { reservationState: 'reserved', settledUsd: null },
        ],
      ],
    )
    assert.equal(
      (
        await one<{ s: string }>(`SELECT state AS s FROM sophia.research_reservations WHERE id=$1`, [
          open.reservationId,
        ])
      ).s,
      'reserved',
      'a complete observation is not a charge',
    )
    // UNCERTAIN target, a complete report too: recorded, money unchanged.
    const ru = await recordResearchLateFacts(
      owner,
      await lateInput(
        w.projectId,
        unc.reservationId,
        auth,
        'late:unc:1',
        observedComplete(s.at, unc.reservationId, { cost: 0.03, n1: 'resp_late_2' }),
      ),
    )
    assert.equal(ru.disposition, 'extended')
    assert.deepEqual(await moneyOf(w.projectId, unc.reservationId), moneyU0)
    assert.deepEqual(ru.financial, { reservationState: 'uncertain', settledUsd: null })
    const tu = await truthMust(unc.reservationId)
    assert.deepEqual(
      [tu.outcome, tu.cost, tu.consumer_ending, tu.n1_status],
      ['uncertain', null, 'stream_completed', 'supported'],
      'the extension keeps the complete facts and the unknown financial outcome',
    )
    // P01: the same key + the same input replays (also on a new connection); the same key + changed facts refuses.
    assert.deepEqual(await recordResearchLateFacts(owner, input), result)
    const fresh = new pg.Client({ connectionString: db.ownerUrl })
    await fresh.connect()
    try {
      assert.deepEqual(await recordResearchLateFacts(fresh, input), result)
    } finally {
      await fresh.end()
    }
    assert.match(
      await refusal(
        recordResearchLateFacts(owner, {
          ...input,
          report: observedComplete(s.at, open.reservationId, { cost: 0.02, output: 5 }),
        }),
      ),
      /names another input/,
    )
    assert.match(
      await refusal(
        recordResearchLateFacts(owner, { ...input, expected: { ...input.expected, generation: 'b'.repeat(64) } }),
      ),
      /names another input/,
    )
    // Wrong binding, fence, authority and bounds under DISTINCT keys refuse with no record.
    for (const [what, bad, why] of [
      [
        'another attempt',
        { ...input, operationKey: 'late:bad:1', expected: { ...input.expected, attemptId: randomUUID() } },
        /Invalid late-fact input|original binding/,
      ],
      [
        'another call',
        { ...input, operationKey: 'late:bad:2', expected: { ...input.expected, callId: 'other' } },
        /original binding/,
      ],
      [
        'another allowance',
        { ...input, operationKey: 'late:bad:3', expected: { ...input.expected, allowanceId: randomUUID() } },
        /original binding/,
      ],
      [
        'another generation',
        { ...input, operationKey: 'late:bad:4', expected: { ...input.expected, generation: 'c'.repeat(64) } },
        /their original generation/,
      ],
      [
        'a null generation for a resource with a contribution link',
        { ...input, operationKey: 'late:bad:5', expected: { ...input.expected, fenceId: null, generation: null } },
        /their original generation/,
      ],
      [
        'the existing fence ignored',
        { ...input, operationKey: 'late:bad:5b', expected: { ...input.expected, fenceId: null } },
        /fence of their original generation/,
      ],
      [
        'another fence named',
        { ...input, operationKey: 'late:bad:5c', expected: { ...input.expected, fenceId: randomUUID() } },
        /fence of their original generation/,
      ],
      [
        'an unknown report key',
        { ...input, operationKey: 'late:bad:6', report: { ...input.report, providerRequestId: 'x' } },
        /Invalid late-fact input/,
      ],
      [
        'an over-bound report',
        { ...input, operationKey: 'late:bad:7', report: { ...input.report, evidence: { pad: 'x'.repeat(262145) } } },
        /exceeds its bound/,
      ],
      [
        'malformed evidence',
        {
          ...input,
          operationKey: 'late:bad:8',
          report: { ...input.report, evidence: { contract: 'c1p_complete_report' } },
        },
        /Invalid settlement evidence/,
      ],
    ] as const) {
      assert.match(await refusal(recordResearchLateFacts(owner, bad)), why, what)
    }
    for (const kind of ['provider_billed_attestation', 'certification'] as const) {
      const wrong = await authority(kind, { accountId: w.account })
      assert.match(
        await refusal(
          recordResearchLateFacts(owner, { ...input, operationKey: `late:auth:${kind}`, authorityId: wrong }),
        ),
        /No operator authority/,
      )
    }
    const revoked = await authority('late_fact_attestation', { accountId: w.account })
    await revokeResearchFinancialAuthority(owner, revoked, 'synthetic: revoked before use')
    assert.match(
      await refusal(recordResearchLateFacts(owner, { ...input, operationKey: 'late:revoked', authorityId: revoked })),
      /No operator authority/,
    )
    assert.equal(await lateOps(open.reservationId), 1, 'refusals left no operation record')
    // A DISTINCT key carrying the same covered observation appends nothing (no history, no cause).
    const h1 = await historyCount(open.reservationId)
    const covered = await recordResearchLateFacts(owner, { ...input, operationKey: 'late:open:2' })
    assert.deepEqual([covered.replay, covered.newCause], [true, false])
    assert.equal(await historyCount(open.reservationId), h1)
    assert.equal(await guardOf(w.account), false)
    await reserve(w2.who, s2.at, 'still-open')
    // A DISTINCT key with a genuinely conflicting later observation: a retained cause; the ACTUAL account gate closes.
    const conflicting = await recordResearchLateFacts(owner, {
      ...input,
      operationKey: 'late:open:3',
      report: observedComplete(s.at, open.reservationId, { cost: 0.02, output: 77 }),
    })
    assert.deepEqual([conflicting.disposition, conflicting.newCause], ['conflict', true])
    assert.equal(await guardOf(w.account), true)
    assert.match(
      await refusal(reserve(w2.who, s2.at, 'after-conflict')),
      GATE,
      'the real account gate, through the alias project',
    )
    assert.equal(
      (await truthOf(open.reservationId))?.first_conflict_digest !== null,
      true,
      'the first conflict is retained',
    )
    assert.deepEqual(await moneyOf(w.projectId, open.reservationId), money0, 'still no money moved')
    // The runtime is not reactivated.
    assert.deepEqual(
      (
        await rows<{ state: string }>(
          `SELECT state FROM sophia.runtime_instances WHERE project_id=$1 AND resource_id=$2`,
          [w.projectId, w.resourceId],
        )
      ).map((x) => x.state),
      ['revoked'],
    )
    // Later, the separate billed-cost reconciliation settles the RESERVED target exactly once.
    const pay = await authority('provider_billed_attestation', { accountId: w.account })
    const truthBefore = await truthOf(open.reservationId)
    const recordsBefore = await researchLateFactRecords(owner, w.projectId, open.reservationId)
    // The billed basis is the attestation's, not the claim's: 0.030000 against the reported 0.020000.
    const billed = await reconcileResearchReservation(
      owner,
      await reconcileInput(w.projectId, open.reservationId, pay, '0.030000'),
    )
    assert.deepEqual([billed.priorState, billed.state, billed.settledUsd], ['reserved', 'settled', '0.030000'])
    assert.deepEqual(
      await reconcileResearchReservation(
        owner,
        await reconcileInput(w.projectId, open.reservationId, pay, '0.030000').then((x) => ({
          ...x,
          expected: { ...x.expected, state: 'reserved' as const },
        })),
      ),
      billed,
    )
    assert.deepEqual(await truthOf(open.reservationId), truthBefore, 'the reconciliation leaves the late facts alone')
    assert.deepEqual(await researchLateFactRecords(owner, w.projectId, open.reservationId), recordsBefore)
  })

  it('a late-fact operation rolled back leaves no record or fact; then it commits once and replays', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserveObserved(w.who, s.at, 'late-roll')
    await drainAndFence(w)
    const auth = await authority('late_fact_attestation', { accountId: w.account })
    const input = await lateInput(
      w.projectId,
      r.reservationId,
      auth,
      'late:roll:1',
      observedComplete(s.at, r.reservationId, { cost: 0.02 }),
    )
    const money0 = await moneyOf(w.projectId, r.reservationId)
    const op = await owner.connect()
    try {
      await op.query('BEGIN')
      const inTx = await recordResearchLateFacts(op, input)
      assert.equal(inTx.disposition, 'accepted')
      assert.equal(
        Number(
          (
            await op.query<{ n: string }>(
              `SELECT count(*) AS n FROM sophia.research_call_history WHERE reservation_id=$1`,
              [r.reservationId],
            )
          ).rows[0]!.n,
        ),
        1,
        'inside the transaction',
      )
      await op.query('ROLLBACK')
    } finally {
      // A failed assertion inside the transaction must not hand an open transaction back to the pool.
      await op.query('ROLLBACK')
      op.release()
    }
    assert.equal(await lateOps(r.reservationId), 0, 'no operation record')
    assert.equal(await historyCount(r.reservationId), 0, 'no fact')
    assert.equal(await truthOf(r.reservationId), undefined)
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0)
    const c1 = new pg.Client({ connectionString: db.ownerUrl })
    await c1.connect()
    try {
      void (await recordResearchLateFacts(c1, input)) // the acknowledgement is deliberately ignored
    } finally {
      await c1.end()
    }
    const stored = await one<{ result: unknown }>(
      `SELECT result FROM sophia.research_late_fact_operations WHERE operation_key=$1`,
      ['late:roll:1'],
    )
    const c2 = new pg.Client({ connectionString: db.ownerUrl })
    await c2.connect()
    try {
      assert.deepEqual(await recordResearchLateFacts(c2, input), stored.result)
    } finally {
      await c2.end()
    }
    assert.equal(await lateOps(r.reservationId), 1)
    assert.equal(await historyCount(r.reservationId), 1)
  })
})

/**
 * Maintained 0094 contribution registration. Non-rotating at the current revision it REUSES the resource and its link and
 * revokes that resource's active runtime of the same unit (the non-fenced revocation); rotating it drains the resource and
 * leaves its runtime active (a fence then revokes it).
 */
async function registerAgain(w: World, rotate: boolean, unit: string) {
  const token = randomUUID() + randomUUID()
  const r = await registerContributionRuntime(owner, {
    projectId: w.projectId,
    connectionId: w.connectionId,
    runtimeUnitId: unit,
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate,
  })
  return { who: callerOf(token, unit), ...(r as unknown as { runtimeId: string; resourceId: string }) }
}
const generationOf = async (projectId: string, resourceId: string) =>
  (
    await one<{ g: string | null }>(`SELECT sophia.contribution_runtime_generation($1,$2) AS g`, [
      projectId,
      resourceId,
    ])
  ).g
const runtimeState = async (runtimeId: string) =>
  (await one<{ s: string }>(`SELECT state AS s FROM sophia.runtime_instances WHERE id=$1`, [runtimeId])).s
const originalRuntimeOf = async (projectId: string, reservationId: string) =>
  await one<{ r: string; res: string }>(
    `SELECT runtime_id AS r, resource_id AS res FROM sophia.research_call_identities WHERE project_id=$1 AND reservation_id=$2`,
    [projectId, reservationId],
  )

describe('R2 P03-A: NON-fenced original generations through the same operation (maintained re-registrations only)', () => {
  it('contribution: a same-resource re-registration revokes the original; its own token binds it; an active original, the replacement, a null or another generation, an invented fence or a wrong authority refuse; a later fence must be named', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserveObserved(w.who, s.at, 'nf-open')
    const auth = await authority('late_fact_attestation', { accountId: w.account })
    const orig = await originalRuntimeOf(w.projectId, r.reservationId)
    assert.equal(orig.res, w.resourceId)
    const gen0 = await generationOf(w.projectId, w.resourceId)
    assert.match(gen0 ?? '', /^[0-9a-f]{64}$/)
    // The original runtime is still ACTIVE: its own native path is the writer; nothing is recorded.
    const early = await lateInput(
      w.projectId,
      r.reservationId,
      auth,
      'nf:active',
      observedComplete(s.at, r.reservationId, { cost: 0.02 }),
    )
    assert.deepEqual([early.expected.fenceId, early.expected.generation], [null, gen0])
    assert.match(await refusal(recordResearchLateFacts(owner, early)), /original runtime is not revoked/)
    assert.equal(await lateOps(r.reservationId), 0)
    // The maintained non-rotating re-registration of the same unit: same resource, same link and token; the original
    // runtime is revoked and a replacement takes the resource; no fence exists.
    const next = await registerAgain(w, false, UNIT)
    await bringUp(next.who)
    assert.equal(next.resourceId, w.resourceId, 'the resource is reused')
    assert.notEqual(next.runtimeId, orig.r)
    assert.deepEqual([await runtimeState(orig.r), await runtimeState(next.runtimeId)], ['revoked', 'active'])
    assert.equal(
      (
        await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.research_runtime_fences WHERE project_id=$1`, [
          w.projectId,
        ])
      ).n,
      '0',
    )
    assert.equal(
      await generationOf(w.projectId, w.resourceId),
      gen0,
      'the original token is the link binding, unchanged',
    )
    // The native late call through the original capability stays refused.
    assert.match(
      await refusal(
        service((c) => runtimeResearchSettle(c, w.who, observedComplete(s.at, r.reservationId, { cost: 0.02 }))),
      ),
      /Runtime capability revoked/,
    )
    const money0 = await moneyOf(w.projectId, r.reservationId)
    const input = await lateInput(
      w.projectId,
      r.reservationId,
      auth,
      'nf:1',
      observedComplete(s.at, r.reservationId, { cost: 0.02 }),
    )
    assert.deepEqual(
      [input.expected.fenceId, input.expected.generation, input.expected.runtimeId],
      [null, gen0, orig.r],
    )
    const result = await recordResearchLateFacts(owner, input)
    assert.deepEqual(
      [result.disposition, result.fenceId, result.generation, result.originalRuntimeId, result.originalBasis],
      ['accepted', null, gen0, orig.r, 'runtime_revoked'],
    )
    assert.deepEqual(result.reported, { outcome: 'settled', costUsd: '0.020000', basis: 'reported_unverified' })
    assert.deepEqual(result.financial, { reservationState: 'reserved', settledUsd: null })
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0, 'money byte-identical')
    const t = await truthOf(r.reservationId)
    assert.deepEqual(
      [t?.outcome, t?.cost, t?.consumer_ending, t?.output, t?.n1_status, t?.history_count],
      ['uncertain', null, 'stream_completed', '4', 'supported', 1],
    )
    assert.deepEqual(await recordResearchLateFacts(owner, input), result, 'the same key and input replay')
    // Distinct keys, each refused with no record and no money change.
    const revokedAuth = await authority('late_fact_attestation', { accountId: w.account })
    await revokeResearchFinancialAuthority(owner, revokedAuth, 'synthetic: revoked before use')
    const wrongKind = await authority('provider_billed_attestation', { accountId: w.account })
    for (const [what, bad, why] of [
      [
        'the replacement runtime',
        { ...input, operationKey: 'nf:bad:1', expected: { ...input.expected, runtimeId: next.runtimeId } },
        /original binding/,
      ],
      [
        'a null generation for a linked resource',
        { ...input, operationKey: 'nf:bad:2', expected: { ...input.expected, generation: null } },
        /their original generation/,
      ],
      [
        'another generation',
        { ...input, operationKey: 'nf:bad:3', expected: { ...input.expected, generation: 'd'.repeat(64) } },
        /their original generation/,
      ],
      [
        'an invented fence',
        { ...input, operationKey: 'nf:bad:4', expected: { ...input.expected, fenceId: randomUUID() } },
        /fence of their original generation/,
      ],
      [
        'a revoked authority',
        { ...input, operationKey: 'nf:bad:5', authorityId: revokedAuth },
        /No operator authority/,
      ],
      [
        'another authority kind',
        { ...input, operationKey: 'nf:bad:6', authorityId: wrongKind },
        /No operator authority/,
      ],
    ] as const) {
      assert.match(await refusal(recordResearchLateFacts(owner, bad)), why, what)
    }
    assert.equal(await lateOps(r.reservationId), 1, 'refusals left no operation record')
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0)
    // A rotation drains the resource (its replacement runtime stays active: rotation is not a revocation), the original
    // resource is then fenced: from then on its fence must be named; the stored operation still replays under its key.
    const rotated = await registerAgain(w, true, `${UNIT}-2`)
    assert.notEqual(rotated.resourceId, w.resourceId)
    assert.equal(await runtimeState(next.runtimeId), 'active', 'rotation leaves the drained resource runtime active')
    assert.notEqual(await generationOf(w.projectId, rotated.resourceId), gen0)
    const fence = (
      await one<{ r: { fenceId: string; generation: string } }>(
        `SELECT sophia.fence_contribution_runtime($1,$2,$3) AS r`,
        [w.projectId, w.resourceId, gen0],
      )
    ).r
    assert.equal(fence.generation, gen0)
    assert.deepEqual([await runtimeState(orig.r), await runtimeState(next.runtimeId)], ['revoked', 'revoked'])
    assert.deepEqual(await recordResearchLateFacts(owner, input), result)
    assert.match(
      await refusal(recordResearchLateFacts(owner, { ...input, operationKey: 'nf:after-fence:1' })),
      /fence of their original generation/,
    )
    const fenced = await recordResearchLateFacts(owner, {
      ...input,
      operationKey: 'nf:after-fence:2',
      expected: { ...input.expected, fenceId: fence.fenceId },
    })
    assert.deepEqual([fenced.replay, fenced.originalBasis, fenced.fenceId], [true, 'fence', fence.fenceId])
    assert.deepEqual(
      (await researchLateFactRecords(owner, w.projectId, r.reservationId)).map((x) => [
        x.operationKey,
        x.originalBasis,
        x.fenceId,
        x.generation,
      ]),
      [
        ['nf:1', 'runtime_revoked', null, gen0],
        ['nf:after-fence:2', 'fence', fence.fenceId, gen0],
      ],
    )
    assert.equal(await runtimeState(orig.r), 'revoked', 'nothing reactivated')
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0)
  })

  it('legacy (no contribution link): a re-registration revokes the original; generation is exactly null; the tracked v1 protocol is kept; refusals record nothing', async () => {
    const w = await world()
    const pf = await projectFunded(w)
    const r = await reserve(w.legacy, pf.at, 'lg-open')
    const orig = await originalRuntimeOf(w.projectId, r.reservationId)
    assert.equal(await generationOf(w.projectId, orig.res), null, 'the legacy resource has no contribution link')
    const allowanceId = (await allowanceOfTask(pf.taskId)).id
    const auth = await authority('late_fact_attestation', { projectId: w.projectId, allowanceId })
    const early = await lateInput(w.projectId, r.reservationId, auth, 'lg:active', complete(pf.at, r.reservationId))
    assert.deepEqual([early.expected.fenceId, early.expected.generation, early.expected.accountId], [null, null, null])
    assert.match(await refusal(recordResearchLateFacts(owner, early)), /original runtime is not revoked/)
    // The maintained legacy re-registration.
    const reg = await registerRuntime(db.ownerUrl, { projectId: w.projectId, admin: w.ADMIN })
    const legacy2 = callerOf(reg.token, reg.runtimeUnitId)
    await bringUp(legacy2)
    assert.equal(await runtimeState(orig.r), 'revoked', 'the legacy re-registration revokes the original runtime')
    assert.match(await refusal(settle(w.legacy, pf.at, r.reservationId)), /Runtime capability revoked/)
    const money0 = await moneyOf(w.projectId, r.reservationId)
    const input = await lateInput(
      w.projectId,
      r.reservationId,
      auth,
      'lg:1',
      complete(pf.at, r.reservationId, { cost: 0.02 }),
    )
    const result = await recordResearchLateFacts(owner, input)
    assert.deepEqual(
      [result.disposition, result.fenceId, result.generation, result.originalRuntimeId, result.originalBasis],
      ['accepted', null, null, orig.r, 'runtime_revoked'],
    )
    assert.deepEqual(result.reported, { outcome: 'settled', costUsd: '0.020000', basis: 'reported_unverified' })
    assert.deepEqual(result.financial, { reservationState: 'reserved', settledUsd: null })
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0, 'money byte-identical')
    const t = await truthOf(r.reservationId)
    assert.deepEqual([t?.outcome, t?.cost, t?.consumer_ending, t?.output], ['uncertain', null, 'stream_completed', '4'])
    assert.deepEqual(await recordResearchLateFacts(owner, input), result)
    const replacement = (
      await one<{ id: string }>(
        `SELECT id FROM sophia.runtime_instances WHERE project_id=$1 AND resource_id=$2 AND state='active'`,
        [w.projectId, orig.res],
      )
    ).id
    const otherAllowance = await authority('late_fact_attestation', {
      projectId: w.projectId,
      allowanceId: randomUUID(),
    })
    const accountScoped = await authority('late_fact_attestation', { accountId: w.account })
    for (const [what, bad, why] of [
      [
        'a generation for a resource without a link',
        { ...input, operationKey: 'lg:bad:1', expected: { ...input.expected, generation: 'e'.repeat(64) } },
        /their original generation/,
      ],
      [
        'the contribution resource token',
        {
          ...input,
          operationKey: 'lg:bad:2',
          expected: { ...input.expected, generation: await generationOf(w.projectId, w.resourceId) },
        },
        /their original generation/,
      ],
      [
        'an invented fence',
        { ...input, operationKey: 'lg:bad:3', expected: { ...input.expected, fenceId: randomUUID() } },
        /fence of their original generation/,
      ],
      [
        'the replacement legacy runtime',
        { ...input, operationKey: 'lg:bad:4', expected: { ...input.expected, runtimeId: replacement } },
        /original binding/,
      ],
      [
        'an invented account',
        { ...input, operationKey: 'lg:bad:5', expected: { ...input.expected, accountId: w.account } },
        /original binding/,
      ],
      [
        'the observed_v1 protocol on a v1 call',
        { ...input, operationKey: 'lg:bad:6', report: observedComplete(pf.at, r.reservationId, { cost: 0.02 }) },
        /Invalid settlement evidence/,
      ],
      [
        'another allowance scope',
        { ...input, operationKey: 'lg:bad:7', authorityId: otherAllowance },
        /No operator authority/,
      ],
      ['an account scope', { ...input, operationKey: 'lg:bad:8', authorityId: accountScoped }, /No operator authority/],
    ] as const) {
      assert.match(await refusal(recordResearchLateFacts(owner, bad)), why, what)
    }
    assert.equal(await lateOps(r.reservationId), 1, 'refusals left no operation record')
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0)
    assert.equal(await runtimeState(orig.r), 'revoked', 'nothing reactivated')
  })
})

describe('R1 C3REC-F02: the reconciliation itself, rolled back, then committed once', () => {
  it('BEGIN -> reconcile -> ROLLBACK changes nothing; the exact input then commits once, replays from a fresh connection, no double charge', async () => {
    const w = await world()
    const pf = await projectFunded(w)
    const r = await reserve(w.legacy, pf.at, 'roll-1')
    await settleUncertain(w.legacy, pf.at, r.reservationId)
    const a = await allowanceOfTask(pf.taskId)
    const auth = await authority('provider_billed_attestation', { projectId: w.projectId, allowanceId: a.id })
    const input = await reconcileInput(w.projectId, r.reservationId, auth, '0.034000')
    const money0 = await moneyOf(w.projectId, r.reservationId)
    const op = await owner.connect()
    try {
      await op.query('BEGIN')
      const inTx = await reconcileResearchReservation(op, input)
      assert.equal(inTx.state, 'settled')
      const seen = (
        await op.query<{ s: string; spent: string }>(
          `SELECT r.state AS s, a.spent_usd::text AS spent FROM sophia.research_reservations r JOIN sophia.research_allowances a
            ON a.project_id=r.project_id AND a.id=r.allowance_id WHERE r.id=$1`,
          [r.reservationId],
        )
      ).rows[0]!
      assert.deepEqual(
        [seen.s, micro(seen.spent)],
        ['settled', micro(a.spent) + 34_000],
        'the intended effects, inside the transaction',
      )
      await op.query('ROLLBACK')
    } finally {
      // A failed assertion inside the transaction must not hand an open transaction back to the pool.
      await op.query('ROLLBACK')
      op.release()
    }
    // From a separate connection: the original money and state, and no operation record.
    assert.deepEqual(await moneyOf(w.projectId, r.reservationId), money0)
    assert.equal(
      (
        await rows(`SELECT 1 FROM sophia.research_reservation_reconciliations WHERE reservation_id=$1`, [
          r.reservationId,
        ])
      ).length,
      0,
    )
    // The exact same input on a new connection: one committed effect (its acknowledgement deliberately ignored).
    const c1 = new pg.Client({ connectionString: db.ownerUrl })
    await c1.connect()
    try {
      void (await reconcileResearchReservation(c1, input))
    } finally {
      await c1.end()
    }
    const stored = await one<{ result: unknown }>(
      `SELECT result FROM sophia.research_reservation_reconciliations WHERE reservation_id=$1`,
      [r.reservationId],
    )
    const c2 = new pg.Client({ connectionString: db.ownerUrl })
    await c2.connect()
    try {
      assert.deepEqual(
        await reconcileResearchReservation(c2, input),
        stored.result,
        'recovered from a fresh connection',
      )
      assert.deepEqual(await reconcileResearchReservation(c2, input), stored.result)
    } finally {
      await c2.end()
    }
    assert.match(
      await refusal(reconcileResearchReservation(owner, { ...input, costUsd: '0.035000' })),
      /different reconciliation/,
    )
    const a1 = await allowanceOfTask(pf.taskId)
    assert.equal(micro(a1.spent), micro(a.spent) + 34_000, 'charged exactly once')
    assert.equal(micro(a1.uncertain), micro(a.uncertain) - 100_000)
  })
})
