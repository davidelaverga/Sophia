// The selection preview's snapshot (INC04-S01b, migrations 0104 and 0106; docs/plans/selection-preview.md; INC04-S03a,
// migration 0107; docs/plans/capacity-observations.md). One read
// of sophia.selection_snapshot, which checks the caller's current membership and role itself and judges every expiry at
// one instant it fixes first. It writes, locks, reserves, notifies and sends nothing.
//
// It is one of two forms (R2, 0106). A current admin or editor gets the FULL facts an evaluation needs. Any other
// current member (a viewer) gets the RESTRICTED form: the instant, the ids and their own membership only, decided in
// SQL before the pool, budget, Pin or sources are read. The restricted form is unevaluated: it is not an empty or a
// complete pool and carries no budget, source or qualification fact, so only a full snapshot may be assembled.
//
// What it returns is SERVER-INTERNAL: ids, states, booleans and revisions the trusted assembler needs, including other
// owners' account ids. It holds no amount, label, eligible list, other member's pin, evidence reference or credential,
// and it must never be returned, logged or stored as it is: only the kernel's viewer projection leaves the server.
//
// 0107 adds one fact to each API candidate: the operator-recorded capacity reading that speaks for its exact scope at
// the snapshot's instant, or null when none does. It carries no value, evidence, channel or reflection. A full snapshot
// whose API candidates lack it (an older helper body) is not guessed: it is unavailable.
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

/** What a named source is for project work now. */
export type SelectionSourceState = 'eligible' | 'ineligible' | 'withdrawn' | 'missing'

/** A route's global qualification at the snapshot's instant. */
export type SelectionRouteState = 'current' | 'revoked' | 'expired' | 'none'

/** An account connection's own qualification at the snapshot's instant. */
export type SelectionAccountQualification =
  | { state: 'current'; operations: string[]; revision: number; id: string }
  | { state: 'revoked' | 'expired' | 'stale' | 'none' }

/** The owner's protection witness for one grant's use. */
export type SelectionProtection =
  | { witness: 'policy_absent' | 'none_applicable' }
  | {
      witness: 'covered'
      dimensions: { ref: 'account_concurrency' | 'account_spend'; verdict: 'preserves_protected' | 'would_violate' }[]
    }

/** Why the owner's conservative policy does not admit one more prospective task now (owner-internal). */
export type SelectionCapacityReason =
  'grant_spend' | 'account_spend' | 'project_budget' | 'account_slots' | 'grant_slots'

/** One window of a recorded reading (0107): provider-native unit and the source's own verdict; never a value. */
export interface SelectionObservationWindow {
  windowRef: string
  windowEpoch: string | null
  scope: 'account' | 'model' | 'spend' | 'concurrency'
  unit: string
  verdict: 'admits' | 'exhausted' | 'unknown'
  applicability: 'known' | 'partial' | 'unknown'
  resetAt: string | null
}

/** A recorded reading still bound to the candidate's current qualifications, judged at the snapshot's instant. */
export interface RecordedSelectionObservation {
  state: 'recorded'
  observationId: string
  observedAt: string
  freshUntil: string
  /** freshUntil is after the snapshot's instant. */
  fresh: boolean
  coverage: 'complete' | 'partial' | 'unavailable'
  requiredWindowRefs: string[] | null
  windows: SelectionObservationWindow[]
}

/**
 * The reading for one API candidate's exact scope (0107). `conflict`: two streams, or contradictory equal-time readings
 * without an authoritative order. `revoked`: the operator revoked it. `unbound`: its account or route qualification is
 * no longer the one it was recorded under. None of these is evidence of capacity.
 */
export type SelectionObservation = RecordedSelectionObservation | { state: 'conflict' | 'revoked' | 'unbound' }

export interface SelectionApiFacts {
  kind: 'api'
  grantId: string
  grantRevision: number
  ownerId: string
  accountId: string
  accountRevision: number
  accountProvenance: 'owner_declared' | 'unknown'
  provider: string
  connectionId: string
  connectionRevision: number
  connectionState: 'draft' | 'connected' | 'paused' | 'revoked'
  operation: string
  roleId: string
  route: string
  model: string
  effort: string
  expiresAt: string
  validFrom: string
  proofStatus: 'valid' | 'revoked' | 'stale'
  /** 0094's grant refusal codes at the snapshot's instant, with owner_not_member and pin_stale. */
  unusable: string[]
  ownerMember: boolean
  requesterEligible: boolean
  globalRoute: SelectionRouteState
  accountQualification: SelectionAccountQualification
  runtimeReady: boolean
  capacity: { admits: boolean; reasons: SelectionCapacityReason[] }
  slotsBusy: boolean
  uncertainEffects: boolean
  protection: SelectionProtection
  /** 0107: the reading for this candidate's exact scope, or null when none was observed and recorded by then. */
  observation: SelectionObservation | null
}

export interface SelectionNativeFacts {
  kind: 'native'
  resourceId: string
  resourceRevision: number
  ownerId: string
  tool: 'codex' | 'claude'
  state: 'active' | 'revoked' | 'needs_connection'
  connectionState: 'pending' | 'linked' | 'expired' | 'denied' | 'revoked' | 'rotation_unknown' | null
  route: 'current' | 'none' | 'expired' | 'revoked' | 'stale'
  qualificationRevision: number | null
  operations: string[]
  /** The operator-declared settings of a current qualification (0096), else null. */
  sourcePolicy: {
    v: 1
    instanceId: string
    models: { model: string; options: { id: string; values: (string | boolean)[] }[] }[]
  } | null
  accountKey: string | null
  accountBusy: boolean | null
  unsettledEffects: boolean | null
}

export type SelectionCandidateFacts = SelectionApiFacts | SelectionNativeFacts

/** An evaluator's snapshot (0104, marked full by 0106): everything one evaluation of the pool needs. */
export interface FullSelectionSnapshot {
  evaluation: 'full'
  evaluatedAt: string
  projectId: string
  actorId: string
  member: { role: 'admin' | 'editor'; active: boolean; revision: number }
  audienceRevision: number
  eligibilityRevision: number
  gate: { state: 'enabled' | 'disabled'; revision: number } | null
  projectBudget: boolean
  pin: { grantId: string; grantRevision: number } | null
  sources: { id: string; state: SelectionSourceState; eligibilityRevision: number | null }[]
  /** False when the pool holds more than 200 candidates: then none are listed and nothing may be ranked. */
  complete: boolean
  candidates: SelectionCandidateFacts[]
}

/** A current non-evaluator's snapshot (0106): who asked, where and when; no pool, budget, Pin, gate or source fact. */
export interface RestrictedSelectionSnapshot {
  evaluation: 'restricted'
  evaluatedAt: string
  projectId: string
  actorId: string
  member: { role: 'viewer'; active: boolean; revision: number }
}

export type SelectionSnapshot = FullSelectionSnapshot | RestrictedSelectionSnapshot

/** Whether a value is an object carrying `key`, read as unknown. */
const field = (v: unknown, key: string): unknown =>
  typeof v === 'object' && v !== null && Object.hasOwn(v, key) ? Reflect.get(v, key) : undefined
/**
 * Which form the database answered. The discriminant is checked, and a full form must name an evaluator's role: a
 * full snapshot for anyone else is never evaluated (a second line behind 0106's role-first return). The other fields
 * are the function's own output, as before.
 */
function isSnapshot(v: unknown): v is SelectionSnapshot {
  const evaluation = field(v, 'evaluation')
  const role = field(field(v, 'member'), 'role')
  if (evaluation === 'restricted') return role === 'viewer'
  return evaluation === 'full' && (role === 'admin' || role === 'editor') && observed(field(v, 'candidates'))
}

/**
 * Whether every API candidate carries 0107's observation fact (null, or a reading with its state). The read helper
 * returns it whenever 0107 is installed; its absence means another body answered, and nothing is guessed.
 */
function observed(candidates: unknown): boolean {
  if (!Array.isArray(candidates)) return false
  return candidates.every((c: unknown) => {
    if (field(c, 'kind') !== 'api') return true
    const o = field(c, 'observation')
    return o === null || typeof field(o, 'state') === 'string'
  })
}

/**
 * The calling member's selection facts for one prospective standalone research request (full for an evaluator,
 * restricted for any other current member), or null when the caller is not a current member or there is no such
 * project (the two are not told apart). `sourceIds` are the request's exact,
 * distinct named sources (at most 8; none is an expressly context-free request). Call inside withActor(..., 'read').
 */
export async function readSelectionSnapshot(
  c: pg.PoolClient,
  projectId: string,
  sourceIds: readonly string[],
): Promise<SelectionSnapshot | null> {
  let snapshot: unknown
  try {
    const { rows } = await c.query<{ snapshot: unknown }>(
      'SELECT sophia.selection_snapshot($1, $2::uuid[]) AS snapshot',
      [projectId, [...sourceIds]],
    )
    snapshot = onlyRow(rows, 'selection_snapshot').snapshot
  } catch (err) {
    throw classifyDbError(err)
  }
  if (snapshot === null) return null
  // A form without the 0106 discriminant (an older body), or a full form for a non-evaluator, is never guessed to be
  // either: it is unavailable.
  if (!isSnapshot(snapshot))
    throw new DomainError('projection_unavailable', 'The selection preview is not installed on this database')
  return snapshot
}
