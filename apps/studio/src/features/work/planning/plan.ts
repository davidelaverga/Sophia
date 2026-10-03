// The technical lead's plan, as the Studio reads it (LFE-07.1): `sophia.work.plan.v1` (contracts/coordination/
// work-plan.schema.json) as it is, plus what 07.1 shows that the schema doesn't carry yet, proposed for SCM-04: the
// goal it serves, its next checkpoint, what it assumes and the decisions it reserves (06_LEAD_RECIPES §3 puts those
// last two in the plan). Who does an item is found, not stored twice: the resource whose session has that work as its
// assignment (LFE-06). Nothing here computes progress: no percentage, no timer.
import { ago, TOOL, type Resource, type Session } from '../../resources/resource.ts'

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
  for (const resource of resources) {
    const session = resource.sessions.find((s) => s.assignment?.workId === item.id)
    if (session) {
      return {
        name: `${resource.owner.name}’s ${TOOL[resource.tool]}`,
        role: session.role,
        resource,
        person: resource.owner,
        session,
        state: session.assignment?.state ?? null,
      }
    }
  }
  return { ...UNASSIGNED, name: 'Assigned, not running yet' }
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

/** How a task hangs on another, in a few words: the build it reviews, or what it comes after. Null when it doesn't. */
export function relation(item: PlanItem, plan: WorkPlan): string | null {
  const purpose = (id: string) => plan.items.find((i) => i.id === id)?.purpose ?? 'other work'
  const producer = item.activation.kind === 'candidate_ready' ? item.activation.producer_work_id : null
  if (producer) return `Reviews ${purpose(producer)}`
  if (item.blocked_by.length > 0) return `After ${item.blocked_by.map(purpose).join(' and ')}`
  return null
}

/** Where a task stands once it has ended: checked, or finished and not checked yet. */
const ended = (item: PlanItem): Status | null => {
  if (item.outcome?.state === 'checked') return at('checked', 'Checked')
  return item.outcome?.state === 'finished' ? at('finished', 'Finished, not checked yet') : null
}

export function status(item: PlanItem, doer: Doer, plan: WorkPlan): Status {
  const done = ended(item)
  if (done) return done
  if (doer.state === 'waiting') return at('waiting', `Waiting on ${doer.person?.name ?? 'its owner'}`)
  if (doer.state === 'running') return at('working', 'Working')
  if (doer.state) return at('queued', 'Queued')
  const purpose = (id: string) => plan.items.find((i) => i.id === id)?.purpose ?? 'other work'
  if (item.activation.kind === 'candidate_ready') return at('later', 'Once there is a candidate to review')
  if (item.blocked_by.length > 0) return at('later', `After ${item.blocked_by.map(purpose).join(' and ')}`)
  if (item.assignee_kind === 'unassigned') return at('free', 'Free to take')
  return at('later', 'Not started')
}

export interface PlanRow {
  item: PlanItem
  doer: Doer
  status: Status
  /** 0 for a top item; 1 for one grouped under it. */
  depth: number
}

/**
 * The plan's rows, ordered by what moves: each top item with what it groups right under it, and the groups by their
 * head's mark, what waits on someone first; plan order within a mark. One whose parent isn't in the plan stands alone.
 */
export function planRows(plan: WorkPlan, resources: readonly Resource[], people: Record<string, Person>): PlanRow[] {
  const row = (item: PlanItem, depth: number): PlanRow => {
    const doer = whoDoes(item, resources, people)
    return { item, doer, status: status(item, doer, plan), depth }
  }
  const ids = new Set(plan.items.map((i) => i.id))
  return plan.items
    .filter((i) => i.parent_id === null || !ids.has(i.parent_id))
    .map((head) => [row(head, 0), ...plan.items.filter((c) => c.parent_id === head.id).map((c) => row(c, 1))])
    .toSorted((a, b) => (a[0]?.status.rank ?? 0) - (b[0]?.status.rank ?? 0))
    .flat()
}

/** How long ago a session's activity was observed, to the second while it is fresh: "40 s ago", then "3 min ago". */
export function observedAgo(observed: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(observed)) / 1000))
  return seconds < 60 ? `${String(seconds)} s ago` : ago(observed, now)
}

/** How fresh an observation still is, from 1 when just made to 0 at `span` seconds old. */
export const freshness = (observed: string, now: Date, span = 120) =>
  Math.min(1, Math.max(0, 1 - (now.getTime() - Date.parse(observed)) / 1000 / span))
