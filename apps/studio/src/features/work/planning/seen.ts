// What changed in a plan since its viewer last looked (LFE-09's "useful return", kept in this browser): where each task
// stood when they marked it seen. A task whose mark moved, or that is new, has changed. A first visit remembers the
// plan as it is and says nothing changed. Kept per plan and per viewer; a browser that refuses storage just forgets.
import type { Mark, PlanRow } from './plan.ts'

type Seen = Record<string, Mark>

const key = (planId: string, viewerId: string | null) => `sophia.plan.seen.v1.${planId}.${viewerId ?? 'anyone'}`

const isSeen = (value: unknown): value is Seen =>
  typeof value === 'object' && value !== null && Object.values(value).every((v) => typeof v === 'string')

export function readSeen(planId: string, viewerId: string | null): Seen | null {
  try {
    const raw = localStorage.getItem(key(planId, viewerId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isSeen(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeSeen(planId: string, viewerId: string | null, rows: readonly PlanRow[]): Seen {
  const seen = Object.fromEntries(rows.map((r) => [r.item.id, r.status.mark]))
  try {
    localStorage.setItem(key(planId, viewerId), JSON.stringify(seen))
  } catch {
    // Not kept: the next visit starts from here again.
  }
  return seen
}

/** The tasks that moved or arrived since `seen`; none when there is nothing to compare with. */
export const changedSince = (rows: readonly PlanRow[], seen: Seen | null): ReadonlySet<string> =>
  new Set(seen ? rows.filter((r) => seen[r.item.id] !== r.status.mark).map((r) => r.item.id) : [])

const SAID: Record<Mark, (task: string, who: string, yours: boolean) => string> = {
  waiting: (task, who, yours) => (yours ? `${task} now waits on you` : `${task} waits on ${who}`),
  working: (task) => `${task} started`,
  queued: (task) => `${task} is queued`,
  later: (task) => `${task} is up next`,
  free: (task) => `${task} is free to take`,
  finished: (task, who) => `${who} finished ${task}, not checked yet`,
  checked: (task) => `${task} was checked`,
}

/** One changed task, said in a few words from where it stands now: "Implement the PDF retry now waits on you". */
const said = (row: PlanRow, viewerId: string | null) =>
  SAID[row.status.mark](row.item.purpose, row.doer.person?.name ?? 'Someone', row.doer.person?.id === viewerId)

/** What changed while the viewer was away, as a few phrases, the most pressing first; the rest counted. */
export function whileAway(
  rows: readonly PlanRow[],
  changed: ReadonlySet<string>,
  viewerId: string | null,
): { phrases: string[]; more: number } {
  const moved = rows.filter((r) => changed.has(r.item.id))
  return { phrases: moved.slice(0, 3).map((r) => said(r, viewerId)), more: Math.max(0, moved.length - 3) }
}
