import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { TaskCard } from '../conversation/TaskCard.tsx'
import { GoalTabs } from './GoalTabs.tsx'
import { GoalCard } from './GoalCard.tsx'
import { moving } from '../resources/motion.ts'
import { answers, SearchQuery, TaskSearch } from './TaskSearch.tsx'

/** A goal's plan from the lead: its view, and the few marks that stand for it in the goals' rail. */
export interface GoalPlan {
  view: React.ReactNode
  tab?: React.ReactNode
  /** What a search can find it by: its tasks and who does them. */
  words?: string
  /** Its next checkpoint, said on the goal's second line. */
  next?: React.ReactNode
}

interface Props {
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
  /** The Tasks view: goals with their controls. */
  controls: boolean
  /** Editors and admins act on goals and invite; viewers read. */
  canAct: boolean
  onOpenStudio: () => void
  onInvite: () => void
  /** Tasks: each goal's plan, by the goal's id, shown inside that goal's row (LFE-07.1). */
  plans?: Readonly<Record<string, GoalPlan>> | undefined
}

/**
 * Several goals with plans: one at a time, chosen from the rail, so a project with many goals stays calm. A search
 * narrows the rail to the goals whose title, outcome or tasks answer it.
 */
function useChosenGoal(snapshot: Snapshot | undefined, plans: Props['plans'], query: string) {
  const tabbed = (snapshot?.goals ?? []).filter((g) => {
    const plan = plans?.[g.id]
    return plan !== undefined && answers(query, g.title, g.outcome, plan.words)
  })
  const [chosen, setChosen] = useState<string | null>(null)
  const shown = tabbed.length > 1 ? (tabbed.find((g) => g.id === chosen) ?? tabbed[0]) : null
  const anyPlan = Object.keys(plans ?? {}).length > 0
  // With plans, a goal answers a search or steps out of the list; without, every goal stays.
  const listed = (snapshot?.goals ?? []).filter((g) => (shown ? g.id === shown.id : !anyPlan || tabbed.includes(g)))
  // The board glides from one goal's plan to the other's (View Transitions, as Resources' filters).
  return { tabbed, shown, listed, anyPlan, choose: (id: string) => moving(() => setChosen(id)) }
}

/** The view's head: its name, then its goals' count, or, with plans, the search. */
function Head(props: {
  tasks: boolean
  anyPlan: boolean
  snapshot: Snapshot | undefined
  query: string
  onQuery: (q: string) => void
}) {
  return (
    <header className="view-head">
      <h2 id="goals-title">{props.tasks ? 'Tasks' : 'Goals'}</h2>
      {/* It counts goals: under a plan, its tasks are counted in the plan's own head instead. */}
      {props.anyPlan ? (
        <TaskSearch query={props.query} onChange={props.onQuery} />
      ) : (
        <GoalCount snapshot={props.snapshot} />
      )}
    </header>
  )
}

export function GoalList({ snapshot, projectId, identity, controls, canAct, onOpenStudio, onInvite, plans }: Props) {
  const planned = (id: string) => plans?.[id]?.view
  const [query, setQuery] = useState('')
  const { tabbed, shown, listed, anyPlan, choose } = useChosenGoal(snapshot, plans, query)
  return (
    <section className="goals" aria-labelledby="goals-title">
      <Head tasks={controls} anyPlan={anyPlan} snapshot={snapshot} query={query} onQuery={setQuery} />
      {anyPlan && query && tabbed.length === 0 && (
        <p className="view-note">No goal or task answers “{query}”. Escape clears the search.</p>
      )}
      {!snapshot && <div className="goal skeleton" aria-busy="true" />}
      {snapshot?.goals.length === 0 && <NoGoals canAct={canAct} onOpenStudio={onOpenStudio} onInvite={onInvite} />}
      {controls && !canAct && <ViewerNote snapshot={snapshot} />}
      {shown && (
        <GoalTabs
          goals={tabbed}
          tabs={Object.fromEntries(tabbed.map((g) => [g.id, plans?.[g.id]?.tab]))}
          chosen={shown.id}
          onChoose={choose}
        />
      )}
      <SearchQuery.Provider value={query}>
        <ol className="goal-list">
          {listed.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              projectId={projectId}
              identity={identity}
              controls={controls && canAct}
              compact={plans?.[g.id] !== undefined}
              next={plans?.[g.id]?.next}
            >
              {planned(g.id)}
            </GoalCard>
          ))}
        </ol>
      </SearchQuery.Provider>
      {snapshot && <NativeTasks snapshot={snapshot} projectId={projectId} identity={identity} />}
    </section>
  )
}

const GoalCount = ({ snapshot }: { snapshot: Snapshot | undefined }) =>
  snapshot ? <span className="count">{snapshot.goals.length}</span> : null

/** A viewer on Tasks is told who can act on the goals, once there are goals to act on. */
function ViewerNote({ snapshot }: { snapshot: Snapshot | undefined }) {
  if (!snapshot?.goals.length) return null
  return <p className="view-note">You’re a viewer. Editors and admins can pause, stop or ask for a review.</p>
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
