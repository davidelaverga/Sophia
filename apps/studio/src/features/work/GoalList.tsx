import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { TaskCard } from '../conversation/TaskCard.tsx'
import { GoalCard } from './GoalCard.tsx'

interface Props {
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
  /** The Work view: goals with their controls. */
  controls: boolean
  /** Editors and admins act on goals and invite; viewers read. */
  canAct: boolean
  onOpenStudio: () => void
  onInvite: () => void
}

export function GoalList({ snapshot, projectId, identity, controls, canAct, onOpenStudio, onInvite }: Props) {
  return (
    <section className="goals" aria-labelledby="goals-title">
      <header className="view-head">
        <h2 id="goals-title">{controls ? 'Work' : 'Goals'}</h2>
        {snapshot && <span className="count">{snapshot.goals.length}</span>}
      </header>
      {!snapshot && <div className="goal skeleton" aria-busy="true" />}
      {snapshot?.goals.length === 0 && <NoGoals canAct={canAct} onOpenStudio={onOpenStudio} onInvite={onInvite} />}
      {controls && !canAct && snapshot && snapshot.goals.length > 0 && (
        <p className="view-note">You’re a viewer. Editors and admins can pause, stop or ask for a review.</p>
      )}
      <ol className="goal-list">
        {snapshot?.goals.map((g) => (
          <GoalCard key={g.id} goal={g} projectId={projectId} identity={identity} controls={controls && canAct} />
        ))}
      </ol>
      {snapshot && <NativeTasks snapshot={snapshot} projectId={projectId} identity={identity} />}
    </section>
  )
}

/** Briefs the runtime drafted (A05); their Hold and Stop are the goal controls above. */
function NativeTasks({ snapshot, projectId, identity }: { snapshot: Snapshot; projectId: string; identity: Identity }) {
  if (snapshot.work.length === 0) return null
  return (
    <>
      <h3 className="view-subhead">Briefs from Sophia’s runtime</h3>
      <ol className="task-list">
        {snapshot.work.map((t) => (
          <TaskCard key={t.id} task={t} projectId={projectId} identity={identity} />
        ))}
      </ol>
    </>
  )
}

/** Goals come from the conversation with Sophia: until then, the way forward is the room and the team. */
function NoGoals({
  canAct,
  onOpenStudio,
  onInvite,
}: {
  canAct: boolean
  onOpenStudio: () => void
  onInvite: () => void
}) {
  return (
    <div className="empty">
      <p>No goals yet. They’ll come from your conversations with Sophia in the room.</p>
      <div className="control-row">
        <button type="button" className="pill" onClick={onOpenStudio}>
          Open the Studio
        </button>
        {canAct && (
          <button type="button" className="pill" onClick={onInvite}>
            Invite people
          </button>
        )}
      </div>
    </div>
  )
}
