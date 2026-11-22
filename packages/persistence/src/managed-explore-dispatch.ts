import type pg from 'pg'
import type { ManagedExploreTurn } from '@sophia/contracts'
import { onlyRow } from './rows.ts'
import { withService } from './tx.ts'

/** The worker's installed credential route. These identifiers are looked up at startup from trusted settings. */
export interface ManagedExploreDispatchScope {
  workerId: string
  routeId: string
  credentialGeneration: number
  providerOrg: string
  providerProject: string
  leaseSeconds: number
  allowSend: boolean
}

type EnvironmentStatus =
  'pending' | 'provisioning' | 'ready' | 'connected' | 'disconnected' | 'suspended' | 'expired' | 'failed'
type RootStatus = 'queued' | 'in_progress' | 'waiting' | 'completed' | 'failed' | 'cancelled'
type TerminalStatus = Extract<RootStatus, 'completed' | 'failed' | 'cancelled'>
type ProviderUsage = { inputTokens: number; outputTokens: number; totalTokens: number }

export interface ManagedExploreDispatchIdentity {
  projectId: string
  turnId: string
  leaseToken: string
}

export interface ManagedExploreDispatchLease extends ManagedExploreDispatchIdentity {
  sessionId: string
  turnKind: ManagedExploreTurn['kind']
  turnStatus: ManagedExploreTurn['status']
  outboxId: string
  leaseUntil: string
  allowSend: boolean
  model: string
  sessionLimitCents: number
  createOperationId: string
  createPossibleAt: string | null
  providerSessionId: string | null
  environmentId: string | null
  environmentStatus: EnvironmentStatus | null
  submissionId: string
  eventPossibleAt: string | null
  eventAcceptedAt: string | null
  eventRequestId: string | null
  previousRootId: string | null
  rootId: string | null
  rootStatus: RootStatus | null
  payloadSha256: string | null
  usage: ProviderUsage | null
}

export type ManagedExploreDispatchAction = { kind: 'create' } | { kind: 'event'; predecessorRootId: string | null }

interface EventIdentity {
  providerSessionId: string
  submissionId: string
  payloadSha256: string
  previousRootId: string | null
}

export type ManagedExplorePreparedDispatch =
  | { kind: 'create'; operationId: string; model: string; sessionLimitCents: number; leaseUntil: string }
  | ({ kind: 'event'; instruction: string; leaseUntil: string } & EventIdentity)
  | { kind: 'observe' }
  | { kind: 'blocked'; reason: 'worker_send_disabled' | 'environment_unavailable' }
  | {
      kind: 'denied'
      reason:
        | 'project_unavailable'
        | 'membership_changed'
        | 'funding_unavailable'
        | 'source_unavailable'
        | 'parent_unavailable'
        | 'provider_session_unavailable'
    }

type ProviderReason =
  | 'authorization'
  | 'model_unavailable'
  | 'credit_exhausted'
  | 'budget_exceeded'
  | 'billing_unavailable'
  | 'declined'
  | 'provider_failed'
  | 'cancelled'

export type ManagedExploreDispatchObservation =
  | {
      kind: 'created'
      operationId: string
      providerSessionId: string
      environmentId: string
      model: string
      sessionLimitCents: number
      networkAccess: 'disabled'
      requestId?: string | null
    }
  | { kind: 'createRejected'; operationId: string; reason: ProviderReason; requestId?: string | null }
  | { kind: 'environment'; providerSessionId: string; environmentId: string; status: EnvironmentStatus }
  | ({ kind: 'eventAccepted'; requestId?: string | null } & EventIdentity)
  | ({ kind: 'eventRejected'; reason: ProviderReason; requestId?: string | null } & EventIdentity)
  | ({
      kind: 'root'
      rootId: string
      status: RootStatus
      usage?: ProviderUsage | null
    } & EventIdentity)
  | ({
      kind: 'settle'
      rootId: string
      status: TerminalStatus
      reply?: string
      reason?: ProviderReason
    } & EventIdentity)
  | { kind: 'defer'; delaySeconds: number }

async function workerQuery<T>(pool: pg.Pool, statement: string, parameters: unknown[]): Promise<T> {
  return withService(pool, async (c) => {
    const { rows } = await c.query<{ result: T }>(statement, parameters)
    return onlyRow(rows, 'managed Explore dispatch').result
  })
}

/** Claim one exact route, or a possible prior effect on that route when new mutations are paused. */
export function claimManagedExploreDispatch(pool: pg.Pool, scope: ManagedExploreDispatchScope) {
  return workerQuery<ManagedExploreDispatchLease | null>(
    pool,
    'SELECT sophia.claim_managed_explore_dispatch($1,$2,$3,$4,$5,$6,$7) AS result',
    [
      scope.workerId,
      scope.routeId,
      scope.credentialGeneration,
      scope.providerOrg,
      scope.providerProject,
      scope.leaseSeconds,
      scope.allowSend,
    ],
  )
}

export function readManagedExploreDispatch(
  pool: pg.Pool,
  { projectId, turnId, leaseToken }: ManagedExploreDispatchIdentity,
) {
  return workerQuery<ManagedExploreDispatchLease>(
    pool,
    'SELECT sophia.read_managed_explore_dispatch($1,$2,$3) AS result',
    [projectId, turnId, leaseToken],
  )
}

/**
 * Returns the sole authorization for an external call only after COMMIT. The caller checks leaseUntil at invocation.
 * A repeat after a timeout, a committed possible send, or an unknown COMMIT may only observe the original identity.
 */
export function prepareManagedExploreDispatch(
  pool: pg.Pool,
  { projectId, turnId, leaseToken }: ManagedExploreDispatchIdentity,
  action: ManagedExploreDispatchAction,
) {
  return workerQuery<ManagedExplorePreparedDispatch>(
    pool,
    'SELECT sophia.prepare_managed_explore_dispatch($1,$2,$3,$4,$5) AS result',
    [projectId, turnId, leaseToken, action.kind, action.kind === 'event' ? action.predecessorRootId : null],
  )
}

/** Record durable evidence under the current lease. Provider output still needs kind-specific validation. */
export async function recordManagedExploreDispatch(
  pool: pg.Pool,
  { projectId, turnId, leaseToken }: ManagedExploreDispatchIdentity,
  observation: ManagedExploreDispatchObservation,
): Promise<void> {
  await workerQuery<unknown>(pool, 'SELECT sophia.record_managed_explore_dispatch($1,$2,$3,$4) AS result', [
    projectId,
    turnId,
    leaseToken,
    JSON.stringify(observation),
  ])
}
