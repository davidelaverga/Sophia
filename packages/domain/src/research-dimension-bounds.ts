// INC04-R07-C2-DIMENSION-BOUNDS-CORE-001 (db/migrations/0113): the pure codec and knowledge rules of a qualified
// per-reservation dimension bound, the same bytes the database computes. Eight closed append domains and three digest
// helpers, framed d<len>:<domain> k<len>:<n> then, per field, s<len>:<utf8> or n (typed null); every key required;
// validation key-set, then grammar (calendar included), then cross-field. A digest is consistency between two parties,
// never authority, qualification or outbound truth. Nothing here is exported through the package index: the database
// core is inactive and no API, SDK or emitter consumes it yet.
import { createHash } from 'node:crypto'

export const DIMENSIONS = [
  'openai.output_tokens',
  'openai.model_requests',
  'openai.input_tokens',
  'openai.input_cached_tokens',
] as const
export type Dimension = (typeof DIMENSIONS)[number]
/** The C4/C5 F7 dimension-to-native-unit map: no conversion, and never USD. */
export const UNIT_OF: Readonly<Record<Dimension, 'tokens' | 'requests'>> = {
  'openai.output_tokens': 'tokens',
  'openai.model_requests': 'requests',
  'openai.input_tokens': 'tokens',
  'openai.input_cached_tokens': 'tokens',
}
const INPUT_DIMENSIONS: readonly string[] = ['openai.input_tokens', 'openai.input_cached_tokens']

/** Field specifications in TLV order: `name:grammar`, a trailing `?` marks a typed-nullable field. */
export const APPEND_DOMAINS = {
  'sophia.c2.bound.profile.register.v1': [
    'profile_id:uuid',
    'revision:int',
    'dimension:dimension',
    'unit:unit',
    'enforcement_kind:enforcement_kind',
    'param_name:param_name?',
    'max_ceiling:int',
    'provider:ident',
    'route_id:ident',
    'endpoint:ident',
    'model:ident',
    'settings_digest:digest',
    'emitter_identity_digest:digest',
    'semantics_evidence_digest:digest',
    'isolation_evidence_digest:digest',
    'scope_kind:profile_scope_kind',
    'scope_ref:uuid',
    'authority_id:uuid',
    'approval_ref_digest:digest',
    'evidence_digest:digest',
  ],
  'sophia.c2.bound.profile.event.v1': [
    'profile_id:uuid',
    'revision:int',
    'dimension:dimension',
    'event_key:event_key',
    'event_kind:event_kind',
    'target_event_digest:digest?',
    'reason_code:reason_code',
    'authority_id:uuid?',
    'approval_ref_digest:digest?',
    'cause_ref_digest:digest?',
    'evidence_digest:digest',
  ],
  'sophia.c2.bound.policy.register.v1': [
    'policy_id:uuid',
    'revision:int',
    'scope_kind:policy_scope_kind',
    'scope_ref:uuid',
    'dimension:dimension',
    'unit:unit',
    'cap:int',
    'authority_id:uuid',
    'approval_ref_digest:digest',
    'evidence_digest:digest',
  ],
  'sophia.c2.bound.policy.event.v1': [
    'policy_id:uuid',
    'revision:int',
    'event_key:event_key',
    'event_kind:policy_event_kind',
    'authority_id:uuid',
    'approval_ref_digest:digest',
    'evidence_digest:digest',
  ],
  'sophia.c2.bound.authorize.v1': [
    'project_id:uuid',
    'reservation_id:uuid',
    'dispatch_id:uuid',
    'dimension:dimension',
    'unit:unit',
    'bound_kind:bound_kind',
    'bound:int?',
    'enforcement_kind:enforcement_kind?',
    'profile_id:uuid?',
    'profile_revision:int?',
    'policy_set_digest:digest?',
    'unsupported_reason:unsupported_reason?',
    'original_runtime_id:uuid',
    'original_generation:digest?',
    'route_id:ident',
    'model:ident',
    'settings_digest:digest',
  ],
  'sophia.c2.dispatch.apply.v1': [
    'project_id:uuid',
    'reservation_id:uuid',
    'dispatch_id:uuid',
    'attempt_id:uuid',
    'call_id:call_id',
    'runtime_id:uuid',
    'original_generation:digest?',
    'emitter_identity_digest:digest',
    'outbound_params_digest:digest',
    'authorize_set_digest:digest',
  ],
  'sophia.c2.dispatch.claim.v1': [
    'project_id:uuid',
    'reservation_id:uuid',
    'dispatch_id:uuid',
    'runtime_id:uuid',
    'original_generation:digest?',
    'apply_receipt_digest:digest',
  ],
  'sophia.c2.dispatch.outcome.v1': [
    'project_id:uuid',
    'reservation_id:uuid',
    'dispatch_id:uuid',
    'outcome_kind:outcome_kind',
    'evidence_digest:digest',
    'observed_at:timestamp',
  ],
} as const satisfies Record<string, readonly string[]>
export type AppendDomain = keyof typeof APPEND_DOMAINS
export const HELPER_DOMAINS = [
  'sophia.c2.dispatch.outbound.v1',
  'sophia.c2.bound.authorize.set.v1',
  'sophia.c2.bound.policy.set.v1',
] as const

export type Values = readonly (string | null)[]
export type RefusalCode =
  | 'payload_incomplete'
  | 'payload_invalid'
  | 'bound_dimension_unsupported'
  | 'bound_invalid'
  | 'bound_policy_unit_mismatch'
export type Validation = { ok: true; values: Values } | { ok: false; code: RefusalCode }

const ENUMS: Readonly<Record<string, readonly string[]>> = {
  dimension: DIMENSIONS,
  unit: ['tokens', 'requests', 'usd'],
  enforcement_kind: ['output_parameter', 'dispatch_count'],
  profile_scope_kind: ['account', 'project', 'grant'],
  policy_scope_kind: ['project', 'allowance', 'account'],
  event_kind: ['activate', 'hold', 'auto_hold', 'unhold', 'revoke', 'distrust'],
  policy_event_kind: ['activate', 'revoke'],
  bound_kind: ['authorized', 'unsupported'],
  unsupported_reason: ['input_estimate_only', 'no_enforcing_mechanism', 'route_not_qualified'],
  outcome_kind: ['not_sent_after_claim', 'sent', 'send_error_before_response'],
}
const PATTERNS: Readonly<Record<string, RegExp>> = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  digest: /^[0-9a-f]{64}$/,
  ident: /^[a-z0-9][a-z0-9._:/-]{0,127}$/,
  param_name: /^[a-z][a-z0-9_]{0,63}$/,
  event_key: /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,119}$/,
  reason_code: /^[a-z][a-z0-9_]{0,63}$/,
  call_id: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/,
}

/** R2 calendar grammar: YYYY-MM-DDTHH:MM:SS.ffffffZ that is a real UTC instant and re-formats to the same string. */
export function isInstant(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1 || mo < 1 || mo > 12) return false
  const t = new Date(0)
  t.setUTCFullYear(y, mo - 1, d) // never the two-digit-year mapping of Date.UTC
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

export function grammarOk(grammar: string, v: string): boolean {
  if (grammar === 'int') return /^(0|[1-9][0-9]{0,9})$/.test(v) && Number(v) <= 2147483647
  if (grammar === 'timestamp') return isInstant(v)
  const e = ENUMS[grammar]
  if (e) return e.includes(v)
  const p = PATTERNS[grammar]
  return p ? p.test(v) : false
}

const isDimension = (v: string | null | undefined): v is Dimension =>
  typeof v === 'string' && (DIMENSIONS as readonly string[]).includes(v)
/** The native unit of a dimension, or undefined for anything that is not one. */
const unitOf = (v: string | null | undefined) => (isDimension(v) ? UNIT_OF[v] : undefined)
const isInput = (v: string | null | undefined) => INPUT_DIMENSIONS.includes(v ?? '')
const present = (...xs: (string | null | undefined)[]) => xs.every((x) => x !== null && x !== undefined)
const absent = (...xs: (string | null | undefined)[]) => xs.every((x) => x === null)

function profileRegisterRule(v: Values): RefusalCode | null {
  const [, revision, dim, unit, kind, param, ceiling] = v
  if (isInput(dim)) return 'bound_dimension_unsupported'
  if (unit !== unitOf(dim) || revision === '0') return 'payload_invalid'
  if (ceiling === '0') return 'bound_invalid'
  const ok =
    kind === 'output_parameter'
      ? dim === 'openai.output_tokens' && present(param)
      : dim === 'openai.model_requests' && absent(param ?? null) && ceiling === '1'
  return ok ? null : 'payload_invalid'
}
function eventShapeOk(kind: string | null | undefined, v: Values): boolean {
  const [, , , , , target, , authority, approval, cause] = v
  if (kind === 'unhold') return present(target, authority, approval) && absent(cause ?? null)
  if (kind === 'auto_hold') return absent(target ?? null, authority ?? null, approval ?? null) && present(cause)
  return absent(target ?? null, cause ?? null) && present(authority, approval)
}
function profileEventRule(v: Values): RefusalCode | null {
  if (isInput(v[2])) return 'bound_dimension_unsupported'
  return v[1] !== '0' && eventShapeOk(v[4], v) ? null : 'payload_invalid'
}
function policyRegisterRule(v: Values): RefusalCode | null {
  const [, revision, , , dim, unit, cap] = v
  if (isInput(dim)) return 'bound_dimension_unsupported'
  if (unit !== unitOf(dim)) return 'bound_policy_unit_mismatch'
  if (revision === '0') return 'payload_invalid'
  return cap === '0' ? 'bound_invalid' : null
}
function authorizedShapeOk(v: Values): boolean {
  const [, , , dim, , , bound, enforcement, profile, revision, , reason] = v
  return (
    present(bound, enforcement, profile, revision) &&
    absent(reason ?? null) &&
    bound !== '0' &&
    revision !== '0' &&
    !isInput(dim) &&
    (enforcement === 'output_parameter') === (dim === 'openai.output_tokens') &&
    (enforcement !== 'dispatch_count' || bound === '1')
  )
}
function authorizeRule(v: Values): RefusalCode | null {
  const [, , , dim, unit, kind, bound, enforcement, profile, revision, policySet, reason] = v
  if (unit !== unitOf(dim)) return 'payload_invalid'
  const ok =
    kind === 'authorized'
      ? authorizedShapeOk(v)
      : absent(bound ?? null, enforcement ?? null, profile ?? null, revision ?? null, policySet ?? null) &&
        present(reason)
  return ok ? null : 'payload_invalid'
}
const noRule = (): RefusalCode | null => null
const CROSS_FIELD: Readonly<Record<AppendDomain, (v: Values) => RefusalCode | null>> = {
  'sophia.c2.bound.profile.register.v1': profileRegisterRule,
  'sophia.c2.bound.profile.event.v1': profileEventRule,
  'sophia.c2.bound.policy.register.v1': policyRegisterRule,
  'sophia.c2.bound.policy.event.v1': (v) => (v[1] === '0' ? 'payload_invalid' : null),
  'sophia.c2.bound.authorize.v1': authorizeRule,
  'sophia.c2.dispatch.apply.v1': noRule,
  'sophia.c2.dispatch.claim.v1': noRule,
  'sophia.c2.dispatch.outcome.v1': noRule,
}
/** Cross-field rules on already-valid values: the code, or null. */
export const crossField = (domain: AppendDomain, v: Values): RefusalCode | null => CROSS_FIELD[domain](v)

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
/** A field spec `name:grammar` (a trailing ? marks a typed-nullable field). */
function specOf(spec: string) {
  const i = spec.indexOf(':')
  const grammar = spec.slice(i + 1)
  return { name: spec.slice(0, i), grammar: grammar.replace(/\?$/, ''), nullable: grammar.endsWith('?') }
}
/** One field's value: its string, a typed null, or false when its grammar refuses it. */
function fieldValue(v: unknown, f: ReturnType<typeof specOf>): string | null | false {
  if (v === null) return f.nullable ? null : false
  return typeof v === 'string' && grammarOk(f.grammar, v) ? v : false
}
/** Validate a closed payload in the R2 order: key-set, then every grammar, then cross-field. */
export function validate(domain: AppendDomain, payload: unknown): Validation {
  if (!isRecord(payload)) return { ok: false, code: 'payload_invalid' }
  const specs = APPEND_DOMAINS[domain].map(specOf)
  const names = specs.map((s) => s.name)
  if (names.some((n) => !Object.hasOwn(payload, n))) return { ok: false, code: 'payload_incomplete' }
  if (Object.keys(payload).some((k) => !names.includes(k))) return { ok: false, code: 'payload_invalid' }
  const values: (string | null)[] = []
  for (const f of specs) {
    const v = fieldValue(payload[f.name], f)
    if (v === false) return { ok: false, code: 'payload_invalid' }
    values.push(v)
  }
  const code = crossField(domain, values)
  return code ? { ok: false, code } : { ok: true, values }
}

/** The canonical TLV bytes (as a string) of a domain's values. */
export function frame(domain: string, values: Values): string {
  const n = String(values.length)
  let out = `d${String(Buffer.byteLength(domain))}:${domain}k${String(Buffer.byteLength(n))}:${n}`
  for (const v of values) out += v === null ? 'n' : `s${String(Buffer.byteLength(v))}:${v}`
  return out
}
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
export const digestOf = (domain: string, values: Values): string => sha256(frame(domain, values))
/** The closed JSON object of a domain's values (typed null as JSON null). */
export function objectOf(domain: AppendDomain, values: Values): Record<string, string | null> {
  return Object.fromEntries(APPEND_DOMAINS[domain].map((s, i) => [specOf(s).name, values[i] ?? null]))
}
/** Hex digests ascending by code unit (the database's "C" collation). */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sortHex = (xs: readonly string[]) => xs.toSorted(byCodeUnit)

export interface OutboundPreimage {
  provider: string
  endpoint: string
  model: string
  settingsDigest: string
  emitterIdentityDigest: string
  /** (dimension, param_name, value) of every output_parameter authorize row; dispatch_count contributes none. */
  items: readonly (readonly [string, string, string])[]
}
export function outboundDigest(p: OutboundPreimage): string {
  const items = p.items.toSorted((a, b) => byCodeUnit(a[0], b[0]))
  return digestOf('sophia.c2.dispatch.outbound.v1', [
    p.provider,
    p.endpoint,
    p.model,
    p.settingsDigest,
    p.emitterIdentityDigest,
    String(items.length),
    ...items.flat(),
  ])
}
/** Every authorize digest of a dispatch (n = 4 under the F7 map), sorted: order never changes the identity. */
export const authorizeSetDigest = (dispatchId: string, digests: readonly string[]): string =>
  digestOf('sophia.c2.bound.authorize.set.v1', [dispatchId, String(digests.length), ...sortHex(digests)])
/** One active policy: the TLV of (its registration digest, its canonical activate digest), hashed. */
export const policyItem = (registerDigest: string, activateDigest: string): string =>
  sha256(`s64:${registerDigest}s64:${activateDigest}`)
/** The active in-scope policy items of one dimension; none is typed null (no cap: b = profile.max_ceiling). */
export const policySetDigest = (dimension: string, items: readonly string[]): string | null =>
  items.length === 0
    ? null
    : digestOf('sophia.c2.bound.policy.set.v1', [dimension, String(items.length), ...sortHex(items)])

// --- lifecycle (derived, never stored) -----------------------------------------------------------------------------

export type ProfileState = 'distrust' | 'revoke' | 'auto_hold' | 'conflicted' | 'held' | 'active' | 'inactive'
export interface LifecycleEvent {
  kind: 'activate' | 'hold' | 'auto_hold' | 'unhold' | 'revoke' | 'distrust'
  digest: string
  targetEventDigest?: string | null
}
/** distrust > revoke > auto_hold > conflicted > held (an open manual hold) > active > inactive. */
export function profileState(events: readonly LifecycleEvent[], conflicted: boolean): ProfileState {
  const has = (k: LifecycleEvent['kind']) => events.some((e) => e.kind === k)
  if (has('distrust')) return 'distrust'
  if (has('revoke')) return 'revoke'
  if (has('auto_hold')) return 'auto_hold'
  if (conflicted) return 'conflicted'
  const cleared = new Set(events.filter((e) => e.kind === 'unhold').map((e) => e.targetEventDigest))
  if (events.some((e) => e.kind === 'hold' && !cleared.has(e.digest))) return 'held'
  return has('activate') ? 'active' : 'inactive'
}
/** A policy: revoke > conflicted > active > inactive (registration alone is never active). */
export function policyState(
  events: readonly { kind: 'activate' | 'revoke' }[],
  conflicted: boolean,
): 'revoke' | 'conflicted' | 'active' | 'inactive' {
  if (events.some((e) => e.kind === 'revoke')) return 'revoke'
  if (conflicted) return 'conflicted'
  return events.some((e) => e.kind === 'activate') ? 'active' : 'inactive'
}

// --- Rule K (knowledge precedence per original effect and dimension) -------------------------------------------------

export interface KnowledgeInput {
  /** A claimed final total and whether its effect finality is qualified (FG04/FG05 validity is the caller's input). */
  finalTotal?: { value: number; qualifiedFinality: boolean }
  /** Two different known finals for the same effect (FG04): restrictive, never resolved by a bound. */
  conflictingFinals?: boolean
  /** An exact count observed so far: lower-bound knowledge only (N10: it never caps). */
  soFar?: number
  /** Every other known count (settled or observed) of the dimension. */
  otherKnown?: readonly number[]
  /** A validated reflected quantity q (lower-bound knowledge). */
  q?: number
  /** The bound's read status and value, when one exists. */
  bound?: { b: number; status: 'qualified' | 'authorized_not_applied' | 'applied_unqualified' | 'contradicted' }
}
export interface Knowledge {
  cLo: number
  /** null is UNK. */
  cHi: number | null
  contradicted: boolean
  countFinalityInconsistent: boolean
  restrictive: boolean
}
/**
 * K1 validate (a final without qualified finality is held as so_far; conflicting finals are restrictive; R1 F07: a
 * final below any known lower bound of the same effect, so_far, the reflected q or another known count, is jointly
 * inconsistent: restrictive UNK, never an exact final, a negative X or a capacity credit); K2 a valid final_total gives
 * c = final whatever any bound says; K3 otherwise a qualified, uncontradicted bound >= c_lo is c_hi, else UNK; K4 any
 * known count above b contradicts the bound (sticky in the ledger), for K3 only. Every known count is a lower bound.
 */
export function knowledge(k: KnowledgeInput): Knowledge {
  const { inconsistent, claimed, lower, counts } = knownOf(k)
  // F07: a caller's finality flag never erases a known lower bound
  const belowKnown = claimed !== undefined && lower.some((x) => x > claimed)
  const contradicted = isContradicted(k.bound, counts)
  if (k.conflictingFinals || belowKnown) return restrictiveUnknown(lower, contradicted, inconsistent || belowKnown)
  if (claimed !== undefined)
    return { cLo: claimed, cHi: claimed, contradicted, countFinalityInconsistent: false, restrictive: false }
  const cLo = Math.max(0, ...lower)
  return {
    cLo,
    cHi: ceilingOf(k.bound, contradicted, cLo),
    contradicted,
    countFinalityInconsistent: inconsistent,
    restrictive: false,
  }
}
/** K1 inputs: a final without finality held as so_far; the claimed valid final; every known lower bound and count. */
function knownOf(k: KnowledgeInput) {
  const inconsistent = k.finalTotal !== undefined && !k.finalTotal.qualifiedFinality
  const held = inconsistent ? k.finalTotal?.value : undefined
  const claimed = k.finalTotal?.qualifiedFinality && !k.conflictingFinals ? k.finalTotal.value : undefined
  const other = k.otherKnown ?? []
  return {
    inconsistent,
    claimed,
    lower: numbers([k.soFar, k.q, held, ...other]),
    counts: numbers([claimed, k.soFar, held, ...other]),
  }
}
/** K1 restrictive: the known lower bounds only (c_lo >= every known count and q, so X is never negative), c_hi UNK. */
const restrictiveUnknown = (lower: readonly number[], contradicted: boolean, inconsistent: boolean): Knowledge => ({
  cLo: Math.max(0, ...lower),
  cHi: null,
  contradicted,
  countFinalityInconsistent: inconsistent,
  restrictive: true,
})
const numbers = (xs: readonly (number | undefined)[]) => xs.filter((x): x is number => x !== undefined)
/** K4: a bound read as contradicted, or any known count above it. */
const isContradicted = (bound: KnowledgeInput['bound'], counts: readonly number[]) =>
  bound !== undefined && (bound.status === 'contradicted' || counts.some((c) => c > bound.b))
/** K3: only a qualified, uncontradicted bound at least c_lo is a ceiling; so_far never is (N10). */
const ceilingOf = (bound: KnowledgeInput['bound'], contradicted: boolean, cLo: number) =>
  bound?.status === 'qualified' && !contradicted && bound.b >= cLo ? bound.b : null
/** X = c - q (q reflected) and effective = V - X, as intervals; null is UNK. */
export function effective(v: number, q: number, k: Knowledge) {
  const xLo = k.cLo - q
  const xHi = k.cHi === null ? null : k.cHi - q
  return { x: [xLo, xHi] as const, effective: [xHi === null ? null : v - xHi, v - xLo] as const }
}
