// Where a goal's plan goes next, said on the goal's second line (GoalCard): NEXT and its checkpoint, then the plan's
// revision and whether it is accepted, and its progress review (LFE-07.2, review.ts), quietly.
import { Tag } from '@sophia/ui'
import type { Resource } from '../../resources/resource.ts'
import { current, type WorkPlan } from './plan.ts'
import { reviewLine } from './review.ts'

interface Props {
  plan: WorkPlan | null
  now: Date
  people: Record<string, Resource['owner']>
  viewerId: string | null
}

export function PlanNext({ plan: given, now, people, viewerId }: Props) {
  const plan = current(given)
  if (!plan) return null
  const review = reviewLine(plan, viewerId, (id) => people[id]?.name ?? 'someone', now)
  return (
    <p className="plan-next">
      <span className="field-label">Next</span>
      <span className="plan-next-label">{plan.next_checkpoint?.label ?? 'No checkpoint set'}</span>
      <span className="plan-next-plan">
        <span className="field-label">Plan</span>
        <span className="count">r{plan.revision}</span>
        {plan.state === 'accepted' ? <Tag tone="teal">Accepted</Tag> : <Tag tone="amber">Proposed</Tag>}
      </span>
      {review && (
        <span className="plan-next-review" data-kind={review.kind}>
          {review.kind === 'running' && <span className="activity-dot" aria-hidden />}
          {review.text}
        </span>
      )}
    </p>
  )
}
