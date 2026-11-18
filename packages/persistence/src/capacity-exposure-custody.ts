// Operator custody of capacity exposure (INC04-R07 C4/C5 W1, migration 0114; docs/plans/capacity-exposure-wiring.md).
// Typed wrappers over the migration owner's eight append functions: scopes, windows, issuers, bindings, binding
// revocations, dimension mappings, attributions and effect finality. No application role can execute them;
// scripts/record-capacity-exposure.ts is their only caller outside tests, against disposable databases.
//
// Guarantees: each payload is R2's closed canonical form, validated by the database in R2's order (keys, grammar with a
// real calendar, cross-field rules, then append-time semantics); a refusal is a fixed code and writes nothing; an exact
// replay returns its receipt; a different payload under a recorded key is one sticky conflict whose retry returns the
// same receipt. Does not guarantee: anything about a provider, issuer, clock or mapping. A record is custody the
// operator holds evidence for, never a qualification of a live source. Nothing here changes a ledger, reservation,
// claim, allowance or admission, and nothing here is a money fact.
import type pg from 'pg'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

type Queryable = Pick<pg.Pool | pg.PoolClient | pg.Client, 'query'>

/** An append refused by the database with one of 0114's fixed codes; nothing was written. */
export class CapacityCustodyRefused extends Error {
  readonly refusal: string
  constructor(refusal: string) {
    super(`Capacity custody refused: ${refusal}`)
    this.name = 'CapacityCustodyRefused'
    this.refusal = refusal
  }
}

/** A dimension R2 knows. */
export type CapacityDimension =
  'openai.output_tokens' | 'openai.input_tokens' | 'openai.input_cached_tokens' | 'openai.model_requests'

/** An instant as R2 spells it: `YYYY-MM-DDTHH:MM:SS.ffffffZ`, a real UTC calendar instant. */
type Instant = string
/** 64 lowercase hex digits. */
type Digest = string

/** One 0107 exact scope and the qualification revisions it is registered under (W1 scope.register.v1). */
export interface CapacityScopeInput {
  scope_id: string
  account_id: string
  connection_id: string
  credential_revision: number
  route_id: string
  model: string
  effort: string
  operation: 'research'
  account_qualification_id: string
  account_qualification_revision: number
  route_qualification_id: string
  approval_ref_digest: Digest
  evidence_digest: Digest
}

/** R2 window.register.v1: the window key fixes unit, bounds, semantics and bases. */
export interface CapacityWindowRegistration {
  scope_id: string
  qual_revision: number
  dimension: CapacityDimension
  unit: 'tokens' | 'requests'
  window_kind: 'minute' | 'hour' | 'day' | 'month' | 'provider_defined'
  epoch_key: string
  window_start: Instant
  window_end: Instant
  window_semantics: 'fixed_epoch' | 'rolling' | 'unknown'
  measurement_basis: 'issuer_local' | 'shared_qualified'
  epoch_basis: 'provider_reported' | 'owner_policy'
  approval_ref_digest: Digest
  evidence_digest: Digest
}

/** R2 issuer.register.v1, for one registered scope and revision. */
export interface CapacityIssuerRegistration {
  issuer_id: string
  kind: 'controlled_fixture' | 'owner_operator' | 'provider_feed'
  scope_id: string
  qual_revision: number
  registered_at: Instant
  approval_ref_digest: Digest
  evidence_digest: Digest
}

/** W1 binding.append.v1: one 0107 reading window bound to one registered window and kind (values are the reading's). */
export interface CapacityBindingInput {
  observation_id: string
  window_ref: string
  scope_id: string
  qual_revision: number
  dimension: CapacityDimension
  window_kind: CapacityWindowRegistration['window_kind']
  epoch_key: string
  kind: 'remaining_at' | 'consumed_in_window' | 'verdict_only'
  issuer_id: string
  issuer_seq: number
  measurement_id: string | null
  evidence_kind: 'provider_usage_api' | 'provider_attributed_export' | 'owner_operator_reading' | 'controlled_fixture'
  evidence_digest: Digest
}

/** W1 binding.revoke.v1: restrictive from then on, never the never-bound baseline. */
export interface CapacityBindingRevocation {
  observation_id: string
  window_ref: string
  reason_digest: Digest
  approval_ref_digest: Digest
  evidence_digest: Digest
}

/** W1 mapping.register.v1: which reported count of a (provider, route, contract) is which dimension. */
export interface CapacityMappingInput {
  provider: string
  route_id: string
  contract: 'c1p_complete_report' | 'legacy_report'
  source_field:
    | 'noncached_input'
    | 'cache_read'
    | 'cache_write'
    | 'output'
    | 'raw_input_total'
    | 'raw_cache_read'
    | 'raw_output'
    | 'input_total_from_parts'
  dimension: CapacityDimension
  unit: 'tokens' | 'requests'
  semantics: 'reported_lower_bound'
  revision: number
  issuer_id: string
  approval_ref_digest: Digest
  evidence_digest: Digest
}

/** R2 attribution.append.v1: the only source of q, per observation and effect. */
export interface CapacityAttributionInput {
  observation_id: string
  project_id: string
  reservation_id: string
  dimension: CapacityDimension
  coverage: 'reflected' | 'not_reflected'
  q: number | null
  basis: 'provider_response_record' | 'provider_attributed_export' | 'controlled_fixture'
  n1: string | null
  n2: string | null
  evidence_digest: Digest
  issuer_id: string
  issuer_qual_revision: number
}

/** R2 finality.append.v1: the only source of finality and of a final total. */
export interface CapacityFinalityInput {
  project_id: string
  reservation_id: string
  dimension: CapacityDimension
  basis: 'provider_terminal_known' | 'never_left_release'
  final_at: Instant
  count_kind: 'final_total' | 'none'
  final_count: number | null
  evidence_digest: Digest
  approval_ref_digest: Digest
  issuer_id: string
  issuer_qual_revision: number
}

/**
 * A custody receipt. `recorded`: the payload's record (`replay` when it already was). `conflict`: a different payload
 * under a recorded key, kept once as a sticky conflict (`first` names the recorded payload; `replay` when the conflict
 * already was). Finality receipts also carry the payload's place in its subject's order (`seq`).
 */
export interface CapacityCustodyReceipt {
  kind: 'scope' | 'window' | 'issuer' | 'binding' | 'revocation' | 'mapping' | 'attribution' | 'finality'
  outcome: 'recorded' | 'conflict'
  key: string
  payload: string
  first?: string
  seq?: number
  recordedAt: string
  replay: boolean
}

/** Whether a value is an object carrying `key`, read as unknown. */
const field = (v: unknown, key: string): unknown =>
  typeof v === 'object' && v !== null && Object.hasOwn(v, key) ? Reflect.get(v, key) : undefined

/** 0114's fixed refusal code of a database error (SQLSTATE 22023, detail capacity_exposure_refusal), else null. */
const refusalOf = (err: unknown): string | null => {
  const message = field(err, 'message')
  const fixed = field(err, 'code') === '22023' && field(err, 'detail') === 'capacity_exposure_refusal'
  return fixed && typeof message === 'string' ? message : null
}

async function append(db: Queryable, fn: string, payload: object): Promise<CapacityCustodyReceipt> {
  try {
    const { rows } = await db.query<{ r: CapacityCustodyReceipt }>(`SELECT sophia.${fn}($1::jsonb) AS r`, [
      JSON.stringify(payload),
    ])
    return onlyRow(rows, fn).r
  } catch (err) {
    const refusal = refusalOf(err)
    if (refusal !== null) throw new CapacityCustodyRefused(refusal)
    throw classifyDbError(err)
  }
}

/** Register one exact scope (migration owner only). */
export const registerCapacityScope = (db: Queryable, p: CapacityScopeInput) => append(db, 'register_capacity_scope', p)
/** Register one window (migration owner only). */
export const registerCapacityWindow = (db: Queryable, p: CapacityWindowRegistration) =>
  append(db, 'register_capacity_window', p)
/** Register one issuer for one scope and revision (migration owner only). */
export const registerCapacityIssuer = (db: Queryable, p: CapacityIssuerRegistration) =>
  append(db, 'register_capacity_issuer', p)
/** Bind one 0107 reading window to one registered window and kind (migration owner only). */
export const bindCapacityObservation = (db: Queryable, p: CapacityBindingInput) =>
  append(db, 'bind_capacity_observation', p)
/** Revoke one binding (migration owner only). */
export const revokeCapacityBinding = (db: Queryable, p: CapacityBindingRevocation) =>
  append(db, 'revoke_capacity_binding', p)
/** Register one dimension mapping (migration owner only). cache_write and model-request counts are refused. */
export const registerCapacityMapping = (db: Queryable, p: CapacityMappingInput) =>
  append(db, 'register_capacity_mapping', p)
/** Append one attribution witness (migration owner only). */
export const appendCapacityAttribution = (db: Queryable, p: CapacityAttributionInput) =>
  append(db, 'append_capacity_attribution', p)
/** Append one effect-finality payload (migration owner only). */
export const appendCapacityFinality = (db: Queryable, p: CapacityFinalityInput) =>
  append(db, 'append_capacity_finality', p)
