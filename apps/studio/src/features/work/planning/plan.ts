// The technical lead's plan, as the Studio reads it (LFE-07.1): `sophia.work.plan.v1` (contracts/coordination/
// work-plan.schema.json) as it is, plus what 07.1 shows that the schema doesn't carry yet, proposed for SCM-04: the
// goal it serves, its next checkpoint, what it assumes and the decisions it reserves (06_LEAD_RECIPES §3 puts those
// last two in the plan). Who does an item is found, not stored twice: the resource whose session has that work as its
// assignment (LFE-06). Nothing here computes progress: no percentage, no timer.
import { TOOL, WORK_STATE, type RequiredAction, type Resource, type Session } from '../../resources/resource.ts'

export interface PlanItem {
  id: string
  purpose: string
  /** Grouping: the item this one belongs under. Not a blocker. */
  parent_id: string | null
  /** The items that must finish first. */
  blocked_by: string[]
  assignee_kind: 'assignment' | 'human' | 'unassigned'
  assignee_id: string | null
  activation: { kind: 'immediate' | 'dependencies_satisfied' | 'candidate_ready'; producer_work_id: string | null }
  /**
   * How it ended, once it has (proposed for SCM-04): its run finished, or its result was checked. A finished run is not
   * accepted work (07_STUDIO_VOICE_AND_ARTIFACTS): the two are said apart.
   */
  outcome?: { state: 'finished' | 'checked'; at: string } | null
}

/** A decision the plan reserves for someone: decision.v1's shape, with the question it asks (proposed). */
export interface PlanDecision {
  decision_id: string
  /** Its own revision (decision.v1): an answer names it, so one given to an older revision is refused as stale. */
  revision: number
  question: string
  decider_id: string
  state: 'proposed' | 'accepted' | 'declined' | 'expired' | 'superseded'
  choices: { key: string; label: string }[]
  selected_choice: string | null
  /** When it stops waiting for an answer (decision.v1 requires one). */
  expires_at: string
}

export interface WorkPlan {
  plan_id: string
  revision: number
  mission_revision: number
  state: 'proposed' | 'accepted' | 'superseded' | 'withdrawn'
  items: PlanItem[]
  /** Proposed for SCM-04: the goal it serves, its next checkpoint, what it assumes, what it reserves. */
  goal_id: string
  next_checkpoint: { label: string; item_id: string | null } | null
  assumptions: { id: string; text: string }[]
  decisions: PlanDecision[]
}

/** Whether a decision can still be answered: proposed, and not past its expiry. */
export const actionable = (d: PlanDecision, now: Date) =>
  d.state === 'proposed' && Date.parse(d.expires_at) > now.getTime()

/**
 * Whether a plan holds something for the viewer: a task waiting on them (a request names them), or a decision of
 * theirs still to answer. A decision past its expiry calls no one.
 */
export const forYou = (rows: readonly PlanRow[], plan: WorkPlan, viewerId: string | null, now: Date) =>
  rows.some((r) => r.status.mark === 'waiting' && r.status.on?.id === viewerId) ||
  plan.decisions.some((d) => d.decider_id === viewerId && actionable(d, now))

/** A plan worth showing: the one in force, or one proposed. A superseded or withdrawn plan is history, not the plan. */
export const current = (plan: WorkPlan | null | undefined) =>
  plan && (plan.state === 'accepted' || plan.state === 'proposed') ? plan : null

type Person = Resource['owner']

export interface Doer {
  /** "Davide’s Claude Code", "Luis", or "Unassigned". */
  name: string
  role: string | null
  resource: Resource | null
  /** The person behind it: the resource's owner, or who does it by hand. */
  person: Person | null
  /** The session doing it, when one is. */
  session: Session | null
  /** What its session reports of this work; null before it starts or when no session reports it. */
  state: NonNullable<Session['assignment']>['state'] | null
}

const UNASSIGNED: Doer = { name: 'Unassigned', role: null, resource: null, person: null, session: null, state: null }

/** Who does an item: the resource whose session has it as its assignment, or the person named; else said unassigned. */
export function whoDoes(item: PlanItem, resources: readonly Resource[], people: Record<string, Person>): Doer {
  if (item.assignee_kind === 'human' && item.assignee_id) {
    const person = people[item.assignee_id] ?? null
    return { ...UNASSIGNED, name: person?.name ?? 'Someone on the team', person }
  }
  if (item.assignee_kind !== 'assignment') return UNASSIGNED
  // The session holding the assignment the item names, when sessions say theirs; else the one on its work. During a
  // handover two can hold the same work: the named assignment decides, not the list's order.
  const named = (s: Session) => item.assignee_id !== null && s.assignment?.id === item.assignee_id
  // By its work only when its assignment doesn't say otherwise: a session that names another assignment was replaced.
  const onIt = (s: Session) =>
    s.assignment?.workId === item.id && (s.assignment.id === undefined || item.assignee_id === null)
  for (const match of [named, onIt]) {
    const found = findSession(resources, match)
    if (found) return doing(found.resource, found.session)
  }
  return { ...UNASSIGNED, name: 'Assigned, not running yet' }
}

/** The first resource's session that matches. */
function findSession(resources: readonly Resource[], match: (s: Session) => boolean) {
  for (const resource of resources) {
    const session = resource.sessions.find(match)
    if (session) return { resource, session }
  }
  return null
}

/** A session doing an item, as a doer. */
function doing(resource: Resource, session: Session): Doer {
  return {
    name: `${resource.owner.name}’s ${TOOL[resource.tool]}`,
    role: session.role,
    resource,
    person: resource.owner,
    session,
    state: session.assignment?.state ?? null,
  }
}

/**
 * Where an item stands, as one mark and a few words: waiting on its owner, working, queued, not started yet (and what
 * for), free for someone to take, or done: finished, then checked. `rank` orders the plan by what moves: what waits on someone first.
 */
export type Mark = 'waiting' | 'working' | 'queued' | 'later' | 'free' | 'finished' | 'checked'
export interface Status {
  mark: Mark
  text: string
  rank: number
  /** Whom a waiting task waits on: the owner an open request of its session names; null when none does. */
  on?: Person | null
}

/** The marks in the order they draw attention: what waits on someone first, what no one has last. */
const MARKS: readonly Mark[] = ['waiting', 'working', 'queued', 'later', 'free', 'finished', 'checked']
const at = (mark: Mark, text: string): Status => ({ mark, text, rank: MARKS.indexOf(mark) })

/** The items an item waits on: its blockers, and the producer whose candidate it reviews. */
export const waitsOn = (item: PlanItem) => [
  ...item.blocked_by,
  ...(item.activation.kind === 'candidate_ready' && item.activation.producer_work_id
    ? [item.activation.producer_work_id]
    : []),
]

/** How a task hangs on others, in a few words: the build it reviews, and what it comes after. Null when it doesn't. */
export function relation(item: PlanItem, plan: WorkPlan): string | null {
  const purpose = (id: string) => plan.items.find((i) => i.id === id)?.purpose ?? 'other work'
  const producer = item.activation.kind === 'candidate_ready' ? item.activation.producer_work_id : null
  const after = item.blocked_by.length > 0 ? `after ${item.blocked_by.map(purpose).join(' and ')}` : null
  if (producer) return after ? `Reviews ${purpose(producer)}, ${after}` : `Reviews ${purpose(producer)}`
  return after ? `A${after.slice(1)}` : null
}

/** Where a task stands once it has ended: checked, or finished and not checked yet. */
const ended = (item: PlanItem): Status | null => {
  if (item.outcome?.state === 'checked') return at('checked', 'Checked')
  return item.outcome?.state === 'finished' ? at('finished', 'Finished, not checked yet') : null
}

/** Whom a waiting session waits on: the owner its open request names, if one does. */
function waitingOn(
  item: PlanItem,
  doer: Doer,
  actions: readonly RequiredAction[],
  people: Record<string, Person>,
): Person | null {
  const request = actions.find((a) => a.sessionId === doer.session?.id && a.workId === item.id && a.state === 'open')
  if (!request) return null
  return people[request.ownerId] ?? (doer.person?.id === request.ownerId ? doer.person : null)
}

/** What a task not started yet waits for: its blockers, a candidate to review, or both. */
function notYet(item: PlanItem, plan: WorkPlan): Status | null {
  const purpose = (id: string) => plan.items.find((i) => i.id === id)?.purpose ?? 'other work'
  const after = item.blocked_by.length > 0 ? `After ${item.blocked_by.map(purpose).join(' and ')}` : null
  if (item.activation.kind === 'candidate_ready') {
    return at('later', after ? `${after}, once there is a candidate to review` : 'Once there is a candidate to review')
  }
  return after ? at('later', after) : null
}

export function status(
  item: PlanItem,
  doer: Doer,
  plan: WorkPlan,
  actions: readonly RequiredAction[] = [],
  people: Record<string, Person> = {},
): Status {
  const done = ended(item)
  if (done) return done
  if (doer.state === 'waiting') {
    // Waiting on someone only when an open request names them: a session can wait on other things too.
    const on = waitingOn(item, doer, actions, people)
    return { ...at('waiting', on ? `Waiting on ${on.name}` : 'Waiting'), on }
  }
  if (doer.state === 'running') return at('working', 'Working')
  // Recorded and queued share a lane, each said as itself.
  if (doer.state) return at('queued', WORK_STATE[doer.state][1])
  const later = notYet(item, plan)
  if (later) return later
  if (item.assignee_kind === 'unassigned') return at('free', 'Free to take')
  return at('later', 'Not started')
}

export interface PlanRow {
  item: PlanItem
  doer: Doer
  status: Status
  /** 0 for a top item; 1 for one grouped under it, 2 under that, and so on. */
  depth: number
}

/** Each item once, depth first under its head, however deep; one caught in a loop of parents still comes, alone. */
function groups(plan: WorkPlan): { item: PlanItem; depth: number }[][] {
  const ids = new Set(plan.items.map((i) => i.id))
  const seen = new Set<string>()
  const under = (item: PlanItem, depth: number): { item: PlanItem; depth: number }[] => {
    seen.add(item.id)
    const children = plan.items.filter((c) => c.parent_id === item.id && !seen.has(c.id))
    return [{ item, depth }, ...children.flatMap((c) => under(c, depth + 1))]
  }
  const heads = plan.items.filter((i) => i.parent_id === null || !ids.has(i.parent_id)).map((h) => under(h, 0))
  const caught = plan.items.filter((i) => !seen.has(i.id)).map((i) => (seen.has(i.id) ? [] : under(i, 0)))
  return [...heads, ...caught.filter((g) => g.length > 0)]
}

/**
 * The plan's rows, ordered by what moves: each top item with what it groups under it, however deep, and the groups by
 * their head's mark, what waits on someone first; plan order within a mark. One whose parent isn't in the plan stands
 * alone. A waiting task says whom it waits on from the open requests (`actions`).
 */
export function planRows(
  plan: WorkPlan,
  resources: readonly Resource[],
  people: Record<string, Person>,
  actions: readonly RequiredAction[] = [],
): PlanRow[] {
  const row = ({ item, depth }: { item: PlanItem; depth: number }): PlanRow => {
    const doer = whoDoes(item, resources, people)
    return { item, doer, status: status(item, doer, plan, actions, people), depth }
  }
  return groups(plan)
    .map((g) => g.map(row))
    .toSorted((a, b) => (a[0]?.status.rank ?? 0) - (b[0]?.status.rank ?? 0))
    .flat()
}
