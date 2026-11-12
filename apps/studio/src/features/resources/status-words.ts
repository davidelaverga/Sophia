// What a resource's sheet says of its host and its controls, in words, and nothing more than is observed (INC01-DES-001).
// A host seen online is an observation of the host, never proof that its tool is signed in or ready: the resource
// reports no sign-in or readiness yet, so the sheet says that plainly. A control is said by its route's support (the
// control-support matrix: qualified, not qualified yet, not offered), and one sent is a request until its runtime
// confirms it (receipts.ts says each step). Only the owner sends them. Pure, so the words are unit-tested.
import {
  ago,
  expired,
  resetAt,
  TOOL,
  windowView,
  type ControlName,
  type OperationReadiness,
  type QuotaObservation,
  type QuotaWindow,
  type Readiness,
  type Resource,
  type Support,
  type WindowView,
} from './resource.ts'
import { roughly } from '../../app/time-words.ts'

const HOST_STATE: Record<Resource['host']['state'], string> = {
  online: 'Host online',
  offline: 'Host offline',
  unknown: 'Host state unknown',
}

/** The host's state as observed: "Host online", "Host offline", "Host state unknown". */
export const hostState = (host: Resource['host']) => HOST_STATE[host.state]

/** The same on a tile, short enough to leave its tool's name whole: "Host unknown" there. */
export const hostShort = (host: Resource['host']) =>
  host.state === 'unknown' ? 'Host unknown' : HOST_STATE[host.state]

/**
 * How long ago its host was observed, the same for the sheet's heading and its details (r3 repair 7, UI58E-F10): null
 * when the host has no observation time (never observed); nothing (`''`) when it has one that isn't an instant, an age
 * unknown, its state said alone; else the words, "2 min ago". By absence, never by truthiness.
 */
export const hostAge = (at: string | null, now: Date): string | null => (at === null ? null : ago(at, now))

/** How long an offline host has been gone, in a word for its tile ("1 day"); null when there is none to say. */
export function offlineFor(host: Resource['host'], now: Date): string | null {
  if (host.state !== 'offline' || host.observedAt === null) return null
  const at = Date.parse(host.observedAt)
  return Number.isFinite(at) ? roughly(now.getTime() - at) : null
}

/** Said under the host while the resource reports no sign-in or readiness: an online host is not a ready tool. */
export const READINESS_UNREPORTED = 'Sign-in and readiness not reported'

const HOST_VALUE: Record<Resource['host']['state'], string> = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'State unknown',
}

/** One fact under Readiness details: what it is about, and what is known of it. */
export interface ReadinessRow {
  label: string
  value: string
  /** Whether anything is observed for it: what isn't stays said as not reported, never as ready or not ready. */
  observed: boolean
}

const SIGN_IN: Record<Readiness['signIn'], string> = {
  signed_in: 'Signed in',
  signed_out: 'Signed out',
  expired: 'Sign-in expired',
  unknown: 'Not reported',
}

const OPERATION: Record<OperationReadiness['state'], string> = {
  qualified: 'Verified for this connection',
  unqualified: 'Not verified for this connection yet',
  unsupported: 'Not supported by this connection',
  unknown: 'Not reported',
}

/**
 * Whether a readiness projection holds now, and if not, why. Current needs an observation time that is an instant, not
 * after now, and a `validUntil` that is absent (no stated limit) or an instant after the observation and after now.
 * Past its limit, it is only what was last observed; otherwise its times can't be trusted at all. No age limit or clock
 * tolerance is assumed.
 */
type Freshness = 'current' | 'expired' | 'invalid' | 'future' | 'limit_invalid' | 'reversed'

function freshness(r: Readiness, now: Date): Freshness {
  const observed = Date.parse(r.observedAt)
  if (!Number.isFinite(observed)) return 'invalid'
  if (observed > now.getTime()) return 'future'
  if (r.validUntil === null) return 'current'
  const until = Date.parse(r.validUntil)
  if (!Number.isFinite(until)) return 'limit_invalid'
  if (until <= observed) return 'reversed'
  return until > now.getTime() ? 'current' : 'expired'
}

const NOT_CURRENT: Record<Exclude<Freshness, 'current' | 'expired'>, string> = {
  invalid: 'Readiness not current: its observation time is not valid',
  future: 'Readiness not current: observed after now',
  limit_invalid: 'Readiness not current: its time limit is not valid',
  reversed: 'Readiness not current: its time limit is before its observation',
}

/** The Observed row: when, where from, and why it isn't current; never a time made up from one that isn't valid. */
function observedSaid(r: Readiness, f: Freshness, now: Date): string {
  if (f === 'invalid') return `Observation time not valid · ${r.source}`
  if (f === 'future') return `Observed in the future · ${r.source}`
  const why = {
    current: '',
    expired: ' · past its time',
    limit_invalid: ' · its time limit not valid',
    reversed: ' · its time limit before it',
  }[f]
  return `${ago(r.observedAt, now)} · ${r.source}${why}`
}

/**
 * Readiness, fact by fact, as the resource reports it (C01-R05): its host, observed when; its tool's sign-in; each
 * operation as this connection's profile qualifies it; and when and from where that was observed. Each stays apart;
 * what isn't reported is said so, and a projection past its time is said as last observed.
 */
export function readinessRows(resource: Resource, now: Date): ReadinessRow[] {
  const { host, tool, readiness } = resource
  const age = hostAge(host.observedAt, now)
  const hostRow = {
    label: 'Host',
    // Never observed only without a time; a time that isn't an instant says the state alone (r3 repairs 6 and 7).
    value: age === null ? 'Never observed' : `${HOST_VALUE[host.state]}${age ? ` · observed ${age}` : ''}`,
    observed: host.observedAt !== null,
  }
  if (!readiness) {
    return [
      hostRow,
      { label: `${TOOL[tool]} sign-in`, value: 'Not reported', observed: false },
      { label: 'Operations for this connection', value: 'Not reported', observed: false },
    ]
  }
  const f = freshness(readiness, now)
  const live = f === 'current'
  const operations = readiness.operations.map((o) => ({
    label: o.name,
    value: OPERATION[o.state],
    observed: live && o.state !== 'unknown',
  }))
  return [
    hostRow,
    {
      label: `${TOOL[tool]} sign-in`,
      value: SIGN_IN[readiness.signIn],
      observed: live && readiness.signIn !== 'unknown',
    },
    ...(operations.length > 0
      ? operations
      : [{ label: 'Operations for this connection', value: 'Not reported', observed: false }]),
    {
      label: 'Observed',
      value: observedSaid(readiness, f, now),
      observed: live,
    },
  ]
}

/** What a resource can do now, or what it waits on, in one line, and its tone; a prerequisite said, never pressed. */
export interface ReadinessSummary {
  tone: 'ready' | 'wait' | 'unknown'
  line: string
  /** What else to know: an operation not verified yet, when a window resets; null when nothing. */
  more: string | null
}

const listed = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}` : (names[0] ?? '')

/**
 * The readiness summary, from the facts given and nothing more (C01-R05): a host offline or unknown first; then a
 * readiness not reported or past its time; then the tool's sign-in; then any capacity window used up; and only with every
 * fact current, "Ready for" the operations this connection's profile qualifies. A host online alone is never ready.
 */
export function readinessSummary(
  resource: Resource,
  observation: QuotaObservation | undefined,
  now: Date,
): ReadinessSummary {
  const { readiness } = resource
  const before = hostWait(resource) ?? (readiness ? projectionWait(resource, readiness, now) : null)
  if (before) return before
  if (!readiness) return { tone: 'unknown', line: READINESS_UNREPORTED, more: null }
  const [out] = usedUp(observation, now)
  if (out) return { tone: 'wait', line: `Waiting for capacity: ${out.name} window`, more: out.reset }
  return operationsSummary(readiness)
}

/** A count says what is left, not how much of a window is used. */
const COUNT: ReadonlySet<QuotaWindow['unit']> = new Set(['credits_remaining', 'tokens_remaining'])

/** Used up, by its unit and number: a percentage at or past 100, a count at or below 0. */
const spent = ({ unit, value }: QuotaWindow) => value !== null && (COUNT.has(unit) ? value <= 0 : value >= 100)

/** How long a used-up window holds the connection: no reset known (none, or not an instant) longest, else the later. */
const holds = (w: QuotaWindow): number => resetAt(w) ?? Infinity

/**
 * The windows that hold a connection now (r3 repair 3, UI1164-F08): every window of a current reading weighed, in no
 * favoured order, so a percentage with room or a count left never hides one used up. Only a window known to apply and
 * observed now counts, from its unit and value, never its words: no reading, one that can't see the account or past its
 * time, a window unknown, due for its reset, or that may apply only in part is never used up, nor made capacity. The
 * one that holds it longest first.
 */
function usedUp(obs: QuotaObservation | undefined, now: Date): WindowView[] {
  if (!obs || obs.coverage === 'unavailable' || expired(obs, now)) return []
  return obs.windows
    .filter((w) => w.applicability === 'known' && windowView(w, now).state === 'observed' && spent(w))
    .toSorted((a, b) => holds(b) - holds(a))
    .map((w) => windowView(w, now))
}

/**
 * Its host first, never repeating the host's own line: offline, it waits for its host; unknown, its readiness can't be
 * known, said as not reported.
 */
function hostWait({ host }: Resource): ReadinessSummary | null {
  if (host.state === 'offline') return { tone: 'wait', line: 'Waits for its host to reconnect', more: null }
  return host.state === 'unknown' ? { tone: 'unknown', line: READINESS_UNREPORTED, more: null } : null
}

/** Then its projection: past its time, only last observed; then its tool's sign-in. */
function projectionWait({ tool }: Resource, readiness: Readiness, now: Date): ReadinessSummary | null {
  const f = freshness(readiness, now)
  if (f === 'expired') {
    return { tone: 'unknown', line: `Readiness last observed ${ago(readiness.observedAt, now)}`, more: null }
  }
  if (f !== 'current') return { tone: 'unknown', line: NOT_CURRENT[f], more: null }
  if (readiness.signIn === 'signed_out' || readiness.signIn === 'expired') {
    const line = readiness.signIn === 'expired' ? `${TOOL[tool]} sign-in expired` : `${TOOL[tool]} sign-in needed`
    return { tone: 'wait', line, more: 'Its owner signs in on its host.' }
  }
  return readiness.signIn === 'unknown'
    ? { tone: 'unknown', line: `${TOOL[tool]} sign-in not reported`, more: null }
    : null
}

/** Last, with every fact current: ready for what its profile verifies, the rest said not verified yet. */
function operationsSummary(readiness: Readiness): ReadinessSummary {
  const ready = readiness.operations.filter((o) => o.state === 'qualified').map((o) => o.name)
  const groups = OTHER_STATES.map((state) => [state, readiness.operations.filter((o) => o.state === state)] as const)
    .filter(([, ops]) => ops.length > 0)
    .map(([state, ops]) => ({ state, said: `${listed(ops.map((o) => o.name))}: ${OTHER[state].phrase}` }))
  if (ready.length > 0) {
    return { tone: 'ready', line: `Ready for ${listed(ready).toLowerCase()}`, more: trailer(groups) }
  }
  // None verified: the line names the group that holds them, first not verified yet, then not reported; the rest follow.
  const lead = OTHER_STATES.find((state) => groups.some((g) => g.state === state)) ?? 'unknown'
  return { tone: 'unknown', line: OTHER[lead].line, more: trailer(groups.filter((g) => g.state !== lead)) }
}

/** Each state an operation can be in short of verified, in the order the summary leads with them. */
const OTHER_STATES = ['unqualified', 'unknown', 'unsupported'] as const
const OTHER: Record<(typeof OTHER_STATES)[number], { phrase: string; line: string }> = {
  unqualified: {
    phrase: 'not verified for this connection yet',
    line: 'No operation verified for this connection yet',
  },
  unknown: { phrase: 'not reported', line: 'Operations not reported' },
  unsupported: { phrase: 'not supported by this connection', line: 'No operation supported by this connection' },
}
const trailer = (groups: readonly { said: string }[]) =>
  groups.length > 0 ? groups.map((g) => g.said).join('; ') : null

/** Each control as the sheet names it. */
export const CONTROL_NAME: Record<ControlName, string> = {
  stop: 'Stop',
  hold: 'Hold',
  steer: 'Guidance',
  permissions: 'Permissions',
}

/** Stop first: it is the control that must always be there. */
const ORDER: ControlName[] = ['stop', 'hold', 'steer', 'permissions']

/** Each support state as the matrix says it, in the order the sheet lists them. */
export const SUPPORT_SAID: Record<Support, string> = {
  supported: 'Verified for this connection',
  unqualified: 'Not verified for this connection yet',
  unsupported: 'Not supported by this connection',
}
const SUPPORT_ORDER: Support[] = ['supported', 'unqualified', 'unsupported']

export interface ControlGroup {
  support: Support
  label: string
  names: ControlName[]
}

/** The route's controls grouped by their support, in order; a state no control has isn't listed. */
export function controlGroups(controls: Resource['controls']): ControlGroup[] {
  return SUPPORT_ORDER.map((support) => ({
    support,
    label: SUPPORT_SAID[support],
    names: ORDER.filter((name) => controls[name] === support),
  })).filter((g) => g.names.length > 0)
}

/** The controls a session's Act can send, where its route qualifies them. Answering requests is never one of them. */
const SENDABLE: ControlName[] = ['stop', 'hold', 'steer']

interface NoteInput {
  resource: Resource
  /** Whether the viewer owns it: only its owner sends. */
  mine: boolean
  /** Whether the view gives its owner a way to send (the panel's acts); absent, nothing is sent from here. */
  offered: boolean
}

/** Who may send, from where: only the owner, from a session's Act; never a teammate. */
function whoSends({ resource, mine, offered }: NoteInput, any: boolean): string | null {
  if (!mine) return any ? `Only ${resource.owner.name} can send them.` : null
  if (!any) return 'None can be sent from here yet.'
  return offered ? 'Sent from a session’s Act.' : 'None can be sent from here now.'
}

/**
 * The line under the controls: that one sent is a request until its runtime confirms it, who may send them and from
 * where, and, when answering its tool's requests is qualified, that they are still answered in the tool. Empty when
 * nothing applies (a teammate's view of a route that qualifies nothing).
 */
export function controlsNote(input: NoteInput): string {
  const { controls, tool } = input.resource
  const any = SENDABLE.some((name) => controls[name] === 'supported')
  return [
    any ? 'Each is a request until its runtime confirms it.' : null,
    whoSends(input, any),
    controls.permissions === 'supported' ? `Permission requests are answered in ${TOOL[tool]}.` : null,
  ]
    .filter((s) => s !== null)
    .join(' ')
}
