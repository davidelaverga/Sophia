import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { GoalCard } from './GoalCard.tsx'

interface Props {
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
  controls: boolean
}

export function GoalList({ snapshot, projectId, identity, controls }: Props) {
  return (
    <section className="goals" aria-labelledby="goals-title">
      <div className="section-head">
        <h2 id="goals-title">Goals</h2>
        {snapshot && <span className="muted">{snapshot.goals.length}</span>}
      </div>
      {!snapshot && <div className="goal skeleton" aria-busy="true" />}
      {snapshot?.goals.length === 0 && <p className="empty">No goals yet.</p>}
      {snapshot?.goals.map((g) => (
        <GoalCard key={g.id} goal={g} projectId={projectId} identity={identity} controls={controls} />
      ))}
    </section>
  )
}
