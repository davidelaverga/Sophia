// The lead's plan on the board (LFE-07.1, WBC-01): one goal's view (board-view.ts) as rows. A row is a plan item, its
// definition from the accepted plan, joined to what is observed of it now: its exact assignment, what it waits on, its
// last report from that same attempt, its candidates, review and completion, and what this viewer may do to it.
//
// Where a row stands is read from that observation and nothing else: no list order, no session that happens to share
// its work id, no account owner standing in for whoever must answer. Unknown stays unknown (no write control), a
// closed failure is never coloured as success, and Complete needs the item's own completion policy satisfied with
// evidence. A proposed plan is shown beside the accepted one, or alone and read-only while none is accepted; it never
// inherits execution authority. Nothing here computes progress: no percentage, no timer.
import type { Resource, Session } from '../../resources/resource.ts'
import type {
  Activity,
  ActionKind,
  Assignment,
  BoardDecision,
  ExecutorKind,
  GoalView,
  ItemAction,
  ItemView,
  Lifecycle,
  PlanItem,
  Wait,
  WaitKind,
  WorkPlan,
} from './board-view.ts'
import { reviewOf, type ReviewOf } from './results.ts'

export type { BoardDecision, GoalView, PlanItem, WorkPlan } from './board-view.ts'

type Person = Resource['owner']

/** Whether a decision can still be answered: proposed, and not past its expiry. */
export const actionable = (d: BoardDecision, now: Date) =>
  d.state === 'proposed' && Date.parse(d.expires_at) > now.getTime()

/**
 * Each decision as it stands now: of its revisions on the board, the latest, whatever their states or their order. An
 * older revision is history, read and never answered: one still proposed under a later one, proposed or answered,
 * expired or superseded, is no one's to act on (Codex F-048). Listed in the order the decisions first appear.
 */
export function latestDecisions(decisions: readonly BoardDecision[]): BoardDecision[] {
  const latest = new Map<string, BoardDecision>()
  for (const d of decisions) {
    const was = latest.get(d.decision_id)
    if (!was || d.revision > was.revision) latest.set(d.decision_id, d)
  }
  return [...latest.values()]
}

/**
 * Whether a choice was made for this plan, at its revision or an earlier one: history it carries forward. One made for
 * another plan, a replacement proposed or a later revision of it not in force, isn't this plan's (Codex F-013, F-015).
 */
export const decidedFor = (d: BoardDecision, plan: WorkPlan) =>
  d.plan_id === plan.plan_id && d.plan_revision <= plan.revision

/** The plan in force, when one is accepted. A superseded or withdrawn plan is history, not the plan. */
export const accepted = (goal: GoalView | null | undefined): WorkPlan | null =>
  goal?.current_plan?.state === 'accepted' ? goal.current_plan : null

/** Replacements proposed and not accepted yet. */
export const proposed = (goal: GoalView | null | undefined): WorkPlan[] =>
  (goal?.proposed_plans ?? []).filter((p) => p.state === 'proposed')

/**
 * The plan the board shows: the accepted one, operable; else the first proposed, read only. None when the goal has
 * neither: it is then shown as a goal without a plan.
 */
export function shownPlan(goal: GoalView | null | undefined): { plan: WorkPlan; operable: boolean } | null {
  const inForce = accepted(goal)
  if (inForce) return { plan: inForce, operable: true }
  const first = proposed(goal)[0]
  return first ? { plan: first, operable: false } : null
}

export interface Doer {
  /** "Davide’s Claude Code", "Sophia", "Luis", "Unassigned". */
  name: string
  /** "Source reviewer", "worker". */
  role: string | null
  /** Who executes it, as its assignment says; null when no assignment is observed. */
  kind: ExecutorKind | null
  /** The owner's resource it runs on, when the assignment names one; Sophia's own workers have none. */
  resource: Resource | null
  /** The person behind it: the account's owner, or who does it by hand; null for Sophia's own workers. */
  person: Person | null
  /** The native session the assignment names, when its resource lists it; never one found by its work id. */
  session: Session | null
  assignment: Assignment | null
}

const UNASSIGNED: Doer = {
  name: 'Unassigned',
  role: null,
  kind: null,
  resource: null,
  person: null,
  session: null,
  assignment: null,
}

/** The person an id names, or one made from the name the view gives; null when there is neither. */
const personOf = (id: string | null, people: Record<string, Person>, name?: string): Person | null =>
  id ? (people[id] ?? (name ? { id, name } : null)) : null

/** Who does an item: its admitted assignment, exactly; else the person the plan names; else unassigned. */
export function whoDoes(
  item: PlanItem,
  view: ItemView | null,
  resources: readonly Resource[],
  people: Record<string, Person>,
): Doer {
  const assignment = view?.assignment ?? null
  if (assignment) {
    const { executor } = assignment
    const resource = resources.find((r) => r.id === executor.resource_id) ?? null
    return {
      name: executor.display_name,
      role: executor.role,
      kind: executor.kind,
      resource,
      person: executor.kind === 'sophia_native' ? null : personOf(executor.owner_id, people, executor.display_name),
      session: resource?.sessions.find((s) => s.id === assignment.native_session_id) ?? null,
      assignment,
    }
  }
  if (item.assignee_kind === 'human') {
    const person = personOf(item.assignee_id, people)
    return { ...UNASSIGNED, name: person?.name ?? 'Someone on the team', kind: 'human', person }
  }
  return item.assignee_kind === 'assignment' ? { ...UNASSIGNED, name: 'Assigned, not running yet' } : UNASSIGNED
}

/**
 * Where an item stands, as one mark and a few words. The mark decides its lane (`LANE`), and `rank` orders the plan by
 * what needs someone: what waits first, what is closed last.
 */
export type Mark =
  | 'waiting'
  | 'changes'
  | 'review'
  | 'unknown'
  | 'held'
  | 'working'
  | 'queued'
  | 'later'
  | 'free'
  | 'complete'
  | 'closed'
export type Lane = 'active' | 'next' | 'blocked' | 'unassigned' | 'complete' | 'closed'

export interface Status {
  mark: Mark
  /** In a few words: what a chip says, on its tile and atop its sheet, on one line. */
  text: string
  /** Why, when those few words can't say it: read in the task's sheet, where it wraps (Codex F-011). */
  detail?: string
  rank: number
  /** Whom a waiting task waits on first: the viewer when a request names them; null when no person answers it. */
  on?: Person | null
}

const MARKS: readonly Mark[] = [
  'waiting',
  'changes',
  'review',
  'unknown',
  'held',
  'working',
  'queued',
  'later',
  'free',
  'complete',
  'closed',
]

/** The lane each mark sits in: a view over the item's state, not four more operational states. */
export const LANE: Readonly<Record<Mark, Lane>> = {
  waiting: 'active',
  changes: 'active',
  review: 'active',
  unknown: 'active',
  held: 'active',
  working: 'active',
  queued: 'next',
  later: 'next',
  free: 'unassigned',
  complete: 'complete',
  closed: 'closed',
}

const at = (mark: Mark, text: string, detail?: string): Status => ({
  mark,
  text,
  rank: MARKS.indexOf(mark),
  ...(detail ? { detail } : {}),
})

/** One thing a row waits on, with the person who answers it, when one does. */
export interface WaitRow {
  wait: Wait
  who: Person | null
}

/** What a wait is, when no person answers it. */
const WAIT_KIND: Readonly<Record<WaitKind, string>> = {
  product_decision: 'Waiting on a decision',
  native_permission: 'Waiting on a permission',
  dependency: 'Waiting on other work',
  capacity: 'Waiting for capacity',
  connection: 'Waiting for its connection',
  external: 'Waiting on someone outside',
}

/** A wait, as a chip says it: "Waiting on Davide", or what it waits for. */
export const waitSaid = (w: WaitRow) => (w.who ? `Waiting on ${w.who.name}` : WAIT_KIND[w.wait.kind])

/** The waits still open: pending, or not known to have ended. Resolved and expired ones call no one. */
export const open = (waits: readonly WaitRow[]) =>
  waits.filter((w) => w.wait.state === 'pending' || w.wait.state === 'unknown')

/** A waiting item: on the viewer first, when a pending request names them; else on the first person; else what. */
function waiting(waits: readonly WaitRow[], viewerId: string | null): Status {
  const pending = open(waits).filter((w) => w.wait.state === 'pending')
  const first =
    pending.find((w) => viewerId !== null && w.wait.respondent_id === viewerId) ??
    pending.find((w) => w.who !== null) ??
    pending[0]
  return first ? { ...at('waiting', waitSaid(first)), on: first.who } : { ...at('waiting', 'Waiting'), on: null }
}

/** The items an item waits on in its plan: its blockers, and the producer whose candidate it reviews. */
export const waitsOn = (item: PlanItem) => [
  ...item.blocked_by,
  ...(item.activation.kind === 'candidate_ready' && item.activation.producer_work_id
    ? [item.activation.producer_work_id]
    : []),
]

/** A phrase that continues a sentence: its first letter small, a name in it kept as it is. */
const continuing = (said: string) => said.charAt(0).toLowerCase() + said.slice(1)

const purposeIn = (plan: WorkPlan) => (id: string) => plan.items.find((i) => i.id === id)?.purpose ?? 'other work'

/** What a task not begun hangs on, every condition, for its tile's foot: its relations, then its open waits. */
export const hangsOn = (row: PlanRow, plan: WorkPlan): string | null =>
  [relation(row.item, plan), ...(LANE[row.status.mark] === 'active' ? [] : open(row.waits).map(waitSaid))]
    .filter((s) => s !== null)
    .join(' · ') || null

/** How a task hangs on others, in a few words: the build it reviews, and what it comes after. Null when it doesn't. */
export function relation(item: PlanItem, plan: WorkPlan): string | null {
  const purpose = purposeIn(plan)
  const producer = item.activation.kind === 'candidate_ready' ? item.activation.producer_work_id : null
  const after = item.blocked_by.length > 0 ? `after ${item.blocked_by.map(purpose).join(' and ')}` : null
  if (producer) return after ? `Reviews ${purpose(producer)}, ${after}` : `Reviews ${purpose(producer)}`
  return after ? `A${after.slice(1)}` : null
}

/** What a task not started yet waits for, every condition: its blockers, a candidate to review, and open waits. */
export function startsWhen(item: PlanItem, plan: WorkPlan, waits: readonly WaitRow[]): string | null {
  const purpose = purposeIn(plan)
  const parts = [
    item.blocked_by.length > 0 ? `after ${item.blocked_by.map(purpose).join(' and ')}` : null,
    item.activation.kind === 'candidate_ready' ? 'once there is a candidate to review' : null,
    ...open(waits).map((w) => continuing(waitSaid(w))),
  ].filter((p) => p !== null)
  const said = parts.join(', ')
  return said ? said.charAt(0).toUpperCase() + said.slice(1) : null
}

const CLOSED: Readonly<Partial<Record<Lifecycle, string>>> = {
  stopped: 'Stopped',
  cancelled: 'Cancelled',
  failed: 'Failed',
  superseded: 'Superseded',
}

const MOVING: Readonly<Partial<Record<Lifecycle, [Mark, string]>>> = {
  running: ['working', 'Working'],
  held: ['held', 'Held'],
  ready_for_review: ['review', 'Ready for review'],
  changes_required: ['changes', 'Changes needed'],
}

/** Complete, as the item's own policy says it: satisfied, with evidence. Anything less is not success. */
export const completeByPolicy = (view: ItemView) =>
  view.lifecycle === 'complete' && view.completion.status === 'satisfied' && view.completion.evidence_refs.length > 0

/** A complete item not shown as such, in its chip; why, in its sheet (Codex F-011). */
const NOT_COMPLETE = 'Not shown as complete'

/** Why a check bound to a version doesn't certify the item now: of another version, or of none matched (F-009). */
const UNCERTIFIED: Readonly<Partial<Record<ReviewOf, string>>> = {
  another: 'Its check was of another version than the one it holds now.',
  unmatched: 'Its check can’t be matched to a single current version: two claim to be current, or none is.',
}

/**
 * Why a check of the version it holds now doesn't certify it: it hasn't passed (Codex F-020). Pending, it is still to
 * come; found changes needed or inconclusive, it says otherwise.
 */
const UNPASSED: Readonly<Partial<Record<ItemView['review']['state'], string>>> = {
  pending: 'Its check of the version it holds now is still pending.',
  changes_required: 'Its check of the version it holds now found changes needed.',
  inconclusive: 'Its check of the version it holds now was inconclusive.',
}

/** Why a complete item isn't shown as such, or null: a check of another version, of none matched, or not passed. */
function uncertifiedOf(view: ItemView): string | null {
  const of = reviewOf(view)
  return UNCERTIFIED[of] ?? (of === 'current' ? (UNPASSED[view.review.state] ?? null) : null)
}

/**
 * A complete item, shown as complete only with its evidence, and with a passed check of the version it holds now. A
 * check bound to no version (a review's own deliverable, a task with none asked) leaves its policy's word as it is.
 */
function completed(view: ItemView): Status {
  if (!completeByPolicy(view)) return at('unknown', NOT_COMPLETE, 'Its policy isn’t satisfied with evidence.')
  const uncertified = uncertifiedOf(view)
  return uncertified ? at('unknown', NOT_COMPLETE, uncertified) : at('complete', 'Complete')
}

/**
 * Why what is observed of an item can't be taken as its state now, or null when it can: no assignment for work past
 * planning (the plan names who does it; the view says nobody), or an assignment its host doesn't report.
 */
function unobserved(view: ItemView): string | null {
  if (!view.assignment) return view.lifecycle === 'planned' ? null : 'Assignment not observed'
  const { observation_state: state } = view.assignment
  return state === 'observed' ? null : state === 'offline' ? 'Host offline' : 'Not observed'
}

/** Where an item that has not begun stands: queued, up next with what it waits for, or unassigned. */
function notBegun(item: PlanItem, view: ItemView, plan: WorkPlan, waits: readonly WaitRow[]): Status {
  const when = startsWhen(item, plan, waits)
  if (view.lifecycle === 'queued') return at('queued', when ? `Queued · ${continuing(when)}` : 'Queued')
  if (!view.assignment && item.assignee_kind === 'unassigned') return at('free', when ?? 'Unassigned')
  return at('later', when ?? 'Not started')
}

export interface Standing {
  item: PlanItem
  view: ItemView | null
  plan: WorkPlan
  waits: readonly WaitRow[]
  viewerId: string | null
}

/** Where an item stands now, from its observation alone. */
export function status({ item, view, plan, waits, viewerId }: Standing): Status {
  if (!view) return at('unknown', 'Not observed')
  const closed = CLOSED[view.lifecycle]
  if (closed) return at('closed', closed)
  if (view.lifecycle === 'complete') return completed(view)
  if (view.lifecycle === 'unknown') return at('unknown', 'State unknown')
  const why = unobserved(view)
  if (why) return at('unknown', why)
  if (view.lifecycle === 'waiting') return waiting(waits, viewerId)
  const moving = MOVING[view.lifecycle]
  return moving ? at(...moving) : notBegun(item, view, plan, waits)
}

export interface PlanRow {
  item: PlanItem
  /** What is observed of it now; null when the view says nothing of it, or says it twice. */
  view: ItemView | null
  doer: Doer
  status: Status
  /** 0 for a top item; 1 for one grouped under it, 2 under that, and so on. */
  depth: number
  /** Everything it waits on, typed, with who answers each. */
  waits: WaitRow[]
  /** Its last report, from its current attempt and generation only; an earlier attempt's is not its state now. */
  activity: Activity | null
  /** What the viewer may do to it, as the view says; none on a plan that isn't in force. */
  actions: ItemAction[]
}

/** What the view says the viewer may do; missing means unavailable, never allowed. */
/** Why a kind the view offers more than once isn't allowed: it doesn't say which of its entries holds (Codex F-026). */
export const AMBIGUOUS = 'Offered here more than once, so it isn’t allowed until the view says it once.'

/**
 * What the view offers the viewer of one kind on a task, or null when it offers none. Offered more than once, in any
 * order, agreeing or not, it is ambiguous: no entry is taken as the grant. It is unavailable, with why, so nothing it
 * would send goes and no control is offered for it; a result stays shown, said not openable (Codex F-026).
 */
export function actionOf(row: PlanRow, kind: ActionKind): ItemAction | null {
  const offered = row.actions.filter((a) => a.kind === kind)
  if (offered.length < 2) return offered[0] ?? null
  return { kind, availability: 'unavailable', reason: AMBIGUOUS, boundary: null }
}
export const allowed = (row: PlanRow, kind: ActionKind) => actionOf(row, kind)?.availability === 'allowed'

/**
 * Whether a row waits on an item of its plan that is not complete. Only completion satisfies a dependency: a blocker
 * stopped, cancelled or failed is terminal and still holds it (02_AUTHORITY_AND_LIFECYCLE: a cancelled prerequisite
 * does not satisfy a dependency). One outside the plan is unknown, and doesn't block.
 */
const blockedIn = (row: PlanRow, rows: readonly PlanRow[]) =>
  row.item.blocked_by.some((id) => {
    const blocker = rows.find((r) => r.item.id === id)
    return blocker !== undefined && LANE[blocker.status.mark] !== 'complete'
  })

/** The items of the plan that `blocked` rows wait on and that are not complete, once each, in the order they came. */
export function blockersOf(blocked: readonly PlanRow[], rows: readonly PlanRow[]): PlanRow[] {
  const ids = [...new Set(blocked.flatMap((r) => r.item.blocked_by))]
  return ids.flatMap((id) => {
    const blocker = rows.find((r) => r.item.id === id)
    return blocker !== undefined && LANE[blocker.status.mark] !== 'complete' ? [blocker] : []
  })
}

/** The lane a row sits in: its mark's; Blocked when it is up next but waits on an item of its plan not done yet. */
export const laneOf = (row: PlanRow, rows: readonly PlanRow[]): Lane => {
  const lane = LANE[row.status.mark]
  return lane === 'next' && blockedIn(row, rows) ? 'blocked' : lane
}

/** Whether a row is for the viewer: a pending request names them, or they do it by hand. Owning an account is not. */
export const forViewer = (row: PlanRow, viewerId: string | null) =>
  viewerId !== null &&
  (row.waits.some((w) => w.wait.state === 'pending' && w.wait.respondent_id === viewerId) ||
    (row.doer.kind === 'human' && row.doer.person?.id === viewerId))

/**
 * Whether a goal holds something for the viewer to answer: a pending request that names them, or a decision of theirs
 * still to answer. A decision past its expiry calls no one; work they do by hand is theirs, not a request.
 */
export const forYou = (
  rows: readonly PlanRow[],
  decisions: readonly BoardDecision[],
  viewerId: string | null,
  now: Date,
) =>
  viewerId !== null &&
  (rows.some((r) => r.waits.some((w) => w.wait.state === 'pending' && w.wait.respondent_id === viewerId)) ||
    latestDecisions(decisions).some((d) => d.decider_id === viewerId && actionable(d, now)))

/** Its last report, when it is its current attempt's, in its current generation. */
const currentActivity = (view: ItemView | null): Activity | null => {
  const activity = view?.activity ?? null
  const assignment = view?.assignment ?? null
  return activity &&
    assignment &&
    activity.assignment_generation === assignment.generation &&
    activity.attempt_id === assignment.attempt_id
    ? activity
    : null
}

/** Each item once, depth first under its head, however deep; one caught in a loop of parents still comes, alone. */
function groups(items: readonly PlanItem[]): { item: PlanItem; depth: number }[][] {
  const ids = new Set(items.map((i) => i.id))
  const seen = new Set<string>()
  const under = (item: PlanItem, depth: number): { item: PlanItem; depth: number }[] => {
    seen.add(item.id)
    const children = items.filter((c) => c.parent_id === item.id && !seen.has(c.id))
    return [{ item, depth }, ...children.flatMap((c) => under(c, depth + 1))]
  }
  const heads = items.filter((i) => i.parent_id === null || !ids.has(i.parent_id)).map((h) => under(h, 0))
  const caught = items.filter((i) => !seen.has(i.id)).map((i) => (seen.has(i.id) ? [] : under(i, 0)))
  return [...heads, ...caught.filter((g) => g.length > 0)]
}

/** The first item of each id: a repeated id is reported (planProblems), never drawn twice. */
const unique = (items: readonly PlanItem[]) => items.filter((i, n) => items.findIndex((j) => j.id === i.id) === n)

/** Each item's observation by its work id; one observed twice is ambiguous, so it has none. */
function viewsOf(goal: GoalView): Map<string, ItemView | null> {
  const views = new Map<string, ItemView | null>()
  for (const view of goal.items) views.set(view.work_id, views.has(view.work_id) ? null : view)
  return views
}

export interface Board {
  plan: WorkPlan
  /** Whether the plan is in force: a proposed plan is read, never operated. */
  operable: boolean
  rows: PlanRow[]
  /** What doesn't hold together in it, in words; each item is still shown once. */
  problems: string[]
  /** Work observed now that the plan in force doesn't hold: said, never hidden. */
  outside: Outside[]
}

interface Readers {
  resources: readonly Resource[]
  people: Record<string, Person>
  viewerId: string | null
  /** The project being looked at: a plan of another is never operated as this one's. */
  project?: string
}

/** A proposed plan's item: nothing about it is observed, and it runs nowhere yet. */
const PROPOSED: ItemView = {
  work_id: '',
  lifecycle: 'planned',
  assignment: null,
  waiting_on: [],
  activity: null,
  candidates: [],
  review: { state: 'not_requested', candidate_version_ref: null, evidence_refs: [] },
  completion: { policy_ref: 'proposed', status: 'not_evaluated', evidence_refs: [] },
  closed_reason: null,
  available_actions: [],
}

/** One item as a row of the shown plan. */
function rowOf(
  { item, depth }: { item: PlanItem; depth: number },
  plan: WorkPlan,
  view: ItemView | null,
  operable: boolean,
  { resources, people, viewerId }: Readers,
): PlanRow {
  const live = operable ? view : null
  const waits = (live?.waiting_on ?? []).map((wait) => ({ wait, who: personOf(wait.respondent_id, people) }))
  const doer = whoDoes(item, live, resources, people)
  const shown = operable ? status({ item, view: live, plan, waits, viewerId }) : notBegun(item, PROPOSED, plan, [])
  return {
    item,
    view: live,
    doer,
    status: shown,
    depth,
    waits,
    activity: currentActivity(live),
    actions: live?.available_actions ?? [],
  }
}

/**
 * The shown plan's rows, ordered by what needs someone: each top item with what it groups under it, however deep, and
 * the groups by their head's mark; plan order within a mark. One whose parent isn't in the plan stands alone.
 */
export function boardOf(goal: GoalView | null | undefined, readers: Readers): Board | null {
  const shown = goal ? shownPlan(goal) : null
  if (!goal || !shown) return null
  const { plan } = shown
  const elsewhere = readers.project !== undefined && plan.project_id !== readers.project
  const operable = shown.operable && !elsewhere
  const views = viewsOf(goal)
  const rows = groups(unique(plan.items))
    .map((g) => g.map((entry) => rowOf(entry, plan, views.get(entry.item.id) ?? null, operable, readers)))
    .toSorted((a, b) => (a[0]?.status.rank ?? 0) - (b[0]?.status.rank ?? 0))
    .flat()
  const outside = outsideOf(goal, operable ? plan : null)
  const problems = [
    ...planProblems(plan, goal),
    ...(elsewhere ? ['It belongs to another project'] : []),
    ...(outside.length > 0
      ? [
          `${String(outside.length)} observed ${outside.length === 1 ? 'task isn’t' : 'tasks aren’t'} in the plan in force`,
        ]
      : []),
  ]
  return { plan, operable, rows, problems, outside }
}

/** Work observed outside the plan: its id, and what is observed of it. */
export interface Outside {
  work_id: string
  /** What is observed of it now; null when the view says it more than once, so which is current isn't known. */
  view: ItemView | null
}

/**
 * Work observed for a goal that `plan` (the plan in force) doesn't hold: all of it while none is in force. Each work id
 * once, in the view's order. One observed more than once is ambiguous, as it is in the plan (viewsOf): it is listed
 * once, with neither observation's lifecycle or executor (Codex F-045).
 */
export const outsideOf = (goal: GoalView, plan: WorkPlan | null): Outside[] => {
  const ids = new Set(plan?.items.map((i) => i.id) ?? [])
  return [...viewsOf(goal)].filter(([id]) => !ids.has(id)).map(([work_id, view]) => ({ work_id, view }))
}

/** Whether following `next` from each item comes back to it: a loop of parents or of blockers. */
function loops(items: readonly PlanItem[], next: (item: PlanItem) => readonly string[]): boolean {
  const byId = new Map(items.map((i) => [i.id, i]))
  const state = new Map<string, 'open' | 'done'>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false
    if (state.get(id) === 'open') return true
    state.set(id, 'open')
    const item = byId.get(id)
    const found = item ? next(item).some(visit) : false
    state.set(id, 'done')
    return found
  }
  return items.some((i) => visit(i.id))
}

/** What doesn't hold together in a plan and its view, in words a person can pass on to the lead. */
export function planProblems(plan: WorkPlan, goal: GoalView): string[] {
  const ids = new Set(plan.items.map((i) => i.id))
  const views = goal.items.map((v) => v.work_id)
  return [
    ids.size !== plan.items.length && 'Two tasks share one id',
    loops(plan.items, (i) => (i.parent_id ? [i.parent_id] : [])) && 'Some tasks are grouped in a loop',
    plan.items.some((i) => waitsOn(i).some((w) => !ids.has(w))) && 'A task waits on work that isn’t in the plan',
    loops(plan.items, waitsOn) && 'Some tasks wait on each other in a loop',
    new Set(views).size !== views.length && 'A task is observed twice',
  ].filter((p) => typeof p === 'string')
}

/** The chip's tone for a mark that moves: amber waits, teal works; the rest say it in words alone. */
export const MARK_TONE: Partial<Record<Mark, 'amber' | 'teal'>> = { waiting: 'amber', working: 'teal' }
