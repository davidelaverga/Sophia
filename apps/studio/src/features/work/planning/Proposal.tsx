// Replacements proposed beside the plan shown (WBC-01 G1): one quiet band each over the lanes, the shown plan staying
// the board. A view can carry up to three proposals, and each is shown (PR #76 review, P2): beside an accepted plan,
// each compared with it; with none accepted, the first proposal is the board, read only, and the others are "also
// proposed", compared with it. Each band says its proposal's revision and what it changes, and opens to the changes
// item by item. Nothing in a proposal is operated: it becomes the plan only once it is accepted.
import { useState } from 'react'
import { Icon } from '@sophia/ui'
import { changeSaid, compare } from './proposal.ts'
import type { WorkPlan } from './plan.ts'

interface Props {
  /** The plan shown as the board: the accepted one, or the first proposal while none is. */
  current: WorkPlan
  /** The other proposals, each compared with `current`. */
  proposals: readonly WorkPlan[]
  /** Whether `current` is in force: the others are then replacements, else proposals beside it. */
  operable: boolean
}

export function ProposalBand({ current, proposals, operable }: Props) {
  return proposals.map((p) => (
    <OneProposal key={`${p.plan_id}:${String(p.revision)}`} current={current} next={p} operable={operable} />
  ))
}

function OneProposal({ current, next, operable }: { current: WorkPlan; next: WorkPlan; operable: boolean }) {
  const [open, setOpen] = useState(false)
  const change = compare(current, next)
  const goal = next.goal_revision === current.goal_revision ? null : `for goal revision ${String(next.goal_revision)}`
  return (
    <div className="board-proposal">
      <button type="button" className="ghost board-proposal-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="field-label">{operable ? 'Proposed' : 'Also proposed'}</span>
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
