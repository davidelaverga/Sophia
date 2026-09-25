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
      <header className="view-head">
        <h2 id="goals-title">{controls ? 'Work' : 'Goals'}</h2>
        {snapshot && <span className="count">{snapshot.goals.length}</span>}
      </header>
      {!snapshot && <div className="goal skeleton" aria-busy="true" />}
      {snapshot?.goals.length === 0 && <p className="empty">No goals yet.</p>}
      <ol className="goal-list">
        {snapshot?.goals.map((g) => (
          <GoalCard key={g.id} goal={g} projectId={projectId} identity={identity} controls={controls} />
        ))}
      </ol>
    </section>
  )
}
