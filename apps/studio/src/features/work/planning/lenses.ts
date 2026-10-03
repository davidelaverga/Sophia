// The board's lenses (Lens.tsx): what each shows. A lens dims the rest; it never moves a task.
import type { PlanRow } from './plan.ts'

export type LensName = 'all' | 'mine' | 'waiting' | 'open'
export const LENSES: readonly LensName[] = ['all', 'mine', 'waiting', 'open']
export const LABEL: Record<LensName, string> = { all: 'All', mine: 'For you', waiting: 'Waiting', open: 'Open' }

/** Whether a lens shows a task: for you, what you do or what waits on you; waiting and open, by their mark. */
export function shows(lens: LensName, row: PlanRow, viewerId: string | null): boolean {
  if (lens === 'mine') return row.doer.person?.id === viewerId
  if (lens === 'waiting') return row.status.mark === 'waiting'
  if (lens === 'open') return row.status.mark === 'free'
  return true
}
