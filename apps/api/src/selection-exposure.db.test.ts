// INC04-R07 C4/C5 W1 (0114): capacity-exposure custody crossing the real selection preview, through buildApp with a
// verified token, the production API role and real PostgreSQL. Level: sql-run.
// * The worked partial reflection (Root86): one registered remaining_at window V 800, one in-scope model effect with a
//   qualified final total c 1000, an issuer-qualified attribution q on each new reading. q 400, 800 and 1000 keep the
//   candidate as 0107 maps it; q removed is capacity_unproven; q 0 (proven over by 200) and q 200 (zero headroom) are
//   the kernel's capacity_exhausted (unavailable_now). The private numbers are asserted only through the server-internal
//   snapshot and the adapter; HTTP and logs never carry them. A consumed_in_window binding of the same reading: S 1000,
//   U 8000 unchanged; S above V unproven.
// * Restrictive: an unattributed effect of ANOTHER project on the same account, a conflicted truth history, a revoked
//   binding (never the never-bound fallback).
// * B1 (Root88): an account ledger reservation (0094) with no call identity, in the same or ANOTHER project, makes the
//   effect set unrepresented: capacity_unproven, never available or 0. A ledger row of another account, or of a search
//   reservation, changes nothing (the q 400 positive stays available).
// * W1-F01 (Root89): a mapping whose issuer belongs to a SEPARATE scope counts while that scope holds (a mapped so-far
//   count proves over: capacity_exhausted) and, once that scope conflicts, is restrictive (capacity_unproven, the count
//   unresolved), while the bound window's own scope stays valid; a new mapping by that issuer is refused.
// * W1-F02 (Root89): a current 0107 witness that is already exhausted (capacity_exhausted off) stays capacity_exhausted
//   on, under missing q and under a revoked binding: uncertainty never discards the stronger existing refusal.
// * The switch: off is byte-identical to 0107 on the same database; on without 0114 (or with an older helper without
//   the key, or with either marker removed) answers projection_unavailable, never an unprojected pool.
// * Membership: a viewer is restricted even when the exposure helper faults (it is never reached for them); nonmember
//   404; no token 401; a non-owner editor sees no owner code; the API role cannot execute the helper. Previews write
//   nothing (ledgers, reservations, claims, custody).
// Every account, grant, qualification, reading, scope, window, issuer, binding, mapping, attribution, finality,
// reservation, identity and token is SYNTHETIC; nothing here qualifies a real owner, account, route, provider, issuer,
// clock or mapping, or passes an AC-04 case. Reservation, identity, truth and history rows are written as the owner with
// replication-role triggers suspended in their own fixture transaction: their foreign-key targets are outside this
// slice's declaration grant; the production helper reads only the granted tables. B1's contribution-task and ledger rows
// (0094, declarations read under Root88) are written in the same kind of transaction against the REAL account,
// connection and grant of their project; only their job reference (sophia.jobs, a further hop whose declaration is not
// granted) is left without a row, and the test asserts that every other reference resolves.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeRole } from '@sophia/contracts'
import { parseSelectionView } from '@sophia/contracts/validate'
import {
  appendCapacityAttribution,
  appendCapacityFinality,
  bindCapacityObservation,
  CapacityCustodyRefused,
  createPool,
  migrate,
  readSelectionSnapshot,
  recordCapacityObservation,
  recordRuntimeReady,
  registerCapacityIssuer,
  registerCapacityMapping,
  registerCapacityScope,
  registerCapacityWindow,
  revokeCapacityBinding,
  runtimeHello,
  runtimeTokenHash,
  withActor,
  withService,
  type CapacityObservationInput,
  type RuntimeCaller,
} from '@sophia/persistence'
import {
  createEmptyDatabase,
  createTestDatabase,
  seedProject,
  withClusterMigrationLock,
  type EmptyDatabase,
  type TestDatabase,
} from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { exposureEffect } from './selection-exposure.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER_URL = 'https://synthetic.supabase.test/auth/v1'
const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER_URL)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
const verifyActor = createActorVerifier({ issuer: ISSUER_URL, audience: 'authenticated', secret: SECRET })
const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const RESTRICTED = {
  contract: 'inc04.selection.input.v1',
  policyVersion: 'inc04-s01-policy-v1',
  disclosure: 'restricted',
}
/** The tables a preview could touch: none may change. */
const UNTOUCHED = [
  'commands',
  'outbox',
  'project_events',
  'jobs',
  'research_allowances',
  'research_reservations',
  'research_call_identities',
  'research_call_truth',
  'research_call_history',
  'api_contribution_tasks',
  'api_contribution_reservations',
  'api_contribution_claims',
  'capacity_observations',
  'capacity_exposure_scopes',
  'capacity_window_registrations',
  'capacity_exposure_issuers',
  'capacity_observation_bindings',
  'capacity_binding_revocations',
  'capacity_dimension_mappings',
  'capacity_attributions',
  'capacity_effect_finality',
  'capacity_exposure_conflicts',
]
/** The kernel's own codes for a capacity outcome (owner-only), and nothing else W1 may cause. */
const KERNEL_CODE = /^[a-z][a-z_]*$/

/** No private value, and no private field name, in any text that left the server (bodies, logs). */
function noLeak(texts: readonly string[], secrets: readonly string[]) {
  for (const text of texts) {
    for (const secret of secrets) assert.equal(text.includes(secret), false, secret)
    assert.equal(/exposure|provenOver|effectiveCeiling|xFloor/.test(text), false)
  }
}

/** Previews wrote nothing outside custody (custody rows were appended by the test itself). */
function pure(was: readonly number[], now: readonly number[]) {
  UNTOUCHED.forEach((t, i) => {
    if (!t.startsWith('capacity_')) assert.equal(now[i], was[i], `previews wrote ${t}`)
  })
}
const ROUTE = 'research-sol-medium-v1'

const iso = (ms: number) => new Date(ms).toISOString()
/** An instant as R2 spells it (microseconds). */
const r2 = (ms: number) => new Date(ms).toISOString().replace(/Z$/, '000Z')
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
const hex = (seed: string) => createHash('sha256').update(seed).digest('hex')
const previewUrl = (projectId: string) => `/api/v1/projects/${projectId}/selection-preview?operation=research`

async function preview(app: FastifyInstance, who: string | null, projectId: string) {
  const res = await app.inject({
    method: 'GET',
    url: previewUrl(projectId),
    headers: who ? { authorization: `Bearer ${await token(who)}` } : {},
  })
  return { status: res.statusCode, body: res.body }
}
/** An evaluated (shared) view's outcome, the one candidate's limitation, and its owner codes. */
function decided(r: { status: number; body: string }) {
  assert.equal(r.status, 200, r.body)
  const v = parseSelectionView(JSON.parse(r.body))
  assert.ok(v.disclosure === 'shared' && v.candidates, r.body)
  return { outcome: v.outcome, limitation: v.candidates[0]?.limitation, codes: v.candidates[0]?.codes }
}

/**
 * A project with an enabled research gate; an owner (editor) contributing one qualified, protected, runtime-ready API
 * grant; a second editor; a viewer; the operator's account and route qualifications (0094/0104 functions).
 */
async function contribution(ownerUrl: string, api: pg.Pool, owner: pg.Pool) {
  const [EDIT, EDIT2, VIEW] = [randomUUID(), randomUUID(), randomUUID()]
  const { projectId } = await seedProject(ownerUrl, { admin: randomUUID(), editors: [EDIT, EDIT2], viewers: [VIEW] })
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  const sql = async <T>(text: string, params: unknown[]): Promise<T> =>
    withActor(api, EDIT, 'write', async (c) => {
      const row = (await c.query<{ r: T }>(text, params)).rows[0]
      assert.ok(row, text)
      return row.r
    })
  const acc = await sql<{ accountId: string; revision: number }>(`SELECT sophia.api_account_create($1, $2) AS r`, [
    'My API',
    10,
  ])
  await sql(`SELECT sophia.api_account_update($1, $2, $3) AS r`, [
    acc.accountId,
    acc.revision,
    JSON.stringify({
      protection: { applicability: 'none_applicable', operations: ['research'], roles: ['sophia-research-md-v1'] },
    }),
  ])
  const conn = await sql<{ connectionId: string }>(`SELECT sophia.api_connection_create($1, $2, $3) AS r`, [
    acc.accountId,
    'Research key',
    'Operator host',
  ])
  await sql(`SELECT sophia.api_grant_create($1, $2, $3) AS r`, [
    conn.connectionId,
    projectId,
    JSON.stringify({
      expiresAt: iso(Date.now() + 30 * 86400_000),
      taskCapUsd: 1,
      totalCapUsd: 5,
      fundingPolicy: 'bounded_total_spend',
      fundingAcknowledgementRef: 'synthetic acknowledgement',
    }),
  ])
  const runtimeToken = randomUUID() + randomUUID()
  await owner.query(`SELECT sophia.register_contribution_runtime($1, $2, $3, $4, false)`, [
    projectId,
    conn.connectionId,
    'sophia-runtime-test',
    createHash('sha256').update(runtimeToken, 'utf8').digest(),
  ])
  const who: RuntimeCaller = {
    tokenSha256: runtimeTokenHash(runtimeToken),
    runtimeUnitId: 'sophia-runtime-test',
    bridgeInstanceId: randomUUID(),
  }
  await withService(api, (c) =>
    runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }),
  )
  await withService(api, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  await owner.query(
    `SELECT sophia.qualify_api_account($1, '{research}', 'operator_verified_call', 'synthetic', now()-interval '1 minute', now()+interval '1 day')`,
    [conn.connectionId],
  )
  const { rows } = await owner.query<{ aq: string; rev: string; rq: string }>(
    `SELECT a.id AS aq, a.revision AS rev, r.id AS rq FROM sophia.api_account_qualifications a, sophia.api_route_qualifications r
     WHERE a.connection_id=$1 AND a.revoked_at IS NULL AND r.revoked_at IS NULL AND r.expires_at>now()
     ORDER BY r.qualified_at DESC LIMIT 1`,
    [conn.connectionId],
  )
  const q = rows[0]
  assert.ok(q)
  return {
    projectId,
    EDIT,
    EDIT2,
    VIEW,
    accountId: acc.accountId,
    connectionId: conn.connectionId,
    aq: q.aq,
    rev: Number(q.rev),
    rq: q.rq,
  }
}
type Contribution = Awaited<ReturnType<typeof contribution>>

/** The windows each reading carries: the remaining window and the consumption window of one token count. */
const WINDOWS = (consumed: number) => [
  {
    windowRef: 'tokens-day',
    windowEpoch: 'e1',
    scope: 'account' as const,
    unit: 'tokens',
    value: 800,
    verdict: 'admits' as const,
    applicability: 'known' as const,
  },
  {
    windowRef: 'tokens-used',
    windowEpoch: 'e1u',
    scope: 'account' as const,
    unit: 'tokens',
    value: consumed,
    verdict: 'admits' as const,
    applicability: 'known' as const,
  },
]

/** A new SYNTHETIC reading, observed just now (each later than the last), so it is the current one. */
async function reading(owner: pg.Pool, w: Contribution, consumed = 9000, over: Partial<CapacityObservationInput> = {}) {
  await wait(5)
  const receipt = await recordCapacityObservation(owner, {
    observationKey: `k-${randomUUID()}`,
    connectionId: w.connectionId,
    credentialRevision: 1,
    accountQualificationId: w.aq,
    accountQualificationRevision: w.rev,
    routeQualificationId: w.rq,
    operation: 'research',
    verification: 'operator_verified_console',
    evidenceRef: 'SYNTHETIC evidence ref',
    sourceChannel: 'synthetic-console',
    windowSetRef: 'synthetic-limits',
    windowSetVersion: 'v1',
    coverage: 'complete',
    requiredWindowRefs: ['tokens-day', 'tokens-used'],
    reflection: 'unknown',
    observedAt: iso(Date.now() - 1),
    freshUntil: iso(Date.now() + 600_000),
    windows: WINDOWS(consumed),
    ...over,
  })
  return receipt.observationId
}

interface Custody {
  scopeId: string
  issuerId: string
  windowStart: number
}

/** The databases whose route mapping is registered: a mapping is global, and a second, different one would conflict. */
const mapped = new WeakSet<pg.Pool>()

/**
 * The scope, its two registered windows, an issuer, and (once per database) the output-token mapping of the route's
 * complete reports.
 */
async function custody(owner: pg.Pool, w: Contribution): Promise<Custody> {
  const scopeId = randomUUID()
  const issuerId = randomUUID()
  const windowStart = Date.now() - 2 * 3600_000
  const digest = { approval_ref_digest: hex('approval'), evidence_digest: hex('evidence') }
  await registerCapacityScope(owner, {
    scope_id: scopeId,
    account_id: w.accountId,
    connection_id: w.connectionId,
    credential_revision: 1,
    route_id: ROUTE,
    model: 'gpt-6.1-sol',
    effort: 'medium',
    operation: 'research',
    account_qualification_id: w.aq,
    account_qualification_revision: w.rev,
    route_qualification_id: w.rq,
    ...digest,
  })
  for (const epoch of ['e1', 'e1u'])
    await registerCapacityWindow(owner, {
      scope_id: scopeId,
      qual_revision: w.rev,
      dimension: 'openai.output_tokens',
      unit: 'tokens',
      window_kind: 'day',
      epoch_key: epoch,
      window_start: r2(windowStart),
      window_end: r2(windowStart + 24 * 3600_000),
      window_semantics: 'fixed_epoch',
      measurement_basis: 'issuer_local',
      epoch_basis: 'provider_reported',
      ...digest,
    })
  await registerCapacityIssuer(owner, {
    issuer_id: issuerId,
    kind: 'controlled_fixture',
    scope_id: scopeId,
    qual_revision: w.rev,
    registered_at: r2(Date.now()),
    ...digest,
  })
  if (mapped.has(owner)) return { scopeId, issuerId, windowStart }
  mapped.add(owner)
  await registerCapacityMapping(owner, {
    provider: 'openai',
    route_id: ROUTE,
    contract: 'c1p_complete_report',
    source_field: 'output',
    dimension: 'openai.output_tokens',
    unit: 'tokens',
    semantics: 'reported_lower_bound',
    revision: 1,
    issuer_id: issuerId,
    ...digest,
  })
  return { scopeId, issuerId, windowStart }
}

/** Bind a reading's window (remaining or consumed) to its registered window. */
async function bind(owner: pg.Pool, w: Contribution, c: Custody, obs: string, consumed = false) {
  const r = await bindCapacityObservation(owner, {
    observation_id: obs,
    window_ref: consumed ? 'tokens-used' : 'tokens-day',
    scope_id: c.scopeId,
    qual_revision: w.rev,
    dimension: 'openai.output_tokens',
    window_kind: 'day',
    epoch_key: consumed ? 'e1u' : 'e1',
    kind: consumed ? 'consumed_in_window' : 'remaining_at',
    issuer_id: c.issuerId,
    issuer_seq: 1,
    measurement_id: null,
    evidence_kind: 'controlled_fixture',
    evidence_digest: hex(`binding ${obs}`),
  })
  assert.equal(r.outcome, 'recorded')
}

/** An attribution q of one effect in one reading. */
async function attribute(owner: pg.Pool, { w, c }: { w: Contribution; c: Custody }, obs: string, e: Effect, q: number) {
  await appendCapacityAttribution(owner, {
    observation_id: obs,
    project_id: e.projectId,
    reservation_id: e.reservationId,
    dimension: 'openai.output_tokens',
    coverage: 'reflected',
    q,
    basis: 'controlled_fixture',
    n1: null,
    n2: null,
    evidence_digest: hex(`att ${obs}`),
    issuer_id: c.issuerId,
    issuer_qual_revision: w.rev,
  })
}

interface Effect {
  projectId: string
  reservationId: string
}

/** One worked case: q (null: removed), the W1 outcome, the HTTP limitation, the private effective ceiling. */
type Case = [number | null, 'unchanged' | 'unproven' | 'exhausted', string, number | null]

/** A model reservation and its tracked identity on the contribution's account, in any project (fixture transaction). */
async function effect(owner: pg.Pool, w: Contribution, projectId: string, createdAgoMs: number): Promise<Effect> {
  const reservationId = randomUUID()
  const c = await owner.connect()
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL session_replication_role = replica')
    await c.query(
      `INSERT INTO sophia.research_reservations(project_id,id,allowance_id,reservation_key,kind,provider,reserved_usd,created_at)
       VALUES($1,$2,gen_random_uuid(),$3,'model','openai',1,now()-make_interval(secs=>$4::double precision/1000))`,
      [projectId, reservationId, `k-${reservationId}`, createdAgoMs],
    )
    await c.query(
      `INSERT INTO sophia.research_call_identities(project_id,reservation_id,mode,contract,operation,runtime_id,
        runtime_unit_id,resource_id,binding_id,attempt_id,native_session_id,call_id,job_id,allowance_id,route_id,provider,
        payer,account_id,grant_id,grant_revision,connection_id,credential_revision,qualification_id,qualification_revision)
       SELECT r.project_id,r.id,'tracked_v1','c1p_complete_report','research',gen_random_uuid(),'synthetic-unit',
        gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'synthetic-session','synthetic-call',gen_random_uuid(),
        r.allowance_id,$3,'openai','contributor_api_account',$4,gen_random_uuid(),1,$5,1,gen_random_uuid(),1
       FROM sophia.research_reservations r WHERE r.project_id=$1 AND r.id=$2`,
      [projectId, reservationId, ROUTE, w.accountId, w.connectionId],
    )
    await c.query('COMMIT')
  } finally {
    c.release()
  }
  return { projectId, reservationId }
}

/** The effect's qualified final total c (a finality append). */
async function finalTotal(owner: pg.Pool, w: Contribution, c: Custody, e: Effect, count: number) {
  await appendCapacityFinality(owner, {
    project_id: e.projectId,
    reservation_id: e.reservationId,
    dimension: 'openai.output_tokens',
    basis: 'provider_terminal_known',
    final_at: r2(Date.now() - 60_000),
    count_kind: 'final_total',
    final_count: count,
    evidence_digest: hex(`final ${e.reservationId}`),
    approval_ref_digest: hex('approval'),
    issuer_id: c.issuerId,
    issuer_qual_revision: w.rev,
  })
}

/** A reported truth row and a retained history row of the given disposition (fixture transaction). */
async function reportedHistory(owner: pg.Pool, e: Effect, output: number, disposition: string) {
  const c = await owner.connect()
  const facts = `'complete_report','known',10,'known',0,'no_separate_reported_class',NULL,'known',${output},'stream_completed','settled',0.01,'unknown'`
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL session_replication_role = replica')
    await c.query(
      `INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,
        cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,
        response_id_status) VALUES($1,$2,$3,${facts})`,
      [e.projectId, e.reservationId, hex(`truth ${e.reservationId}`)],
    )
    await c.query(
      `INSERT INTO sophia.research_call_history(project_id,reservation_id,ordinal,digest,disposition,report,
        noncached_input_class,noncached_input,cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,
        consumer_ending,outcome,cost_usd,response_id_status) VALUES($1,$2,1,$3,$4,${facts})`,
      [e.projectId, e.reservationId, hex(`history ${e.reservationId}`), disposition],
    )
    await c.query('COMMIT')
  } finally {
    c.release()
  }
}

/** The contribution grant of a connection for one project (0094's own row: id, revision, owner, settings). */
async function grantOf(owner: pg.Pool, connectionId: string, projectId: string): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `SELECT id FROM sophia.api_contribution_grants WHERE connection_id=$1 AND project_id=$2`,
    [connectionId, projectId],
  )
  const id = rows[0]?.id
  assert.ok(id, 'a real grant')
  return id
}

/**
 * B1: one reservation with NO call identity, its contribution task and its account ledger row (0094), written against the
 * real grant (and its account and connection) of `projectId`. Only the task's job reference stays unresolved (see the
 * file's note); the test checks the rest.
 */
async function ledgerObligation(owner: pg.Pool, projectId: string, grantId: string, kind: 'model' | 'search') {
  const reservationId = randomUUID()
  const jobId = randomUUID()
  const c = await owner.connect()
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL session_replication_role = replica')
    await c.query(
      `INSERT INTO sophia.research_reservations(project_id,id,allowance_id,reservation_key,kind,provider,reserved_usd,created_at)
       VALUES($1,$2,gen_random_uuid(),$3,$4,'openai',1,now()-interval '10 minutes')`,
      [projectId, reservationId, `k-${reservationId}`, kind],
    )
    await c.query(
      `INSERT INTO sophia.api_contribution_tasks(project_id,job_id,allowance_id,grant_id,grant_revision,connection_id,
        credential_revision,account_id,owner_id,requester_id,resource_id,requested_route,requested_model,requested_effort)
       SELECT g.project_id,$2,gen_random_uuid(),g.id,g.revision,g.connection_id,n.credential_revision,n.account_id,g.owner_id,
        g.owner_id,gen_random_uuid(),g.route_id,g.model,g.effort
       FROM sophia.api_contribution_grants g JOIN sophia.api_connections n ON n.id=g.connection_id
       WHERE g.id=$1 AND g.project_id=$3`,
      [grantId, jobId, projectId],
    )
    await c.query(
      `INSERT INTO sophia.api_contribution_reservations(project_id,reservation_id,job_id,grant_id,grant_revision,account_id,
        connection_id,credential_revision)
       SELECT t.project_id,$2,t.job_id,t.grant_id,t.grant_revision,t.account_id,t.connection_id,t.credential_revision
       FROM sophia.api_contribution_tasks t WHERE t.project_id=$1 AND t.job_id=$3`,
      [projectId, reservationId, jobId],
    )
    await c.query('COMMIT')
  } finally {
    c.release()
  }
  // Every reference resolves but the job's: the real reservation, task, grant (for this project), account and
  // connection; and no identity exists, so the obligation is genuinely unrepresented.
  const { rows } = await owner.query<{ ok: boolean; job: boolean; identity: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sophia.api_contribution_reservations x
       JOIN sophia.research_reservations r ON r.project_id=x.project_id AND r.id=x.reservation_id
       JOIN sophia.api_contribution_tasks t ON t.project_id=x.project_id AND t.job_id=x.job_id
       JOIN sophia.api_contribution_grants g ON g.id=t.grant_id AND g.project_id=t.project_id AND g.revision=t.grant_revision
       JOIN sophia.api_accounts a ON a.id=t.account_id
       JOIN sophia.api_connections n ON n.id=x.connection_id AND n.account_id=x.account_id
      WHERE x.project_id=$1 AND x.reservation_id=$2) AS ok,
      EXISTS(SELECT 1 FROM sophia.jobs j WHERE j.project_id=$1 AND j.id=$3) AS job,
      EXISTS(SELECT 1 FROM sophia.research_call_identities i WHERE i.project_id=$1 AND i.reservation_id=$2) AS identity`,
    [projectId, reservationId, jobId],
  )
  assert.deepEqual(rows[0], { ok: true, job: false, identity: false })
  return reservationId
}

describe('capacity exposure through the real preview (0114)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let on: FastifyInstance
  let off: FastifyInstance
  const lines: string[] = []

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 6 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic',now()+interval '1 day')`,
    )
    const logger = { stream: { write: (line: string) => lines.push(line) } }
    on = buildApp({ pool, verifyActor, logger, capacityExposure: true })
    off = buildApp({ pool, verifyActor, logger })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await pool.end()
    await owner.end()
    await db.drop()
  })
  const counts = async () =>
    Promise.all(
      UNTOUCHED.map(async (t) =>
        Number((await owner.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.${t}`)).rows[0]?.n),
      ),
    )
  /** The server-internal exposure verdict of the contribution's one API candidate (private numbers, assertions only). */
  const internal = async (w: Contribution) => {
    const s = await withActor(pool, w.EDIT, 'read', (c) =>
      readSelectionSnapshot(c, w.projectId, [], { exposure: true }),
    )
    assert.ok(s && s.evaluation === 'full')
    const f = s.candidates[0]
    assert.ok(f && f.kind === 'api')
    return exposureEffect(f.exposure)
  }

  /** The private verdict of one worked case (server-side only; never a wire value). */
  async function privateVerdict(w: Contribution, one: Case): Promise<void> {
    const [q, outcome, , effective] = one
    const verdict = await internal(w)
    assert.ok(verdict)
    assert.equal(verdict.outcome, outcome, `q ${String(q)}`)
    const p = verdict.windows[0]?.projection
    assert.ok(p)
    assert.equal(p.effectiveCeiling ?? null, q === null ? 800 : effective)
    // The private arithmetic of 0 < q < c: X exactly 600, effective exactly 200.
    if (q === 400) assert.deepEqual([p.status, p.xFloor, p.xCeiling, p.effectiveFloor], ['exact', 600, 600, 200])
  }

  /** The HTTP outcome of one worked case: the kernel's limitation and only its codes; none for a non-owner editor. */
  async function httpOutcome(w: Contribution, one: Case): Promise<string> {
    const [q, outcome, limitation] = one
    const r = await preview(on, w.EDIT, w.projectId)
    const d = decided(r)
    assert.equal(d.limitation, limitation, `q ${String(q)}: ${r.body}`)
    const codes = d.codes ?? []
    for (const code of codes) assert.match(code, KERNEL_CODE, 'only the kernel codes, no number')
    const kernel = { exhausted: 'capacity_exhausted', unproven: 'capacity_unproven', unchanged: null }[outcome]
    if (kernel !== null) assert.ok(codes.includes(kernel), r.body)
    const other = parseSelectionView(JSON.parse((await preview(on, w.EDIT2, w.projectId)).body))
    assert.ok(other.disclosure === 'shared' && other.candidates?.[0]?.codes === undefined, 'no owner code')
    return r.body
  }

  /** One reading of the worked partial reflection, bound, with q attributed unless removed. */
  async function partialCase(ctx: { w: Contribution; c: Custody }, e1: Effect, one: Case): Promise<string> {
    const obs = await reading(owner, ctx.w)
    await bind(owner, ctx.w, ctx.c, obs)
    if (one[0] !== null) await attribute(owner, ctx, obs, e1, one[0])
    await privateVerdict(ctx.w, one)
    return httpOutcome(ctx.w, one)
  }

  it('reflects a partial attribution, restricts every uncertainty, and never discloses a number', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const baseline = decided(await preview(off, w.EDIT, w.projectId))
    assert.deepEqual([baseline.outcome, baseline.limitation], ['selected', 'eligible'])
    const c = await custody(owner, w)
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    await finalTotal(owner, w, c, e1, 1000)
    const before0 = await counts()
    const from = lines.length

    // A recorded reading never bound: the 0107 baseline, byte-identical with the switch on or off.
    await reading(owner, w)
    const neverBound = await preview(on, w.EDIT, w.projectId)
    assert.equal(neverBound.body, (await preview(off, w.EDIT, w.projectId)).body, 'never bound = 0107')

    // q removed, 0, 200, 400, 800, 1000 (increasing, so no earlier q regresses), each on its own new reading.
    const cases: Case[] = [
      [null, 'unproven', 'not_verified', null],
      [0, 'exhausted', 'unavailable_now', -200],
      [200, 'exhausted', 'unavailable_now', 0],
      [400, 'unchanged', 'eligible', 200],
      [800, 'unchanged', 'eligible', 600],
      [1000, 'unchanged', 'eligible', 800],
    ]
    const bodies: string[] = []
    for (const one of cases) bodies.push(await partialCase({ w, c }, e1, one))

    // consumed_in_window of the same reading (q 1000): S 1000, U 8000, unchanged; then S above V: unproven.
    const consumedObs = await reading(owner, w, 9000)
    await bind(owner, w, c, consumedObs)
    await bind(owner, w, c, consumedObs, true)
    await attribute(owner, { w, c }, consumedObs, e1, 1000)
    const consumed = await internal(w)
    const used = consumed?.windows.find((v) => v.windowRef === 'tokens-used')?.projection
    assert.deepEqual([consumed?.outcome, used?.attributed, used?.unattributed], ['unchanged', 1000, 8000])
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'eligible')
    const overObs = await reading(owner, w, 300)
    await bind(owner, w, c, overObs)
    await bind(owner, w, c, overObs, true)
    await attribute(owner, { w, c }, overObs, e1, 1000)
    assert.equal((await internal(w))?.outcome, 'unproven')
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'not_verified')

    // The switch off on the same database: exactly 0107's mapping (the latest reading admits).
    assert.equal(decided(await preview(off, w.EDIT, w.projectId)).limitation, 'eligible')

    // Privacy: no private number, id, window, unit, issuer, digest or evidence in any body or log line.
    const secrets = [c.scopeId, c.issuerId, e1.reservationId, consumedObs, 'tokens-day', 'tokens-used', hex('approval')]
    noLeak([...bodies, lines.slice(from).join('')], secrets)
    pure(before0, await counts())
  })

  it('counts another project on the same account, restricts a conflicted history, and a revoked binding', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    await finalTotal(owner, w, c, e1, 1000)
    const other = (await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [], viewers: [] })).projectId
    const e2 = await effect(owner, w, other, 20 * 60_000)
    await finalTotal(owner, w, c, e2, 100)
    const obs = await reading(owner, w)
    await bind(owner, w, c, obs)
    await attribute(owner, { w, c }, obs, e1, 400)
    assert.equal((await internal(w))?.outcome, 'unproven', 'the other project effect is unattributed: unknown')
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'not_verified')
    const obs2 = await reading(owner, w)
    await bind(owner, w, c, obs2)
    await attribute(owner, { w, c }, obs2, e1, 400)
    await attribute(owner, { w, c }, obs2, e2, 100)
    const both = await internal(w)
    assert.ok(both)
    assert.equal(both.outcome, 'unchanged', JSON.stringify(both.windows.map((v) => [v.why, v.projection?.reasons])))
    assert.equal(both.windows[0]?.projection?.effectiveFloor, 200)
    // A conflicted retained history of e2: unresolved, never a chosen value.
    await reportedHistory(owner, e2, 100, 'conflict')
    assert.equal((await internal(w))?.outcome, 'unproven')
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'not_verified')
    // A revoked binding: restricted, never the never-bound baseline.
    const obs3 = await reading(owner, w)
    await bind(owner, w, c, obs3)
    await revokeCapacityBinding(owner, {
      observation_id: obs3,
      window_ref: 'tokens-day',
      reason_digest: hex('reason'),
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    })
    assert.deepEqual(await internal(w), { outcome: 'unproven', exhaustedRefs: [], windows: [] })
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'not_verified')
    assert.equal(decided(await preview(off, w.EDIT, w.projectId)).limitation, 'eligible', 'off: 0107 unchanged')
  })

  /** One new reading, bound, with e1 attributed q: the private verdict, the HTTP limitation, and the owner codes. */
  async function readingWithQ(w: Contribution, c: Custody, e1: Effect, q: number) {
    const obs = await reading(owner, w)
    await bind(owner, w, c, obs)
    await attribute(owner, { w, c }, obs, e1, q)
    const verdict = await internal(w)
    assert.ok(verdict)
    const r = await preview(on, w.EDIT, w.projectId)
    return { verdict, body: r.body, view: decided(r) }
  }

  it('B1: a ledger obligation without a call identity in ANOTHER project of the account is unknown, never available', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    await finalTotal(owner, w, c, e1, 1000)
    const positive = await readingWithQ(w, c, e1, 400)
    assert.deepEqual([positive.verdict.outcome, positive.view.limitation], ['unchanged', 'eligible'])
    assert.equal(positive.verdict.windows[0]?.projection?.effectiveFloor, 200)

    // Irrelevant rows: another account's ledger obligation, and a search reservation on this account. Nothing changes.
    const w2 = await contribution(db.ownerUrl, pool, owner)
    const otherAccount = await ledgerObligation(
      owner,
      w2.projectId,
      await grantOf(owner, w2.connectionId, w2.projectId),
      'model',
    )
    const search = await ledgerObligation(
      owner,
      w.projectId,
      await grantOf(owner, w.connectionId, w.projectId),
      'search',
    )
    const still = await readingWithQ(w, c, e1, 400)
    assert.deepEqual([still.verdict.outcome, still.view.limitation], ['unchanged', 'eligible'], 'irrelevant rows')
    assert.equal(still.verdict.windows[0]?.projection?.effectiveFloor, 200)

    // The account's model obligation in ANOTHER project (a real grant there on the same connection), without identity.
    const { projectId: other } = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [w.EDIT], viewers: [] })
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      other,
    ])
    await withActor(pool, w.EDIT, 'write', (x) =>
      x.query(`SELECT sophia.api_grant_create($1, $2, $3)`, [
        w.connectionId,
        other,
        JSON.stringify({
          expiresAt: iso(Date.now() + 30 * 86400_000),
          taskCapUsd: 1,
          totalCapUsd: 5,
          fundingPolicy: 'bounded_total_spend',
          fundingAcknowledgementRef: 'synthetic acknowledgement',
        }),
      ]),
    )
    const legacy = await ledgerObligation(owner, other, await grantOf(owner, w.connectionId, other), 'model')
    const b1 = await readingWithQ(w, c, e1, 400)
    const v = b1.verdict.windows[0]
    assert.deepEqual([b1.verdict.outcome, v?.why], ['unproven', 'effects_incomplete'], 'B1 unrepresented: unknown')
    assert.equal(v?.projection?.effectiveFloor, 200, 'the represented arithmetic is unchanged, never made 0')
    assert.equal(b1.view.limitation, 'not_verified')
    assert.ok(b1.view.codes?.includes('capacity_unproven'), b1.body)
    for (const code of b1.view.codes ?? []) assert.match(code, KERNEL_CODE)
    noLeak([positive.body, still.body, b1.body], [legacy, other, otherAccount, search, c.scopeId])
    assert.equal(decided(await preview(off, w.EDIT, w.projectId)).limitation, 'eligible', 'off: 0107 unchanged')
  })

  it('B1: a ledger obligation without a call identity in the SAME project is unknown too', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    await finalTotal(owner, w, c, e1, 1000)
    assert.equal((await readingWithQ(w, c, e1, 400)).verdict.outcome, 'unchanged')
    await ledgerObligation(owner, w.projectId, await grantOf(owner, w.connectionId, w.projectId), 'model')
    const b1 = await readingWithQ(w, c, e1, 400)
    assert.deepEqual([b1.verdict.outcome, b1.view.limitation], ['unproven', 'not_verified'])
  })

  /** A second scope over the SAME 0107 scope (its own scope id), with an issuer of its own. */
  async function separateScope(w: Contribution) {
    const scopeId = randomUUID()
    const issuerId = randomUUID()
    const scope = {
      scope_id: scopeId,
      account_id: w.accountId,
      connection_id: w.connectionId,
      credential_revision: 1,
      route_id: ROUTE,
      model: 'gpt-6.1-sol',
      effort: 'medium',
      operation: 'research' as const,
      account_qualification_id: w.aq,
      account_qualification_revision: w.rev,
      route_qualification_id: w.rq,
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    }
    await registerCapacityScope(owner, scope)
    await registerCapacityIssuer(owner, {
      issuer_id: issuerId,
      kind: 'controlled_fixture',
      scope_id: scopeId,
      qual_revision: w.rev,
      registered_at: r2(Date.now()),
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    })
    return { issuerId, conflict: () => registerCapacityScope(owner, { ...scope, evidence_digest: hex('another') }) }
  }

  /** A reported truth row whose only known output count is the terminal's raw output (output class unknown). */
  async function rawOutputTruth(e: Effect, rawOutput: number) {
    const c = await owner.connect()
    try {
      await c.query('BEGIN')
      await c.query('SET LOCAL session_replication_role = replica')
      await c.query(
        `INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,
          cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,
          response_id_status,provider_terminal,delivery,raw_output)
         VALUES($1,$2,$3,'complete_report','known',10,'known',0,'no_separate_reported_class',NULL,'unknown',NULL,
          'stream_completed','settled',0.01,'unknown','completed','none',$4)`,
        [e.projectId, e.reservationId, hex(`raw ${e.reservationId}`), rawOutput],
      )
      await c.query('COMMIT')
    } finally {
      c.release()
    }
  }

  it('W1-F01: a mapping of a separate scope counts while it holds, and is restrictive once that scope conflicts', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const separate = await separateScope(w)
    const mapping = {
      provider: 'openai',
      route_id: ROUTE,
      contract: 'c1p_complete_report' as const,
      source_field: 'raw_output' as const,
      dimension: 'openai.output_tokens' as const,
      unit: 'tokens' as const,
      semantics: 'reported_lower_bound' as const,
      revision: 1,
      issuer_id: separate.issuerId,
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    }
    assert.equal((await registerCapacityMapping(owner, mapping)).outcome, 'recorded')
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    await rawOutputTruth(e1, 1000)
    const obs = await reading(owner, w)
    await bind(owner, w, c, obs)
    await attribute(owner, { w, c }, obs, e1, 0)
    // Eligible: the mapped reported count (so far 1000) is a lower bound that proves the window over (V 800).
    const eligible = await internal(w)
    assert.deepEqual([eligible?.outcome, eligible?.windows[0]?.projection?.xFloor], ['exhausted', 1000])
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'unavailable_now')
    // The mapping issuer's own scope conflicts; the bound window's scope (c) stays valid.
    assert.equal((await separate.conflict()).outcome, 'conflict')
    const ineligible = await internal(w)
    const v = ineligible?.windows[0]
    assert.deepEqual([ineligible?.outcome, v?.why], ['unproven', 'effects_incomplete'], 'W1-F01: ineligible mapping')
    assert.equal(v?.projection?.xFloor, 0, 'its count is unresolved, never qualified')
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'not_verified')
    await assert.rejects(
      registerCapacityMapping(owner, { ...mapping, source_field: 'raw_input_total', dimension: 'openai.input_tokens' }),
      (err: unknown) => err instanceof CapacityCustodyRefused && err.refusal === 'issuer_unqualified',
      'W1-F01: a new mapping of an issuer whose own scope conflicts is issuer_unqualified',
    )
    assert.equal((await registerCapacityMapping(owner, mapping)).replay, true, 'an exact replay keeps its receipt')
  })

  it('W1-F02: a current exhausted 0107 witness stays capacity_exhausted under missing q and a revoked binding', async () => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    await finalTotal(owner, w, c, e1, 1000)
    const exhaustedWindows = WINDOWS(9000).map((x) =>
      x.windowRef === 'tokens-day' ? { ...x, verdict: 'exhausted' as const } : x,
    )
    const obs = await reading(owner, w, 9000, { windows: exhaustedWindows })
    const off0 = decided(await preview(off, w.EDIT, w.projectId))
    assert.equal(off0.limitation, 'unavailable_now', 'off: the 0107 witness is exhausted to begin with')
    assert.ok(off0.codes?.includes('capacity_exhausted'))
    await bind(owner, w, c, obs)
    assert.equal((await internal(w))?.outcome, 'unproven', 'missing q: W1 alone is uncertain')
    const missing = decided(await preview(on, w.EDIT, w.projectId))
    assert.equal(missing.limitation, 'unavailable_now', 'W1-F02: missing q keeps the exhausted refusal')
    assert.ok(
      missing.codes?.includes('capacity_exhausted') && !missing.codes.includes('capacity_unproven'),
      missing.codes?.join(),
    )
    await revokeCapacityBinding(owner, {
      observation_id: obs,
      window_ref: 'tokens-day',
      reason_digest: hex('reason'),
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    })
    assert.equal((await internal(w))?.outcome, 'unproven', 'restricted')
    const restricted = decided(await preview(on, w.EDIT, w.projectId))
    assert.equal(restricted.limitation, 'unavailable_now', 'W1-F02: a revoked binding keeps the exhausted refusal')
    assert.ok(restricted.codes?.includes('capacity_exhausted'))
  })

  it('keeps membership: a viewer is restricted even when the exposure helper faults; nonmember 404; no token 401', async (t) => {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const obs = await reading(owner, w)
    await bind(owner, w, c, obs)
    const helper =
      'sophia.selection_capacity_exposure_at(sophia.api_contribution_grants,sophia.api_connections,timestamptz)'
    // The API role cannot execute the helper itself.
    await assert.rejects(
      withActor(pool, w.EDIT, 'read', (x) =>
        x.query(`SELECT sophia.selection_capacity_exposure_at(NULL::sophia.api_contribution_grants, NULL, now())`),
      ),
      'the helper is not executable by the API role',
    )
    const original = (await owner.query<{ d: string }>(`SELECT pg_get_functiondef($1::regprocedure) AS d`, [helper]))
      .rows[0]?.d
    assert.ok(original)
    t.after(() => owner.query(original))
    await owner.query(`CREATE OR REPLACE FUNCTION sophia.selection_capacity_exposure_at(gr sophia.api_contribution_grants,
      conn sophia.api_connections, p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
      BEGIN RAISE EXCEPTION 'SYNTHETIC exposure fault'; END $$`)
    const viewer = await preview(on, w.VIEW, w.projectId)
    assert.deepEqual([viewer.status, JSON.parse(viewer.body)], [200, RESTRICTED])
    const editor = await preview(on, w.EDIT, w.projectId)
    assert.equal(editor.status >= 500, true, `the editor meets the fault: ${editor.body}`)
    assert.equal(editor.body.includes('SYNTHETIC exposure fault'), false, 'the database message never reaches HTTP')
    assert.equal(decided(await preview(off, w.EDIT, w.projectId)).outcome, 'selected', 'off never calls it')
    await owner.query(original)
    // Restored: no effect on the account at all, so nothing is exposed (a closed, empty scope): as 0107 maps it.
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'eligible', 'restored')
    assert.equal((await preview(on, randomUUID(), w.projectId)).status, 404)
    assert.equal((await preview(on, null, w.projectId)).status, 401)
  })
})

describe('the switch and the installation: before and after 0114', () => {
  let empty: EmptyDatabase
  let owner: pg.Pool
  let pool: pg.Pool
  let on: FastifyInstance
  let off: FastifyInstance
  const suffix = randomBytes(6).toString('hex')
  const login = `sophia_api_x_${suffix}`
  const dir = mkdtempSync(join(tmpdir(), 'sophia-before-0114-'))

  before(async () => {
    const migrations = resolve('db/migrations')
    for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && n < '0114'))
      symlinkSync(join(migrations, f), join(dir, f))
    empty = await createEmptyDatabase('sophia_x')
    await withClusterMigrationLock(() => migrate(empty.ownerUrl, dir))
    owner = new pg.Pool({ connectionString: empty.ownerUrl, max: 2 })
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic',now()+interval '1 day')`,
    )
    const password = randomBytes(12).toString('hex')
    await owner.query(
      `CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    )
    await owner.query(`GRANT sophia_api TO ${login}`)
    await owner.query(`GRANT CONNECT ON DATABASE ${new URL(empty.ownerUrl).pathname.slice(1)} TO ${login}`)
    const u = new URL(empty.ownerUrl)
    u.username = login
    u.password = password
    pool = createPool(u.toString(), { max: 4 })
    on = buildApp({ pool, verifyActor, capacityExposure: true })
    off = buildApp({ pool, verifyActor })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await pool.end()
    await owner.query(`DROP OWNED BY ${login}; DROP ROLE ${login}`)
    await owner.end()
    await empty.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  const unavailable = async (app: FastifyInstance, who: string, projectId: string, label: string) => {
    const r = await preview(app, who, projectId)
    assert.deepEqual([r.status, JSON.parse(r.body).code], [503, 'projection_unavailable'], `${label}: ${r.body}`)
  }

  it('off serves 0107 without 0114; on is unavailable until the migrator applies it, then serves', async () => {
    const w = await contribution(empty.ownerUrl, pool, owner)
    await reading(owner, w)
    assert.equal(decided(await preview(off, w.EDIT, w.projectId)).limitation, 'eligible', 'off, without 0114')
    for (const who of [w.EDIT, w.VIEW]) await unavailable(on, who, w.projectId, 'on, without 0114')
    // The historical upgrade: exactly 0114 joins this fixture's own migration history (later migrations, such as 0115,
    // stay out of it; the current full migration path is checked elsewhere), then the normal migrator runs on it.
    const exposureMigration = '0114_capacity_exposure_custody.sql'
    symlinkSync(join(resolve('db/migrations'), exposureMigration), join(dir, exposureMigration))
    const report = await withClusterMigrationLock(() => migrate(empty.ownerUrl, dir))
    assert.deepEqual(
      report.rows.filter((r) => r.status !== 'already_applied').map((r) => [r.version, r.status]),
      [['0114', 'applied']],
    )
    assert.deepEqual(JSON.parse((await preview(on, w.VIEW, w.projectId)).body), RESTRICTED)
    const upgraded = await preview(on, w.EDIT, w.projectId)
    assert.equal(upgraded.body, (await preview(off, w.EDIT, w.projectId)).body, 'never bound: byte-identical to 0107')
  })

  it('on, an older candidate helper without the key is unavailable; off still serves it', async () => {
    const w = await contribution(empty.ownerUrl, pool, owner)
    await reading(owner, w)
    const current =
      'sophia.selection_api_candidate(sophia.api_contribution_grants,uuid,sophia.research_funding_pins,boolean,timestamptz)'
    const restore = (await owner.query<{ d: string }>(`SELECT pg_get_functiondef($1::regprocedure) AS d`, [current]))
      .rows[0]?.d
    assert.ok(restore)
    // 0107's own definition, as written: no exposure key.
    const src = readFileSync(resolve('db/migrations/0107_capacity_observations.sql'), 'utf8')
    const start = src.indexOf('CREATE OR REPLACE FUNCTION sophia.selection_api_candidate(')
    await owner.query(src.slice(start, src.indexOf('END $$;', start) + 'END $$;'.length))
    try {
      await unavailable(on, w.EDIT, w.projectId, 'an older helper')
      assert.equal(decided(await preview(off, w.EDIT, w.projectId)).limitation, 'eligible')
    } finally {
      await owner.query(restore)
    }
    assert.equal(decided(await preview(on, w.EDIT, w.projectId)).limitation, 'eligible', 'restored')
  })
})

// ---- coherent-009 (Root121): the pure equivalent-tie repair reaching W1's real consumer -------------------------------
// Two SYNTHETIC readings recorded at the SAME instant and bound to the same registered window form an equal-as-of tie
// in 0114's partition; their distinct source sequences let 0107 designate the higher one current without a conflict.
// A tie between a complete reading and one with a missing q is never one known reading (Codex review 5920809739): W1
// answers capacity_unproven whichever reading is designated and whichever id sorts first, and a missing q is never 0.
// Identical readings stay one known reading (the positive). This block has a database of its own: the W1-F01 case above
// conflicts a global mapping, which would leave every later effect unresolved. Nothing here qualifies a real issuer,
// account, route or admission; every identity is SYNTHETIC.
describe('coherent-009: an equal-as-of tie reaches the real preview through the repaired pure module', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let on: FastifyInstance
  let off: FastifyInstance

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 6 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic',now()+interval '1 day')`,
    )
    on = buildApp({ pool, verifyActor, capacityExposure: true })
    off = buildApp({ pool, verifyActor })
    await on.ready()
    await off.ready()
  })
  after(async () => {
    await on.close()
    await off.close()
    await pool.end()
    await owner.end()
    await db.drop()
  })

  /** The server-internal exposure facts of the contribution's one API candidate (assertions only, never the wire). */
  const facts = async (w: Contribution) => {
    const s = await withActor(pool, w.EDIT, 'read', (c) =>
      readSelectionSnapshot(c, w.projectId, [], { exposure: true }),
    )
    assert.ok(s && s.evaluation === 'full')
    const f = s.candidates[0]
    assert.ok(f && f.kind === 'api')
    return f.exposure
  }

  /** One reported truth row with a known output count: the effect's so-far count through the output mapping. */
  async function outputTruth(e: Effect, output: number) {
    const c = await owner.connect()
    try {
      await c.query('BEGIN')
      await c.query('SET LOCAL session_replication_role = replica')
      await c.query(
        `INSERT INTO sophia.research_call_truth(project_id,reservation_id,digest,report,noncached_input_class,noncached_input,
          cache_read_class,cache_read,cache_write_class,cache_write,output_class,output,consumer_ending,outcome,cost_usd,
          response_id_status) VALUES($1,$2,$3,'complete_report','known',10,'known',0,'no_separate_reported_class',NULL,
          'known',$4,'stream_completed','settled',0.01,'unknown')`,
        [e.projectId, e.reservationId, hex(`output ${e.reservationId}`), output],
      )
      await c.query('COMMIT')
    } finally {
      c.release()
    }
  }

  interface Tie {
    designated: string
    other: string
  }

  /**
   * Two readings of V 800 observed at ONE instant (source sequences 2 and 1: 0107 designates the first current), recorded
   * in the given order and both bound to the remaining or the consumed window.
   */
  async function tie(w: Contribution, c: Custody, consumed: boolean, designatedFirst: boolean): Promise<Tie> {
    const at = { observedAt: iso(Date.now() - 1), windows: WINDOWS(800) }
    const ids: Record<string, string> = {}
    for (const which of designatedFirst ? ['designated', 'other'] : ['other', 'designated']) {
      ids[which] = await reading(owner, w, 800, { ...at, sourceSequence: which === 'designated' ? 2 : 1 })
    }
    const t = { designated: ids['designated'] ?? '', other: ids['other'] ?? '' }
    for (const id of [t.designated, t.other]) await bind(owner, w, c, id, consumed)
    // The partition really is a tie: two readings at one as-of, the designated one current.
    const e = await facts(w)
    assert.ok(e && e.state === 'bound')
    const obs = e.windows[0]?.observations ?? []
    assert.equal(e.windows.length, 1)
    assert.deepEqual([obs.length, new Set(obs.map((o) => o.asOf)).size], [2, 1], 'one instant: an equal-as-of tie')
    assert.deepEqual(
      obs.filter((o) => o.current).map((o) => o.id),
      [t.designated],
    )
    return t
  }

  /** A fresh contribution with its custody and one in-scope effect created 30 minutes ago. */
  async function setup() {
    const w = await contribution(db.ownerUrl, pool, owner)
    const c = await custody(owner, w)
    const e1 = await effect(owner, w, w.projectId, 30 * 60_000)
    return { w, c, e1 }
  }

  /** The HTTP answer first (the kernel's code only), then the private verdict; 0107 alone stays eligible. */
  async function restricted(w: Contribution, label: string) {
    const r = await preview(on, w.EDIT, w.projectId)
    const d = decided(r)
    assert.equal(d.limitation, 'not_verified', `${label}: never admitted on a mixed tie: ${r.body}`)
    assert.ok(d.codes?.includes('capacity_unproven'), `${label}: ${r.body}`)
    for (const code of d.codes ?? []) assert.match(code, KERNEL_CODE)
    const v = await internal2(w)
    assert.deepEqual(
      [v?.outcome, v?.windows.map((x) => [x.outcome, x.why])],
      ['unproven', [['unproven', 'incomparable_tie']]],
      label,
    )
    assert.equal(decided(await preview(off, w.EDIT, w.projectId)).limitation, 'eligible', `${label}: off is 0107`)
  }

  const internal2 = async (w: Contribution) => exposureEffect(await facts(w))

  it('a consumed tie of q 0 against a missing q is unproven: either reading designated, both orders, both id orders', async () => {
    const idOrders = new Set<string>()
    for (let attempt = 0; attempt < 12 && (attempt < 4 || idOrders.size < 2); attempt += 1) {
      const designatedComplete = attempt % 2 === 0
      const designatedFirst = attempt % 4 < 2
      const { w, c, e1 } = await setup()
      await finalTotal(owner, w, c, e1, 1000)
      const t = await tie(w, c, true, designatedFirst)
      const [complete, missing] = designatedComplete ? [t.designated, t.other] : [t.other, t.designated]
      await attribute(owner, { w, c }, complete, e1, 0)
      idOrders.add(complete < missing ? 'complete sorts first' : 'missing sorts first')
      await restricted(
        w,
        `consumed tie, ${designatedComplete ? 'complete' : 'incomplete'} designated, ${designatedFirst ? 'designated' : 'other'} recorded first`,
      )
    }
    assert.equal(idOrders.size, 2, 'both lexical id orders were exercised')
  })

  it('a remaining tie of q 1000 against a missing q over an open so-far count is unproven, in both recorded orders', async () => {
    for (const designatedFirst of [true, false]) {
      const { w, c, e1 } = await setup()
      await outputTruth(e1, 1000)
      const t = await tie(w, c, false, designatedFirst)
      await attribute(owner, { w, c }, t.designated, e1, 1000)
      await restricted(
        w,
        `remaining tie, designated complete, ${designatedFirst ? 'designated' : 'other'} recorded first`,
      )
    }
  })

  it('a tie of two identical complete readings (q 0 on both) stays one known reading: unchanged, eligible', async () => {
    for (const designatedFirst of [true, false]) {
      const { w, c, e1 } = await setup()
      await finalTotal(owner, w, c, e1, 1000)
      const t = await tie(w, c, true, designatedFirst)
      for (const id of [t.designated, t.other]) await attribute(owner, { w, c }, id, e1, 0)
      const r = await preview(on, w.EDIT, w.projectId)
      assert.equal(decided(r).limitation, 'eligible', r.body)
      assert.deepEqual(knownConsumed(await internal2(w)), ['unchanged', 'consistent', 0, 800, false, true, 1000, 1000])
    }
  })
})

/** The verdict of one bound consumed window and its private projection's numbers (server-side assertions only). */
function knownConsumed(v: ReturnType<typeof exposureEffect>) {
  assert.ok(v)
  const window = v.windows[0]
  assert.ok(window && window.projection)
  const p = window.projection
  return [
    v.outcome,
    window.why,
    p.attributed,
    p.unattributed,
    p.attributedIsLowerBound,
    p.coverageComplete,
    p.xFloor,
    p.xCeiling,
  ]
}
