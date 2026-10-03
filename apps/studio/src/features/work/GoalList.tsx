import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { TaskCard } from '../conversation/TaskCard.tsx'
import { GoalTabs } from './GoalTabs.tsx'
import { GoalCard } from './GoalCard.tsx'
import { TASK } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
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
  /** Its tasks' ids: an address naming one of them (`#task-<id>`) chooses this goal. */
  tasks?: readonly string[]
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

/** The goal whose plan has a task, by its id; undefined when none has. */
const goalOf = (plans: Props['plans'], task: string | null) =>
  task ? Object.entries(plans ?? {}).find(([, p]) => p.tasks?.includes(task))?.[0] : undefined

type Goal = Snapshot['goals'][number]

/**
 * The goals listed under the rail: the one chosen, with its plan, then every goal without a plan (they keep their row,
 * their review, Hold and Stop), each as the search allows. Without plans, every goal stays.
 */
function listedGoals(
  goals: readonly Goal[],
  shown: Goal | null,
  tabbed: readonly Goal[],
  plans: Props['plans'],
  query: string,
) {
  const anyPlan = Object.keys(plans ?? {}).length > 0
  const unplanned = (g: Goal) => plans?.[g.id] === undefined
  const kept = (g: Goal) => (shown ? g.id === shown.id : !anyPlan || tabbed.includes(g))
  return goals
    .filter((g) => kept(g) || (unplanned(g) && answers(query, g.title, g.outcome)))
    .toSorted((a, b) => Number(unplanned(a)) - Number(unplanned(b)))
}

/**
 * A followed address: whether its task is on a plan yet (one may arrive after the address), and whether the search
 * hides its task's goal (it then gives way, so the task opens).
 */
function followedOf(named: { id: string | null; seq: number }, plans: Props['plans'], tabbed: readonly Goal[]) {
  const addressed = goalOf(plans, named.id)
  return {
    seq: named.seq,
    found: addressed !== undefined,
    hidden: Boolean(addressed && !tabbed.some((g) => g.id === addressed)),
  }
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
  // An address naming a task chooses its goal, so the task opens on its board: when the page opens, when plans
  // arrive, and each time a link is followed. A goal chosen from the rail holds until the address is followed again.
  const named = useAddressed(TASK)
  const [chosen, setChosen] = useState<{ id: string; seq: number } | null>(null)
  const goal = (chosen?.seq === named.seq ? chosen.id : null) ?? goalOf(plans, named.id)
  const shown = tabbed.length > 1 ? (tabbed.find((g) => g.id === goal) ?? tabbed[0]) : null
  const anyPlan = Object.keys(plans ?? {}).length > 0
  const listed = listedGoals(snapshot?.goals ?? [], shown ?? null, tabbed, plans, query)
  return {
    tabbed,
    shown,
    listed,
    anyPlan,
    followed: followedOf(named, plans, tabbed),
    // The board glides from one goal's plan to the other's (View Transitions, as Resources' filters).
    choose: (id: string) => moving(() => setChosen({ id, seq: named.seq })),
  }
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
  const { tabbed, shown, listed, anyPlan, choose, followed } = useChosenGoal(snapshot, plans, query)
  // Each time an address is followed, a search hiding its task's goal is cleared once its task is on a plan, which may
  // arrive later: until then the address waits, and a search typed while it waits gives way too. One typed after is kept.
  // The address the page opens with is followed too: none is handled yet.
  const handled = useRef<number | null>(null)
  useEffect(() => {
    if (handled.current === followed.seq || !followed.found) return
    handled.current = followed.seq
    if (followed.hidden) setQuery('')
  }, [followed.seq, followed.found, followed.hidden])
  return (
    <section className="goals" aria-labelledby="goals-title">
      <Head tasks={controls} anyPlan={anyPlan} snapshot={snapshot} query={query} onQuery={setQuery} />
      {anyPlan && query && tabbed.length === 0 && listed.length === 0 && (
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
