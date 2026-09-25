import type { Goal } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { GOAL_STATUS } from './labels.ts'
import { WorkControls } from './WorkControls.tsx'

interface Props {
  goal: Goal
  projectId: string
  identity: Identity
  /** The Work view carries the controls; the Goals view reads outcomes and criteria only. */
  controls?: boolean
}

export function GoalCard({ goal, projectId, identity, controls = true }: Props) {
  const status = GOAL_STATUS[goal.status]
  return (
    <article className="goal">
      <div className="goal-head">
        <Tag tone={status.tone}>{status.label}</Tag>
        <span className="mono muted" title="Goal revision · authority epoch">
          rev {goal.revision} · epoch {goal.authorityEpoch}
        </span>
      </div>
      <h3>{goal.title}</h3>
      <p className="outcome-text">{goal.outcome}</p>
      {goal.criteria.length > 0 && (
        <ul className="criteria">
          {goal.criteria.map((c) => (
            <li key={c.id}>
              <span>{c.description}</span>
              {c.required && <span className="muted"> · required</span>}
            </li>
          ))}
        </ul>
      )}
      {controls && <WorkControls goal={goal} projectId={projectId} identity={identity.name} token={identity.token} />}
    </article>
  )
}
