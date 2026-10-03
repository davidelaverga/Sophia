// A replacement proposed for the plan in force (WBC-01 G1): one quiet band over the lanes, the accepted plan staying
// the board. It says the proposal's revision and what it changes, and opens to the changes item by item. Nothing in a
// proposal is operated: it becomes the plan only once it is accepted.
import { useState } from 'react'
import { Icon } from '@sophia/ui'
import { changeSaid, compare } from './proposal.ts'
import type { WorkPlan } from './plan.ts'

export function ProposalBand({ current, proposals }: { current: WorkPlan; proposals: readonly WorkPlan[] }) {
  const [open, setOpen] = useState(false)
  const next = proposals.at(0)
  if (!next) return null
  const change = compare(current, next)
  const goal = next.goal_revision === current.goal_revision ? null : `for goal revision ${String(next.goal_revision)}`
  return (
    <div className="board-proposal">
      <button type="button" className="ghost board-proposal-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="field-label">Proposed</span>
        Plan r{next.revision}, not accepted yet{goal ? `, ${goal}` : ''} · {changeSaid(change)}
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <ul className="board-proposal-changes" aria-label={`What plan r${String(next.revision)} changes`}>
          {change.added.map((i) => (
            <li key={`added-${i.id}`}>
              <span className="field-label">Added</span> {i.purpose}
            </li>
          ))}
          {change.changed.map(({ item, what }) => (
            <li key={`changed-${item.id}`}>
              <span className="field-label">Changed</span> {item.purpose}{' '}
              <span className="muted">· {what.join(', ')}</span>
            </li>
          ))}
          {change.removed.map((i) => (
            <li key={`removed-${i.id}`}>
              <span className="field-label">Removed</span> {i.purpose}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
