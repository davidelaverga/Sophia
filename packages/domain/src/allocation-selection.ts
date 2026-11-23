// INC04-S01a: the pure, deterministic, advisory selection kernel and its viewer-safe projection.
//
// Guarantees. `evaluateSelection` is a pure function of its whole input: the same canonical input (candidates, keyed
// facts and sets in any order) gives the same data decision. It reads no clock (only `evaluatedAt`), no randomness,
// environment, locale collation, network or storage. It admits, reserves, dispatches, rebinds, resumes and calls
// nothing: a decision proposes at most one candidate and is never an execution binding.
//
// Does not guarantee. Nothing in the input authenticates anything: refs are caller-owned opaque identifiers, and every
// fact (membership, holds, grants, proofs, observations, share policy) is only as true as the trusted server caller
// that derived it. Existing admission stays the authority and must recheck all of it before any effect. The internal
// Decision is for that trusted caller only; its throwing `toJSON` guards accidental serialization and is not a
// security boundary. Only `projectSelection` output may enter public, log or event storage. The correlation tuple
// identifies declared input revisions; it does not prove equal facts, an equal decision or any permission.
// Structural bounds below are technical limits taken from existing source conventions, never quota or policy.

export const SELECTION_INPUT_CONTRACT = 'inc04.selection.input.v1'
export const SELECTION_POLICY_VERSION = 'inc04-s01-policy-v1'

// --- vocabulary -----------------------------------------------------------------------------------------------------

export type Family = 'explore' | 'repository_execution' | 'review' | 'test' | 'project_manager' | 'design'
export type Role = 'project_manager' | 'worker' | 'reviewer' | 'tester' | 'designer' | 'explorer'
export type RouteKind = 'native' | 'api'
export type OptionValue = string | boolean
export type FailureClass = 'prohibition' | 'proof_missing' | 'availability' | 'policy'
export type Outcome = 'invalid_input' | 'refused_active_work' | 'blocked' | 'selected' | 'waiting' | 'denied'
export type ProofProposition =
  'conservative_capacity_policy' | 'route_override' | 'cross_payer_fallback' | 'project_allowance'
/** 0094's grant refusal codes, verbatim. */
export type GrantCode =
  | 'grant_missing'
  | 'grant_revoked'
  | 'admin_disabled'
  | 'grant_paused'
  | 'grant_expired'
  | 'pin_stale'
  | 'requester_ineligible'
  | 'owner_not_member'
  | 'operation_not_granted'
  | 'route_unqualified'

// --- input ----------------------------------------------------------------------------------------------------------

export interface SettingOption {
  id: string
  value: OptionValue
}
/** A provider-native setting: values are compared only within the same provider instance, never across providers. */
export interface Settings {
  providerInstanceRef: string
  model: string
  options: readonly SettingOption[]
}
export interface ModelDeclaration {
  model: string
  options: readonly { id: string; values: readonly OptionValue[] }[]
}
export interface SettingsDeclaration {
  providerInstanceRef: string
  models: readonly ModelDeclaration[]
}

export interface ProofScope {
  projectRef: string
  ownerRef: string | null
  accountGroupRef: string | null
  payerScopeRef: string | null
  fromPayerScopeRef: string | null
  routeKind: RouteKind | null
  family: Family
  operationRef: string
  roles: readonly Role[]
}
/** A proposition the trusted caller resolved and attests; the kernel checks its scope and time, never its truth. */
export interface ResolvedProof {
  proposition: ProofProposition
  status: 'valid' | 'revoked' | 'stale' | 'unknown'
  issuer: 'owner' | 'project'
  authorizerRef: string
  scope: ProofScope
  effectiveRevisionRef: string
  validFrom: string
  /** Null: an explicitly standing policy with no expiry. */
  validUntil: string | null
  boundedUseRef: string
}

export type GoalStatus =
  'ready' | 'running' | 'checking' | 'holding' | 'held' | 'stopping' | 'stopped' | 'completed' | 'unknown'
export interface RequestControl {
  goalStatus: GoalStatus
  missionStop: 'none' | 'requested' | 'unknown'
  source: 'eligible' | 'withdrawn' | 'ineligible' | 'unknown'
  designHold: 'not_applicable' | 'clear' | 'held' | 'unknown'
  authority: 'current' | 'not_member' | 'cannot_edit' | 'audience_changed' | 'unknown'
  operationRefusal: 'none' | 'refused' | 'unknown'
}
export type NewWork =
  { kind: 'new' } | { kind: 'settled_repair'; priorAttemptRef: string; settlement: 'settled' | 'unsettled' | 'unknown' }
export interface SelectionRequest {
  actorRef: string
  projectRef: string
  family: Family
  operationRef: string
  role: Role
  requiredOperations: readonly string[]
  requiredCapabilities: readonly string[]
  /** A manual strict request. A winning Pin's settings must equal it when both are given. */
  strictSettings: Settings | null
  newWork: NewWork
  activeBindingRef: string | null
}
export interface Independence {
  authorship: 'known' | 'unknown'
  subjectRevisionRef: string
  authorSessionRefs: readonly string[]
  authorAttemptRefs: readonly string[]
}
export type ScopeLevel = 'action' | 'role' | 'family_default'
export interface PolicyScope {
  level: ScopeLevel
  mode: 'auto' | 'prefer' | 'pin'
  targetRef: string | null
  /** Pin: strict. Prefer: a soft seed only. */
  settings: Settings | null
  crossPayer: readonly ResolvedProof[]
  revisionRef: string
}
export interface SelectionPolicy {
  scopes: readonly PolicyScope[]
  routeOverrides: readonly ResolvedProof[]
}

export interface Grant {
  grantRef: string
  revisionRef: string
  ownerRef: string
  projectRef: string
  expiresAt: string
  unusable: readonly GrantCode[]
  requesterEligible: boolean
  operationRefs: readonly string[]
  roles: readonly Role[]
  allowedSettings: readonly SettingsDeclaration[]
}
export type Authority =
  | { basis: 'contribution_grant'; grant: Grant | null }
  | { basis: 'owner_own_use' }
  | { basis: 'project_allowance'; proof: ResolvedProof }
  | { basis: 'unknown' }
export interface Window {
  windowRef: string
  scope: 'account' | 'model' | 'spend' | 'concurrency'
  /** Provider-native unit; never converted, added or compared across windows. */
  unit: string
  provenanceRef: string
  observedAt: string
  freshUntil: string
  applicability: 'known' | 'partial' | 'unknown'
  verdict: 'admits' | 'exhausted' | 'unknown'
  resetAt: string | null
}
export type LimitWitness =
  | { witness: 'covered'; requiredWindowRefs: readonly string[] }
  | { witness: 'none_applicable' }
  | { witness: 'partial' }
  | { witness: 'unknown' }
export interface Capacity {
  basis: 'observed' | 'conservative_policy' | 'none'
  limits: LimitWitness
  windows: readonly Window[]
  policy: { proof: ResolvedProof; verdict: 'admits' | 'busy' } | null
}
export type Protection =
  | {
      witness: 'covered'
      requiredDimensionRefs: readonly string[]
      verdicts: readonly { dimensionRef: string; verdict: 'preserves_protected' | 'would_violate' | 'unknown' }[]
    }
  | { witness: 'none_applicable' }
  | { witness: 'policy_absent' }
  | { witness: 'unknown' }
export type ShareField = 'route_kind' | 'settings' | 'payer_scope'
export type Known<T> = { status: 'known'; value: T } | { status: 'unknown' }
export interface Candidate {
  candidateRef: string
  factsRevisionRef: string
  routeKind: RouteKind
  providerRef: string
  ownerRef: string
  payerScopeRef: string
  accountGroup: {
    identity: 'provider_verified' | 'owner_confirmed' | 'operator_recorded' | 'uncertain'
    groupRef: string
  }
  authority: Authority
  nativeDelegation: 'not_applicable' | 'qualified' | 'unqualified' | 'unknown'
  sourceDisclosure: 'permitted' | 'denied' | 'unknown'
  qualification: {
    route: 'current' | 'none' | 'expired' | 'revoked' | 'stale' | 'unknown'
    operations: readonly string[]
    capabilities: readonly string[]
    connection: 'linked' | 'expired' | 'revoked' | 'paused' | 'not_connected' | 'unknown'
    host: 'current' | 'offline' | 'stale' | 'unknown' | 'not_applicable'
  }
  settings: { declared: SettingsDeclaration | 'unknown'; defaultSeed: Settings | null }
  capacity: Capacity
  protection: Protection
  commitments: { unsettledEffects: 'none' | 'present' | 'unknown'; accountGroupBusy: 'free' | 'busy' | 'unknown' }
  session: { kind: 'new' } | { kind: 'existing'; sessionRef: string; attemptRefs: readonly string[] }
  ranking: {
    /** Lower is a better capability fit. */
    suitabilityTier: Known<number>
    availableAt: Known<string>
    /** Basis points, higher is better. */
    reliability: Known<number>
    costLatencyTier: Known<number>
  }
  share: readonly { viewerRef: string; fields: readonly ShareField[] }[]
}
export interface SelectionInput {
  contract: string
  policyVersion: string
  requestRevision: string
  evaluatedAt: string
  request: SelectionRequest
  control: RequestControl
  independence: Independence | null
  policy: SelectionPolicy
  /** Viewers the trusted caller permits to see this request's coarse summary. */
  summaryViewerRefs: readonly string[]
  candidates: readonly Candidate[]
}

// --- output ---------------------------------------------------------------------------------------------------------

export interface Failure {
  code: string
  cls: FailureClass
}
export interface Row {
  candidateRef: string
  status: 'eligible' | 'excluded' | 'not_evaluated'
  failures: readonly Failure[]
  reportedCodes: readonly string[]
  codesTruncated: boolean
  rankStep: number | null
  seed: Settings | 'unspecified'
  // Facts kept for the trusted projection; never projected except through its whitelist.
  ownerRef: string
  routeKind: RouteKind
  payerScopeRef: string
  share: readonly { viewerRef: string; fields: readonly ShareField[] }[]
}
export interface Correlation {
  contract: string
  policyVersion: string
  requestRevision: string
  evaluatedAt: string
  candidates: readonly (readonly [string, string])[]
}
export interface ResolvedPolicy {
  level: ScopeLevel | 'implicit'
  mode: 'auto' | 'prefer' | 'pin'
  targetRef: string | null
  revisionRef: string | null
}
export interface Decision {
  readonly contract: string
  readonly policyVersion: string
  readonly correlation: Correlation | null
  readonly outcome: Outcome
  readonly globalCodes: readonly string[]
  readonly nextSteps: readonly string[]
  readonly resolvedPolicy: ResolvedPolicy | null
  readonly routeDefault: RouteKind | null
  readonly settings: { strict: Settings | null; accepted: 'unknown'; observed: 'unknown' }
  readonly rows: readonly Row[]
  readonly proposedRef: string | null
  readonly alternatives: readonly string[]
  readonly fallback: { targetRef: string; crossPayer: boolean } | null
  readonly errors: readonly { code: string; path: string }[]
  readonly errorsTruncated: boolean
  readonly summaryViewerRefs: readonly string[]
}

// --- structural bounds (existing conventions) -----------------------------------------------------------------------

export const SELECTION_BOUNDS = {
  candidates: 200, // A51 catalog page
  refSet: 50, // 0094 eligible_actors
  list: 20, // 0096 declared lists
  models: 20, // 0096
  optionsPerModel: 10, // 0096
  valuesPerOption: 20, // 0096
  reported: 40, // 0038 review findings
  text: 200, // 0092/0096 refs and values
  tier: 1000, // 0092 allowance range
  basisPoints: 10000,
} as const

const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const INSTANCE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const OPTION_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/
const isRef = (s: string) => REF.test(s)
const isEdged = (s: string) => s.length >= 1 && s.length <= SELECTION_BOUNDS.text && s.trim() === s

// --- time: strict RFC 3339, normalized to UTC microseconds ----------------------------------------------------------

const TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/
const DAY_US = 86_400_000_000n

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1
  return era * 146_097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719_468
}

function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719_468
  const era = Math.floor(zz / 146_097)
  const doe = zz - era * 146_097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d]
}

const daysIn = (y: number, m: number) =>
  m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31

const MIN_US = BigInt(daysFromCivil(1, 1, 1)) * DAY_US
const MAX_US = BigInt(daysFromCivil(10_000, 1, 1)) * DAY_US - 1n

function zoneSeconds(zone: string): number | null {
  if (zone === 'Z') return 0
  const h = Number(zone.slice(1, 3))
  const m = Number(zone.slice(4, 6))
  if (h > 23 || m > 59) return null
  return (zone.startsWith('-') ? -1 : 1) * (h * 3600 + m * 60)
}

interface Fields {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  s: number
}

const FIELD_MIN = [1, 1, 1, 0, 0, 0]
const FIELD_MAX = [9999, 12, 31, 23, 59, 59]

/** The calendar and clock fields, or null unless they name a real time (no leap second, no hour 24). */
function fieldsOf(g: RegExpExecArray): Fields | null {
  const v = [1, 2, 3, 4, 5, 6].map((i) => Number(g[i] ?? 'NaN'))
  if (!v.every((x, i) => x >= (FIELD_MIN[i] ?? 0) && x <= (FIELD_MAX[i] ?? 0))) return null
  const [y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0] = v
  return d <= daysIn(y, mo) ? { y, mo, d, h, mi, s } : null
}

/** Microseconds since the Unix epoch, or null unless the text is a valid RFC 3339 instant in years 1 to 9999. */
export function instantMicros(text: string): bigint | null {
  const g = TIME.exec(text)
  if (g === null) return null
  const t = fieldsOf(g)
  const zone = zoneSeconds(g[8] ?? '')
  if (t === null || zone === null) return null
  const seconds = daysFromCivil(t.y, t.mo, t.d) * 86_400 + t.h * 3600 + t.mi * 60 + t.s - zone
  const us = BigInt(seconds) * 1_000_000n + BigInt((g[7] ?? '').padEnd(6, '0'))
  return us < MIN_US || us > MAX_US ? null : us
}

const pad = (v: number | bigint, w: number) => String(v).padStart(w, '0')

/** The canonical UTC spelling of an instant: YYYY-MM-DDTHH:MM:SS.ffffffZ. */
export function normalInstant(us: bigint): string {
  const days = us >= 0n ? us / DAY_US : -((-us + DAY_US - 1n) / DAY_US)
  const rest = us - days * DAY_US
  const [y, m, d] = civilFromDays(Number(days))
  const secs = rest / 1_000_000n
  const time = `${pad(secs / 3600n, 2)}:${pad((secs % 3600n) / 60n, 2)}:${pad(secs % 60n, 2)}`
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}T${time}.${pad(rest % 1_000_000n, 6)}Z`
}

// --- canonical ordering -----------------------------------------------------------------------------------------------

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sortedUnique = (xs: readonly string[]) => [...new Set(xs)].toSorted(cmp)
const typedKey = (v: OptionValue) => (typeof v === 'boolean' ? `b:${String(v)}` : `s:${v}`)

/** Canonical option map, or null when one option id carries two different typed values. */
function optionMap(options: readonly SettingOption[]): Map<string, string> | null {
  const out = new Map<string, string>()
  for (const o of options) {
    const prior = out.get(o.id)
    const key = typedKey(o.value)
    if (prior !== undefined && prior !== key) return null
    out.set(o.id, key)
  }
  return out
}

/**
 * Settings with options sorted by id and identical duplicates removed (call only when `settingsKey` is not null).
 * Every object is new: a decision never holds, and so never freezes, an object the caller owns (R1, 69FC-F02).
 */
function canonicalSettings(s: Settings): Settings {
  const seen = new Map(s.options.map((o) => [o.id, o.value]))
  const options = [...seen].map(([id, value]) => ({ id, value })).toSorted((a, b) => cmp(a.id, b.id))
  return { providerInstanceRef: s.providerInstanceRef, model: s.model, options }
}

/** Share grants sorted by viewer, each viewer's fields sorted and unique. */
function canonicalShare(share: Candidate['share']): Row['share'] {
  return share
    .map((x) => ({ viewerRef: x.viewerRef, fields: [...new Set(x.fields)].toSorted(cmp) }))
    .toSorted((a, b) => cmp(a.viewerRef, b.viewerRef) || cmp(a.fields.join(), b.fields.join()))
}

/** A canonical spelling of settings, or null on a keyed conflict. Equal spellings are equal settings. */
export function settingsKey(s: Settings): string | null {
  const opts = optionMap(s.options)
  if (opts === null) return null
  const parts = [...opts.entries()].toSorted((a, b) => cmp(a[0], b[0])).map(([id, v]) => `${id}=${v}`)
  return JSON.stringify([s.providerInstanceRef, s.model, parts])
}

type DeclaredModels = Map<string, Map<string, Set<string>>>

/** The declaration's models as canonical sets, or null on a conflicting duplicate model or option id. */
function declaredModels(decl: SettingsDeclaration): DeclaredModels | null {
  const out: DeclaredModels = new Map()
  for (const m of decl.models) {
    const opts = new Map<string, Set<string>>()
    for (const o of m.options) {
      const values = new Set(o.values.map(typedKey))
      const prior = opts.get(o.id)
      if (prior !== undefined && !sameSet(prior, values)) return null
      opts.set(o.id, values)
    }
    const priorModel = out.get(m.model)
    if (priorModel !== undefined && !sameOptions(priorModel, opts)) return null
    out.set(m.model, opts)
  }
  return out
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x))
function sameOptions(a: ReadonlyMap<string, Set<string>>, b: ReadonlyMap<string, Set<string>>): boolean {
  if (a.size !== b.size) return false
  return [...a].every(([id, vs]) => {
    const other = b.get(id)
    return other !== undefined && sameSet(vs, other)
  })
}

/** Whether a declaration admits exactly these settings (0096: every declared option once, a declared value). */
function declares(decl: SettingsDeclaration, s: Settings): 'yes' | 'no' | 'conflict' {
  const models = declaredModels(decl)
  const opts = optionMap(s.options)
  if (models === null || opts === null) return 'conflict'
  if (decl.providerInstanceRef !== s.providerInstanceRef) return 'no'
  const model = models.get(s.model)
  if (model?.size !== opts.size) return 'no'
  return [...opts].every(([id, v]) => model.get(id)?.has(v) === true) ? 'yes' : 'no'
}

/** Over several declarations (a grant's), a conflict in any fails closed. */
function anyDeclares(decls: readonly SettingsDeclaration[], s: Settings): 'yes' | 'no' | 'conflict' {
  const results = decls.map((d) => declares(d, s))
  if (results.includes('conflict')) return 'conflict'
  return results.includes('yes') ? 'yes' : 'no'
}

// --- structural validation ------------------------------------------------------------------------------------------

interface Issue {
  code: string
  path: string
}
type Issues = Issue[]

function checkRef(v: string, path: string, out: Issues) {
  if (!isRef(v)) out.push({ code: 'malformed_ref', path })
}
function checkTime(v: string, path: string, out: Issues) {
  if (instantMicros(v) === null) out.push({ code: 'malformed_instant', path })
}
function checkRefSet(xs: readonly string[], path: string, out: Issues, bound: number = SELECTION_BOUNDS.refSet) {
  if (xs.length > bound) out.push({ code: 'bound_exceeded', path })
  xs.forEach((x) => checkRef(x, path, out))
}
function checkList(n: number, path: string, out: Issues) {
  if (n > SELECTION_BOUNDS.list) out.push({ code: 'bound_exceeded', path })
}
function checkValue(v: OptionValue, path: string, out: Issues) {
  if (typeof v === 'string' && !isEdged(v)) out.push({ code: 'malformed_value', path })
}

function checkSettings(s: Settings, path: string, out: Issues) {
  if (!INSTANCE.test(s.providerInstanceRef))
    out.push({ code: 'malformed_instance', path: `${path}/providerInstanceRef` })
  if (!isEdged(s.model)) out.push({ code: 'malformed_value', path: `${path}/model` })
  if (s.options.length > SELECTION_BOUNDS.optionsPerModel) out.push({ code: 'bound_exceeded', path: `${path}/options` })
  s.options.forEach((o) => {
    if (!OPTION_ID.test(o.id)) out.push({ code: 'malformed_option_id', path: `${path}/options` })
    checkValue(o.value, `${path}/options`, out)
  })
}

function checkDeclaration(d: SettingsDeclaration, path: string, out: Issues) {
  if (!INSTANCE.test(d.providerInstanceRef)) out.push({ code: 'malformed_instance', path })
  if (d.models.length > SELECTION_BOUNDS.models) out.push({ code: 'bound_exceeded', path: `${path}/models` })
  d.models.forEach((m) => {
    const mp = `${path}/models`
    if (!isEdged(m.model)) out.push({ code: 'malformed_value', path: mp })
    if (m.options.length > SELECTION_BOUNDS.optionsPerModel) out.push({ code: 'bound_exceeded', path: mp })
    m.options.forEach((o) => {
      const op = `${mp}/options`
      if (!OPTION_ID.test(o.id)) out.push({ code: 'malformed_option_id', path: op })
      if (o.values.length < 1 || o.values.length > SELECTION_BOUNDS.valuesPerOption) {
        out.push({ code: 'bound_exceeded', path: op })
      }
      o.values.forEach((v) => checkValue(v, op, out))
    })
  })
}

function checkProof(p: ResolvedProof, path: string, out: Issues) {
  for (const [k, v] of [
    ['authorizerRef', p.authorizerRef],
    ['effectiveRevisionRef', p.effectiveRevisionRef],
    ['boundedUseRef', p.boundedUseRef],
    ['scope/projectRef', p.scope.projectRef],
    ['scope/operationRef', p.scope.operationRef],
  ] as const) {
    checkRef(v, `${path}/${k}`, out)
  }
  for (const [k, v] of [
    ['ownerRef', p.scope.ownerRef],
    ['accountGroupRef', p.scope.accountGroupRef],
    ['payerScopeRef', p.scope.payerScopeRef],
    ['fromPayerScopeRef', p.scope.fromPayerScopeRef],
  ] as const) {
    if (v !== null) checkRef(v, `${path}/scope/${k}`, out)
  }
  checkTime(p.validFrom, `${path}/validFrom`, out)
  if (p.validUntil !== null) checkTime(p.validUntil, `${path}/validUntil`, out)
  checkList(p.scope.roles.length, `${path}/scope/roles`, out)
}

function checkRequest(input: SelectionInput, out: Issues) {
  const r = input.request
  checkRef(r.actorRef, '/request/actorRef', out)
  checkRef(r.projectRef, '/request/projectRef', out)
  checkRef(r.operationRef, '/request/operationRef', out)
  checkRefSet(r.requiredOperations, '/request/requiredOperations', out)
  checkRefSet(r.requiredCapabilities, '/request/requiredCapabilities', out)
  if (r.strictSettings !== null) {
    checkSettings(r.strictSettings, '/request/strictSettings', out)
    if (settingsKey(r.strictSettings) === null)
      out.push({ code: 'settings_key_conflict', path: '/request/strictSettings' })
  }
  if (r.newWork.kind === 'settled_repair') checkRef(r.newWork.priorAttemptRef, '/request/newWork/priorAttemptRef', out)
  if (r.activeBindingRef !== null) checkRef(r.activeBindingRef, '/request/activeBindingRef', out)
  const needsIndependence = r.role === 'reviewer' || r.role === 'tester'
  if (needsIndependence !== (input.independence !== null))
    out.push({ code: 'independence_presence', path: '/independence' })
  if (input.independence !== null) {
    checkRef(input.independence.subjectRevisionRef, '/independence/subjectRevisionRef', out)
    checkRefSet(input.independence.authorSessionRefs, '/independence/authorSessionRefs', out)
    checkRefSet(input.independence.authorAttemptRefs, '/independence/authorAttemptRefs', out)
  }
}

function checkScopes(input: SelectionInput, out: Issues) {
  const scopes = input.policy.scopes
  checkList(scopes.length, '/policy/scopes', out)
  if (new Set(scopes.map((s) => s.level)).size !== scopes.length)
    out.push({ code: 'duplicate_scope', path: '/policy/scopes' })
  scopes.forEach((s) => {
    const p = `/policy/scopes/${s.level}`
    checkRef(s.revisionRef, `${p}/revisionRef`, out)
    if ((s.mode === 'auto') !== (s.targetRef === null)) out.push({ code: 'target_presence', path: `${p}/targetRef` })
    if (s.targetRef !== null) checkRef(s.targetRef, `${p}/targetRef`, out)
    if (s.mode === 'auto' && s.settings !== null) out.push({ code: 'settings_presence', path: `${p}/settings` })
    if (s.settings !== null) {
      checkSettings(s.settings, `${p}/settings`, out)
      if (settingsKey(s.settings) === null) out.push({ code: 'settings_key_conflict', path: `${p}/settings` })
    }
    if (s.mode !== 'prefer' && s.crossPayer.length > 0)
      out.push({ code: 'cross_payer_presence', path: `${p}/crossPayer` })
    checkList(s.crossPayer.length, `${p}/crossPayer`, out)
    s.crossPayer.forEach((x) => checkProof(x, `${p}/crossPayer`, out))
  })
  checkList(input.policy.routeOverrides.length, '/policy/routeOverrides', out)
  input.policy.routeOverrides.forEach((x) => checkProof(x, '/policy/routeOverrides', out))
}

function checkAuthority(a: Authority, path: string, out: Issues) {
  if (a.basis === 'project_allowance') checkProof(a.proof, `${path}/proof`, out)
  if (a.basis !== 'contribution_grant' || a.grant === null) return
  const g = a.grant
  for (const [k, v] of [
    ['grantRef', g.grantRef],
    ['revisionRef', g.revisionRef],
    ['ownerRef', g.ownerRef],
    ['projectRef', g.projectRef],
  ] as const) {
    checkRef(v, `${path}/grant/${k}`, out)
  }
  checkTime(g.expiresAt, `${path}/grant/expiresAt`, out)
  checkRefSet(g.operationRefs, `${path}/grant/operationRefs`, out)
  checkList(g.roles.length + g.unusable.length + g.allowedSettings.length, `${path}/grant`, out)
  g.allowedSettings.forEach((d) => checkDeclaration(d, `${path}/grant/allowedSettings`, out))
}

function checkCapacity(c: Capacity, path: string, out: Issues) {
  checkList(c.windows.length, `${path}/windows`, out)
  c.windows.forEach((w) => {
    const p = `${path}/windows`
    checkRef(w.windowRef, `${p}/windowRef`, out)
    checkRef(w.provenanceRef, `${p}/provenanceRef`, out)
    if (!isEdged(w.unit)) out.push({ code: 'malformed_value', path: `${p}/unit` })
    checkTime(w.observedAt, `${p}/observedAt`, out)
    checkTime(w.freshUntil, `${p}/freshUntil`, out)
    if (w.resetAt !== null) checkTime(w.resetAt, `${p}/resetAt`, out)
  })
  if (c.limits.witness === 'covered')
    checkRefSet(c.limits.requiredWindowRefs, `${path}/limits`, out, SELECTION_BOUNDS.list)
  if (c.policy !== null) checkProof(c.policy.proof, `${path}/policy/proof`, out)
}

function checkKnownInt(k: Known<number>, max: number, path: string, out: Issues) {
  if (k.status === 'known' && !(Number.isInteger(k.value) && k.value >= 0 && k.value <= max)) {
    out.push({ code: 'malformed_integer', path })
  }
}

function checkCandidateFacts(c: Candidate, p: string, out: Issues) {
  checkAuthority(c.authority, `${p}/authority`, out)
  checkRefSet(c.qualification.operations, `${p}/qualification/operations`, out)
  checkRefSet(c.qualification.capabilities, `${p}/qualification/capabilities`, out)
  if (c.settings.declared !== 'unknown') checkDeclaration(c.settings.declared, `${p}/settings/declared`, out)
  if (c.settings.defaultSeed !== null) checkSettings(c.settings.defaultSeed, `${p}/settings/defaultSeed`, out)
  checkCapacity(c.capacity, `${p}/capacity`, out)
  if (c.protection.witness === 'covered') {
    checkRefSet(c.protection.requiredDimensionRefs, `${p}/protection/required`, out, SELECTION_BOUNDS.list)
    checkList(c.protection.verdicts.length, `${p}/protection/verdicts`, out)
    c.protection.verdicts.forEach((v) => checkRef(v.dimensionRef, `${p}/protection/verdicts`, out))
  }
  if (c.session.kind === 'existing') {
    checkRef(c.session.sessionRef, `${p}/session/sessionRef`, out)
    checkRefSet(c.session.attemptRefs, `${p}/session/attemptRefs`, out)
  }
  checkKnownInt(c.ranking.suitabilityTier, SELECTION_BOUNDS.tier, `${p}/ranking/suitabilityTier`, out)
  checkKnownInt(c.ranking.reliability, SELECTION_BOUNDS.basisPoints, `${p}/ranking/reliability`, out)
  checkKnownInt(c.ranking.costLatencyTier, SELECTION_BOUNDS.tier, `${p}/ranking/costLatencyTier`, out)
  if (c.ranking.availableAt.status === 'known') checkTime(c.ranking.availableAt.value, `${p}/ranking/availableAt`, out)
  if (c.share.length > SELECTION_BOUNDS.refSet) out.push({ code: 'bound_exceeded', path: `${p}/share` })
  c.share.forEach((s) => checkRef(s.viewerRef, `${p}/share`, out))
}

function checkCandidates(input: SelectionInput, out: Issues) {
  const cs = input.candidates
  if (cs.length > SELECTION_BOUNDS.candidates) out.push({ code: 'bound_exceeded', path: '/candidates' })
  const refs = cs.map((c) => c.candidateRef)
  if (new Set(refs).size !== refs.length) out.push({ code: 'duplicate_candidate', path: '/candidates' })
  cs.forEach((c) => {
    // A path names the candidate, never its position, so a reordered input reports the same errors.
    const p = isRef(c.candidateRef) ? `/candidates/${c.candidateRef}` : '/candidates'
    for (const [k, v] of [
      ['candidateRef', c.candidateRef],
      ['factsRevisionRef', c.factsRevisionRef],
      ['providerRef', c.providerRef],
      ['ownerRef', c.ownerRef],
      ['payerScopeRef', c.payerScopeRef],
      ['accountGroup/groupRef', c.accountGroup.groupRef],
    ] as const) {
      checkRef(v, `${p}/${k}`, out)
    }
    checkCandidateFacts(c, p, out)
  })
}

/** Every structural problem, sorted by code then path; the caller reports a bounded prefix. */
function structuralIssues(input: SelectionInput): Issues {
  const out: Issues = []
  if (input.contract !== SELECTION_INPUT_CONTRACT) out.push({ code: 'contract_mismatch', path: '/contract' })
  if (input.policyVersion !== SELECTION_POLICY_VERSION)
    out.push({ code: 'policy_version_mismatch', path: '/policyVersion' })
  checkRef(input.requestRevision, '/requestRevision', out)
  checkTime(input.evaluatedAt, '/evaluatedAt', out)
  checkRefSet(input.summaryViewerRefs, '/summaryViewerRefs', out)
  checkRequest(input, out)
  checkScopes(input, out)
  checkCandidates(input, out)
  strictConflict(input, out)
  const seen = new Set<string>()
  return out
    .filter((i) => {
      const k = `${i.code}\u0000${i.path}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .toSorted((a, b) => cmp(a.code, b.code) || cmp(a.path, b.path))
}

// --- policy resolution ----------------------------------------------------------------------------------------------

const LEVEL_ORDER: readonly ScopeLevel[] = ['action', 'role', 'family_default']

function winningScope(input: SelectionInput): PolicyScope | null {
  for (const level of LEVEL_ORDER) {
    const s = input.policy.scopes.find((x) => x.level === level)
    if (s !== undefined) return s
  }
  return null
}

/** The effective strict settings: a manual request, else a winning Pin's. A conflict is invalid input. */
function strictConflict(input: SelectionInput, out: Issues) {
  const scope = winningScope(input)
  const manual = input.request.strictSettings
  if (scope?.mode !== 'pin' || scope.settings === null || manual === null) return
  if (settingsKey(manual) !== settingsKey(scope.settings))
    out.push({ code: 'strict_settings_conflict', path: '/policy' })
}

function effectiveStrict(input: SelectionInput, scope: PolicyScope | null): Settings | null {
  if (input.request.strictSettings !== null) return input.request.strictSettings
  return scope?.mode === 'pin' ? scope.settings : null
}

const ROUTE_DEFAULT: Partial<Record<Family, RouteKind>> = { explore: 'api', repository_execution: 'native' }

// --- global holds ---------------------------------------------------------------------------------------------------

function globalHolds(input: SelectionInput): string[] {
  const c = input.control
  const out: string[] = []
  if (!['ready', 'running', 'checking'].includes(c.goalStatus)) out.push(`goal_${c.goalStatus}`)
  if (c.missionStop !== 'none') out.push(`mission_stop_${c.missionStop}`)
  if (c.source !== 'eligible') out.push(`source_${c.source}`)
  if (c.designHold === 'held' || c.designHold === 'unknown') out.push(`design_hold_${c.designHold}`)
  if (c.authority !== 'current') out.push(`authority_${c.authority}`)
  if (c.operationRefusal !== 'none') out.push(`operation_refused_${c.operationRefusal}`)
  if (input.independence?.authorship === 'unknown') out.push('independence_proof_missing')
  const w = input.request.newWork
  if (w.kind === 'settled_repair' && w.settlement !== 'settled') out.push(`prior_attempt_${w.settlement}`)
  return out.toSorted(cmp)
}

// --- proofs ---------------------------------------------------------------------------------------------------------

type ProofResult = 'ok' | 'revoked' | 'unproven' | 'out_of_scope'
interface Expected {
  proposition: ProofProposition
  issuer: 'owner' | 'project'
  /** For an owner issuer, the owner who must have issued it. */
  authorizerRef: string | null
  scope: Omit<ProofScope, 'roles'>
  role: Role
}

function scopeMatches(p: ProofScope, e: Expected): boolean {
  const s = e.scope
  return (
    p.projectRef === s.projectRef &&
    p.ownerRef === s.ownerRef &&
    p.accountGroupRef === s.accountGroupRef &&
    p.payerScopeRef === s.payerScopeRef &&
    p.fromPayerScopeRef === s.fromPayerScopeRef &&
    p.routeKind === s.routeKind &&
    p.family === s.family &&
    p.operationRef === s.operationRef &&
    p.roles.includes(e.role)
  )
}

function proofCurrent(p: ResolvedProof, at: bigint): boolean {
  const from = instantMicros(p.validFrom)
  const until = p.validUntil === null ? null : instantMicros(p.validUntil)
  if (from === null || from > at) return false
  if (p.validUntil === null) return true
  return until !== null && at < until
}

/** Checks a resolved proof against the exact use it must cover at the evaluation instant. Never its truth. */
function checkResolved(p: ResolvedProof, e: Expected, at: bigint): ProofResult {
  if (p.proposition !== e.proposition || p.issuer !== e.issuer) return 'out_of_scope'
  if (e.issuer === 'owner' && p.authorizerRef !== e.authorizerRef) return 'out_of_scope'
  if (!scopeMatches(p.scope, e)) return 'out_of_scope'
  if (p.status === 'revoked') return 'revoked'
  if (p.status !== 'valid' || !proofCurrent(p, at)) return 'unproven'
  return 'ok'
}

// --- per-candidate filters ------------------------------------------------------------------------------------------

interface EvalCtx {
  input: SelectionInput
  at: bigint
  strict: Settings | null
  routeDefault: RouteKind | null
}

const f = (code: string, cls: FailureClass): Failure => ({ code, cls })
const crossMember = (ctx: EvalCtx, c: Candidate) => c.ownerRef !== ctx.input.request.actorRef

function baseScope(ctx: EvalCtx, c: Candidate): Omit<ProofScope, 'roles'> {
  const r = ctx.input.request
  return {
    projectRef: r.projectRef,
    ownerRef: c.ownerRef,
    accountGroupRef: null,
    payerScopeRef: c.payerScopeRef,
    fromPayerScopeRef: null,
    routeKind: c.routeKind,
    family: r.family,
    operationRef: r.operationRef,
  }
}

/** The authority that may issue a route override or cross-payer authorization for this candidate's funding. */
function fundingIssuer(ctx: EvalCtx, c: Candidate, proposition: ProofProposition, from: string | null): Expected[] {
  const role = ctx.input.request.role
  const scope = { ...baseScope(ctx, c), fromPayerScopeRef: from }
  const owner: Expected = { proposition, issuer: 'owner', authorizerRef: c.ownerRef, scope, role }
  const project: Expected = {
    proposition,
    issuer: 'project',
    authorizerRef: null,
    scope: { ...scope, ownerRef: null },
    role,
  }
  return c.authority.basis === 'project_allowance' ? [owner, project] : [owner]
}

function anyProofOk(ctx: EvalCtx, proofs: readonly ResolvedProof[], expected: readonly Expected[]): boolean {
  return proofs.some((p) => expected.some((e) => checkResolved(p, e, ctx.at) === 'ok'))
}

function grantFailures(ctx: EvalCtx, c: Candidate, g: Grant | null): Failure[] {
  if (g === null) return [f('grant_missing', 'prohibition')]
  const r = ctx.input.request
  if (g.ownerRef !== c.ownerRef || g.projectRef !== r.projectRef) return [f('fact_conflict', 'proof_missing')]
  const out = g.unusable.map((code) => f(code, code === 'grant_paused' ? 'availability' : 'prohibition'))
  const expires = instantMicros(g.expiresAt)
  if (expires === null || expires <= ctx.at) out.push(f('grant_expired', 'prohibition'))
  if (!g.requesterEligible) out.push(f('requester_ineligible', 'prohibition'))
  if (!g.roles.includes(r.role)) out.push(f('role_not_granted', 'prohibition'))
  if (!g.operationRefs.includes(r.operationRef)) out.push(f('operation_not_granted', 'prohibition'))
  if (ctx.strict !== null) {
    const allowed = anyDeclares(g.allowedSettings, ctx.strict)
    if (allowed === 'conflict') out.push(f('fact_conflict', 'proof_missing'))
    if (allowed === 'no') out.push(f('settings_not_granted', 'prohibition'))
  }
  return out
}

function projectAllowanceFailures(ctx: EvalCtx, c: Candidate, proof: ResolvedProof): Failure[] {
  const expected: Expected = {
    proposition: 'project_allowance',
    issuer: 'project',
    authorizerRef: null,
    scope: { ...baseScope(ctx, c), ownerRef: null },
    role: ctx.input.request.role,
  }
  const result = checkResolved(proof, expected, ctx.at)
  if (result === 'ok') return []
  if (result === 'revoked') return [f('project_allowance_revoked', 'prohibition')]
  if (result === 'out_of_scope') return [f('project_allowance_out_of_scope', 'prohibition')]
  return [f('project_allowance_unproven', 'proof_missing')]
}

function authorityFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const a = c.authority
  if (a.basis === 'owner_own_use') return crossMember(ctx, c) ? [f('fact_conflict', 'proof_missing')] : []
  if (a.basis === 'contribution_grant') return grantFailures(ctx, c, a.grant)
  if (a.basis === 'project_allowance') return projectAllowanceFailures(ctx, c, a.proof)
  return [f('authority_unknown', 'proof_missing')]
}

function memberFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const sharedNative = crossMember(ctx, c) && c.routeKind === 'native'
  const out: Failure[] = []
  if (sharedNative !== (c.nativeDelegation !== 'not_applicable')) out.push(f('fact_conflict', 'proof_missing'))
  else if (c.nativeDelegation === 'unqualified') out.push(f('cross_member_native_unqualified', 'prohibition'))
  else if (c.nativeDelegation === 'unknown') out.push(f('native_delegation_unknown', 'proof_missing'))
  if (c.sourceDisclosure === 'denied') out.push(f('source_disclosure_denied', 'prohibition'))
  if (c.sourceDisclosure === 'unknown') out.push(f('source_disclosure_unknown', 'proof_missing'))
  return out
}

function routeFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  if (ctx.routeDefault === null || c.routeKind === ctx.routeDefault) return []
  const expected = fundingIssuer(ctx, c, 'route_override', null)
  return anyProofOk(ctx, ctx.input.policy.routeOverrides, expected)
    ? []
    : [f('route_default_not_overridden', 'prohibition')]
}

function qualificationFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const q = c.qualification
  const r = ctx.input.request
  const out: Failure[] = []
  if (q.route !== 'current')
    out.push(f(`route_qualification_${q.route}`, q.route === 'unknown' ? 'proof_missing' : 'prohibition'))
  if (!r.requiredOperations.every((o) => q.operations.includes(o)))
    out.push(f('operation_not_qualified', 'prohibition'))
  if (!r.requiredCapabilities.every((o) => q.capabilities.includes(o))) out.push(f('capability_missing', 'prohibition'))
  if (q.connection !== 'linked') {
    out.push(f(`connection_${q.connection}`, q.connection === 'unknown' ? 'proof_missing' : 'availability'))
  }
  if (q.host === 'offline' || q.host === 'stale') out.push(f(`host_${q.host}`, 'availability'))
  if (q.host === 'unknown') out.push(f('host_unknown', 'proof_missing'))
  // A native route runs on its owner's host, so "no host applies" contradicts it: an invalid fact, never a current
  // host and never a known outage (R2, PR #515 finding 4561188316). Only an API route may have no host.
  if (q.host === 'not_applicable' && c.routeKind === 'native') out.push(f('fact_conflict', 'proof_missing'))
  return out
}

function settingsFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const decl = c.settings.declared
  if (decl !== 'unknown' && declaredModels(decl) === null) return [f('fact_conflict', 'proof_missing')]
  if (ctx.strict === null) return []
  if (decl === 'unknown') return [f('settings_unverifiable', 'proof_missing')]
  return declares(decl, ctx.strict) === 'yes' ? [] : [f('settings_not_declared', 'prohibition')]
}

function windowFailures(w: Window, at: bigint): Failure[] {
  const observed = instantMicros(w.observedAt)
  const fresh = instantMicros(w.freshUntil)
  if (observed === null || fresh === null || fresh <= observed) return [f('fact_conflict', 'proof_missing')]
  if (w.applicability !== 'known' || observed > at || fresh <= at) return [f('capacity_unproven', 'proof_missing')]
  if (w.verdict === 'unknown') return [f('capacity_unproven', 'proof_missing')]
  if (w.verdict === 'admits') return []
  const reset = w.resetAt === null ? null : instantMicros(w.resetAt)
  return reset !== null && reset <= at
    ? [f('reset_passed_refresh_required', 'availability')]
    : [f('capacity_exhausted', 'availability')]
}

function hasDuplicates(xs: readonly string[]): boolean {
  return new Set(xs).size !== xs.length
}

function observedFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const cap = c.capacity
  if (cap.limits.witness === 'none_applicable')
    return cap.windows.length === 0 ? [] : [f('fact_conflict', 'proof_missing')]
  if (cap.limits.witness !== 'covered' || cap.limits.requiredWindowRefs.length === 0) {
    return [f('capacity_unproven', 'proof_missing')]
  }
  const present = new Set(cap.windows.map((w) => w.windowRef))
  const out = cap.windows.flatMap((w) => windowFailures(w, ctx.at))
  if (!cap.limits.requiredWindowRefs.every((r) => present.has(r))) out.push(f('capacity_unproven', 'proof_missing'))
  return out
}

function conservativeFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const policy = c.capacity.policy
  if (policy === null) return [f('fact_conflict', 'proof_missing')]
  const expected: Expected = {
    proposition: 'conservative_capacity_policy',
    issuer: 'owner',
    authorizerRef: c.ownerRef,
    scope: { ...baseScope(ctx, c), accountGroupRef: c.accountGroup.groupRef },
    role: ctx.input.request.role,
  }
  const out =
    checkResolved(policy.proof, expected, ctx.at) === 'ok'
      ? policy.verdict === 'busy'
        ? [f('account_busy', 'availability')]
        : []
      : [f('capacity_policy_unproven', 'proof_missing')]
  // Readings are not this basis, but a fresh observed exhaustion still limits the account.
  const exhausted = c.capacity.windows.flatMap((w) => windowFailures(w, ctx.at)).filter((x) => x.cls === 'availability')
  return [...out, ...exhausted]
}

function capacityFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const cap = c.capacity
  if (hasDuplicates(cap.windows.map((w) => w.windowRef))) return [f('fact_conflict', 'proof_missing')]
  if ((cap.basis === 'conservative_policy') !== (cap.policy !== null)) return [f('fact_conflict', 'proof_missing')]
  const out =
    cap.basis === 'observed'
      ? observedFailures(ctx, c)
      : cap.basis === 'conservative_policy'
        ? conservativeFailures(ctx, c)
        : [f('capacity_unproven', 'proof_missing')]
  if (c.accountGroup.identity === 'uncertain' && cap.basis !== 'conservative_policy') {
    out.push(f('alias_identity_uncertain', 'proof_missing'))
  }
  return out
}

/** Every role that consumes protected capacity is checked; the witness lists what this request consumes. */
function protectionFailures(c: Candidate): Failure[] {
  const p = c.protection
  if (p.witness === 'none_applicable') return []
  if (p.witness === 'policy_absent') return [f('reserve_policy_missing', 'proof_missing')]
  if (p.witness === 'unknown' || p.requiredDimensionRefs.length === 0) return [f('reserve_unknown', 'proof_missing')]
  const dims = p.verdicts.map((v) => v.dimensionRef)
  if (hasDuplicates(dims) || !sameSet(new Set(dims), new Set(p.requiredDimensionRefs))) {
    return [f('fact_conflict', 'proof_missing')]
  }
  const out: Failure[] = []
  if (p.verdicts.some((v) => v.verdict === 'would_violate')) out.push(f('reserve_protected', 'availability'))
  if (p.verdicts.some((v) => v.verdict === 'unknown')) out.push(f('reserve_unknown', 'proof_missing'))
  return out
}

function commitmentFailures(c: Candidate): Failure[] {
  const k = c.commitments
  const out: Failure[] = []
  if (k.unsettledEffects === 'present') out.push(f('uncertain_effect', 'availability'))
  if (k.accountGroupBusy === 'busy') out.push(f('account_busy', 'availability'))
  if (k.unsettledEffects === 'unknown' || k.accountGroupBusy === 'unknown')
    out.push(f('commitment_unknown', 'proof_missing'))
  return out
}

/** Only actual author session or attempt history excludes; vendor, provider or account alone never does. */
function independenceFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  const ind = ctx.input.independence
  if (ind === null || c.session.kind === 'new') return []
  const s = c.session
  const authored =
    ind.authorSessionRefs.includes(s.sessionRef) || s.attemptRefs.some((a) => ind.authorAttemptRefs.includes(a))
  return authored ? [f('author_session', 'prohibition')] : []
}

function shareFailures(c: Candidate): Failure[] {
  const byViewer = new Map<string, string>()
  for (const s of c.share) {
    const key = JSON.stringify(sortedUnique(s.fields))
    const prior = byViewer.get(s.viewerRef)
    if (prior !== undefined && prior !== key) return [f('fact_conflict', 'proof_missing')]
    byViewer.set(s.viewerRef, key)
  }
  return []
}

const CLASS_ORDER: readonly FailureClass[] = ['prohibition', 'proof_missing', 'availability', 'policy']
const failureOrder = (a: Failure, b: Failure) =>
  CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls) || cmp(a.code, b.code)

function uniqueFailures(xs: readonly Failure[]): Failure[] {
  const seen = new Map<string, Failure>()
  for (const x of xs) seen.set(`${x.cls}\u0000${x.code}`, x)
  return [...seen.values()].toSorted(failureOrder)
}

function candidateFailures(ctx: EvalCtx, c: Candidate): Failure[] {
  return uniqueFailures([
    ...authorityFailures(ctx, c),
    ...memberFailures(ctx, c),
    ...routeFailures(ctx, c),
    ...qualificationFailures(ctx, c),
    ...settingsFailures(ctx, c),
    ...capacityFailures(ctx, c),
    ...protectionFailures(c),
    ...commitmentFailures(c),
    ...independenceFailures(ctx, c),
    ...shareFailures(c),
  ])
}

// --- soft seeds -----------------------------------------------------------------------------------------------------

/** A soft seed is proposed only when declared and, under a grant, granted, for the candidate's own instance. */
function seedFor(ctx: EvalCtx, c: Candidate, scope: PolicyScope | null): Settings | 'unspecified' {
  if (ctx.strict !== null) return ctx.strict
  const soft = scope?.mode === 'prefer' && scope.targetRef === c.candidateRef ? scope.settings : null
  for (const s of [soft, c.settings.defaultSeed]) {
    if (s !== null && seedAllowed(c, s)) return s
  }
  return 'unspecified'
}

function seedAllowed(c: Candidate, s: Settings): boolean {
  const decl = c.settings.declared
  if (decl === 'unknown' || declares(decl, s) !== 'yes') return false
  const a = c.authority
  if (a.basis !== 'contribution_grant') return true
  return a.grant !== null && anyDeclares(a.grant.allowedSettings, s) === 'yes'
}

// --- modes and ranking ----------------------------------------------------------------------------------------------

interface Evaluated {
  candidate: Candidate
  failures: Failure[]
}
const prohibited = (e: Evaluated) => e.failures.some((x) => x.cls === 'prohibition')
const eligible = (e: Evaluated) => e.failures.length === 0

interface ModeResult {
  pool: Evaluated[]
  outcomeCode: string | null
  terminal: 'waiting' | 'denied' | null
  policyExcluded: Map<string, string>
  fallback: { targetRef: string; crossPayer: boolean } | null
}

function pinMode(all: readonly Evaluated[], targetRef: string): ModeResult {
  const target = all.find((e) => e.candidate.candidateRef === targetRef)
  const others = new Map(all.filter((e) => e !== target).map((e) => [e.candidate.candidateRef, 'outside_pin']))
  const base = { policyExcluded: others, fallback: null }
  if (target === undefined) return { ...base, pool: [], outcomeCode: 'pin_target_absent', terminal: 'waiting' }
  if (eligible(target)) return { ...base, pool: [target], outcomeCode: null, terminal: null }
  return prohibited(target)
    ? { ...base, pool: [], outcomeCode: 'pin_cannot_be_honored', terminal: 'denied' }
    : { ...base, pool: [], outcomeCode: 'pin_unavailable', terminal: 'waiting' }
}

function preferMode(ctx: EvalCtx, all: readonly Evaluated[], scope: PolicyScope, targetRef: string): ModeResult {
  const target = all.find((e) => e.candidate.candidateRef === targetRef)
  const none = { pool: [], policyExcluded: new Map<string, string>(), fallback: null }
  if (target === undefined) return { ...none, outcomeCode: 'prefer_target_absent', terminal: 'waiting' }
  if (prohibited(target)) return { ...none, outcomeCode: 'preferred_prohibited', terminal: 'denied' }
  const policyExcluded = new Map<string, string>()
  const pool: Evaluated[] = []
  for (const e of all.filter(eligible)) {
    const c = e.candidate
    const samePayer = c.payerScopeRef === target.candidate.payerScopeRef
    // A cross-payer authorization is for fallback only: it never competes with an eligible preferred target.
    const crossOk =
      !eligible(target) &&
      anyProofOk(ctx, scope.crossPayer, fundingIssuer(ctx, c, 'cross_payer_fallback', target.candidate.payerScopeRef))
    if (e === target || samePayer || crossOk) pool.push(e)
    else policyExcluded.set(c.candidateRef, 'fallback_payer_not_authorized')
  }
  if (pool.length === 0) {
    return { pool, policyExcluded, fallback: null, outcomeCode: 'prefer_fallback_unavailable', terminal: 'waiting' }
  }
  return { pool, policyExcluded, fallback: { targetRef, crossPayer: false }, outcomeCode: null, terminal: null }
}

function autoMode(all: readonly Evaluated[]): ModeResult {
  const pool = all.filter(eligible)
  const base = { pool, policyExcluded: new Map<string, string>(), fallback: null }
  if (all.length === 0) return { ...base, outcomeCode: 'no_candidates', terminal: 'waiting' }
  if (pool.length > 0) return { ...base, outcomeCode: null, terminal: null }
  return all.every(prohibited)
    ? { ...base, outcomeCode: 'no_permitted_candidate', terminal: 'denied' }
    : { ...base, outcomeCode: 'no_available_candidate', terminal: 'waiting' }
}

/** Unknown sorts after every known value; `dir` is 1 for ascending, -1 for descending. */
function knownCmp(a: Known<number>, b: Known<number>, dir: 1 | -1): number {
  if (a.status === 'unknown' || b.status === 'unknown') {
    return (a.status === 'unknown' ? 1 : 0) - (b.status === 'unknown' ? 1 : 0)
  }
  return dir * (a.value - b.value)
}

function availableCmp(a: Known<string>, b: Known<string>): number {
  const x = a.status === 'known' ? instantMicros(a.value) : null
  const y = b.status === 'known' ? instantMicros(b.value) : null
  if (x === null || y === null) return (x === null ? 1 : 0) - (y === null ? 1 : 0)
  return x < y ? -1 : x > y ? 1 : 0
}

const basisRank = (c: Candidate) => (c.capacity.basis === 'observed' ? 0 : 1)

/** The rank steps, in order: capability fit, preference, capacity basis, availability, reliability, cost, identity. */
function rankSteps(a: Candidate, b: Candidate, preferred: string | null): number[] {
  const pref = (c: Candidate) => (c.candidateRef === preferred ? 0 : 1)
  return [
    knownCmp(a.ranking.suitabilityTier, b.ranking.suitabilityTier, 1),
    pref(a) - pref(b),
    basisRank(a) - basisRank(b),
    availableCmp(a.ranking.availableAt, b.ranking.availableAt),
    knownCmp(a.ranking.reliability, b.ranking.reliability, -1),
    knownCmp(a.ranking.costLatencyTier, b.ranking.costLatencyTier, 1),
    cmp(a.candidateRef, b.candidateRef),
  ]
}

const firstStep = (steps: readonly number[]) => steps.findIndex((s) => s !== 0)

function rank(pool: readonly Evaluated[], preferred: string | null): { order: string[]; steps: Map<string, number> } {
  const sorted = pool.toSorted((a, b) => {
    const steps = rankSteps(a.candidate, b.candidate, preferred)
    return steps[firstStep(steps)] ?? 0
  })
  const steps = new Map<string, number>()
  sorted.forEach((e, i) => {
    const next = sorted[i + 1]
    steps.set(
      e.candidate.candidateRef,
      next === undefined ? 0 : firstStep(rankSteps(e.candidate, next.candidate, preferred)) + 1,
    )
  })
  return { order: sorted.map((e) => e.candidate.candidateRef), steps }
}

// --- decision assembly ----------------------------------------------------------------------------------------------

function freezeDeep<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v)
    const values: unknown[] = Object.values(v)
    values.forEach((x) => freezeDeep(x))
  }
  return v
}

/** Brands an internal decision: frozen, and an accidental JSON.stringify throws. Not a security boundary. */
function seal(d: Decision): Decision {
  Object.defineProperty(d, 'toJSON', {
    enumerable: false,
    value: () => {
      throw new Error('selection_decision_not_serializable')
    },
  })
  return freezeDeep(d)
}

function correlation(input: SelectionInput, at: bigint): Correlation {
  const pairs = input.candidates
    .map((c): readonly [string, string] => [c.candidateRef, c.factsRevisionRef])
    .toSorted((a, b) => cmp(a[0], b[0]))
  return {
    contract: input.contract,
    policyVersion: input.policyVersion,
    requestRevision: input.requestRevision,
    evaluatedAt: normalInstant(at),
    candidates: pairs,
  }
}

function makeRow(e: Evaluated, status: Row['status'], seed: Row['seed'], rankStep: number | null): Row {
  const codes = e.failures.map((x) => x.code)
  const c = e.candidate
  return {
    candidateRef: c.candidateRef,
    status,
    failures: e.failures,
    reportedCodes: codes.slice(0, SELECTION_BOUNDS.reported),
    codesTruncated: codes.length > SELECTION_BOUNDS.reported,
    rankStep,
    seed: seed === 'unspecified' ? seed : canonicalSettings(seed),
    ownerRef: c.ownerRef,
    routeKind: c.routeKind,
    payerScopeRef: c.payerScopeRef,
    share: canonicalShare(c.share),
  }
}

function emptyDecision(input: SelectionInput, outcome: Outcome): Decision {
  return {
    contract: SELECTION_INPUT_CONTRACT,
    policyVersion: SELECTION_POLICY_VERSION,
    correlation: null,
    outcome,
    globalCodes: [],
    nextSteps: [],
    resolvedPolicy: null,
    routeDefault: null,
    settings: { strict: null, accepted: 'unknown', observed: 'unknown' },
    rows: [],
    proposedRef: null,
    alternatives: [],
    fallback: null,
    errors: [],
    errorsTruncated: false,
    summaryViewerRefs: sortedUnique(input.summaryViewerRefs),
  }
}

function resolvedPolicyOf(scope: PolicyScope | null): ResolvedPolicy {
  return scope === null
    ? { level: 'implicit', mode: 'auto', targetRef: null, revisionRef: null }
    : { level: scope.level, mode: scope.mode, targetRef: scope.targetRef, revisionRef: scope.revisionRef }
}

const NEXT_STEP: Record<FailureClass, string> = {
  prohibition: 'permitted_alternative_required',
  proof_missing: 'trusted_fact_required',
  availability: 'refresh_or_wait',
  policy: 'policy_change_required',
}
const MODE_STEP: Record<string, string> = {
  no_candidates: 'owner_resource_or_qualified_snapshot_required',
  prefer_target_absent: 'preferred_binding_descriptor_required',
  pin_target_absent: 'pinned_resource_required',
}

function nextSteps(mode: ModeResult, all: readonly Evaluated[]): string[] {
  if (mode.terminal === null) return []
  const fixed = mode.outcomeCode === null ? undefined : MODE_STEP[mode.outcomeCode]
  if (fixed !== undefined) return [fixed]
  return sortedUnique(all.flatMap((e) => e.failures.map((x) => NEXT_STEP[x.cls])))
}

/** The winning scope's mode; a target is structurally required for Prefer and Pin. */
function modeFor(ctx: EvalCtx, all: readonly Evaluated[], scope: PolicyScope | null): ModeResult {
  if (scope === null || scope.targetRef === null) return autoMode(all)
  if (scope.mode === 'pin') return pinMode(all, scope.targetRef)
  return scope.mode === 'prefer' ? preferMode(ctx, all, scope, scope.targetRef) : autoMode(all)
}

function assemble(ctx: EvalCtx, all: Evaluated[], scope: PolicyScope | null): Decision {
  const resolved = resolvedPolicyOf(scope)
  const mode = modeFor(ctx, all, scope)
  const ranked = rank(mode.pool, resolved.mode === 'prefer' ? resolved.targetRef : null)
  const proposedRef = mode.terminal === null ? (ranked.order[0] ?? null) : null
  const rows = all.map((e) => rowFor(ctx, e, mode, ranked.steps, scope))
  const fallback =
    mode.fallback === null || proposedRef === null || proposedRef === mode.fallback.targetRef
      ? null
      : fallbackOf(all, mode.fallback, proposedRef)
  return {
    ...emptyDecision(ctx.input, mode.terminal ?? 'selected'),
    correlation: correlation(ctx.input, ctx.at),
    globalCodes: mode.outcomeCode === null ? [] : [mode.outcomeCode],
    nextSteps: nextSteps(mode, all),
    resolvedPolicy: resolved,
    routeDefault: ctx.routeDefault,
    settings: {
      strict: ctx.strict === null ? null : canonicalSettings(ctx.strict),
      accepted: 'unknown',
      observed: 'unknown',
    },
    rows,
    proposedRef,
    alternatives: proposedRef === null ? [] : ranked.order.slice(1),
    fallback,
  }
}

function fallbackOf(all: readonly Evaluated[], fb: { targetRef: string }, proposedRef: string) {
  const payer = (ref: string) => all.find((e) => e.candidate.candidateRef === ref)?.candidate.payerScopeRef
  return { targetRef: fb.targetRef, crossPayer: payer(fb.targetRef) !== payer(proposedRef) }
}

function rowFor(
  ctx: EvalCtx,
  e: Evaluated,
  mode: ModeResult,
  steps: Map<string, number>,
  scope: PolicyScope | null,
): Row {
  const ref = e.candidate.candidateRef
  const policyCode = mode.policyExcluded.get(ref)
  const failures = policyCode === undefined ? e.failures : uniqueFailures([...e.failures, f(policyCode, 'policy')])
  const status = failures.length === 0 ? 'eligible' : 'excluded'
  return makeRow({ ...e, failures }, status, seedFor(ctx, e.candidate, scope), steps.get(ref) ?? null)
}

function heldDecision(input: SelectionInput, at: bigint, outcome: Outcome, codes: string[]): Decision {
  const rows = input.candidates
    .toSorted((a, b) => cmp(a.candidateRef, b.candidateRef))
    .map((c) => makeRow({ candidate: c, failures: [] }, 'not_evaluated', 'unspecified', null))
  return { ...emptyDecision(input, outcome), correlation: correlation(input, at), globalCodes: codes, rows }
}

/** Evaluates one selection request. Pure: see the module header for what it does and does not guarantee. */
export function evaluateSelection(input: SelectionInput): Decision {
  const issues = structuralIssues(input)
  const at = instantMicros(input.evaluatedAt)
  if (issues.length > 0 || at === null) {
    return seal({
      ...emptyDecision(input, 'invalid_input'),
      errors: issues.slice(0, SELECTION_BOUNDS.reported),
      errorsTruncated: issues.length > SELECTION_BOUNDS.reported,
    })
  }
  if (input.request.activeBindingRef !== null) {
    return seal(heldDecision(input, at, 'refused_active_work', ['active_binding_immutable']))
  }
  const holds = globalHolds(input)
  if (holds.length > 0) return seal(heldDecision(input, at, 'blocked', holds))
  const scope = winningScope(input)
  const ctx: EvalCtx = {
    input,
    at,
    strict: effectiveStrict(input, scope),
    routeDefault: ROUTE_DEFAULT[input.request.family] ?? null,
  }
  const all = input.candidates
    .toSorted((a, b) => cmp(a.candidateRef, b.candidateRef))
    .map((c) => ({ candidate: c, failures: candidateFailures(ctx, c) }))
  return seal(assemble(ctx, all, scope))
}

// --- viewer-safe projection -----------------------------------------------------------------------------------------

export type Limitation =
  | 'eligible'
  | 'owner_only_native'
  | 'not_permitted_for_this_work'
  | 'not_verified'
  | 'unavailable_now'
  | 'not_selected_by_policy'
  | 'not_evaluated'
export interface ViewCandidate {
  candidateRef: string
  relation: 'owner' | 'shared'
  limitation: Limitation
  /** Present only for the resource's owner. */
  codes?: readonly string[]
  routeKind?: RouteKind
  payerScopeRef?: string
  seed?: Settings | 'unspecified'
}
export type SelectionView =
  | { contract: string; policyVersion: string; disclosure: 'restricted' }
  | {
      contract: string
      policyVersion: string
      disclosure: 'shared'
      requestRevision: string | null
      outcome: Outcome
      globalCodes: readonly string[]
      nextSteps: readonly string[]
      mode: 'auto' | 'prefer' | 'pin' | null
      strictSettings: Settings | null
      candidates: readonly ViewCandidate[]
      proposal: (ViewCandidate & { accepted: 'unknown'; observed: 'unknown' }) | { withheld: true } | null
      alternatives: readonly string[]
      fallback: { crossPayer: boolean; targetLimitation: Limitation } | null
    }

function limitationOf(row: Row): Limitation {
  if (row.status === 'not_evaluated') return 'not_evaluated'
  if (row.status === 'eligible') return 'eligible'
  if (row.failures.some((x) => x.code === 'cross_member_native_unqualified')) return 'owner_only_native'
  if (row.failures.some((x) => x.cls === 'prohibition')) return 'not_permitted_for_this_work'
  if (row.failures.some((x) => x.cls === 'proof_missing')) return 'not_verified'
  if (row.failures.some((x) => x.cls === 'availability')) return 'unavailable_now'
  return 'not_selected_by_policy'
}

/** The whitelist every candidate-derived field passes, wherever it appears in the view. */
function viewRow(row: Row, viewerRef: string): ViewCandidate | null {
  const limitation = limitationOf(row)
  if (row.ownerRef === viewerRef) {
    const base = { candidateRef: row.candidateRef, relation: 'owner' as const, limitation }
    return {
      ...base,
      codes: row.reportedCodes,
      routeKind: row.routeKind,
      payerScopeRef: row.payerScopeRef,
      seed: row.seed,
    }
  }
  const grants = row.share.filter((s) => s.viewerRef === viewerRef)
  if (grants.length === 0 || row.failures.some((x) => x.code === 'fact_conflict')) return null
  const fields = new Set(grants.flatMap((s) => s.fields))
  return {
    candidateRef: row.candidateRef,
    relation: 'shared',
    limitation,
    ...(fields.has('route_kind') ? { routeKind: row.routeKind } : {}),
    ...(fields.has('payer_scope') ? { payerScopeRef: row.payerScopeRef } : {}),
    ...(fields.has('settings') ? { seed: row.seed } : {}),
  }
}

/** The only serializable output. A viewer the caller has not permitted to see this request gets one uniform shape. */
export function projectSelection(decision: Decision, viewerRef: string): SelectionView {
  const head = { contract: SELECTION_INPUT_CONTRACT, policyVersion: SELECTION_POLICY_VERSION }
  if (!decision.summaryViewerRefs.includes(viewerRef)) return { ...head, disclosure: 'restricted' }
  const visible = new Map<string, ViewCandidate>()
  for (const row of decision.rows) {
    const v = viewRow(row, viewerRef)
    if (v !== null) visible.set(row.candidateRef, v)
  }
  return {
    ...head,
    disclosure: 'shared',
    requestRevision: decision.correlation?.requestRevision ?? null,
    outcome: decision.outcome,
    globalCodes: decision.globalCodes,
    nextSteps: decision.nextSteps,
    mode: decision.resolvedPolicy?.mode ?? null,
    strictSettings: decision.settings.strict,
    candidates: [...visible.values()],
    proposal: proposalView(decision, visible),
    alternatives: decision.alternatives.filter((r) => visible.has(r)),
    fallback: fallbackView(decision, visible),
  }
}

function proposalView(
  d: Decision,
  visible: ReadonlyMap<string, ViewCandidate>,
): Extract<SelectionView, { disclosure: 'shared' }>['proposal'] {
  if (d.proposedRef === null) return null
  const v = visible.get(d.proposedRef)
  return v === undefined ? { withheld: true } : { ...v, accepted: 'unknown', observed: 'unknown' }
}

/**
 * A fallback's payer relationship is shown only when BOTH payers passed the viewer's whitelist (owner or a current
 * `payer_scope` share); otherwise it is withheld, uniformly. Visibility or summary sharing alone never discloses
 * whether a private payer equals a visible one (R1, 69FC-F01).
 */
function fallbackView(d: Decision, visible: ReadonlyMap<string, ViewCandidate>) {
  if (d.fallback === null || d.proposedRef === null) return null
  const proposal = visible.get(d.proposedRef)
  const target = visible.get(d.fallback.targetRef)
  if (proposal?.payerScopeRef === undefined || target?.payerScopeRef === undefined) return null
  return { crossPayer: d.fallback.crossPayer, targetLimitation: target.limitation }
}
