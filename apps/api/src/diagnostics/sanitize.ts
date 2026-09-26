// The public shape of the operator's diagnostic (S1-05A coordination, review finding CX-0001). Nothing reaches the
// public thread unless it is declared here: each column has a kind, and each kind says exactly what may pass.
//   - Ids pass only as the first 8 hex characters of a UUID; anything else is `other`.
//   - Free text never passes. A known system phrase passes as its code; anything else becomes `redacted:<hash8>`,
//     a digest the operator can match against the private logs without publishing the text.
//   - Enumerations pass only as one of their values; anything else is `invalid`.
//   - System codes (event types, summaries, outbox destinations) pass only from their field's own vocabulary below;
//     anything else is `redacted:<hash8>`, however code-like it looks (review finding CX-0007).
//   - Lists pass element by element, each through its kind.
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
  | 'version'
  | 'sha256'
  | 'migration'
  | { enum: readonly string[] }
  | { codes: readonly string[] }
  | { each: FieldKind }

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

const KINDS: Record<Extract<FieldKind, string>, (v: unknown) => unknown> = {
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
  version: pattern(/^\d{4}$/),
  sha256: pattern(/^[0-9a-f]{64}$/),
  migration: pattern(MIGRATION),
}

/** Receipts per runtime command are a handful; a longer list is cut here. */
const MAX_LIST = 20

export function field(kind: FieldKind, v: unknown): unknown {
  if (typeof kind === 'string') return KINDS[kind](v)
  if (v === null || v === undefined) return null
  if ('each' in kind)
    return Array.isArray(v) ? v.slice(0, MAX_LIST).map((x: unknown) => field(kind.each, x)) : 'invalid'
  if (typeof v !== 'string') return 'invalid'
  if ('codes' in kind) return kind.codes.includes(v) ? v : `redacted:${digest(v)}`
  return kind.enum.includes(v) ? v : 'invalid'
}

/** A Postgres error class (SQLSTATE), e.g. `pg_42p01` when a migration is not applied. */
export const sqlState = (code: unknown): string =>
  typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? `pg_${code.toLowerCase()}` : 'failed'

/** Only the declared columns, each through its kind. */
export function sanitizeRow(row: Readonly<Record<string, unknown>>, schema: RowSchema): Record<string, unknown> {
  return Object.fromEntries(Object.entries(schema).map(([key, kind]) => [key, field(kind, row[key])]))
}

// What the diagnostic's code columns may say, field by field: the values the migrations write. A value missing
// here is published as a digest, so an incomplete list costs readability, never a leak.
const suffixed = (prefix: string, suffixes: readonly string[]) => suffixes.map((s) => prefix + s)

export const RECEIPT_STAGES = [
  'delivered',
  'incorporation_observed',
  'checked',
  'rejected',
  'failed',
  'outcome_unknown',
]

export const OUTBOX_DESTINATIONS = ['native.create', 'native.resume', 'native.stop', 'control.settle']

export const EVENT_TYPES = [
  ...suffixed('command.', ['admitted', 'incorporated', 'outcome_unknown', 'denied']),
  ...suffixed('room.', ['session_scheduled', 'session_canceled', 'lobby_changed', 'input_floor_changed']),
  ...suffixed('room.', ['invitation_created', 'invitation_reissued', 'invitation_revoked']),
  ...suffixed('room.', ['exchange_opened', 'exchange_changed', 'sophia_presence']),
  'project.member_joined',
  'contribution.recorded',
  ...suffixed('native_task.', ['admitted', 'waiting', 'running', 'result_ready', 'failed', 'denied']),
  ...suffixed('runtime.', ['hello', 'ready', 'not_ready']),
  ...suffixed('goal.', ['held', 'stopped']),
]

const COMMAND_KINDS = ['steer', 'request_review', 'hold', 'stop', 'resume', 'native_task', 'create', 'input', 'inspect']
const EXCHANGE_CHANGES = ['opened', 'end', 'stop_speaking', 'look', 'stop_looking', 'resume', 'guest', 'holder_left']
const LOBBY_CHANGES = ['knock', 'admit', 'deny', 'block', 'unblock']
const TASK_SUMMARIES = ['draft_brief', 'waiting', 'running', 'result_ready', 'denied', 'rejected', 'failed']
const TASK_ENDINGS = ['outcome_unknown', 'error', 'max-tokens', 'blocked']
export const VOICE_STATES = ['connecting', 'ready', 'recovering', 'unavailable']

export const SUMMARY_CODES = [
  ...suffixed('command.', COMMAND_KINDS),
  ...suffixed('room.exchange_', EXCHANGE_CHANGES),
  ...suffixed('room.lobby_', LOBBY_CHANGES),
  ...suffixed('room.lobby_removal_', ['pending', 'removed', 'absent', 'cancelled']),
  ...suffixed('room.sophia_', VOICE_STATES),
  ...suffixed('room.', ['session', 'session_canceled', 'invitation', 'invitation_revoked']),
  ...suffixed('room.', ['input_floor', 'input_floor_released']),
  'project.member',
  ...suffixed('contribution.', ['discuss', 'ask_sophia', 'propose_work']),
  ...suffixed('native_task.', [...TASK_SUMMARIES, ...TASK_ENDINGS]),
  ...suffixed('runtime.', ['hello', 'ready', 'not_ready', 'unrecovered']),
  ...suffixed('goal.', ['held', 'stopped']),
]

// What the room shows about LiveKit: counts, never a person (review finding CX-0007). Sophia is the one participant
// described, because her state is the bridge's own; her attribute keys and values are its vocabulary and nothing else
// passes.
const SOPHIA_ATTRIBUTES: Readonly<Record<string, FieldKind>> = {
  'sophia.voice': { enum: VOICE_STATES },
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

// LiveKit's protocol enums, by their numbers.
const PARTICIPANT_STATE = ['joining', 'joined', 'active', 'disconnected']
const TRACK_SOURCE = ['unknown', 'camera', 'microphone', 'screen_share', 'screen_share_audio']
const named = (names: readonly string[], n: number) => names[n] ?? 'invalid'

/** The fields of LiveKit's participant the summary reads. */
export interface RoomParticipant {
  identity: string
  metadata?: string
  state: number
  tracks: ReadonlyArray<{ source: number; muted: boolean }>
  attributes: Readonly<Record<string, string>>
}

const tally = (keys: readonly string[]) => {
  const counts: Record<string, number> = {}
  for (const k of keys) counts[k] = (counts[k] ?? 0) + 1
  return counts
}

/** Sophia joins as `sophia` with the API's signed `{"sophia":true}`; a name alone is not enough. */
const isSophia = (p: RoomParticipant) => p.identity === 'sophia' && standing(p.metadata) === 'sophia'

/** Who is in a room, as counts by standing and by unmuted track source, plus Sophia's own state. */
export function roomSummary(participants: readonly RoomParticipant[]): Record<string, unknown> {
  const people = participants.filter((p) => !isSophia(p))
  const sophia = participants.find(isSophia)
  return {
    people: people.length,
    standing: tally(people.map((p) => standing(p.metadata))),
    publishing: tally(
      people.flatMap((p) => p.tracks.filter((t) => !t.muted).map((t) => named(TRACK_SOURCE, t.source))),
    ),
    sophia: sophia
      ? { state: named(PARTICIPANT_STATE, sophia.state), ...sophiaAttributes(sophia.attributes) }
      : 'absent',
  }
}

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
