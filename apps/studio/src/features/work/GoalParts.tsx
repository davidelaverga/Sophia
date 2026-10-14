// The pieces Goals' briefing and a goal's sheet share (docs/plans/goals-overview.md): what waits on the viewer, each
// with its press; a goal's progress as a hairline and «N of M»; the faces of who is on it.
import type { Goal } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { Avatar } from '../../app/Avatar.tsx'
import type { GoalGlance } from './goals-glance.ts'
import { progressOf, type Ask } from './planning/plan.ts'

export interface Asked {
  ask: Ask
  goal: Goal
}

/**
 * What waits on the viewer: each a sentence, who asks and for which goal (left out in the goal's own sheet), and its
 * press to Tasks. The first press is the primary; the rest are quiet.
 */
export function Asks({
  asks,
  onOpen,
  inGoal = false,
}: {
  asks: readonly Asked[]
  onOpen: ((ask: Ask) => void) | undefined
  inGoal?: boolean
}) {
  if (asks.length === 0) return null
  return (
    <ol className="goal-asks">
      {asks.map(({ ask, goal }, i) => (
        <li key={ask.id}>
          <span className="goal-ask-dot" aria-hidden />
          <div className="goal-ask-words">
            <p className="goal-ask-text">{ask.words}</p>
            <p className="goal-ask-meta">
              {[ask.by && `${ask.by} asks`, ask.kind === 'decision' && 'Your decision', !inGoal && goal.title]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {onOpen && (
            <Button kind={i === 0 ? 'primary' : 'pill'} size="sm" onClick={() => onOpen(ask)}>
              {ask.kind === 'request' ? 'Review' : 'Decide'}
            </Button>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Its progress: a hairline and «1 of 7»; a dash while it has no plan. */
export function Meter({ glance }: { glance: GoalGlance | undefined }) {
  const { done, total } = progressOf(glance?.lanes ?? [])
  return (
    <span className="goal-meter">
      {total > 0 ? (
        <>
          <span className="goal-track" aria-hidden>
            <span style={{ width: `${((done / total) * 100).toFixed(1)}%` }} />
          </span>
          <span className="goal-meter-count">
            {done} of {total}
          </span>
        </>
      ) : (
        <span className="goal-meter-count">—</span>
      )}
    </span>
  )
}

/** Who is on its unfinished tasks: three faces, then «+N». */
export function Faces({ glance }: { glance: GoalGlance | undefined }) {
  const people = glance?.people ?? []
  const more = people.length - 3
  return (
    <span
      className="goal-faces"
      aria-label={people.length > 0 ? `On it: ${people.map((p) => p.name).join(', ')}` : undefined}
    >
      {people.slice(0, 3).map((p) => (
        <Avatar key={p.id} identity={{ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null }} />
      ))}
      {more > 0 && <span className="goal-faces-more">+{more}</span>}
    </span>
  )
}
