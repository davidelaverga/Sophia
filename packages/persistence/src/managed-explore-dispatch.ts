import type pg from 'pg'
import type { ManagedExploreTurn } from '@sophia/contracts'
import type { ServiceControl } from './service-control.ts'
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
  sessionRefusalStatus: 'failed' | 'budget_reached' | null
  submissionId: string
  eventPossibleAt: string | null
  eventAcceptedAt: string | null
  eventRequestId: string | null
  previousRootId: string | null
  rootId: string | null
  rootStatus: RootStatus | null
  rootCompletedSeenAt: string | null
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
        | 'direction_unavailable'
        | 'parent_unavailable'
        | 'input_too_large'
        | 'provider_session_unavailable'
        | 'provider_failed'
        | 'budget_exceeded'
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
      refusalStatus?: NonNullable<ManagedExploreDispatchLease['sessionRefusalStatus']>
      requestId?: string | null
    }
  | { kind: 'createRejected'; operationId: string; reason: ProviderReason; requestId?: string | null }
  | { kind: 'environment'; providerSessionId: string; environmentId: string; status: EnvironmentStatus }
  | {
      kind: 'sessionRefused'
      providerSessionId: string
      environmentId: string
      status: 'failed' | 'budget_reached'
      requestId: string | null
    }
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
  | ({ kind: 'outputRejected'; rootId: string; reason: 'output_invalid' | 'output_missing' } & EventIdentity)
  | { kind: 'defer'; delaySeconds: number }

async function workerQuery<T>(
  pool: pg.Pool,
  statement: string,
  parameters: unknown[],
  control?: ServiceControl,
): Promise<T> {
  return withService(
    pool,
    async (c) => {
      const { rows } = await c.query<{ result: T }>(statement, parameters)
      return onlyRow(rows, 'managed Explore dispatch').result
    },
    control,
  )
}

/** Claim one exact route, or a possible prior effect on that route when new mutations are paused. */
export function claimManagedExploreDispatch(
  pool: pg.Pool,
  scope: ManagedExploreDispatchScope,
  control?: ServiceControl,
) {
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
    control,
  )
}

export function readManagedExploreDispatch(
  pool: pg.Pool,
  { projectId, turnId, leaseToken }: ManagedExploreDispatchIdentity,
  control?: ServiceControl,
) {
  return workerQuery<ManagedExploreDispatchLease>(
    pool,
    'SELECT sophia.read_managed_explore_dispatch($1,$2,$3) AS result',
    [projectId, turnId, leaseToken],
    control,
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
  control?: ServiceControl,
) {
  return workerQuery<ManagedExplorePreparedDispatch>(
    pool,
    'SELECT sophia.prepare_managed_explore_dispatch($1,$2,$3,$4,$5) AS result',
    [projectId, turnId, leaseToken, action.kind, action.kind === 'event' ? action.predecessorRootId : null],
    control,
  )
}

/** Record durable evidence under the current lease. Provider output still needs kind-specific validation. */
export async function recordManagedExploreDispatch(
  pool: pg.Pool,
  { projectId, turnId, leaseToken }: ManagedExploreDispatchIdentity,
  observation: ManagedExploreDispatchObservation,
  control?: ServiceControl,
): Promise<void> {
  const identity = [projectId, turnId, leaseToken]
  await withService(
    pool,
    async (client) => {
      if (observation.kind !== 'sessionRefused') {
        await client.query('SELECT sophia.record_managed_explore_dispatch($1,$2,$3,$4)', [
          ...identity,
          JSON.stringify(observation),
        ])
      }
      if (observation.kind !== 'sessionRefused' && observation.kind !== 'created') return
      const status = observation.kind === 'sessionRefused' ? observation.status : observation.refusalStatus
      if (status) {
        const { providerSessionId, environmentId, requestId } = observation
        await client.query('SELECT sophia.refuse_managed_explore_session($1,$2,$3,$4,$5,$6,$7)', [
          ...identity,
          providerSessionId,
          environmentId,
          status,
          requestId,
        ])
      }
    },
    control,
  )
}
