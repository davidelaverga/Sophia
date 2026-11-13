// The selection preview's trusted assembler (INC04-S01b; docs/plans/selection-preview.md). A pure mapping from the
// server-internal snapshot (0104) to the kernel's SelectionInput for ONE closed profile: a new standalone research
// request (explore, explorer). It reads no clock, network or storage; the snapshot's one instant is the evaluation's.
//
// Guarantees: the actor, project and every fact come from the authenticated snapshot, never from a client field;
// missing proof stays unknown or absent and is never mapped to clear, current or not_applicable; no Prefer, route
// override, cross-payer authority or strict settings is invented; strict settings are null, so no disclosure is made.
// Does not guarantee: anything the kernel itself does not (see allocation-selection.ts). Its output is internal: only
// projectSelection of the evaluated decision may leave the server.
import {
  evaluateSelection,
  projectSelection,
  SELECTION_INPUT_CONTRACT,
  SELECTION_POLICY_VERSION,
  type Authority,
  type Candidate,
  type GrantCode,
  type ResolvedProof,
  type Role,
  type SelectionInput,
  type SelectionView,
  type Settings,
  type SettingsDeclaration,
} from '@sophia/domain'
import type { SelectionApiFacts, SelectionNativeFacts, SelectionSnapshot } from '@sophia/persistence'

/** The one closed profile of this slice (root D1/D2): fresh standalone research, explore family, explorer role. */
export const RESEARCH_PROFILE = {
  family: 'explore',
  operationRef: 'research',
  role: 'explorer',
  requiredOperations: ['research'],
  requiredCapabilities: [],
} as const

/** The runtime role a research contribution grant names (0094), and the kernel role it is. */
const ROLE_OF: Readonly<Record<string, Role>> = { 'sophia-research-md-v1': 'explorer' }

const GRANT_CODES: ReadonlySet<string> = new Set([
  'grant_missing',
  'grant_revoked',
  'admin_disabled',
  'grant_paused',
  'grant_expired',
  'pin_stale',
  'requester_ineligible',
  'owner_not_member',
  'operation_not_granted',
  'route_unqualified',
])
const isGrantCode = (code: string): code is GrantCode => GRANT_CODES.has(code)

const UNKNOWN_RANKING = {
  suitabilityTier: { status: 'unknown' },
  availableAt: { status: 'unknown' },
  reliability: { status: 'unknown' },
  costLatencyTier: { status: 'unknown' },
} as const

export const apiRef = (grantId: string) => `api:${grantId}`
export const nativeRef = (resourceId: string) => `native:${resourceId}`

/** The grant's provider-native settings: its route is the provider instance, its effort the one declared option. */
function grantDeclaration(f: SelectionApiFacts): SettingsDeclaration {
  return { providerInstanceRef: f.route, models: [{ model: f.model, options: [{ id: 'effort', values: [f.effort] }] }] }
}
function grantSeed(f: SelectionApiFacts): Settings {
  return { providerInstanceRef: f.route, model: f.model, options: [{ id: 'effort', value: f.effort }] }
}

/** Where the request's named sources stand: all eligible, or the first that is not. */
function sourceControl(s: SelectionSnapshot): SelectionInput['control']['source'] {
  if (s.sources.some((x) => x.state === 'withdrawn')) return 'withdrawn'
  return s.sources.every((x) => x.state === 'eligible') ? 'eligible' : 'ineligible'
}

function authorityOf(s: SelectionSnapshot): SelectionInput['control']['authority'] {
  if (!s.member.active) return 'not_member'
  return s.member.role === 'viewer' ? 'cannot_edit' : 'current'
}

/** The owner's bounded-spend grant as a conservative capacity proof for exactly this use (root D3). */
function capacityProof(s: SelectionSnapshot, f: SelectionApiFacts): ResolvedProof {
  return {
    proposition: 'conservative_capacity_policy',
    status: f.proofStatus,
    issuer: 'owner',
    authorizerRef: f.ownerId,
    scope: {
      projectRef: s.projectId,
      ownerRef: f.ownerId,
      accountGroupRef: f.accountId,
      payerScopeRef: f.accountId,
      fromPayerScopeRef: null,
      routeKind: 'api',
      family: RESEARCH_PROFILE.family,
      operationRef: RESEARCH_PROFILE.operationRef,
      roles: [RESEARCH_PROFILE.role],
    },
    effectiveRevisionRef: `g${String(f.grantRevision)}`,
    validFrom: f.validFrom,
    validUntil: f.expiresAt,
    boundedUseRef: f.grantId,
  }
}

function apiAuthority(s: SelectionSnapshot, f: SelectionApiFacts): Authority {
  const role = ROLE_OF[f.roleId]
  return {
    basis: 'contribution_grant',
    grant: {
      grantRef: f.grantId,
      revisionRef: `g${String(f.grantRevision)}`,
      ownerRef: f.ownerId,
      projectRef: s.projectId,
      expiresAt: f.expiresAt,
      unusable: f.unusable.filter(isGrantCode),
      requesterEligible: f.requesterEligible,
      operationRefs: [f.operation],
      roles: role === undefined ? [] : [role],
      allowedSettings: [grantDeclaration(f)],
    },
  }
}

/** Route qualification needs BOTH the global route record and the account's own current one (root D8). */
function apiRoute(f: SelectionApiFacts): Candidate['qualification']['route'] {
  if (f.globalRoute !== 'current') return f.globalRoute
  return f.accountQualification.state
}

const API_CONNECTION: Readonly<Record<SelectionApiFacts['connectionState'], Candidate['qualification']['connection']>> =
  { draft: 'not_connected', connected: 'linked', paused: 'paused', revoked: 'revoked' }

function apiQualification(f: SelectionApiFacts): Candidate['qualification'] {
  const q = f.accountQualification
  return {
    route: apiRoute(f),
    operations: q.state === 'current' ? q.operations : [],
    capabilities: [],
    connection: API_CONNECTION[f.connectionState],
    host: f.runtimeReady ? 'current' : 'offline',
  }
}

/** Disclosure needs the owner's current membership, the requester's eligibility, the gate and every named source. */
function apiDisclosure(s: SelectionSnapshot, f: SelectionApiFacts): Candidate['sourceDisclosure'] {
  const open = s.gate?.state === 'enabled' && sourceControl(s) === 'eligible'
  return f.ownerMember && f.requesterEligible && open ? 'permitted' : 'denied'
}

function apiCandidate(s: SelectionSnapshot, f: SelectionApiFacts): Candidate {
  return {
    candidateRef: apiRef(f.grantId),
    factsRevisionRef: `g${String(f.grantRevision)}.c${String(f.connectionRevision)}.a${String(f.accountRevision)}.q${
      f.accountQualification.state === 'current' ? String(f.accountQualification.revision) : '0'
    }`,
    routeKind: 'api',
    providerRef: f.provider,
    ownerRef: f.ownerId,
    payerScopeRef: f.accountId,
    accountGroup: {
      identity: f.accountProvenance === 'owner_declared' ? 'owner_confirmed' : 'uncertain',
      groupRef: f.accountId,
    },
    authority: apiAuthority(s, f),
    nativeDelegation: 'not_applicable',
    sourceDisclosure: apiDisclosure(s, f),
    qualification: apiQualification(f),
    settings: { declared: grantDeclaration(f), defaultSeed: grantSeed(f) },
    capacity: {
      basis: 'conservative_policy',
      limits: { witness: 'unknown' },
      windows: [],
      policy: { proof: capacityProof(s, f), verdict: f.capacity.admits ? 'admits' : 'busy' },
    },
    protection: apiProtection(f),
    commitments: {
      unsettledEffects: f.uncertainEffects ? 'present' : 'none',
      accountGroupBusy: f.slotsBusy ? 'busy' : 'free',
    },
    session: { kind: 'new' },
    ranking: UNKNOWN_RANKING,
    share: [{ viewerRef: s.actorId, fields: ['route_kind', 'settings'] }],
  }
}

function apiProtection(f: SelectionApiFacts): Candidate['protection'] {
  const p = f.protection
  if (p.witness !== 'covered') return { witness: p.witness }
  return {
    witness: 'covered',
    requiredDimensionRefs: p.dimensions.map((d) => d.ref),
    verdicts: p.dimensions.map((d) => ({ dimensionRef: d.ref, verdict: d.verdict })),
  }
}

const NATIVE_CONNECTION: Readonly<
  Record<NonNullable<SelectionNativeFacts['connectionState']>, Candidate['qualification']['connection']>
> = {
  pending: 'not_connected',
  linked: 'linked',
  expired: 'expired',
  denied: 'not_connected',
  revoked: 'revoked',
  rotation_unknown: 'unknown',
}

/** A recorded yes/no, or unknown where no record exists. */
const tri = <Y extends string, N extends string>(v: boolean | null, yes: Y, no: N): Y | N | 'unknown' =>
  v === null ? 'unknown' : v ? yes : no

/** Recorded facts only: no host freshness, capacity or reserve rule exists, so those stay unknown or absent. */
function nativeCandidate(s: SelectionSnapshot, f: SelectionNativeFacts): Candidate {
  const own = f.ownerId === s.actorId
  const p = f.sourcePolicy
  return {
    candidateRef: nativeRef(f.resourceId),
    factsRevisionRef: `r${String(f.resourceRevision)}.q${String(f.qualificationRevision ?? 0)}`,
    routeKind: 'native',
    providerRef: f.tool,
    ownerRef: f.ownerId,
    payerScopeRef: f.accountKey ?? nativeRef(f.resourceId),
    accountGroup: {
      identity: f.accountKey === null ? 'uncertain' : 'operator_recorded',
      groupRef: f.accountKey ?? nativeRef(f.resourceId),
    },
    authority: own ? { basis: 'owner_own_use' } : { basis: 'unknown' },
    nativeDelegation: own ? 'not_applicable' : 'unqualified',
    sourceDisclosure: 'unknown',
    qualification: {
      route: f.route,
      operations: f.operations,
      capabilities: [],
      connection: f.connectionState === null ? 'unknown' : NATIVE_CONNECTION[f.connectionState],
      host: 'unknown',
    },
    settings: {
      declared: p === null ? 'unknown' : { providerInstanceRef: p.instanceId, models: p.models },
      defaultSeed: null,
    },
    capacity: { basis: 'none', limits: { witness: 'unknown' }, windows: [], policy: null },
    protection: { witness: 'policy_absent' },
    commitments: {
      unsettledEffects: tri(f.unsettledEffects, 'present', 'none'),
      accountGroupBusy: tri(f.accountBusy, 'busy', 'free'),
    },
    session: { kind: 'new' },
    ranking: UNKNOWN_RANKING,
    share: [{ viewerRef: s.actorId, fields: ['route_kind'] }],
  }
}

/**
 * The client-safe correlation of what the actor may know they asked about: membership, project audience and
 * eligibility, the research gate, their own Pin and the named sources' eligibility. A correlation only: it may stay
 * equal while commitments, other owners' facts and the decision change, and it authenticates nothing.
 */
export function requestRevisionOf(s: SelectionSnapshot): string {
  const sources = s.sources.map((x) => String(x.eligibilityRevision ?? 0)).join('-')
  return [
    'v1',
    `m${String(s.member.revision)}`,
    `a${String(s.audienceRevision)}`,
    `e${String(s.eligibilityRevision)}`,
    `r${String(s.gate?.revision ?? 0)}`,
    `p${String(s.pin?.grantRevision ?? 0)}`,
    `s${sources === '' ? '0' : sources}`,
  ].join('.')
}

/** The kernel's input for the snapshot's one closed profile. Throws only on an incomplete pool (caller's 503). */
export function assembleSelectionInput(s: SelectionSnapshot): SelectionInput {
  if (!s.complete) throw new Error('selection_pool_incomplete')
  const authority = authorityOf(s)
  const pin = s.pin
  return {
    contract: SELECTION_INPUT_CONTRACT,
    policyVersion: SELECTION_POLICY_VERSION,
    requestRevision: requestRevisionOf(s),
    evaluatedAt: s.evaluatedAt,
    request: {
      actorRef: s.actorId,
      projectRef: s.projectId,
      ...RESEARCH_PROFILE,
      requiredOperations: [...RESEARCH_PROFILE.requiredOperations],
      requiredCapabilities: [],
      strictSettings: null,
      newWork: { kind: 'new' },
      activeBindingRef: null,
    },
    // A genuinely new standalone request: no goal, mission or design work exists for it yet (root D2).
    control: {
      goalStatus: 'ready',
      missionStop: 'none',
      source: sourceControl(s),
      designHold: 'not_applicable',
      authority,
      operationRefusal: s.gate?.state === 'enabled' ? 'none' : 'refused',
    },
    independence: null,
    policy: {
      scopes:
        pin === null
          ? []
          : [
              {
                level: 'family_default',
                mode: 'pin',
                targetRef: apiRef(pin.grantId),
                settings: null,
                crossPayer: [],
                revisionRef: `g${String(pin.grantRevision)}`,
              },
            ],
      routeOverrides: [],
    },
    summaryViewerRefs: authority === 'current' ? [s.actorId] : [],
    candidates: s.candidates.map((f) => (f.kind === 'api' ? apiCandidate(s, f) : nativeCandidate(s, f))),
  }
}

/** The actor's own view of their preview: the kernel's projection, the only value that may leave the server. */
export function previewSelection(s: SelectionSnapshot): SelectionView {
  return projectSelection(evaluateSelection(assembleSelectionInput(s)), s.actorId)
}
