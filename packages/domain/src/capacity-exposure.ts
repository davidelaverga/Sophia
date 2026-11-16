// INC04-R07 C4/C5: pure capacity reflection (C4) and partial future exposure (C5) under the combined frozen contract
// (PRECODE-R2 + normative ADDENDUM-001 + transition witnesses FG01–FG05). Inactive: nothing imports this module yet.
//
// Guarantees. Every function here is a pure, deterministic function of its arguments. It reads no clock (only the
// instants it is given), no randomness, environment, network or storage, never mutates an argument (results are fresh
// frozen values) and never throws for a well-formed input. Unknown stays unknown: a missing attribution, a missing or
// contradicted bound, a non-final count or a verdict-only reading never becomes a numeric zero. Exact integers only:
// aggregates are summed exactly, and a result outside the safe-integer range is reported as such, never rounded.
//
// Does NOT guarantee (authority boundary). Inputs are ALREADY VALIDATED INTERNAL COLLECTOR FACTS. This module does not
// register, authenticate, authorize, persist, append or disclose anything. A flag such as `issuerQualified`, a
// `finality` fact, a `bound`, a clock bound or a digest is only as true as the trusted server caller that derived it from
// actual registered issuer/qualification custody (ADDENDUM clause 2), a route-qualified server-held clock basis and an
// authentic already-received measurement (clause 3). A caller, model, role, GUC or self-attested number is not such
// authority. Structural inconsistencies are refused (CapacityInputError) rather than repaired. Nothing here is a
// provider limit, an admission decision, a private-capacity disclosure or a money/ledger effect: money state is never an
// input (an item has no money field), and results carry no release, refund or reservation change.

export const CAPACITY_EXPOSURE_CONTRACT = 'R07-C4C5-PRECODE-R2+ADDENDUM-001' as const

export const UNIT_OF_DIMENSION = Object.freeze({
  'openai.output_tokens': 'tokens',
  'openai.input_tokens': 'tokens',
  'openai.input_cached_tokens': 'tokens',
  'openai.model_requests': 'requests',
} as const)

export type Dimension = keyof typeof UNIT_OF_DIMENSION
export type Unit = (typeof UNIT_OF_DIMENSION)[Dimension]

/** A structurally invalid input: refused, never repaired or defaulted. */
export class CapacityInputError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'CapacityInputError'
    this.code = code
  }
}

const HEX64 = /^[0-9a-f]{64}$/

function refuse(code: string, message: string): never {
  throw new CapacityInputError(code, message)
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
const isInstant = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)
const isText = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0
const isDimension = (d: unknown): d is Dimension => typeof d === 'string' && Object.hasOwn(UNIT_OF_DIMENSION, d)
/** Runtime closed-set membership: inputs may come from untyped collectors, so literal types are re-checked. */
const isOneOf = (value: unknown, allowed: readonly string[]): boolean =>
  typeof value === 'string' && allowed.includes(value)

function requireCount(n: unknown, what: string): number {
  if (!isCount(n)) refuse('invalid_number', `${what} must be a non-negative safe integer`)
  return n
}
function requireInstant(n: unknown, what: string): number {
  if (!isInstant(n)) refuse('invalid_instant', `${what} must be a safe integer instant`)
  return n
}
function requireText(s: unknown, what: string): string {
  if (!isText(s)) refuse('invalid_text', `${what} must be a non-empty string`)
  return s
}
function requireDimension(d: unknown): Dimension {
  if (!isDimension(d)) refuse('unknown_dimension', 'unknown dimension')
  return d
}
function requireOneOf(value: unknown, allowed: readonly string[], code: string, what: string): void {
  if (!isOneOf(value, allowed)) refuse(code, `${what} must be one of ${allowed.join(', ')}`)
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freezeDeep(v)
    Object.freeze(value)
  }
  return value
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const byNumber = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0)

// ---- Exact arithmetic (R1-F01) ---------------------------------------------------------------------------------------
// Each accepted scalar is a safe integer, but sums and shifted instants need not be. Aggregates are therefore summed
// exactly as bigint and converted back only when the result is itself a safe integer (`checkedTotals`); a result outside
// that range is never rounded and never labelled exact. The accepted scalar domain is unchanged.

const SAFE_LIMIT = BigInt(Number.MAX_SAFE_INTEGER)
const isSafeTotal = (n: bigint): boolean => n <= SAFE_LIMIT && n >= -SAFE_LIMIT
/** An instant shifted by a clock bound, exactly (`shifted(t, -d)` for the early edge). */
const shifted = (t: number, d: number): bigint => BigInt(t) + BigInt(d)

// ---- Time (R1-F02; ADDENDUM clause 3): one predicate for append, projection and current selection ------------------

export interface Window {
  readonly start: number
  readonly end: number
}

/**
 * A qualified clock-offset bound. `delta` widens nothing on its own: it is a route/source/qualification-bound,
 * server-held offset (ADDENDUM clause 3) that the trusted caller names in `qualifiedBasis`. Without one, δ is 0.
 */
export interface ClockBound {
  readonly delta: number
  readonly qualifiedBasis: string
}

export type TimeState = 'future' | 'historical' | 'not_open' | 'stale' | 'current'

function deltaOf(clock: ClockBound | undefined): number {
  if (clock === undefined) return 0
  if (!isCount(clock.delta) || !isText(clock.qualifiedBasis)) {
    refuse('clock_unqualified', 'a clock bound needs a non-negative integer delta and its qualified basis')
  }
  return clock.delta
}

function requireWindow(w: Window): Window {
  const start = requireInstant(w.start, 'window.start')
  const end = requireInstant(w.end, 'window.end')
  if (!(start < end)) refuse('window_invalid', 'window start must precede its end')
  return { start, end }
}

/** future | historical | not_open | stale | current (first match), conservative under the qualified δ. */
export function timeState(
  window: Window,
  asOf: number,
  freshUntil: number,
  now: number,
  clock?: ClockBound,
): TimeState {
  const w = requireWindow(window)
  const d = deltaOf(clock)
  requireInstant(asOf, 'asOf')
  requireInstant(freshUntil, 'freshUntil')
  requireInstant(now, 'now')
  const late = shifted(now, d)
  if (BigInt(asOf) > late) return 'future'
  if (late >= BigInt(w.end)) return 'historical'
  if (shifted(w.start, d) > BigInt(now)) return 'not_open'
  if (late >= BigInt(freshUntil)) return 'stale'
  return 'current'
}

// ---- Registered windows and append-time checks (R1-F03, §1.4) --------------------------------------------------------

export type WindowSemantics = 'fixed_epoch' | 'rolling'
const SEMANTICS: readonly WindowSemantics[] = ['fixed_epoch', 'rolling']

/** The immutable registration a window key functionally determines (§1.1). */
export interface WindowRegistration {
  readonly windowKey: string
  readonly scopeId: string
  readonly qualRevision: number
  readonly dimension: Dimension
  readonly unit: Unit
  readonly start: number
  readonly end: number
  readonly semantics: WindowSemantics
  readonly measurementBasis: 'issuer_local' | 'shared_qualified'
}

export type Registry = ReadonlyMap<string, WindowRegistration>

export interface ObservationCandidate {
  readonly windowKey: string
  readonly dimension: string
  readonly unit: string
  readonly start: number
  readonly end: number
  readonly semantics: WindowSemantics
  readonly asOf: number
  readonly freshUntil: number
  /** The registered issuer's qualified scope (ADDENDUM clause 2: derived custody, never caller-claimed). */
  readonly issuer: { readonly scopeId: string; readonly qualRevision: number }
}

export type AppendRefusal =
  | 'obs_window_unregistered'
  | 'issuer_unqualified'
  | 'obs_unit_mismatch'
  | 'obs_window_mismatch'
  | 'obs_time_invalid'
  | 'obs_from_future'

function unitOf(dimension: string): Unit | null {
  return isDimension(dimension) ? UNIT_OF_DIMENSION[dimension] : null
}

function registrationMismatch(obs: ObservationCandidate, w: WindowRegistration): AppendRefusal | null {
  if (obs.issuer.scopeId !== w.scopeId || obs.issuer.qualRevision !== w.qualRevision) return 'issuer_unqualified'
  if (unitOf(obs.dimension) !== obs.unit) return 'obs_unit_mismatch'
  const same =
    obs.unit === w.unit &&
    obs.start === w.start &&
    obs.end === w.end &&
    obs.semantics === w.semantics &&
    obs.dimension === w.dimension
  return same ? null : 'obs_window_mismatch'
}

/**
 * Append-time consistency of one observation against its registration; null when consistent. `receivedAt` is the
 * server-side capture time of an already-received measurement (clause 3): δ alone never admits a future reading.
 */
export function checkObservationAppend(
  obs: ObservationCandidate,
  registry: Registry,
  receivedAt: number,
  clock?: ClockBound,
): AppendRefusal | null {
  const d = deltaOf(clock)
  requireInstant(receivedAt, 'receivedAt')
  const w = registry.get(obs.windowKey)
  if (w === undefined) return 'obs_window_unregistered'
  const mismatch = registrationMismatch(obs, w)
  if (mismatch !== null) return mismatch
  const asOf = requireInstant(obs.asOf, 'asOf')
  const freshUntil = requireInstant(obs.freshUntil, 'freshUntil')
  if (!(w.start <= asOf && asOf < w.end && asOf < freshUntil)) return 'obs_time_invalid'
  return BigInt(asOf) > shifted(receivedAt, d) ? 'obs_from_future' : null
}

// ---- Per-effect facts ---------------------------------------------------------------------------------------------

/** `final_total` caps consumption only with qualified finality (N10); `so_far` is lower-bound knowledge only. */
export interface Count {
  readonly kind: 'final_total' | 'so_far'
  readonly value: number
}

/** A qualified effect-finality fact, as folded by `appendFinality` (status known), never a money state. */
export interface FinalityFact {
  readonly basis: 'provider_terminal_known' | 'never_left_release'
  readonly finalAt: number
}
const BASES: readonly FinalityFact['basis'][] = ['provider_terminal_known', 'never_left_release']

/** One effect (original project/reservation/dimension) applicable to a capacity partition. */
export interface EffectItem {
  /** The caller's handle for this effect in this projection; attributions refer to it. */
  readonly key: string
  readonly projectId: string
  readonly reservationId: string
  readonly dimension: Dimension
  readonly createdAt: number
  readonly count: Count | null
  readonly finality: FinalityFact | null
  /** Qualified enforced per-effect bound (DEP-C2); null when there is none. An estimate is never a bound. */
  readonly bound: number | null
  /** The original call's canonical correlation (N1), when known. */
  readonly n1: string | null
}

/** A reflection witness for one effect in one observation. Timestamps alone never yield q. */
export interface Attribution {
  readonly itemKey: string
  readonly observationId: string
  readonly coverage: 'reflected' | 'not_reflected'
  /** Present iff coverage is reflected: the units of the effect the observation reflects. */
  readonly q: number | null
  readonly n1: string | null
  /** A sticky attribution conflict from the attribution fold: q is then unknown. */
  readonly conflict: boolean
  /** The registered issuer's qualification for this attribution (derived custody, clause 2). */
  readonly issuerQualified: boolean
  readonly evidenceDigest: string
}

export type ObservationKind = 'remaining_at' | 'consumed_in_window' | 'verdict_only'

export interface CapacityObservation {
  readonly id: string
  readonly kind: ObservationKind
  /** Numeric reading; null exactly for verdict_only. Never defaulted. */
  readonly value: number | null
  readonly window: Window
  readonly asOf: number
  readonly freshUntil: number
  readonly semantics: WindowSemantics
  readonly dimension: Dimension
}

export interface ProjectionInput {
  readonly observation: CapacityObservation
  readonly items: readonly EffectItem[]
  readonly attributions: readonly Attribution[]
  readonly now: number
  readonly clock?: ClockBound
  /** The provider scope's current qualification (false: withdrawn or unqualified). */
  readonly scopeQualified: boolean
  /**
   * Earlier validated q per item handle in the same fixed epoch (coverage regression check). Every alias handle of an
   * original effect is consulted and the highest earlier q kept (R1-F03); it is never summed or carried as q.
   */
  readonly priorQ?: ReadonlyMap<string, number>
}

export interface Projection {
  /**
   * `range_unsupported` (R1-F01): an exact aggregate lies outside the safe-integer range, so no numeric field is given;
   * it is restrictive (never usable as current capacity) and never a rounded number.
   */
  readonly status:
    | 'exact'
    | 'bounded'
    | 'bounded_unknown_ceiling'
    | 'consumed'
    | 'verdict_only'
    | 'scope_unqualified'
    | 'range_unsupported'
  readonly reasons: readonly string[]
  readonly flags: readonly string[]
  readonly freshness: TimeState | 'n/a'
  readonly usableCurrent: boolean
  /** False when any applicable effect's q is unknown (P03); never upgraded by equal numbers elsewhere. */
  readonly coverageComplete?: boolean
  readonly xFloor?: number
  readonly xCeiling?: number | null
  readonly effectiveCeiling?: number
  readonly effectiveFloor?: number | null
  readonly admits?: false
  readonly possibleOverBy?: number
  readonly provenOverBy?: number
  readonly attributed?: number
  readonly unattributed?: number | null
  readonly attributedIsLowerBound?: boolean
  readonly factConflict?: true
}

type Applicability = 'outside' | 'inside_final' | 'inside_open' | 'straddle'

function applicability(it: EffectItem, w: Window, now: number, d: number): Applicability {
  const start = BigInt(w.start)
  const end = BigInt(w.end)
  const created = shifted(it.createdAt, -d)
  if (created >= end) return 'outside'
  if (it.finality !== null) {
    const finalAt = shifted(it.finality.finalAt, d)
    if (finalAt < start) return 'outside'
    return created >= start && finalAt < end ? 'inside_final' : 'straddle'
  }
  return created >= start && now < w.end ? 'inside_open' : 'straddle'
}

/** The valid final whole-effect total: a final_total count WITH qualified finality, else null. */
function validFinalTotal(it: EffectItem): number | null {
  return it.count !== null && it.count.kind === 'final_total' && it.finality !== null ? it.count.value : null
}

interface Knowledge {
  readonly cLo: number
  readonly cHi: number | null
  readonly flags: readonly string[]
  readonly invariant: string | null
}

function knowledge(it: EffectItem, q: number): Knowledge {
  const ft = validFinalTotal(it)
  if (ft !== null) {
    // N10: a valid final total caps consumption and has precedence over a contradicted bound.
    const flags = it.bound !== null && ft > it.bound ? ['used_exceeds_bound'] : []
    return { cLo: ft, cHi: ft, flags, invariant: null }
  }
  // A final_total without qualified finality is refused as a total and HELD as lower-bound knowledge.
  const invariant = it.count?.kind === 'final_total' ? 'count_finality_inconsistent' : null
  const cLo = Math.max(it.count?.value ?? 0, q)
  if (it.bound === null) return { cLo, cHi: null, flags: [], invariant }
  if (it.bound < cLo) return { cLo, cHi: null, flags: ['bound_contradicted'], invariant }
  return { cLo, cHi: it.bound, flags: [], invariant }
}

function validateCountAndFinality(it: EffectItem): void {
  if (it.count !== null) {
    requireOneOf(it.count.kind, ['final_total', 'so_far'], 'invalid_count', 'count kind')
    requireCount(it.count.value, 'item.count.value')
  }
  if (it.finality === null) return
  requireOneOf(it.finality.basis, BASES, 'invalid_finality', 'finality basis')
  requireInstant(it.finality.finalAt, 'item.finality.finalAt')
  const neverLeftZero = it.count?.kind === 'final_total' && it.count.value === 0
  if (it.finality.basis === 'never_left_release' && !neverLeftZero) {
    refuse('finality_count_invalid', 'never-left release is a final total of 0')
  }
}

function validateItem(it: EffectItem, dimension: Dimension): void {
  requireText(it.key, 'item.key')
  requireText(it.projectId, 'item.projectId')
  requireText(it.reservationId, 'item.reservationId')
  if (requireDimension(it.dimension) !== dimension) refuse('partition_mismatch', 'item dimension differs from window')
  requireInstant(it.createdAt, 'item.createdAt')
  validateCountAndFinality(it)
  if (it.bound !== null) requireCount(it.bound, 'item.bound')
}

const identityOf = (it: EffectItem): string => `${it.projectId}\u0000${it.reservationId}\u0000${it.dimension}`

/** Canonical facts of one effect (handle excluded): equal for exact duplicates and aliases. */
const factsOf = (it: EffectItem): string =>
  JSON.stringify([
    it.createdAt,
    it.bound,
    it.n1,
    it.count?.kind ?? null,
    it.count?.value ?? null,
    it.finality?.basis ?? null,
    it.finality?.finalAt ?? null,
  ])

interface Effect {
  readonly item: EffectItem
  readonly keys: readonly string[]
}

/**
 * One entry per original effect: exact duplicates and aliases (other handles for the same project/reservation/
 * dimension) are merged once, so q is never counted twice; differing facts for one effect are refused.
 */
function effectsOf(items: readonly EffectItem[], dimension: Dimension): readonly Effect[] {
  const byIdentity = new Map<string, { item: EffectItem; keys: string[] }>()
  const keyOwner = new Map<string, string>()
  for (const it of items) {
    validateItem(it, dimension)
    const id = identityOf(it)
    const owner = keyOwner.get(it.key)
    if (owner !== undefined && owner !== id) refuse('item_key_conflict', 'one item key names two effects')
    keyOwner.set(it.key, id)
    const seen = byIdentity.get(id)
    if (seen === undefined) {
      byIdentity.set(id, { item: it, keys: [it.key] })
    } else {
      if (factsOf(seen.item) !== factsOf(it)) refuse('item_conflict', 'differing facts for one effect')
      if (!seen.keys.includes(it.key)) seen.keys.push(it.key)
    }
  }
  return [...byIdentity.values()].map((e) => ({ item: e.item, keys: e.keys }))
}

function validateAttribution(a: Attribution): void {
  requireText(a.itemKey, 'attribution.itemKey')
  requireText(a.observationId, 'attribution.observationId')
  requireOneOf(a.coverage, ['reflected', 'not_reflected'], 'invalid_coverage', 'coverage')
  if (a.coverage === 'reflected') requireCount(a.q, 'attribution.q')
  else if (a.q !== null) refuse('att_q_invalid', 'q is present only for reflected coverage')
  if (typeof a.conflict !== 'boolean' || typeof a.issuerQualified !== 'boolean') {
    refuse('invalid_attribution', 'conflict and issuerQualified must be booleans')
  }
}

const witnessOf = (a: Attribution): string => JSON.stringify([a.coverage, a.q, a.n1, a.conflict, a.issuerQualified])

/**
 * The single attribution witness for an effect in THIS observation, or why there is none (q is never carried across
 * observations, and disagreeing alias witnesses are a conflict).
 */
function attributionFor(effect: Effect, atts: readonly Attribution[], observationId: string): Attribution | string {
  const mine = atts.filter((a) => effect.keys.includes(a.itemKey))
  if (mine.length === 0) return 'missing'
  const here = mine.filter((a) => a.observationId === observationId)
  const first = here[0]
  if (first === undefined) return 'attribution_other_partition'
  if (here.some((a) => witnessOf(a) !== witnessOf(first))) return 'att_conflict'
  return HEX64.test(first.evidenceDigest) ? first : 'attribution_witness_invalid'
}

interface ValidatedQ {
  readonly q: number | null
  readonly why: string | null
}

function qFromWitness(it: EffectItem, a: Attribution): ValidatedQ {
  if (!a.issuerQualified) return { q: null, why: 'issuer_unqualified' }
  if (a.conflict) return { q: null, why: 'att_conflict' }
  if (it.n1 !== null && a.n1 !== null && a.n1 !== it.n1) return { q: null, why: 'att_correlation_conflict' }
  const q = a.q ?? 0
  const ft = validFinalTotal(it)
  return ft !== null && q > ft ? { q: null, why: 'q_exceeds_used' } : { q, why: null }
}

function validatedQ(effect: Effect, witness: Attribution | string): ValidatedQ {
  if (typeof witness !== 'string') return qFromWitness(effect.item, witness)
  // Only a VALID final whole-effect zero needs no witness; anything else missing is unknown, never zero.
  if (witness === 'missing')
    return validFinalTotal(effect.item) === 0 ? { q: 0, why: null } : { q: null, why: 'coverage_unknown' }
  return { q: null, why: witness }
}

const OBSERVATION_KINDS: readonly ObservationKind[] = ['remaining_at', 'consumed_in_window', 'verdict_only']

function validateObservation(o: CapacityObservation): void {
  requireText(o.id, 'observation.id')
  requireDimension(o.dimension)
  requireWindow(o.window)
  requireInstant(o.asOf, 'observation.asOf')
  requireInstant(o.freshUntil, 'observation.freshUntil')
  requireOneOf(o.semantics, SEMANTICS, 'invalid_semantics', 'semantics')
  requireOneOf(o.kind, OBSERVATION_KINDS, 'invalid_kind', 'observation kind')
  if (o.kind !== 'verdict_only') requireCount(o.value, 'observation.value')
  else if (o.value !== null) refuse('obs_value_invalid', 'a verdict-only reading carries no value')
}

/** Exact running sums (bigint, R1-F01); converted only by `checkedTotals`. */
interface Accumulated {
  readonly reasons: string[]
  readonly flags: string[]
  xFloor: bigint
  xCeiling: bigint | null
  attributed: bigint
  complete: boolean
}

function regressed(q: number | null, prior: number | undefined, fixed: boolean): boolean {
  return q !== null && prior !== undefined && fixed && q < prior
}

/**
 * The earlier validated q of the ORIGINAL effect (R1-F03): every alias handle is consulted, so the result does not
 * depend on which handle came first, and the highest (most restrictive) earlier q is kept. Alias records are never
 * summed, and an earlier q is only compared, never used as this observation's q.
 */
function priorQOf(effect: Effect, prior: ReadonlyMap<string, number> | undefined): number | undefined {
  if (prior === undefined) return undefined
  const known = effect.keys.map((k) => prior.get(k)).filter((v) => v !== undefined)
  for (const v of known) requireCount(v, 'priorQ')
  return known.length === 0 ? undefined : Math.max(...known)
}

/** One effect's contribution (§5.1 order: witness, regression, knowledge, ceiling). */
function contribute(acc: Accumulated, effect: Effect, n: number, input: ProjectionInput, d: number): void {
  const o = input.observation
  const it = effect.item
  const appl = applicability(it, o.window, input.now, d)
  if (appl === 'outside') return
  const v = validatedQ(effect, attributionFor(effect, input.attributions, o.id))
  const regression = regressed(v.q, priorQOf(effect, input.priorQ), o.semantics === 'fixed_epoch')
  let q = regression ? null : v.q
  const why = regression ? 'coverage_regression' : v.why
  if (why !== null) acc.reasons.push(`${why}:#${n}`)
  const k = knowledge(it, q ?? 0)
  if (k.invariant !== null) acc.reasons.push(`${k.invariant}:#${n}`)
  for (const f of k.flags) acc.flags.push(`${f}:#${n}`)
  if (q !== null && k.cHi !== null && q > k.cHi) {
    acc.reasons.push(`q_exceeds_ceiling:#${n}`)
    q = null
  }
  addExposure(acc, appl, q, k, n)
}

function addExposure(acc: Accumulated, appl: Applicability, q: number | null, k: Knowledge, n: number): void {
  // Each per-effect difference is of two safe non-negative integers (q <= cHi was checked), so it is exact; only the
  // running sums can leave the safe range, and they are bigint.
  if (q === null) acc.complete = false
  else acc.attributed += BigInt(q)
  if (appl !== 'straddle' && q !== null) acc.xFloor += BigInt(Math.max(k.cLo - q, 0))
  if (acc.xCeiling === null) return
  if (q !== null && k.cHi !== null) {
    acc.xCeiling += BigInt(k.cHi - q)
    return
  }
  if (k.cHi === null && q !== null) {
    acc.reasons.push(`${k.flags.includes('bound_contradicted') ? 'future_exposure_unknown' : 'ceiling_unknown'}:#${n}`)
  }
  acc.xCeiling = null
}

type ProjectionBase = Pick<Projection, 'reasons' | 'flags' | 'freshness' | 'usableCurrent' | 'coverageComplete'>

/** The exact sums as safe integers. Every derived output is a difference of two of these safe non-negative values. */
interface Totals {
  readonly xFloor: number
  readonly xCeiling: number | null
  readonly attributed: number
  readonly complete: boolean
}

/**
 * Checked conversion of the exact sums (R1-F01), or null when the floor or the attributed sum is not a safe integer
 * (the projection is then `range_unsupported`). A ceiling beyond the safe range is reported as an unknown ceiling,
 * which is restrictive (no effective floor, admits false), with the reason `ceiling_beyond_safe_range`.
 */
function checkedTotals(acc: Accumulated): Totals | null {
  if (!isSafeTotal(acc.xFloor) || !isSafeTotal(acc.attributed)) return null
  let xCeiling: number | null = null
  if (acc.xCeiling !== null && isSafeTotal(acc.xCeiling)) xCeiling = Number(acc.xCeiling)
  else if (acc.xCeiling !== null) acc.reasons.push('ceiling_beyond_safe_range')
  return { xFloor: Number(acc.xFloor), xCeiling, attributed: Number(acc.attributed), complete: acc.complete }
}

function rangeUnsupported(base: ProjectionBase): Projection {
  const p: Projection = {
    ...base,
    status: 'range_unsupported',
    reasons: [...base.reasons, 'aggregate_beyond_safe_range'],
    usableCurrent: false,
  }
  return freezeDeep(p)
}

function finishConsumed(t: Totals, V: number, base: ProjectionBase): Projection {
  const unattributed: Pick<Projection, 'factConflict' | 'unattributed'> =
    t.attributed > V ? { factConflict: true, unattributed: null } : { unattributed: V - t.attributed }
  const p: Projection = {
    ...base,
    status: 'consumed',
    xFloor: t.xFloor,
    xCeiling: t.xCeiling,
    attributed: t.attributed,
    attributedIsLowerBound: !t.complete,
    ...unattributed,
  }
  return freezeDeep(p)
}

function finishRemaining(t: Totals, V: number, base: ProjectionBase): Projection {
  const effectiveCeiling = V - t.xFloor
  const over: Pick<Projection, 'provenOverBy'> = effectiveCeiling < 0 ? { provenOverBy: t.xFloor - V } : {}
  if (t.xCeiling === null) {
    const p: Projection = {
      ...base,
      status: 'bounded_unknown_ceiling',
      xFloor: t.xFloor,
      xCeiling: null,
      effectiveCeiling,
      effectiveFloor: null,
      admits: false,
      ...over,
    }
    return freezeDeep(p)
  }
  const effectiveFloor = V - t.xCeiling
  const possible: Pick<Projection, 'possibleOverBy'> = effectiveFloor < 0 ? { possibleOverBy: t.xCeiling - V } : {}
  const p: Projection = {
    ...base,
    status: t.xCeiling === t.xFloor ? 'exact' : 'bounded',
    xFloor: t.xFloor,
    xCeiling: t.xCeiling,
    effectiveCeiling,
    effectiveFloor,
    ...possible,
    ...over,
  }
  return freezeDeep(p)
}

function nonNumeric(status: 'scope_unqualified' | 'verdict_only', freshness: TimeState | 'n/a'): Projection {
  const reason = status === 'scope_unqualified' ? 'scope_unqualified' : 'verdict_only_not_numeric'
  return freezeDeep({ status, reasons: [reason], flags: [], freshness, usableCurrent: false })
}

/**
 * C4 reflection and C5 exposure of one observation over the effects applicable to its partition. The exposure interval
 * [xFloor, xCeiling] bounds the units applicable effects consumed or may still consume that the observation does not
 * yet reflect; effective capacity follows from it (§5.2). Diagnostics name the effect position ("code:#n").
 */
export function projectObservation(input: ProjectionInput): Projection {
  const o = input.observation
  validateObservation(o)
  requireInstant(input.now, 'now')
  if (typeof input.scopeQualified !== 'boolean') refuse('invalid_scope', 'scopeQualified must be a boolean')
  if (!input.scopeQualified) return nonNumeric('scope_unqualified', 'n/a')
  const d = deltaOf(input.clock)
  const freshness = timeState(o.window, o.asOf, o.freshUntil, input.now, input.clock)
  for (const a of input.attributions) validateAttribution(a)
  const effects = effectsOf(input.items, o.dimension)
  if (o.value === null) return nonNumeric('verdict_only', freshness)
  const acc: Accumulated = { reasons: [], flags: [], xFloor: 0n, xCeiling: 0n, attributed: 0n, complete: true }
  effects.forEach((effect, n) => {
    contribute(acc, effect, n, input, d)
  })
  const totals = checkedTotals(acc)
  const base: ProjectionBase = {
    reasons: acc.reasons,
    flags: acc.flags,
    freshness,
    usableCurrent: freshness === 'current',
    coverageComplete: acc.complete,
  }
  if (totals === null) return rangeUnsupported(base)
  return o.kind === 'consumed_in_window'
    ? finishConsumed(totals, o.value, base)
    : finishRemaining(totals, o.value, base)
}

// ---- Comparable snapshots, regressions and current selection (§5.3, ADDENDUM boundaries) ----------------------------

export interface RegisteredObservation {
  readonly id: string
  readonly issuerId: string
  readonly windowKey: string
  readonly qualRevision: number
  readonly kind: ObservationKind
  readonly asOf: number
  readonly freshUntil: number
  readonly value: number | null
  readonly measurementId: string | null
}

export interface ObservationEffects {
  readonly items: readonly EffectItem[]
  readonly attributions: readonly Attribution[]
}

export interface ReconcileInput {
  readonly observations: readonly RegisteredObservation[]
  readonly registry: Registry
  readonly now: number
  readonly clock?: ClockBound
  readonly scopeQualified: boolean
  /** Each observation's own applicable effects and attributions; absent means none (q is per observation). */
  readonly perObservation?: ReadonlyMap<string, ObservationEffects>
}

export type CurrentSelection =
  | { readonly status: 'unknown'; readonly reason: 'no_current' | 'conflict_or_regression' }
  | {
      readonly status: 'known'
      readonly observations: readonly string[]
      readonly projection: Projection
      readonly eachProjectionRetained: Readonly<Record<string, Projection>>
      readonly diagnostics: { readonly reasons: readonly string[]; readonly coverageComplete: boolean }
    }
  | {
      readonly status: 'tie_bounded'
      readonly reason: 'incomparable_tie'
      readonly observations: readonly string[]
      readonly effectiveFloor: number | null
      readonly effectiveCeiling: number | null
      readonly eachProjectionRetained: Readonly<Record<string, Projection>>
    }

export interface Reconciliation {
  readonly conflicts: readonly (readonly [string, string])[]
  readonly regressions: readonly (readonly [string, string])[]
  readonly current: CurrentSelection
}

function comparable(a: RegisteredObservation, b: RegisteredObservation, w: WindowRegistration): boolean {
  if (a.windowKey !== b.windowKey || a.kind !== b.kind || a.qualRevision !== b.qualRevision) return false
  if (a.measurementId !== null && b.measurementId !== null) {
    return (
      a.measurementId === b.measurementId && (w.measurementBasis === 'shared_qualified' || a.issuerId === b.issuerId)
    )
  }
  return a.measurementId === null && b.measurementId === null && a.asOf === b.asOf
}

/** One reconciliation covers one window key, kind and qualification revision; anything else is refused. */
function partitionOf(input: ReconcileInput, first: RegisteredObservation): WindowRegistration {
  const w = input.registry.get(first.windowKey) ?? refuse('obs_window_unregistered', 'unregistered window')
  const ids = new Set<string>()
  for (const o of input.observations) {
    requireText(o.id, 'observation.id')
    if (ids.has(o.id)) refuse('duplicate_observation', 'observation ids must be unique')
    ids.add(o.id)
    if (o.windowKey !== first.windowKey || o.kind !== first.kind || o.qualRevision !== first.qualRevision) {
      refuse('mixed_partition', 'one reconciliation covers one window key, kind and qualification revision')
    }
    requireInstant(o.asOf, 'asOf')
    requireInstant(o.freshUntil, 'freshUntil')
    const valid = o.kind === 'verdict_only' ? o.value === null : isCount(o.value)
    if (!valid) refuse('obs_value_invalid', 'invalid value')
  }
  return w
}

function conflictsOf(obs: readonly RegisteredObservation[], w: WindowRegistration): (readonly [string, string])[] {
  const out: (readonly [string, string])[] = []
  obs.forEach((a, i) => {
    for (const b of obs.slice(i + 1)) if (comparable(a, b, w) && a.value !== b.value) out.push([a.id, b.id])
  })
  return out
}

/** A strictly later reading y breaks fixed-epoch monotonicity against x (remaining may not rise, consumed not fall). */
function violates(x: RegisteredObservation, y: RegisteredObservation): boolean {
  if (x.value === null || y.value === null || !(x.asOf < y.asOf)) return false
  return x.kind === 'remaining_at' ? y.value > x.value : y.value < x.value
}

/**
 * Fixed-epoch monotonicity over the COMPLETE strict-as-of relation (R1-F02): every numeric reading is compared with
 * every strictly later one, so an equal-as-of group can never hide a regression behind its id order or input order.
 * Readings with the same as-of are not ordered here (comparable ones are conflicts, others an incomparable tie). The
 * pairs come out in (as-of, id) order, independent of the input permutation.
 */
function regressionsOf(obs: readonly RegisteredObservation[], w: WindowRegistration): (readonly [string, string])[] {
  if (w.semantics !== 'fixed_epoch') return []
  const seq = obs.toSorted((x, y) => byNumber(x.asOf, y.asOf) || byText(x.id, y.id))
  return seq.flatMap((x, i) =>
    seq
      .slice(i + 1)
      .filter((y) => violates(x, y))
      .map((y) => [x.id, y.id] as const),
  )
}

function projectRegistered(o: RegisteredObservation, w: WindowRegistration, input: ReconcileInput): Projection {
  const eff = input.perObservation?.get(o.id)
  return projectObservation({
    observation: {
      id: o.id,
      kind: o.kind,
      value: o.value,
      window: { start: w.start, end: w.end },
      asOf: o.asOf,
      freshUntil: o.freshUntil,
      semantics: w.semantics,
      dimension: w.dimension,
    },
    items: eff?.items ?? [],
    attributions: eff?.attributions ?? [],
    now: input.now,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    scopeQualified: input.scopeQualified,
  })
}

const projectionSignature = (p: Projection): string =>
  JSON.stringify([
    p.status,
    p.effectiveFloor ?? null,
    p.effectiveCeiling ?? null,
    p.attributed ?? null,
    p.unattributed ?? null,
  ])

const nullableExtreme = (values: readonly (number | null | undefined)[], pick: 'min' | 'max'): number | null => {
  const nums = values.filter((v): v is number => typeof v === 'number')
  if (nums.length !== values.length) return null
  return pick === 'min' ? Math.min(...nums) : Math.max(...nums)
}

function selectTop(top: readonly string[], projections: Record<string, Projection>): CurrentSelection {
  const all = top.map((id) => projections[id]).filter((p): p is Projection => p !== undefined)
  const first = all[0]
  if (first === undefined) return { status: 'unknown', reason: 'no_current' }
  if (new Set(all.map(projectionSignature)).size === 1) {
    // ADDENDUM boundary: equal numbers keep every candidate and the union of diagnostics; never an upgrade.
    const reasons = [...new Set(top.flatMap((id) => (projections[id]?.reasons ?? []).map((r) => `${id}:${r}`)))]
    const coverageComplete = all.every((p) => p.coverageComplete !== false)
    return {
      status: 'known',
      observations: top,
      projection: first,
      eachProjectionRetained: projections,
      diagnostics: { reasons, coverageComplete },
    }
  }
  return {
    status: 'tie_bounded',
    reason: 'incomparable_tie',
    observations: top,
    effectiveFloor: nullableExtreme(
      all.map((p) => p.effectiveFloor),
      'min',
    ),
    effectiveCeiling: nullableExtreme(
      all.map((p) => p.effectiveCeiling),
      'max',
    ),
    eachProjectionRetained: projections,
  }
}

/**
 * Reconciles the accepted observations of ONE partition (window key, kind, qualification revision): comparable
 * different values are sticky conflicts; a fixed epoch is monotonic over as-of; the current reading is the latest
 * current one, an equivalent tie keeps every candidate's diagnostics, and an incomparable tie is bounded — never chosen
 * by issuer or arrival order. Mixed partitions are refused.
 */
export function reconcileObservations(input: ReconcileInput): Reconciliation {
  requireInstant(input.now, 'now')
  const first = input.observations[0]
  if (first === undefined) {
    return freezeDeep({ conflicts: [], regressions: [], current: { status: 'unknown', reason: 'no_current' } })
  }
  const w = partitionOf(input, first)
  const conflicts = conflictsOf(input.observations, w)
  const regressions = regressionsOf(input.observations, w)
  const cands = input.observations.filter(
    (o) => timeState(w, o.asOf, o.freshUntil, input.now, input.clock) === 'current',
  )
  if (cands.length === 0 || conflicts.length > 0 || regressions.length > 0) {
    const reason = cands.length === 0 ? ('no_current' as const) : ('conflict_or_regression' as const)
    return freezeDeep({ conflicts, regressions, current: { status: 'unknown' as const, reason } })
  }
  const latest = Math.max(...cands.map((o) => o.asOf))
  const top = cands
    .filter((o) => o.asOf === latest)
    .map((o) => o.id)
    .toSorted(byText)
  const projections: Record<string, Projection> = {}
  for (const o of cands) if (top.includes(o.id)) projections[o.id] = projectRegistered(o, w, input)
  return freezeDeep({ conflicts, regressions, current: selectTop(top, projections) })
}

// ---- Finality knowledge fold (ADDENDUM clause 1; FG01–FG05) ---------------------------------------------------------

/** One finality append payload, already canonicalized; `payloadDigest` is its supplied canonical identity. */
export interface FinalityAppend {
  readonly subject: { readonly projectId: string; readonly reservationId: string; readonly dimension: Dimension }
  readonly payloadDigest: string
  readonly basis: FinalityFact['basis']
  readonly finalAt: number
  readonly countKind: 'final_total' | 'none'
  readonly finalCount: number | null
  readonly evidenceDigest: string
  readonly approvalRefDigest: string
  readonly issuerId: string
  readonly issuerQualRevision: number
}

export interface FinalityReceipt {
  readonly seq: number
  readonly payloadDigest: string
  readonly kind: 'established' | 'extended' | 'provenance' | 'conflict'
}

export interface KnownFinality {
  readonly basis: FinalityFact['basis']
  readonly finalAt: number
  readonly finalCount: number | null
}

export interface FinalityState {
  readonly subjectKey: string
  /** Sticky: once a genuine known-fact conflict is recorded it stays. */
  readonly status: 'known' | 'conflict'
  /** First-known truth; an unknown count may later be extended, a known field is never overwritten. */
  readonly known: KnownFinality
  readonly receipts: readonly FinalityReceipt[]
  readonly competing: readonly (KnownFinality & { readonly payloadDigest: string })[]
  readonly payloads: Readonly<Record<string, KnownFinality & { readonly provenance: string }>>
}

export interface FinalityOutcome {
  readonly receipt: FinalityReceipt
  readonly replay: boolean
}

interface FinalityStep {
  readonly state: FinalityState
  readonly outcome: FinalityOutcome
}

function validateFinality(r: FinalityAppend): void {
  requireText(r.subject.projectId, 'subject.projectId')
  requireText(r.subject.reservationId, 'subject.reservationId')
  requireDimension(r.subject.dimension)
  for (const digest of [r.payloadDigest, r.evidenceDigest, r.approvalRefDigest]) {
    if (!HEX64.test(digest)) refuse('payload_invalid', 'digests must be 64 lowercase hex digits')
  }
  requireText(r.issuerId, 'issuerId')
  requireCount(r.issuerQualRevision, 'issuerQualRevision')
  requireInstant(r.finalAt, 'finalAt')
  requireOneOf(r.basis, BASES, 'payload_invalid', 'basis')
  requireOneOf(r.countKind, ['final_total', 'none'], 'payload_invalid', 'countKind')
  if ((r.countKind === 'final_total') !== (r.finalCount !== null)) refuse('finality_count_invalid', 'count presence')
  if (r.finalCount !== null) requireCount(r.finalCount, 'finalCount')
  if (r.basis === 'never_left_release' && r.finalCount !== 0) refuse('finality_count_invalid', 'never-left is total 0')
}

const subjectKeyOf = (r: FinalityAppend): string =>
  `${r.subject.projectId}\u0000${r.subject.reservationId}\u0000${r.subject.dimension}`
const factsOfAppend = (r: FinalityAppend): KnownFinality => ({
  basis: r.basis,
  finalAt: r.finalAt,
  finalCount: r.finalCount,
})
const provenanceOf = (r: FinalityAppend): string =>
  `${r.evidenceDigest}:${r.approvalRefDigest}:${r.issuerId}:${r.issuerQualRevision}`

const isDeepFrozen = (v: unknown): boolean =>
  v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(isDeepFrozen))
const copyKnown = (k: KnownFinality): KnownFinality => ({
  basis: k.basis,
  finalAt: k.finalAt,
  finalCount: k.finalCount,
})

/**
 * A caller-owned state as this module's own value (Root77 purity addendum). A structurally valid state need not be a
 * frozen instance produced here; freezing its nested objects would change the caller's objects (their frozen and
 * extensible status), so a state that is not already deeply frozen is copied field by field before anything is
 * frozen. A deeply frozen state is immutable and safely reused. Values, receipts and their order are unchanged.
 */
function ownedState(s: FinalityState): FinalityState {
  if (isDeepFrozen(s)) return s
  return {
    subjectKey: s.subjectKey,
    status: s.status,
    known: copyKnown(s.known),
    receipts: s.receipts.map((r) => ({ seq: r.seq, payloadDigest: r.payloadDigest, kind: r.kind })),
    competing: s.competing.map((c) => ({ ...copyKnown(c), payloadDigest: c.payloadDigest })),
    payloads: Object.fromEntries(
      Object.entries(s.payloads).map(([digest, p]) => [digest, { ...copyKnown(p), provenance: p.provenance }]),
    ),
  }
}

function established(record: FinalityAppend): FinalityStep {
  const receipt: FinalityReceipt = { seq: 1, payloadDigest: record.payloadDigest, kind: 'established' }
  const facts = factsOfAppend(record)
  return freezeDeep({
    state: {
      subjectKey: subjectKeyOf(record),
      status: 'known' as const,
      known: facts,
      receipts: [receipt],
      competing: [],
      payloads: { [record.payloadDigest]: { ...facts, provenance: provenanceOf(record) } },
    },
    outcome: { receipt, replay: false },
  })
}

/** An exact payload replay returns its original receipt; one digest naming two payloads is refused. */
function replayOf(state: FinalityState, record: FinalityAppend): FinalityStep | null {
  const seen = state.payloads[record.payloadDigest]
  if (seen === undefined) return null
  const facts = factsOfAppend(record)
  const same =
    seen.basis === facts.basis &&
    seen.finalAt === facts.finalAt &&
    seen.finalCount === facts.finalCount &&
    seen.provenance === provenanceOf(record)
  if (!same) refuse('digest_collision', 'one payload digest names two payloads')
  const receipt = state.receipts.find((r) => r.payloadDigest === record.payloadDigest)
  if (receipt === undefined) refuse('state_invalid', 'a recorded payload has no receipt')
  return freezeDeep({ state, outcome: { receipt, replay: true } })
}

type FinalityTransition = 'conflict' | 'extended' | 'provenance'

/** Known semantic facts decide: a differing known count or terminal fact conflicts; an unknown count may only improve. */
function transitionOf(known: KnownFinality, facts: KnownFinality): FinalityTransition {
  const terminalConflict = facts.basis !== known.basis || facts.finalAt !== known.finalAt
  const countConflict = known.finalCount !== null && facts.finalCount !== null && facts.finalCount !== known.finalCount
  if (terminalConflict || countConflict) return 'conflict'
  return known.finalCount === null && facts.finalCount !== null ? 'extended' : 'provenance'
}

/**
 * Folds one finality append into the subject's immutable knowledge (returns a NEW state; the old one is untouched).
 * none→known count and compatible provenance extend knowledge with a new receipt; a differing known count or
 * incompatible known terminal facts are a sticky conflict that keeps the first-known truth and the competing payload;
 * an exact payload replay (including a lost-reply retry) returns the same receipt and adds nothing.
 */
export function appendFinality(state: FinalityState | null, record: FinalityAppend): FinalityStep {
  validateFinality(record)
  if (state === null) return established(record)
  if (state.subjectKey !== subjectKeyOf(record)) refuse('subject_mismatch', 'a finality fold covers one effect')
  const own = ownedState(state)
  const replay = replayOf(own, record)
  if (replay !== null) return replay
  const facts = factsOfAppend(record)
  const kind = transitionOf(own.known, facts)
  const receipt: FinalityReceipt = { seq: own.receipts.length + 1, payloadDigest: record.payloadDigest, kind }
  const next: FinalityState = {
    ...own,
    status: kind === 'conflict' ? 'conflict' : own.status,
    known: kind === 'extended' ? { ...own.known, finalCount: facts.finalCount } : own.known,
    receipts: [...own.receipts, receipt],
    competing:
      kind === 'conflict' ? [...own.competing, { ...facts, payloadDigest: record.payloadDigest }] : own.competing,
    payloads: { ...own.payloads, [record.payloadDigest]: { ...facts, provenance: provenanceOf(record) } },
  }
  return freezeDeep({ state: next, outcome: { receipt, replay: false } })
}

/** Folds appends in order; each outcome is the receipt that append received. */
export function foldFinality(records: readonly FinalityAppend[]): {
  readonly state: FinalityState | null
  readonly outcomes: readonly FinalityOutcome[]
} {
  let state: FinalityState | null = null
  const outcomes: FinalityOutcome[] = []
  for (const r of records) {
    const next = appendFinality(state, r)
    state = next.state
    outcomes.push(next.outcome)
  }
  return freezeDeep({ state, outcomes })
}

/**
 * What a folded finality state contributes to an effect: a known state yields its qualified finality and, when known,
 * the final whole-effect total; a conflicted state yields no finality (restrictive) and only the largest competing
 * known count as lower-bound knowledge.
 */
export function effectKnowledge(state: FinalityState | null): {
  readonly finality: FinalityFact | null
  readonly count: Count | null
  readonly conflict: boolean
} {
  if (state === null) return freezeDeep({ finality: null, count: null, conflict: false })
  if (state.status === 'known') {
    const { basis, finalAt, finalCount } = state.known
    return freezeDeep({
      finality: { basis, finalAt },
      count: finalCount === null ? null : { kind: 'final_total' as const, value: finalCount },
      conflict: false,
    })
  }
  const counts = [state.known.finalCount, ...state.competing.map((c) => c.finalCount)].filter(
    (c): c is number => c !== null,
  )
  return freezeDeep({
    finality: null,
    count: counts.length === 0 ? null : { kind: 'so_far' as const, value: Math.max(...counts) },
    conflict: true,
  })
}
