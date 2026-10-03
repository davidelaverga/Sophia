// Where a goal's plan goes next, said on the goal's second line (GoalCard): NEXT and its checkpoint, then the plan's
// revision and whether it is accepted, quietly; and, when a replacement is proposed, its revision beside it.
import { Tag } from '@sophia/ui'
import { proposed, shownPlan, type GoalView } from './plan.ts'

export function PlanNext({ goal }: { goal: GoalView | null }) {
  const shown = shownPlan(goal)
  if (!goal || !shown) return null
  const { plan, operable } = shown
  const replacement = operable ? proposed(goal)[0] : undefined
  return (
    <p className="plan-next">
      <span className="field-label">Next</span>
      <span className="plan-next-label">{goal.next_checkpoint?.label ?? 'No checkpoint set'}</span>
      <span className="plan-next-plan">
        <span className="field-label">Plan</span>
        <span className="count">r{plan.revision}</span>
        {operable ? <Tag tone="teal">Accepted</Tag> : <Tag tone="amber">Proposed</Tag>}
        {replacement && <Tag tone="amber">r{replacement.revision} proposed</Tag>}
      </span>
    </p>
  )
}
