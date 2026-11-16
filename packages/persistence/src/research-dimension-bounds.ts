// INC04-R07-C2-DIMENSION-BOUNDS-CORE-001 (0113): private, typed wrappers over the INACTIVE database core of a qualified
// per-reservation dimension bound. Migration owner only: no application role executes these functions, nothing here is
// exported through the package index, an API route, the CLI or the SDK, and no emitter or collector is wired to it.
// Payloads are the closed snake_case domains the SQL validates (integers as decimal strings, digests as lowercase hex,
// typed null as JSON null). An authority record is an operator binding of scope and evidence references, never a live
// qualification; a digest is consistency, never authority or outbound truth. R1 (CORE-R1-001) adds the design and
// source-review reserves with the same opt-in.
import type pg from 'pg'
import type { RuntimeCaller } from './runtime.ts'

/** A migration-owner connection or pool. */
export type OperatorDb = pg.Pool | pg.ClientBase
type Digest = string
type IntString = string

export type BoundDimension = 'openai.output_tokens' | 'openai.model_requests'
export interface BoundAuthorityInput {
  version: 'research-bound-authority-v1'
  authorityKey: string
  kind: 'bound_profile_qualification'
  scope: { kind: 'account' | 'project' | 'grant' | 'allowance'; ref: string }
  dimension: BoundDimension
  approverRef: string
  verifierRef: string
}
/** sophia.c2.bound.profile.register.v1 */
export interface ProfileRegistration {
  profile_id: string
  revision: IntString
  dimension: BoundDimension
  unit: 'tokens' | 'requests'
  enforcement_kind: 'output_parameter' | 'dispatch_count'
  param_name: string | null
  max_ceiling: IntString
  provider: string
  route_id: string
  endpoint: string
  model: string
  settings_digest: Digest
  emitter_identity_digest: Digest
  semantics_evidence_digest: Digest
  isolation_evidence_digest: Digest
  scope_kind: 'account' | 'project' | 'grant'
  scope_ref: string
  authority_id: string
  approval_ref_digest: Digest
  evidence_digest: Digest
}
/** sophia.c2.bound.profile.event.v1 (auto_hold is the contradiction writer's only). */
export interface ProfileEvent {
  profile_id: string
  revision: IntString
  dimension: BoundDimension
  event_key: string
  event_kind: 'activate' | 'hold' | 'unhold' | 'revoke' | 'distrust'
  target_event_digest: Digest | null
  reason_code: string
  authority_id: string
  approval_ref_digest: Digest
  cause_ref_digest: null
  evidence_digest: Digest
}
/** sophia.c2.bound.policy.register.v1: a native-unit cap, never USD. */
export interface PolicyRegistration {
  policy_id: string
  revision: IntString
  scope_kind: 'project' | 'allowance' | 'account'
  scope_ref: string
  dimension: BoundDimension
  unit: 'tokens' | 'requests'
  cap: IntString
  authority_id: string
  approval_ref_digest: Digest
  evidence_digest: Digest
}
/** sophia.c2.bound.policy.event.v1 */
export interface PolicyEvent {
  policy_id: string
  revision: IntString
  event_key: string
  event_kind: 'activate' | 'revoke'
  authority_id: string
  approval_ref_digest: Digest
  evidence_digest: Digest
}
/** sophia.c2.dispatch.apply.v1 */
export interface ApplyPayload {
  project_id: string
  reservation_id: string
  dispatch_id: string
  attempt_id: string
  call_id: string
  runtime_id: string
  original_generation: Digest | null
  emitter_identity_digest: Digest
  outbound_params_digest: Digest
  authorize_set_digest: Digest
}
/** sophia.c2.dispatch.claim.v1 (sendPermitted is a reply field, never a payload field). */
export interface ClaimPayload {
  project_id: string
  reservation_id: string
  dispatch_id: string
  runtime_id: string
  original_generation: Digest | null
  apply_receipt_digest: Digest
}
/** sophia.c2.dispatch.outcome.v1 */
export interface OutcomePayload {
  project_id: string
  reservation_id: string
  dispatch_id: string
  outcome_kind: 'not_sent_after_claim' | 'sent' | 'send_error_before_response'
  evidence_digest: Digest
  observed_at: string
}

export type Receipt = Record<string, unknown>
export interface ClaimReply {
  dispatchId: string
  /** True ONLY in the reply of the call that performed the single applied -> claimed transition. */
  sendPermitted: boolean
  history: 'claimed'
  claimSeq: string
  applyReceiptDigest: Digest
  claimedAt: string
  replay: boolean
}
export type BoundStatusValue =
  'unknown' | 'unsupported' | 'authorized_not_applied' | 'applied_unqualified' | 'qualified' | 'contradicted'
export interface BoundStatus {
  dispatchId: string | null
  phase?: 'authorized' | 'applied' | 'claimed'
  applyConflicted?: boolean
  /** Server mechanics only: never G-PROFILE, a route qualification or a live provider fact. */
  qualification: 'server_mechanics_only'
  claim?: {
    claimSeq: string
    runtimeId: string
    originalGeneration: Digest | null
    applyReceiptDigest: Digest
    claimedAt: string
  } | null
  outcome?: Record<string, unknown> | null
  dimensions: {
    dimension: string
    status: BoundStatusValue
    unit?: string
    boundKind?: 'authorized' | 'unsupported'
    bound?: IntString | null
    profileState?: string | null
    reason?: string | null
  }[]
}

async function call<T>(db: OperatorDb, sql: string, params: unknown[]): Promise<T> {
  const row = (await db.query<{ r: T }>(sql, params)).rows[0]
  if (!row) throw new Error('The bound function returned no row')
  return row.r
}

export const recordBoundAuthority = (db: OperatorDb, input: BoundAuthorityInput) =>
  call<{ authorityId: string; kind: 'bound_profile_qualification'; replay: boolean }>(
    db,
    'SELECT sophia.record_research_bound_authority($1) AS r',
    [input],
  )
export const revokeBoundAuthority = async (db: OperatorDb, authorityId: string, reason: string) => {
  await db.query('SELECT sophia.revoke_research_bound_authority($1, $2)', [authorityId, reason])
}
export const registerBoundProfile = (db: OperatorDb, payload: ProfileRegistration) =>
  call<Receipt>(db, 'SELECT sophia.register_research_bound_profile($1) AS r', [payload])
export const recordBoundProfileEvent = (db: OperatorDb, payload: ProfileEvent) =>
  call<Receipt>(db, 'SELECT sophia.record_research_bound_profile_event($1) AS r', [payload])
export const registerBoundPolicy = (db: OperatorDb, payload: PolicyRegistration) =>
  call<Receipt>(db, 'SELECT sophia.register_research_bound_policy($1) AS r', [payload])
export const recordBoundPolicyEvent = (db: OperatorDb, payload: PolicyEvent) =>
  call<Receipt>(db, 'SELECT sophia.record_research_bound_policy_event($1) AS r', [payload])

/** The derived lifecycle state of one triple (or null when it is not registered). */
export const boundProfileState = (db: OperatorDb, profileId: string, revision: number, dimension: BoundDimension) =>
  call<string | null>(db, 'SELECT sophia.research_bound_profile_state($1, $2, $3) AS r', [
    profileId,
    revision,
    dimension,
  ])
export const boundPolicyState = (db: OperatorDb, policyId: string, revision: number) =>
  call<string | null>(db, 'SELECT sophia.research_bound_policy_state($1, $2) AS r', [policyId, revision])
/** The bounded read model of one reservation (for a later native collector; nothing consumes it yet). */
export const boundStatus = (db: OperatorDb, projectId: string, reservationId: string) =>
  call<BoundStatus>(db, 'SELECT sophia.research_bound_status($1, $2) AS r', [projectId, reservationId])

const caller = (who: RuntimeCaller) => [who.tokenSha256, who.runtimeUnitId, who.bridgeInstanceId]
interface At {
  attemptId: string
  nativeSessionId: string
}
/** apply: a receipt only; an exact replay returns it; it never grants a send. */
export const runtimeBoundApply = (db: OperatorDb, who: RuntimeCaller, at: At, apply: ApplyPayload) =>
  call<Receipt>(db, 'SELECT sophia.runtime_research_bound_apply($1, $2, $3, $4) AS r', [
    ...caller(who),
    JSON.stringify({ ...at, apply }),
  ])
/** claim: the single at-most-once transition; every replay is history without permission. */
export const runtimeBoundClaim = (db: OperatorDb, who: RuntimeCaller, at: At, claim: ClaimPayload) =>
  call<ClaimReply>(db, 'SELECT sophia.runtime_research_bound_claim($1, $2, $3, $4) AS r', [
    ...caller(who),
    JSON.stringify({ ...at, claim }),
  ])
/** outcome: informational emitter evidence from the claim owner only. */
export const runtimeBoundOutcome = (db: OperatorDb, who: RuntimeCaller, at: At, outcome: OutcomePayload) =>
  call<Receipt>(db, 'SELECT sophia.runtime_research_bound_outcome($1, $2, $3, $4) AS r', [
    ...caller(who),
    JSON.stringify({ ...at, outcome }),
  ])

/**
 * R2: the design and source-review dispatch entries. Each entry resolves its OWN maintained scope and post-wait fence in
 * the database; the operation picks only which fixed entry is called, never an authority or a scope.
 */
export type BoundOperation = 'design' | 'source_review'
const ENTRY = {
  design: {
    apply: 'SELECT sophia.runtime_research_bound_apply_design($1, $2, $3, $4) AS r',
    claim: 'SELECT sophia.runtime_research_bound_claim_design($1, $2, $3, $4) AS r',
    outcome: 'SELECT sophia.runtime_research_bound_outcome_design($1, $2, $3, $4) AS r',
  },
  source_review: {
    apply: 'SELECT sophia.runtime_research_bound_apply_review($1, $2, $3, $4) AS r',
    claim: 'SELECT sophia.runtime_research_bound_claim_review($1, $2, $3, $4) AS r',
    outcome: 'SELECT sophia.runtime_research_bound_outcome_review($1, $2, $3, $4) AS r',
  },
} as const
export const runtimeBoundApplyFor = (
  db: OperatorDb,
  op: BoundOperation,
  who: RuntimeCaller,
  at: At,
  apply: ApplyPayload,
) => call<Receipt>(db, ENTRY[op].apply, [...caller(who), JSON.stringify({ ...at, apply })])
export const runtimeBoundClaimFor = (
  db: OperatorDb,
  op: BoundOperation,
  who: RuntimeCaller,
  at: At,
  claim: ClaimPayload,
) => call<ClaimReply>(db, ENTRY[op].claim, [...caller(who), JSON.stringify({ ...at, claim })])
export const runtimeBoundOutcomeFor = (
  db: OperatorDb,
  op: BoundOperation,
  who: RuntimeCaller,
  at: At,
  outcome: OutcomePayload,
) => call<Receipt>(db, ENTRY[op].outcome, [...caller(who), JSON.stringify({ ...at, outcome })])
/**
 * The tracked reserve with the opt-in `boundProfile` member, which only the database parser accepts in this slice (no
 * contract, API schema or SDK caller carries it). Without the member the reserve is the existing one, unchanged.
 */
export const runtimeReserveWithBounds = (db: OperatorDb, who: RuntimeCaller, request: Record<string, unknown>) =>
  call<Record<string, unknown>>(db, 'SELECT sophia.runtime_research_reserve($1, $2, $3, $4) AS r', [
    ...caller(who),
    JSON.stringify(request),
  ])
/**
 * R1: the design and source-review reserves with the same opt-in (the same server-derived plan, before their gate).
 * R2: their dispatch is applied and claimed through their own entries (`runtimeBoundApplyFor`, `runtimeBoundClaimFor`).
 */
export const runtimeDesignReserveWithBounds = (db: OperatorDb, who: RuntimeCaller, request: Record<string, unknown>) =>
  call<Record<string, unknown>>(db, 'SELECT sophia.runtime_design_reserve($1, $2, $3, $4) AS r', [
    ...caller(who),
    JSON.stringify(request),
  ])
export const runtimeSourceReviewReserveWithBounds = (
  db: OperatorDb,
  who: RuntimeCaller,
  request: Record<string, unknown>,
) =>
  call<Record<string, unknown>>(db, 'SELECT sophia.runtime_source_review_reserve($1, $2, $3, $4) AS r', [
    ...caller(who),
    JSON.stringify(request),
  ])
