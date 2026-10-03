import { useState } from 'react'
import type { Goal } from '@sophia/contracts'
import { Icon, Tag } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { GOAL_STATUS } from './labels.ts'
import { WorkControls } from './WorkControls.tsx'

interface Props {
  goal: Goal
  projectId: string
  identity: Identity
  /** The Tasks view carries the controls, for editors and admins; the Goals view reads outcomes only. */
  controls?: boolean
  /**
   * With its plan under it (Tasks, LFE-07.1): its status beside its title, and its criteria folded into one line, so
   * the plan is what reads first. The Goals view shows them open.
   */
  compact?: boolean
}

function Criteria({ goal }: { goal: Goal }) {
  return (
    <ul className="criteria">
      {goal.criteria.map((c) => (
        <li key={c.id}>
          <span>{c.description}</span>
          {c.required && <span className="required"> · required</span>}
        </li>
      ))}
    </ul>
  )
}

/** Its criteria behind one quiet line, "2 criteria", opened on request. */
function FoldedCriteria({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="ghost goal-criteria-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {goal.criteria.length} {goal.criteria.length === 1 ? 'criterion' : 'criteria'}
        <Icon name="chevron" size={12} />
      </button>
      {open && <Criteria goal={goal} />}
    </>
  )
}

export function GoalCard({ goal, projectId, identity, controls = true, compact = false }: Props) {
  const status = GOAL_STATUS[goal.status]
  const tag = <Tag tone={status.tone}>{status.label}</Tag>
  return (
    <li className={compact ? 'goal compact' : 'goal'} data-status={goal.status}>
      {!compact && <div className="goal-meta">{tag}</div>}
      <h3 className="goal-title">
        {compact && tag}
        {goal.title}
      </h3>
      <p className="goal-outcome">{goal.outcome}</p>
      {goal.criteria.length > 0 && (compact ? <FoldedCriteria goal={goal} /> : <Criteria goal={goal} />)}
      {controls && <WorkControls goal={goal} projectId={projectId} identity={identity.name} token={identity.token} />}
    </li>
  )
}
