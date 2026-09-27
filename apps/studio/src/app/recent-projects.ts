// The home screen's way back in: the projects this person opened on this device, newest first. The
// contract has no project list yet, so this stays in the browser, one list per identity.

export interface RecentProject {
  id: string
  title: string
  openedAt: number
}

export const RECENT_LIMIT = 5

/** The list with this project first (moved, never duplicated), capped at the limit. */
export function withRecent(list: readonly RecentProject[], entry: RecentProject): RecentProject[] {
  return [entry, ...list.filter((p) => p.id !== entry.id)].slice(0, RECENT_LIMIT)
}

/** "Today", "Yesterday", "3 days ago", then the date: when this device last opened the project. */
export function openedLabel(openedAt: number, now: number): string {
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(openedAt).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(openedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const keyFor = (identity: string) => `sophia.recent.v1.${identity}`

const isRecent = (v: unknown): v is RecentProject =>
  typeof v === 'object' &&
  v !== null &&
  'id' in v &&
  typeof v.id === 'string' &&
  'title' in v &&
  typeof v.title === 'string' &&
  'openedAt' in v &&
  typeof v.openedAt === 'number'

export function readRecent(identity: string): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyFor(identity)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, RECENT_LIMIT) : []
  } catch {
    return [] // storage unavailable or damaged: the home screen offers the other ways in
  }
}

function write(identity: string, list: readonly RecentProject[]): void {
  try {
    localStorage.setItem(keyFor(identity), JSON.stringify(list))
  } catch {
    // storage unavailable: nothing to remember, nothing breaks
  }
}

export function rememberProject(identity: string, entry: RecentProject): void {
  write(identity, withRecent(readRecent(identity), entry))
}

/** A project this identity can no longer open leaves the list, so the home never offers a closed door. */
export function forgetProject(identity: string, id: string): void {
  write(
    identity,
    readRecent(identity).filter((p) => p.id !== id),
  )
}
