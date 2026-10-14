// The newcomer's welcome (docs/plans/newcomer-welcome.md): kept at the door when a member's invitation is accepted, read
// back once in the project just joined, and the band's words. Session storage only: a refused store keeps nothing.

export interface Welcome {
  projectId: string
  /** Who invited them, as the invitation names them; null when it doesn't. */
  inviter: string | null
  role: 'editor' | 'viewer'
  /** When they joined (ms). */
  at: number
}

/** Past this, a welcome is not news: it ends on its own. */
export const WELCOME_DAYS = 7

const KEY = 'sophia.welcome'

const isWelcome = (value: unknown): value is Welcome =>
  typeof value === 'object' &&
  value !== null &&
  'projectId' in value &&
  typeof value.projectId === 'string' &&
  'at' in value &&
  typeof value.at === 'number' &&
  'role' in value &&
  (value.role === 'editor' || value.role === 'viewer')

/** Kept as the door opens the project. */
export function rememberWelcome(welcome: Welcome): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(welcome))
  } catch {
    // Storage refused: no welcome, nothing else changes.
  }
}

export function readWelcome(): Welcome | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    return isWelcome(value) ? value : null
  } catch {
    return null
  }
}

/** Ended by either press: it never comes back. */
export function endWelcome(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing kept, nothing to end.
  }
}

/** The welcome for this project, while it is news; null for any other project, or once a week has passed. */
export function welcomeFor(kept: Welcome | null, projectId: string, now: number): Welcome | null {
  if (!kept || kept.projectId !== projectId) return null
  return now - kept.at <= WELCOME_DAYS * 86_400_000 ? kept : null
}

/** The band's words: the title, who brought them and as what, what the project is for, its goals in a word. */
export function welcomeWords(welcome: Welcome, project: { title: string; purpose: string | null; goals: number }) {
  const as = welcome.role === 'viewer' ? 'a viewer' : 'an editor'
  const goals = project.goals
  return {
    title: `Welcome to “${project.title}”`,
    who: welcome.inviter ? `${welcome.inviter} invited you as ${as}.` : `You joined as ${as}.`,
    forWhat: project.purpose,
    goals: goals === 0 ? 'No goals yet' : `${String(goals)} ${goals === 1 ? 'goal' : 'goals'}`,
  }
}
