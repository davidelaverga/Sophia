// Acting on a task from its sheet, without leaving it (LFE-06.4, 07.3): the acts on the session doing it
// (SessionActs, shared with a resource's sheet), for its owner; anyone else is told whose they are. The board keeps
// each session's last act (useActs), so it is still said after J or K turn the sheet.
import { SessionActs, type Acts, type ActAsked, type ActStep } from '../../resources/SessionActs.tsx'
import type { PlanRow } from './plan.ts'

/** Sends an act on a task's session; `report` is called with each step as it is observed. */
export type Act = (row: PlanRow, act: ActAsked, report: (step: ActStep) => void) => void

interface Props {
  row: PlanRow
  viewerId: string | null
  acts?: Acts | undefined
}

export function TaskActions({ row, viewerId, acts }: Props) {
  const { resource, session } = row.doer
  if (!acts || !resource || !session) return null
  if (resource.owner.id !== viewerId) {
    return <p className="act-note muted">{resource.owner.name} steers, holds or stops their own sessions.</p>
  }
  return (
    <section className="sheet-section task-actions">
      <h3>Act on it</h3>
      <SessionActs resource={resource} session={session} acts={acts} />
    </section>
  )
}
