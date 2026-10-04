// Where a goal's plan goes next, said on the goal's second line (GoalCard): NEXT and its checkpoint, then the plan's
// revision and whether it is accepted, quietly; when a replacement is proposed, its revision beside it; and its progress
// review (LFE-07.2, review.ts), read beside the board's view, never as part of the plan.
import { Tag } from '@sophia/ui'
import type { Resource } from '../../resources/resource.ts'
import { proposed, shownPlan, type GoalView } from './plan.ts'
import { reviewLine, type Reviewed } from './review.ts'

interface Props {
  goal: GoalView | null
  /**
   * Its plan's progress review, as read now with the plan in force's revision: what the line compares it with, as the
   * review's card does, never the revision shown here when it is only proposed (Codex F-006). Absent, nothing is said.
   */
  review?: Reviewed | undefined
  now: Date
  people: Record<string, Resource['owner']>
  viewerId: string | null
}

export function PlanNext({ goal, review, now, people, viewerId }: Props) {
  const shown = shownPlan(goal)
  if (!goal || !shown) return null
  const { plan, operable } = shown
  // Every other proposal, not only the first (PR #76 review, P2).
  const others = proposed(goal).filter((p) => p !== plan)
  const line = review ? reviewLine(review, viewerId, (id) => people[id]?.name ?? 'someone', now) : null
  return (
    <p className="plan-next">
      <span className="field-label">Next</span>
      <span className="plan-next-label">{goal.next_checkpoint?.label ?? 'No checkpoint set'}</span>
      <span className="plan-next-plan">
        <span className="field-label">Plan</span>
        <span className="count">r{plan.revision}</span>
        {operable ? <Tag tone="teal">Accepted</Tag> : <Tag tone="amber">Proposed</Tag>}
        {others.length > 0 && (
          <Tag tone="amber">
            {others.map((p) => `r${String(p.revision)}`).join(', ')} {operable ? 'proposed' : 'also proposed'}
          </Tag>
        )}
      </span>
      {line && (
        <span className="plan-next-review" data-kind={line.kind}>
          {line.kind === 'running' && <span className="activity-dot" aria-hidden />}
          {line.text}
        </span>
      )}
    </p>
  )
}
