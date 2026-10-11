// A plan in a few marks, for its goal's place in the rail (GoalRail): who works on it, as stacked pictures; how many
// tasks it has; and, when something waits on the one looking, an amber dot that says so.
import { Avatar } from '../../../app/Avatar.tsx'
import type { Resource } from '../../resources/resource.ts'
import { boardOf, forYou, laneOf, type GoalView } from './plan.ts'

type Person = Resource['owner']

interface Props {
  goal: GoalView
  resources: readonly Resource[]
  people: Record<string, Person>
  viewerId: string | null
  /** Now: a decision past its expiry isn't the viewer's to answer. */
  now: Date
}

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

export function PlanTab({ goal, resources, people, viewerId, now }: Props) {
  const board = boardOf(goal, { resources, people, viewerId })
  if (!board) return null
  const { rows } = board
  const faces = [...new Map(rows.flatMap((r) => (r.doer.person ? [[r.doer.person.id, r.doer.person]] : []))).values()]
  const mine = board.operable && forYou(rows, goal.decisions, viewerId, now)
  const blocked = rows.filter((r) => laneOf(r, rows) === 'blocked').length
  return (
    <span className="plan-tab">
      <span className="plan-tab-faces" aria-hidden>
        {faces.slice(0, 3).map((p) => (
          <Avatar key={p.id} identity={face(p)} />
        ))}
      </span>
      <span className="plan-tab-count">
        {rows.length} {rows.length === 1 ? 'task' : 'tasks'}
      </span>
      {blocked > 0 && <span className="plan-tab-blocked">{blocked} blocked</span>}
      {mine && <span className="plan-tab-mine">for you</span>}
    </span>
  )
}
