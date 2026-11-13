// INC01-COHERENT-001: crossings that exist only once the accepted slices are composed on the published native parent.
// Each slice keeps its own suite; this file covers only what no single slice could run:
// - 0094 contribution research against 0096 source erasure, and its rebuild's funding binding (0100, CW2-REBUILD-F01);
// - the 0097 member read over the 0092/0096 owner-runner qualification table;
// - Personal 0098/0099 inputs and erasure against 0095 conversation inputs and erasure;
// - the role privileges every 0092–0100 function and table leaves behind.
// Level: sql-run on a disposable PostgreSQL, with the production split (the API login with a transaction-local actor,
// the worker login, the migration owner as operator). Every grant, account, route qualification and token is
// SYNTHETIC; no provider, model or native host is called. Expected values come from each migration's own contract.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  AUTOMATIC_V1,
  PERSONAL_AUTOMATIC_V1,
  admitResearchTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  eraseConversation,
  previewContributionAct,
  readPersonalInputs,
  readProjectNativeResources,
  recordRuntimeReady,
  recordRuntimeReceipts,
  runtimeHello,
  runtimePoll,
  runtimeResearchCapture,
  runtimeResearchDraft,
  runtimeResearchReserve,
  runtimeResearchSettle,
  runtimeResearchSubmit,
  runtimeTokenHash,
  startConversationInput,
  submitContribution,
  withActor,
  withService,
  withdrawContribution,
  type RuntimeCaller,
} from './index.ts'
import {
  contributionRefusalOf,
  createApiAccount,
  createApiConnection,
  createContributionGrant,
  qualifyApiAccount,
  readResearchTaskFunding,
  registerContributionRuntime,
  setContributionGrantState,
  setResearchFundingPin,
  updateApiAccount,
  updateContributionGrant,
} from './api-contributions.ts'
import { erasePersonalSpace } from './personal.ts'
import { sendPersonalInput } from './personal-inputs.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let ownerPool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  ownerPool = new pg.Pool({ connectionString: db.ownerUrl, max: 3 })
  // A SYNTHETIC route qualification: the precondition of any contribution use. None exists in production.
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

const rows = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await ownerPool.query<T>(sql, params)).rows
const one = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T> => {
  const [row] = await rows<T>(sql, params)
  assert.ok(row !== undefined, sql)
  return row
}
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)

// ---- 0094 contribution research against 0096 source erasure, and its rebuild (0100, CW2-REBUILD-F01) ----

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const callerOf = (token: string, unit: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: unit,
  bridgeInstanceId: randomUUID(),
})
async function bringUp(who: RuntimeCaller) {
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
}

/** The stable code of a refusal: a contribution refusal's reason, or the raw message. */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    const refusal = contributionRefusalOf(err) ?? contributionRefusalOf((err as { cause?: unknown }).cause)
    return refusal ? refusal.refusal : `raw:${(err as Error).message}`
  }
}

/**
 * A project with research enabled and a ready legacy runtime; an owner's account (cap `accountCap`), connection and
 * grant (task cap `taskCap`, total cap `grantCap`); the owner's registered contribution runtime; a requester's input,
 * and (unless `pinned` is false) the requester's pin of the grant.
 */
async function contributionWorld(
  opts: {
    taskCap?: number
    grantCap?: number
    accountCap?: number
    pinned?: boolean
    /** The account's concurrency limit (0094: 1 to 3) and the grant's (at most the account's). */
    accountConcurrency?: number
    grantConcurrency?: number
    /** Another project on the same owner's account and connection (an alias), with its own grant and runtime. */
    aliasOf?: { OWNER: string; accountId: string; connectionId: string }
  } = {},
) {
  const OWNER = opts.aliasOf?.OWNER ?? randomUUID()
  const [REQ, ADMIN] = [randomUUID(), randomUUID()]
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ] })
  await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const legacy = await registerRuntime(db.ownerUrl, { projectId, admin: ADMIN })
  const legacyWho = callerOf(legacy.token, legacy.runtimeUnitId)
  await bringUp(legacyWho)
  const account = opts.aliasOf
    ? { accountId: opts.aliasOf.accountId }
    : await withActor(api, OWNER, 'write', (c) =>
        createApiAccount(c, {
          label: 'My API',
          totalCapUsd: opts.accountCap ?? 10,
          concurrency: opts.accountConcurrency ?? 1,
        }),
      )
  // 0105 (S02a): a pinned contributed admission needs the owner's explicit protection declaration on the account
  // (an alias shares its owner's account, already declared). SYNTHETIC.
  if (!opts.aliasOf)
    await withActor(api, OWNER, 'write', (c) =>
      updateApiAccount(c, account.accountId, 1, {
        protection: { applicability: 'none_applicable', operations: ['research'], roles: ['sophia-research-md-v1'] },
      }),
    )
  const conn = opts.aliasOf
    ? { connectionId: opts.aliasOf.connectionId }
    : await withActor(api, OWNER, 'write', (c) =>
        createApiConnection(c, account.accountId, 'Research key', 'Operator host'),
      )
  const grant = await withActor(api, OWNER, 'write', (c) =>
    createContributionGrant(c, conn.connectionId, projectId, {
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      taskCapUsd: opts.taskCap ?? 1,
      totalCapUsd: opts.grantCap ?? 5,
      concurrency: opts.grantConcurrency ?? 1,
      fundingPolicy: 'bounded_total_spend',
      fundingAcknowledgementRef: 'synthetic acknowledgement: provider may draw on mixed funds',
    }),
  )
  const token = randomUUID() + randomUUID()
  const unit = opts.aliasOf ? 'sophia-runtime-alias' : 'sophia-runtime-test'
  await registerContributionRuntime(ownerPool, {
    projectId,
    connectionId: conn.connectionId,
    runtimeUnitId: unit,
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate: false,
  })
  const who = callerOf(token, unit)
  await bringUp(who)
  // 0105 (S02a): and the operator's account qualification for the connection's current credential revision (an alias
  // shares its owner's connection, already qualified). SYNTHETIC: not a live account qualification.
  if (!opts.aliasOf)
    await qualifyApiAccount(ownerPool, {
      connectionId: conn.connectionId,
      operations: ['research'],
      verification: 'operator_verified_call',
      evidenceRef: 'synthetic: not a live account qualification',
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    })
  const input = await withActor(api, REQ, 'write', (c) =>
    submitContribution(c, projectId, randomUUID(), {
      source: null,
      text: 'Our pilot hosts render PDFs in a sandbox.',
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )
  if (opts.pinned ?? true)
    await withActor(api, REQ, 'write', (c) => setResearchFundingPin(c, projectId, grant.grantId, 1))
  return {
    projectId,
    OWNER,
    REQ,
    ADMIN,
    grantId: grant.grantId,
    accountId: account.accountId,
    connectionId: conn.connectionId,
    who,
    legacyWho,
    input,
  }
}
type CWorld = Awaited<ReturnType<typeof contributionWorld>>
type At = { attemptId: string; nativeSessionId: string }

async function dispatchAll() {
  for (const row of await claimRuntimeOutbox(worker, 'coherent-worker', 50, 30))
    await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
}
/** Poll `who` for the create of `attemptId` and report it delivered; the session its research tools run in. */
async function deliver(who: RuntimeCaller, attemptId: string): Promise<At> {
  const batch = await service((c) => runtimePoll(c, who, 0))
  const create = batch.commands
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
const reserve = (who: RuntimeCaller, at: At, callId: string, amountUsd: number) =>
  service((c) =>
    runtimeResearchReserve(c, who, { ...at, callId, kind: 'model', provider: 'openai-research', amountUsd }),
  )

/** Admit research reading the requester's input, dispatch it and deliver it to `who` (the contribution runtime). */
async function startedWithInput(w: CWorld, who = w.who) {
  const admission = await withActor(api, w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: {
        question: 'What do our sources say about PDF sandboxes?',
        outputs: ['markdown'],
        inputSourceIds: [w.input.sourceId],
      },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
  assert.ok('admitted' in admission, JSON.stringify(admission))
  await dispatchAll()
  const at = await deliver(who, admission.admitted.attemptId)
  return { taskId: admission.admitted.taskId, at }
}
/** The requester withdraws the input: its words are erased through mission_erase_source (0096). */
async function withdrawInput(w: CWorld) {
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
}
/** The task research_rebuild queued for `taskId`, if any. */
const rebuiltOf = async (projectId: string, taskId: string) =>
  (
    await rows<{ id: string; attempt_id: string }>(
      `SELECT j.id, j.attempt_id FROM sophia.research_tasks r JOIN sophia.jobs j ON j.project_id=r.project_id AND j.id=r.job_id
         WHERE r.project_id=$1 AND r.rebuilt_from_job_id=$2`,
      [projectId, taskId],
    )
  )[0]
const bindingOf = (projectId: string, job: string) =>
  rows(
    `SELECT allowance_id, grant_id, grant_revision, connection_id, credential_revision, account_id, owner_id, requester_id,
       resource_id, requested_route, requested_model, requested_effort
       FROM sophia.api_contribution_tasks WHERE project_id=$1 AND job_id=$2`,
    [projectId, job],
  )
const fundingOf = (w: CWorld, job: string) =>
  withActor(api, w.REQ, 'read', (c) => readResearchTaskFunding(c, w.projectId, job))
const jobState = (job: string) =>
  one<{ state: string; reason: string | null }>(`SELECT state, reason FROM sophia.jobs WHERE id=$1`, [job])

/** What the erasure must always leave, whether or not new work may continue. */
async function assertErasureCommitted(w: CWorld, taskId: string, attemptId: string) {
  const job = await jobState(taskId)
  assert.equal(job.state, 'failed')
  assert.match(job.reason ?? '', /^revoked: /)
  assert.equal(
    (await one<{ state: string }>(`SELECT state FROM sophia.work_attempts WHERE id=$1`, [attemptId])).state,
    'revoked',
  )
  const binding = await one<{ id: string; state: string }>(
    `SELECT id, state FROM sophia.execution_bindings WHERE attempt_id=$1`,
    [attemptId],
  )
  assert.equal(binding.state, 'stopping')
  assert.deepEqual(
    (
      await rows<{ kind: string }>(`SELECT kind FROM sophia.commands WHERE project_id=$1 AND idempotency_key=$2`, [
        w.projectId,
        `revoke:${taskId}`,
      ])
    ).map((r) => r.kind),
    ['stop'],
    'one Stop',
  )
  assert.deepEqual(
    await rows(
      `SELECT destination, cleanup FROM sophia.outbox WHERE project_id=$1 AND binding_id=$2 AND destination='native.stop'`,
      [w.projectId, binding.id],
    ),
    [{ destination: 'native.stop', cleanup: true }],
  )
  assert.equal(
    (
      await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.source_texts WHERE source_id=$1`, [
        w.input.sourceId,
      ])
    ).n,
    0,
    'the withdrawn words are erased',
  )
}

describe('0094 contribution research against 0096 erasure: the rebuild keeps its funding binding (0100)', () => {
  it('erases and revokes, and the rebuilt task carries the frozen binding; its paid calls are contribution-accounted', async () => {
    // Limit 2: the original's reserved call keeps its slot and the rebuilt task takes the other (the reserved-old
    // positive; at limit 1 the rebuilt task is denied, below).
    const w = await contributionWorld({ accountConcurrency: 2, grantConcurrency: 2 })
    const s = await startedWithInput(w)
    const m1 = await reserve(w.who, s.at, 'm1', 0.05)
    const original = await bindingOf(w.projectId, s.taskId)
    assert.equal(original.length, 1)
    await withdrawInput(w)
    await assertErasureCommitted(w, s.taskId, s.at.attemptId)
    // The original reservation stays accounted (erasure releases nothing); no new paid call under the revoked attempt.
    assert.equal(
      (await one<{ state: string }>(`SELECT state FROM sophia.research_reservations WHERE id=$1`, [m1.reservationId]))
        .state,
      'reserved',
    )
    assert.notEqual(await codeOf(reserve(w.who, s.at, 'm2', 0.01)), 'resolved')
    // The rebuilt task: exactly the original frozen binding (grant and revision, credential, account, requester,
    // resource, allowance, settings), on the same contribution runtime.
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r, 'research_rebuild queued a replacement')
    assert.deepEqual(await bindingOf(w.projectId, r.id), original)
    await dispatchAll()
    const at = await deliver(w.who, r.attempt_id)
    const m3 = await reserve(w.who, at, 'r1', 0.03)
    const link = await rows(
      `SELECT job_id, grant_id, grant_revision, account_id, credential_revision FROM sophia.api_contribution_reservations WHERE reservation_id=$1`,
      [m3.reservationId],
    )
    assert.deepEqual(link, [
      {
        job_id: r.id,
        grant_id: w.grantId,
        grant_revision: '1',
        account_id: original[0]!.account_id,
        credential_revision: '1',
      },
    ])
    const replay = await reserve(w.who, at, 'r1', 0.03)
    assert.equal(replay.reservationId, m3.reservationId, 'a replay is the same reservation')
    assert.equal(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM sophia.api_contribution_reservations WHERE job_id=$1`,
          [r.id],
        )
      ).n,
      1,
    )
    const funding = await fundingOf(w, r.id)
    assert.equal(funding.funding, 'contribution')
    assert.equal(funding.funding === 'contribution' && funding.grantId, w.grantId)
    assert.equal(funding.payers.model, 'contributor_api_account')
  })

  // 0094 keeps a task cap within its grant's total and a grant within its account's, so within one lineage (one
  // allowance) the task cap binds first. The grant and account totals count every linked contribution reservation,
  // the rebuilt task's included (its link carries the original grant and account: first test).
  it('the task cap is cumulative across the lineage: the original commitment counts against the rebuilt task', async () => {
    const w = await contributionWorld({ taskCap: 0.1, accountConcurrency: 2, grantConcurrency: 2 })
    const s = await startedWithInput(w)
    await reserve(w.who, s.at, 'm1', 0.05)
    await withdrawInput(w)
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r)
    await dispatchAll()
    const at = await deliver(w.who, r.attempt_id)
    // The original 0.05 is still committed: 0.08 more exceeds the 0.10 cap; 0.05 more reaches it exactly.
    assert.equal(await codeOf(reserve(w.who, at, 'over', 0.08)), 'task_cap_reached')
    assert.equal(await codeOf(reserve(w.who, at, 'within', 0.05)), 'resolved')
    assert.equal(await codeOf(reserve(w.who, at, 'beyond', 0.01)), 'task_cap_reached')
  })

  it('current authority still decides: paused, a new grant revision, a removed requester and a rotated credential', async () => {
    // Paused before the rebuild is dispatched: the erasure commits, and the rebuilt create is denied, never sent.
    const p = await contributionWorld()
    const sp = await startedWithInput(p)
    await withActor(api, p.OWNER, 'write', (c) => setContributionGrantState(c, p.grantId, 1, 'paused'))
    await withdrawInput(p)
    await assertErasureCommitted(p, sp.taskId, sp.at.attemptId)
    const rp = await rebuiltOf(p.projectId, sp.taskId)
    assert.ok(rp)
    await dispatchAll()
    const denied = await jobState(rp.id)
    assert.equal(denied.state, 'cancelled')
    assert.match(denied.reason ?? '', /^not dispatched: .*grant_paused/)
    assert.equal(
      (await service((c) => runtimePoll(c, p.who, 0))).commands.some(
        (q) => (q.command as RuntimeCommand).binding.attemptId === rp.attempt_id,
      ),
      false,
      'nothing reached the runtime',
    )

    // Delivered, then the barriers each refuse its next paid call.
    const barriers: Array<[string, (w: CWorld) => Promise<unknown>]> = [
      [
        'grant_paused',
        (w) => withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId, 1, 'paused')),
      ],
      [
        'grant_revision_changed',
        (w) => withActor(api, w.OWNER, 'write', (c) => updateContributionGrant(c, w.grantId, 1, { taskCapUsd: 0.9 })),
      ],
      [
        'requester_ineligible',
        (w) =>
          ownerPool.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
            w.projectId,
            w.REQ,
          ]),
      ],
      [
        'credential_revision_changed',
        (w) =>
          registerContributionRuntime(ownerPool, {
            projectId: w.projectId,
            connectionId: w.connectionId,
            runtimeUnitId: 'sophia-runtime-test',
            tokenSha256: createHash('sha256').update(randomUUID(), 'utf8').digest(),
            rotate: true,
          }),
      ],
    ]
    for (const [code, change] of barriers) {
      const w = await contributionWorld()
      const s = await startedWithInput(w)
      await withdrawInput(w)
      const r = await rebuiltOf(w.projectId, s.taskId)
      assert.ok(r)
      await dispatchAll()
      const at = await deliver(w.who, r.attempt_id)
      await change(w)
      const got = await codeOf(reserve(w.who, at, 'after', 0.01))
      if (code === 'credential_revision_changed') assert.notEqual(got, 'resolved', code)
      else assert.equal(got, code, code)
    }
  })

  it('a grant pause committed while the rebuilt paid call waits on the grant lock refuses that call', async () => {
    const w = await contributionWorld()
    const s = await startedWithInput(w)
    await withdrawInput(w)
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r)
    await dispatchAll()
    const at = await deliver(w.who, r.attempt_id)
    const holder = await ownerPool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.api_contribution_grants WHERE id=$1 FOR UPDATE`, [w.grantId])
      const pending = codeOf(reserve(w.who, at, 'raced', 0.01))
      // The reservation is observed waiting on that row lock before the pause commits (bounded, named).
      const deadline = Date.now() + 8000
      for (;;) {
        const waiting = await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()
             AND query LIKE '%runtime_research_reserve%'`,
        )
        if (waiting.n > 0) break
        assert.ok(Date.now() < deadline, 'the reservation never waited on the grant lock')
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await holder.query(`UPDATE sophia.api_contribution_grants SET state='paused' WHERE id=$1`, [w.grantId])
      await holder.query('COMMIT')
      assert.equal(await pending, 'grant_paused')
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      holder.release()
    }
  })

  it('an existing orphan (a rebuild queued before 0100) is fenced at dispatch, paid call, funding read and publication', async () => {
    // Fixture: the migration owner deletes the rebuilt task's binding and its calls' ledger links, standing in for a
    // rebuild made before 0100 (no binding, so 0094 never linked its calls).
    // 0105 (S02a): SYNTHETIC HISTORICAL-STATE FAULT INJECTION, not a real pre-0100 upgrade or any production path (no
    // production role or path deletes a binding; 0105 makes bindings INSERT-only and claims unfunded -> funded only).
    // In ONE checked-out migration-owner transaction on this suite's disposable database, only the two named guard
    // triggers are disabled, exactly this project's successor claim, ledger links and binding are removed (counts
    // asserted), the guards are re-enabled and verified, then COMMIT; any error rolls the whole transaction back.
    const orphan = async (projectId: string, job: string, links: number) => {
      const c = await ownerPool.connect()
      try {
        await c.query('BEGIN')
        await c.query('ALTER TABLE sophia.api_contribution_tasks DISABLE TRIGGER api_contribution_tasks_frozen')
        await c.query('ALTER TABLE sophia.api_contribution_claims DISABLE TRIGGER api_contribution_claims_transition')
        const claims = await c.query(`DELETE FROM sophia.api_contribution_claims WHERE project_id=$1 AND job_id=$2`, [
          projectId,
          job,
        ])
        assert.equal(claims.rowCount, 1, 'exactly the successor claim')
        const linked = await c.query(
          `DELETE FROM sophia.api_contribution_reservations WHERE project_id=$1 AND job_id=$2`,
          [projectId, job],
        )
        assert.equal(linked.rowCount, links, 'exactly its contributed ledger links')
        const bound = await c.query(`DELETE FROM sophia.api_contribution_tasks WHERE project_id=$1 AND job_id=$2`, [
          projectId,
          job,
        ])
        assert.equal(bound.rowCount, 1, 'exactly the successor binding')
        await c.query('ALTER TABLE sophia.api_contribution_tasks ENABLE TRIGGER api_contribution_tasks_frozen')
        await c.query('ALTER TABLE sophia.api_contribution_claims ENABLE TRIGGER api_contribution_claims_transition')
        const guards = await c.query<{ tgname: string; tgenabled: string }>(
          `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname IN ('api_contribution_tasks_frozen','api_contribution_claims_transition')
            ORDER BY tgname`,
        )
        assert.deepEqual(
          guards.rows.map((g) => [g.tgname, g.tgenabled]),
          [
            ['api_contribution_claims_transition', 'O'],
            ['api_contribution_tasks_frozen', 'O'],
          ],
          'both guards restored to their original enabled state',
        )
        await c.query('COMMIT')
      } catch (err) {
        await c.query('ROLLBACK')
        throw err
      } finally {
        c.release()
      }
    }
    // Before dispatch: the create is denied with the truthful reason, never sent.
    const d = await contributionWorld()
    const sd = await startedWithInput(d)
    await withdrawInput(d)
    const rd = await rebuiltOf(d.projectId, sd.taskId)
    assert.ok(rd)
    await orphan(d.projectId, rd.id, 0)
    await dispatchAll()
    const denied = await jobState(rd.id)
    assert.equal(denied.state, 'cancelled')
    assert.match(denied.reason ?? '', /its contributed lineage has no funding binding/)
    assert.equal(await codeOf(fundingOf(d, rd.id)), 'lineage_unbound', 'the funding read refuses, never "project"')
    // Already delivered: while still bound, a contributed model call is left reserved, another is left uncertain,
    // and a cited source is captured (search is project-paid in 0094, for a bound contribution as for project work).
    const w = await contributionWorld()
    const s = await startedWithInput(w)
    await withdrawInput(w)
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r)
    await dispatchAll()
    const at = await deliver(w.who, r.attempt_id)
    const search = (callId: string) =>
      service((c) =>
        runtimeResearchReserve(c, w.who, {
          ...at,
          callId,
          kind: 'search',
          provider: 'tavily',
          amountUsd: 0.01,
          query: 'q',
        }),
      )
    const settle = (reservationId: string, outcome: 'settled' | 'uncertain', costUsd?: number) =>
      service((c) =>
        runtimeResearchSettle(c, w.who, {
          ...at,
          reservationId,
          outcome,
          ...(costUsd === undefined ? {} : { costUsd }),
        }),
      )
    const pending = await reserve(w.who, at, 'pre_model', 0.02)
    const unsure = await reserve(w.who, at, 'pre_unsure', 0.01)
    await settle(unsure.reservationId, 'uncertain')
    const found = await search('search_cite')
    const captured = await service((c) =>
      runtimeResearchCapture(c, w.who, {
        ...at,
        reservationId: found.reservationId,
        kind: 'search_results',
        provider: 'tavily',
        providerHttpStatus: 200,
        coverage: 'complete',
        limitations: [],
        results: [{ url: 'https://hosts.example.org/a' }],
      }),
    )
    const reservations = async () =>
      (
        await rows<{ id: string }>(`SELECT id FROM sophia.research_reservations WHERE project_id=$1 ORDER BY id`, [
          w.projectId,
        ])
      ).map((x) => x.id)
    const linked = async () =>
      (
        await rows<{ reservation_id: string }>(
          `SELECT reservation_id FROM sophia.api_contribution_reservations WHERE job_id=$1 ORDER BY reservation_id`,
          [r.id],
        )
      ).map((x) => x.reservation_id)
    assert.deepEqual(await linked(), [pending.reservationId, unsure.reservationId].toSorted())
    await orphan(w.projectId, r.id, 2)
    const kept = await reservations()
    // New paid work of any kind is refused before anything is reserved: a model call, a search, a read.
    assert.equal(await codeOf(reserve(w.who, at, 'orphan', 0.01)), 'lineage_unbound')
    assert.equal(await codeOf(search('search_new')), 'lineage_unbound')
    assert.equal(
      await codeOf(
        service((c) =>
          runtimeResearchReserve(c, w.who, {
            ...at,
            callId: 'read_new',
            kind: 'read',
            provider: 'jina',
            amountUsd: 0.02,
            targetRef: captured.refs[0]!,
          }),
        ),
      ),
      'lineage_unbound',
    )
    assert.deepEqual(await reservations(), kept, 'nothing new is reserved')
    // What was made while bound keeps its identity: a replay is the same reservation, and each call still ends as made.
    assert.equal((await search('search_cite')).reservationId, found.reservationId)
    assert.equal((await reserve(w.who, at, 'pre_model', 0.02)).reservationId, pending.reservationId)
    const ended = await settle(pending.reservationId, 'settled', 0.015)
    assert.deepEqual([ended.state, ended.settledUsd], ['settled', 0.015])
    const reconciled = await settle(unsure.reservationId, 'settled', 0.01)
    assert.deepEqual([reconciled.state, reconciled.settledUsd], ['settled', 0.01])
    assert.deepEqual(await reservations(), kept, 'replay and settlement reserve nothing new')
    assert.deepEqual(await linked(), [], 'no ledger link is invented for an unbound lineage')
    // A result that would otherwise publish, citing the source captured while bound: withheld.
    const draft = await service((c) =>
      runtimeResearchDraft(c, w.who, { ...at, callId: 'd1', expectedSha256: null, text: '# Report' }),
    )
    const out = await service((c) =>
      runtimeResearchSubmit(c, w.who, {
        ...at,
        callId: 'sub',
        result: {
          draftSha256: draft.sha256,
          title: 'Sandboxes for PDF rendering',
          summary: 'Which hosts render PDFs in a sandbox.',
          resultSummary: 'One host renders in a sandbox.',
          limitations: [],
          citations: [captured.sourceId],
        },
      }),
    ).catch((err: unknown) => ({ outcome: `raised: ${(err as Error).message}` }))
    assert.equal(out.outcome, 'withheld')
    assert.match((await jobState(r.id)).reason ?? '', /its contributed lineage has no funding binding/)
  })

  it('a project-funded task is rebuilt as project work, as before', async () => {
    const w = await contributionWorld({ pinned: false })
    const s = await startedWithInput(w, w.legacyWho)
    assert.equal((await bindingOf(w.projectId, s.taskId)).length, 0)
    await reserve(w.legacyWho, s.at, 'm1', 0.05)
    await withdrawInput(w)
    await assertErasureCommitted(w, s.taskId, s.at.attemptId)
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r)
    assert.equal((await bindingOf(w.projectId, r.id)).length, 0, 'no binding is invented')
    await dispatchAll()
    const at = await deliver(w.legacyWho, r.attempt_id)
    assert.equal(await codeOf(reserve(w.legacyWho, at, 'r1', 0.05)), 'resolved')
    const fresh = service((c) =>
      runtimeResearchReserve(c, w.legacyWho, {
        ...at,
        callId: 'r2',
        kind: 'search',
        provider: 'tavily',
        amountUsd: 0.01,
        query: 'q',
      }),
    )
    assert.equal(await codeOf(fresh), 'resolved', 'a new paid search of project work is not fenced')
    const funding = await fundingOf(w, r.id)
    assert.equal(funding.funding, 'project')
  })
})

// ---- 0097 member read over the 0092/0096 owner-runner qualification table ----

describe('a rebuilt contributed task takes a slot only within its account and grant concurrency (WRITE-004)', () => {
  // The rebuilt task never passed admission: dispatch and its paid calls decide its slot, counting every other held
  // task as 0094 does (the original's reserved or uncertain call keeps its slot) and not counting itself.
  const settle = (
    who: RuntimeCaller,
    at: At,
    reservationId: string,
    outcome: 'settled' | 'uncertain',
    costUsd?: number,
  ) =>
    service((c) =>
      runtimeResearchSettle(c, who, { ...at, reservationId, outcome, ...(costUsd === undefined ? {} : { costUsd }) }),
    )
  const reached = async (w: CWorld, attemptId: string) =>
    (await service((c) => runtimePoll(c, w.who, 0))).commands.some(
      (q) => (q.command as RuntimeCommand).binding.attemptId === attemptId,
    )
  const reservationsOf = async (w: CWorld) =>
    (
      await rows<{ id: string; state: string }>(
        `SELECT id, state FROM sophia.research_reservations WHERE project_id=$1 ORDER BY id`,
        [w.projectId],
      )
    ).map((x) => `${x.id}:${x.state}`)
  const slotsHeld = async (accountId: string) =>
    (await one<{ n: number }>(`SELECT sophia.contribution_slots_held($1) AS n`, [accountId])).n
  /** The original admitted, delivered and holding one model call in `state`; then its input is withdrawn. */
  async function rebuiltAfter(w: CWorld, state: 'reserved' | 'uncertain' | 'settled') {
    const s = await startedWithInput(w)
    const m1 = await reserve(w.who, s.at, 'm1', 0.05)
    if (state === 'uncertain') await settle(w.who, s.at, m1.reservationId, 'uncertain')
    if (state === 'settled') await settle(w.who, s.at, m1.reservationId, 'settled', 0.04)
    await withdrawInput(w)
    await assertErasureCommitted(w, s.taskId, s.at.attemptId)
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r, 'research_rebuild queued a replacement')
    return { s, m1, r }
  }
  async function assertDenied(w: CWorld, r: { id: string; attempt_id: string }, limit: 'account' | 'grant') {
    const job = await jobState(r.id)
    assert.equal(job.state, 'cancelled')
    assert.match(
      job.reason ?? '',
      new RegExp(`^not dispatched: .*its contribution's ${limit} capacity is held by earlier work`),
    )
    assert.equal(await reached(w, r.attempt_id), false, 'nothing reached the runtime')
  }

  it('the original call reserved or uncertain holds the only slot: the rebuilt create is denied, nothing new is reserved', async () => {
    for (const state of ['reserved', 'uncertain'] as const) {
      const w = await contributionWorld()
      const { m1, r } = await rebuiltAfter(w, state)
      const original = await reservationsOf(w)
      assert.deepEqual(original, [`${m1.reservationId}:${state}`])
      await dispatchAll()
      await assertDenied(w, r, 'account')
      // The original commitment is kept as it was (nothing released, refunded or relabelled), and it is the only slot.
      assert.deepEqual(await reservationsOf(w), original, state)
      assert.equal(await slotsHeld(w.accountId), 1, `${state}: the denied task holds nothing`)
    }
  })

  it('the grant’s own limit binds alone (account 2, grant 1)', async () => {
    const w = await contributionWorld({ accountConcurrency: 2, grantConcurrency: 1 })
    const { r } = await rebuiltAfter(w, 'reserved')
    await dispatchAll()
    await assertDenied(w, r, 'grant')
  })

  it('the account’s limit binds alone, across another project on the same account (an alias)', async () => {
    const w = await contributionWorld({ accountConcurrency: 2, grantConcurrency: 2 })
    const s = await startedWithInput(w)
    // Another project's grant on the same account and connection, its task admitted while the original runs.
    const alias = await contributionWorld({ aliasOf: w, grantConcurrency: 1 })
    assert.equal(alias.accountId, w.accountId)
    await startedWithInput(alias)
    await reserve(w.who, s.at, 'm1', 0.05)
    await withdrawInput(w)
    const r = await rebuiltOf(w.projectId, s.taskId)
    assert.ok(r)
    // The grant has room (the original's call: 1 of 2); the account does not (that call and the alias's task: 2 of 2).
    await dispatchAll()
    await assertDenied(w, r, 'account')
  })

  /** Holds the account row, lets `act` wait on it, then lowers the account's limit from 2 to 1 and commits. */
  const lowered = async (w: CWorld, query: string, act: () => Promise<unknown>) => {
    const holder = await ownerPool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM sophia.api_accounts WHERE id=$1 FOR UPDATE`, [w.accountId])
      const pending = act()
      const deadline = Date.now() + 8000
      for (;;) {
        const waiting = await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()
             AND query LIKE $1`,
          [`%${query}%`],
        )
        if (waiting.n > 0) break
        assert.ok(Date.now() < deadline, `${query} never waited on the account row`)
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      // Before the wait the account had room (limit 2: the original's call and this task); after it, it has not.
      await holder.query(`UPDATE sophia.api_accounts SET concurrency_limit=1 WHERE id=$1`, [w.accountId])
      await holder.query('COMMIT')
      return await pending
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      holder.release()
    }
  }

  it('capacity is read after the account row’s wait at dispatch: a limit lowered meanwhile denies the create', async () => {
    const d = await contributionWorld({ accountConcurrency: 2, grantConcurrency: 2 })
    const rd = (await rebuiltAfter(d, 'reserved')).r
    await lowered(d, 'runtime_outbox', dispatchAll)
    await assertDenied(d, rd, 'account')
  })

  it('capacity is read after the account row’s wait at the paid call: a limit lowered meanwhile refuses it', async () => {
    // Delivered with room (limit 2: the original's call and this task).
    const p = await contributionWorld({ accountConcurrency: 2, grantConcurrency: 2 })
    const rp = (await rebuiltAfter(p, 'reserved')).r
    await dispatchAll()
    const at = await deliver(p.who, rp.attempt_id)
    const kept = await reservationsOf(p)
    assert.equal(
      await lowered(p, 'runtime_research_reserve', () => codeOf(reserve(p.who, at, 'raced', 0.01))),
      'account_busy',
    )
    assert.deepEqual(await reservationsOf(p), kept, 'nothing new is reserved')
  })

  it('a settled original leaves the slot to the rebuilt task (limit 1); its calls replay as the same reservation', async () => {
    const w = await contributionWorld()
    const { r } = await rebuiltAfter(w, 'settled')
    await dispatchAll()
    const at = await deliver(w.who, r.attempt_id)
    const n1 = await reserve(w.who, at, 'n1', 0.01)
    assert.equal((await reserve(w.who, at, 'n1', 0.01)).reservationId, n1.reservationId)
    assert.equal(await slotsHeld(w.accountId), 1, 'the rebuilt task holds the one slot')
  })
})

describe('0097 member read over the 0092/0096 owner-runner tables', () => {
  it('reads a qualification recorded through the 0092 qualifier on the 0096 schema, to its owner only, in UTC', async () => {
    const [O, E] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin: O, editors: [E] })
    const conn = randomUUID()
    await ownerPool.query(
      `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
       VALUES ($1, $2, 'synthetic', 'synthetic-subject', 'linked')`,
      [conn, O],
    )
    const res = randomUUID()
    await ownerPool.query(
      `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
       VALUES ($1, $2, $3, $4, 'claude-native', 'synthetic label', '/synthetic/root', 'active')`,
      [projectId, res, O, conn],
    )
    await ownerPool.query(
      `SELECT sophia.qualify_owner_runner($1, $2, 'ade473018d32003658b7d38693e083ee2e314bd8', 'env-owner-1',
         'project-sophia', 'read-only-v1', 1, 'gateway_enforced', 'acct-synthetic', ARRAY['create','stop'], 5,
         now() + interval '1 day', 'synthetic evidence')`,
      [projectId, res],
    )
    // The 0096 source-authority columns exist on the very table 0097 reads.
    const added = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='sophia' AND table_name='owner_runner_operations'
         AND column_name IN ('envelope_version','base_commit')`,
    )
    assert.ok(added.length >= 1, 'the 0096 columns are present')
    // A session in another zone: 0097's own UTC setting must decide every rendered time.
    const page = await withActor(api, O, 'read', async (c) => {
      await c.query(`SET LOCAL TimeZone='Pacific/Chatham'`)
      return readProjectNativeResources(c, projectId, null)
    })
    assert.ok(page, 'a member reads the page')
    const mine = page.resources.find((r) => r.id === res)
    assert.ok(mine?.mine?.recordedQualification, 'the owner reads the qualification record')
    const q = mine.mine.recordedQualification
    assert.equal(q.state, 'current')
    assert.deepEqual([...q.operations].toSorted(), ['create', 'stop'])
    for (const at of [q.qualifiedAt, q.expiresAt]) assert.match(String(at), /^\d{4}-\d{2}-\d{2}T[^+]*(Z|\+00:00)$/)
    const teammate = await withActor(api, E, 'read', (c) => readProjectNativeResources(c, projectId, null))
    assert.ok(teammate, 'a member reads the page')
    assert.equal(teammate.resources.find((r) => r.id === res)?.mine ?? null, null, 'never another member’s')
  })
})

// ---- 0098/0099 Personal inputs and erasure against 0095 conversation inputs and erasure ----

describe('0098/0099 Personal and 0095 conversation inputs are erased independently', () => {
  it('erasing a conversation keeps the Personal input; erasing the Personal space keeps the conversation input', async () => {
    const [ADMIN, EDITOR] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [EDITOR] })
    await ownerPool.query("SELECT sophia.set_conversation_settings($1,'enabled','inc01-coherent-test')", [projectId])
    const personalText = `Personal words ${randomUUID()}`
    const held = await withActor(api, EDITOR, 'write', (c) =>
      sendPersonalInput(c, 'p-1', { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: personalText }),
    )
    assert.ok(held)
    const first = await withActor(api, EDITOR, 'write', (c) =>
      startConversationInput(
        c,
        projectId,
        randomUUID(),
        { contract: AUTOMATIC_V1, title: 'One', text: 'Room words.' },
        'Member',
      ),
    )
    const second = await withActor(api, EDITOR, 'write', (c) =>
      startConversationInput(
        c,
        projectId,
        randomUUID(),
        { contract: AUTOMATIC_V1, title: 'Two', text: 'Kept words.' },
        'Member',
      ),
    )
    // The admin erases the first conversation: its inputs leave members' reads; the Personal input is untouched.
    await withActor(api, ADMIN, 'write', (c) => eraseConversation(c, first.conversationId, randomUUID()))
    const personal = await withActor(api, EDITOR, 'read', (c) => readPersonalInputs(c))
    assert.equal(personal.inputs.length, 1, 'the Personal input survives a conversation erasure')
    const conversationInputs = await rows<{ conversation_id: string }>(
      `SELECT conversation_id FROM sophia.saved_conversation_inputs WHERE project_id=$1`,
      [projectId],
    )
    assert.ok(conversationInputs.some((r) => r.conversation_id === second.conversationId))
    // The person erases their Personal space: the conversation input in the project is untouched.
    await withActor(api, EDITOR, 'write', (c) => erasePersonalSpace(c, 'erase', 'delete'))
    assert.equal(
      (await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.personal_inputs WHERE owner_id=$1`, [EDITOR])).n,
      0,
      'the Personal erasure keeps nothing of the input',
    )
    assert.deepEqual(
      await rows(`SELECT conversation_id FROM sophia.saved_conversation_inputs WHERE project_id=$1`, [projectId]),
      conversationInputs,
      'the Personal erasure leaves the project conversation inputs as they were',
    )
    const conversationText = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.conversation_messages m JOIN sophia.saved_conversation_inputs i
         ON i.project_id=m.project_id AND i.message_id=m.id WHERE i.conversation_id=$1 AND m.body LIKE 'Kept words.%'`,
      [second.conversationId],
    )
    assert.equal(conversationText.n, 1)
  })
})

// ---- role privileges left by 0092–0100 ----

describe('role privileges left by migrations 0092–0100', () => {
  it('no new function is executable by PUBLIC, entry points by the API only, and internal helpers by no login', async () => {
    const defined = await rows<{ oid: number; sig: string; name: string }>(
      `SELECT p.oid, p.oid::regprocedure::text AS sig, p.proname AS name FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia'`,
    )
    const sources = (await import('node:fs')).readdirSync(new URL('../../../db/migrations/', import.meta.url))
    const fs = await import('node:fs')
    const names = new Set<string>()
    for (const f of sources.filter((x) => /^(009[2-9]|0100)_/.test(x)))
      for (const m of fs
        .readFileSync(new URL(`../../../db/migrations/${f}`, import.meta.url), 'utf8')
        .matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+sophia\.([a-z_0-9]+)\s*\(/gi))
        names.add(m[1]!)
    const ours = defined.filter((d) => names.has(d.name))
    assert.ok(ours.length >= 100, `found ${ours.length} functions of 0092–0100`)
    const can = async (role: string, oid: number) =>
      (await one<{ ok: boolean }>(`SELECT has_function_privilege($1, $2::oid, 'EXECUTE') AS ok`, [role, oid])).ok
    const publicOpen = []
    for (const d of ours)
      if (
        (
          await one<{ open: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               WHERE p.oid=$1 AND a.grantee=0 AND a.privilege_type='EXECUTE') AS open`,
            [d.oid],
          )
        ).open
      )
        publicOpen.push(d.sig)
    assert.deepEqual(publicOpen, [], 'no 0092–0100 function is executable by PUBLIC')

    const sig = (name: string) => {
      const d = ours.filter((x) => x.name === name)
      assert.equal(d.length, 1, name)
      return d[0]!.oid
    }
    // Entry points the API login calls: the API role only.
    for (const name of [
      'admit_owner_runner_operation',
      'owner_runner_content',
      'start_conversation_input',
      'send_conversation_input',
      'project_native_resources',
      'send_personal_input',
      'api_contribution_write',
    ]) {
      assert.equal(await can('sophia_api', sig(name)), true, `${name}: API`)
      assert.equal(await can('sophia_worker', sig(name)), false, `${name}: not the worker`)
      assert.equal(await can('sophia_conversation_assembler', sig(name)), false, `${name}: not the assembler`)
    }
    // Internal helpers: no login.
    for (const name of [
      'conversation_input_record',
      'personal_append_recorded',
      'owner_runner_payload_body',
      'contribution_admission',
      'personal_welcome_due',
      'contribution_lineage_unbound',
      'contribution_rebuild_bind',
      'contribution_rebuilt',
      'contribution_slots_held_by_others',
      'contribution_rebuild_capacity',
    ])
      for (const role of ['sophia_api', 'sophia_worker', 'sophia_conversation_assembler'])
        assert.equal(await can(role, sig(name)), false, `${name}: not ${role}`)
    // New tables: written only through their functions; the API login reads what its members may read.
    for (const table of ['sophia.saved_conversation_inputs', 'sophia.personal_inputs'])
      assert.deepEqual(
        await one(
          `SELECT has_table_privilege('sophia_api',$1,'SELECT') AS api_read, has_table_privilege('sophia_api',$1,'INSERT') AS api_insert,
             has_table_privilege('sophia_worker',$1,'SELECT') AS worker_read`,
          [table],
        ),
        { api_read: true, api_insert: false, worker_read: false },
        table,
      )
  })
})
