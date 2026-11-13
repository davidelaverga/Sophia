// INC04-S01b (0104, 0106): the selection snapshot on real PostgreSQL with the production role split, against the REAL money
// and slot ledgers. Members read through the non-owner sophia_api login in withActor 'read' (REPEATABLE READ READ
// ONLY). Contributions are admitted, reserved and settled by the real 0094 functions; the operator steps (custody,
// route and account qualification) run as the migration owner. Every grant, account, qualification and token is
// SYNTHETIC: nothing here qualifies a real owner, key, account, route or provider, or passes an AC-04 case.
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  readSelectionSnapshot,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchReserve,
  runtimeResearchSettle,
  runtimeTokenHash,
  withActor,
  withService,
  type FullSelectionSnapshot,
  type RuntimeCaller,
  type SelectionApiFacts,
} from './index.ts'
import {
  createApiAccount,
  createApiConnection,
  createContributionGrant,
  qualifyApiAccount,
  registerContributionRuntime,
  setResearchFundingPin,
  updateApiAccount,
} from './api-contributions.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let ownerPool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 3 })
  // A SYNTHETIC global route qualification: necessary, never sufficient (the account's own record is also required).
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
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)
const callerOf = (token: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: 'sophia-runtime-test',
  bridgeInstanceId: randomUUID(),
})

/** What the snapshot says now, read as `actor`, in one READ ONLY transaction that is shown to have written nothing. */
async function snap(projectId: string, actor: string, sources: string[] = []) {
  return withActor(api, actor, 'read', async (c) => {
    const s = await readSelectionSnapshot(c, projectId, sources)
    const { rows } = await c.query<{ none: boolean }>('SELECT pg_current_xact_id_if_assigned() IS NULL AS none')
    assert.equal(rows[0]?.none, true, 'the read assigned no transaction id: it wrote nothing')
    return s
  })
}
/** An evaluator's snapshot, narrowed to the full form (0106) by assertion, never assumed. */
function full(s: Awaited<ReturnType<typeof snap>>): FullSelectionSnapshot {
  assert.ok(s, 'a current member reads a snapshot')
  assert.equal(s.evaluation, 'full', 'an evaluator reads the full form')
  if (s.evaluation !== 'full') throw new Error('restricted')
  return s
}
const apiFacts = (s: Awaited<ReturnType<typeof snap>>, grantId: string): SelectionApiFacts => {
  const f = full(s).candidates.find((x) => x.kind === 'api' && x.grantId === grantId)
  assert.ok(f && f.kind === 'api', `grant ${grantId} is in the pool`)
  return f
}

/**
 * A project with an enabled research gate; an owner (editor) with a protected-or-not account, a connection, a grant, a
 * registered and ready contribution runtime, and an operator account qualification; a requester (editor).
 */
async function world(opts: { accountCap?: number; taskCap?: number; totalCap?: number; gate?: [number, number] } = {}) {
  const OWNER = randomUUID()
  const REQ = randomUUID()
  const project = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [OWNER, REQ] })
  const projectId = project.projectId
  const [gateTask, gateTotal] = opts.gate ?? [5, 40]
  await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', $2, $3, 'web-pilot-v1', 'approval:test')`, [
    projectId,
    gateTask,
    gateTotal,
  ])
  const acc = await withActor(api, OWNER, 'write', (c) =>
    createApiAccount(c, { label: 'My API', totalCapUsd: opts.accountCap ?? 10 }),
  )
  await withActor(api, OWNER, 'write', (c) =>
    updateApiAccount(c, acc.accountId, acc.revision, {
      protection: { applicability: 'none_applicable', operations: ['research'], roles: ['sophia-research-md-v1'] },
    }),
  )
  const conn = await withActor(api, OWNER, 'write', (c) =>
    createApiConnection(c, acc.accountId, 'Research key', 'Operator host'),
  )
  const grant = await withActor(api, OWNER, 'write', (c) =>
    createContributionGrant(c, conn.connectionId, projectId, {
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      taskCapUsd: opts.taskCap ?? 1,
      totalCapUsd: opts.totalCap ?? 5,
      fundingPolicy: 'bounded_total_spend',
      fundingAcknowledgementRef: 'synthetic acknowledgement',
    }),
  )
  const token = randomUUID() + randomUUID()
  await registerContributionRuntime(ownerPool, {
    projectId,
    connectionId: conn.connectionId,
    runtimeUnitId: 'sophia-runtime-test',
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: false,
  })
  const who = callerOf(token)
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  await qualifyApiAccount(ownerPool, {
    connectionId: conn.connectionId,
    operations: ['research'],
    verification: 'operator_verified_call',
    evidenceRef: 'synthetic: not live evidence',
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  })
  return {
    projectId,
    OWNER,
    REQ,
    accountId: acc.accountId,
    connectionId: conn.connectionId,
    grantId: grant.grantId,
    who,
  }
}
type World = Awaited<ReturnType<typeof world>>

async function grantRevision(grantId: string) {
  const { rows } = await ownerPool.query<{ revision: string }>(
    'SELECT revision FROM sophia.api_contribution_grants WHERE id=$1',
    [grantId],
  )
  return Number(rows[0]?.revision)
}

/** Pin, admit (pending: it holds the slot), dispatch and deliver: the session the task's reservations run in. */
async function started(w: World) {
  await withActor(api, w.REQ, 'write', async (c) =>
    setResearchFundingPin(c, w.projectId, w.grantId, await grantRevision(w.grantId)),
  )
  const admission = await withActor(api, w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: { question: 'Which sandboxes render PDFs?', outputs: ['markdown'] },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
  assert.ok('admitted' in admission, JSON.stringify(admission))
  for (const row of await claimRuntimeOutbox(worker, 'test-worker', 50, 30))
    await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
  const batch = await service((c) => runtimePoll(c, w.who, 0))
  const create = batch.commands
    .map((q) => q.command as RuntimeCommand)
    .find((cmd) => cmd.binding.attemptId === admission.admitted.attemptId)
  assert.ok(create, 'the create reached the contribution runtime')
  const receipt: RuntimeReceipt = {
    commandId: create.commandId,
    attemptId: create.binding.attemptId,
    stage: 'delivered',
    nativeSessionId: `sophia-${create.binding.attemptId}`,
    nativeSequence: 1,
    evidenceRefs: [],
    observedAt: new Date().toISOString(),
    reason: null,
  }
  await service((c) => recordRuntimeReceipts(c, w.who, [receipt]))
  const at = { attemptId: admission.admitted.attemptId, nativeSessionId: `sophia-${admission.admitted.attemptId}` }
  return { at, taskId: admission.admitted.taskId }
}

const reserve = (
  w: World,
  at: { attemptId: string; nativeSessionId: string },
  kind: 'model' | 'search',
  amount: number,
) =>
  service((c) =>
    runtimeResearchReserve(c, w.who, {
      ...at,
      callId: randomUUID(),
      kind,
      provider: kind === 'model' ? 'openai-research' : 'tavily',
      amountUsd: amount,
      ...(kind === 'search' ? { query: 'q' } : {}),
    }),
  )

describe('the selection snapshot (0104) on the real ledgers', () => {
  it('reads a member’s positive facts in one read-only snapshot, and NULL for a nonmember', async () => {
    const w = await world()
    const s = full(await snap(w.projectId, w.REQ))
    assert.equal(s.complete, true)
    const f = apiFacts(s, w.grantId)
    assert.deepEqual(
      [f.globalRoute, f.accountQualification.state, f.runtimeReady, f.proofStatus, f.capacity.admits, f.slotsBusy],
      ['current', 'current', true, 'valid', true, false],
    )
    assert.deepEqual(f.protection, { witness: 'none_applicable' })
    assert.equal(f.uncertainEffects, false)
    assert.equal(await snap(w.projectId, randomUUID()), null)
    // A current viewer of the same project reads the restricted form only (0106): no pool, budget, Pin, gate or source.
    const VIEW = randomUUID()
    await ownerPool.query(`INSERT INTO sophia.project_members(project_id, actor_id, role) VALUES ($1, $2, 'viewer')`, [
      w.projectId,
      VIEW,
    ])
    const v = await snap(w.projectId, VIEW, [randomUUID()])
    assert.ok(v)
    assert.deepEqual(Object.keys(v).toSorted(), ['actorId', 'evaluatedAt', 'evaluation', 'member', 'projectId'])
    assert.deepEqual(
      [v.evaluation, v.projectId, v.actorId, v.member.role, v.member.active],
      ['restricted', w.projectId, VIEW, 'viewer', true],
    )
  })

  it('money exhausted with free slots: settled spend leaves no room for one more task, though no slot is held', async () => {
    const w = await world({ accountCap: 1.5, totalCap: 1.5, taskCap: 1 })
    const t = await started(w)
    const m = await reserve(w, t.at, 'model', 1)
    await service((c) =>
      runtimeResearchSettle(c, w.who, { ...t.at, reservationId: m.reservationId, outcome: 'settled', costUsd: 0.6 }),
    )
    // SYNTHETIC: the task has ended (as a completed or failed task would); its settled cost stays committed.
    await ownerPool.query(`UPDATE sophia.jobs SET state='failed' WHERE project_id=$1 AND id=$2`, [
      w.projectId,
      t.taskId,
    ])
    const f = apiFacts(await snap(w.projectId, w.REQ), w.grantId)
    assert.equal(f.slotsBusy, false, 'no slot is held')
    assert.equal(f.capacity.admits, false)
    assert.deepEqual(f.capacity.reasons.toSorted(), ['account_spend', 'grant_spend'])
  })

  it('a held slot, then an account-wide uncertain effect seen from another project of the same account', async () => {
    const w = await world()
    const t = await started(w)
    const held = apiFacts(await snap(w.projectId, w.REQ), w.grantId)
    assert.equal(held.slotsBusy, true, 'the admitted task holds the account’s one slot')
    assert.deepEqual(held.capacity.reasons, ['account_slots', 'grant_slots'])
    const m = await reserve(w, t.at, 'model', 0.2)
    await service((c) =>
      runtimeResearchSettle(c, w.who, { ...t.at, reservationId: m.reservationId, outcome: 'uncertain' }),
    )
    // The same owner contributes the same account to a second project: one accounting root across projects.
    const p2 = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [w.OWNER, w.REQ] })
    await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      p2.projectId,
    ])
    const g2 = await withActor(api, w.OWNER, 'write', (c) =>
      createContributionGrant(c, w.connectionId, p2.projectId, {
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        taskCapUsd: 1,
        totalCapUsd: 5,
        fundingPolicy: 'bounded_total_spend',
        fundingAcknowledgementRef: 'synthetic acknowledgement',
      }),
    )
    const f2 = apiFacts(await snap(p2.projectId, w.REQ), g2.grantId)
    assert.equal(f2.uncertainEffects, true, 'an uncertain effect anywhere on the account is reported')
    assert.equal(f2.slotsBusy, true, 'the other project’s task holds the account’s slot')
  })

  it('the project’s own non-model budget: one more task’s allowance must fit the gate’s total', async () => {
    const w = await world({ gate: [5, 5] })
    assert.equal(full(await snap(w.projectId, w.REQ)).projectBudget, true, 'nothing committed: 0 + 5 ≤ 5')
    const t = await started(w)
    await reserve(w, t.at, 'search', 0.01)
    const s = await snap(w.projectId, w.REQ)
    assert.equal(full(s).projectBudget, false, 'a project-paid search leaves no room for a new 5 USD allowance')
    assert.ok(apiFacts(s, w.grantId).capacity.reasons.includes('project_budget'))
  })
})
