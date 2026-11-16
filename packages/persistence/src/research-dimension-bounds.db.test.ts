// INC04-R07-C2-DIMENSION-BOUNDS-CORE-001 (0113), level: sql-run on real PostgreSQL through the private typed wrappers.
// The INACTIVE bound core: the opt-in reserve (AS-FP01: after the key/replay and finalizing handling, before the gate),
// stored replay, one dispatch per reservation (apply receipt, single at-most-once claim, owner-only outcome), the K4 hook
// in the current 0112 settle (AS-FP02: profile row before the account guard), the derived read model, incremental money
// equality and the 0112 cause lineage, with genuine two-connection waits for every ordering claim. Projects, accounts,
// runtimes, tokens, authorities, profiles, policies, emitters and digests are SYNTHETIC: nothing here is an owner
// approval, a route or profile qualification (G-ROUTE, G-PROFILE), a loaded-emitter proof or a provider call.
// R1 (CORE-R1-001) adds: K4 on governed late facts (the current 0112 late-fact writer, profile row before the first
// account guard), the C02 shared-lineage funding binding in the research, design and source-review reserves, the stored
// first scope of every registration conflict, any sticky applicable policy conflict refusing before revoke, and the
// current authority under genuine two-connection waits in both orders.
// R2 (CORE-R2-001, C2R1B-F01) adds: the design and source-review dispatch (apply receipt, single claim, outcome) through
// their own maintained authenticated scope (0041 design_scope_of, 0042 review_scope_of) and its post-last-wait fence.
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
  runtimeDesignSettle,
  runtimeHello,
  runtimePoll,
  runtimeResearchSettle,
  runtimeTokenHash,
  withActor,
  withService,
  type RuntimeCaller,
} from './index.ts'
import {
  contributionRefusalOf,
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
  recordResearchFinancialAuthority,
  recordResearchLateFacts,
  revokeResearchFinancialAuthority,
  type LateFactsInput,
} from './research-runtime-reconciliation.ts'
import {
  boundPolicyState,
  boundProfileState,
  boundStatus,
  recordBoundAuthority,
  recordBoundPolicyEvent,
  recordBoundProfileEvent,
  registerBoundPolicy,
  registerBoundProfile,
  revokeBoundAuthority,
  runtimeBoundApply,
  runtimeBoundApplyFor,
  runtimeBoundClaim,
  runtimeBoundClaimFor,
  runtimeBoundOutcome,
  runtimeBoundOutcomeFor,
  runtimeDesignReserveWithBounds,
  runtimeReserveWithBounds,
  runtimeSourceReviewReserveWithBounds,
  type ApplyPayload,
  type BoundDimension,
  type BoundOperation,
  type ClaimPayload,
  type ProfileEvent,
  type ProfileRegistration,
} from './research-dimension-bounds.ts'
import {
  authorizeSetDigest,
  digestOf,
  effective,
  knowledge,
  outboundDigest,
  policyItem,
  policySetDigest,
  validate,
} from '../../domain/src/research-dimension-bounds.ts'

let db: TestDatabase
let api: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 12 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 12 })
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

const H = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
/** The synthetic emitter identity: a runtime-REPORTED executor digest, consistency only (never G-PROFILE). */
const EMITTER = H('synthetic emitter configuration: single send, sdk retries 0')
const SETTINGS = H('synthetic settings: stream on, tool policy none')
const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const MDX: RuntimeRole = {
  ...MD,
  executor: { execution: 'service', routeId: 'research-sol-medium-v1', executorArtifactDigest: EMITTER },
}
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
const callerOf = (token: string, unit: string): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: unit,
  bridgeInstanceId: randomUUID(),
})
async function bringUp(who: RuntimeCaller, roles: RuntimeRole[]) {
  await service((c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles }))
  await service((c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
}

/** A project with an enabled gate, a legacy runtime, an account, a grant and a qualified contribution runtime whose
 * hello REPORTS `roles` (by default the synthetic service emitter); R2: the legacy (project) runtime REPORTS `legacyRoles`
 * (by default the research role only). All SYNTHETIC. */
async function world(o: { roles?: RuntimeRole[]; legacyRoles?: RuntimeRole[] } = {}) {
  const OWNER = randomUUID()
  const REQ = randomUUID()
  const ADMIN = randomUUID()
  const { projectId } = await seedProject(db.ownerUrl, { admin: ADMIN, editors: [OWNER, REQ], viewers: [] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const reg = await registerRuntime(db.ownerUrl, { projectId, admin: ADMIN })
  const legacy = callerOf(reg.token, reg.runtimeUnitId)
  await bringUp(legacy, o.legacyRoles ?? [MD])
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
  await bringUp(who, o.roles ?? [MDX])
  await qualifyApiAccount(owner, {
    connectionId: conn.connectionId,
    operations: ['research'],
    verification: 'operator_verified_call',
    evidenceRef: 'synthetic: not a live account qualification',
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  })
  return { projectId, OWNER, REQ, ADMIN, account, connectionId: conn.connectionId, grantId, who, legacy }
}
type World = Awaited<ReturnType<typeof world>>
type At = { attemptId: string; nativeSessionId: string }

const ask = (w: World) =>
  withActor(api, w.REQ, 'write', (c) =>
    admitResearchTask(c, w.projectId, {
      key: randomUUID(),
      exchangeId: randomUUID(),
      request: { question: 'Which sandboxes do PDF rendering services use?', outputs: ['markdown'] },
      specialist: { role: MD.id, route: MD.route },
    }),
  )
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
  for (const row of await claimRuntimeOutbox(worker, 'c2-bounds', 50, 30))
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
/** A project-funded (unpinned) task on the legacy runtime: an account-null allowance. */
async function projectFunded(w: World) {
  const r = await ask(w)
  assert.ok('admitted' in r, JSON.stringify(r))
  await dispatchAll()
  return { taskId: r.admitted.taskId, at: await deliver(w.legacy, r.admitted.attemptId) }
}

// --- custody fixtures: the dedicated C2 authority, profiles, policies ----------------------------------------------

type Scope = { kind: 'account' | 'project' | 'grant'; ref: string }
const accountScope = (w: World): Scope => ({ kind: 'account', ref: w.account })
async function authorityFor(scope: Scope | { kind: 'allowance'; ref: string }, dimension: BoundDimension) {
  return (
    await recordBoundAuthority(owner, {
      version: 'research-bound-authority-v1',
      authorityKey: `synthetic-${randomUUID()}`,
      kind: 'bound_profile_qualification',
      scope,
      dimension,
      approverRef: 'synthetic: owner approval fixture',
      verifierRef: 'synthetic: independent verifier fixture',
    })
  ).authorityId
}
interface ProfileOpts {
  ceiling?: number
  model?: string
  route?: string
  provider?: string
  scope: Scope
  revision?: number
  profileId?: string
  requests?: boolean
  /** false: no output_tokens row (a dispatch_count-only profile). */
  output?: boolean
  activate?: boolean
}
interface Profile {
  profileId: string
  revision: string
  out: string
  req: string | null
}
const registration = (
  p: { profileId: string; revision: number; dimension: BoundDimension; scope: Scope; authorityId: string },
  o: ProfileOpts,
): ProfileRegistration => ({
  profile_id: p.profileId,
  revision: String(p.revision),
  dimension: p.dimension,
  unit: p.dimension === 'openai.output_tokens' ? 'tokens' : 'requests',
  enforcement_kind: p.dimension === 'openai.output_tokens' ? 'output_parameter' : 'dispatch_count',
  param_name: p.dimension === 'openai.output_tokens' ? 'max_output_tokens' : null,
  max_ceiling: p.dimension === 'openai.output_tokens' ? String(o.ceiling ?? 16000) : '1',
  provider: o.provider ?? 'openai-research',
  route_id: o.route ?? 'research-sol-medium-v1',
  endpoint: 'responses',
  model: o.model ?? 'gpt-6.1-sol',
  settings_digest: SETTINGS,
  emitter_identity_digest: EMITTER,
  semantics_evidence_digest: H('synthetic semantics evidence'),
  isolation_evidence_digest: H('synthetic isolation evidence'),
  scope_kind: p.scope.kind,
  scope_ref: p.scope.ref,
  authority_id: p.authorityId,
  approval_ref_digest: H('synthetic approval reference'),
  evidence_digest: H('synthetic evidence reference'),
})
const lifecycle = (
  p: { profileId: string; revision: string },
  dimension: BoundDimension,
  authorityId: string,
  kind: ProfileEvent['event_kind'],
  e: { key?: string; target?: string | null } = {},
): ProfileEvent => ({
  profile_id: p.profileId,
  revision: p.revision,
  dimension,
  event_key: e.key ?? `${kind}-${randomUUID()}`,
  event_kind: kind,
  target_event_digest: e.target ?? null,
  reason_code: 'synthetic_operator',
  authority_id: authorityId,
  approval_ref_digest: H('synthetic approval reference'),
  cause_ref_digest: null,
  evidence_digest: H('synthetic evidence reference'),
})
/** A profile revision (output_tokens, and with `requests` model_requests), registered and (by default) activated. */
async function profileOf(o: ProfileOpts): Promise<Profile> {
  const p = { profileId: o.profileId ?? randomUUID(), revision: String(o.revision ?? 1) }
  const out = await authorityFor(o.scope, 'openai.output_tokens')
  const revision = o.revision ?? 1
  const at = { profileId: p.profileId, revision, scope: o.scope }
  if (o.output !== false)
    await registerBoundProfile(owner, registration({ ...at, dimension: 'openai.output_tokens', authorityId: out }, o))
  let req: string | null = null
  if (o.requests !== false) {
    req = await authorityFor(o.scope, 'openai.model_requests')
    await registerBoundProfile(owner, registration({ ...at, dimension: 'openai.model_requests', authorityId: req }, o))
  }
  if (o.activate !== false) {
    if (o.output !== false) await recordBoundProfileEvent(owner, lifecycle(p, 'openai.output_tokens', out, 'activate'))
    if (req) await recordBoundProfileEvent(owner, lifecycle(p, 'openai.model_requests', req, 'activate'))
  }
  return { ...p, out, req }
}
async function policyOf(
  scope: { kind: 'project' | 'allowance' | 'account'; ref: string },
  cap: number,
  activate = true,
) {
  const auth = await authorityFor(scope, 'openai.output_tokens')
  const policyId = randomUUID()
  const reg = await registerBoundPolicy(owner, {
    policy_id: policyId,
    revision: '1',
    scope_kind: scope.kind,
    scope_ref: scope.ref,
    dimension: 'openai.output_tokens',
    unit: 'tokens',
    cap: String(cap),
    authority_id: auth,
    approval_ref_digest: H('synthetic approval reference'),
    evidence_digest: H('synthetic evidence reference'),
  })
  const act = activate
    ? await recordBoundPolicyEvent(owner, {
        policy_id: policyId,
        revision: '1',
        event_key: 'activate-1',
        event_kind: 'activate',
        authority_id: auth,
        approval_ref_digest: H('synthetic approval reference'),
        evidence_digest: H('synthetic evidence reference'),
      })
    : null
  return { policyId, auth, digest: reg.digest as string, activation: (act?.digest as string | undefined) ?? null }
}

// --- reserve, apply, claim ------------------------------------------------------------------------------------------

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
interface BoundsReply {
  dispatchId: string
  profileId: string
  profileRevision: string
  authorizeSetDigest: string
  originalGeneration: string | null
  items: {
    dimension: string
    unit: string
    boundKind: string
    bound: string | null
    enforcementKind: string | null
    policySetDigest: string | null
    unsupportedReason: string | null
    authorizeDigest: string
  }[]
}
type ReserveReply = {
  reservationId: string
  binding?: { bounds?: BoundsReply; [k: string]: unknown }
  [k: string]: unknown
}
const reserveRequest = (at: At, callId: string, p?: { profileId: string; revision: string }, extra = {}) => ({
  ...at,
  callId,
  kind: 'model',
  provider: 'openai-research',
  amountUsd: 0.1,
  ...TRACKED,
  ...(p ? { boundProfile: { profileId: p.profileId, revision: p.revision } } : {}),
  ...extra,
})
const reserve = (who: RuntimeCaller, at: At, callId: string, p?: { profileId: string; revision: string }, extra = {}) =>
  service((c) => runtimeReserveWithBounds(c, who, reserveRequest(at, callId, p, extra))) as Promise<ReserveReply>
const boundsOf = (r: ReserveReply) => {
  assert.ok(r.binding?.bounds, `bounds in the reply: ${JSON.stringify(r)}`)
  return r.binding.bounds
}
const identityOf = (projectId: string, reservationId: string) =>
  one<{ runtime_id: string; call_id: string; attempt_id: string; resource_id: string }>(
    `SELECT runtime_id, call_id, attempt_id, resource_id FROM sophia.research_call_identities WHERE project_id=$1 AND reservation_id=$2`,
    [projectId, reservationId],
  )
/** What a conforming emitter commits to: its outbound preimage over the reply's bounds (and its own configuration). */
async function applyFor(
  w: World,
  at: At,
  r: ReserveReply,
  o: {
    bound?: string
    model?: string
    settings?: string
    emitter?: string
    generation?: string | null
    set?: string
    provider?: string
  } = {},
): Promise<ApplyPayload> {
  const b = boundsOf(r)
  const i = await identityOf(w.projectId, r.reservationId)
  const items = b.items
    .filter((x) => x.enforcementKind === 'output_parameter')
    .map((x) => [x.dimension, 'max_output_tokens', o.bound ?? x.bound!] as const)
  return {
    project_id: w.projectId,
    reservation_id: r.reservationId,
    dispatch_id: b.dispatchId,
    attempt_id: at.attemptId,
    call_id: i.call_id,
    runtime_id: i.runtime_id,
    original_generation: o.generation === undefined ? b.originalGeneration : o.generation,
    emitter_identity_digest: o.emitter ?? EMITTER,
    outbound_params_digest: outboundDigest({
      provider: o.provider ?? 'openai-research',
      endpoint: 'responses',
      model: o.model ?? 'gpt-6.1-sol',
      settingsDigest: o.settings ?? SETTINGS,
      emitterIdentityDigest: o.emitter ?? EMITTER,
      items,
    }),
    authorize_set_digest:
      o.set ??
      authorizeSetDigest(
        b.dispatchId,
        b.items.map((x) => x.authorizeDigest),
      ),
  }
}
const claimFor = (a: ApplyPayload, receipt: string): ClaimPayload => ({
  project_id: a.project_id,
  reservation_id: a.reservation_id,
  dispatch_id: a.dispatch_id,
  runtime_id: a.runtime_id,
  original_generation: a.original_generation,
  apply_receipt_digest: receipt,
})
const apply = (db0: pg.Pool | pg.ClientBase, w: World, at: At, a: ApplyPayload) => runtimeBoundApply(db0, w.who, at, a)
const claim = (db0: pg.Pool | pg.ClientBase, who: RuntimeCaller, at: At, c: ClaimPayload) =>
  runtimeBoundClaim(db0, who, at, c)
/** reserve -> apply (expected preimage) and its claim payload. */
async function applied(w: World, at: At, p: Profile, callId = `call-${randomUUID().slice(0, 8)}`) {
  const r = await reserve(w.who, at, callId, p)
  const a = await applyFor(w, at, r)
  const receipt = await apply(owner, w, at, a)
  return { r, a, c: claimFor(a, receipt.applyReceiptDigest as string), receipt }
}
const known = (value: number) => ({ class: 'known' as const, value })
const complete = (at: At, reservationId: string, o: { cost?: number; output?: number; input?: number } = {}) => ({
  ...at,
  reservationId,
  outcome: 'settled' as const,
  costUsd: o.cost ?? 0.01,
  usage: { inputTokens: o.input ?? 3, outputTokens: o.output ?? 4 },
  evidence: {
    contract: 'c1p_complete_report' as const,
    report: 'complete_report' as const,
    counts: {
      nonCachedInput: known(o.input ?? 3),
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
const allowanceOfTask = (taskId: string) =>
  one<{ id: string; spent: string; uncertain: string; reserved: string }>(
    `SELECT a.id, a.spent_usd::text AS spent, a.uncertain_usd::text AS uncertain, a.reserved_usd::text AS reserved
     FROM sophia.research_tasks t JOIN sophia.research_allowances a ON a.project_id=t.project_id AND a.id=t.allowance_id WHERE t.job_id=$1`,
    [taskId],
  )
const micro = (v: string | number) => Math.round(Number(v) * 1_000_000)
const countIn = async (table: string, projectId: string) =>
  Number((await one<{ n: string }>(`SELECT count(*) AS n FROM sophia.${table} WHERE project_id=$1`, [projectId])).n)
const stateOf = (p: Profile, d: BoundDimension = 'openai.output_tokens') =>
  boundProfileState(owner, p.profileId, Number(p.revision), d)
const statusOf = async (w: World, reservationId: string, d = 'openai.output_tokens') =>
  (await boundStatus(owner, w.projectId, reservationId)).dimensions.find((x) => x.dimension === d)!

// --- two-connection barriers ----------------------------------------------------------------------------------------

const pidOf = async (c: pg.ClientBase) => (await c.query<{ p: number }>(`SELECT pg_backend_pid() AS p`)).rows[0]!.p
async function blockedBy(holder: number, what: string): Promise<number> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const r = await rows<{ pid: number }>(`SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))`, [
      holder,
    ])
    if (r.length === 1) return r[0]!.pid
    if (Date.now() > deadline) throw new Error(`${what}: never blocked by ${String(holder)} (${JSON.stringify(r)})`)
    await sleep(25)
  }
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
const deferred = () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  return { gate, release }
}
const profileRow = `SELECT 1 FROM sophia.research_bound_profiles WHERE profile_id=$1 AND revision=1 AND dimension='openai.output_tokens'`
const guardRow = `SELECT 1 FROM sophia.research_evidence_guards WHERE account_id=$1`

// --- R1 (F08): the finite failure lifecycle of a test's own transaction holder ------------------------------------------

/** What a holding test started: an operation it must see end, and a gate it must open, whatever happens. */
interface Held {
  /** Observes a started operation (never an unhandled rejection) and returns it unchanged for the test to await. */
  track: <T>(p: Promise<T>) => Promise<T>
  /** A gate that is always released before cleanup awaits the started operations. */
  gate: () => ReturnType<typeof deferred>
}
const asError = (e: unknown) => (e instanceof Error ? e : new Error(chain(e)))
const noop = () => undefined
/**
 * Runs a test step on its own owner connection. On every outcome: release its gates, ROLLBACK (a no-op after its own
 * COMMIT or ROLLBACK), await every operation it started, then release the client (destroyed if cleanup failed). The
 * primary failure stays primary; a cleanup failure is reported with it, never instead of it.
 */
async function holding<T>(body: (c: pg.PoolClient, h: Held) => Promise<T>): Promise<T> {
  const c = await owner.connect()
  const ongoing: Promise<unknown>[] = []
  const gates: (() => void)[] = []
  const h: Held = {
    track: (p) => {
      ongoing.push(p.then(noop, noop))
      return p
    },
    gate: () => {
      const d = deferred()
      gates.push(d.release)
      return d
    },
  }
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  try {
    outcome = { ok: true, value: await body(c, h) }
  } catch (error) {
    outcome = { ok: false, error }
  }
  const cleanup = await endHolding(c, ongoing, gates)
  if (!outcome.ok)
    throw cleanup.length > 0
      ? new AggregateError([outcome.error, ...cleanup], 'the test failed, then its cleanup failed')
      : asError(outcome.error)
  if (cleanup.length > 0) throw new AggregateError(cleanup, 'the holder cleanup failed')
  return outcome.value
}
async function endHolding(c: pg.PoolClient, ongoing: readonly Promise<unknown>[], gates: readonly (() => void)[]) {
  const errors: unknown[] = []
  for (const open of gates) open()
  try {
    await c.query('ROLLBACK')
  } catch (err) {
    errors.push(err)
  }
  await Promise.all(ongoing) // observed above: they settle, never reject
  c.release(errors.length > 0)
  return errors
}
/** One operation on its own connection (released when it ends), its backend pid reported before it starts. */
async function onOwnConnection<T>(fn: (c: pg.PoolClient) => Promise<T>, onPid: (pid: number) => void): Promise<T> {
  const c = await owner.connect()
  try {
    onPid(await pidOf(c))
    return await fn(c)
  } finally {
    c.release()
  }
}
/** Whether a FOR UPDATE NOWAIT on the given row is refused right now (it is held by another transaction). */
const heldElsewhere = (sql: string, params: unknown[]): Promise<boolean> =>
  holding(async (c) => {
    await c.query('BEGIN')
    try {
      await c.query(sql, params)
      return false
    } catch (err) {
      if ((err as { code?: string }).code === '55P03') return true
      throw err
    }
  })
async function goalOf(w: World, attemptId: string) {
  return one<{ goal: string; revision: string; epoch: string }>(
    `SELECT g.id AS goal, g.revision::text AS revision, g.authority_epoch::text AS epoch FROM sophia.work_attempts a
     JOIN sophia.goals g ON g.project_id=a.project_id AND g.id=a.goal_id WHERE a.project_id=$1 AND a.id=$2`,
    [w.projectId, attemptId],
  )
}
/**
 * The ACTUAL Stop/hold writer (admit_goal_command) by an editor. `onPid` names its backend before the command; with a
 * gate, `onAdmitted` fires once the command returned (its project lock held) and the transaction stays open until the gate.
 */
async function goalCommand(
  w: World,
  attemptId: string,
  kind: 'stop' | 'hold',
  o: { gate?: Promise<void>; onPid?: (pid: number) => void; onAdmitted?: () => void } = {},
) {
  const g = await goalOf(w, attemptId)
  return withActor(api, w.REQ, 'write', async (c) => {
    o.onPid?.(await pidOf(c))
    await c.query(`SELECT sophia.admit_goal_command($1,$2,$3,$4,$5,$6)`, [
      w.projectId,
      g.goal,
      kind,
      `c2-${kind}-${randomUUID()}`,
      g.revision,
      g.epoch,
    ])
    o.onAdmitted?.()
    if (o.gate) await o.gate
  })
}

// =====================================================================================================================

describe('authorize at reserve (AS-FP01): server-derived bounds, policies, refusals before effect', () => {
  it('T-C2-01/02/66: one dispatch, four authorize rows (two authorized, two unsupported), min(ceiling, caps), parity', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const funds0 = await allowanceOfTask(s.taskId)
    // no active cap: b = profile.max_ceiling and a typed-null policy set (T-C2-66); a registered but inactive policy is no cap
    await policyOf({ kind: 'account', ref: w.account }, 1000, false)
    const r0 = await reserve(w.who, s.at, 'nocap', p)
    const b0 = boundsOf(r0)
    const out0 = b0.items.find((x) => x.dimension === 'openai.output_tokens')!
    assert.deepEqual([out0.bound, out0.policySetDigest], ['16000', null])
    // active caps 20000 (account) and 8000 (allowance): b = min(16000, 20000, 8000) = 8000; all active caps recorded
    const allowance = (await allowanceOfTask(s.taskId)).id
    const c1 = await policyOf({ kind: 'account', ref: w.account }, 20000)
    const c2 = await policyOf({ kind: 'allowance', ref: allowance }, 8000)
    const r = await reserve(w.who, s.at, 'capped', p)
    const b = boundsOf(r)
    assert.deepEqual(
      b.items.map((x) => [x.dimension, x.boundKind, x.bound, x.enforcementKind, x.unsupportedReason]),
      [
        ['openai.input_cached_tokens', 'unsupported', null, null, 'no_enforcing_mechanism'],
        ['openai.input_tokens', 'unsupported', null, null, 'input_estimate_only'],
        ['openai.model_requests', 'authorized', '1', 'dispatch_count', null],
        ['openai.output_tokens', 'authorized', '8000', 'output_parameter', null],
      ],
    )
    const out = b.items.find((x) => x.dimension === 'openai.output_tokens')!
    assert.equal(
      out.policySetDigest,
      policySetDigest('openai.output_tokens', [
        policyItem(c1.digest, c1.activation!),
        policyItem(c2.digest, c2.activation!),
      ]),
    )
    // the stored authorize payloads are closed C2 payloads whose digests the TypeScript codec reproduces
    for (const row of await rows<{ payload: Record<string, unknown>; digest: string }>(
      `SELECT payload, digest FROM sophia.research_bound_authorizations WHERE project_id=$1 AND reservation_id=$2`,
      [w.projectId, r.reservationId],
    )) {
      const v = validate('sophia.c2.bound.authorize.v1', row.payload)
      assert.ok(v.ok)
      assert.equal(digestOf('sophia.c2.bound.authorize.v1', v.values), row.digest)
    }
    assert.equal(
      b.authorizeSetDigest,
      authorizeSetDigest(
        b.dispatchId,
        b.items.map((x) => x.authorizeDigest),
      ),
    )
    // the same transaction as the reservation and its identity; the bound metadata moves no money (T-C2-38)
    assert.equal(await countIn('research_bound_dispatches', w.projectId), 2)
    const after1 = await allowanceOfTask(s.taskId)
    assert.equal(micro(after1.reserved) - micro(funds0.reserved), micro(0.2))
  })

  it('T-C2-03/04/05/07/08 and C02: every refusal is before any effect (no reservation, no identity, no money)', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const allowance0 = await allowanceOfTask(s.taskId)
    const reservations = () => countIn('research_reservations', w.projectId)
    const n0 = await reservations()
    const cases: [string, () => Promise<unknown>, RegExp][] = [
      ['caller maxTokens', () => reserve(w.who, s.at, 'k1', p, { maxTokens: 16000 }), /bound_caller_supplied/],
      [
        'caller bound inside',
        () => reserve(w.who, s.at, 'k2', undefined, { boundProfile: { ...p, bound: '1' } }),
        /bound_caller_supplied/,
      ],
      [
        'unknown profile',
        () => reserve(w.who, s.at, 'k3', { profileId: randomUUID(), revision: '1' }),
        /bound_profile_unknown/,
      ],
      [
        'other route model',
        async () => reserve(w.who, s.at, 'k4', await profileOf({ scope: accountScope(w), model: 'gpt-6.1-other' })),
        /bound_route_mismatch/,
      ],
      [
        'other account',
        async () => reserve(w.who, s.at, 'k5', await profileOf({ scope: { kind: 'account', ref: randomUUID() } })),
        /bound_profile_scope_mismatch/,
      ],
      [
        'inactive (registered only)',
        async () => reserve(w.who, s.at, 'k6', await profileOf({ scope: accountScope(w), activate: false })),
        /bound_profile_inactive/,
      ],
    ]
    for (const [name, pr, code] of cases) assert.match(await refusal(pr()), code, name)
    // revoked before reserve (T-C2-05)
    await recordBoundProfileEvent(owner, lifecycle(p, 'openai.output_tokens', p.out, 'revoke'))
    assert.match(await refusal(reserve(w.who, s.at, 'k7', p)), /bound_profile_inactive/)
    // C02: an applicable CONFLICTED policy refuses; never omitted into a no-cap fallback
    const q = await profileOf({ scope: accountScope(w) })
    const pol = await policyOf({ kind: 'account', ref: w.account }, 5)
    await recordBoundPolicyEvent(owner, {
      policy_id: pol.policyId,
      revision: '1',
      event_key: 'activate-1',
      event_kind: 'activate',
      authority_id: pol.auth,
      approval_ref_digest: H('synthetic approval reference'),
      evidence_digest: H('competing evidence'),
    })
    assert.equal(await boundPolicyState(owner, pol.policyId, 1), 'conflicted')
    assert.match(await refusal(reserve(w.who, s.at, 'k8', q)), /bound_policy_conflicted/)
    assert.equal(await reservations(), n0)
    assert.equal(await countIn('research_call_identities', w.projectId), 0)
    assert.equal(await countIn('research_bound_dispatches', w.projectId), 0)
    assert.deepEqual(await allowanceOfTask(s.taskId), allowance0)
    // an account-null (project-funded) reservation is no account's: an account-scoped profile never applies
    const wn = await world()
    const pf = await projectFunded(wn)
    const pfAllowance = await allowanceOfTask(pf.taskId)
    const qn = await profileOf({ scope: accountScope(wn) })
    assert.match(await refusal(reserve(wn.legacy, pf.at, 'k9', qn)), /bound_profile_scope_mismatch/)
    assert.deepEqual(await allowanceOfTask(pf.taskId), pfAllowance)
    assert.equal(await countIn('research_reservations', wn.projectId), 0)
  })

  it('PW-CONFLICT-GATE / C02: bound 5 before; after the conflict no new authorize/apply/claim; old replay keeps 5; genuinely empty -> 20', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w), ceiling: 20 })
    const pol = await policyOf({ kind: 'account', ref: w.account }, 5)
    const r = await reserve(w.who, s.at, 'gate', p)
    assert.equal(boundsOf(r).items.find((x) => x.dimension === 'openai.output_tokens')!.bound, '5')
    await recordBoundPolicyEvent(owner, {
      policy_id: pol.policyId,
      revision: '1',
      event_key: 'activate-1',
      event_kind: 'activate',
      authority_id: pol.auth,
      approval_ref_digest: H('synthetic approval reference'),
      evidence_digest: H('a competing activation'),
    })
    assert.match(await refusal(reserve(w.who, s.at, 'gate-2', p)), /bound_policy_conflicted/)
    const a = await applyFor(w, s.at, r)
    assert.match(await refusal(apply(owner, w, s.at, a)), /bound_policy_conflicted/)
    // the exact old reserve replay returns its stored 5 (no send right is in a reply)
    const again = await reserve(w.who, s.at, 'gate', p)
    assert.deepEqual(boundsOf(again), boundsOf(r))
    // a conflict-free, genuinely empty active set: the profile ceiling 20
    const w2 = await world()
    const s2 = await started(w2)
    const p2 = await profileOf({ scope: accountScope(w2), ceiling: 20 })
    assert.equal(
      boundsOf(await reserve(w2.who, s2.at, 'empty', p2)).items.find((x) => x.dimension === 'openai.output_tokens')!
        .bound,
      '20',
    )
  })

  it('PW-ACTIVATION / C01: the first activate is canonical; a later activate or an exact replay never changes the item', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const pol = await policyOf({ kind: 'account', ref: w.account }, 9000)
    const first = await reserve(w.who, s.at, 'act-1', p)
    await recordBoundPolicyEvent(owner, {
      policy_id: pol.policyId,
      revision: '1',
      event_key: 'activate-2',
      event_kind: 'activate',
      authority_id: pol.auth,
      approval_ref_digest: H('synthetic approval reference'),
      evidence_digest: H('a second activation'),
    })
    const replay = await recordBoundPolicyEvent(owner, {
      policy_id: pol.policyId,
      revision: '1',
      event_key: 'activate-1',
      event_kind: 'activate',
      authority_id: pol.auth,
      approval_ref_digest: H('synthetic approval reference'),
      evidence_digest: H('synthetic evidence reference'),
    })
    assert.deepEqual([replay.replay, replay.eventSeq], [true, 1])
    const second = await reserve(w.who, s.at, 'act-2', p)
    const item = (r: ReserveReply) =>
      boundsOf(r).items.find((x) => x.dimension === 'openai.output_tokens')!.policySetDigest
    assert.equal(item(second), item(first))
    assert.equal(item(first), policySetDigest('openai.output_tokens', [policyItem(pol.digest, pol.activation!)]))
  })
})

describe('reserve replay and legacy (T-C2-09/10/11/25/68)', () => {
  it('exact replay returns the stored bounds even after a server policy change; a changed client request is 23505', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const r = await reserve(w.who, s.at, 'replay', p)
    const rows0 = {
      d: await countIn('research_bound_dispatches', w.projectId),
      a: await countIn('research_bound_authorizations', w.projectId),
    }
    await policyOf({ kind: 'account', ref: w.account }, 1000) // a later SERVER policy
    const again = await reserve(w.who, s.at, 'replay', p)
    assert.deepEqual(again, r, 'stored reservation, bounds, policy set and authorize digests (T-C2-09/11)')
    assert.deepEqual(
      {
        d: await countIn('research_bound_dispatches', w.projectId),
        a: await countIn('research_bound_authorizations', w.projectId),
      },
      rows0,
    )
    const q = await profileOf({ scope: accountScope(w) })
    for (const [name, pr] of [
      ['another profile', () => reserve(w.who, s.at, 'replay', q)],
      ['another revision', () => reserve(w.who, s.at, 'replay', { profileId: p.profileId, revision: '2' })],
      ['opt-in removed', () => reserve(w.who, s.at, 'replay')],
      [
        'declared model changed',
        () => reserve(w.who, s.at, 'replay', p, { declared: { ...TRACKED.declared, model: 'gpt-6.1-x' } }),
      ],
    ] as const)
      assert.match(await refusal(pr()), /Idempotency key reused for another reservation/, name)
    assert.equal(await countIn('research_bound_dispatches', w.projectId), rows0.d)
  })

  it('without the opt-in the tracked reserve, ACK, replay and settle are unchanged; the read is unknown (T-C2-25)', async () => {
    const w = await world()
    const s = await started(w)
    const r = await reserve(w.who, s.at, 'legacy')
    assert.equal(r.binding?.bounds, undefined)
    assert.deepEqual(Object.keys(r.binding ?? {}).toSorted(), [
      'attemptId',
      'callId',
      'contract',
      'evidenceId',
      'mode',
      'nativeSessionId',
      'projectId',
      'resourceId',
      'runtimeUnitId',
    ])
    assert.deepEqual(await reserve(w.who, s.at, 'legacy'), r)
    assert.equal(
      (
        await one<{ v: number }>(
          `SELECT facts_version AS v FROM sophia.research_call_identities WHERE reservation_id=$1`,
          [r.reservationId],
        )
      ).v,
      1,
    )
    assert.ok((await settle(w.who, s.at, r.reservationId, { output: 17000 })) !== null)
    assert.deepEqual(
      (await boundStatus(owner, w.projectId, r.reservationId)).dimensions.map((d) => d.status),
      ['unknown', 'unknown', 'unknown', 'unknown'],
    )
    assert.equal(await countIn('research_bound_contradictions', w.projectId), 0)
  })
})

describe('apply: a receipt against the server-derived expected preimage, never permission', () => {
  it('T-C2-12/80/19/84: positive receipt; exact replay any phase is the same receipt; never sendPermitted', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const { r, a, receipt, c } = await applied(w, s.at, p)
    assert.deepEqual([receipt.phase, receipt.sendPermitted, receipt.replay], ['applied', false, false])
    const again = await apply(owner, w, s.at, a)
    assert.deepEqual(
      [again.applyReceiptDigest, again.phase, again.replay, again.sendPermitted],
      [receipt.applyReceiptDigest, 'applied', true, false],
    )
    assert.equal(receipt.applyReceiptDigest, digestOf('sophia.c2.dispatch.apply.v1', Object.values(a)))
    const cl = await claim(owner, w.who, s.at, c)
    assert.equal(cl.sendPermitted, true)
    const late = await apply(owner, w, s.at, a)
    assert.deepEqual(
      [late.phase, late.replay, late.sendPermitted],
      ['claimed', true, false],
      'T-C2-84: no re-validation into applied',
    )
    assert.equal((await boundStatus(owner, w.projectId, r.reservationId)).phase, 'claimed')
  })

  it('T-C2-13/81/16/82 + PW-OPAQUE-MISMATCH (C03): any digest inequality is one generic refusal, no row, no send', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const r = await reserve(w.who, s.at, 'mismatch', p)
    const b = boundsOf(r)
    const sorted = b.items.map((x) => x.authorizeDigest)
    const variants: [string, Partial<Parameters<typeof applyFor>[3]>][] = [
      ['correct hash of a wrong ceiling (16001)', { bound: '16001' }],
      ['correct hash of a lower ceiling', { bound: '15999' }],
      ['model', { model: 'gpt-6.1-other' }],
      ['settings (stream/tool policy)', { settings: H('other settings') }],
      ['emitter', { emitter: H('another emitter') }],
      ['original generation', { generation: H('another generation') }],
      ['set missing the unsupported rows', { set: authorizeSetDigest(b.dispatchId, sorted.slice(2)) }],
      ['set with a duplicate', { set: authorizeSetDigest(b.dispatchId, [...sorted.slice(1), sorted[1]!]) }],
      ['set with an extra row', { set: authorizeSetDigest(b.dispatchId, [...sorted, H('extra')]) }],
      ['set over another revision', { set: authorizeSetDigest(b.dispatchId, [...sorted.slice(1), H('rev 2 row')]) }],
    ]
    for (const [name, o] of variants)
      assert.match(await refusal(apply(owner, w, s.at, await applyFor(w, s.at, r, o))), /bound_param_mismatch/, name)
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
    // a reordered set is the same canonical identity: accepted
    const reordered = await applyFor(w, s.at, r, { set: authorizeSetDigest(b.dispatchId, sorted.toReversed()) })
    assert.equal((await apply(owner, w, s.at, reordered)).phase, 'applied')
  })

  it('T-C2-21/14/15/17/18: malformed or flagged payloads, another call, a closed reservation are refused with no row', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const r = await reserve(w.who, s.at, 'shape', p)
    const a = await applyFor(w, s.at, r)
    for (const [name, bad, code] of [
      ['non-recomputable digest', { ...a, outbound_params_digest: 'not-a-digest' }, /payload_invalid/],
      ['supplied single_send flag', { ...a, single_send: 'true' }, /payload_invalid/],
      ['supplied sdk_retries flag', { ...a, sdk_retries: '0' }, /payload_invalid/],
      ['another call id', { ...a, call_id: 'another-call' }, /bound_identity_mismatch/],
      ['another runtime', { ...a, runtime_id: randomUUID() }, /bound_identity_mismatch/],
    ] as const)
      assert.match(await refusal(apply(owner, w, s.at, bad as ApplyPayload)), code, name)
    // another attempt's caller (a project-funded task in another project) cannot apply this reservation
    const wo = await world()
    const pf = await projectFunded(wo)
    assert.match(await refusal(runtimeBoundApply(owner, wo.legacy, pf.at, a)), /bound_identity_mismatch/)
    // a reservation that left reserved
    await settle(w.who, s.at, r.reservationId)
    assert.match(await refusal(apply(owner, w, s.at, a)), /bound_reservation_not_open/)
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
  })

  it('T-C2-20/86: a different apply before claim is a sticky orthogonal conflict; the claim is refused; replay is the same receipt', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const { r, a, c } = await applied(w, s.at, p)
    const other = { ...a, emitter_identity_digest: H('a different but well-formed commitment') }
    const k = await apply(owner, w, s.at, other)
    assert.deepEqual([k.conflict, k.applyConflicted, k.phase, k.sendPermitted], [true, true, 'applied', false])
    assert.deepEqual(await apply(owner, w, s.at, other), k)
    assert.equal(await countIn('research_bound_apply_conflicts', w.projectId), 1)
    assert.match(await refusal(claim(owner, w.who, s.at, c)), /dispatch_apply_conflict/)
    const st = await boundStatus(owner, w.projectId, r.reservationId)
    assert.deepEqual([st.phase, st.applyConflicted], ['applied', true])
    assert.equal((await statusOf(w, r.reservationId)).status, 'contradicted')
  })
})

describe('apply and dispatch shapes under concurrency (T-C2-27/83)', () => {
  it('T-C2-27: two concurrent identical applies -> one receipt; the second waits, then reads it as a replay', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const r = await reserve(w.who, s.at, 'conc-apply', p)
    const a = await applyFor(w, s.at, r)
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      const first = await apply(holder, w, s.at, a)
      const second = h.track(apply(owner, w, s.at, a))
      await blockedBy(await pidOf(holder), 'the second identical apply')
      await holder.query('COMMIT')
      const b2 = await second
      assert.deepEqual(
        [first.replay, b2.replay, b2.applyReceiptDigest, b2.sendPermitted],
        [false, true, first.applyReceiptDigest, false],
      )
    })
    assert.equal(await countIn('research_bound_applications', w.projectId), 1)
  })

  it('T-C2-83: a dispatch_count-only dispatch has n=0 outbound items, output reads unsupported, and it applies and claims', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w), output: false })
    const x = await applied(w, s.at, p)
    const b = boundsOf(x.r)
    const out = b.items.find((i) => i.dimension === 'openai.output_tokens')!
    assert.deepEqual([out.boundKind, out.bound, out.unsupportedReason], ['unsupported', null, 'route_not_qualified'])
    const req = b.items.find((i) => i.dimension === 'openai.model_requests')!
    assert.deepEqual([req.boundKind, req.bound, req.policySetDigest], ['authorized', '1', null])
    assert.equal(
      x.a.outbound_params_digest,
      outboundDigest({
        provider: 'openai-research',
        endpoint: 'responses',
        model: 'gpt-6.1-sol',
        settingsDigest: SETTINGS,
        emitterIdentityDigest: EMITTER,
        items: [],
      }),
    )
    assert.equal((await claim(owner, w.who, s.at, x.c)).sendPermitted, true)
    await settle(w.who, s.at, x.r.reservationId, { output: 17000 }) // no output bound: never a contradiction
    assert.equal(await countIn('research_bound_contradictions', w.projectId), 0)
    assert.equal((await statusOf(w, x.r.reservationId, 'openai.model_requests')).status, 'qualified')
  })
})

describe('claim: the single at-most-once transition (W0-W5), post-wait rechecks with genuine waits', () => {
  it('T-C2-49/W0 + T-C2-51/W2: two concurrent claims -> exactly one sendPermitted; every replay is history only', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const { r, c } = await applied(w, s.at, p)
    let sends = 0
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      const first = await claim(holder, w.who, s.at, c)
      if (first.sendPermitted) sends++
      const second = h.track(claim(owner, w.who, s.at, c))
      await blockedBy(await pidOf(holder), 'the second claim')
      await holder.query('COMMIT')
      const lost = await second
      if (lost.sendPermitted) sends++
      assert.deepEqual(
        [first.sendPermitted, lost.sendPermitted, lost.history, lost.claimSeq],
        [true, false, 'claimed', first.claimSeq],
      )
    })
    const replay = await claim(owner, w.who, s.at, c) // the claimer's own lost reply
    if (replay.sendPermitted) sends++
    assert.deepEqual([replay.sendPermitted, replay.replay], [false, true])
    assert.equal(sends, 1, 'total send permissions <= 1 (a controlled counter, not merely one row)')
    assert.equal(await countIn('research_bound_claims', w.projectId), 1)
    assert.equal(
      (await one<{ s: string }>(`SELECT state AS s FROM sophia.research_reservations WHERE id=$1`, [r.reservationId]))
        .s,
      'reserved',
    )
  })

  it('T-C2-50/W1: a claim rolled back (crash before commit) leaves applied; a fresh claim then proceeds once', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const { r, c } = await applied(w, s.at, p)
    await holding(async (k) => {
      await k.query('BEGIN')
      assert.equal((await claim(k, w.who, s.at, c)).sendPermitted, true)
      await k.query('ROLLBACK')
    })
    assert.equal((await boundStatus(owner, w.projectId, r.reservationId)).phase, 'applied')
    assert.equal((await claim(owner, w.who, s.at, c)).sendPermitted, true)
    assert.equal((await claim(owner, w.who, s.at, c)).sendPermitted, false)
  })

  it('T-C2-53/54 Stop both orders (the ACTUAL admit_goal_command): Stop first refuses the claim; claim first keeps may-have-sent', async () => {
    // Stop first: its transaction holds the project; the claim waits; Stop commits; the post-wait fence refuses.
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const { r, c } = await applied(w, s.at, p)
    await holding(async (_unused, h) => {
      const g = h.gate()
      const admitted = h.gate()
      let stopPid = 0
      const stop = h.track(
        goalCommand(w, s.at.attemptId, 'stop', {
          gate: g.gate,
          onPid: (pid) => (stopPid = pid),
          onAdmitted: admitted.release,
        }),
      )
      await Promise.race([admitted.gate, stop]) // the Stop has committed nothing yet but holds the project row
      const waiting = h.track(refusal(claim(owner, w.who, s.at, c)))
      await blockedBy(stopPid, 'the claim behind the Stop')
      g.release()
      await stop
      assert.match(await waiting, /40001:Research work is not active/)
    })
    assert.equal((await boundStatus(owner, w.projectId, r.reservationId)).phase, 'applied', 'never sendable')
    // claim first: its transaction holds the project; the Stop waits; the claim commits with the one permission
    const w2 = await world()
    const s2 = await started(w2)
    const p2 = await profileOf({ scope: accountScope(w2) })
    const x = await applied(w2, s2.at, p2)
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      assert.equal((await claim(holder, w2.who, s2.at, x.c)).sendPermitted, true)
      const named = h.gate()
      let stop2Pid = 0
      const stop2 = h.track(
        goalCommand(w2, s2.at.attemptId, 'stop', {
          onPid: (pid) => {
            stop2Pid = pid
            named.release()
          },
        }),
      )
      await named.gate
      assert.equal(await blockedBy(await pidOf(holder), 'the Stop behind the claim'), stop2Pid)
      await holder.query('COMMIT')
      await stop2
    })
    const replay = await refusal(claim(owner, w2.who, s2.at, x.c))
    assert.ok(replay === 'resolved' || /Research work is not active/.test(replay), replay)
    const st = await boundStatus(owner, w2.projectId, x.r.reservationId)
    assert.deepEqual(
      [st.phase, st.claim?.runtimeId !== undefined],
      ['claimed', true],
      'in flight: may-have-sent, owner kept',
    )
  })

  it('T-C2-30 + hold: a Stop or hold before apply refuses the first apply (fence), obligations kept, no money change', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const r = await reserve(w.who, s.at, 'stopped', p)
    const a = await applyFor(w, s.at, r)
    const funds0 = await allowanceOfTask(s.taskId)
    await goalCommand(w, s.at.attemptId, 'hold')
    assert.match(await refusal(apply(owner, w, s.at, a)), /Research work is not active/)
    assert.deepEqual(await allowanceOfTask(s.taskId), funds0)
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
  })

  it('T-C2-55/64/31: profile revoke vs claim, both orders on the profile row; revoke after claim keeps qualified history', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    // revoke first: its transaction holds the profile row; the claim waits on it; the revoke commits; refused
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      await recordBoundProfileEvent(holder, lifecycle(p, 'openai.output_tokens', p.out, 'revoke'))
      const waiting = h.track(refusal(claim(owner, w.who, s.at, x.c)))
      const pid = await blockedBy(await pidOf(holder), 'the claim behind the revoke')
      await waitingOn(pid, 'sophia.research_bound_profiles')
      await holder.query('COMMIT')
      assert.match(await waiting, /dispatch_profile_inactive/)
    })
    // claim first: the revoke waits on the profile row; the claim commits; then the revoke; history stays qualified
    const p2 = await profileOf({ scope: accountScope(w) })
    const y = await applied(w, s.at, p2)
    await holding(async (k, h) => {
      await k.query('BEGIN')
      assert.equal((await claim(k, w.who, s.at, y.c)).sendPermitted, true)
      const revoke = h.track(recordBoundProfileEvent(owner, lifecycle(p2, 'openai.output_tokens', p2.out, 'revoke')))
      await blockedBy(await pidOf(k), 'the revoke behind the claim')
      await k.query('COMMIT')
      await revoke
    })
    assert.equal(await stateOf(p2), 'revoke')
    assert.equal(
      (await statusOf(w, y.r.reservationId)).status,
      'qualified',
      'T-C2-31: claimed before revoke stays qualified history',
    )
    assert.match(await refusal(reserve(w.who, s.at, 'after-revoke', p2)), /bound_profile_inactive/)
    // T-C2-32: distrust downgrades the read; receipts unchanged; an exact activate replay never reactivates (T-C2-62)
    const receipts = await rows(`SELECT digest FROM sophia.research_bound_applications WHERE reservation_id=$1`, [
      y.r.reservationId,
    ])
    await recordBoundProfileEvent(owner, lifecycle(p2, 'openai.output_tokens', p2.out, 'distrust'))
    assert.equal((await statusOf(w, y.r.reservationId)).status, 'applied_unqualified')
    assert.deepEqual(
      await rows(`SELECT digest FROM sophia.research_bound_applications WHERE reservation_id=$1`, [y.r.reservationId]),
      receipts,
    )
  })

  it('T-C2-56/29/28/57/87: runtime revocation (same-unit re-registration) both orders; the replacement never claims; privacy', async () => {
    const reRegister = (w: World, db0: pg.Pool | pg.ClientBase) => {
      const token = randomUUID() + randomUUID()
      return registerContributionRuntime(db0, {
        projectId: w.projectId,
        connectionId: w.connectionId,
        runtimeUnitId: UNIT,
        tokenSha256: createHash('sha256').update(token, 'utf8').digest(),
        rotate: false,
      }).then(() => callerOf(token, UNIT))
    }
    // re-registration first: it holds the project and runtime; the claim waits; then the original lease is refused
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    const replacement = await holding(async (holder, h) => {
      await holder.query('BEGIN')
      const rep = await reRegister(w, holder)
      const waiting = h.track(refusal(claim(owner, w.who, s.at, x.c)))
      await blockedBy(await pidOf(holder), 'the claim behind the re-registration')
      await holder.query('COMMIT')
      assert.match(await waiting, /Runtime capability revoked/)
      return rep
    })
    await bringUp(replacement, [MDX])
    assert.match(
      await refusal(claim(owner, replacement, s.at, x.c)),
      /dispatch_runtime_revoked/,
      'the replacement cannot claim',
    )
    assert.match(
      await refusal(apply(owner, { ...w, who: replacement }, s.at, x.a)),
      /dispatch_runtime_revoked|bound_identity_mismatch/,
    )
    // claim first: the re-registration waits; the claim commits once; afterwards history is the owner's only
    const w2 = await world()
    const s2 = await started(w2)
    const p2 = await profileOf({ scope: accountScope(w2) })
    const y = await applied(w2, s2.at, p2)
    const replacement2 = await holding(async (k, h) => {
      await k.query('BEGIN')
      assert.equal((await claim(k, w2.who, s2.at, y.c)).sendPermitted, true)
      const rr = h.track(reRegister(w2, owner))
      await blockedBy(await pidOf(k), 'the re-registration behind the claim')
      await k.query('COMMIT')
      return rr
    })
    await bringUp(replacement2, [MDX])
    assert.match(
      await refusal(claim(owner, replacement2, s2.at, y.c)),
      /42501:dispatch_claim_refused$/,
      'T-C2-87: no history detail',
    )
    assert.match(
      await refusal(claim(owner, w2.who, s2.at, y.c)),
      /Runtime capability revoked/,
      'a revoked owner cannot replay',
    )
    const st = await boundStatus(owner, w2.projectId, y.r.reservationId) // T-C2-57: the migration owner reads the history
    assert.equal(st.claim?.runtimeId, (await identityOf(w2.projectId, y.r.reservationId)).runtime_id)
  })

  it('T-C2-47: a correct digest from a runtime whose STORED lease roles claim another emitter is refused at claim', async () => {
    const w = await world({
      roles: [
        { ...MD, executor: { execution: 'service', routeId: MD.route, executorArtifactDigest: H('another emitter') } },
      ],
    })
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const { c } = await applied(w, s.at, p)
    assert.match(await refusal(claim(owner, w.who, s.at, c)), /bound_emitter_identity_mismatch/)
    const native = await world({ roles: [MD] })
    const s2 = await started(native)
    const p2 = await profileOf({ scope: accountScope(native) })
    assert.match(
      await refusal(claim(owner, native.who, s2.at, (await applied(native, s2.at, p2)).c)),
      /bound_emitter_identity_mismatch/,
    )
  })

  it('T-C2-85/52/58: claimed, then a conflicting apply: contradicted, phase/owner kept; owner outcome; a retry is a new reservation', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    const cl = await claim(owner, w.who, s.at, x.c)
    const k = await apply(owner, w, s.at, { ...x.a, outbound_params_digest: H('late different commitment') })
    assert.deepEqual([k.conflict, k.phase], [true, 'claimed'])
    const st = await boundStatus(owner, w.projectId, x.r.reservationId)
    assert.deepEqual([st.phase, st.claim?.claimSeq, st.applyConflicted], ['claimed', cl.claimSeq, true])
    assert.equal((await statusOf(w, x.r.reservationId)).status, 'contradicted')
    const outcome = {
      project_id: w.projectId,
      reservation_id: x.r.reservationId,
      dispatch_id: x.a.dispatch_id,
      outcome_kind: 'sent' as const,
      evidence_digest: H('synthetic emitter evidence'),
      observed_at: '2026-11-16T06:00:00.000000Z',
    }
    const o = await runtimeBoundOutcome(owner, w.who, s.at, outcome)
    assert.deepEqual(await runtimeBoundOutcome(owner, w.who, s.at, outcome), { ...o, replay: true })
    const oc = await runtimeBoundOutcome(owner, w.who, s.at, { ...outcome, outcome_kind: 'send_error_before_response' })
    assert.equal(oc.conflict, true)
    assert.equal((await claim(owner, w.who, s.at, x.c)).sendPermitted, false, 'no resend after the outcome')
    // W3/W4: uncertain money stays uncertain; nothing in the bound releases it
    await service((c) =>
      runtimeResearchSettle(c, w.who, {
        ...s.at,
        reservationId: x.r.reservationId,
        outcome: 'uncertain',
        evidence: {
          contract: 'c1p_complete_report',
          report: 'not_complete',
          counts: {
            nonCachedInput: { class: 'unknown' },
            cacheRead: { class: 'unknown' },
            cacheWrite: { class: 'unknown' },
            output: { class: 'unknown' },
          },
          ending: 'stream_completed',
          responseId: { status: 'unknown' },
        },
      }),
    )
    assert.equal(
      (await one<{ s: string }>(`SELECT state AS s FROM sophia.research_reservations WHERE id=$1`, [x.r.reservationId]))
        .s,
      'uncertain',
    )
    // T-C2-58: a retry is a NEW reservation with its own dispatch; the prior claim and commitment are kept
    const retry = await applied(w, s.at, p, 'call-retry')
    assert.notEqual(retry.a.dispatch_id, x.a.dispatch_id)
    assert.equal((await claim(owner, w.who, s.at, retry.c)).sendPermitted, true)
    assert.equal(await countIn('research_bound_claims', w.projectId), 2)
    // the outcome is the claim owner's only
    const w2 = await world()
    const s2 = await started(w2)
    const y = await applied(w2, s2.at, await profileOf({ scope: accountScope(w2) }))
    assert.match(
      await refusal(
        runtimeBoundOutcome(owner, w2.who, s2.at, {
          ...outcome,
          project_id: w2.projectId,
          reservation_id: y.r.reservationId,
          dispatch_id: y.a.dispatch_id,
        }),
      ),
      /dispatch_outcome_refused/,
      'no claim: no outcome',
    )
  })
})

describe('K4 at the current 0112 settle (AS-FP02), money and the cause lineage', () => {
  it('T-C2-33/48 + Rule K: a known 17000 above b 16000 is a sticky contradiction and auto_hold; K2 17000 exact; K3 so_far UNK', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    await claim(owner, w.who, s.at, x.c)
    const funds0 = await allowanceOfTask(s.taskId)
    await settle(w.who, s.at, x.r.reservationId, { output: 17000 })
    const k = await rows<{ bound: number; observed_count: string }>(
      `SELECT bound, observed_count FROM sophia.research_bound_contradictions WHERE reservation_id=$1`,
      [x.r.reservationId],
    )
    assert.deepEqual(
      k.map((r) => [r.bound, Number(r.observed_count)]),
      [[16000, 17000]],
    )
    assert.equal(await stateOf(p), 'auto_hold')
    const ev = await one<{ kind: string; authority: string | null; cause: string }>(
      `SELECT event_kind AS kind, authority_id AS authority, cause_ref_digest AS cause FROM sophia.research_bound_profile_events
       WHERE profile_id=$1 AND event_kind='auto_hold'`,
      [p.profileId],
    )
    assert.deepEqual([ev.kind, ev.authority], ['auto_hold', null])
    assert.equal((await statusOf(w, x.r.reservationId)).status, 'contradicted')
    const afterSettle = await claim(owner, w.who, s.at, x.c) // T-C2-57: after settlement, history only
    assert.deepEqual([afterSettle.sendPermitted, afterSettle.replay], [false, true])
    // an auto_hold is terminal for new work; no unhold clears it
    assert.match(await refusal(reserve(w.who, s.at, 'after-k4', p)), /bound_profile_inactive/)
    // the same input again is a history replay: no new contradiction or event
    await settle(w.who, s.at, x.r.reservationId, { output: 17000 })
    assert.equal(await countIn('research_bound_contradictions', w.projectId), 1)
    // money moved exactly as the base settle does: reserved 0.1 released, spent 0.01 (no bound effect)
    const after1 = await allowanceOfTask(s.taskId)
    assert.equal(micro(after1.spent) - micro(funds0.spent), micro(0.01))
    // Rule K on the read model: K2 a valid (synthetically qualified) final 17000 is exact; K3 so_far 17000 is UNK
    const V = 50000
    const q = 3000
    const k2 = knowledge({
      finalTotal: { value: 17000, qualifiedFinality: true },
      q,
      bound: { b: 16000, status: 'contradicted' },
    })
    assert.deepEqual(effective(V, q, k2).effective, [36000, 36000])
    const k3 = knowledge({ soFar: 17000, q, bound: { b: 16000, status: 'contradicted' } })
    assert.deepEqual(effective(V, q, k3).effective, [null, 36000])
  })

  it('T-C2-63: a new revision after auto_hold needs its own authority and never launders the old dispatch or contradiction', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    await claim(owner, w.who, s.at, x.c)
    await settle(w.who, s.at, x.r.reservationId, { output: 17000 })
    const p2 = await profileOf({ scope: accountScope(w), profileId: p.profileId, revision: 2 })
    const r2 = await reserve(w.who, s.at, 'rev-2', p2)
    assert.equal(boundsOf(r2).profileRevision, '2')
    assert.equal(await stateOf(p), 'auto_hold')
    const old = await boundStatus(owner, w.projectId, x.r.reservationId)
    assert.equal(old.dimensions.find((d) => d.dimension === 'openai.output_tokens')!.status, 'contradicted')
    assert.equal(
      (
        await one<{ r: number }>(
          `SELECT profile_revision AS r FROM sophia.research_bound_dispatches WHERE reservation_id=$1`,
          [x.r.reservationId],
        )
      ).r,
      1,
    )
  })

  it('AS-FP02 order, genuine waits: the settle takes the profile row BEFORE the guard (a holder of either shows it)', async () => {
    // (1) a reserve-like holder of the profile row FOR SHARE: the K4 settle waits on the profile row, the guard still free
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    await settle(w.who, s.at, x.r.reservationId, { output: 4 }) // accepted; then a changed 17000 is a conflict AND K4
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      await holder.query(`${profileRow} FOR SHARE`, [p.profileId])
      let settlePid = 0
      const s1 = h.track(
        service(async (c) => {
          settlePid = await pidOf(c)
          return runtimeResearchSettle(c, w.who, complete(s.at, x.r.reservationId, { output: 17000 }))
        }),
      )
      const pid = await blockedBy(await pidOf(holder), 'the K4 settle behind a profile share holder')
      assert.equal(pid, settlePid)
      await waitingOn(pid, 'sophia.research_bound_profiles')
      assert.equal(
        await heldElsewhere(`${guardRow} FOR UPDATE NOWAIT`, [w.account]),
        false,
        'no guard lock yet: profile first',
      )
      await holder.query('COMMIT')
      await s1
    })
    assert.equal(await stateOf(p), 'auto_hold')
    assert.equal(
      await countIn('research_restriction_causes', w.projectId),
      1,
      'the 0112 cause writer recorded the conflict',
    )
    // (2) a certification-like holder of the guard: the K4 settle already holds the profile row while it waits for the guard
    const w2 = await world()
    const s2 = await started(w2)
    const p2 = await profileOf({ scope: accountScope(w2) })
    const y = await applied(w2, s2.at, p2)
    await settle(w2.who, s2.at, y.r.reservationId, { output: 4 })
    await holding(async (g, h) => {
      await g.query('BEGIN')
      await g.query(`${guardRow} FOR UPDATE`, [w2.account])
      const s3 = h.track(settle(w2.who, s2.at, y.r.reservationId, { output: 17000 }))
      const pid = await blockedBy(await pidOf(g), 'the K4 settle at the account guard')
      await waitingOn(pid, 'sophia.research_evidence_guards')
      assert.equal(
        await heldElsewhere(`${profileRow} FOR SHARE NOWAIT`, [p2.profileId]),
        true,
        'the profile row is already held',
      )
      await g.query('ROLLBACK')
      await s3
    })
    assert.equal(await stateOf(p2), 'auto_hold')
  })

  it('T-C2-38 + 0112 lineage: the opted and an otherwise identical base reservation move exactly the same money and causes', async () => {
    // Two identical worlds (one conflict restricts its account's guard, so each comparison gets its own account).
    const step = async (opted: boolean, n: number) => {
      const w = await world()
      const s = await started(w)
      const p = await profileOf({ scope: accountScope(w) })
      const a0 = await allowanceOfTask(s.taskId)
      const r = await reserve(w.who, s.at, `money-${String(n)}`, opted ? p : undefined)
      const a1 = await allowanceOfTask(s.taskId)
      await settle(w.who, s.at, r.reservationId, { output: 4 })
      const a2 = await allowanceOfTask(s.taskId)
      await settle(w.who, s.at, r.reservationId, { output: 17000 }) // a conflicting report: a 0112 cause, the guard
      const a3 = await allowanceOfTask(s.taskId)
      const history = async () =>
        Number(
          (
            await one<{ h: string }>(
              `SELECT history_count AS h FROM sophia.research_call_truth WHERE reservation_id=$1`,
              [r.reservationId],
            )
          ).h,
        )
      const h0 = await history()
      await settle(w.who, s.at, r.reservationId, { output: 17000 }) // the same input again: a history replay
      const replayAdded = (await history()) - h0
      return {
        reserve: micro(a1.reserved) - micro(a0.reserved),
        settleReserved: micro(a2.reserved) - micro(a1.reserved),
        settleSpent: micro(a2.spent) - micro(a1.spent),
        conflict: [
          micro(a3.spent) - micro(a2.spent),
          micro(a3.reserved) - micro(a2.reserved),
          micro(a3.uncertain) - micro(a2.uncertain),
        ],
        replayAdded,
        causes: (
          await rows<{ kind: string }>(
            `SELECT kind FROM sophia.research_restriction_causes WHERE account_id=$1 ORDER BY seq`,
            [w.account],
          )
        ).map((c) => c.kind),
        restricted: (
          await one<{ r: boolean }>(`SELECT restricted AS r FROM sophia.research_evidence_guards WHERE account_id=$1`, [
            w.account,
          ])
        ).r,
        truth: (
          await one<{ j: Record<string, unknown> }>(
            `SELECT to_jsonb(t)-'project_id'-'reservation_id'-'created_at'-'updated_at'-'first_conflict_at'-'digest'-'first_conflict_digest' AS j
             FROM sophia.research_call_truth t WHERE reservation_id=$1`,
            [r.reservationId],
          )
        ).j,
      }
    }
    const base = await step(false, 1)
    const opted = await step(true, 2)
    assert.deepEqual(opted, base, 'incremental money, truth, replay, 0112 cause and guard are identical (P02)')
    assert.deepEqual(
      [base.causes, base.restricted, base.replayAdded],
      [['conflict'], true, 0],
      'the 0112 cause writer and guard as before; an exact settle replay adds no history',
    )
  })

  it('T-C2-26/60/22: concurrent work on one account each gets its own dispatch; dispatch_count is a bound, never a count', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const [a, b] = await Promise.all([reserve(w.who, s.at, 'conc-a', p), reserve(w.who, s.at, 'conc-b', p)])
    assert.notEqual(boundsOf(a).dispatchId, boundsOf(b).dispatchId)
    const req = boundsOf(a).items.find((x) => x.dimension === 'openai.model_requests')!
    assert.deepEqual([req.bound, req.enforcementKind], ['1', 'dispatch_count'])
    const st = await statusOf(w, a.reservationId, 'openai.model_requests')
    assert.deepEqual([st.bound, st.status], ['1', 'authorized_not_applied'])
    assert.equal((await statusOf(w, a.reservationId, 'openai.input_tokens')).status, 'unsupported')
    const k = knowledge({ soFar: 0, q: 0, bound: { b: 1, status: 'qualified' } })
    assert.deepEqual([k.cLo, k.cHi], [0, 1], 'b 1 is an upper bound; no actual count 1 is claimed')
  })
})

describe('custody and privileges (T-C2-39/75/79)', () => {
  it('no application or worker role registers, moves, applies, claims or reads; authority is current at each action', async () => {
    const w = await world()
    const p = await profileOf({ scope: accountScope(w) })
    const denied: [string, string][] = [
      ['register', `SELECT sophia.register_research_bound_profile('{}'::jsonb)`],
      ['event', `SELECT sophia.record_research_bound_profile_event('{}'::jsonb)`],
      ['authority', `SELECT sophia.record_research_bound_authority('{}'::jsonb)`],
      ['claim', `SELECT sophia.runtime_research_bound_claim(NULL,NULL,NULL,NULL)`],
      ['status', `SELECT sophia.research_bound_status(NULL,NULL)`],
      ['table', `SELECT count(*) FROM sophia.research_bound_profiles`],
    ]
    for (const [name, sql] of denied)
      for (const pool of [api, worker]) assert.match(await refusal(pool.query(sql)), /42501:permission denied/, name)
    await revokeBoundAuthority(owner, p.out, 'synthetic revocation')
    assert.match(
      await refusal(recordBoundProfileEvent(owner, lifecycle(p, 'openai.output_tokens', p.out, 'hold'))),
      /bound_authority_refused/,
    )
    assert.equal(await stateOf(p), 'active', 'the revoked authority changed no derived knowledge')
  })
})

// =====================================================================================================================
// R1 (INC04-R07-C2-DIMENSION-BOUNDS-CORE-R1-001)

// --- R1 fixtures: governed late facts --------------------------------------------------------------------------------

/** Revokes the call's ORIGINAL runtime by a same-unit re-registration (0111): its native settle is then refused and the
 * governed late-fact operation is the writer. The world's caller `who` is revoked with it. */
async function revokeOriginal(w: World) {
  await registerContributionRuntime(owner, {
    projectId: w.projectId,
    connectionId: w.connectionId,
    runtimeUnitId: UNIT,
    tokenSha256: createHash('sha256').update(randomUUID(), 'utf8').digest(),
    rotate: false,
  })
}
const lateAuthority = async (w: World) =>
  (
    await recordResearchFinancialAuthority(owner, {
      version: 'research-authority-v1',
      authorityKey: `synthetic-${randomUUID()}`,
      kind: 'late_fact_attestation',
      scope: { accountId: w.account },
      approverRef: 'synthetic: owner approval fixture',
      verifierRef: 'synthetic: independent verifier fixture',
    })
  ).authorityId
/** The closed late-fact input: the call's original binding from its identity row, its resource's generation and fence. */
async function lateInput(
  w: World,
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
    [w.projectId, reservationId],
  )
  const fence = await one<{ id: string } | undefined>(
    `SELECT id FROM sophia.research_runtime_fences WHERE project_id=$1 AND resource_id=$2`,
    [w.projectId, i.resource_id],
  )
  const generation = (
    await one<{ g: string | null }>(`SELECT sophia.contribution_runtime_generation($1,$2) AS g`, [
      w.projectId,
      i.resource_id,
    ])
  ).g
  return {
    version: 'research-late-facts-v1',
    operationKey,
    projectId: w.projectId,
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
      fenceId: fence?.id ?? null,
      generation,
    },
    report,
    authorityId,
    evidenceRef: 'synthetic: late provider report fixture',
  }
}
const k4Of = async (reservationId: string) =>
  (
    await rows<{ bound: number; observed_count: string }>(
      `SELECT bound, observed_count FROM sophia.research_bound_contradictions WHERE reservation_id=$1 ORDER BY observed_count`,
      [reservationId],
    )
  ).map((r) => [r.bound, Number(r.observed_count)])
const autoHolds = async (p: Profile) =>
  rows<{ authority: string | null; cause: string }>(
    `SELECT authority_id AS authority, cause_ref_digest AS cause FROM sophia.research_bound_profile_events
     WHERE profile_id=$1 AND event_kind='auto_hold' ORDER BY event_seq`,
    [p.profileId],
  )
const lateOpsOf = async (reservationId: string) =>
  Number(
    (
      await one<{ n: string }>(
        `SELECT count(*) AS n FROM sophia.research_late_fact_operations WHERE reservation_id=$1`,
        [reservationId],
      )
    ).n,
  )
/** A late-fact operation on its own connection, its backend pid reported before it starts. */
const lateOn = (input: LateFactsInput, onPid: (pid: number) => void) =>
  onOwnConnection((c) => recordResearchLateFacts(c, input), onPid)
/** An opted call settled natively at 4 (accepted), then its original runtime revoked: a late 17000 conflicts AND is K4. */
async function settledThenRevoked() {
  const w = await world()
  const s = await started(w)
  const p = await profileOf({ scope: accountScope(w) })
  const r = await reserve(w.who, s.at, `late-${randomUUID().slice(0, 8)}`, p)
  await settle(w.who, s.at, r.reservationId, { output: 4 })
  await revokeOriginal(w)
  const input = await lateInput(w, r.reservationId, await lateAuthority(w), `late-${randomUUID()}`, {
    ...complete(s.at, r.reservationId, { output: 17000 }),
  })
  return { w, s, p, r, input }
}

describe('R1 T-C2-34 (K4 on late facts): the current 0112 late-fact writer with the same hook, before the first guard', () => {
  it('newly accepted late knowledge above the bound: one sticky contradiction and the terminal auto_hold; money and the 0112 operation as before; every repeat adds nothing', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    await claim(owner, w.who, s.at, x.c)
    await revokeOriginal(w)
    const funds0 = await allowanceOfTask(s.taskId)
    const input = await lateInput(
      w,
      x.r.reservationId,
      await lateAuthority(w),
      'late-k4-1',
      complete(s.at, x.r.reservationId, { output: 17000 }),
    )
    const res = await recordResearchLateFacts(owner, input)
    assert.deepEqual([res.disposition, res.replay, res.newCause], ['accepted', false, false])
    assert.deepEqual(await k4Of(x.r.reservationId), [[16000, 17000]])
    assert.equal(await stateOf(p), 'auto_hold', 'late knowledge never launders the cap')
    assert.deepEqual(await autoHolds(p), [{ authority: null, cause: res.factsDigest }])
    assert.deepEqual(await allowanceOfTask(s.taskId), funds0, 'late facts never move money')
    const st = await statusOf(w, x.r.reservationId)
    assert.deepEqual([st.status, st.reason], ['contradicted', 'bound_contradicted'])
    // the exact operation again: its stored result; another key with the same report: the writer's history replay
    assert.deepEqual(await recordResearchLateFacts(owner, input), res)
    const again = await recordResearchLateFacts(owner, { ...input, operationKey: 'late-k4-2' })
    assert.deepEqual([again.disposition, again.replay], ['accepted', true])
    // the same key naming another input: refused whole
    assert.match(
      await refusal(
        recordResearchLateFacts(owner, { ...input, report: complete(s.at, x.r.reservationId, { output: 18000 }) }),
      ),
      /names another input/,
    )
    assert.deepEqual(await k4Of(x.r.reservationId), [[16000, 17000]], 'no second contradiction')
    assert.equal((await autoHolds(p)).length, 1, 'no second auto_hold')
    assert.equal(await lateOpsOf(x.r.reservationId), 2)
    // Rule K stays: K2 a valid final 17000 is exact despite the contradicted bound; K3 so_far never caps
    const k2 = knowledge({
      finalTotal: { value: 17000, qualifiedFinality: true },
      q: 3000,
      bound: { b: 16000, status: 'contradicted' },
    })
    assert.deepEqual(effective(50000, 3000, k2).effective, [36000, 36000])
    const k3 = knowledge({ soFar: 17000, q: 3000, bound: { b: 16000, status: 'contradicted' } })
    assert.deepEqual(effective(50000, 3000, k3).effective, [null, 36000])
  })

  it('never from at-bound, unsupported-dimension, unopted, wrong-binding, malformed or unauthorized late facts; the matched valid input in the same world does', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const atBound = await reserve(w.who, s.at, 'adv-bound', p)
    const input = await reserve(w.who, s.at, 'adv-input', p)
    const unopted = await reserve(w.who, s.at, 'adv-unopted')
    await revokeOriginal(w)
    const auth = await lateAuthority(w)
    const revoked = await lateAuthority(w)
    await revokeResearchFinancialAuthority(owner, revoked, 'synthetic: revoked before use')
    const late = async (r: ReserveReply, key: string, o: { output?: number; input?: number }) =>
      lateInput(w, r.reservationId, auth, key, complete(s.at, r.reservationId, o))
    const record = async (i: Promise<LateFactsInput>) => (await recordResearchLateFacts(owner, await i)).disposition
    assert.equal(await record(late(atBound, 'adv-1', { output: 16000 })), 'accepted', 'a count equal to b')
    assert.equal(
      await record(late(input, 'adv-2', { output: 4, input: 900000 })),
      'accepted',
      'an unsupported input count',
    )
    assert.equal(await record(late(unopted, 'adv-3', { output: 17000 })), 'accepted', 'an unopted reservation')
    const good = await late(input, 'adv-4', { output: 17000 })
    const refused: [string, LateFactsInput, RegExp][] = [
      [
        'another generation',
        { ...good, expected: { ...good.expected, generation: H('another generation') } },
        /original generation/,
      ],
      ['another call', { ...good, expected: { ...good.expected, callId: 'another-call' } }, /original binding/],
      ['malformed', { ...good, report: { ...good.report, outcome: 'maybe' } }, /Invalid late-fact input/],
      ['a revoked authority', { ...good, authorityId: revoked }, /No operator authority/],
    ]
    for (const [name, bad, why] of refused) assert.match(await refusal(recordResearchLateFacts(owner, bad)), why, name)
    assert.equal(await countIn('research_bound_contradictions', w.projectId), 0)
    assert.deepEqual([await stateOf(p), (await autoHolds(p)).length], ['active', 0])
    assert.equal(
      (await statusOf(w, unopted.reservationId)).status,
      'unknown',
      'an unopted reservation has no bound rows',
    )
    // the matched positive: the valid input on the same reservation (a later, conflicting count) is K4
    const res = await recordResearchLateFacts(owner, good)
    assert.deepEqual([res.disposition, res.newCause], ['conflict', true])
    assert.deepEqual(await k4Of(input.reservationId), [[16000, 17000]])
    assert.equal(await stateOf(p), 'auto_hold')
  })

  it('a late count conflicting with a settled truth: K4 too, with the 0112 result, cause, guard and money exactly those of an unopted twin', async () => {
    const step = async (opted: boolean) => {
      const w = await world()
      const s = await started(w)
      const p = await profileOf({ scope: accountScope(w) })
      const r = await reserve(w.who, s.at, 'late-twin', opted ? p : undefined)
      await settle(w.who, s.at, r.reservationId, { output: 4 })
      await revokeOriginal(w)
      const funds0 = await allowanceOfTask(s.taskId)
      const report = complete(s.at, r.reservationId, { output: 17000 })
      const res = await recordResearchLateFacts(
        owner,
        await lateInput(w, r.reservationId, await lateAuthority(w), `twin-${randomUUID()}`, report),
      )
      return {
        common: {
          result: [res.disposition, res.replay, res.capped, res.newCause, res.reported, res.financial],
          moneyUnchanged: JSON.stringify(await allowanceOfTask(s.taskId)) === JSON.stringify(funds0),
          causes: (
            await rows<{ kind: string }>(
              `SELECT kind FROM sophia.research_restriction_causes WHERE account_id=$1 ORDER BY seq`,
              [w.account],
            )
          ).map((c) => c.kind),
          restricted: (
            await one<{ r: boolean }>(
              `SELECT restricted AS r FROM sophia.research_evidence_guards WHERE account_id=$1`,
              [w.account],
            )
          ).r,
        },
        bound: [await stateOf(p), await k4Of(r.reservationId)],
      }
    }
    const base = await step(false)
    const opted = await step(true)
    assert.deepEqual(opted.common, base.common, 'the 0112 late-fact semantics are unchanged by the hook')
    assert.deepEqual(base.common.result.slice(0, 4), ['conflict', false, false, true])
    assert.deepEqual(
      [base.common.moneyUnchanged, base.common.causes, base.common.restricted],
      [true, ['conflict'], true],
    )
    assert.deepEqual(base.bound, ['active', []], 'unopted: no bound rows')
    assert.deepEqual(opted.bound, ['auto_hold', [[16000, 17000]]])
  })

  it('genuine waits: the late writer takes the profile row BEFORE the first account guard lock (a holder of either shows it)', async () => {
    // (1) a holder of the profile row FOR SHARE: the late writer waits on it while the guard is still free
    const a = await settledThenRevoked()
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      await holder.query(`${profileRow} FOR SHARE`, [a.p.profileId])
      let latePid = 0
      const pending = h.track(lateOn(a.input, (pid) => (latePid = pid)))
      const pid = await blockedBy(await pidOf(holder), 'the late writer behind a profile share holder')
      assert.equal(pid, latePid)
      await waitingOn(pid, 'sophia.research_bound_profiles')
      assert.equal(await heldElsewhere(`${guardRow} FOR UPDATE NOWAIT`, [a.w.account]), false, 'no guard lock yet')
      await holder.query('COMMIT')
      assert.equal((await pending).disposition, 'conflict')
    })
    assert.equal(await stateOf(a.p), 'auto_hold')
    // (2) a holder of the account guard: the late writer waits on it with the profile row already held
    const b = await settledThenRevoked()
    await holding(async (g, h) => {
      await g.query('BEGIN')
      await g.query(`${guardRow} FOR UPDATE`, [b.w.account])
      let latePid = 0
      const pending = h.track(lateOn(b.input, (pid) => (latePid = pid)))
      const pid = await blockedBy(await pidOf(g), 'the late writer at the account guard')
      assert.equal(pid, latePid)
      await waitingOn(pid, 'sophia.research_evidence_guards')
      assert.equal(
        await heldElsewhere(`${profileRow} FOR SHARE NOWAIT`, [b.p.profileId]),
        true,
        'the profile row is held',
      )
      await g.query('ROLLBACK')
      assert.equal((await pending).disposition, 'conflict')
    })
    assert.equal(await stateOf(b.p), 'auto_hold')
  })
})

// --- R1 fixtures: design and source-review attempts on a shared lineage ---------------------------------------------

const REVIEW_ROUTE = 'source-review-luna-high-v1'
/**
 * LABELLED SYNTHETIC FIXTURE (the same as the 0109 evidence test's): a design (or source review) attempt on the runtime of
 * the research attempt `s`, sharing the research lineage's allowance (design) or an independent project allowance
 * (review), inserted by the migration owner with triggers off. It stands for a lineage maintained creation would reach
 * only through a published artifact; it is never a qualification.
 */
async function syntheticAttempt(
  w: World,
  s: { taskId: string; at: At },
  kind: 'design' | 'source_review',
): Promise<At> {
  const att = randomUUID()
  await holding(async (c) => {
    await c.query('BEGIN')
    await c.query('SET LOCAL session_replication_role = replica')
    const row = (
      await c.query<{
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
    ).rows[0]!
    const top = Number(
      (
        await c.query<{ m: string }>(`SELECT max(seq)::text AS m FROM sophia.runtime_commands WHERE runtime_id=$1`, [
          row.command.runtime_id,
        ])
      ).rows[0]!.m,
    )
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
          seq: Math.max(Number(row.command.seq) + 1000, top + 1),
        },
      ],
    )
    if (kind === 'design')
      await c.query(
        `INSERT INTO sophia.design_tasks(project_id,job_id,research_job_id,root_job_id,allowance_id,actor_id,artifact_id,base_version_id,markdown_sha256,
          language,targets,role,route) VALUES($1,$2,$3,$3,$4,$5,gen_random_uuid(),gen_random_uuid(),$6,'en','{w390-light}','sophia-html-designer-v1','research-sol-medium-v1')`,
        [w.projectId, job, s.taskId, row.allowance_id, w.REQ, 'a'.repeat(64)],
      )
    else await reviewInputs(c, w, row.goal_id, job)
    await c.query('COMMIT')
  })
  return { attemptId: att, nativeSessionId: `sophia-${att}` }
}
/** The review's manifest (its route) and its own project allowance through a work item of its goal (SYNTHETIC). */
async function reviewInputs(c: pg.ClientBase, w: World, goalId: string, job: string) {
  const manifest = randomUUID()
  await c.query(`INSERT INTO sophia.source_texts(project_id,source_id,body) VALUES($1,$2,$3)`, [
    w.projectId,
    manifest,
    JSON.stringify({ route: { id: REVIEW_ROUTE } }),
  ])
  await c.query(`UPDATE sophia.jobs SET input_source_id=$2 WHERE project_id=$1 AND id=$3`, [w.projectId, manifest, job])
  const allowance = await c.query<{ id: string }>(
    `INSERT INTO sophia.research_allowances(project_id,cap_usd,headroom_usd,source_policy,max_searches,max_reads)
     VALUES($1,0.5,0,'web-pilot-v1',0,0) RETURNING id`,
    [w.projectId],
  )
  await c.query(
    `INSERT INTO sophia.work_items(project_id,id,plan_id,plan_revision,execution_goal_id,allowance_id,accepted_by)
     VALUES($1,gen_random_uuid(),gen_random_uuid(),1,$2,$3,$4)`,
    [w.projectId, goalId, allowance.rows[0]!.id, w.REQ],
  )
}
const designReserve = (
  who: RuntimeCaller,
  at: At,
  callId: string,
  p?: { profileId: string; revision: string },
  extra = {},
) =>
  service((c) => runtimeDesignReserveWithBounds(c, who, reserveRequest(at, callId, p, extra))) as Promise<ReserveReply>
const REVIEW = { provider: 'openai-review', declared: { ...TRACKED.declared, routeId: REVIEW_ROUTE } }
const reviewReserve = (who: RuntimeCaller, at: At, callId: string, p?: { profileId: string; revision: string }) =>
  service((c) =>
    runtimeSourceReviewReserveWithBounds(c, who, reserveRequest(at, callId, p, REVIEW)),
  ) as Promise<ReserveReply>
const outBound = (r: ReserveReply) => boundsOf(r).items.find((x) => x.dimension === 'openai.output_tokens')!.bound
/** A gate refusal's maintained code (contribution_refuse), else the raw chain. */
async function refusedAs(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return contributionRefusalOf(err)?.refusal ?? chain(err)
  }
}
const reservationsOf = async (projectId: string) => countIn('research_reservations', projectId)

describe('R1 C02 shared lineage: the maintained funding binding before the account-scoped plan (research, design, review)', () => {
  it('design on a contributed lineage (no task of its own): the ORIGINAL account binds; its profile and account policy apply; same USD; stored replay after a policy change; legacy unchanged; K4 at its settle', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    await policyOf({ kind: 'account', ref: w.account }, 9000)
    const at = await syntheticAttempt(w, s, 'design')
    const a0 = await allowanceOfTask(s.taskId)
    const d = await designReserve(w.who, at, 'design-1', p)
    assert.equal(outBound(d), '9000', 'min(profile 16000, the original account policy 9000)')
    const disp = await one<{ account_id: string; grant_id: string }>(
      `SELECT account_id, grant_id FROM sophia.research_bound_dispatches WHERE reservation_id=$1`,
      [d.reservationId],
    )
    assert.deepEqual(
      [disp.account_id, disp.grant_id],
      [w.account, w.grantId],
      'the server binding, never a caller value',
    )
    const i = await one<{ payer: string; account_id: string; operation: string }>(
      `SELECT payer, account_id, operation FROM sophia.research_call_identities WHERE reservation_id=$1`,
      [d.reservationId],
    )
    assert.deepEqual([i.payer, i.account_id, i.operation], ['contributor_api_account', w.account, 'design'])
    const a1 = await allowanceOfTask(s.taskId)
    const legacy = await designReserve(w.who, at, 'design-legacy')
    assert.equal(legacy.binding?.bounds, undefined, 'without the opt-in the design reserve is unchanged')
    assert.equal(await countIn('research_bound_dispatches', w.projectId), 1)
    const a2 = await allowanceOfTask(s.taskId)
    assert.equal(
      micro(a1.reserved) - micro(a0.reserved),
      micro(a2.reserved) - micro(a1.reserved),
      'the same USD as unopted',
    )
    // a tighter account policy later: the exact replay returns the STORED bounds and reserves nothing more
    await policyOf({ kind: 'account', ref: w.account }, 7000)
    const again = await designReserve(w.who, at, 'design-1', p)
    assert.deepEqual([again.reservationId, boundsOf(again)], [d.reservationId, boundsOf(d)])
    assert.deepEqual(await allowanceOfTask(s.taskId), a2)
    assert.equal(outBound(await designReserve(w.who, at, 'design-2', p)), '7000', 'a new call takes the new policy')
    assert.match(await refusal(designReserve(w.who, at, 'design-1', { ...p, revision: '2' })), /23505/)
    // R2: the RESEARCH entry still refuses a design dispatch (it resolves the research scope only); the design entry's
    // own apply and claim are the R2 cases below
    assert.notEqual(await refusal(apply(owner, w, at, await applyFor(w, at, d))), 'resolved')
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
    // K4 at the design settle (the current 0112 settle through the design wrapper)
    await service((c) => runtimeDesignSettle(c, w.who, complete(at, d.reservationId, { output: 17000 })))
    assert.deepEqual(await k4Of(d.reservationId), [[9000, 17000]])
    assert.equal(await stateOf(p), 'auto_hold')
  })

  it('adverse: a foreign account or grant profile and a caller number refuse before any effect (no row, no USD); a foreign account policy never applies; the original grant scope does', async () => {
    const w = await world()
    const s = await started(w)
    const w2 = await world()
    const foreign = await profileOf({ scope: accountScope(w2) })
    const foreignGrant = await profileOf({ scope: { kind: 'grant', ref: w2.grantId } })
    await policyOf({ kind: 'account', ref: w2.account }, 100)
    const p = await profileOf({ scope: accountScope(w) })
    const own = await profileOf({ scope: { kind: 'grant', ref: w.grantId } })
    const at = await syntheticAttempt(w, s, 'design')
    const a0 = await allowanceOfTask(s.taskId)
    const n0 = await reservationsOf(w.projectId)
    assert.match(await refusal(designReserve(w.who, at, 'f-1', foreign)), /bound_profile_scope_mismatch/)
    assert.match(await refusal(designReserve(w.who, at, 'f-2', foreignGrant)), /bound_profile_scope_mismatch/)
    assert.match(await refusal(designReserve(w.who, at, 'f-3', p, { maxOutputTokens: 1 })), /bound_caller_supplied/)
    assert.match(
      await refusal(designReserve(w.who, at, 'f-4', p, { accountId: w2.account, bound: 1 })),
      /bound_caller_supplied/,
    )
    assert.deepEqual([await allowanceOfTask(s.taskId), await reservationsOf(w.projectId)], [a0, n0], 'no row, no USD')
    assert.equal(await countIn('research_bound_dispatches', w.projectId), 0)
    assert.equal(outBound(await designReserve(w.who, at, 'f-5', p)), '16000', 'another account policy never applies')
    assert.equal(outBound(await designReserve(w.who, at, 'f-6', own)), '16000', 'the original grant scope binds')
  })

  it('source review: a project-funded review binds a project profile on its own route; no account is assumed; an account-backed review stays refused before any effect, opted or not', async () => {
    const w = await world()
    const s = await started(w)
    const at = await syntheticAttempt(w, s, 'source_review')
    const route = { route: REVIEW_ROUTE, provider: 'openai-review' }
    const pp = await profileOf({ scope: { kind: 'project', ref: w.projectId }, ...route })
    const pa = await profileOf({ scope: accountScope(w), ...route })
    const pr = await profileOf({ scope: { kind: 'project', ref: w.projectId } })
    const v = await reviewReserve(w.who, at, 'v-1', pp)
    assert.equal(outBound(v), '16000')
    const i = await one<{ payer: string; route_id: string; operation: string }>(
      `SELECT payer, route_id, operation FROM sophia.research_call_identities WHERE reservation_id=$1`,
      [v.reservationId],
    )
    assert.deepEqual([i.payer, i.route_id, i.operation], ['project', REVIEW_ROUTE, 'source_review'])
    assert.equal(
      (
        await one<{ a: string | null }>(
          `SELECT account_id AS a FROM sophia.research_bound_dispatches WHERE reservation_id=$1`,
          [v.reservationId],
        )
      ).a,
      null,
    )
    assert.match(
      await refusal(reviewReserve(w.who, at, 'v-2', pa)),
      /bound_profile_scope_mismatch/,
      'no account assumed',
    )
    assert.match(await refusal(reviewReserve(w.who, at, 'v-3', pr)), /bound_route_mismatch/)
    assert.equal((await reviewReserve(w.who, at, 'v-legacy')).binding?.bounds, undefined, 'legacy review unchanged')
    // account-backed review (SYNTHETIC: the review allowance pointed at the contributed lineage's): refused, no effect
    const contributed = await allowanceOfTask(s.taskId)
    await owner.query(`UPDATE sophia.work_items SET allowance_id=$2 WHERE project_id=$1 AND allowance_id<>$2`, [
      w.projectId,
      contributed.id,
    ])
    const n0 = await reservationsOf(w.projectId)
    const d0 = await countIn('research_bound_dispatches', w.projectId)
    assert.equal(await refusedAs(reviewReserve(w.who, at, 'v-4', pp)), 'provider_not_contributed')
    assert.equal(await refusedAs(reviewReserve(w.who, at, 'v-5')), 'provider_not_contributed')
    assert.deepEqual(
      [await reservationsOf(w.projectId), await countIn('research_bound_dispatches', w.projectId)],
      [n0, d0],
    )
    assert.deepEqual(await allowanceOfTask(s.taskId), contributed, 'no USD')
  })
})

// --- R1 findings A and B (SAME review of 4ed) -------------------------------------------------------------------------

const policyEventOf = (
  pol: { policyId: string; auth: string },
  key: string,
  kind: 'activate' | 'revoke',
  evidence = 'synthetic evidence reference',
) => ({
  policy_id: pol.policyId,
  revision: '1',
  event_key: key,
  event_kind: kind,
  authority_id: pol.auth,
  approval_ref_digest: H('synthetic approval reference'),
  evidence_digest: H(evidence),
})
const policyRegistrationOf = (
  policyId: string,
  scope: { kind: 'project' | 'allowance' | 'account'; ref: string },
  cap: number,
  auth: string,
) => ({
  policy_id: policyId,
  revision: '1',
  scope_kind: scope.kind,
  scope_ref: scope.ref,
  dimension: 'openai.output_tokens' as const,
  unit: 'tokens' as const,
  cap: String(cap),
  authority_id: auth,
  approval_ref_digest: H('synthetic approval reference'),
  evidence_digest: H('synthetic evidence reference'),
})
const profileConflicts = async (p: Profile) =>
  Number(
    (
      await one<{ n: string }>(
        `SELECT count(*) AS n FROM sophia.research_bound_profile_conflicts WHERE profile_id=$1`,
        [p.profileId],
      )
    ).n,
  )

describe('R1 findings A and B: the stored first scope binds a conflict; any applicable policy conflict refuses (C02)', () => {
  it('A: an authority valid only for another scope, naming it, never poisons an existing revision; nor does its own authority naming another scope; a same-scope competitor still conflicts', async () => {
    const w = await world()
    const s = await started(w)
    const w2 = await world()
    const p = await profileOf({ scope: accountScope(w) })
    const b = await authorityFor(accountScope(w2), 'openai.output_tokens')
    const at = { profileId: p.profileId, revision: 1, dimension: 'openai.output_tokens' as const }
    const poison = registration(
      { ...at, scope: accountScope(w2), authorityId: b },
      { scope: accountScope(w2), ceiling: 1 },
    )
    assert.match(await refusal(registerBoundProfile(owner, poison)), /42501:bound_authority_refused/)
    assert.match(
      await refusal(registerBoundProfile(owner, { ...poison, authority_id: p.out })),
      /42501:bound_authority_refused/,
    )
    assert.deepEqual([await profileConflicts(p), await stateOf(p)], [0, 'active'], 'no conflict, no state change')
    assert.equal(outBound(await reserve(w.who, s.at, 'a-1', p)), '16000', 'the profile stays usable')
    // the same for a policy revision
    const pol = await policyOf({ kind: 'account', ref: w.account }, 9000)
    const bp = await authorityFor(accountScope(w2), 'openai.output_tokens')
    const poisonPolicy = policyRegistrationOf(pol.policyId, { kind: 'account', ref: w2.account }, 1, bp)
    assert.match(await refusal(registerBoundPolicy(owner, poisonPolicy)), /42501:bound_authority_refused/)
    assert.match(
      await refusal(registerBoundPolicy(owner, { ...poisonPolicy, authority_id: pol.auth })),
      /bound_authority_refused/,
    )
    assert.equal(await boundPolicyState(owner, pol.policyId, 1), 'active')
    assert.equal(outBound(await reserve(w.who, s.at, 'a-2', p)), '9000')
    // the matched positive: the same scope's authorized competitor IS the sticky conflict
    const r = await registerBoundProfile(
      owner,
      registration({ ...at, scope: accountScope(w), authorityId: p.out }, { scope: accountScope(w), ceiling: 8000 }),
    )
    assert.equal(r.conflict, true)
    assert.deepEqual([await profileConflicts(p), await stateOf(p)], [1, 'conflicted'])
    assert.match(await refusal(reserve(w.who, s.at, 'a-3', p)), /bound_profile_inactive/)
  })

  it("B: conflict then revoke, or revoke then conflict, of an applicable policy refuses reserve and claim (never the no-cap fallback); a conflict-free revoked one never caps; another scope's never reaches here", async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const pol = await policyOf({ kind: 'account', ref: w.account }, 9000)
    const x = await applied(w, s.at, p)
    assert.equal(boundsOf(x.r).items.find((i) => i.dimension === 'openai.output_tokens')!.bound, '9000')
    // order 1: an authorized conflicting activate under the same key, then a revoke (derived state: revoke)
    await recordBoundPolicyEvent(owner, policyEventOf(pol, 'activate-1', 'activate', 'competing evidence'))
    await recordBoundPolicyEvent(owner, policyEventOf(pol, 'revoke-1', 'revoke'))
    assert.equal(await boundPolicyState(owner, pol.policyId, 1), 'revoke')
    assert.match(await refusal(reserve(w.who, s.at, 'b-1', p)), /bound_policy_conflicted/)
    assert.match(await refusal(claim(owner, w.who, s.at, x.c)), /bound_policy_conflicted/, 'the claim too')
    // order 2 in another account: revoke first (conflict-free: no cap, no refusal; w's conflict is not applicable here)
    const w2 = await world()
    const s2 = await started(w2)
    const p2 = await profileOf({ scope: accountScope(w2) })
    const pol2 = await policyOf({ kind: 'account', ref: w2.account }, 9000)
    await recordBoundPolicyEvent(owner, policyEventOf(pol2, 'revoke-1', 'revoke'))
    assert.equal(outBound(await reserve(w2.who, s2.at, 'b-2', p2)), '16000', 'a revoked revision never caps')
    await recordBoundPolicyEvent(owner, policyEventOf(pol2, 'revoke-1', 'revoke', 'competing evidence'))
    assert.match(await refusal(reserve(w2.who, s2.at, 'b-3', p2)), /bound_policy_conflicted/, 'revoke then conflict')
    assert.equal(await countIn('research_bound_claims', w.projectId), 0)
  })
})

// --- R1 T-C2-75: CURRENT authority, real waits on the authority row in both orders -----------------------------------

type Subject = {
  auth: string
  act: (c: pg.Pool | pg.ClientBase, key: string) => Promise<Record<string, unknown>>
  count: () => Promise<number>
}
/** One manual action kind against a fresh synthetic target and a fresh authority of its exact scope and dimension. */
async function subject(
  kind: 'profile event' | 'policy event' | 'profile registration' | 'policy registration',
): Promise<Subject> {
  const scope = { kind: 'project' as const, ref: randomUUID() }
  const auth = await authorityFor(scope, 'openai.output_tokens')
  const countOf = (sql: string, id: string) => async () => Number((await one<{ n: string }>(sql, [id])).n)
  if (kind === 'profile event') {
    const p = await profileOf({ scope, requests: false })
    return {
      auth,
      act: (c, key) => recordBoundProfileEvent(c, lifecycle(p, 'openai.output_tokens', auth, 'hold', { key })),
      count: countOf(`SELECT count(*) AS n FROM sophia.research_bound_profile_events WHERE profile_id=$1`, p.profileId),
    }
  }
  if (kind === 'policy event') {
    const pol = await policyOf(scope, 9000, false)
    return {
      auth,
      act: (c, key) => recordBoundPolicyEvent(c, policyEventOf({ ...pol, auth }, key, 'activate')),
      count: countOf(`SELECT count(*) AS n FROM sophia.research_bound_policy_events WHERE policy_id=$1`, pol.policyId),
    }
  }
  const id = randomUUID()
  if (kind === 'profile registration')
    return {
      auth,
      act: (c, key) =>
        registerBoundProfile(
          c,
          registration(
            { profileId: id, revision: 1, dimension: 'openai.output_tokens', scope, authorityId: auth },
            { scope, model: key === 'k-1' ? 'gpt-6.1-sol' : `gpt-${key}` },
          ),
        ),
      count: countOf(`SELECT count(*) AS n FROM sophia.research_bound_profiles WHERE profile_id=$1`, id),
    }
  return {
    auth,
    act: (c, key) => registerBoundPolicy(c, policyRegistrationOf(id, scope, key === 'k-1' ? 9000 : 8000, auth)),
    count: countOf(`SELECT count(*) AS n FROM sophia.research_bound_policies WHERE policy_id=$1`, id),
  }
}
/** `first` takes the authority row on connection A and holds it; the other step runs on B and must wait on that row. */
const authorityRace = (x: Subject, first: 'revoke' | 'action') =>
  holding(async (a, h) => {
    await a.query('BEGIN')
    const receipt = first === 'action' ? await x.act(a, 'k-1') : null
    if (first === 'revoke') await revokeBoundAuthority(a, x.auth, 'synthetic: revoked first')
    let bPid = 0
    const step = (b: pg.PoolClient): Promise<unknown> =>
      first === 'revoke' ? x.act(b, 'k-1') : revokeBoundAuthority(b, x.auth, 'synthetic: revoked second')
    const second = h.track(refusal(onOwnConnection(step, (pid) => (bPid = pid))))
    assert.equal(await blockedBy(await pidOf(a), `the second step behind the ${first}`), bPid)
    await waitingOn(bPid, 'sophia.research_bound_authorities')
    await a.query('COMMIT')
    return { receipt, second: await second }
  })

describe('R1 T-C2-75: every manual action checks the CURRENT authority after its last wait (genuine waits, both orders)', () => {
  for (const kind of ['profile event', 'policy event', 'profile registration', 'policy registration'] as const)
    it(`${kind}: revoke first refuses the waiting action (no row, no conflict); action first keeps its one receipt and the revocation waits`, async () => {
      const r = await subject(kind)
      const n0 = await r.count()
      const refused = await authorityRace(r, 'revoke')
      assert.match(refused.second, /42501:bound_authority_refused/)
      assert.equal(await r.count(), n0, 'nothing written by the refused action')
      const k = await subject(kind)
      const k0 = await k.count()
      const kept = await authorityRace(k, 'action')
      assert.equal(kept.second, 'resolved', 'the revocation completes after the action commits')
      assert.equal(kept.receipt?.replay, false)
      assert.equal(await k.count(), k0 + 1, 'the one immutable receipt is kept')
      // after the revocation: the exact replay returns the stored receipt (never a new action); a new action is refused
      const replay = await k.act(owner, 'k-1')
      assert.deepEqual([replay.replay, replay.digest], [true, kept.receipt?.digest])
      assert.match(await refusal(k.act(owner, 'k-2')), /bound_authority_refused/)
      assert.equal(await k.count(), k0 + 1)
    })
})

describe('R1 F06 and F08: the canonical claim replay; the failure lifecycle of a holding test', () => {
  it('F06: after a claim only the SAME canonical payload is its no-send replay; a changed dispatch, runtime, generation or receipt is refused like a foreign caller', async () => {
    const w = await world()
    const s = await started(w)
    const p = await profileOf({ scope: accountScope(w) })
    const x = await applied(w, s.at, p)
    const first = await claim(owner, w.who, s.at, x.c)
    assert.equal(first.sendPermitted, true)
    const replay = await claim(owner, w.who, s.at, x.c)
    assert.deepEqual([replay.sendPermitted, replay.replay, replay.claimSeq], [false, true, first.claimSeq])
    const changed: [string, ClaimPayload][] = [
      ['dispatch', { ...x.c, dispatch_id: randomUUID() }],
      ['runtime', { ...x.c, runtime_id: randomUUID() }],
      ['generation', { ...x.c, original_generation: H('another generation') }],
      ['receipt', { ...x.c, apply_receipt_digest: H('another receipt') }],
    ]
    for (const [name, c] of changed)
      assert.match(await refusal(claim(owner, w.who, s.at, c)), /42501:dispatch_claim_refused$/, name)
    const st = await boundStatus(owner, w.projectId, x.r.reservationId)
    assert.deepEqual([st.phase, st.claim?.claimSeq], ['claimed', first.claimSeq], 'row, phase and order unchanged')
    assert.equal(await countIn('research_bound_claims', w.projectId), 1)
  })

  it('F08: a controlled failure after a lock, a waiting operation and an open gate releases all of them, stays the visible failure, and the next positive works', async () => {
    const p = await profileOf({ scope: { kind: 'project', ref: randomUUID() }, requests: false })
    let waiterPid = 0
    let waiterEnded = false
    let waiter: Promise<unknown> = Promise.resolve()
    const failed = holding(async (holder, h) => {
      await holder.query('BEGIN')
      await holder.query(`${profileRow} FOR UPDATE`, [p.profileId])
      waiter = h.track(
        onOwnConnection(
          (c) => c.query(`${profileRow} FOR SHARE`, [p.profileId]),
          (pid) => (waiterPid = pid),
        ).then(() => (waiterEnded = true)),
      )
      h.gate() // left closed by the body on purpose
      assert.equal(await blockedBy(await pidOf(holder), 'the waiter behind the controlled holder'), waiterPid)
      throw new Error('controlled primary failure')
    })
    await assert.rejects(failed, /controlled primary failure/)
    await waiter
    assert.equal(waiterEnded, true, 'the started operation ended before the holder returned')
    assert.equal(await heldElsewhere(`${profileRow} FOR UPDATE NOWAIT`, [p.profileId]), false, 'no lock left behind')
    const open = await one<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%'`,
    )
    assert.equal(Number(open.n), 0, 'no open transaction left behind')
    await recordBoundProfileEvent(owner, lifecycle(p, 'openai.output_tokens', p.out, 'hold'))
    assert.equal(await stateOf(p), 'held', 'the next positive works')
  })
})

// --- R2 (C2R1B-F01): the design and source-review dispatch through their own maintained scope ------------------------

/** The synthetic review executor the runtime REPORTS for the review route (consistency only, never G-PROFILE). */
const REVIEWX: RuntimeRole = {
  id: 'sophia-source-review-v1',
  route: REVIEW_ROUTE,
  presetDigest: 'sha256:review',
  executor: { execution: 'service', routeId: REVIEW_ROUTE, executorArtifactDigest: EMITTER },
}
const applyOp = (
  op: BoundOperation,
  who: RuntimeCaller,
  at: At,
  a: ApplyPayload,
  db0: pg.Pool | pg.ClientBase = owner,
) => runtimeBoundApplyFor(db0, op, who, at, a)
const claimOp = (
  op: BoundOperation,
  who: RuntimeCaller,
  at: At,
  c: ClaimPayload,
  db0: pg.Pool | pg.ClientBase = owner,
) => runtimeBoundClaimFor(db0, op, who, at, c)
/** The money of the reservation's OWN allowance (the shared lineage's for design, the work item's for review). */
const fundsOf = (projectId: string, reservationId: string) =>
  one<{ id: string; spent: string; uncertain: string; reserved: string }>(
    `SELECT a.id, a.spent_usd::text AS spent, a.uncertain_usd::text AS uncertain, a.reserved_usd::text AS reserved
     FROM sophia.research_call_identities i JOIN sophia.research_allowances a ON a.project_id=i.project_id AND a.id=i.allowance_id
     WHERE i.project_id=$1 AND i.reservation_id=$2`,
    [projectId, reservationId],
  )
/** The immutable lineage of a dispatch: its identity row and its original funding, runtime and generation. */
const lineageOf = (projectId: string, reservationId: string) =>
  one<Record<string, unknown>>(
    `SELECT i.operation, i.payer, i.account_id, i.allowance_id, i.attempt_id, i.runtime_id, i.call_id, d.account_id AS d_account,
       d.grant_id AS d_grant, d.original_runtime_id, d.original_generation, d.route_id, d.provider
     FROM sophia.research_call_identities i JOIN sophia.research_bound_dispatches d ON d.project_id=i.project_id AND d.reservation_id=i.reservation_id
     WHERE i.project_id=$1 AND i.reservation_id=$2`,
    [projectId, reservationId],
  )
const outcomeOf = (projectId: string, reservationId: string, dispatchId: string) => ({
  project_id: projectId,
  reservation_id: reservationId,
  dispatch_id: dispatchId,
  outcome_kind: 'sent' as const,
  evidence_digest: H('synthetic emitter evidence'),
  observed_at: '2026-11-16T06:00:00.000000Z',
})
/** A contributed design attempt on the research lineage with an account profile and policy. */
async function designWorld() {
  const w = await world()
  const s = await started(w)
  const p = await profileOf({ scope: accountScope(w) })
  await policyOf({ kind: 'account', ref: w.account }, 9000)
  const at = await syntheticAttempt(w, s, 'design')
  return { w, s, p, at }
}
/**
 * A project-funded source review on its own route, on the PROJECT (legacy) runtime that REPORTS the review executor (the
 * maintained contribution-runtime hello keeps only the roles its account covers, so a project-funded review is on the
 * project's runtime). Its lineage is a project-funded research task on that runtime.
 */
async function reviewWorld() {
  const w = await world({ legacyRoles: [MD, REVIEWX] })
  const s = await projectFunded(w)
  const p = await profileOf({
    scope: { kind: 'project', ref: w.projectId },
    route: REVIEW_ROUTE,
    provider: 'openai-review',
  })
  const at = await syntheticAttempt(w, s, 'source_review')
  return { w, s, p, at, who: w.legacy }
}
const REVIEW_APPLY = { provider: 'openai-review' }

describe('R2 C2R1B-F01: design and source-review apply and claim through their OWN maintained scope and post-wait fence', () => {
  it('design (contributed lineage): reserve -> expected-preimage apply -> exactly one claim; replays are history; the other entries refuse; money and the original account/grant unchanged; owner outcome', async () => {
    const { w, s, p, at } = await designWorld()
    const d = await designReserve(w.who, at, 'r2-design', p)
    assert.equal(outBound(d), '9000')
    const lineage0 = await lineageOf(w.projectId, d.reservationId)
    const funds0 = await fundsOf(w.projectId, d.reservationId)
    assert.equal(funds0.id, (await allowanceOfTask(s.taskId)).id, 'the shared lineage allowance')
    const a = await applyFor(w, at, d)
    // the research and review entries resolve their own scope: a design attempt is neither
    assert.notEqual(await refusal(apply(owner, w, at, a)), 'resolved', 'the research entry')
    assert.notEqual(await refusal(applyOp('source_review', w.who, at, a)), 'resolved', 'the review entry')
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
    const receipt = await applyOp('design', w.who, at, a)
    assert.deepEqual([receipt.phase, receipt.sendPermitted, receipt.replay], ['applied', false, false])
    assert.equal(receipt.applyReceiptDigest, digestOf('sophia.c2.dispatch.apply.v1', Object.values(a)))
    const again = await applyOp('design', w.who, at, a)
    assert.deepEqual(
      [again.applyReceiptDigest, again.replay, again.sendPermitted],
      [receipt.applyReceiptDigest, true, false],
    )
    const c = claimFor(a, receipt.applyReceiptDigest)
    assert.notEqual(await refusal(claim(owner, w.who, at, c)), 'resolved', 'the research entry never claims it')
    // two concurrent design claims: exactly one permission, the loser waits and reads history
    let sends = 0
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      const first = await claimOp('design', w.who, at, c, holder)
      if (first.sendPermitted) sends++
      const second = h.track(claimOp('design', w.who, at, c))
      await blockedBy(await pidOf(holder), 'the second design claim')
      await holder.query('COMMIT')
      const lost = await second
      if (lost.sendPermitted) sends++
      assert.deepEqual([first.sendPermitted, lost.sendPermitted, lost.replay], [true, false, true])
    })
    const replay = await claimOp('design', w.who, at, c)
    if (replay.sendPermitted) sends++
    assert.equal(sends, 1, 'total send permissions <= 1')
    assert.equal(await countIn('research_bound_claims', w.projectId), 1)
    const late = await applyOp('design', w.who, at, a)
    assert.deepEqual([late.phase, late.replay, late.sendPermitted], ['claimed', true, false])
    // money and lineage: apply and claim never move money; the original account and grant stay bound
    assert.deepEqual(await fundsOf(w.projectId, d.reservationId), funds0)
    const lineage1 = await lineageOf(w.projectId, d.reservationId)
    assert.deepEqual(lineage1, lineage0)
    assert.deepEqual(
      [lineage1.operation, lineage1.payer, lineage1.d_account, lineage1.d_grant],
      ['design', 'contributor_api_account', w.account, w.grantId],
    )
    // the outcome is the design claim owner's, through the design entry only
    const outcome = outcomeOf(w.projectId, d.reservationId, a.dispatch_id)
    assert.notEqual(await refusal(runtimeBoundOutcome(owner, w.who, at, outcome)), 'resolved', 'the research entry')
    const o = await runtimeBoundOutcomeFor(owner, 'design', w.who, at, outcome)
    assert.deepEqual(await runtimeBoundOutcomeFor(owner, 'design', w.who, at, outcome), { ...o, replay: true })
    assert.equal((await boundStatus(owner, w.projectId, d.reservationId)).phase, 'claimed')
  })

  it('design adverse: foreign identity, binding, runtime, generation, receipt and changed payloads refuse with no row and no send', async () => {
    const { w, s, p, at } = await designWorld()
    const d = await designReserve(w.who, at, 'r2-design-adverse', p)
    const a = await applyFor(w, at, d)
    const research = await reserve(w.who, s.at, 'r2-research-sibling', p)
    const ar = await applyFor(w, s.at, research)
    // another operation's reservation on the SAME shared allowance: the design scope's attempt is not its identity
    assert.match(await refusal(applyOp('design', w.who, at, ar)), /42501:bound_identity_mismatch/)
    // the research attempt through the design entry: not a design attempt (the maintained design scope refuses)
    assert.match(await refusal(applyOp('design', w.who, s.at, a)), /42501:Design operation names an attempt/)
    // another design binding on the same lineage cannot apply this reservation
    const other = await syntheticAttempt(w, s, 'design')
    assert.match(await refusal(applyOp('design', w.who, other, a)), /42501:bound_identity_mismatch/)
    // another project's caller
    const wo = await world()
    const pf = await projectFunded(wo)
    assert.notEqual(await refusal(applyOp('design', wo.legacy, pf.at, a)), 'resolved')
    assert.match(
      await refusal(applyOp('design', w.who, at, { ...a, runtime_id: randomUUID() })),
      /bound_identity_mismatch/,
    )
    assert.match(
      await refusal(applyOp('design', w.who, at, { ...a, call_id: 'another-call' })),
      /bound_identity_mismatch/,
    )
    for (const o of [{ generation: H('another generation') }, { emitter: H('another emitter') }, { bound: '9001' }])
      assert.match(
        await refusal(applyOp('design', w.who, at, await applyFor(w, at, d, o))),
        /bound_param_mismatch/,
        JSON.stringify(o),
      )
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
    const receipt = await applyOp('design', w.who, at, a)
    const c = claimFor(a, receipt.applyReceiptDigest as string)
    assert.match(
      await refusal(claimOp('design', w.who, at, { ...c, apply_receipt_digest: H('another receipt') })),
      /bound_param_mismatch/,
    )
    assert.match(
      await refusal(claimOp('design', w.who, at, { ...c, runtime_id: randomUUID() })),
      /bound_identity_mismatch/,
    )
    assert.match(await refusal(claimOp('design', w.who, other, c)), /42501:bound_identity_mismatch/)
    assert.equal(await countIn('research_bound_claims', w.projectId), 0)
    const first = await claimOp('design', w.who, at, c)
    assert.equal(first.sendPermitted, true)
    for (const [name, x] of [
      ['dispatch', { ...c, dispatch_id: randomUUID() }],
      ['runtime', { ...c, runtime_id: randomUUID() }],
      ['generation', { ...c, original_generation: H('another generation') }],
      ['receipt', { ...c, apply_receipt_digest: H('another receipt') }],
    ] as const)
      assert.match(await refusal(claimOp('design', w.who, at, x)), /42501:dispatch_claim_refused$/, name)
    assert.deepEqual(
      [(await claimOp('design', w.who, at, c)).sendPermitted, await countIn('research_bound_claims', w.projectId)],
      [false, 1],
    )
  })

  it('design post-wait fence (the ACTUAL admit_goal_command under the design scope): Stop first refuses the claim; claim first keeps may-have-sent; a hold refuses the first apply', async () => {
    const { w, at, p } = await designWorld()
    const d = await designReserve(w.who, at, 'r2-design-stop', p)
    const a = await applyFor(w, at, d)
    const receipt = await applyOp('design', w.who, at, a)
    const c = claimFor(a, receipt.applyReceiptDigest as string)
    const funds0 = await fundsOf(w.projectId, d.reservationId)
    await holding(async (_unused, h) => {
      const g = h.gate()
      const admitted = h.gate()
      let stopPid = 0
      const stop = h.track(
        goalCommand(w, at.attemptId, 'stop', {
          gate: g.gate,
          onPid: (pid) => (stopPid = pid),
          onAdmitted: admitted.release,
        }),
      )
      await Promise.race([admitted.gate, stop])
      const waiting = h.track(refusal(claimOp('design', w.who, at, c)))
      await blockedBy(stopPid, 'the design claim behind the Stop')
      g.release()
      await stop
      assert.match(await waiting, /40001:Design work is not active/)
    })
    assert.equal((await boundStatus(owner, w.projectId, d.reservationId)).phase, 'applied', 'never sendable')
    assert.equal(await countIn('research_bound_claims', w.projectId), 0)
    assert.deepEqual(await fundsOf(w.projectId, d.reservationId), funds0)
    // claim first: the Stop waits; the claim commits its one permission
    const y = await designWorld()
    const dy = await designReserve(y.w.who, y.at, 'r2-design-first', y.p)
    const ay = await applyFor(y.w, y.at, dy)
    const cy = claimFor(ay, (await applyOp('design', y.w.who, y.at, ay)).applyReceiptDigest as string)
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      assert.equal((await claimOp('design', y.w.who, y.at, cy, holder)).sendPermitted, true)
      const named = h.gate()
      let stopPid = 0
      const stop = h.track(
        goalCommand(y.w, y.at.attemptId, 'stop', {
          onPid: (pid) => {
            stopPid = pid
            named.release()
          },
        }),
      )
      await named.gate
      assert.equal(await blockedBy(await pidOf(holder), 'the Stop behind the design claim'), stopPid)
      await holder.query('COMMIT')
      await stop
    })
    assert.equal((await boundStatus(owner, y.w.projectId, dy.reservationId)).phase, 'claimed', 'may-have-sent kept')
    // a hold before the first apply refuses it under the design scope
    const z = await designWorld()
    const dz = await designReserve(z.w.who, z.at, 'r2-design-hold', z.p)
    const az = await applyFor(z.w, z.at, dz)
    await goalCommand(z.w, z.at.attemptId, 'hold')
    assert.match(await refusal(applyOp('design', z.w.who, z.at, az)), /40001:Design work is not active/)
    assert.equal(await countIn('research_bound_applications', z.w.projectId), 0)
  })

  it('source review (project-funded, its own route and allowance): reserve -> apply -> exactly one claim; replays are history; the other entries refuse; money unchanged; no account; owner outcome', async () => {
    const { w, s, p, at, who } = await reviewWorld()
    const v = await reviewReserve(who, at, 'r2-review', p)
    assert.equal(outBound(v), '16000')
    const lineage0 = await lineageOf(w.projectId, v.reservationId)
    const funds0 = await fundsOf(w.projectId, v.reservationId)
    assert.notEqual(funds0.id, (await allowanceOfTask(s.taskId)).id, 'the review work item allowance, not the lineage')
    const a = await applyFor(w, at, v, REVIEW_APPLY)
    assert.notEqual(await refusal(apply(owner, w, at, a)), 'resolved', 'the research entry')
    assert.notEqual(await refusal(applyOp('design', who, at, a)), 'resolved', 'the design entry')
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
    const receipt = await applyOp('source_review', who, at, a)
    assert.deepEqual([receipt.phase, receipt.sendPermitted, receipt.replay], ['applied', false, false])
    assert.equal((await applyOp('source_review', who, at, a)).applyReceiptDigest, receipt.applyReceiptDigest)
    const c = claimFor(a, receipt.applyReceiptDigest as string)
    assert.notEqual(await refusal(claimOp('design', who, at, c)), 'resolved', 'the design entry never claims it')
    const first = await claimOp('source_review', who, at, c)
    const replay = await claimOp('source_review', who, at, c)
    assert.deepEqual(
      [first.sendPermitted, replay.sendPermitted, replay.replay, replay.claimSeq],
      [true, false, true, first.claimSeq],
    )
    assert.match(
      await refusal(claimOp('source_review', who, at, { ...c, apply_receipt_digest: H('another receipt') })),
      /42501:dispatch_claim_refused$/,
    )
    assert.equal(await countIn('research_bound_claims', w.projectId), 1)
    assert.deepEqual(await fundsOf(w.projectId, v.reservationId), funds0)
    const lineage1 = await lineageOf(w.projectId, v.reservationId)
    assert.deepEqual(lineage1, lineage0)
    assert.deepEqual(
      [lineage1.operation, lineage1.payer, lineage1.d_account, lineage1.d_grant, lineage1.route_id],
      ['source_review', 'project', null, null, REVIEW_ROUTE],
    )
    const outcome = outcomeOf(w.projectId, v.reservationId, a.dispatch_id)
    assert.notEqual(await refusal(runtimeBoundOutcomeFor(owner, 'design', who, at, outcome)), 'resolved')
    const o = await runtimeBoundOutcomeFor(owner, 'source_review', who, at, outcome)
    assert.deepEqual(await runtimeBoundOutcomeFor(owner, 'source_review', who, at, outcome), { ...o, replay: true })
  })

  it('source review adverse and post-wait fence: a design reservation, another runtime, generation or receipt refuse; Stop first refuses the claim under the review scope; a profile revoke first refuses it', async () => {
    const { w, s, p, at, who } = await reviewWorld()
    const v = await reviewReserve(who, at, 'r2-review-adverse', p)
    const a = await applyFor(w, at, v, REVIEW_APPLY)
    // a design reservation in the same project through the review entry: its allowance and attempt are not the review's
    const dp = await profileOf({ scope: { kind: 'project', ref: w.projectId } })
    const dat = await syntheticAttempt(w, s, 'design')
    const d = await designReserve(who, dat, 'r2-design-in-review', dp)
    assert.match(
      await refusal(applyOp('source_review', who, at, await applyFor(w, dat, d))),
      /42501:bound_identity_mismatch/,
    )
    assert.match(
      await refusal(applyOp('source_review', who, dat, a)),
      /42501:Review operation names an attempt that is not a source review/,
    )
    assert.match(
      await refusal(applyOp('source_review', who, at, { ...a, runtime_id: randomUUID() })),
      /bound_identity_mismatch/,
    )
    assert.match(
      await refusal(
        applyOp('source_review', who, at, await applyFor(w, at, v, { ...REVIEW_APPLY, generation: H('g') })),
      ),
      /bound_param_mismatch/,
    )
    assert.match(
      await refusal(applyOp('source_review', who, at, await applyFor(w, at, v))),
      /bound_param_mismatch/,
      'the research provider is not the review preimage',
    )
    assert.equal(await countIn('research_bound_applications', w.projectId), 0)
    const c = claimFor(a, (await applyOp('source_review', who, at, a)).applyReceiptDigest as string)
    assert.match(
      await refusal(claimOp('source_review', who, at, { ...c, apply_receipt_digest: H('another receipt') })),
      /bound_param_mismatch/,
    )
    const funds0 = await fundsOf(w.projectId, v.reservationId)
    // Stop first under the review scope
    await holding(async (_unused, h) => {
      const g = h.gate()
      const admitted = h.gate()
      let stopPid = 0
      const stop = h.track(
        goalCommand(w, at.attemptId, 'stop', {
          gate: g.gate,
          onPid: (pid) => (stopPid = pid),
          onAdmitted: admitted.release,
        }),
      )
      await Promise.race([admitted.gate, stop])
      const waiting = h.track(refusal(claimOp('source_review', who, at, c)))
      await blockedBy(stopPid, 'the review claim behind the Stop')
      g.release()
      await stop
      assert.match(await waiting, /40001:The review is not active/)
    })
    assert.equal((await boundStatus(owner, w.projectId, v.reservationId)).phase, 'applied', 'never sendable')
    assert.equal(await countIn('research_bound_claims', w.projectId), 0)
    assert.deepEqual(await fundsOf(w.projectId, v.reservationId), funds0)
    // a profile revoke first: the review claim waits on the profile row, then refuses
    const y = await reviewWorld()
    const vy = await reviewReserve(y.who, y.at, 'r2-review-revoke', y.p)
    const ay = await applyFor(y.w, y.at, vy, REVIEW_APPLY)
    const cy = claimFor(ay, (await applyOp('source_review', y.who, y.at, ay)).applyReceiptDigest as string)
    await holding(async (holder, h) => {
      await holder.query('BEGIN')
      await recordBoundProfileEvent(holder, lifecycle(y.p, 'openai.output_tokens', y.p.out, 'revoke'))
      const waiting = h.track(refusal(claimOp('source_review', y.who, y.at, cy)))
      const pid = await blockedBy(await pidOf(holder), 'the review claim behind the revoke')
      await waitingOn(pid, 'sophia.research_bound_profiles')
      await holder.query('COMMIT')
      assert.match(await waiting, /dispatch_profile_inactive/)
    })
    assert.equal(await countIn('research_bound_claims', y.w.projectId), 0)
  })
})
