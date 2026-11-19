// INC04-S02a (0105): the explicit pinned contributed-API research admission as the atomic boundary on the one ledger,
// level: sql-run on real PostgreSQL with the production split (sophia_api with a transaction-local actor, sophia_worker
// dispatch, the migration owner as operator). Real admission, dispatch, reservation, settlement, erasure and snapshot
// functions; two-client races hold a real transaction open. No provider is called: every account, grant, qualification,
// protection and token is SYNTHETIC. Nothing here qualifies a real owner, account, route or provider, and no case here is
// an AC-04 acceptance.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitResearchTask,
  ATOMIC_ADMISSION_COLUMNS,
  atomicAdmissionInstalled,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  previewContributionAct,
  readSelectionSnapshot,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchReserve,
  runtimeResearchSettle,
  runtimeResearchSubmit,
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
  setResearchFundingPin,
  updateApiAccount,
  updateContributionGrant,
  type AccountProtection,
} from './api-contributions.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let ownerPool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 8 })
  worker = createPool(db.workerUrl, { max: 2 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
  // A SYNTHETIC global route qualification: necessary, never sufficient.
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
const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await ownerPool.query(sql, params)).rows[0] as T
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const bounded = <T>(p: Promise<T>, ms = 15_000) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`did not finish in ${ms} ms`)), ms)),
  ])

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

const NONE_APPLICABLE: AccountProtection = {
  applicability: 'none_applicable',
  operations: ['research'],
  roles: ['sophia-research-md-v1'],
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
const liveQualification = (connectionId: string) =>
  one<{ id: string }>(
    `SELECT id FROM sophia.api_account_qualifications WHERE connection_id=$1 AND revoked_at IS NULL`,
    [connectionId],
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

interface WorldOptions {
  owner?: string
  accountCap?: number
  accountConcurrency?: number
  provenance?: 'owner_declared' | 'unknown'
  separateOwnershipNote?: string
  protection?: AccountProtection | null
  taskCap?: number
  grantTotal?: number
  qualified?: boolean
}

/**
 * A project with an enabled research gate and a ready legacy runtime; an owner with an account (or, with `owner`, that
 * owner's existing account: an alias in another project), a connection, a grant to it, a connected contribution
 * runtime, the owner's protection declaration and the operator's account qualification; a requester with an input.
 */
async function world(o: WorldOptions = {}) {
  const OWNER = o.owner ?? randomUUID()
  const REQ = randomUUID()
  const ADMIN = randomUUID()
  const VIEW = randomUUID()
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [VIEW] })
  await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const legacy = await registerRuntime(db.ownerUrl, { projectId, admin: ADMIN })
  await bringUp(callerOf(legacy.token, legacy.runtimeUnitId))
  let account: string
  if (o.owner && !o.separateOwnershipNote) {
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
          concurrency: o.accountConcurrency ?? 2,
          provenance: o.provenance ?? 'owner_declared',
          ...(o.separateOwnershipNote ? { separateOwnershipNote: o.separateOwnershipNote } : {}),
        }),
      )
    ).accountId
    if (o.protection !== null)
      await withActor(api, OWNER, 'write', (c) =>
        updateApiAccount(c, account, 1, { protection: o.protection ?? NONE_APPLICABLE }),
      )
  }
  const conn = await withActor(api, OWNER, 'write', (c) =>
    createApiConnection(c, account, 'Research key', 'Operator host'),
  )
  // A grant never exceeds its account's total (an existing owner rule): an alias's grant fits its shared account.
  const accountTotal = Number(
    (await one<{ t: string }>(`SELECT total_cap_usd AS t FROM sophia.api_accounts WHERE id=$1`, [account])).t,
  )
  const grantId = (
    await withActor(api, OWNER, 'write', (c) =>
      createContributionGrant(c, conn.connectionId, projectId, {
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        taskCapUsd: o.taskCap ?? 1,
        totalCapUsd: o.grantTotal ?? Math.min(5, accountTotal),
        fundingPolicy: 'bounded_total_spend',
        fundingAcknowledgementRef: 'synthetic acknowledgement',
      }),
    )
  ).grantId
  const token = randomUUID() + randomUUID()
  const reg = await registerContributionRuntime(ownerPool, {
    projectId,
    connectionId: conn.connectionId,
    runtimeUnitId: 'sophia-runtime-test',
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: false,
  })
  const who = callerOf(token, 'sophia-runtime-test')
  await bringUp(who)
  if (o.qualified ?? true) await qualify(conn.connectionId)
  const input = await withActor(api, REQ, 'write', (c) =>
    submitContribution(c, projectId, randomUUID(), {
      source: null,
      text: 'Our pilot hosts render PDFs in a sandbox.',
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )
  return { projectId, OWNER, REQ, ADMIN, VIEW, account, connectionId: conn.connectionId, grantId, who, reg, input }
}
type World = Awaited<ReturnType<typeof world>>

const grantRevision = async (w: World) =>
  Number(
    (await one<{ r: string }>(`SELECT revision AS r FROM sophia.api_contribution_grants WHERE id=$1`, [w.grantId])).r,
  )
const accountRevision = async (w: World) =>
  Number((await one<{ r: string }>(`SELECT revision AS r FROM sophia.api_accounts WHERE id=$1`, [w.account])).r)
const pin = async (w: World) =>
  withActor(api, w.REQ, 'write', async (c) => setResearchFundingPin(c, w.projectId, w.grantId, await grantRevision(w)))

type Ask = { key?: string; exchange?: string; amends?: string; inputs?: string[] }
const askIn = (c: pg.PoolClient, w: World, a: Ask = {}) =>
  admitResearchTask(c, w.projectId, {
    key: a.key ?? randomUUID(),
    exchangeId: a.exchange ?? randomUUID(),
    request: {
      question: 'Which sandboxes do PDF rendering services use?',
      outputs: ['markdown'],
      ...(a.amends ? { amendsTaskId: a.amends } : {}),
      ...(a.inputs ? { inputSourceIds: a.inputs } : {}),
    },
    specialist: { role: MD.id, route: MD.route },
  })
const ask = (w: World, a: Ask = {}) => withActor(api, w.REQ, 'write', (c) => askIn(c, w, a))
async function admitted(w: World, a: Ask = {}) {
  const r = await ask(w, a)
  assert.ok('admitted' in r, JSON.stringify(r))
  return r.admitted
}

async function dispatchAll() {
  for (const row of await claimRuntimeOutbox(worker, 's02a-worker', 50, 30))
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
async function started(w: World, a: Ask = {}) {
  const r = await admitted(w, a)
  await dispatchAll()
  return { taskId: r.taskId, at: await deliver(w.who, r.attemptId) }
}
const model = (w: World, at: At, callId: string, amountUsd: number) =>
  service((c) =>
    runtimeResearchReserve(c, w.who, { ...at, callId, kind: 'model', provider: 'openai-research', amountUsd }),
  )
const settle = (
  w: World,
  at: At,
  reservationId: string,
  outcome: 'settled' | 'uncertain' | 'released',
  costUsd?: number,
) =>
  service((c) =>
    runtimeResearchSettle(c, w.who, { ...at, reservationId, outcome, ...(costUsd === undefined ? {} : { costUsd }) }),
  )
const end = (w: World, at: At) =>
  service((c) => runtimeResearchSubmit(c, w.who, { ...at, callId: 'end', blocker: { reason: 'ended for the test' } }))

/** The account's commitments as the ledger derives them: actual commitments plus every open funded lineage's promise. */
const ledger = async (account: string) =>
  Number(
    (
      await one<{ v: string }>(
        `SELECT sophia.contribution_committed($1,NULL)+sophia.contribution_lineage_holds($1,NULL,NULL,NULL) AS v`,
        [account],
      )
    ).v,
  )
const committed = async (account: string) =>
  Number((await one<{ v: string }>(`SELECT sophia.contribution_committed($1,NULL) AS v`, [account])).v)
const claimOf = async (job: string) =>
  (await ownerPool.query<{ state: string }>(`SELECT state FROM sophia.api_contribution_claims WHERE job_id=$1`, [job]))
    .rows[0]?.state ?? 'none'
const jobOf = (job: string) =>
  one<{ state: string; reason: string | null }>(`SELECT state, reason FROM sophia.jobs WHERE id=$1`, [job])
const tasksIn = async (projectId: string) =>
  (await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.research_tasks WHERE project_id=$1`, [projectId])).n
const reservationsOf = async (job: string) =>
  (
    await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.api_contribution_reservations WHERE job_id=$1`, [
      job,
    ])
  ).n

/** A transaction held open by the API role with an actor: a real concurrent admission. */
async function openAdmission(w: World) {
  const c = await api.connect()
  await c.query('BEGIN')
  await c.query("SELECT set_config('sophia.actor_id', $1, true)", [w.REQ])
  return c
}
const settledFlag = <T>(p: Promise<T>) => {
  const s = { settled: false }
  void p.then(
    () => (s.settled = true),
    () => (s.settled = true),
  )
  return s
}

describe('S02a money: one lineage counted once, across projects and aliases', () => {
  it('lets only one of two projects on one account take the last task cap of money; the other waits, then is refused', async () => {
    const a = await world({ accountCap: 1.5 })
    const b = await world({ owner: a.OWNER })
    assert.equal(a.account, b.account, 'aliases of one accounting root')
    await pin(a)
    await pin(b)
    const first = await openAdmission(a)
    const second = await openAdmission(b)
    try {
      await askIn(first, a)
      const pending = askIn(second, b).then(
        () => 'admitted',
        (err: unknown) => codeOfError(err),
      )
      const flag = settledFlag(pending)
      await sleep(600)
      assert.equal(flag.settled, false, 'the second admission waits on the account row')
      await first.query('COMMIT')
      assert.equal(await bounded(pending), 'account_exhausted', '1 promised + 1 more > 1.5, with a free slot')
      await second.query('ROLLBACK')
    } finally {
      await first.query('ROLLBACK').catch(() => undefined)
      await second.query('ROLLBACK').catch(() => undefined)
      first.release()
      second.release()
    }
    assert.equal(await tasksIn(b.projectId), 0, 'nothing written for the refused project')
    assert.equal(await ledger(a.account), 1)
  })

  it('counts cap 1, committed 0.7 as 1; a 0.1 call makes 0.8 + 0.2, never 1.1; the lineage stops at its cap', async () => {
    const w = await world({ accountCap: 1 })
    await pin(w)
    const s = await started(w)
    assert.equal(await ledger(w.account), 1, 'the whole promise of an open lineage')
    await model(w, s.at, 'm1', 0.7)
    assert.equal(await ledger(w.account), 1, '0.7 committed + 0.3 still promised')
    await model(w, s.at, 'm2', 0.1)
    assert.equal(await committed(w.account), 0.8)
    assert.equal(await ledger(w.account), 1, '0.8 committed + 0.2 promised, counted once')
    assert.equal(await codeOf(model(w, s.at, 'm3', 0.3)), 'task_cap_reached')
    assert.equal((await model(w, s.at, 'm2', 0.1)).state, 'reserved', 'a replay is not a new call')
    const alias = await world({ owner: w.OWNER })
    await pin(alias)
    assert.equal(await codeOf(ask(alias)), 'account_exhausted', 'its alias sees the promised money as used')
  })

  it('replays one admission: one binding, one claim, one promise', async () => {
    const w = await world({ accountCap: 3 })
    await pin(w)
    const key = randomUUID()
    const exchange = randomUUID()
    const [x, y] = await Promise.all([ask(w, { key, exchange }), ask(w, { key, exchange })])
    assert.ok('admitted' in x && 'admitted' in y)
    assert.equal(x.admitted.taskId, y.admitted.taskId)
    assert.equal(
      (
        await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.api_contribution_claims WHERE job_id=$1`, [
          x.admitted.taskId,
        ])
      ).n,
      1,
    )
    assert.equal(await ledger(w.account), 1)
  })
})

describe('S02a effects: evidence ends commitments; a terminal job drops only its unused promise', () => {
  it('keeps an uncertain call committed after its task ends and refuses new work until it is reconciled', async () => {
    const w = await world({ accountCap: 3 })
    await pin(w)
    const s = await started(w)
    const m = await model(w, s.at, 'm1', 0.4)
    await settle(w, s.at, m.reservationId, 'uncertain')
    await end(w, s.at)
    assert.equal((await jobOf(s.taskId)).state, 'failed')
    assert.equal(await committed(w.account), 0.4, 'the uncertain call stays committed')
    assert.equal(await ledger(w.account), 0.4, 'the ended task promises nothing more')
    const other = await world({ owner: w.OWNER })
    await pin(other)
    assert.equal(await codeOf(ask(other)), 'uncertain_effects_unreconciled', 'a free slot and money do not overrule it')
    assert.equal(await tasksIn(other.projectId), 0)
    // Reconciled on evidence (its actual cost), the account admits again: never by choosing another account.
    await settle(w, s.at, m.reservationId, 'settled', 0.3)
    await admitted(other)
    assert.equal(await ledger(w.account), 1.3)
  })

  it('frees a known-ended unused promise: a settled, ended lineage lets the last money go to another project', async () => {
    const w = await world({ accountCap: 1.5 })
    await pin(w)
    const s = await started(w)
    const m = await model(w, s.at, 'm1', 0.2)
    const other = await world({ owner: w.OWNER })
    await pin(other)
    assert.equal(await codeOf(ask(other)), 'account_exhausted', 'while open, its promise is held')
    await settle(w, s.at, m.reservationId, 'settled', 0.2)
    await end(w, s.at)
    await admitted(other)
    assert.equal(await ledger(w.account), 1.2)
  })
})

describe('S02a rebuild: the successor reacquires only at its own dispatch; erasure always commits', () => {
  async function rebuilt(w: World) {
    const s = await started(w, { inputs: [w.input.sourceId] })
    const m = await model(w, s.at, 'm1', 0.2)
    await settle(w, s.at, m.reservationId, 'settled', 0.2)
    const preview = await withActor(api, w.REQ, 'read', (c) =>
      previewContributionAct(c, w.projectId, w.input.contributionId, 'withdraw'),
    )
    await withActor(api, w.REQ, 'write', (c) =>
      withdrawContribution(c, w.projectId, w.input.contributionId, randomUUID(), {
        expectedRevision: preview.revision,
        reach: preview.reach.map(({ taskId, kind, restarts }) => ({ taskId, kind, restarts })),
        previewToken: preview.previewToken,
      }),
    )
    const succ = await one<{ id: string; attempt_id: string }>(
      `SELECT j.id, j.attempt_id FROM sophia.research_tasks r JOIN sophia.jobs j ON j.project_id=r.project_id AND j.id=r.job_id
        WHERE r.project_id=$1 AND r.rebuilt_from_job_id=$2`,
      [w.projectId, s.taskId],
    )
    assert.ok(succ, 'the erasure queued a successor')
    const old = await jobOf(s.taskId)
    assert.equal(old.state, 'failed')
    assert.match(old.reason ?? '', /^revoked: /, 'the erasure committed')
    assert.equal(await claimOf(succ.id), 'unfunded', 'the rebuild decided nothing about money')
    return { s, succ }
  }

  it('funds the successor at its dispatch, never in a read, a readiness view or a fence', async () => {
    const w = await world({ accountCap: 3 })
    await pin(w)
    const { succ } = await rebuilt(w)
    assert.equal(await ledger(w.account), 0.2, 'an unfunded successor promises nothing yet')
    // A read-only snapshot, a readiness read and a writable non-dispatch use of the same eligibility helpers.
    await withActor(api, w.REQ, 'read', (c) => readSelectionSnapshot(c, w.projectId, []))
    await withActor(api, w.REQ, 'read', (c) =>
      c.query(`SELECT sophia.api_contributions_for_project($1)`, [w.projectId]),
    )
    const writable = await ownerPool.connect()
    try {
      await writable.query('BEGIN')
      await writable.query(
        `SELECT sophia.runtime_unavailable(r) FROM sophia.runtime_instances r WHERE r.project_id=$1 AND r.resource_id=$2`,
        [w.projectId, w.reg.resourceId],
      )
      await writable.query(`SELECT sophia.contribution_fence($1,$2)`, [w.projectId, succ.id])
      await writable.query('COMMIT')
    } finally {
      writable.release()
    }
    // A fence fired by a real edit over this lineage: the contribution owner's member row changes (editor -> admin,
    // still eligible), so project_members_contribution_fence runs contribution_fence on the queued successor.
    await ownerPool.query(`UPDATE sophia.project_members SET role='admin' WHERE project_id=$1 AND actor_id=$2`, [
      w.projectId,
      w.OWNER,
    ])
    assert.equal(await claimOf(succ.id), 'unfunded', 'no read, readiness view or fence funded it')
    await dispatchAll()
    assert.equal(await claimOf(succ.id), 'funded', 'its dispatch reacquired the remainder')
    await deliver(w.who, succ.attempt_id)
    assert.equal(await ledger(w.account), 1, '0.2 settled + 0.8 promised again, once')
  })

  it('withholds the successor when the money went elsewhere meanwhile; the erasure is not rolled back', async () => {
    const w = await world({ accountCap: 1.5 })
    await pin(w)
    const { s, succ } = await rebuilt(w)
    const other = await world({ owner: w.OWNER })
    await pin(other)
    await admitted(other)
    assert.equal(await ledger(w.account), 1.2)
    await dispatchAll()
    const job = await jobOf(succ.id)
    assert.equal(job.state, 'cancelled', JSON.stringify(job))
    assert.match(job.reason ?? '', /cannot fund its remainder: account_exhausted/)
    assert.equal(await claimOf(succ.id), 'unfunded')
    assert.equal((await jobOf(s.taskId)).state, 'failed', 'the erasure stands')
    assert.equal(
      (await one<{ state: string }>(`SELECT state FROM sophia.source_objects WHERE id=$1`, [w.input.sourceId])).state,
      'deleted',
    )
    assert.equal(await ledger(w.account), 1.2, 'the withheld successor promised nothing')
  })
})

describe('S02a ceiling: one immutable original cumulative cap; current narrowing restricts, growth never credits', () => {
  async function amendAfter(w: World, spent: number, change: Record<string, number>) {
    await pin(w)
    const s = await started(w)
    const m = await model(w, s.at, 'm1', spent)
    await settle(w, s.at, m.reservationId, 'settled', spent)
    await end(w, s.at)
    await withActor(api, w.OWNER, 'write', async (c) =>
      updateContributionGrant(c, w.grantId, await grantRevision(w), change),
    )
    await pin(w)
    const amended = await started(w, { amends: s.taskId })
    const binding = await one<{ cap: string }>(
      `SELECT lineage_cap_usd AS cap FROM sophia.api_contribution_tasks WHERE job_id=$1`,
      [amended.taskId],
    )
    return { amended, cap: Number(binding.cap) }
  }

  it('keeps the original cap 1 after the grant grows to 3: 0.7 spent leaves 0.3', async () => {
    const w = await world({ accountCap: 10 })
    const { amended, cap } = await amendAfter(w, 0.7, { taskCapUsd: 3 })
    assert.equal(cap, 1, 'the amendment carries the original ceiling, not the current grant')
    assert.equal(await ledger(w.account), 1, '0.7 settled + 0.3 promised')
    assert.equal(await codeOf(model(w, amended.at, 'a1', 0.5)), 'task_cap_reached')
    assert.equal((await model(w, amended.at, 'a2', 0.3)).state, 'reserved')
  })

  it('applies a narrower current cap: 0.7 spent under a grant narrowed to 0.8 leaves 0.1', async () => {
    const w = await world({ accountCap: 10 })
    const { amended, cap } = await amendAfter(w, 0.7, { taskCapUsd: 0.8 })
    assert.equal(cap, 1)
    assert.equal(await ledger(w.account), 0.8)
    assert.equal(await codeOf(model(w, amended.at, 'a1', 0.2)), 'task_cap_reached')
    assert.equal((await model(w, amended.at, 'a2', 0.1)).state, 'reserved')
  })

  /** A binding written before 0105 (no frozen facts, no claim): a project-funded task given a legacy-shaped binding. */
  async function legacyLineage(w: World) {
    await pin(w)
    await withActor(api, w.REQ, 'write', (c) => c.query('SELECT sophia.research_funding_pin_clear($1)', [w.projectId]))
    const base = await admitted(w)
    const t = await one<{ allowance_id: string }>(`SELECT allowance_id FROM sophia.research_tasks WHERE job_id=$1`, [
      base.taskId,
    ])
    await ownerPool.query(`UPDATE sophia.jobs SET state='failed', reason='synthetic: legacy history' WHERE id=$1`, [
      base.taskId,
    ])
    await ownerPool.query(
      `INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,
        credential_revision,account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort)
       SELECT $1,$2,$3,g.id,g.revision,c.id,c.credential_revision,c.account_id,g.owner_id,$4,$5,g.route_id,g.model,g.effort
        FROM sophia.api_contribution_grants g JOIN sophia.api_connections c ON c.id=g.connection_id WHERE g.id=$6`,
      [w.projectId, base.taskId, t.allowance_id, w.REQ, w.reg.resourceId, w.grantId],
    )
    return base
  }

  it('proves a legacy lineage only while its grant revision is unchanged, and holds it otherwise', async () => {
    const proven = await world({ accountCap: 10 })
    const base = await legacyLineage(proven)
    await pin(proven)
    const amended = await admitted(proven, { amends: base.taskId })
    assert.equal(
      Number(
        (
          await one<{ cap: string }>(
            `SELECT lineage_cap_usd AS cap FROM sophia.api_contribution_tasks WHERE job_id=$1`,
            [amended.taskId],
          )
        ).cap,
      ),
      1,
      'proven: the grant is unchanged since that binding',
    )
    const unproven = await world({ accountCap: 10 })
    const old = await legacyLineage(unproven)
    await withActor(api, unproven.OWNER, 'write', async (c) =>
      updateContributionGrant(c, unproven.grantId, await grantRevision(unproven), { taskCapUsd: 2 }),
    )
    await pin(unproven)
    assert.equal(await codeOf(ask(unproven, { amends: old.taskId })), 'lineage_cap_unproven')
    assert.equal(await tasksIn(unproven.projectId), 1, 'nothing new was admitted')
  })
})

describe('S02a protection and qualification at the final instant', () => {
  it('refuses the slot the owner protects, and a paid call once protection is narrowed or withdrawn, debiting nothing', async () => {
    const w = await world({
      accountCap: 10,
      accountConcurrency: 2,
      protection: { ...NONE_APPLICABLE, applicability: 'protected', protectedConcurrency: 1 },
    })
    await pin(w)
    const s = await started(w)
    const other = await world({ owner: w.OWNER })
    await pin(other)
    assert.equal(await codeOf(ask(other)), 'reserve_protected', 'the second slot is the protected one')
    await withActor(api, w.OWNER, 'write', async (c) =>
      updateApiAccount(c, w.account, await accountRevision(w), {
        protection: { ...NONE_APPLICABLE, applicability: 'protected', protectedSpendUsd: 9.5 },
      }),
    )
    assert.equal(await codeOf(model(w, s.at, 'm1', 0.1)), 'reserve_protected', 'checked at the paid call, now')
    await withActor(api, w.OWNER, 'write', async (c) =>
      updateApiAccount(c, w.account, await accountRevision(w), { protection: null }),
    )
    assert.equal(await codeOf(model(w, s.at, 'm2', 0.1)), 'protection_policy_absent')
    assert.equal(await reservationsOf(s.taskId), 0, 'no paid call was reserved')
  })

  it('judges the qualification after the last wait: an expiry while waiting on its row refuses', async () => {
    const w = await world({ accountCap: 10 })
    await pin(w)
    const q = await liveQualification(w.connectionId)
    await revokeApiAccountQualification(ownerPool, q.id, 'synthetic: replaced by a short one')
    await qualify(w.connectionId, new Date(Date.now() + 2500))
    const short = await liveQualification(w.connectionId)
    const holder = await ownerPool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.api_account_qualifications WHERE id=$1 FOR UPDATE`, [short.id])
      const pending = codeOf(ask(w))
      const flag = settledFlag(pending)
      await sleep(600)
      assert.equal(flag.settled, false, 'the admission waits on the qualification row, its last lock')
      await sleep(2600)
      await holder.query('ROLLBACK')
      assert.equal(await bounded(pending), 'account_unqualified', 'it expired while the admission waited')
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      holder.release()
    }
    assert.equal(await tasksIn(w.projectId), 0)
  })

  it('serializes a revocation against an admission: the revoked row is not bound', async () => {
    const w = await world({ accountCap: 10 })
    await pin(w)
    const q = await liveQualification(w.connectionId)
    const operator = await ownerPool.connect()
    try {
      await operator.query('BEGIN')
      await operator.query(`SELECT sophia.revoke_api_account_qualification($1, 'synthetic revocation')`, [q.id])
      const pending = codeOf(ask(w))
      const flag = settledFlag(pending)
      await sleep(600)
      assert.equal(flag.settled, false, 'the admission waits for the revocation to decide')
      await operator.query('COMMIT')
      assert.equal(await bounded(pending), 'account_unqualified')
    } finally {
      await operator.query('ROLLBACK').catch(() => undefined)
      operator.release()
    }
  })

  it('freezes exactly the checked row; a revocation before dispatch denies the create; after dispatch, the paid call', async () => {
    const w = await world({ accountCap: 10 })
    await pin(w)
    const q = await liveQualification(w.connectionId)
    const queued = await admitted(w)
    const frozen = await one<{ id: string; witness: string }>(
      `SELECT account_qualification_id AS id, protection_witness AS witness FROM sophia.api_contribution_tasks WHERE job_id=$1`,
      [queued.taskId],
    )
    assert.deepEqual([frozen.id, frozen.witness], [q.id, 'none_applicable'])
    await revokeApiAccountQualification(ownerPool, q.id, 'synthetic revocation')
    await dispatchAll()
    const denied = await jobOf(queued.taskId)
    assert.equal(denied.state, 'cancelled')
    assert.match(denied.reason ?? '', /not currently qualified/)

    const x = await world({ accountCap: 10 })
    await pin(x)
    const s = await started(x)
    const kept = await model(x, s.at, 'm1', 0.1)
    await revokeApiAccountQualification(ownerPool, (await liveQualification(x.connectionId)).id, 'synthetic revocation')
    assert.equal(await codeOf(model(x, s.at, 'm2', 0.1)), 'account_unqualified', 'the paid call rechecks it')
    assert.equal((await model(x, s.at, 'm1', 0.1)).reservationId, kept.reservationId, 'a replay is unchanged')
    await settle(x, s.at, kept.reservationId, 'settled', 0.05)
    assert.equal(await reservationsOf(s.taskId), 1)
  })
})

describe('S02a identity: typed recorded facts only', () => {
  it('holds unknown provenance even when qualified, admits it once the owner declares it, and an owner-declared separate root', async () => {
    const w = await world({ provenance: 'unknown' })
    await pin(w)
    assert.equal(await codeOf(ask(w)), 'account_identity_unresolved', 'a qualification proves no grouping')
    await withActor(api, w.OWNER, 'write', async (c) =>
      updateApiAccount(c, w.account, await accountRevision(w), { provenance: 'owner_declared' }),
    )
    await admitted(w)
    // A second, separately owned root of the same owner and provider: its own caps, never the first root's money.
    const separate = await world({
      owner: w.OWNER,
      separateOwnershipNote: 'synthetic: a separately owned account',
      accountCap: 1,
    })
    assert.notEqual(separate.account, w.account)
    await pin(separate)
    await admitted(separate)
    assert.equal(await ledger(separate.account), 1)
    assert.equal(await ledger(w.account), 1)
  })
})

/** A migration's text, and one `CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox` statement of it. */
const migration = (n: string) => readFileSync(new URL(`../../../db/migrations/${n}`, import.meta.url), 'utf8')
function dispatchDefinition(sql: string): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION sophia.dispatch_runtime_outbox(')
  assert.notEqual(start, -1)
  const stop = sql.indexOf('\nEND $$;', start)
  return sql.slice(start, stop + '\nEND $$;'.length)
}

describe('S02a records: the binding is immutable, a claim only moves unfunded -> funded', () => {
  it('refuses any edit or deletion of a binding or claim, even by the migration owner', async () => {
    const w = await world()
    await pin(w)
    const r = await admitted(w)
    for (const sql of [
      `UPDATE sophia.api_contribution_tasks SET lineage_cap_usd=9 WHERE job_id=$1`,
      `DELETE FROM sophia.api_contribution_tasks WHERE job_id=$1`,
      `UPDATE sophia.api_contribution_claims SET state='unfunded', funded_at=NULL WHERE job_id=$1`,
      `DELETE FROM sophia.api_contribution_claims WHERE job_id=$1`,
    ]) {
      await assert.rejects(ownerPool.query(sql, [r.taskId]), (e: { code?: string }) => e.code === '55000', sql)
    }
    assert.equal(await claimOf(r.taskId), 'funded')
  })

  it('replaces dispatch_runtime_outbox with 0075’s definition byte for byte plus the one marked S02A-FUND insertion', () => {
    const marked = /^[ \t]*-- S02A-FUND-BEGIN[^\n]*\n[\s\S]*?^[ \t]*-- S02A-FUND-END[^\n]*\n/m
    const ours = dispatchDefinition(migration('0105_contribution_atomic_admission.sql'))
    assert.match(ours, marked)
    assert.equal(ours.replace(marked, ''), dispatchDefinition(migration('0075_completed_goal_session_retirement.sql')))
  })

  it('is proven installed here, under the API’s and the worker’s own logins, by the shared catalog proof (coherent)', async () => {
    // The guards in front of admission, the paid reserve and new-work dispatch read the catalog as these roles: on this
    // full database every case above passed through them, so each proof must answer true for both.
    assert.equal(await atomicAdmissionInstalled(api), true, 'the API login')
    assert.equal(await atomicAdmissionInstalled(worker), true, 'the worker login')
    assert.equal(
      Number(
        (
          await one<{ n: string }>(
            `SELECT count(*) AS n FROM pg_catalog.pg_attribute WHERE attrelid='sophia.api_contribution_tasks'::regclass
              AND attname = ANY($1) AND NOT attisdropped`,
            [[...ATOMIC_ADMISSION_COLUMNS]],
          )
        ).n,
      ),
      7,
      'the seven checked facts are columns of the binding, as the proof counts them',
    )
  })
})

describe('S02a trusted preview: promised money is not shown free (C05)', () => {
  const candidateOf = async (w: World, viewer = w.REQ) => {
    const snap = await withActor(api, viewer, 'read', (c) => readSelectionSnapshot(c, w.projectId, []))
    // The full discriminant first (0106: a viewer's snapshot is restricted and carries no pool); these are editors.
    assert.ok(snap?.evaluation === 'full', JSON.stringify(snap))
    assert.ok(snap.complete)
    return snap.candidates.find((x) => x.kind === 'api' && x.grantId === w.grantId)
  }

  it('counts a pending lineage with no reservation yet, shares it across an alias, and judges protection on the same basis', async () => {
    const w = await world({ accountCap: 1.5 })
    await pin(w)
    const fresh = await candidateOf(w)
    assert.ok(fresh?.kind === 'api' && fresh.capacity.admits, JSON.stringify(fresh))
    await admitted(w) // pending, nothing reserved: 1 promised
    const alias = await world({ owner: w.OWNER })
    const seen = await candidateOf(alias)
    assert.ok(seen?.kind === 'api')
    assert.equal(seen.capacity.admits, false)
    assert.ok(seen.capacity.reasons.includes('account_spend'), JSON.stringify(seen.capacity))
    // Protection on the same basis: 1 promised + 1 more > 1.5 - 0.4.
    const p = await world({
      accountCap: 3,
      protection: { ...NONE_APPLICABLE, applicability: 'protected', protectedSpendUsd: 1.5 },
    })
    await pin(p)
    await admitted(p)
    const pAlias = await world({ owner: p.OWNER })
    const pSeen = await candidateOf(pAlias)
    assert.ok(pSeen?.kind === 'api')
    assert.deepEqual(pSeen.protection, {
      witness: 'covered',
      dimensions: [{ ref: 'account_spend', verdict: 'would_violate' }],
    })
  })

  it('keeps the snapshot private: no amount, hold, claim or ledger detail appears in it', async () => {
    const w = await world({ accountCap: 1.5 })
    await pin(w)
    await admitted(w)
    const snap = await withActor(api, w.REQ, 'read', (c) => readSelectionSnapshot(c, w.projectId, []))
    const text = JSON.stringify(snap)
    assert.equal(/Usd|hold|claim|funded|lineage|ceiling|committed/i.test(text), false, text)
    assert.equal(
      await withActor(api, randomUUID(), 'read', (c) => readSelectionSnapshot(c, w.projectId, [])),
      null,
      'a nonmember reads nothing',
    )
  })
})
