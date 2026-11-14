// Operator custody of capacity readings (INC04-S03a, migration 0107; docs/plans/capacity-observations.md). Typed
// wrappers over the migration owner's two functions: record one sealed reading, or revoke one. No application role can
// execute them; scripts/record-capacity-observation.ts is their only caller outside tests.
//
// Guarantees: a reading is checked and written whole in one call, bound to the exact scope and qualifications the
// database derives from the named connection; the same key and payload replays the original receipt; a changed payload
// conflicts. Does not guarantee: anything about the provider. A reading is a claim the operator holds evidence for, not
// a feed, not current quota and not a qualification. Nothing here changes a ledger, reservation, claim or admission.
import type pg from 'pg'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

type Queryable = Pick<pg.Pool | pg.PoolClient | pg.Client, 'query'>

/** One limiting window as the source stated it. `value` is retained as custody only and never used. */
export interface CapacityWindowInput {
  windowRef: string
  windowEpoch?: string | null
  scope: 'account' | 'model' | 'spend' | 'concurrency'
  /** Required exactly for a model window: the reading's own model. */
  modelSelector?: string | null
  /** Provider-native, never converted. */
  unit: string
  value?: number | null
  verdict: 'admits' | 'exhausted' | 'unknown'
  applicability: 'known' | 'partial' | 'unknown'
  resetAt?: string | null
}

/** One reading as the operator records it. The scope is derived from the connection; nothing here is trusted alone. */
export interface CapacityObservationInput {
  observationKey: string
  connectionId: string
  /** Must be the connection's current credential revision. */
  credentialRevision: number
  /** The connection's one live account qualification (0104), exactly: its id and current revision. */
  accountQualificationId: string
  accountQualificationRevision: number
  /** A current global route qualification row for the connection's route, model and effort. */
  routeQualificationId: string
  operation: 'research'
  verification: 'operator_verified_call' | 'operator_verified_console'
  /** A reference to evidence kept outside the database; never the evidence, a key or a provider response. */
  evidenceRef: string
  sourceChannel: string
  windowSetRef: string
  windowSetVersion: string
  sourceSequence?: number | null
  coverage: 'complete' | 'partial' | 'unavailable'
  /** Complete coverage only: exactly the windows' refs. */
  requiredWindowRefs?: string[] | null
  /** Whether the reading reflects Sophia's own consumption. Recorded, never used. */
  reflection: 'unknown' | 'none' | 'some' | 'all'
  limitations?: string[]
  observedAt: string
  freshUntil: string
  windows: CapacityWindowInput[]
}

/** The receipt of a recorded reading: identical for its first write and every replay. */
export interface CapacityObservationReceipt {
  observationId: string
  observationKey: string
  accountId: string
  connectionId: string
  credentialRevision: number
  accountQualificationId: string
  accountQualificationRevision: number
  routeQualificationId: string
  coverage: 'complete' | 'partial' | 'unavailable'
  windowCount: number
  observedAt: string
  freshUntil: string
  recordedAt: string
  payloadSha256: string
}

async function call<T>(db: Queryable, sql: string, params: unknown[], name: string): Promise<T> {
  try {
    const { rows } = await db.query<{ r: T }>(sql, params)
    return onlyRow(rows, name).r
  } catch (err) {
    throw classifyDbError(err)
  }
}

/** Record one sealed reading (migration owner only). Replaying the same key and payload returns the same receipt. */
export const recordCapacityObservation = (db: Queryable, input: CapacityObservationInput) =>
  call<CapacityObservationReceipt>(
    db,
    'SELECT sophia.record_capacity_observation($1::jsonb) AS r',
    [JSON.stringify(input)],
    'record_capacity_observation',
  )

/** Revoke a reading, naming why (migration owner only). Nothing a past preview showed is undone. */
export const revokeCapacityObservation = (db: Queryable, observationId: string, reason: string) =>
  call<{ observationId: string; revokedAt: string }>(
    db,
    'SELECT sophia.revoke_capacity_observation($1, $2) AS r',
    [observationId, reason],
    'revoke_capacity_observation',
  )
