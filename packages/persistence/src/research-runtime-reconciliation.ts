// INC04-R07-C3-RECONCILE-001 (0112): private, typed operator wrappers over the reconciliation, adjudication and
// certification functions. Migration owner only: no application role can execute them, and nothing here is exported
// through the package index, an API route, the CLI or the SDK. Every input is the closed, versioned shape the SQL
// validates; money is a canonical six-decimal STRING (never a JSON number). An authority record is the durable operator
// binding of scope and evidence references; it is not proof of a live billing check, and production execution stays an
// external owner/fixed-scope executor with independent verification.
import type pg from 'pg'

/** A migration-owner connection or pool. */
export type OperatorDb = pg.Pool | pg.ClientBase
/** A USD amount with exactly six decimals, e.g. "0.034000". */
export type Usd = string

export type AuthorityScope = { accountId: string } | { projectId: string; allowanceId: string }
export interface AuthorityInput {
  version: 'research-authority-v1'
  authorityKey: string
  kind: 'provider_billed_attestation' | 'cause_adjudication' | 'certification' | 'late_fact_attestation'
  scope: AuthorityScope
  approverRef: string
  verifierRef: string
}
export interface ReconcileInput {
  version: 'research-reconcile-v1'
  projectId: string
  reservationId: string
  expected: {
    state: 'reserved' | 'uncertain'
    reservedUsd: Usd
    allowanceId: string
    accountId: string | null
    resourceId: string | null
    operation: 'research' | 'design' | 'source_review' | null
    callId: string | null
    provider: string
    fenceId: string | null
    generation: string | null
  }
  basis: 'provider_billed_attestation'
  costUsd: Usd
  authorityId: string
  evidenceRef: string
}
export interface ReconcileResult {
  projectId: string
  reservationId: string
  basis: 'provider_billed_attestation'
  priorState: 'reserved' | 'uncertain'
  state: 'settled'
  settledUsd: Usd
  reservedUsd: Usd
  overrunUsd: Usd
  accountId: string | null
  fenceId: string | null
  authorityId: string
  digest: string
}
export interface AdjudicateInput {
  version: 'research-adjudicate-v1'
  causeId: string
  projectId: string
  reservationId: string
  kind: 'conflict' | 'overflow'
  digest: string
  outcome: 'original_money_stands'
  authorityId: string
  evidenceRef: string
}
export interface AdjudicateResult {
  causeId: string
  scope: 'account' | 'allowance'
  seq: number
  projectId: string
  reservationId: string
  kind: 'conflict' | 'overflow'
  digest: string
  outcome: 'original_money_stands'
  reservationState: 'settled' | 'released'
  settledUsd: Usd | null
  authorityId: string
  inputDigest: string
}
export interface CertificationCause {
  seq: number
  projectId: string
  reservationId: string
  kind: 'conflict' | 'overflow'
  digest: string
}
export interface CertificationPreview {
  scopeKey: string
  causes: CertificationCause[]
  causeSetDigest: string
  coveredThrough: number
  covered: boolean
  projectIds: string[] | null
  connectionIds: string[] | null
  restricted: boolean | null
  episode: number | null
}
export interface CertifyAllowanceInput {
  version: 'research-certify-allowance-v1'
  projectId: string
  allowanceId: string
  episode: string
  causeSetDigest: string
  authorityId: string
  evidenceRef: string
}
export interface CertifyAccountInput {
  version: 'research-certify-account-v1'
  accountId: string
  projectIds: string[]
  connectionIds: string[]
  causeSetDigest: string
  authorityId: string
  evidenceRef: string
}
export interface CertificateResult {
  certificateId: string
  coveredThrough: number
  causeSetDigest: string
  authorityId: string
  inputDigest: string
}

/**
 * R1 (C3REC-F01): late original-generation facts through the governed, non-native operator path. `report` is exactly the
 * tracked settle request the original runtime would have sent (its evidence, observed facts included, is validated by the
 * existing SQL writer). `operationKey` is the durable operation identity: the same key with the same input replays, the
 * same key with any changed input refuses, a later observation uses a distinct key. It never moves money.
 *
 * R2 P03-A: `expected` names the original generation canonically: `generation` is the token of the call's original
 * resource (`contribution_runtime_generation`) when that resource has a contribution link, and null exactly when it has
 * none (a legacy runtime resource); `fenceId` is that resource's 0111 fence, or null exactly when it has none. The call's
 * original runtime must have been revoked by a maintained path (the fence, or a re-registration); a replacement never
 * counts.
 */
export interface LateFactsInput {
  version: 'research-late-facts-v1'
  operationKey: string
  projectId: string
  reservationId: string
  expected: {
    attemptId: string
    nativeSessionId: string
    callId: string
    runtimeUnitId: string
    runtimeId: string
    resourceId: string
    operation: 'research' | 'design' | 'source_review'
    provider: string
    accountId: string | null
    grantId: string | null
    allowanceId: string
    fenceId: string | null
    generation: string | null
  }
  report: Record<string, unknown>
  authorityId: string
  evidenceRef: string
}
/**
 * R2 P02: what the late report CLAIMED. It is never financial truth: no billed basis follows from it, and while the money is
 * open the call's truth keeps an unknown financial outcome (uncertain, no cost) whatever the report says.
 */
export interface LateFactsReported {
  outcome: 'settled' | 'uncertain'
  costUsd: Usd | null
  basis: 'reported_unverified'
}
/** R2 P02: the reservation's money as it stands after the operation, which the operation never changes. */
export interface LateFactsFinancial {
  reservationState: 'reserved' | 'uncertain' | 'settled' | 'released'
  settledUsd: Usd | null
}
export interface LateFactsResult {
  operationKey: string
  projectId: string
  reservationId: string
  disposition: string
  replay: boolean
  capped: boolean
  factsDigest: string
  newCause: boolean
  fenceId: string | null
  generation: string | null
  originalRuntimeId: string
  originalBasis: 'fence' | 'runtime_revoked'
  reported: LateFactsReported
  financial: LateFactsFinancial
  authorityId: string
  inputDigest: string
}
/** R2 P02: one stored late-fact operation as read back: the reported claim apart from the money it left unchanged. */
export interface LateFactsRecord {
  operationKey: string
  fenceId: string | null
  generation: string | null
  originalRuntimeId: string
  originalBasis: 'fence' | 'runtime_revoked'
  reported: LateFactsReported
  moneyAtOperation: LateFactsFinancial
  recordedAt: string
}

async function call<T>(db: OperatorDb, sql: string, params: unknown[]): Promise<T> {
  const row = (await db.query<{ r: T }>(sql, params)).rows[0]
  if (!row) throw new Error('The operator function returned no row')
  return row.r
}

export const recordResearchFinancialAuthority = (db: OperatorDb, input: AuthorityInput) =>
  call<{ authorityId: string; kind: AuthorityInput['kind'] }>(
    db,
    'SELECT sophia.record_research_financial_authority($1) AS r',
    [input],
  )

export const revokeResearchFinancialAuthority = async (db: OperatorDb, authorityId: string, reason: string) => {
  await db.query('SELECT sophia.revoke_research_financial_authority($1, $2)', [authorityId, reason])
}

export const reconcileResearchReservation = (db: OperatorDb, input: ReconcileInput) =>
  call<ReconcileResult>(db, 'SELECT sophia.reconcile_research_reservation($1) AS r', [input])

export const recordResearchLateFacts = (db: OperatorDb, input: LateFactsInput) =>
  call<LateFactsResult>(db, 'SELECT sophia.record_research_late_facts($1) AS r', [input])

/** The operator's read of one call's late-fact operations, oldest first (migration owner only). */
export const researchLateFactRecords = async (
  db: OperatorDb,
  projectId: string,
  reservationId: string,
): Promise<LateFactsRecord[]> =>
  (
    await db.query<{ r: LateFactsRecord }>(
      `SELECT jsonb_build_object('operationKey',operation_key,'fenceId',fence_id,'generation',generation,
         'originalRuntimeId',original_runtime_id,'originalBasis',original_basis,
         'reported',jsonb_build_object('outcome',reported_outcome,'costUsd',reported_cost_usd::text,'basis',reported_basis),
         'moneyAtOperation',jsonb_build_object('reservationState',money_state,'settledUsd',money_settled_usd::text),
         'recordedAt',recorded_at) AS r
       FROM sophia.research_late_fact_operations WHERE project_id=$1 AND reservation_id=$2 ORDER BY recorded_at, operation_key`,
      [projectId, reservationId],
    )
  ).rows.map((x) => x.r)

export const adjudicateResearchCause = (db: OperatorDb, input: AdjudicateInput) =>
  call<AdjudicateResult>(db, 'SELECT sophia.adjudicate_research_cause($1) AS r', [input])

/** The operator's lock-free read of a scope before certifying it: an account, or one project's allowance. */
export const researchCertificationPreview = (db: OperatorDb, scope: AuthorityScope) =>
  call<CertificationPreview>(db, 'SELECT sophia.research_certification_preview($1, $2, $3) AS r', [
    'accountId' in scope ? scope.accountId : null,
    'projectId' in scope ? scope.projectId : null,
    'allowanceId' in scope ? scope.allowanceId : null,
  ])

export const certifyResearchAllowance = (db: OperatorDb, input: CertifyAllowanceInput) =>
  call<CertificateResult & { projectId: string; allowanceId: string; episode: number }>(
    db,
    'SELECT sophia.certify_research_allowance($1) AS r',
    [input],
  )

export const certifyResearchAccount = (db: OperatorDb, input: CertifyAccountInput) =>
  call<CertificateResult & { accountId: string; projectIds: string[]; connectionIds: string[] }>(
    db,
    'SELECT sophia.certify_research_account($1) AS r',
    [input],
  )
