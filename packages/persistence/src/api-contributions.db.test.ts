// INC01-CC-004 S5-a: member API contributions for Explore (migration 0094), level: sql-run on real PostgreSQL with the
// production split. Members call the non-owner sophia_api login with a transaction-local actor (withActor). Runtimes
// call it with no actor and their token. Dispatch uses the sophia_worker login. The operator is the migration owner.
// It runs the real admission, dispatch, reservation, settlement and submission functions. No provider is called: the
// runtime is the test, and every grant, account, route qualification and token is SYNTHETIC. Nothing here qualifies a
// real owner, key, account, route or provider.
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand, RuntimeReceipt, RuntimeRole } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  admitGoalCommand,
  admitResearchTask,
  previewContributionAct,
  withdrawContribution,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
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
  submitContribution,
  withActor,
  withService,
  type ResearchAdmissionRequest,
  type RuntimeCaller,
} from './index.ts'
import {
  qualifyApiAccount,
  revokeApiAccountQualification,
  updateApiAccount,
  adminDisableContribution,
  adminNarrowContribution,
  clearResearchFundingPin,
  CONTRIBUTION_ROUTE,
  ContributionRefusal,
  contributionRefusalOf,
  ContributionUnsupported,
  createApiAccount,
  createApiConnection,
  createContributionGrant,
  readMyContributions,
  readProjectContributions,
  readResearchTaskFunding,
  registerContributionRuntime,
  setApiConnectionState,
  setContributionGrantState,
  BLOCK_NEW_CALLS_POLICY,
  setResearchFundingPin,
  updateContributionGrant,
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
  // A SYNTHETIC route qualification: the precondition of any use. None exists in production.
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

const one = async <T>(sql: string, params: unknown[] = []): Promise<T> =>
  (await ownerPool.query(sql, params)).rows[0] as T
const service = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withService(api, fn)

/** The stable code of an error: a contribution refusal, a domain error, or the raw text. */
function codeOfError(err: unknown): string {
  if (err instanceof ContributionRefusal) return err.refusal
  if (err instanceof ContributionUnsupported) return 'unsupported'
  if (err instanceof DomainError) return contributionRefusalOf(err.cause)?.refusal ?? err.code
  return `raw:${String(err)}`
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return codeOfError(err)
  }
}

/** A race that must finish: an independent bound, so a hang fails the test instead of the process. */
const bounded = <T>(p: Promise<T>, ms = 15_000) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`did not finish in ${ms} ms`)), ms)),
  ])

const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const PDF: RuntimeRole = { id: 'sophia-research-pdf-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:pdf' }
const DES: RuntimeRole = { id: 'sophia-html-designer-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:des' }
const VR: RuntimeRole = { id: 'sophia-visual-review-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:vr' }
const SR: RuntimeRole = {
  id: 'sophia-source-review-v1',
  route: 'source-review-luna-high-v1',
  presetDigest: 'sha256:sr',
}
const specialist = { role: MD.id, route: MD.route }

const callerOf = (token: string, unit: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: unit,
  bridgeInstanceId: randomUUID(),
})

async function bringUp(who: RuntimeCaller, roles: RuntimeRole[]) {
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
}

/** The operator registers a contribution runtime (migration owner) and the runtime connects with every role. */
async function contributionRuntime(projectId: string, connectionId: string, rotate = false) {
  const token = randomUUID() + randomUUID()
  const reg = await registerContributionRuntime(ownerPool, {
    projectId,
    connectionId,
    runtimeUnitId: 'sophia-runtime-test',
    tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
    rotate,
  })
  const who = callerOf(token, 'sophia-runtime-test')
  await bringUp(who, [MD, PDF, DES, VR, SR])
  return { ...reg, who }
}

const grantSettings = (over: Record<string, unknown> = {}) => ({
  expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
  taskCapUsd: 1,
  totalCapUsd: 5,
  fundingPolicy: 'bounded_total_spend' as const,
  fundingAcknowledgementRef: 'synthetic acknowledgement: provider may draw on mixed funds',
  ...over,
})

/**
 * A project with an enabled research gate and a ready legacy runtime; an owner (a member) with an account, a
 * connection and a grant to it; a registered, connected contribution runtime; a requester, an admin, a viewer.
 */
async function world(
  opts: { grant?: boolean; settings?: Record<string, unknown>; owner?: string; accountCap?: number } = {},
) {
  const OWNER = opts.owner ?? randomUUID()
  const REQ = randomUUID()
  const ADMIN = randomUUID()
  const VIEW = randomUUID()
  const project = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [VIEW] })
  const projectId = project.projectId
  await ownerPool.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const legacy = await registerRuntime(db.ownerUrl, { projectId, admin: ADMIN })
  const legacyWho = callerOf(legacy.token, legacy.runtimeUnitId)
  await bringUp(legacyWho, [MD, PDF, DES, VR, SR])
  const account = opts.owner
    ? (await withActor(api, OWNER, 'read', readMyContributions)).accounts[0]!.accountId
    : (
        await withActor(api, OWNER, 'write', (c) =>
          createApiAccount(c, { label: 'My API', totalCapUsd: opts.accountCap ?? 10 }),
        )
      ).accountId
  const conn = await withActor(api, OWNER, 'write', (c) =>
    createApiConnection(c, account, 'Research key', 'Operator host'),
  )
  let grantId: string | null = null
  if (opts.grant ?? true) {
    grantId = (
      await withActor(api, OWNER, 'write', (c) =>
        createContributionGrant(c, conn.connectionId, projectId, grantSettings(opts.settings)),
      )
    ).grantId
  }
  const contribution = await contributionRuntime(projectId, conn.connectionId)
  const input = await withActor(api, REQ, 'write', (c) =>
    submitContribution(c, projectId, randomUUID(), {
      source: null,
      text: 'Our pilot hosts render PDFs in a sandbox.',
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )
  return {
    projectId,
    OWNER,
    REQ,
    ADMIN,
    VIEW,
    account,
    connectionId: conn.connectionId,
    grantId,
    legacyWho,
    contribution,
    input,
  }
}
type World = Awaited<ReturnType<typeof world>>

const revisionOf = async (w: World) =>
  Number(
    (await one<{ revision: string }>(`SELECT revision FROM sophia.api_contribution_grants WHERE id=$1`, [w.grantId]))
      .revision,
  )

const pin = async (w: World, actor = w.REQ) =>
  withActor(api, actor, 'write', async (c) => setResearchFundingPin(c, w.projectId, w.grantId!, await revisionOf(w)))

const ask = (
  w: World,
  opts: {
    actor?: string
    key?: string
    exchange?: string
    outputs?: ResearchAdmissionRequest['outputs']
    inputs?: string[]
  } = {},
) =>
  withActor(api, opts.actor ?? w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: opts.key ?? randomUUID(),
      exchangeId: opts.exchange ?? randomUUID(),
      request: {
        question: 'Which sandboxes do PDF rendering services use?',
        outputs: opts.outputs ?? ['markdown'],
        ...(opts.inputs ? { inputSourceIds: opts.inputs } : {}),
      },
      specialist,
    }),
  )

async function dispatchAll(projectId: string) {
  const rows = await claimRuntimeOutbox(worker, 'test-worker', 50, 30)
  const out = []
  for (const row of rows) {
    const o = await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
    if (row.project_id === projectId) out.push(o)
  }
  return out
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

/** Admit (pinned), dispatch and deliver to the contribution runtime; the session its tools run in. */
async function started(w: World, who = w.contribution.who) {
  const admission = await ask(w)
  assert.ok('admitted' in admission, JSON.stringify(admission))
  await dispatchAll(w.projectId)
  const batch = await service((c) => runtimePoll(c, who, 0))
  const create = batch.commands
    .map((q) => q.command as RuntimeCommand)
    .find((cmd) => cmd.binding.attemptId === admission.admitted.attemptId)
  assert.ok(create, 'the create reached the contribution runtime')
  await service((c) => recordRuntimeReceipts(c, who, [delivered(create)]))
  const at = { attemptId: admission.admitted.attemptId, nativeSessionId: `sophia-${admission.admitted.attemptId}` }
  return { receipt: admission.admitted, at, who }
}

const model = (
  who: RuntimeCaller,
  at: { attemptId: string; nativeSessionId: string },
  callId: string,
  amountUsd = 0.1,
) =>
  service((c) =>
    runtimeResearchReserve(c, who, { ...at, callId, kind: 'model', provider: 'openai-research', amountUsd }),
  )
const search = (who: RuntimeCaller, at: { attemptId: string; nativeSessionId: string }, callId: string) =>
  service((c) =>
    runtimeResearchReserve(c, who, { ...at, callId, kind: 'search', provider: 'tavily', amountUsd: 0.01, query: 'q' }),
  )
const settle = (
  who: RuntimeCaller,
  at: { attemptId: string; nativeSessionId: string },
  reservationId: string,
  outcome: 'settled' | 'uncertain' | 'released',
  extra: { costUsd?: number; usage?: Record<string, unknown> } = {},
) => service((c) => runtimeResearchSettle(c, who, { ...at, reservationId, outcome, ...extra }))

const resultOf = (draftSha256: string, citations: string[]) => ({
  draftSha256,
  title: 'Sandboxes for PDF rendering',
  summary: 'Which hosts render PDFs in a sandbox, with sources.',
  resultSummary: 'Two hosts render in a sandbox; one does not say.',
  limitations: [],
  citations,
})

/** A draft citing one captured search: what a result needs before it can be submitted. */
async function draftWithSource(
  w: World,
  s: { at: { attemptId: string; nativeSessionId: string }; who: RuntimeCaller },
) {
  const r = await search(s.who, s.at, 'search_cite')
  const cap = await service((c) =>
    runtimeResearchCapture(c, s.who, {
      ...s.at,
      reservationId: r.reservationId,
      kind: 'search_results',
      provider: 'tavily',
      providerHttpStatus: 200,
      coverage: 'complete',
      limitations: [],
      results: [{ url: 'https://hosts.example.org/a' }],
    }),
  )
  const d = await service((c) =>
    runtimeResearchDraft(c, s.who, { ...s.at, callId: 'd1', expectedSha256: null, text: '# Report' }),
  )
  return { d, cited: cap.sourceId }
}

const jobOf = (jobId: string) =>
  one<{ state: string; reason: string | null }>(`SELECT state, reason FROM sophia.jobs WHERE id=$1`, [jobId])
const bindingResource = (attemptId: string) =>
  one<{ resource_id: string }>(`SELECT resource_id FROM sophia.execution_bindings WHERE attempt_id=$1`, [attemptId])

describe('the recorded route', () => {
  it('is exactly the contributed route, as config/runtime-unit.json records it, and still not live-verified', () => {
    const unit = JSON.parse(readFileSync(new URL('../../../config/runtime-unit.json', import.meta.url), 'utf8')) as {
      model_routes: Record<string, Record<string, unknown>>
    }
    const route = unit.model_routes[CONTRIBUTION_ROUTE.routeId]!
    assert.deepEqual(
      [route.provider, route.model, route.reasoningEffort, route.credential_ref, route.baseURL],
      [
        CONTRIBUTION_ROUTE.provider,
        CONTRIBUTION_ROUTE.model,
        CONTRIBUTION_ROUTE.effort,
        CONTRIBUTION_ROUTE.credentialRef,
        CONTRIBUTION_ROUTE.baseURL,
      ],
    )
    assert.equal(route.live_verified, false, 'qualification evidence must exist before any real use')
  })
})

describe('3.1 private by default', () => {
  it('has no use without a grant: no pin, legacy research stays on the project runtime, teammates see nothing', async () => {
    const w = await world({ grant: false })
    assert.deepEqual(
      (await withActor(api, w.REQ, 'read', (c) => readProjectContributions(c, w.projectId))).contributions,
      [],
    )
    assert.equal(
      await codeOf(withActor(api, w.REQ, 'write', (c) => setResearchFundingPin(c, w.projectId, randomUUID(), 1))),
      'grant_missing',
    )
    const admission = await ask(w)
    assert.ok('admitted' in admission)
    assert.equal(
      await codeOf(withActor(api, randomUUID(), 'read', (c) => readProjectContributions(c, w.projectId))),
      'forbidden',
    )
    const legacyResource = await one<{ id: string }>(
      `SELECT resource_id AS id FROM sophia.runtime_instances WHERE project_id=$1 AND state='active' AND NOT sophia.contribution_resource(project_id,resource_id)`,
      [w.projectId],
    )
    assert.equal((await bindingResource(admission.admitted.attemptId)).resource_id, legacyResource.id)
  })
})

describe('3.2 permitted use by another member', () => {
  it('runs on the contribution runtime, debits model calls to the contributor and search to the project, and publishes', async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    assert.equal((await bindingResource(s.at.attemptId)).resource_id, w.contribution.resourceId)
    // The legacy runtime never sees it.
    assert.equal((await service((c) => runtimePoll(c, w.legacyWho, 0))).commands.length, 0)
    const funding0 = await withActor(api, w.REQ, 'read', (c) =>
      readResearchTaskFunding(c, w.projectId, s.receipt.taskId),
    )
    assert.ok(funding0.funding === 'contribution')
    assert.deepEqual(funding0.payers, { model: 'contributor_api_account', search: 'project', read: 'project' })
    assert.deepEqual(
      [
        funding0.ownerId,
        funding0.grantId,
        funding0.grantRevision,
        funding0.settings.accepted,
        funding0.settings.observedModels,
      ],
      [w.OWNER, w.grantId, 1, 'unknown', 'unknown'],
    )
    assert.deepEqual(funding0.settings.requested, {
      route: 'research-sol-medium-v1',
      model: 'gpt-6.1-sol',
      effort: 'medium',
    })
    const m = await model(s.who, s.at, 'm1', 0.2)
    const q = await search(s.who, s.at, 's1')
    const links = await one<{ models: number; searches: number }>(
      `SELECT count(*) FILTER (WHERE r.kind='model')::int AS models, count(*) FILTER (WHERE r.kind='search')::int AS searches
       FROM sophia.api_contribution_reservations x JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
       WHERE x.job_id=$1`,
      [s.receipt.taskId],
    )
    assert.deepEqual([links.models, links.searches], [1, 0], "only model calls are the contributor's")
    // The project's total cap no longer counts the contributor's model commitment; it still counts search.
    const projectCommitted = await one<{ c: string }>(
      `SELECT (SELECT coalesce(sum(reserved_usd+spent_usd+uncertain_usd),0) FROM sophia.research_allowances WHERE project_id=$1)
        - sophia.contribution_project_committed($1) AS c`,
      [w.projectId],
    )
    assert.equal(Number(projectCommitted.c), 0.01)
    await settle(s.who, s.at, m.reservationId, 'settled', { costUsd: 0.15, usage: { model: 'gpt-6.1-sol' } })
    await settle(s.who, s.at, q.reservationId, 'settled', { costUsd: 0.005 })
    const funding1 = await withActor(api, w.VIEW, 'read', (c) =>
      readResearchTaskFunding(c, w.projectId, s.receipt.taskId),
    )
    assert.ok(funding1.funding === 'contribution')
    assert.deepEqual(funding1.settings.observedModels, ['gpt-6.1-sol'], 'observed only because the runtime reported it')
    assert.equal(funding1.settings.observedEffort, 'unknown')
    const { d, cited } = await draftWithSource(w, s)
    const done = await service((c) =>
      runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'sub', result: resultOf(d.sha256, [cited]) }),
    )
    assert.equal(done.outcome, 'published')
    const mine = await withActor(api, w.OWNER, 'read', readMyContributions)
    assert.equal(Number(mine.accounts[0]!.committedUsd), 0.15)
    assert.equal(mine.accounts[0]!.providerBalance, 'unknown')
  })

  it("attributes per meter at the cap: the project's total does not bound the contributor's model calls, only its own", async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    // The project's research gate is narrowed below one model call after the allowance was opened.
    await ownerPool.query(
      `UPDATE sophia.research_grants SET task_cap_usd=0.15, total_cap_usd=0.15 WHERE project_id=$1`,
      [w.projectId],
    )
    assert.equal(
      (await model(s.who, s.at, 'm1', 0.2)).state,
      'reserved',
      'the contributor pays this call, under the grant',
    )
    await ownerPool.query(
      `UPDATE sophia.research_grants SET task_cap_usd=0.005, total_cap_usd=0.005 WHERE project_id=$1`,
      [w.projectId],
    )
    assert.equal(
      await codeOf(search(s.who, s.at, 's1')),
      'research_limit_reached',
      'the project still bounds what it pays',
    )
  })

  it('keeps the teammate view to limits and readiness', async () => {
    const w = await world({ settings: { eligible: 'listed', eligibleActors: [] } }).catch(() => null)
    assert.equal(w, null, 'an empty eligible list is refused')
    const x = await world()
    const view = await withActor(api, x.VIEW, 'read', (c) => readProjectContributions(c, x.projectId))
    const text = JSON.stringify(view)
    assert.ok(!/accountId|committedUsd|slotsHeld|custodian|credential|eligibleActors/.test(text), text)
    assert.deepEqual(view.contributions[0]!.readiness, ['requester_ineligible'], 'a viewer cannot start research')
    assert.deepEqual(
      (await withActor(api, x.REQ, 'read', (c) => readProjectContributions(c, x.projectId))).contributions[0]!
        .readiness,
      [],
    )
    // Another owner's private view is empty for this member; the owner sees their own.
    assert.equal((await withActor(api, x.REQ, 'read', readMyContributions)).grants.length, 0)
    assert.equal((await withActor(api, x.OWNER, 'read', readMyContributions)).grants.length, 1)
  })
})

describe('3.3 stale or revoked grant or membership', () => {
  it('rejects a stale edit, and an admin cannot enlarge', async () => {
    const w = await world()
    assert.equal(
      await codeOf(
        withActor(api, w.OWNER, 'write', (c) => updateContributionGrant(c, w.grantId!, 9, { taskCapUsd: 2 })),
      ),
      'stale_revision',
    )
    assert.equal(
      await codeOf(
        withActor(api, w.ADMIN, 'write', (c) => adminNarrowContribution(c, w.grantId!, 1, { taskCapUsd: 2 })),
      ),
      'forbidden',
    )
    assert.equal(
      await codeOf(
        withActor(api, w.REQ, 'write', (c) => updateContributionGrant(c, w.grantId!, 1, { taskCapUsd: 0.5 })),
      ),
      'forbidden',
    )
    assert.equal(
      await codeOf(
        withActor(api, w.OWNER, 'write', (c) =>
          updateContributionGrant(c, w.grantId!, 1, { activeSettlement: 'stop' } as never),
        ),
      ),
      'unsupported',
    )
  })

  for (const change of ['revoke', 'pause', 'expire', 'admin_disable', 'revision'] as const) {
    it(`refuses every new paid model call after ${change}; search keeps the project payer; nothing is undone`, async () => {
      const w = await world()
      await pin(w)
      const s = await started(w)
      const first = await model(s.who, s.at, 'before')
      if (change === 'revoke')
        await withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'revoked'))
      if (change === 'pause')
        await withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'paused'))
      if (change === 'expire')
        await ownerPool.query(
          `UPDATE sophia.api_contribution_grants SET expires_at=now()-interval '1 second' WHERE id=$1`,
          [w.grantId],
        )
      if (change === 'admin_disable')
        await withActor(api, w.ADMIN, 'write', (c) => adminDisableContribution(c, w.grantId!, 1, 'review'))
      if (change === 'revision')
        await withActor(api, w.OWNER, 'write', (c) => updateContributionGrant(c, w.grantId!, 1, { taskCapUsd: 0.9 }))
      const expected = {
        revoke: 'grant_revoked',
        pause: 'grant_paused',
        expire: 'grant_expired',
        admin_disable: 'admin_disabled',
        revision: 'grant_revision_changed',
      }[change]
      assert.equal(await codeOf(model(s.who, s.at, 'after')), expected)
      assert.equal((await search(s.who, s.at, 'still')).state, 'reserved')
      // The call reserved before the change is still possible: it settles truthfully, it is not voided.
      await settle(s.who, s.at, first.reservationId, 'settled', { costUsd: 0.05 })
      assert.equal(
        (await model(s.who, s.at, 'before')).reservationId,
        first.reservationId,
        'a replay is not a new call',
      )
      if (change !== 'revision')
        assert.equal(await codeOf(ask(w)), expected === 'grant_revision_changed' ? 'pin_stale' : expected)
    })
  }

  it('refuses at the next reserve when the requester or the owner leaves', async () => {
    for (const who of ['requester', 'owner'] as const) {
      const w = await world()
      await pin(w)
      const s = await started(w)
      await ownerPool.query(
        `UPDATE sophia.project_members SET active=false, revision=revision+1 WHERE project_id=$1 AND actor_id=$2`,
        [w.projectId, who === 'requester' ? w.REQ : w.OWNER],
      )
      assert.equal(
        await codeOf(model(s.who, s.at, 'm')),
        who === 'requester' ? 'requester_ineligible' : 'owner_not_member',
      )
    }
  })

  it('denies a queued delivery whose grant, owner or credential changed before dispatch, and never redirects it', async () => {
    for (const change of ['revoke', 'owner_left', 'requester_left', 'rotated', 'admin_disable'] as const) {
      const w = await world()
      await pin(w)
      const admission = await ask(w)
      assert.ok('admitted' in admission)
      if (change === 'revoke')
        await withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'revoked'))
      if (change === 'owner_left')
        await ownerPool.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.OWNER,
        ])
      if (change === 'requester_left')
        await ownerPool.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.REQ,
        ])
      if (change === 'rotated') await contributionRuntime(w.projectId, w.connectionId, true)
      if (change === 'admin_disable')
        await withActor(api, w.ADMIN, 'write', (c) => adminDisableContribution(c, w.grantId!, 1, 'review'))
      // Denied by the change itself, in its own transaction: before any dispatch runs.
      assert.equal((await jobOf(admission.admitted.taskId)).state, 'cancelled', `${change}: fenced at the change`)
      await dispatchAll(w.projectId)
      const job = await jobOf(admission.admitted.taskId)
      assert.equal(job.state, 'cancelled', `${change}: ${JSON.stringify(job)}`)
      assert.match(job.reason ?? '', /contribution/)
      assert.equal(
        (await service((c) => runtimePoll(c, w.legacyWho, 0))).commands.length,
        0,
        'no fallback to the project runtime',
      )
    }
  })
})

describe('3.4 credential rotation', () => {
  it('drains the old revision: no new paid call, its reservation still settles under the old payer, new work uses the new runtime', async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    const open = await model(s.who, s.at, 'm1')
    const rotated = await contributionRuntime(w.projectId, w.connectionId, true)
    assert.equal(rotated.credentialRevision, 2)
    assert.equal(await codeOf(model(s.who, s.at, 'm2')), 'credential_revision_changed')
    await settle(s.who, s.at, open.reservationId, 'settled', { costUsd: 0.07 })
    const link = await one<{ credential_revision: string; state: string }>(
      `SELECT x.credential_revision, r.state FROM sophia.api_contribution_reservations x
       JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id WHERE x.reservation_id=$1`,
      [open.reservationId],
    )
    assert.deepEqual([Number(link.credential_revision), link.state], [1, 'settled'])
    // Finish the old task so the account slot frees, then new work goes to the rotated runtime only.
    await service((c) => runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'b', blocker: { reason: 'rotated' } }))
    const next = await started(w, rotated.who)
    assert.equal((await bindingResource(next.at.attemptId)).resource_id, rotated.resourceId)
  })
})

describe('3.5 same-account aliases and concurrency', () => {
  it("lets only one of two projects take the account's last slot, and keeps aliases one root", async () => {
    const a = await world()
    const b = await world({ owner: a.OWNER })
    assert.equal(a.account, b.account, 'one accounting root for the owner and provider')
    assert.equal(
      await codeOf(withActor(api, a.OWNER, 'write', (c) => createApiAccount(c, { label: 'alias', totalCapUsd: 1 }))),
      'invalid_state',
    )
    await pin(a)
    await pin(b)
    const results = await bounded(Promise.allSettled([ask(a), ask(b)]))
    const admitted = results.filter((r) => r.status === 'fulfilled' && 'admitted' in r.value)
    const refused = results.flatMap((r) => (r.status === 'rejected' ? [codeOfError(r.reason)] : []))
    assert.equal(admitted.length, 1, JSON.stringify(results.map((r) => r.status)))
    assert.deepEqual(refused, ['account_busy'])
  })
})

describe('3.5 the account lock, held', () => {
  it('makes a second project wait on the account row while the first admission is uncommitted, then refuses it', async () => {
    const a = await world()
    const b = await world({ owner: a.OWNER })
    await pin(a)
    await pin(b)
    const admit = (c: pg.PoolClient, w: World) =>
      c.query('SELECT sophia.admit_research_task($1, $2, $3, $4, $5, $6)', [
        w.projectId,
        randomUUID(),
        randomUUID(),
        JSON.stringify({ question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] }),
        MD.id,
        MD.route,
      ])
    const first = await api.connect()
    const second = await api.connect()
    try {
      await first.query('BEGIN')
      await first.query("SELECT set_config('sophia.actor_id', $1, true)", [a.REQ])
      await admit(first, a)
      await second.query('BEGIN')
      await second.query("SELECT set_config('sophia.actor_id', $1, true)", [b.REQ])
      let settled = false
      const pending = admit(second, b).then(
        () => 'admitted',
        (err: unknown) => contributionRefusalOf(err)?.refusal ?? `raw:${String(err)}`,
      )
      void pending.finally(() => {
        settled = true
      })
      await new Promise((resolve) => setTimeout(resolve, 750))
      assert.equal(settled, false, 'the second admission waits on the account lock')
      await first.query('COMMIT')
      assert.equal(await bounded(pending), 'account_busy')
      await second.query('ROLLBACK')
    } finally {
      await first.query('ROLLBACK').catch(() => undefined)
      await second.query('ROLLBACK').catch(() => undefined)
      first.release()
      second.release()
    }
  })
})

describe('3.6 exhausted or unknown allowance', () => {
  it('refuses a model call past the grant task cap, the grant total or the account total', async () => {
    const w = await world({ settings: { taskCapUsd: 0.3, totalCapUsd: 0.5 }, accountCap: 0.6 })
    await pin(w)
    const s = await started(w)
    await model(s.who, s.at, 'm1', 0.25)
    assert.equal(await codeOf(model(s.who, s.at, 'm2', 0.1)), 'task_cap_reached')
    const account = await one<{ total_cap_usd: string }>(`SELECT total_cap_usd FROM sophia.api_accounts WHERE id=$1`, [
      w.account,
    ])
    assert.equal(Number(account.total_cap_usd), 0.6, 'a cap is an authorization; no top-up or raise happens here')
  })
})

describe('3.7 uncertain usage', () => {
  it("keeps an uncertain call's commitment and the account slot after the task ends: no early release", async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    const m = await model(s.who, s.at, 'm1', 0.2)
    await settle(s.who, s.at, m.reservationId, 'uncertain')
    await service((c) =>
      runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'b', blocker: { reason: 'lost response' } }),
    )
    assert.equal((await jobOf(s.receipt.taskId)).state, 'failed')
    assert.equal(await codeOf(ask(w)), 'account_busy')
    const mine = await withActor(api, w.OWNER, 'read', readMyContributions)
    assert.deepEqual([Number(mine.accounts[0]!.committedUsd), mine.accounts[0]!.slotsHeld], [0.2, 1])
    // Settling the same reservation again is idempotent and changes nothing.
    assert.equal(await codeOf(settle(s.who, s.at, m.reservationId, 'uncertain')), 'resolved')
  })
})

describe('3.8 delayed publication', () => {
  for (const change of ['requester_left', 'owner_left', 'revoked'] as const) {
    it(`withholds a contributed result when ${change}, keeps the draft, and replays as withheld`, async () => {
      const w = await world()
      await pin(w)
      const s = await started(w)
      const { d, cited } = await draftWithSource(w, s)
      if (change === 'requester_left')
        await ownerPool.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.REQ,
        ])
      if (change === 'owner_left')
        await ownerPool.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.OWNER,
        ])
      if (change === 'revoked')
        await withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'revoked'))
      const submit = () =>
        service((c) => runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'sub', result: resultOf(d.sha256, [cited]) }))
      const out = await submit()
      assert.equal(out.outcome, 'withheld', JSON.stringify(out))
      assert.equal((await submit()).outcome, 'withheld')
      const job = await jobOf(s.receipt.taskId)
      assert.equal(job.state, 'failed')
      assert.match(job.reason ?? '', /^withheld: /)
      assert.equal(
        (
          await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.artifact_versions WHERE job_id=$1`, [
            s.receipt.taskId,
          ])
        ).n,
        0,
        'nothing published',
      )
      assert.equal(
        (
          await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.research_drafts WHERE attempt_id=$1`, [
            s.at.attemptId,
          ])
        ).n,
        1,
        'the draft is kept as evidence',
      )
    })
  }
})

describe('3.9 duplicate requests', () => {
  it('returns the original for the same key and pin; a changed pin conflicts; concurrent calls make one task', async () => {
    const w = await world({ settings: { concurrency: 1 } })
    await pin(w)
    const key = randomUUID()
    const exchange = randomUUID()
    const [x, y] = await Promise.all([ask(w, { key, exchange }), ask(w, { key, exchange })])
    assert.ok('admitted' in x && 'admitted' in y)
    assert.equal(x.admitted.taskId, y.admitted.taskId)
    assert.equal(
      (
        await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.api_contribution_tasks WHERE grant_id=$1`, [
          w.grantId,
        ])
      ).n,
      1,
    )
    await withActor(api, w.OWNER, 'write', (c) => updateContributionGrant(c, w.grantId!, 1, { taskCapUsd: 0.8 }))
    await pin(w)
    assert.equal(await codeOf(ask(w, { key, exchange })), 'idempotency_conflict')
    await withActor(api, w.REQ, 'write', (c) => clearResearchFundingPin(c, w.projectId))
    assert.equal(await codeOf(ask(w, { key, exchange })), 'idempotency_conflict', 'unpinned is another request too')
  })
})

describe('3.10 no fallback payer', () => {
  it('refuses a pinned request whose contribution is unready, even with the project runtime ready', async () => {
    const w = await world()
    await pin(w)
    await ownerPool.query(`UPDATE sophia.runtime_instances SET seen_at=now()-interval '1 hour' WHERE resource_id=$1`, [
      w.contribution.resourceId,
    ])
    assert.equal(await codeOf(ask(w)), 'runtime_unavailable')
    assert.equal(await codeOf(ask(w, { outputs: ['markdown', 'pdf'] })), 'operation_not_granted')
    await ownerPool.query(`UPDATE sophia.api_route_qualifications SET revoked_at=now()`)
    try {
      assert.equal(await codeOf(ask(w)), 'route_unqualified')
    } finally {
      await ownerPool.query(`UPDATE sophia.api_route_qualifications SET revoked_at=NULL`)
    }
    assert.equal(
      (
        await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.research_tasks WHERE project_id=$1`, [
          w.projectId,
        ])
      ).n,
      0,
      'nothing was admitted, on any payer',
    )
  })

  it('never puts legacy work on a contribution runtime, even when it is the only ready runtime', async () => {
    const w = await world()
    // It advertised every role in its hello; it holds only the contributed one (no conversation, design or review role).
    const held = await one<{ roles: RuntimeRole[] }>(`SELECT roles FROM sophia.runtime_instances WHERE id=$1`, [
      w.contribution.runtimeId,
    ])
    assert.deepEqual(
      held.roles.map((r) => r.id),
      [MD.id],
    )
    await ownerPool.query(
      `UPDATE sophia.runtime_instances SET seen_at=now()-interval '1 hour' WHERE project_id=$1 AND NOT sophia.contribution_resource(project_id,resource_id)`,
      [w.projectId],
    )
    assert.equal(await codeOf(ask(w)), 'native_capability_unavailable')
    // role_runtime filters unavailable runtimes (none left); work_runtime only orders by availability, so it may name the
    // unavailable legacy runtime. Neither may ever name the contribution runtime.
    for (const [fn, role, route] of [
      ['role_runtime', DES.id, DES.route],
      ['role_runtime', VR.id, VR.route],
      ['work_runtime', SR.id, SR.route],
    ] as const) {
      const r = await one<{ id: string | null }>(`SELECT (sophia.${fn}($1,$2,$3)).id`, [w.projectId, role, route])
      assert.notEqual(r.id, w.contribution.runtimeId, `${fn}(${role}) chose a contribution runtime`)
      if (fn === 'role_runtime') assert.equal(r.id, null)
    }
    // The source-review projection a member reads (runtimeReady), through the real actor path: no catch-all.
    const avail = await withActor(api, w.REQ, 'read', (c) =>
      c.query<{ r: { runtimeReady: boolean } }>('SELECT sophia.source_review_availability($1, $2, $3) AS r', [
        w.projectId,
        SR.id,
        SR.route,
      ]),
    )
    assert.equal(avail.rows[0]?.r.runtimeReady, false, 'the contribution runtime does not make source review ready')
  })
})

// ---- r2 (INC01-CC-004-S5a-r1 study F01-F03) ----

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** What the contribution runtime receives for an attempt on its next poll. */
const deliveredTo = async (w: World, attemptId: string) =>
  (await service((c) => runtimePoll(c, w.contribution.who, 0))).commands
    .map((q) => q.command as RuntimeCommand)
    .filter((cmd) => cmd.binding.attemptId === attemptId)
const outboxOf = (attemptId: string) =>
  one<{ state: string; reason: string | null }>(
    `SELECT o.state, o.outcome_reason AS reason FROM sophia.outbox o JOIN sophia.execution_bindings b
       ON b.project_id=o.project_id AND b.id=o.binding_id WHERE b.attempt_id=$1 AND o.destination='native.create'`,
    [attemptId],
  )
/** A fresh qualification after a test withdrew or shortened the shared ones. */
const requalify = () =>
  ownerPool.query(
    `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`,
  )

describe('F01 the queued delivery is judged at dispatch, under current authority', () => {
  /** Dispatch, then what the contribution runtime received for the attempt, its queued create and its job. */
  async function afterDispatch(w: World, attemptId: string, taskId: string) {
    await dispatchAll(w.projectId)
    return { sent: await deliveredTo(w, attemptId), queued: await outboxOf(attemptId), job: await jobOf(taskId) }
  }

  it('denies, unsent, a create whose grant only expired (no row changed), and frees the account slot', async () => {
    const w = await world()
    await ownerPool.query(
      `UPDATE sophia.api_contribution_grants SET expires_at=now()+interval '2 seconds' WHERE id=$1`,
      [w.grantId],
    )
    await pin(w)
    const admission = await ask(w)
    assert.ok('admitted' in admission)
    assert.equal((await jobOf(admission.admitted.taskId)).state, 'pending', 'nothing fenced it: no row changed')
    await sleep(2300)
    const out = await afterDispatch(w, admission.admitted.attemptId, admission.admitted.taskId)
    assert.deepEqual(out.sent, [], 'nothing reached the contribution runtime')
    assert.equal(out.queued.state, 'denied')
    assert.match(out.queued.reason ?? '', /contribution.*grant_expired/)
    assert.equal(out.job.state, 'cancelled')
    const slots = await one<{ n: number }>(
      `SELECT sophia.contribution_slots_held(account_id) AS n FROM sophia.api_contribution_tasks WHERE job_id=$1`,
      [admission.admitted.taskId],
    )
    assert.equal(slots.n, 0, 'the denied task holds no account slot')
  })

  for (const how of ['withdrawn', 'expired'] as const) {
    it(`denies, unsent, a create whose route qualification was ${how} after admission`, async () => {
      const w = await world()
      await pin(w)
      const admission = await ask(w)
      assert.ok('admitted' in admission)
      try {
        if (how === 'withdrawn')
          await ownerPool.query(`SELECT sophia.revoke_api_route_qualification(id) FROM sophia.api_route_qualifications`)
        else {
          await ownerPool.query(
            `UPDATE sophia.api_route_qualifications SET expires_at=greatest(qualified_at+interval '1 millisecond', now()+interval '1 second')`,
          )
          await sleep(1300)
        }
        assert.equal(
          (await jobOf(admission.admitted.taskId)).state,
          'pending',
          'no change fence covers a qualification',
        )
        const out = await afterDispatch(w, admission.admitted.attemptId, admission.admitted.taskId)
        assert.deepEqual(out.sent, [], how)
        assert.equal(out.queued.state, 'denied', how)
        assert.match(out.queued.reason ?? '', /contribution.*route_unqualified/)
        assert.equal(out.job.state, 'cancelled', how)
      } finally {
        await requalify()
      }
    })
  }

  it('denies at dispatch alone, with every change fence disabled, each changed row: grant revision, member, connection, credential, link', async () => {
    const fences = [
      'sophia.api_contribution_grants api_contribution_grants_fence',
      'sophia.api_connections api_connections_fence',
      'sophia.api_contribution_runtimes api_contribution_runtimes_fence',
      'sophia.project_members project_members_contribution_fence',
    ]
    const toggle = (on: boolean) =>
      Promise.all(
        fences.map((f) => {
          const [table, trigger] = f.split(' ')
          return ownerPool.query(`ALTER TABLE ${table} ${on ? 'ENABLE' : 'DISABLE'} TRIGGER ${trigger}`)
        }),
      )
    const changes = {
      grant_revision: (w: World) =>
        withActor(api, w.OWNER, 'write', (c) => updateContributionGrant(c, w.grantId!, 1, { taskCapUsd: 0.4 })),
      requester_listed_out: (w: World) =>
        ownerPool.query(
          `UPDATE sophia.api_contribution_grants SET eligible='listed', eligible_actors=ARRAY[$2::uuid] WHERE id=$1`,
          [w.grantId, w.OWNER],
        ),
      requester_left: (w: World) =>
        ownerPool.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.REQ,
        ]),
      owner_left: (w: World) =>
        ownerPool.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
          w.projectId,
          w.OWNER,
        ]),
      connection_paused: (w: World) =>
        ownerPool.query(`UPDATE sophia.api_connections SET state='paused' WHERE id=$1`, [w.connectionId]),
      credential_rotated: (w: World) => contributionRuntime(w.projectId, w.connectionId, true),
    } as const
    for (const [name, change] of Object.entries(changes)) {
      const w = await world()
      await pin(w)
      const admission = await ask(w)
      assert.ok('admitted' in admission)
      await toggle(false)
      try {
        await change(w)
      } finally {
        await toggle(true)
      }
      assert.equal((await jobOf(admission.admitted.taskId)).state, 'pending', `${name}: no fence ran`)
      const out = await afterDispatch(w, admission.admitted.attemptId, admission.admitted.taskId)
      assert.deepEqual(out.sent, [], `${name}: nothing sent`)
      assert.equal(out.queued.state, 'denied', name)
      assert.ok(out.queued.reason, `${name}: the denial says why`)
      assert.equal(out.job.state, 'cancelled', name)
      assert.equal(
        (await service((c) => runtimePoll(c, w.legacyWho, 0))).commands.length,
        0,
        `${name}: no fallback to the project runtime`,
      )
    }
  })

  it('delivers a usable contribution (control), and still delivers a Stop to it after the grant expired', async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    await ownerPool.query(
      `UPDATE sophia.api_contribution_grants SET expires_at=now()-interval '1 second' WHERE id=$1`,
      [w.grantId],
    )
    await withActor(api, w.ADMIN, 'write', (c) =>
      admitGoalCommand(c, w.projectId, randomUUID(), {
        kind: 'stop',
        goalId: s.receipt.goalId,
        expectedGoalRevision: s.receipt.goalRevision,
        expectedAuthorityEpoch: s.receipt.authorityEpoch,
        bodySourceId: null,
      }),
    )
    await dispatchAll(w.projectId)
    const kinds = (await service((c) => runtimePoll(c, w.contribution.who, 0))).commands
      .map((q) => q.command as RuntimeCommand)
      .filter((cmd) => cmd.binding.attemptId === s.at.attemptId)
      .map((cmd) => cmd.kind)
    assert.ok(kinds.includes('create'), 'the usable create was delivered')
    assert.ok(kinds.includes('stop'), 'a Stop is never blocked by the contribution fence')
  })

  it('leaves a legacy delivery exactly as before: an unready project runtime defers it, waiting, and nothing is denied', async () => {
    const w = await world({ grant: false })
    const admission = await ask(w)
    assert.ok('admitted' in admission)
    await ownerPool.query(
      `UPDATE sophia.runtime_instances SET seen_at=now()-interval '5 minutes' WHERE project_id=$1`,
      [w.projectId],
    )
    await dispatchAll(w.projectId)
    const queued = await outboxOf(admission.admitted.attemptId)
    assert.equal(queued.state, 'pending')
    assert.equal(queued.reason, "waiting for Sophia's runtime to reconnect")
    assert.equal((await jobOf(admission.admitted.taskId)).state, 'pending')
  })

  it("reports the contribution's own reason in runtime_unavailable, with no queued work, and leaves a legacy runtime's alone", async () => {
    const why = (projectId: string, resourceId: string) =>
      one<{ why: string | null }>(
        `SELECT sophia.runtime_unavailable(r) AS why FROM sophia.runtime_instances r
          WHERE r.project_id=$1 AND r.resource_id=$2 AND r.state='active'`,
        [projectId, resourceId],
      ).then((r) => r.why)
    const control = await world()
    assert.equal(await why(control.projectId, control.contribution.resourceId), null, 'a usable contribution runtime')
    const legacy = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.runtime_instances r WHERE r.project_id=$1 AND r.state='active'
         AND NOT sophia.contribution_resource(r.project_id, r.resource_id) AND sophia.runtime_unavailable(r) IS NOT NULL`,
      [control.projectId],
    )
    assert.equal(legacy.n, 0, 'the project runtime is unchanged')
    const cases: [string, (w: World) => Promise<unknown>, string][] = [
      [
        'expired by time',
        (w) =>
          ownerPool.query(
            `UPDATE sophia.api_contribution_grants SET expires_at=now()-interval '1 second' WHERE id=$1`,
            [w.grantId],
          ),
        'grant_expired',
      ],
      [
        'paused',
        (w) => withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'paused')),
        'grant_paused',
      ],
      [
        'connection paused',
        (w) => ownerPool.query(`UPDATE sophia.api_connections SET state='paused' WHERE id=$1`, [w.connectionId]),
        'connection_not_connected',
      ],
      [
        'credential moved',
        (w) =>
          ownerPool.query(`UPDATE sophia.api_connections SET credential_revision=credential_revision+1 WHERE id=$1`, [
            w.connectionId,
          ]),
        'credential_revision_changed',
      ],
      [
        'owner left',
        (w) =>
          ownerPool.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
            w.projectId,
            w.OWNER,
          ]),
        'owner_not_member',
      ],
      [
        'qualification withdrawn',
        () => ownerPool.query(`SELECT sophia.revoke_api_route_qualification(id) FROM sophia.api_route_qualifications`),
        'route_unqualified',
      ],
      ['rotated', (w) => contributionRuntime(w.projectId, w.connectionId, true), 'runtime_rotated'],
    ]
    for (const [name, change, code] of cases) {
      const w = await world()
      try {
        await change(w)
        assert.equal(
          await why(w.projectId, w.contribution.resourceId),
          `waiting for Sophia's runtime: its contribution is not usable now (${code})`,
          name,
        )
      } finally {
        await requalify()
      }
    }
  })
})

/** A held transaction that has taken the project lock, as an admission does, and not yet the grant: a key replay. */
async function holdProject(w: World, key: string, exchange: string) {
  const c = await api.connect()
  await c.query('BEGIN')
  await c.query("SELECT set_config('sophia.actor_id', $1, true)", [w.REQ])
  const request = { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] }
  await c.query('SELECT sophia.admit_research_task($1, $2, $3, $4, $5, $6)', [
    w.projectId,
    key,
    exchange,
    JSON.stringify(request),
    MD.id,
    MD.route,
  ])
  const admitAgain = () =>
    c
      .query('SELECT sophia.admit_research_task($1, $2, $3, $4, $5, $6)', [
        w.projectId,
        randomUUID(),
        randomUUID(),
        JSON.stringify(request),
        MD.id,
        MD.route,
      ])
      .then(
        () => 'admitted',
        (err: unknown) => contributionRefusalOf(err)?.refusal ?? `raw:${pgErrorCode(err)}`,
      )
  return { c, admitAgain }
}
const pgErrorCode = (err: unknown) =>
  typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : String(err)

/** Run `change` while `w`'s project is held by an admission that then needs the contribution's locks. */
async function contend(w: World, change: () => Promise<unknown>) {
  const key = randomUUID()
  const exchange = randomUUID()
  const first = await ask(w, { key, exchange })
  assert.ok('admitted' in first)
  const held = await holdProject(w, key, exchange)
  let settled = false
  const pending = change().then(
    () => 'ok',
    (err: unknown) => `failed:${pgErrorCode((err as { cause?: unknown }).cause ?? err)}`,
  )
  void pending.finally(() => {
    settled = true
  })
  try {
    await sleep(600)
    assert.equal(settled, false, 'the change waits behind the held project')
    const again = await bounded(held.admitAgain())
    await held.c.query('ROLLBACK')
    return { again, change: await bounded(pending), first }
  } finally {
    await held.c.query('ROLLBACK').catch(() => undefined)
    held.c.release()
  }
}

describe('F02 one lock order: project before contribution, for every edit that may fence', () => {
  it('lets an owner pause wait behind an admission holding the project: no deadlock, and the pause fences', async () => {
    const w = await world()
    await pin(w)
    const out = await contend(w, () =>
      withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'paused')),
    )
    assert.equal(out.change, 'ok', 'the pause committed (no 40P01)')
    assert.equal(out.again, 'account_busy', 'the admission saw the slot taken, under its own locks')
    assert.ok('admitted' in out.first)
    assert.equal(
      (await jobOf(out.first.admitted.taskId)).state,
      'cancelled',
      'the pause fenced the queued create atomically',
    )
  })

  it('does the same for an admin disable and an owner connection pause', async () => {
    for (const which of ['admin_disable', 'connection_pause'] as const) {
      const w = await world()
      await pin(w)
      const conn = await one<{ revision: string }>(`SELECT revision FROM sophia.api_connections WHERE id=$1`, [
        w.connectionId,
      ])
      const out = await contend(w, () =>
        which === 'admin_disable'
          ? withActor(api, w.ADMIN, 'write', (c) => adminDisableContribution(c, w.grantId!, 1, 'review'))
          : withActor(api, w.OWNER, 'write', (c) =>
              setApiConnectionState(c, w.connectionId, Number(conn.revision), 'paused'),
            ),
      )
      assert.equal(out.change, 'ok', which)
      assert.ok('admitted' in out.first)
      assert.equal((await jobOf(out.first.admitted.taskId)).state, 'cancelled', which)
    }
  })

  it('locks every project of a rotated connection before the connection: a held second project cannot deadlock it', async () => {
    const a = await world()
    // The same owner and connection, granted and registered in a second project too.
    const b = await world({ owner: a.OWNER })
    await withActor(api, a.OWNER, 'write', (c) =>
      createContributionGrant(c, a.connectionId, b.projectId, grantSettings()),
    )
    const bGrant = await one<{ id: string }>(
      `SELECT id FROM sophia.api_contribution_grants WHERE project_id=$1 AND connection_id=$2`,
      [b.projectId, a.connectionId],
    )
    const bRuntime = await contributionRuntime(b.projectId, a.connectionId)
    const bWorld: World = { ...b, grantId: bGrant.id, connectionId: a.connectionId, contribution: bRuntime }
    await pin(bWorld)
    const out = await contend(bWorld, () =>
      registerContributionRuntime(ownerPool, {
        projectId: a.projectId,
        connectionId: a.connectionId,
        runtimeUnitId: 'sophia-runtime-test',
        tokenSha256: createHash('sha256').update(randomUUID(), 'utf8').digest(),
        rotate: true,
      }),
    )
    assert.equal(out.change, 'ok', 'the rotation committed (no 40P01)')
    assert.ok('admitted' in out.first)
    assert.equal(
      (await jobOf(out.first.admitted.taskId)).state,
      'cancelled',
      'the drained revision fenced project b too',
    )
  })

  it('refuses (40001) rather than lock out of order when a project gains a grant on the connection while it waits', async () => {
    const a = await world()
    const b = await world({ owner: a.OWNER })
    const holder = await ownerPool.connect()
    await holder.query('BEGIN')
    await holder.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [a.projectId])
    try {
      const conn = await one<{ revision: string }>(`SELECT revision FROM sophia.api_connections WHERE id=$1`, [
        a.connectionId,
      ])
      const pause = withActor(api, a.OWNER, 'write', (c) =>
        setApiConnectionState(c, a.connectionId, Number(conn.revision), 'paused'),
      ).then(
        () => 'ok',
        (err: unknown) => `failed:${pgErrorCode((err as { cause?: unknown }).cause ?? err)}`,
      )
      await sleep(400)
      // Project b gains a grant on the connection while the pause waits for project a.
      await withActor(api, a.OWNER, 'write', (c) =>
        createContributionGrant(c, a.connectionId, b.projectId, grantSettings()),
      )
      await holder.query('ROLLBACK')
      assert.equal(await bounded(pause), 'failed:40001', 'refused under the connection lock, not a lock out of order')
      const unchanged = await one<{ state: string }>(`SELECT state FROM sophia.api_connections WHERE id=$1`, [
        a.connectionId,
      ])
      assert.equal(unchanged.state, 'connected', 'nothing changed')
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      holder.release()
    }
  })

  it('takes the project before a publication touches the authority: while the project is held, no member or grant row is locked', async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    const { d, cited } = await draftWithSource(w, s)
    const holder = await ownerPool.connect()
    await holder.query('BEGIN')
    await holder.query('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [w.projectId])
    let settled = false
    const submit = service((c) =>
      runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'sub', result: resultOf(d.sha256, [cited]) }),
    ).then(
      (out) => out.outcome,
      (err: unknown) => `failed:${pgErrorCode((err as { cause?: unknown }).cause ?? err)}`,
    )
    void submit.finally(() => {
      settled = true
    })
    try {
      await sleep(600)
      assert.equal(settled, false, 'the publication waits behind the held project')
      // Autocommit probes: each takes and releases its lock at once, or fails 55P03 if the publication holds it.
      const free = (sql: string, args: unknown[]) =>
        ownerPool.query(sql, args).then(
          () => true,
          (err: unknown) => pgErrorCode(err),
        )
      assert.equal(
        await free('SELECT 1 FROM sophia.api_contribution_grants WHERE id=$1 FOR UPDATE NOWAIT', [w.grantId]),
        true,
        'no grant lock is held while the project waits',
      )
      assert.equal(
        await free(
          'SELECT 1 FROM sophia.project_members WHERE project_id=$1 AND actor_id IN ($2,$3) FOR UPDATE NOWAIT',
          [w.projectId, w.REQ, w.OWNER],
        ),
        true,
        'no member lock is held while the project waits',
      )
      await holder.query('ROLLBACK')
      assert.equal(await bounded(submit), 'published', 'then it publishes, under current authority')
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      holder.release()
    }
  })
})

describe('F03 block_new_calls: what may still publish, and what is withheld', () => {
  for (const change of ['pause', 'expiry', 'revision', 'rotation'] as const) {
    it(`publishes an already-authorized result after ${change}, under its original payer and credential`, async () => {
      const w = await world()
      await pin(w)
      const s = await started(w)
      const m = await model(s.who, s.at, 'm1', 0.1)
      await settle(s.who, s.at, m.reservationId, 'settled', { costUsd: 0.05 })
      const { d, cited } = await draftWithSource(w, s)
      if (change === 'pause')
        await withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'paused'))
      if (change === 'expiry')
        await ownerPool.query(
          `UPDATE sophia.api_contribution_grants SET expires_at=now()-interval '1 second' WHERE id=$1`,
          [w.grantId],
        )
      if (change === 'revision')
        await withActor(api, w.OWNER, 'write', (c) => updateContributionGrant(c, w.grantId!, 1, { taskCapUsd: 0.9 }))
      if (change === 'rotation') await contributionRuntime(w.projectId, w.connectionId, true)
      // New paid calls are refused...
      assert.notEqual(await codeOf(model(s.who, s.at, 'm2')), 'resolved')
      // ...but the result already authorized and paid for may publish.
      const out = await service((c) =>
        runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'sub', result: resultOf(d.sha256, [cited]) }),
      )
      assert.equal(out.outcome, 'published', change)
      const funding = await withActor(api, w.REQ, 'read', (c) =>
        readResearchTaskFunding(c, w.projectId, s.receipt.taskId),
      )
      assert.ok(funding.funding === 'contribution')
      assert.deepEqual([funding.grantRevision, funding.credentialRevision], [1, 1], 'the original payer and credential')
    })
  }

  it('withholds after an admin disable, and never publishes after a source it read was withdrawn', async () => {
    const w = await world()
    await pin(w)
    const s = await started(w)
    const { d, cited } = await draftWithSource(w, s)
    await withActor(api, w.ADMIN, 'write', (c) => adminDisableContribution(c, w.grantId!, 1, 'review'))
    const out = await service((c) =>
      runtimeResearchSubmit(c, s.who, { ...s.at, callId: 'sub', result: resultOf(d.sha256, [cited]) }),
    )
    assert.equal(out.outcome, 'withheld')

    const x = await world()
    await pin(x)
    const admission = await ask(x, { inputs: [x.input.sourceId] })
    assert.ok('admitted' in admission)
    await dispatchAll(x.projectId)
    const preview = await withActor(api, x.REQ, 'read', (c) =>
      previewContributionAct(c, x.projectId, x.input.contributionId, 'withdraw'),
    )
    await withActor(api, x.REQ, 'write', (c) =>
      withdrawContribution(c, x.projectId, x.input.contributionId, randomUUID(), {
        expectedRevision: preview.revision,
        reach: preview.reach.map(({ taskId, kind, restarts }) => ({ taskId, kind, restarts })),
        previewToken: preview.previewToken,
      }),
    )
    assert.equal(
      (
        await one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.artifact_versions WHERE job_id=$1`, [
          admission.admitted.taskId,
        ])
      ).n,
      0,
      'nothing was published from a withdrawn source',
    )
  })
})

// ---- r3 (INC01-CC-004-S5a-r2-SOURCE-PRE-PUSH-001: API004-S5A-R2-F01/F02, B11) ----

/**
 * A migration-owner transaction holding one row lock: a FIXTURE standing in for a concurrent holder of the project or
 * account row (an admission, an edit, another project's admission). The API role cannot lock these rows directly; the
 * functions under test run with their real roles and actors.
 */
async function holdRow(sql: string, args: unknown[]) {
  const c = await ownerPool.connect()
  await c.query('BEGIN')
  await c.query(sql, args)
  return {
    client: c,
    release: async () => {
      await c.query('ROLLBACK').catch(() => undefined)
      c.release()
    },
  }
}
const accountOf = (w: World) =>
  one<{ id: string }>(`SELECT account_id AS id FROM sophia.api_connections WHERE id=$1`, [w.connectionId]).then(
    (r) => r.id,
  )
const expireGrantIn = (w: World, ms: number) =>
  ownerPool.query(
    `UPDATE sophia.api_contribution_grants SET expires_at=clock_timestamp()+make_interval(secs=>$2) WHERE id=$1`,
    [w.grantId, ms / 1000],
  )
const expireQualificationIn = (ms: number) =>
  ownerPool.query(
    `UPDATE sophia.api_route_qualifications SET expires_at=greatest(qualified_at+interval '1 millisecond', clock_timestamp()+make_interval(secs=>$1))
      WHERE revoked_at IS NULL`,
    [ms / 1000],
  )
const settledFlag = <T>(p: Promise<T>) => {
  const state = { settled: false }
  void p.then(
    () => (state.settled = true),
    () => (state.settled = true),
  )
  return state
}
const modelReservations = (allowanceJob: string) =>
  one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.api_contribution_reservations WHERE job_id=$1`, [
    allowanceJob,
  ]).then((r) => r.n)

describe('r3 F01: time-bound authority is decided after the last wait, at the wall clock', () => {
  /** Dispatch a claimed queued create while its project is held past `expire`; the dispatch transaction starts first. */
  async function dispatchAcrossExpiry(w: World, expire: () => Promise<unknown>) {
    const admission = await ask(w)
    assert.ok('admitted' in admission)
    const rows = (await claimRuntimeOutbox(worker, 'test-worker', 50, 30)).filter((r) => r.project_id === w.projectId)
    assert.equal(rows.length, 1)
    const row = rows[0]!
    await expire()
    const held = await holdRow('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [w.projectId])
    let outcome: Promise<unknown>
    try {
      outcome = dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
      const flag = settledFlag(outcome)
      await sleep(300)
      assert.equal(flag.settled, false, 'dispatch waits on the project (its transaction began before the expiry)')
      await sleep(1500)
    } finally {
      await held.release()
    }
    return { outcome: await bounded(outcome), admission }
  }

  for (const what of ['grant', 'qualification'] as const) {
    it(`denies, unsent, a create whose ${what} expired while dispatch waited on the project`, async () => {
      const w = await world()
      await pin(w)
      try {
        const { outcome, admission } = await dispatchAcrossExpiry(w, () =>
          what === 'grant' ? expireGrantIn(w, 1200) : expireQualificationIn(1200),
        )
        assert.equal((outcome as { result: string }).result, 'denied', JSON.stringify(outcome))
        assert.ok('admitted' in admission)
        assert.deepEqual(await deliveredTo(w, admission.admitted.attemptId), [], 'nothing reached the runtime poll')
        const queued = await outboxOf(admission.admitted.attemptId)
        assert.equal(queued.state, 'denied')
        assert.match(queued.reason ?? '', what === 'grant' ? /grant_expired/ : /route_unqualified/)
        const commands = await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM sophia.runtime_commands WHERE attempt_id=$1`,
          [admission.admitted.attemptId],
        )
        assert.equal(commands.n, 0, 'no new runtime command')
      } finally {
        await requalify()
      }
    })
  }

  it('still delivers a create whose authority stays valid across the same wait (control)', async () => {
    const w = await world()
    await pin(w)
    const { outcome, admission } = await dispatchAcrossExpiry(w, () => Promise.resolve())
    assert.equal((outcome as { result: string }).result, 'enqueued')
    assert.ok('admitted' in admission)
    assert.equal((await deliveredTo(w, admission.admitted.attemptId)).length, 1, 'the create reached the runtime poll')
  })

  /** A NEW paid model reservation started while `lock` is held past the grant's or qualification's expiry. */
  async function reserveAcrossExpiry(w: World, lock: 'project' | 'account', what: 'grant' | 'qualification' | 'none') {
    const s = await started(w)
    const prior = await modelReservations(s.receipt.taskId)
    if (what === 'grant') await expireGrantIn(w, 1200)
    if (what === 'qualification') await expireQualificationIn(1200)
    const held =
      lock === 'project'
        ? await holdRow('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [w.projectId])
        : await holdRow('SELECT 1 FROM sophia.api_accounts WHERE id=$1 FOR UPDATE', [await accountOf(w)])
    let call: Promise<string>
    try {
      call = codeOf(model(s.who, s.at, `m-${lock}-${what}`))
      const flag = settledFlag(call)
      await sleep(300)
      assert.equal(flag.settled, false, `the reservation waits on the ${lock}`)
      await sleep(1500)
    } finally {
      await held.release()
    }
    return { code: await bounded(call), before: prior, after: await modelReservations(s.receipt.taskId), s }
  }

  for (const lock of ['project', 'account'] as const) {
    it(`refuses a new paid model call whose grant expired while it waited on the ${lock}, recording nothing`, async () => {
      const w = await world()
      await pin(w)
      const out = await reserveAcrossExpiry(w, lock, 'grant')
      assert.equal(out.code, 'grant_expired')
      assert.equal(out.after, out.before, 'no new contributed reservation')
    })
  }

  it('refuses a new paid model call whose qualification expired while it waited on the account', async () => {
    const w = await world()
    await pin(w)
    try {
      const out = await reserveAcrossExpiry(w, 'account', 'qualification')
      assert.equal(out.code, 'route_unqualified')
      assert.equal(out.after, out.before)
    } finally {
      await requalify()
    }
  })

  it('reserves across the same account wait when authority stays valid (control), and replays an earlier call after expiry', async () => {
    const w = await world()
    await pin(w)
    const out = await reserveAcrossExpiry(w, 'account', 'none')
    assert.equal(out.code, 'resolved', 'a valid new reservation is made')
    assert.equal(out.after, out.before + 1)
    await ownerPool.query(
      `UPDATE sophia.api_contribution_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
      [w.grantId],
    )
    const replay = await model(out.s.who, out.s.at, 'm-account-none')
    assert.equal(replay.state, 'reserved', 'the original reservation is returned, not refused and not duplicated')
    assert.equal(await modelReservations(out.s.receipt.taskId), out.after)
  })

  it('refuses an admission whose grant expired while it waited on the account, creating no task', async () => {
    const w = await world()
    await pin(w)
    await expireGrantIn(w, 1200)
    const jobs = () =>
      one<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.jobs WHERE project_id=$1`, [w.projectId])
    const jobsBefore = (await jobs()).n
    const held = await holdRow('SELECT 1 FROM sophia.api_accounts WHERE id=$1 FOR UPDATE', [await accountOf(w)])
    let call: Promise<string>
    try {
      call = codeOf(ask(w))
      const flag = settledFlag(call)
      await sleep(300)
      assert.equal(flag.settled, false, 'the admission waits on the account')
      await sleep(1500)
    } finally {
      await held.release()
    }
    assert.equal(await bounded(call), 'grant_expired')
    assert.equal((await jobs()).n, jobsBefore, 'no job, attempt or outbox was created')
  })
})

describe('r3 F02: a first grant after registration takes the project before the connection', () => {
  for (const change of ['connection pause', 'rotation'] as const) {
    it(`creates the first grant while a ${change} that holds the project waits on the connection: no 40P01`, async () => {
      const w = await world({ grant: false })
      // The runtime link is registered and no grant exists yet: normal operator setup.
      const conn = await one<{ revision: string }>(`SELECT revision FROM sophia.api_connections WHERE id=$1`, [
        w.connectionId,
      ])
      const held = await holdRow('SELECT 1 FROM sophia.projects WHERE id=$1 FOR UPDATE', [w.projectId])
      try {
        await held.client.query("SELECT set_config('sophia.actor_id', $1, true)", [w.OWNER])
        const create = withActor(api, w.OWNER, 'write', (c) =>
          createContributionGrant(c, w.connectionId, w.projectId, grantSettings()),
        ).then(
          () => 'ok',
          (err: unknown) => `failed:${pgErrorCode((err as { cause?: unknown }).cause ?? err)}`,
        )
        await sleep(400)
        const edit = (
          change === 'connection pause'
            ? held.client.query('SELECT sophia.api_connection_set_state($1, $2, $3)', [
                w.connectionId,
                Number(conn.revision),
                'paused',
              ])
            : held.client.query('SELECT sophia.register_contribution_runtime($1, $2, $3, $4, true)', [
                w.projectId,
                w.connectionId,
                'sophia-runtime-test',
                createHash('sha256').update(randomUUID(), 'utf8').digest(),
              ])
        ).then(
          () => 'ok',
          (err: unknown) => `failed:${pgErrorCode(err)}`,
        )
        const edited = await bounded(edit)
        await held.client.query(edited === 'ok' ? 'COMMIT' : 'ROLLBACK')
        assert.equal(edited, 'ok', `the ${change} committed`)
        assert.equal(await bounded(create), 'ok', 'the first grant was created after it, with no 40P01')
      } finally {
        await held.release()
      }
      const grants = await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.api_contribution_grants WHERE project_id=$1`,
        [w.projectId],
      )
      assert.equal(grants.n, 1)
    })
  }
})

describe('r3 B11: readiness names exactly the reason', () => {
  it('reports a paused or expired grant by its one reason, never a duplicate runtime_unavailable', async () => {
    for (const how of ['paused', 'expired'] as const) {
      const w = await world()
      if (how === 'paused')
        await withActor(api, w.OWNER, 'write', (c) => setContributionGrantState(c, w.grantId!, 1, 'paused'))
      else
        await ownerPool.query(
          `UPDATE sophia.api_contribution_grants SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
          [w.grantId],
        )
      const view = await withActor(api, w.REQ, 'read', (c) => readProjectContributions(c, w.projectId))
      const mine = view.contributions.find((x) => x.grantId === w.grantId)
      assert.ok(mine, how)
      assert.deepEqual(mine.readiness, [how === 'paused' ? 'grant_paused' : 'grant_expired'], how)
    }
  })
})

describe('the operator CLI (synthetic, disposable)', () => {
  it('registers once with a printed capability whose hash alone is stored, and rotates', async () => {
    const w = await world()
    const run = promisify(execFile)
    const script = new URL('../../../scripts/register-contribution-runtime.ts', import.meta.url).pathname
    const env = { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl }
    const { stdout } = await run(process.execPath, [script, w.projectId, w.connectionId, '--rotate'], { env })
    const token = stdout.trim().split('\n').at(-1)!
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(stdout.split(token).length - 1, 1, 'the capability is printed once')
    assert.match(stdout, /credential revision 2/)
    assert.match(stdout, /not live-verified/)
    assert.ok(
      stdout.includes(`older revisions drain under ${BLOCK_NEW_CALLS_POLICY}`),
      'the rotation projects the policy',
    )
    const stored = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.runtime_instances WHERE token_sha256=$1`,
      [createHash('sha256').update(token, 'utf8').digest()],
    )
    assert.equal(stored.n, 1)
    const columns = await one<{ t: string }>(
      `SELECT string_agg(row_to_json(c)::text,'') AS t FROM sophia.api_connections c WHERE id=$1`,
      [w.connectionId],
    )
    assert.ok(!columns.t.includes(token))
  })
})

// INC04-S01b (0104): the owner's protection declaration and the operator's account qualification. SYNTHETIC records:
// recording one qualifies nothing live, and no application role can record it.
describe('0104 owner protection and operator account qualification', () => {
  it('lets the owner alone declare and withdraw protection, and reads it back to the owner alone', async () => {
    const w = await world()
    const initial = (await withActor(api, w.OWNER, 'read', readMyContributions)).accounts[0]!
    assert.equal(initial.protection, null, 'no declaration by default, no backfill')
    const r = await withActor(api, w.OWNER, 'write', (c) =>
      updateApiAccount(c, w.account, initial.revision, {
        protection: {
          applicability: 'protected',
          operations: ['research'],
          roles: ['sophia-research-md-v1'],
          protectedSpendUsd: 2,
        },
      }),
    )
    assert.equal(r.revision, initial.revision + 1)
    assert.equal(
      await codeOf(
        withActor(api, w.REQ, 'write', (c) => updateApiAccount(c, w.account, r.revision, { protection: null })),
      ),
      'forbidden',
    )
    const mine = (await withActor(api, w.OWNER, 'read', readMyContributions)).accounts[0]!
    assert.equal(mine.protection?.applicability, 'protected')
    assert.equal(Number(mine.protection?.protectedSpendUsd), 2)
    assert.deepEqual((await withActor(api, w.REQ, 'read', readMyContributions)).accounts, [])
    await withActor(api, w.OWNER, 'write', (c) => updateApiAccount(c, w.account, r.revision, { protection: null }))
    assert.equal((await withActor(api, w.OWNER, 'read', readMyContributions)).accounts[0]!.protection, null)
  })

  it('records an account qualification for the migration owner only, bound to the current credential revision', async () => {
    const w = await world()
    const input = {
      connectionId: w.connectionId,
      operations: ['research'] as ['research'],
      verification: 'operator_verified_call' as const,
      evidenceRef: 'synthetic: not live evidence',
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    }
    for (const role of [api, worker]) {
      assert.match(await codeOf(qualifyApiAccount(role, input)), /permission denied|forbidden|insufficient/i)
    }
    const q = await qualifyApiAccount(ownerPool, input)
    assert.equal(q.credentialRevision, 1)
    const state = async () =>
      (await withActor(api, w.OWNER, 'read', readMyContributions)).connections[0]!.accountQualification.state
    assert.equal(await state(), 'current')
    await contributionRuntime(w.projectId, w.connectionId, true)
    assert.equal(await state(), 'stale', 'a credential rotation stales the account record')
    await revokeApiAccountQualification(ownerPool, q.qualificationId, 'synthetic revocation')
    assert.match(
      await codeOf(revokeApiAccountQualification(api, q.qualificationId, 'x')),
      /permission denied|forbidden|insufficient/i,
    )
  })
})
