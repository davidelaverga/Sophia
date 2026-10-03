// Where a goal's plan goes next, said on the goal's second line (GoalCard): NEXT and its checkpoint, then the plan's
// revision and whether it is accepted, quietly.
import { Tag } from '@sophia/ui'
import { current, type WorkPlan } from './plan.ts'

export function PlanNext({ plan: given }: { plan: WorkPlan | null }) {
  const plan = current(given)
  if (!plan) return null
  return (
    <p className="plan-next">
      <span className="field-label">Next</span>
      <span className="plan-next-label">{plan.next_checkpoint?.label ?? 'No checkpoint set'}</span>
      <span className="plan-next-plan">
        <span className="field-label">Plan</span>
        <span className="count">r{plan.revision}</span>
        {plan.state === 'accepted' ? <Tag tone="teal">Accepted</Tag> : <Tag tone="amber">Proposed</Tag>}
      </span>
    </p>
  )
}
