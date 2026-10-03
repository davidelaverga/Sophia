// The engineering resources a project can use (LFE-06): each owner's enrolled native tool, its sessions, its observed
// capacity and the actions only its owner can answer. Pure, so the words and rules are unit-tested. The resource and
// action shapes are the Studio's proposal for SCM-01/02; the capacity observation follows the continuation's
// `sophia.capacity.observation.v1` schema (docs/execution/2026-10-01-unified/contracts/coordination).
import { pace, type Pace } from './pace.ts'

/** The native coding tools a resource can enroll; each shows as itself (ToolLogo). */
export type Tool = 'claude-code' | 'codex' | 'grok' | 'gemini-cli' | 'github-copilot' | 'cursor'
export const TOOL: Record<Tool, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  grok: 'Grok',
  'gemini-cli': 'Gemini CLI',
  'github-copilot': 'GitHub Copilot',
  cursor: 'Cursor',
}
/** Who makes the tool: said beside its name, never as a claim about the account behind it. */
export const VENDOR: Record<Tool, string> = {
  'claude-code': 'Anthropic',
  codex: 'OpenAI',
  grok: 'xAI',
  'gemini-cli': 'Google',
  'github-copilot': 'GitHub',
  cursor: 'Anysphere',
}

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
  /** The owner, with their account's picture when the provider gives one. */
  owner: { id: string; name: string; avatarUrl?: string | null }
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
  daily_requests: 'Daily requests',
  five_hour: '5-hour',
  seven_day: '7-day',
  seven_day_opus: '7-day, one model',
  spend_limit: 'Spend limit',
}
export const windowName = (id: string) => WINDOW_NAME[id] ?? id.replaceAll('_', ' ')

export interface WindowView {
  /** The window's id, as the observation gave it. */
  id: string
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
  if (withheld) return { id: w.window_id, name, state, value: withheld, reset, percent: null, applies }
  const v = w.value ?? 0
  const percent = w.unit === 'percent_used' || w.unit === 'spend_percent_used' ? v : null
  return { id: w.window_id, name, state, value: `${valueOf(w, v)}${APPLIES[applies]}`, reset, percent, applies }
}

const headline = (v: WindowView) => `${v.name} window: ${v.value}${v.reset ? `, ${v.reset}` : ''}`
/** A balance is a count, not a window filling up: its name and what is left. */
const balanceLine = (v: WindowView) => `${v.name}: ${v.value}${v.reset ? `, ${v.reset}` : ''}`

export interface Capacity {
  /** The capacity in one line, in words. */
  line: string
  /** The percentage window the line comes from, for a meter; null when the line isn't a percentage. */
  limiting: WindowView | null
  /** Whether the line reports something observed (a percentage or a balance), not an unknown or pending capacity. */
  known: boolean
  /** The limiting window's pace (pace.ts), when its length is known. */
  pace: Pace | null
}

/**
 * What the windows known to apply say together: the most used percentage; else that a reset is pending, or that the
 * capacity is unknown, while any window is unresolved; else an observed balance, as it was reported (no percentage is
 * made of it). Windows that may not apply never shape it, not even as pending.
 */
function fromKnown(known: WindowView[]): Omit<Capacity, 'pace'> | null {
  const limiting = known
    .filter((v) => v.percent !== null)
    .reduce<WindowView | null>((most, v) => (most && (most.percent ?? 0) >= (v.percent ?? 0) ? most : v), null)
  if (limiting) return { line: headline(limiting), limiting, known: true }
  // A balance can't be weighed against a window that isn't resolved: the unresolved one says so first.
  if (known.some((v) => v.state === 'refresh_pending')) return { line: 'Refresh pending', limiting: null, known: false }
  if (known.some((v) => v.state === 'unknown')) return { line: 'Capacity unknown', limiting: null, known: false }
  const balance = known.find((v) => v.state === 'observed')
  return balance ? { line: balanceLine(balance), limiting: null, known: true } : null
}

/**
 * The account's capacity, from the windows known to apply. No observation, one that can't see the account, or one
 * past its `valid_until` is "Capacity unknown": never full, never empty, and an expired one says how long ago it
 * stopped holding. "No window observed" is kept for a reading with no windows at all.
 */
const none = (line: string): Capacity => ({ line, limiting: null, known: false, pace: null })

export function capacity(obs: QuotaObservation | undefined, now: Date): Capacity {
  if (!obs || obs.coverage === 'unavailable') return none('Capacity unknown')
  if (expired(obs, now)) return none(`Capacity unknown: the last reading expired ${ago(obs.valid_until, now)}`)
  if (obs.windows.length === 0) return none('No window observed')
  const views = obs.windows.map((w) => windowView(w, now))
  const known = fromKnown(views.filter((v) => v.applies === 'known'))
  if (!known) return none('Capacity unknown: no window is known to apply here')
  const limiting = obs.windows.find((w) => w.window_id === known.limiting?.id)
  return { ...known, pace: limiting ? pace(limiting, obs, now) : null }
}

export const capacityLine = (obs: QuotaObservation | undefined, now: Date) => capacity(obs, now).line

export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** Beside the view's count: how many hosts are online and how many requests wait. Never a capacity total. */
export function summary(resources: Resource[], actions: RequiredAction[]): string {
  const online = resources.filter((r) => r.host.state === 'online').length
  const waiting = actions.filter((a) => a.state === 'open').length
  return [
    `${online} ${online === 1 ? 'host' : 'hosts'} online`,
    waiting ? `${plural(waiting, 'request')} waiting` : 'nothing waiting',
  ].join(' · ')
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

/** How full a window is, as its meter's colour: amber from 75 % used, red from 90 %. */
export type UsageTone = 'ok' | 'warn' | 'full'
export const WARN_AT = 75
export const FULL_AT = 90

export function usageTone(percent: number): UsageTone {
  if (percent >= FULL_AT) return 'full'
  return percent >= WARN_AT ? 'warn' : 'ok'
}

export const SUPPORT: Record<Support, string> = {
  supported: 'supported',
  unqualified: 'not qualified yet',
  unsupported: 'not offered',
}

/** The resource list's filters: everything, what has a request waiting, what is online, what is the viewer's own. */
export type Filter = 'all' | 'waiting' | 'online' | 'mine'
export const FILTERS: Filter[] = ['all', 'waiting', 'online', 'mine']
export const FILTER_LABEL: Record<Filter, string> = { all: 'All', waiting: 'Waiting', online: 'Online', mine: 'Mine' }

const waitingOn = (r: Resource, actions: RequiredAction[]) =>
  actions.some((a) => a.resourceId === r.id && a.state === 'open')

export function inFilter(filter: Filter, r: Resource, actions: RequiredAction[], viewerId: string): boolean {
  if (filter === 'waiting') return waitingOn(r, actions)
  if (filter === 'online') return r.host.state === 'online'
  if (filter === 'mine') return r.owner.id === viewerId
  return true
}

/** Text to compare in a search: no case, no accents ("Mérida" finds "merida"). */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Whether a resource answers a search: every word must be found in its tool, maker, owner, sessions' roles and models,
 * or what they work on. Case and accents don't matter; an empty search finds everything.
 */
export function matches(r: Resource, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = fold(
    [
      TOOL[r.tool],
      VENDOR[r.tool],
      r.owner.name,
      ...r.sessions.flatMap((s) => [s.role, s.model ?? '', s.assignment?.title ?? '']),
    ].join(' '),
  )
  return words.every((w) => haystack.includes(w))
}

/** What a resource is doing, in a tile's one line: its first assignment, and how many sessions share the account. */
export function activity(r: Resource): string {
  const n = r.sessions.length
  const first = r.sessions.find((s) => s.assignment)?.assignment
  if (!first) return n > 1 ? `${n} sessions, none assigned` : 'No assignment'
  return n > 1 ? `${first.title} · ${n} sessions` : first.title
}
