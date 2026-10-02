// The engineering resources a project can use (LFE-06): each owner's enrolled native tool, its sessions, its observed
// capacity and the actions only its owner can answer. Pure, so the words and rules are unit-tested. The resource and
// action shapes are the Studio's proposal for SCM-01/02; the capacity observation follows the continuation's
// `sophia.capacity.observation.v1` schema (docs/execution/2026-10-01-unified/contracts/coordination).

export type Tool = 'claude-code' | 'codex'
export const TOOL: Record<Tool, string> = { 'claude-code': 'Claude Code', codex: 'Codex' }

export type ControlName = 'steer' | 'hold' | 'stop' | 'permissions'
/** As the control-support matrix says it: qualified for this route, not qualified yet, or not offered by it. */
export type Support = 'supported' | 'unqualified' | 'unsupported'

export interface Session {
  id: string
  /** What this session does in the project: "worker", "reviewer"… */
  role: string
  /** The model and effort the native tool reported; null when it didn't. */
  model: string | null
  effort: string | null
  assignment: { workId: string; title: string; state: 'recorded' | 'queued' | 'running' | 'waiting' } | null
}

export interface Resource {
  /** The enrollment: `davide-codex`, `davide-claude`, `luis-claude`. */
  id: string
  owner: { id: string; name: string }
  tool: Tool
  /** The owner's account behind it: sessions on one account share one allowance. */
  entitlementId: string
  host: { state: 'online' | 'offline' | 'unknown'; observedAt: string | null }
  sessions: Session[]
  controls: Record<ControlName, Support>
  /** What the owner keeps back from the project, in percent of a window; null when they set none. */
  reservePercent: number | null
}

export interface QuotaWindow {
  window_id: string
  unit: 'percent_used' | 'credits_remaining' | 'tokens_remaining' | 'spend_percent_used'
  value: number | null
  resets_at: string | null
  scope: 'account' | 'model' | 'spend' | 'unknown'
  applicability: 'known' | 'partial' | 'unknown'
  state: 'observed' | 'unknown' | 'refresh_pending'
}

export interface QuotaObservation {
  observation_id: string
  owner_id: string
  entitlement_id: string
  resource_ids: string[]
  provider: string
  source_channel: string
  observed_at: string
  valid_until: string | null
  coverage: 'complete_for_route' | 'partial' | 'unavailable'
  windows: QuotaWindow[]
  missing_capabilities: string[]
}

export interface RequiredAction {
  id: string
  workId: string
  resourceId: string
  sessionId: string
  ownerId: string
  /** The native request, in its own words. */
  operation: string
  deadline: string | null
  state: 'open' | 'resolved' | 'denied' | 'expired' | 'superseded' | 'unknown'
  /** A safe link into the native tool, when there is one; never made up. */
  openTarget: string | null
}

const MINUTE = 60_000

/** How long ago, in the fewest words: "just now", "4 min ago", "3 h ago", "2 d ago". */
export function ago(at: string | null, now: Date): string {
  if (!at) return 'never observed'
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / MINUTE))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`
  return `${Math.round(minutes / (24 * 60))} d ago`
}

/** How long until, in the same words: "in 40 min", "in 2 h", "in 4 d". */
function until(at: string, now: Date): string {
  const minutes = Math.round((Date.parse(at) - now.getTime()) / MINUTE)
  if (minutes < 60) return `in ${minutes} min`
  if (minutes < 48 * 60) return `in ${Math.round(minutes / 60)} h`
  return `in ${Math.round(minutes / (24 * 60))} d`
}

const WINDOW_NAME: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: '7-day',
  seven_day_opus: '7-day, one model',
  spend_limit: 'Spend limit',
}
export const windowName = (id: string) => WINDOW_NAME[id] ?? id.replaceAll('_', ' ')

export interface WindowView {
  name: string
  /** `expired`: the whole reading is past its `valid_until`, whatever this window said. */
  state: QuotaWindow['state'] | 'expired'
  /** The value in words: never a number the observation didn't give. */
  value: string
  reset: string | null
  percent: number | null
  /** Whether the collector could tell this window applies to this resource: only a known one can limit it. */
  applies: QuotaWindow['applicability']
}

/** Whether a reading is past the time its collector said it holds until. */
export const expired = (obs: QuotaObservation, now: Date) =>
  obs.valid_until !== null && Date.parse(obs.valid_until) <= now.getTime()

const APPLIES: Record<QuotaWindow['applicability'], string> = {
  known: '',
  partial: ' · applies in part',
  unknown: ' · may not apply here',
}

type ViewState = WindowView['state']
const NOT_A_VALUE: Partial<Record<ViewState, string>> = {
  expired: 'Expired',
  unknown: 'Unknown',
  refresh_pending: 'Refresh pending',
}

/** Expired over everything; then unknown; then a reset already due; else what the window said. */
function stateOf(w: QuotaWindow, due: boolean, stale: boolean): ViewState {
  if (stale) return 'expired'
  if (w.state === 'unknown' || w.value === null) return 'unknown'
  return due ? 'refresh_pending' : w.state
}

function valueOf(w: QuotaWindow, v: number): string {
  return {
    percent_used: `${v}% used`,
    spend_percent_used: `${v}% of the spend limit used`,
    credits_remaining: `${v} credits left`,
    tokens_remaining: `${v} tokens left`,
  }[w.unit]
}

/**
 * A window as it stands now: a reset already due is refresh pending, never fresh capacity; unknown stays unknown; a
 * reading past its `valid_until` is expired; a value whose applicability isn't known says so.
 */
export function windowView(w: QuotaWindow, now: Date, stale = false): WindowView {
  const due = w.resets_at !== null && Date.parse(w.resets_at) <= now.getTime()
  const applies = w.applicability
  const state = stateOf(w, due, stale)
  const reset =
    w.resets_at === null ? null : due ? `reset was due ${ago(w.resets_at, now)}` : `resets ${until(w.resets_at, now)}`
  const name = windowName(w.window_id)
  const withheld = NOT_A_VALUE[state]
  if (withheld) return { name, state, value: withheld, reset, percent: null, applies }
  const v = w.value ?? 0
  const percent = w.unit === 'percent_used' || w.unit === 'spend_percent_used' ? v : null
  return { name, state, value: `${valueOf(w, v)}${APPLIES[applies]}`, reset, percent, applies }
}

const headline = (v: WindowView) => `${v.name} window: ${v.value}${v.reset ? `, ${v.reset}` : ''}`

/**
 * What the windows known to apply say together: the most used percentage; else that a reset is pending, or that the
 * capacity is unknown, while any window is unresolved; else an observed balance, as it was reported (no percentage is
 * made of it). Windows that may not apply never shape it, not even as pending.
 */
function fromKnown(known: WindowView[]): string | null {
  const limiting = known
    .filter((v) => v.percent !== null)
    .reduce<WindowView | null>((most, v) => (most && (most.percent ?? 0) >= (v.percent ?? 0) ? most : v), null)
  if (limiting) return headline(limiting)
  // A balance can't be weighed against a window that isn't resolved: the unresolved one says so first.
  if (known.some((v) => v.state === 'refresh_pending')) return 'Refresh pending'
  if (known.some((v) => v.state === 'unknown')) return 'Capacity unknown'
  const balance = known.find((v) => v.state === 'observed')
  return balance ? headline(balance) : null
}

/**
 * The account's capacity in one line, from the windows known to apply. No observation, one that can't see the
 * account, or one past its `valid_until` is "Capacity unknown": never full, never empty, and an expired one says how
 * long ago it stopped holding. "No window observed" is kept for a reading with no windows at all.
 */
export function capacityLine(obs: QuotaObservation | undefined, now: Date): string {
  if (!obs || obs.coverage === 'unavailable') return 'Capacity unknown'
  if (expired(obs, now)) return `Capacity unknown: the last reading expired ${ago(obs.valid_until, now)}`
  if (obs.windows.length === 0) return 'No window observed'
  const views = obs.windows.map((w) => windowView(w, now))
  return fromKnown(views.filter((v) => v.applies === 'known')) ?? 'Capacity unknown: no window is known to apply here'
}

const ACTION_STATE: Record<RequiredAction['state'], string> = {
  open: 'Waiting',
  resolved: 'Answered',
  denied: 'Denied',
  expired: 'Expired',
  superseded: 'Superseded',
  unknown: 'Outcome unknown',
}
export const actionState = (a: RequiredAction) => ACTION_STATE[a.state]

/** When a request stops waiting: "expires in 40 min", or "expired 5 min ago". */
export function expiry(deadline: string, now: Date): string {
  return Date.parse(deadline) > now.getTime() ? `expires ${until(deadline, now)}` : `expired ${ago(deadline, now)}`
}

/**
 * Who answers a required action, and where: only its owner, in the native tool. Seeing it answers nothing, and no one
 * else is told how to answer it.
 */
export function actionLine(a: RequiredAction, viewerId: string, r: Resource): string {
  const tool = TOOL[r.tool]
  if (a.state !== 'open') return a.state === 'unknown' ? `Checked in ${tool} before anything else is asked.` : ''
  if (viewerId !== a.ownerId) return `Only ${r.owner.name} can answer this, in ${tool}.`
  return `Answer it in ${tool}, session ${a.sessionId}.`
}

export const SUPPORT: Record<Support, string> = {
  supported: 'supported',
  unqualified: 'not qualified yet',
  unsupported: 'not offered',
}
