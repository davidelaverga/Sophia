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
  /** Its plan, inside its row so the two read as one (Tasks, LFE-07.1). */
  children?: React.ReactNode
  /** Its plan's next checkpoint, said on its second line (Tasks, compact). */
  next?: React.ReactNode
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

/**
 * The goal's second line, under its title. With its plan's next checkpoint (`next`): that line, and its outcome and
 * criteria behind one quiet press. Without: its outcome, its criteria behind the press.
 */
function SecondLine({ goal, next }: { goal: Goal; next?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const count = goal.criteria.length
  const criteria = count > 0 ? `${String(count)} ${count === 1 ? 'criterion' : 'criteria'}` : null
  const folded = next ? ['Outcome', criteria].filter(Boolean).join(' · ') : criteria
  return (
    <>
      <div className="goal-outcome-line">
        {next ?? <p className="goal-outcome">{goal.outcome}</p>}
        {folded && (
          <button
            type="button"
            className="ghost goal-criteria-button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {folded}
            <Icon name="chevron" size={12} />
          </button>
        )}
      </div>
      {open && next && <p className="goal-outcome goal-outcome-open">{goal.outcome}</p>}
      {open && count > 0 && <Criteria goal={goal} />}
    </>
  )
}

export function GoalCard(props: Props) {
  const { goal, projectId, identity, controls = true, compact = false, children, next } = props
  const status = GOAL_STATUS[goal.status]
  const tag = <Tag tone={status.tone}>{status.label}</Tag>
  return (
    <li className={compact ? 'goal compact' : 'goal'} data-status={goal.status}>
      {!compact && <div className="goal-meta">{tag}</div>}
      <h3 className="goal-title">
        {compact && tag}
        {goal.title}
      </h3>
      {compact ? (
        <SecondLine goal={goal} next={next} />
      ) : (
        <>
          <p className="goal-outcome">{goal.outcome}</p>
          {goal.criteria.length > 0 && <Criteria goal={goal} />}
        </>
      )}
      {controls && <WorkControls goal={goal} projectId={projectId} identity={identity.name} token={identity.token} />}
      {children}
    </li>
  )
}
