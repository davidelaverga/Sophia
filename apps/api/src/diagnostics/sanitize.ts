// The public shape of the operator's diagnostic (S1-05A coordination, review finding CX-0001). Nothing reaches the
// public thread unless it is declared here: each column has a kind, and each kind says exactly what may pass.
//   - Ids pass only as the first 8 hex characters of a UUID; anything else is `other`.
//   - Free text never passes. A known system phrase passes as its code; anything else becomes `redacted:<hash8>`,
//     a digest the operator can match against the private logs without publishing the text.
//   - Enumerations pass only as one of their values; anything else is `invalid`.
//   - Columns a query returns but the schema does not declare are dropped.
import { createHash } from 'node:crypto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type FieldKind =
  | 'id'
  | 'digest'
  | 'text'
  | 'int'
  | 'bool'
  | 'time'
  | 'seconds'
  | 'code'
  | 'sha256'
  | 'migration'
  | { enum: readonly string[] }

export type RowSchema = Readonly<Record<string, FieldKind>>

/** A stable, non-reversible reference for a value that must not be published. */
export const digest = (v: string): string => createHash('sha256').update(v, 'utf8').digest('hex').slice(0, 8)

/** A UUID as its first 8 characters; nothing else passes as an id. */
export const shortId = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  return typeof v === 'string' && UUID.test(v) ? v.slice(0, 8) : 'other'
}

/**
 * System phrases the database and bridge write, published as themselves; any other text is redacted. Prefix
 * matches keep the phrase only, never what follows it (a provider's message after the prefix is dropped).
 */
const KNOWN_TEXT: ReadonlyArray<[prefix: string, code: string]> = [
  ["waiting for Sophia's runtime to connect", 'runtime_not_connected'],
  ["waiting for Sophia's runtime to report ready", 'runtime_not_ready'],
  ["waiting for Sophia's runtime to reconnect", 'runtime_not_seen'],
  ['hello received; waiting for the ready report', 'runtime_hello_only'],
  ['not dispatched: ', 'not_dispatched'],
  ["the goal's authority epoch moved on", 'authority_moved'],
  ['the person who admitted it can no longer start work here', 'admitter_lost_role'],
  ['no active runtime for its executor resource and runtime unit', 'no_active_runtime'],
  ['its instruction source is no longer eligible', 'instruction_ineligible'],
  ['an input it was admitted with is no longer eligible', 'input_ineligible'],
  ['the dispatch lease expired', 'dispatch_lease_expired'],
  ['Sophia could not join the room: ', 'room_join_failed'],
  ['The room service is not configured for Sophia', 'room_not_configured'],
  ['Sophia’s voice service is unavailable: ', 'voice_unavailable'],
]

export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return 'invalid'
  const known = KNOWN_TEXT.find(([prefix]) => v === prefix || (prefix.endsWith(' ') && v.startsWith(prefix)))
  return known ? known[1] : `redacted:${digest(v)}`
}

/** Event types and summary codes: dotted lower-case words only. */
const CODE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/
const MIGRATION = /^\d{4}_[a-z0-9_]{1,80}\.sql$/

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d{1,15}$/.test(v) ? Number(v) : Number.NaN
  return Number.isSafeInteger(n) ? n : null
}

const toTime = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

const pattern = (re: RegExp) => (v: unknown) =>
  v === null || v === undefined ? null : typeof v === 'string' && re.test(v) ? v : 'invalid'

const KINDS: Record<Exclude<FieldKind, { enum: readonly string[] }>, (v: unknown) => unknown> = {
  id: shortId,
  digest: (v) =>
    v === null || v === undefined ? null : `ref:${digest(typeof v === 'string' ? v : JSON.stringify(v))}`,
  text,
  int: toInt,
  bool: (v) => (typeof v === 'boolean' ? v : null),
  time: toTime,
  seconds: (v) => {
    const n =
      typeof v === 'number' ? v : typeof v === 'string' && /^-?\d{1,12}(\.\d+)?$/.test(v) ? Number(v) : Number.NaN
    return Number.isFinite(n) ? Math.round(n) : null
  },
  code: pattern(CODE),
  sha256: pattern(/^[0-9a-f]{64}$/),
  migration: pattern(MIGRATION),
}

export function field(kind: FieldKind, v: unknown): unknown {
  if (typeof kind === 'object') {
    if (v === null || v === undefined) return null
    return typeof v === 'string' && kind.enum.includes(v) ? v : 'invalid'
  }
  return KINDS[kind](v)
}

/** Only the declared columns, each through its kind. */
export function sanitizeRow(row: Readonly<Record<string, unknown>>, schema: RowSchema): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema).map(([key, kind]) => [key, field(kind, row[key])]))
}

// What the room shows about a LiveKit participant: identity class, standing, state, tracks and Sophia's
// observed state. The attribute keys and values are the bridge's own vocabulary; nothing else passes.
const SOPHIA_ATTRIBUTES: Readonly<Record<string, FieldKind>> = {
  'sophia.voice': { enum: ['connecting', 'ready', 'recovering', 'unavailable'] },
  'sophia.input': { enum: ['closed', 'admitted', 'paused', 'settling'] },
  'sophia.output': { enum: ['idle', 'responding', 'playing'] },
  'sophia.inputEpoch': 'int',
}

export function sophiaAttributes(attributes: Readonly<Record<string, string>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(SOPHIA_ATTRIBUTES)
      .filter(([key]) => key in attributes)
      .map(([key, kind]) => [key, field(kind, attributes[key])]),
  )
}

/** `sophia`, a member or guest as the first 8 characters of their UUID, or `other`. */
export const identityClass = (identity: string): string =>
  identity === 'sophia' ? 'sophia' : (shortId(identity) ?? 'other')

export const STANDINGS = ['admin', 'editor', 'viewer', 'guest', 'sophia', 'unknown'] as const

/** Standing as the API signed it into the token's metadata; anything else is `unknown`. */
export function standing(metadata: string | undefined): (typeof STANDINGS)[number] {
  let v: unknown
  try {
    v = JSON.parse(metadata ?? 'null')
  } catch {
    return 'unknown'
  }
  if (typeof v !== 'object' || v === null) return 'unknown'
  if ('sophia' in v && v.sophia === true) return 'sophia'
  if ('guest' in v && v.guest === true) return 'guest'
  return roleOf('role' in v ? v.role : undefined)
}

const roleOf = (role: unknown): (typeof STANDINGS)[number] =>
  role === 'admin' || role === 'editor' || role === 'viewer' ? role : 'unknown'
