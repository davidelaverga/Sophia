// Member API contributions for Explore (INC01-CC-004 S5-a, migration 0094; docs/plans/api-contributions.md).
// Typed wrappers over the 0094 functions. Callers:
//   * the owner, admins and members (sophia_api) inside withActor; every actor is derived server-side;
//   * the operator (migration owner): registration, rotation, retirement and route qualification. No application
//     role can execute those.
// Sophia stores references and revisions only: never a key value, fingerprint, provider billing ID or token. The caps
// are the owner's authorization of Sophia-metered spend, not a provider balance. Balance, benefit and provider-verified
// identity are unknown. Model calls of a contributed task are paid by the contributor's API account; search and read
// keep the project's payer.
import type pg from 'pg'
import { DomainError } from '@sophia/domain'
import { classifyDbError, pgError } from './errors.ts'
import { onlyRow } from './rows.ts'

/** The one route this slice contributes, pinned exactly as config/runtime-unit.json records it. */
export const CONTRIBUTION_ROUTE = {
  roleId: 'sophia-research-md-v1',
  routeId: 'research-sol-medium-v1',
  provider: 'openai-research',
  model: 'gpt-6.1-sol',
  effort: 'medium',
  credentialRef: 'OPENAI_RESEARCH_API_KEY',
  baseURL: 'https://api.openai.com/v1',
  output: 'markdown',
} as const

/** Reasons a contribution is not ready for an actor; none of these is ever hidden behind a single "connected". */
export type ContributionReadinessReason =
  | 'grant_missing'
  | 'grant_revoked'
  | 'grant_paused'
  | 'grant_expired'
  | 'admin_disabled'
  | 'connection_not_connected'
  | 'owner_not_member'
  | 'requester_ineligible'
  | 'project_research_gate_closed'
  | 'route_unqualified'
  | 'runtime_unavailable'
  | 'account_busy'

/**
 * A typed refusal from admission, a reservation or a pin: unavailable (wait or choose again) or not permitted. A
 * DomainError, so a transaction passes it through; `refusal` carries the exact contribution reason code.
 */
export class ContributionRefusal extends DomainError {
  readonly kind: 'unavailable' | 'not_permitted'
  readonly refusal: string
  constructor(kind: 'unavailable' | 'not_permitted', refusal: string, options?: { cause?: unknown }) {
    super(
      kind === 'unavailable' ? 'contribution_unavailable' : 'forbidden',
      `Contribution ${kind === 'unavailable' ? 'unavailable' : 'not permitted'}: ${refusal}`,
      options,
    )
    this.name = 'ContributionRefusal'
    this.kind = kind
    this.refusal = refusal
  }
}

/** A policy the source cannot honestly enforce (Stop or finish settlement, benefit-only funding, another model). */
export class ContributionUnsupported extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('invalid_request', message, options)
    this.name = 'ContributionUnsupported'
  }
}

const REFUSAL = /^Contribution (unavailable|not permitted): ([a-z_]+)$/

/** The typed contribution refusal inside a database error, or null (for consumers such as research admission). */
export function contributionRefusalOf(err: unknown): ContributionRefusal | null {
  const { message } = pgError(err)
  const m = REFUSAL.exec(message)
  if (!m?.[1] || !m[2]) return null
  return new ContributionRefusal(m[1] === 'unavailable' ? 'unavailable' : 'not_permitted', m[2], { cause: err })
}

function classify(err: unknown): Error {
  const refusal = contributionRefusalOf(err)
  if (refusal) return refusal
  const { code, message } = pgError(err)
  if (
    code === '0A000' &&
    /^(Unsupported (active-settlement|funding|unknown-usage) policy |Only Markdown research on )/.test(message)
  )
    return new ContributionUnsupported(message, { cause: err })
  return classifyDbError(err)
}

type Queryable = Pick<pg.Pool | pg.PoolClient | pg.Client, 'query'>

async function call<T>(db: Queryable, sql: string, params: unknown[], name: string): Promise<T> {
  try {
    const { rows } = await db.query<{ r: T }>(sql, params)
    return onlyRow(rows, name).r
  } catch (err) {
    throw classify(err)
  }
}

// ---- the HTTP boundary's writes (S5b): one idempotent entry ----

/** Every HTTP write, by operation. Each is one 0094 function behind the actor-scoped idempotency ledger. */
export const CONTRIBUTION_WRITES = [
  'account_create',
  'account_update',
  'connection_create',
  'connection_state',
  'grant_create',
  'grant_update',
  'grant_state',
  'admin_disable',
  'admin_lift',
  'admin_narrow',
  'pin_set',
  'pin_clear',
] as const
export type ContributionWrite = (typeof CONTRIBUTION_WRITES)[number]

/**
 * One write through `api_contribution_write`, inside withActor (the actor is the verified caller, never a field). The
 * same key and request replays the first receipt, under the operation's current authority; another request under the
 * key is `idempotency_conflict`. The request holds exactly the operation's fields; ids, revisions and receipts only.
 */
export const contributionWrite = <T = Record<string, unknown>>(
  c: pg.PoolClient,
  operation: ContributionWrite,
  key: string,
  request: Record<string, unknown>,
) =>
  call<T>(
    c,
    'SELECT sophia.api_contribution_write($1, $2, $3::jsonb) AS r',
    [operation, key, JSON.stringify(request)],
    'api_contribution_write',
  )

// ---- the owner (inside withActor) ----

export interface ApiAccountInput {
  label: string
  /** The owner's ceiling on Sophia-metered spend across all their grants: an authorization, not a balance. */
  totalCapUsd: number
  /** Concurrent contributed assignments across every project and alias; 1 unless the owner approves more (≤ 3). */
  concurrency?: number
  provenance?: 'owner_declared' | 'unknown'
  /** Only for a second account of the same provider: why it is separately owned. Otherwise aliases share one root. */
  separateOwnershipNote?: string
}

export const createApiAccount = (c: pg.PoolClient, input: ApiAccountInput) =>
  call<{ accountId: string; revision: number }>(
    c,
    'SELECT sophia.api_account_create($1, $2, $3, $4, $5) AS r',
    [
      input.label,
      input.totalCapUsd,
      input.concurrency ?? 1,
      input.provenance ?? 'owner_declared',
      input.separateOwnershipNote ?? null,
    ],
    'api_account_create',
  )

/**
 * The owner's protection declaration for one account (INC04-S01b, 0104): replaced whole, or withdrawn with null. Its
 * values are the owner's: none is defaulted or inferred. `none_applicable` is an explicit scoped decision for exactly
 * research by the research role; `protected` keeps owner-entered slots and/or spend free of one more task.
 */
export interface AccountProtection {
  applicability: 'none_applicable' | 'protected'
  operations: ['research']
  roles: ['sophia-research-md-v1']
  protectedConcurrency?: number
  protectedSpendUsd?: number
  validUntil?: string | null
}

export const updateApiAccount = (
  c: pg.PoolClient,
  accountId: string,
  expectedRevision: number,
  patch: Partial<Pick<ApiAccountInput, 'label' | 'totalCapUsd' | 'concurrency' | 'provenance'>> & {
    protection?: AccountProtection | null
  },
) =>
  call<{ accountId: string; revision: number }>(
    c,
    'SELECT sophia.api_account_update($1, $2, $3) AS r',
    [accountId, expectedRevision, JSON.stringify(patch)],
    'api_account_update',
  )

export type ApiConnectionState = 'draft' | 'connected' | 'paused' | 'revoked'

export const createApiConnection = (c: pg.PoolClient, accountId: string, label: string, custodianLabel: string) =>
  call<{ connectionId: string; revision: number; state: ApiConnectionState }>(
    c,
    'SELECT sophia.api_connection_create($1, $2, $3) AS r',
    [accountId, label, custodianLabel],
    'api_connection_create',
  )

export const setApiConnectionState = (
  c: pg.PoolClient,
  connectionId: string,
  expectedRevision: number,
  state: 'paused' | 'connected' | 'revoked',
) =>
  call<{ connectionId: string; revision: number; state: ApiConnectionState }>(
    c,
    'SELECT sophia.api_connection_set_state($1, $2, $3) AS r',
    [connectionId, expectedRevision, state],
    'api_connection_set_state',
  )

/**
 * The one active-settlement policy (INC01-CC-004 S5-a r2). Once a contribution's authority fails (pause, revoke,
 * expiry, admin disable, revision change, membership loss, credential rotation, route qualification withdrawn or
 * expired) no queued create, resume or steer is dispatched and no new paid model call is reserved. An output already
 * authorized and possible may still be published, under the payer and revision it was made under, unless the grant was
 * revoked or admin-disabled, the requester or owner is no longer a member, or a source it read was withdrawn: then it
 * is withheld. An active provider request is not stopped.
 */
export const BLOCK_NEW_CALLS_POLICY =
  'block_new_calls: no new dispatch and no new paid model call once its authority fails; an output already authorized ' +
  'may still publish under its original payer and revision, unless the grant was revoked or admin-disabled, the ' +
  'requester or owner left, or a source it read was withdrawn (then withheld); an active provider request is not stopped'

/** A grant's settings. Only `block_new_calls` and `bounded_total_spend` are supported; anything else is refused. */
export interface ContributionSettings {
  expiresAt?: string
  eligible?: 'editors' | 'listed'
  eligibleActors?: string[]
  taskCapUsd?: number
  totalCapUsd?: number
  concurrency?: number
  fundingPolicy?: 'bounded_total_spend'
  /** The owner's acknowledgement that the provider may draw on purchased or mixed funds. */
  fundingAcknowledgementRef?: string
  /** The only policy: BLOCK_NEW_CALLS_POLICY. */
  activeSettlement?: 'block_new_calls'
  unknownUsagePolicy?: 'hold_uncertain'
}

export interface ContributionGrantReceipt {
  grantId: string
  projectId: string
  revision: number
  state: 'enabled' | 'paused' | 'revoked'
  adminDisabled: boolean
  expiresAt: string
}

export const createContributionGrant = (
  c: pg.PoolClient,
  connectionId: string,
  projectId: string,
  settings: ContributionSettings &
    Required<
      Pick<
        ContributionSettings,
        'expiresAt' | 'taskCapUsd' | 'totalCapUsd' | 'fundingPolicy' | 'fundingAcknowledgementRef'
      >
    >,
) =>
  call<ContributionGrantReceipt>(
    c,
    'SELECT sophia.api_grant_create($1, $2, $3) AS r',
    [connectionId, projectId, JSON.stringify(settings)],
    'api_grant_create',
  )

/** The owner's edit: may enlarge or narrow. Needs the revision the owner saw. */
export const updateContributionGrant = (
  c: pg.PoolClient,
  grantId: string,
  expectedRevision: number,
  settings: ContributionSettings,
) =>
  call<ContributionGrantReceipt>(
    c,
    'SELECT sophia.api_grant_update($1, $2, $3) AS r',
    [grantId, expectedRevision, JSON.stringify(settings)],
    'api_grant_update',
  )

export const setContributionGrantState = (
  c: pg.PoolClient,
  grantId: string,
  expectedRevision: number,
  state: 'enabled' | 'paused' | 'revoked',
) =>
  call<ContributionGrantReceipt>(
    c,
    'SELECT sophia.api_grant_set_state($1, $2, $3) AS r',
    [grantId, expectedRevision, state],
    'api_grant_set_state',
  )

// ---- a project admin: narrow or disable only ----

export const adminDisableContribution = (c: pg.PoolClient, grantId: string, expectedRevision: number, reason: string) =>
  call<ContributionGrantReceipt>(
    c,
    'SELECT sophia.api_grant_admin_disable($1, $2, $3) AS r',
    [grantId, expectedRevision, reason],
    'api_grant_admin_disable',
  )

export const adminLiftContribution = (c: pg.PoolClient, grantId: string, expectedRevision: number) =>
  call<ContributionGrantReceipt>(
    c,
    'SELECT sophia.api_grant_admin_lift($1, $2) AS r',
    [grantId, expectedRevision],
    'api_grant_admin_lift',
  )

export const adminNarrowContribution = (
  c: pg.PoolClient,
  grantId: string,
  expectedRevision: number,
  patch: Pick<
    ContributionSettings,
    'expiresAt' | 'eligible' | 'eligibleActors' | 'taskCapUsd' | 'totalCapUsd' | 'concurrency'
  >,
) =>
  call<ContributionGrantReceipt>(
    c,
    'SELECT sophia.api_grant_admin_narrow($1, $2, $3) AS r',
    [grantId, expectedRevision, JSON.stringify(patch)],
    'api_grant_admin_narrow',
  )

// ---- a member: the explicit funding pin (the model never names a payer) ----

export const setResearchFundingPin = (c: pg.PoolClient, projectId: string, grantId: string, expectedRevision: number) =>
  call<{ projectId: string; grantId: string; grantRevision: number }>(
    c,
    'SELECT sophia.research_funding_pin_set($1, $2, $3) AS r',
    [projectId, grantId, expectedRevision],
    'research_funding_pin_set',
  )

export const clearResearchFundingPin = (c: pg.PoolClient, projectId: string) =>
  call<{ projectId: string; grantId: null }>(
    c,
    'SELECT sophia.research_funding_pin_clear($1) AS r',
    [projectId],
    'research_funding_pin_clear',
  )

// ---- projections ----

export interface ProjectContribution {
  grantId: string
  revision: number
  ownerId: string
  label: string
  route: string
  model: string
  effort: string
  output: 'markdown'
  taskCapUsd: string
  totalCapUsd: string
  concurrency: number
  expiresAt: string
  state: 'enabled' | 'paused'
  adminDisabled: boolean
  fundingPolicy: 'bounded_total_spend'
  activeSettlement: 'block_new_calls'
  eligibleForMe: boolean
  readiness: ContributionReadinessReason[]
}

/** What a project member may see: limits, state and their own readiness; no account, usage or other projects. */
export const readProjectContributions = (c: pg.PoolClient, projectId: string) =>
  call<{
    contributions: ProjectContribution[]
    myPin: { grantId: string; grantRevision: number; stale: boolean } | null
  }>(c, 'SELECT sophia.api_contributions_for_project($1) AS r', [projectId], 'api_contributions_for_project')

/** The owner's own accounts, connections and grants with Sophia-metered commitments. Provider balance is unknown. */
export const readMyContributions = (c: pg.PoolClient) =>
  call<{
    accounts: {
      accountId: string
      label: string
      provenance: 'owner_declared' | 'unknown'
      concurrencyLimit: number
      totalCapUsd: string
      committedUsd: string
      slotsHeld: number
      providerBalance: 'unknown'
      revision: number
      /** 0104: the owner's own declaration, or null (no declaration: policy absent). */
      protection:
        | (Required<Omit<AccountProtection, 'protectedConcurrency' | 'protectedSpendUsd' | 'validUntil'>> & {
            protectedConcurrency: number | null
            protectedSpendUsd: string | null
            declaredAt: string
            validUntil: string | null
          })
        | null
    }[]
    connections: {
      connectionId: string
      accountId: string
      state: ApiConnectionState
      credentialRef: string
      credentialRevision: number
      revision: number
      /** 0104: the operator's account-scoped qualification of this connection, judged now. Never its evidence. */
      accountQualification: AccountQualificationView
    }[]
    grants: (ContributionGrantReceipt & { committedUsd: string; readiness: ContributionReadinessReason[] })[]
  }>(c, 'SELECT sophia.api_contributions_mine() AS r', [], 'api_contributions_mine')

/** The owner's readout of a connection's account qualification (0104): a record judged now, not live access. */
export interface AccountQualificationView {
  state: 'current' | 'expired' | 'revoked' | 'stale' | 'none'
  verification: 'operator_verified_call' | 'operator_verified_console' | null
  recordedBy: 'operator' | null
  observedAt: string | null
  expiresAt: string | null
  credentialRevision: number | null
  revoked: boolean
}

/** An observed setting: unknown unless the runtime actually reported it. Never copied from the request. */
export type Observed<T> = 'unknown' | T

export type ResearchTaskFunding =
  | {
      taskId: string
      funding: 'project'
      payers: { model: 'project'; search: 'project'; read: 'project' }
    }
  | {
      taskId: string
      funding: 'contribution'
      ownerId: string
      grantId: string
      grantRevision: number
      credentialRevision: number
      requesterId: string
      payers: { model: 'contributor_api_account'; search: 'project'; read: 'project' }
      settings: {
        requested: { route: string; model: string; effort: string }
        accepted: 'unknown'
        observedModels: Observed<string[]>
        observedEffort: 'unknown'
      }
    }

export const readResearchTaskFunding = (c: pg.PoolClient, projectId: string, taskId: string) =>
  call<ResearchTaskFunding>(
    c,
    'SELECT sophia.research_task_funding($1, $2) AS r',
    [projectId, taskId],
    'research_task_funding',
  )

// ---- the operator (migration owner only) ----

export interface ContributionRegistration {
  runtimeId: string
  resourceId: string
  credentialRevision: number
  connectionState: ApiConnectionState
}

/**
 * Register a contribution runtime for one project. `rotate` advances the credential revision and drains every older
 * runtime of the connection (they may still settle what they reserved). Only the capability's SHA-256 is stored.
 */
export const registerContributionRuntime = (
  db: Queryable,
  input: { projectId: string; connectionId: string; runtimeUnitId: string; tokenSha256: Buffer; rotate: boolean },
) =>
  call<ContributionRegistration>(
    db,
    'SELECT sophia.register_contribution_runtime($1, $2, $3, $4, $5) AS r',
    [input.projectId, input.connectionId, input.runtimeUnitId, input.tokenSha256, input.rotate],
    'register_contribution_runtime',
  )

/**
 * Record that one account's connection, at its CURRENT credential revision, was verified for its route, model, effort
 * and operations (INC04-S01b, 0104). Migration owner only. Evidence stays outside the database, named by reference;
 * no credential is read and no provider is called. Recording it is not live qualification by itself: the global route
 * qualification is still required, and a credential rotation stales it.
 */
export const qualifyApiAccount = (
  db: Queryable,
  input: {
    connectionId: string
    operations: ['research']
    verification: 'operator_verified_call' | 'operator_verified_console'
    evidenceRef: string
    observedAt: string
    expiresAt: string
  },
) =>
  call<{
    qualificationId: string
    accountId: string
    connectionId: string
    credentialRevision: number
    expiresAt: string
  }>(
    db,
    'SELECT sophia.qualify_api_account($1, $2, $3, $4, $5, $6) AS r',
    [input.connectionId, input.operations, input.verification, input.evidenceRef, input.observedAt, input.expiresAt],
    'qualify_api_account',
  )

/** Revoke an account qualification, naming why (migration owner only). Nothing it already allowed is undone. */
export const revokeApiAccountQualification = async (db: Queryable, qualificationId: string, reason: string) => {
  await db.query('SELECT sophia.revoke_api_account_qualification($1, $2)', [qualificationId, reason])
}

export const retireContributionRuntime = (db: Queryable, projectId: string, resourceId: string) =>
  call<{ resourceId: string; unresolvedReservations: number }>(
    db,
    'SELECT sophia.retire_contribution_runtime($1, $2) AS r',
    [projectId, resourceId],
    'retire_contribution_runtime',
  )
