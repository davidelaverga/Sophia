// What changed in a plan since its viewer last looked (LFE-09's "useful return", WBC-01 G5), kept in this browser only:
// where each task stood and which result it held, and each decision's state, when they marked it seen. A task whose
// mark or result moved, or that is new, has changed; so has a decision. A first visit remembers the plan as it is and
// says nothing changed. It is the viewer's attention, nothing more: marking seen accepts nothing, answers nothing and
// moves no task, and no task text is kept, only ids and states. Kept per project, goal, plan and viewer, so another
// viewer's look never leaks into this one; a browser that refuses storage just forgets.
import type { BoardDecision } from './board-view.ts'
import type { Mark, PlanRow } from './plan.ts'
import { resultsOf } from './results.ts'

/** Whose look, at which plan. */
export interface SeenAt {
  project: string
  goal: string
  plan: string
  viewer: string | null
}

export interface Seen {
  items: Record<string, { mark: Mark; result: string | null }>
  decisions: Record<string, string>
}

const key = (at: SeenAt) => `sophia.plan.seen.v2.${at.project}.${at.goal}.${at.plan}.${at.viewer ?? 'anyone'}`

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isSeen = (value: unknown): value is Seen =>
  isRecord(value) &&
  isRecord(value.items) &&
  isRecord(value.decisions) &&
  Object.values(value.items).every((v) => isRecord(v) && typeof v.mark === 'string') &&
  Object.values(value.decisions).every((v) => typeof v === 'string')

const decisionState = (d: BoardDecision) => `${String(d.revision)}:${d.state}:${d.plan_reaction}`

/** The plan as it stands now, as a look keeps it. */
export const glance = (rows: readonly PlanRow[], decisions: readonly BoardDecision[]): Seen => ({
  items: Object.fromEntries(
    rows.map((r) => [r.item.id, { mark: r.status.mark, result: resultsOf(r.view).current?.version_id ?? null }]),
  ),
  decisions: Object.fromEntries(decisions.map((d) => [d.decision_id, decisionState(d)])),
})

export function readSeen(at: SeenAt): Seen | null {
  try {
    const raw = localStorage.getItem(key(at))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isSeen(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeSeen(at: SeenAt, seen: Seen): Seen {
  try {
    localStorage.setItem(key(at), JSON.stringify(seen))
  } catch {
    // Not kept: the next visit starts from here again.
  }
  return seen
}

/** The tasks that moved, arrived or got a new result since `seen`; none when there is nothing to compare with. */
export function changedSince(rows: readonly PlanRow[], seen: Seen | null): ReadonlySet<string> {
  if (!seen) return new Set()
  const now = glance(rows, []).items
  return new Set(
    rows
      .filter(
        (r) =>
          seen.items[r.item.id]?.mark !== now[r.item.id]?.mark ||
          seen.items[r.item.id]?.result !== now[r.item.id]?.result,
      )
      .map((r) => r.item.id),
  )
}

const SAID: Readonly<Record<Mark, (task: string, row: PlanRow, yours: boolean) => string>> = {
  waiting: (task, row, yours) =>
    yours
      ? `${task} now waits on you`
      : row.status.on
        ? `${task} waits on ${row.status.on.name}`
        : `${task} is waiting`,
  changes: (task) => `${task} needs changes`,
  review: (task) => `${task} is ready for review`,
  unknown: (task) => `${task} isn’t observed now`,
  held: (task) => `${task} is held`,
  working: (task) => `${task} started`,
  queued: (task) => `${task} is queued`,
  later: (task) => `${task} is up next`,
  free: (task) => `${task} is unassigned`,
  complete: (task) => `${task} is complete`,
  closed: (task, row) => `${task} ${row.status.text.toLowerCase()}`,
}

/** The marks that block or need someone: said before the rest. */
const PRESSING: ReadonlySet<Mark> = new Set(['waiting', 'changes', 'unknown', 'closed'])

type Person = { id: string; name: string }

function decisionsSaid(
  decisions: readonly BoardDecision[],
  seen: Seen,
  viewerId: string | null,
  people: Record<string, Person>,
) {
  return decisions
    .filter((d) => seen.decisions[d.decision_id] !== decisionState(d))
    .flatMap((d) => {
      const who = people[d.decider_id]?.name ?? 'Someone'
      if (d.state === 'proposed') {
        return [
          d.decider_id === viewerId
            ? `A decision waits on you: ${d.question}`
            : `${who} has a decision to make: ${d.question}`,
        ]
      }
      const choice = d.choices.find((c) => c.key === d.selected_choice)?.label
      return d.state === 'accepted' && choice
        ? [`${d.decider_id === viewerId ? 'You' : who} chose ${choice}: ${d.question}`]
        : []
    })
}

/**
 * What changed while the viewer was away, most pressing first: decisions, then new results, then what blocks or needs
 * someone, then the rest. A few phrases are said; the rest are counted, and kept to be read in full on request.
 */
export function whileAway(
  rows: readonly PlanRow[],
  decisions: readonly BoardDecision[],
  seen: Seen | null,
  viewerId: string | null,
  people: Record<string, Person> = {},
): { phrases: string[]; more: number; rest: string[] } {
  if (!seen) return { phrases: [], more: 0, rest: [] }
  const changed = changedSince(rows, seen)
  const moved = rows.filter((r) => changed.has(r.item.id))
  const resulted = moved.filter(
    (r) =>
      (resultsOf(r.view).current?.version_id ?? null) !== (seen.items[r.item.id]?.result ?? null) &&
      resultsOf(r.view).current,
  )
  const markSaid = (r: PlanRow) =>
    SAID[r.status.mark](
      r.item.purpose,
      r,
      r.status.mark === 'waiting' ? r.status.on?.id === viewerId : r.doer.person?.id === viewerId,
    )
  const all = [
    ...decisionsSaid(decisions, seen, viewerId, people),
    ...resulted.map((r) => `${r.item.purpose} has a new result: ${resultsOf(r.view).current?.version_id ?? ''}`),
    ...moved.filter((r) => !resulted.includes(r) && PRESSING.has(r.status.mark)).map(markSaid),
    ...moved.filter((r) => !resulted.includes(r) && !PRESSING.has(r.status.mark)).map(markSaid),
  ]
  return { phrases: all.slice(0, 3), more: Math.max(0, all.length - 3), rest: all.slice(3) }
}
