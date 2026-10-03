// A plan in a few marks, for its goal's place in the rail (GoalRail): who works on it, as stacked pictures; how many
// tasks it has; and, when something waits on the one looking, an amber dot that says so.
import { Avatar } from '../../../app/Avatar.tsx'
import type { RequiredAction, Resource } from '../../resources/resource.ts'
import { current, forYou, planRows, type WorkPlan } from './plan.ts'

type Person = Resource['owner']

interface Props {
  plan: WorkPlan
  resources: readonly Resource[]
  people: Record<string, Person>
  viewerId: string | null
  /** The open requests: a task waits on the viewer only when one names them. */
  actions?: readonly RequiredAction[]
  /** Now: a decision past its expiry isn't the viewer's to answer. */
  now: Date
}

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

export function PlanTab({ plan: given, resources, people, viewerId, actions = [], now }: Props) {
  const plan = current(given)
  if (!plan) return null
  const rows = planRows(plan, resources, people, actions)
  const faces = [...new Map(rows.flatMap((r) => (r.doer.person ? [[r.doer.person.id, r.doer.person]] : []))).values()]
  const mine = forYou(rows, plan, viewerId, now)
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
      {mine && <span className="plan-tab-mine">for you</span>}
    </span>
  )
}
