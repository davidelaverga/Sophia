// The board's lenses (Lens.tsx): what each shows. A lens dims the rest; it never moves a task.
import { forViewer, type PlanRow } from './plan.ts'

export type LensName = 'all' | 'mine' | 'waiting' | 'unassigned'
export const LENSES: readonly LensName[] = ['all', 'mine', 'waiting', 'unassigned']
export const LABEL: Record<LensName, string> = {
  all: 'All',
  mine: 'For you',
  waiting: 'Waiting',
  unassigned: 'Unassigned',
}

/**
 * Whether a lens shows a task: for you, what a pending request asks of you or what you do by hand (owning the account
 * that runs it is not enough); waiting and unassigned, by their mark.
 */
export function shows(lens: LensName, row: PlanRow, viewerId: string | null): boolean {
  if (lens === 'mine') return forViewer(row, viewerId)
  if (lens === 'waiting') return row.status.mark === 'waiting'
  if (lens === 'unassigned') return row.status.mark === 'free'
  return true
}
