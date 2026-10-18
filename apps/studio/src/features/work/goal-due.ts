// A goal's target date against today (docs/plans/goal-overdue.md): overdue once its day has passed, due today on it,
// later before; nothing for a completed goal or one with no date. Calendar days, as A25 keeps them («2026-10-30»),
// compared with the viewer's own day. Pure, so the rule and its words are unit-tested.
import { dayOf } from './goal-day.ts'

export type Due = 'overdue' | 'today' | 'later'

/** The viewer's calendar day, as A25 writes one: «2026-11-02». */
export const todayOf = (now: Date): string =>
  `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export function dueOf(targetDate: string | null | undefined, today: string, done: boolean): Due | null {
  if (!targetDate || done) return null
  if (targetDate < today) return 'overdue'
  return targetDate === today ? 'today' : 'later'
}

/** «overdue since 30 Oct 2026», «due today», or «due 30 Oct 2026». */
export function dueWords(targetDate: string, due: Due | null): string {
  if (due === 'overdue') return `overdue since ${dayOf(targetDate)}`
  return due === 'today' ? 'due today' : `due ${dayOf(targetDate)}`
}
