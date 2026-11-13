// The selection preview's snapshot (INC04-S01b, migration 0104; docs/plans/selection-preview.md). One read of
// sophia.selection_snapshot, which checks the caller's current membership itself and judges every expiry at one
// instant it fixes first. It writes, locks, reserves, notifies and sends nothing.
//
// What it returns is SERVER-INTERNAL: ids, states, booleans and revisions the trusted assembler needs, including other
// owners' account ids. It holds no amount, label, eligible list, other member's pin, evidence reference or credential,
// and it must never be returned, logged or stored as it is: only the kernel's viewer projection leaves the server.
import type pg from 'pg'
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

export interface SelectionSnapshot {
  evaluatedAt: string
  projectId: string
  actorId: string
  member: { role: 'admin' | 'editor' | 'viewer'; active: boolean; revision: number }
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

/**
 * The calling member's selection facts for one prospective standalone research request, or null when the caller is
 * not a current member or there is no such project (the two are not told apart). `sourceIds` are the request's exact,
 * distinct named sources (at most 8; none is an expressly context-free request). Call inside withActor(..., 'read').
 */
export async function readSelectionSnapshot(
  c: pg.PoolClient,
  projectId: string,
  sourceIds: readonly string[],
): Promise<SelectionSnapshot | null> {
  try {
    const { rows } = await c.query<{ snapshot: SelectionSnapshot | null }>(
      'SELECT sophia.selection_snapshot($1, $2::uuid[]) AS snapshot',
      [projectId, [...sourceIds]],
    )
    return onlyRow(rows, 'selection_snapshot').snapshot
  } catch (err) {
    throw classifyDbError(err)
  }
}
