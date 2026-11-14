// INC04-S01b (0104, 0106) and INC04-S03a (0107): the selection snapshot on real PostgreSQL with the production role split, against the REAL money
// and slot ledgers. Members read through the non-owner sophia_api login in withActor 'read' (REPEATABLE READ READ
// ONLY). Contributions are admitted, reserved and settled by the real 0094 functions; the operator steps (custody,
// route and account qualification) run as the migration owner. Every grant, account, qualification and token is
// SYNTHETIC: nothing here qualifies a real owner, key, account, route or provider, or passes an AC-04 case.
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
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
  revokeApiAccountQualification,
  setResearchFundingPin,
  updateApiAccount,
} from './api-contributions.ts'
import {
  recordCapacityObservation,
  revokeCapacityObservation,
  type CapacityObservationInput,
} from './capacity-observations.ts'

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
    assert.equal(f.observation, null, '0107: no reading in its scope is null, the unchanged baseline')
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

// --- INC04-S03a: scoped readings (0107) -------------------------------------------------------------------------------

const at = (ms: number) => new Date(Date.now() + ms).toISOString()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The connection's one live account qualification and the current route qualification, as the operator names them. */
async function qualificationsOf(connectionId: string) {
  const a = await ownerPool.query<{ id: string; revision: string }>(
    `SELECT id, revision FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
    [connectionId],
  )
  const r = await ownerPool.query<{ id: string }>(
    `SELECT id FROM sophia.api_route_qualifications WHERE revoked_at IS NULL AND expires_at>now() ORDER BY qualified_at DESC, id LIMIT 1`,
  )
  // As microsecond text: a Date would round the instant down, to before the qualification.
  const since = await ownerPool.query<{ t: string }>(
    `SELECT to_char(greatest(a.observed_at, r.qualified_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t
      FROM sophia.api_account_qualifications a,
      sophia.api_route_qualifications r WHERE a.id=$1 AND r.id=$2`,
    [a.rows[0]?.id, r.rows[0]?.id],
  )
  return {
    ids: {
      accountQualificationId: String(a.rows[0]?.id),
      accountQualificationRevision: Number(a.rows[0]?.revision),
      routeQualificationId: String(r.rows[0]?.id),
    },
    /** The first instant both qualifications held: a reading is observed at or after it. */
    since: String(since.rows[0]?.t),
  }
}
/** A SYNTHETIC complete reading through the world's connection, recorded by the operator. */
async function record(w: World, over: Partial<CapacityObservationInput> = {}) {
  const q = await qualificationsOf(w.connectionId)
  return recordCapacityObservation(ownerPool, {
    observationKey: `k-${randomUUID()}`,
    connectionId: w.connectionId,
    credentialRevision: 1,
    ...q.ids,
    operation: 'research',
    verification: 'operator_verified_console',
    evidenceRef: 'synthetic evidence held outside',
    sourceChannel: 'synthetic-console',
    windowSetRef: 'synthetic-limits',
    windowSetVersion: 'v1',
    coverage: 'complete',
    requiredWindowRefs: ['requests-per-day'],
    reflection: 'unknown',
    observedAt: q.since,
    freshUntil: at(600_000),
    windows: [
      {
        windowRef: 'requests-per-day',
        scope: 'account',
        unit: 'requests',
        value: 3,
        verdict: 'admits',
        applicability: 'known',
      },
    ],
    ...over,
  })
}
// R3 (CI fixture F01): an instant a reading is ordered by comes from the DATABASE clock, as UTC microsecond text. A
// JavaScript Date keeps only milliseconds and its own clock, so `Date.now() - 500 ms` is neither guaranteed to be at or
// after the qualifications nor strictly after an earlier reading.
const MICRO = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`
/** The database clock, strictly after `earlier`: a bounded condition check, never a fixed delay. */
async function instantAfter(earlier: string) {
  for (let i = 0; i < 100; i++) {
    const { rows } = await ownerPool.query<{ t: string; later: boolean }>(
      `SELECT to_char(c AT TIME ZONE 'UTC', ${MICRO}) AS t, c > $1::timestamptz AS later FROM clock_timestamp() c`,
      [earlier],
    )
    if (rows[0]?.later === true) return rows[0].t
  }
  throw new Error(`the database clock did not pass ${earlier}`)
}
/** `instant` plus `ms`, computed by the database at microsecond precision. */
async function plus(instant: string, ms: number) {
  const { rows } = await ownerPool.query<{ t: string }>(
    `SELECT to_char(($1::timestamptz + $2::integer * interval '1 millisecond') AT TIME ZONE 'UTC', ${MICRO}) AS t`,
    [instant, ms],
  )
  return String(rows[0]?.t)
}
/** Waits, by bounded checks, until the database clock has passed `instant`. */
async function untilPassed(instant: string, boundMs = 10_000) {
  for (let waited = 0; waited <= boundMs; waited += 20) {
    const { rows } = await ownerPool.query<{ passed: boolean }>(
      `SELECT clock_timestamp() > $1::timestamptz AS passed`,
      [instant],
    )
    if (rows[0]?.passed === true) return
    await wait(20)
  }
  throw new Error(`the database clock did not pass ${instant} within ${String(boundMs)} ms`)
}
/** A reading's recorded observation instant, as the database holds it. */
async function observedAtOf(observationId: string) {
  const { rows } = await ownerPool.query<{ t: string }>(
    `SELECT to_char(observed_at AT TIME ZONE 'UTC', ${MICRO}) AS t FROM sophia.capacity_observations WHERE id=$1`,
    [observationId],
  )
  return String(rows[0]?.t)
}
/** How `instant` stands, as database facts, against both qualifications, an earlier reading and the clock. */
async function orderOf(instant: string, q: Awaited<ReturnType<typeof qualificationsOf>>, earlierId: string) {
  const { rows } = await ownerPool.query<{
    atOrAfterAccount: boolean
    atOrAfterRoute: boolean
    afterEarlier: boolean
    notLaterThanEarlier: boolean
    notFuture: boolean
    accountObservedAt: string
    routeQualifiedAt: string
    earlierObservedAt: string
    clock: string
  }>(
    `SELECT $1::timestamptz >= a.observed_at AS "atOrAfterAccount", $1::timestamptz >= r.qualified_at AS "atOrAfterRoute",
      $1::timestamptz > o.observed_at AS "afterEarlier", $1::timestamptz <= o.observed_at AS "notLaterThanEarlier",
      $1::timestamptz <= c AS "notFuture",
      to_char(a.observed_at AT TIME ZONE 'UTC', ${MICRO}) AS "accountObservedAt",
      to_char(r.qualified_at AT TIME ZONE 'UTC', ${MICRO}) AS "routeQualifiedAt",
      to_char(o.observed_at AT TIME ZONE 'UTC', ${MICRO}) AS "earlierObservedAt",
      to_char(c AT TIME ZONE 'UTC', ${MICRO}) AS clock
     FROM sophia.api_account_qualifications a, sophia.api_route_qualifications r, sophia.capacity_observations o,
      clock_timestamp() c WHERE a.id=$2 AND r.id=$3 AND o.id=$4`,
    [instant, q.ids.accountQualificationId, q.ids.routeQualificationId, earlierId],
  )
  const row = rows[0]
  assert.ok(row, 'the qualifications and the earlier reading exist')
  return { instant, ...row }
}
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'accepted'
  } catch (err: unknown) {
    return err instanceof DomainError ? err.code : String(err)
  }
}
const observationCount = async () =>
  Number((await ownerPool.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.capacity_observations`)).rows[0]?.n)
/** Every ledger, reservation, claim and binding row an observation must never touch, as one comparable value. */
async function ledgers() {
  const tables = [
    'research_allowances',
    'research_reservations',
    'api_contribution_tasks',
    'api_contribution_claims',
    'api_contribution_reservations',
    'owner_runner_reservations',
    'jobs',
    'commands',
    'outbox',
  ]
  const out: Record<string, unknown> = {}
  for (const name of tables) {
    const { rows } = await ownerPool.query<{ v: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') AS v FROM sophia.${name} x`,
    )
    out[name] = rows[0]?.v
  }
  return out
}

describe('the selection snapshot with scoped readings (0107)', () => {
  it('projects the matched reading without its value or evidence, the same for another project on the same account', async () => {
    const w = await world()
    const r = await record(w)
    const s = await snap(w.projectId, w.REQ)
    const f = apiFacts(s, w.grantId)
    assert.ok(f.observation && f.observation.state === 'recorded', JSON.stringify(f.observation))
    assert.equal(f.observation.observationId, r.observationId)
    assert.equal(f.observation.fresh, true)
    assert.deepEqual(
      f.observation.windows.map((x) => [x.windowRef, x.unit, x.verdict]),
      [['requests-per-day', 'requests', 'admits']],
    )
    const text = JSON.stringify(full(s))
    for (const secret of ['synthetic evidence', 'synthetic-console', '"value"', 'reflection'])
      assert.equal(text.includes(secret), false, secret)
    // One accounting root across projects: the same connection's grant elsewhere sees the same one reading, and no
    // separate capacity comes with it.
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
    assert.deepEqual(f2.observation, f.observation)
    assert.deepEqual([f2.capacity, f2.slotsBusy], [f.capacity, f.slotsBusy])
  })

  it('changes no ledger, reservation, claim or binding by recording, revoking or a reset passing', async (ctx) => {
    const w = await world()
    const t = await started(w)
    const m = await reserve(w, t.at, 'model', 0.2)
    await service((c) =>
      runtimeResearchSettle(c, w.who, { ...t.at, reservationId: m.reservationId, outcome: 'uncertain' }),
    )
    const beforeAll = await ledgers()
    const a = await record(w)
    await revokeCapacityObservation(ownerPool, a.observationId, 'synthetic: superseded')
    // A reading whose window resets 1.5 s after its observation, fresh for 1 s (never past the reset): after the reset,
    // stale, never replenished. Its one instant is the database clock, strictly after the revoked reading (equal times
    // would be a conflict) and so at or after both qualifications; fresh and reset derive from that same instant.
    const q = await qualificationsOf(w.connectionId)
    const observedAt = await instantAfter(await observedAtOf(a.observationId))
    const [freshUntil, resetAt] = [await plus(observedAt, 1_000), await plus(observedAt, 1_500)]
    const order = await orderOf(observedAt, q, a.observationId)
    ctx.diagnostic(`R3 second reading: ${JSON.stringify({ since: q.since, ...order, freshUntil, resetAt })}`)
    assert.ok(order.atOrAfterAccount && order.atOrAfterRoute, 'at or after both qualifications, as database facts')
    assert.ok(order.afterEarlier, 'strictly after the revoked reading, as a database fact')
    assert.ok(order.notFuture, 'not in the future')
    const b = await record(w, {
      observedAt,
      freshUntil,
      windows: [
        {
          windowRef: 'requests-per-day',
          scope: 'account',
          unit: 'requests',
          verdict: 'exhausted',
          applicability: 'known',
          resetAt,
        },
      ],
    })
    const during = apiFacts(await snap(w.projectId, w.REQ), w.grantId).observation
    assert.ok(during?.state === 'recorded' && during.fresh && during.observationId === b.observationId)
    await untilPassed(resetAt)
    const passed = apiFacts(await snap(w.projectId, w.REQ), w.grantId)
    assert.ok(
      passed.observation?.state === 'recorded' && !passed.observation.fresh,
      'after the reset it is stale, not admits',
    )
    assert.equal(passed.uncertainEffects, true, 'the uncertain reservation still holds')
    assert.deepEqual(await ledgers(), beforeAll, 'every ledger row is byte-equal')
  })

  it('refuses the old fixture construction when it lands before the qualifications, conflicts when not later, and selects the database instant', async (ctx) => {
    // Causal control for the CI fixture defect F01, with production unchanged. The old second reading was
    // `Date.now() - 500 ms`. Evaluated on a fast schedule, 300 ms after the qualifications began, it is 200 ms BEFORE
    // them; evaluated exactly 500 ms after, it EQUALS the first reading's instant. Both are computed here
    // deterministically from the database's own qualification instant, not from any historical CI timestamp.
    const w = await world()
    const q = await qualificationsOf(w.connectionId)
    const a = await record(w)
    await revokeCapacityObservation(ownerPool, a.observationId, 'synthetic: superseded')
    const exhausted = {
      freshUntil: await plus(q.since, 600_000),
      windows: [
        {
          windowRef: 'requests-per-day',
          scope: 'account' as const,
          unit: 'requests',
          verdict: 'exhausted' as const,
          applicability: 'known' as const,
        },
      ],
    }
    // 1. Before the qualifications: the unchanged guard refuses it, and nothing is written.
    const fast = await orderOf(await plus(q.since, 300 - 500), q, a.observationId)
    ctx.diagnostic(
      `R3 old construction, 300 ms after the qualifications: ${JSON.stringify({ since: q.since, ...fast })}`,
    )
    assert.ok(!(fast.atOrAfterAccount && fast.atOrAfterRoute), 'before a qualification, as a database fact')
    const rows = await observationCount()
    assert.equal(
      await codeOf(record(w, { ...exhausted, observedAt: fast.instant })),
      'invalid_request',
      'the unchanged guard refuses a reading observed before its qualifications',
    )
    assert.equal(await observationCount(), rows, 'nothing written')
    // 2. Not later than the revoked reading: recorded, but the unchanged read can order neither, so a conflict.
    const equal = await orderOf(await plus(q.since, 500 - 500), q, a.observationId)
    ctx.diagnostic(
      `R3 old construction, 500 ms after the qualifications: ${JSON.stringify({ since: q.since, ...equal })}`,
    )
    assert.ok(
      equal.notLaterThanEarlier && !equal.afterEarlier,
      'not later than the revoked reading, as a database fact',
    )
    await record(w, { ...exhausted, observedAt: equal.instant })
    assert.deepEqual(apiFacts(await snap(w.projectId, w.REQ), w.grantId).observation, { state: 'conflict' })
    // 3. The corrected construction: the database clock, strictly after both, is recorded and selected.
    const fixed = await orderOf(await instantAfter(equal.instant), q, a.observationId)
    ctx.diagnostic(`R3 corrected construction: ${JSON.stringify({ since: q.since, ...fixed })}`)
    assert.ok(fixed.atOrAfterAccount && fixed.atOrAfterRoute && fixed.afterEarlier && fixed.notFuture)
    const c = await record(w, {
      ...exhausted,
      observedAt: fixed.instant,
      freshUntil: await plus(fixed.instant, 600_000),
    })
    const selected = apiFacts(await snap(w.projectId, w.REQ), w.grantId).observation
    assert.ok(selected?.state === 'recorded' && selected.fresh && selected.observationId === c.observationId)
  })

  it('leaves an old reading unbound when its account qualification expires or is replaced', async () => {
    const w = await world()
    const live = await qualificationsOf(w.connectionId)
    await revokeApiAccountQualification(
      ownerPool,
      live.ids.accountQualificationId,
      'synthetic: short-lived requalification',
    )
    await qualifyApiAccount(ownerPool, {
      connectionId: w.connectionId,
      operations: ['research'],
      verification: 'operator_verified_call',
      evidenceRef: 'synthetic: not live evidence',
      observedAt: at(-60_000),
      expiresAt: at(1_200),
    })
    await record(w, { freshUntil: at(1_000) })
    assert.equal(
      apiFacts(await snap(w.projectId, w.REQ), w.grantId).observation?.state,
      'recorded',
      'the paired positive',
    )
    await wait(1_400)
    const f = apiFacts(await snap(w.projectId, w.REQ), w.grantId)
    assert.equal(f.accountQualification.state, 'expired')
    assert.deepEqual(f.observation, { state: 'unbound' })
  })
})
