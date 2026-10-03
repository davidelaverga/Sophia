// The technical lead's plan, as the Studio reads it (LFE-07.1): `sophia.work.plan.v1` (contracts/coordination/
// work-plan.schema.json) as it is, plus what 07.1 shows that the schema doesn't carry yet, proposed for SCM-04: the
// goal it serves, its next checkpoint, what it assumes and the decisions it reserves (06_LEAD_RECIPES §3 puts those
// last two in the plan). Who does an item is found, not stored twice: the resource whose session has that work as its
// assignment (LFE-06). Nothing here computes progress: no percentage, no timer.
import { TOOL, type Resource, type Session } from '../../resources/resource.ts'

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
}

/** A decision the plan reserves for someone: decision.v1's shape, with the question it asks (proposed). */
export interface PlanDecision {
  decision_id: string
  question: string
  decider_id: string
  state: 'proposed' | 'accepted' | 'declined' | 'expired' | 'superseded'
  choices: { key: string; label: string }[]
  selected_choice: string | null
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

export interface PlanRow {
  item: PlanItem
  /** 0 for a top item; 1 for one grouped under it. */
  depth: number
}

/** The items in plan order, each grouped one under its parent; one whose parent isn't in the plan stands on its own. */
export function planRows(plan: WorkPlan): PlanRow[] {
  const ids = new Set(plan.items.map((i) => i.id))
  const top = plan.items.filter((i) => i.parent_id === null || !ids.has(i.parent_id))
  return top.flatMap((item) => [
    { item, depth: 0 },
    ...plan.items.filter((c) => c.parent_id === item.id).map((c) => ({ item: c, depth: 1 })),
  ])
}

/**
 * When an item starts, in words: now (or, with no one on it, ready for someone), after the items it waits for, or once
 * its producer's candidate is ready.
 */
export function startsWhen(item: PlanItem, plan: WorkPlan): string {
  const purpose = (id: string | null) => plan.items.find((i) => i.id === id)?.purpose ?? 'other work'
  if (item.activation.kind === 'candidate_ready')
    return `When “${purpose(item.activation.producer_work_id)}” has a candidate`
  if (item.blocked_by.length > 0) return `After ${item.blocked_by.map((id) => `“${purpose(id)}”`).join(' and ')}`
  return item.assignee_kind === 'unassigned' ? 'Ready for someone to take' : 'Starts now'
}

type Person = Resource['owner']

export interface Doer {
  /** "Davide’s Claude Code", "Luis", or "Unassigned". */
  name: string
  role: string | null
  resource: Resource | null
  /** The person who does it by hand, when it is one. */
  person: Person | null
  /** What its session reports of this work; null before it starts or when no session reports it. */
  state: NonNullable<Session['assignment']>['state'] | null
}

const UNASSIGNED: Doer = { name: 'Unassigned', role: null, resource: null, person: null, state: null }

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
        state: session.assignment?.state ?? null,
      }
    }
  }
  return { ...UNASSIGNED, name: 'Assigned, not running yet' }
}
