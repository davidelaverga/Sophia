import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { EmptyState, Skeleton } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { goalReports } from './goal-reports.ts'
import { TaskCard } from '../conversation/TaskCard.tsx'
import { workHeading } from '../conversation/conversation-view.ts'
import { GoalTabs } from './GoalTabs.tsx'
import { GoalCard } from './GoalCard.tsx'
import { DECISION, GOAL, TASK } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
import { moving } from '../resources/motion.ts'
import { answers, SearchQuery, TaskSearch } from './TaskSearch.tsx'
import { GoalsOverview } from './GoalsOverview.tsx'
import type { GoalGlance } from './goals-glance.ts'
import type { Ask } from './planning/plan.ts'
import type { OpenDecision } from './planning/decision-alert.ts'

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
  /** Its decisions' ids: an address naming one (`#decision-<id>`, from Home) chooses this goal too (Codex on #245). */
  decisions?: readonly string[]
  /** Whether something in it waits on the viewer: another goal's board then links to it, without switching to it. */
  attention?: boolean
  /**
   * The decisions in it waiting on the viewer, a proposed plan's included: counted in the tab and heard while it is
   * hidden (decision-alert.md).
   */
  toDecide?: readonly OpenDecision[]
  /** Goals: its tasks' lanes, who is on it and what is in its way (`glanceOf`, goals-overview.md). */
  glance?: GoalGlance
  /** Goals: its plan's next checkpoint, in words. */
  checkpoint?: string | undefined
  /** Goals: what in it waits on the viewer (`asksOf`), each a press to it in Tasks. */
  asks?: readonly Ask[]
  /** The project's search: its tasks by purpose and doer (search-goals.md). */
  tasksFound?: readonly { id: string; purpose: string; doer: string }[]
}

interface Props {
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
  /** The Tasks view: goals with their controls. */
  controls: boolean
  /** Editors and admins act on goals and invite; viewers read. */
  canAct: boolean
  /** A project admin: only they retire a completed goal's remaining sessions (A41). */
  admin?: boolean | undefined
  onOpenStudio: () => void
  onInvite: () => void
  /** Tasks: each goal's plan, by the goal's id, shown inside that goal's row (LFE-07.1). */
  plans?: Readonly<Record<string, GoalPlan>> | undefined
  /** Tasks: what Sophia offers to start under a goal (the source-review pilot, WBC-02), under its plan. */
  entry?: ((goal: Goal) => React.ReactNode) | undefined
  /** Tasks: the plans' board couldn't be read, none read before: said, with Try again (silent-views.md). */
  boardFailed?: boolean
  onRetryBoard?: (() => void) | undefined
  /** Goals: the goals as an overview (GoalsOverview), each plan read at a glance, its board left to Tasks, where
   * `onOpenGoal` takes the goal. */
  summary?: boolean
  /** Tasks, with what is named in the address: the goal (`#goal-`), or a task or decision in it. */
  onOpenGoal?: ((id: string, address?: string) => void) | undefined
  /** Goals' notes: the viewer's actor id, and the names the Studio knows (goal-notes.md). */
  me?: string | undefined
  names?: ReadonlyMap<string, string> | undefined
}

/** The goal whose plan has a task, by its id; undefined when none has. */
const goalOf = (plans: Props['plans'], task: string | null) =>
  task ? Object.entries(plans ?? {}).find(([, p]) => p.tasks?.includes(task))?.[0] : undefined

/** The goal whose plan holds a decision, by its id; undefined when none does. */
const goalOfDecision = (plans: Props['plans'], decision: string | null) =>
  decision ? Object.entries(plans ?? {}).find(([, p]) => p.decisions?.includes(decision))?.[0] : undefined

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
function followedOf(seq: number, addressed: string | undefined, tabbed: readonly Goal[]) {
  return {
    seq,
    found: addressed !== undefined,
    hidden: Boolean(addressed && !tabbed.some((g) => g.id === addressed)),
  }
}

/**
 * Each time an address is followed, a search hiding its goal is cleared once what it names is on a plan, which may
 * arrive later: until then the address waits, and a search typed while it waits gives way too. One typed after is kept.
 * The address the page opens with is followed too: none is handled yet.
 */
function useClearHiding(followed: ReturnType<typeof followedOf>, setQuery: (q: string) => void) {
  const handled = useRef<number | null>(null)
  useEffect(() => {
    if (handled.current === followed.seq || !followed.found) return
    handled.current = followed.seq
    if (followed.hidden) setQuery('')
  }, [followed.seq, followed.found, followed.hidden, setQuery])
}

/**
 * Several goals with plans: one at a time, chosen from the rail, so a project with many goals stays calm. A search
 * narrows the rail to the goals whose title, outcome or tasks answer it.
 */
/** A goal named in the address (Goals' «Open in Tasks») chooses it, as a task or a decision does (goals-progress.md). */
function useGoalAddressed(plans: Props['plans'], choose: (id: string) => void, seq: number) {
  const addressed = useAddressed(GOAL)
  const named = addressed.id !== null && plans?.[addressed.id] ? addressed.id : null
  const latest = useRef(choose)
  latest.current = choose
  useEffect(() => {
    if (named) latest.current(named)
  }, [named, addressed.seq, seq])
}

function useChosenGoal(snapshot: Snapshot | undefined, plans: Props['plans'], query: string) {
  const tabbed = (snapshot?.goals ?? []).filter((g) => {
    const plan = plans?.[g.id]
    return plan !== undefined && answers(query, g.title, g.outcome, plan.words)
  })
  // An address naming a task chooses its goal, so the task opens on its board: when the page opens, when plans
  // arrive, and each time a link is followed. A goal chosen from the rail holds until the address is followed again.
  const named = useAddressed(TASK)
  const [chosen, setChosen] = useState<{ id: string; seq: number } | null>(null)
  // A decision named in the address chooses its goal, so its board is mounted to open it (the board's own slot); the
  // choice holds after the board lets the address go, as a goal chosen from the rail does (Codex on #245).
  const decided = useAddressed(DECISION)
  const decidedGoal = goalOfDecision(plans, decided.id)
  useEffect(() => {
    if (decidedGoal) setChosen({ id: decidedGoal, seq: named.seq })
  }, [decidedGoal, decided.seq, named.seq])
  useGoalAddressed(plans, (id) => setChosen({ id, seq: named.seq }), named.seq)
  const goal = (chosen?.seq === named.seq ? chosen.id : null) ?? goalOf(plans, named.id)
  const shown = tabbed.length > 1 ? (tabbed.find((g) => g.id === goal) ?? tabbed[0]) : null
  const anyPlan = Object.keys(plans ?? {}).length > 0
  const listed = listedGoals(snapshot?.goals ?? [], shown ?? null, tabbed, plans, query)
  return {
    tabbed,
    shown,
    listed,
    anyPlan,
    followed: followedOf(named.seq, goalOf(plans, named.id), tabbed),
    // A decision named too: a search hiding its goal gives way, so its board and choices mount (Codex on #245).
    decisionFollowed: followedOf(decided.seq, decidedGoal, tabbed),
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

/**
 * The board unread, with goals it would plan: said, never shown as goals with no plan, with the way to read it again.
 * The area's words and idiom (GoalsOverview's dates, GoalTargets' owner and date).
 */
function BoardFailed({
  failed,
  snapshot,
  onRetry,
}: {
  failed: boolean | undefined
  snapshot: Snapshot | undefined
  onRetry: (() => void) | undefined
}) {
  if (!failed || !snapshot?.goals.length) return null
  return (
    <p className="view-note" role="alert">
      The tasks can’t be read right now.{' '}
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </p>
  )
}

/** Tasks' search, when it leaves no goal and no task. */
function NoAnswer({ found, query }: { found: boolean; query: string }) {
  if (found || !query) return null
  return <EmptyState>No goal or task answers “{query}”. Escape clears the search.</EmptyState>
}

/** The plans Tasks draws: Goals reads each at a glance, and only Tasks draws the boards, the rail and their search. */
const drawn = (summary: boolean | undefined, given: Props['plans']) => (summary ? undefined : given)

interface ListedProps extends Pick<
  Props,
  'snapshot' | 'projectId' | 'identity' | 'entry' | 'onOpenGoal' | 'me' | 'names'
> {
  summary: boolean | undefined
  controls: boolean
  admin: boolean
  /** Every plan as served; `plans`, those Tasks draws. */
  given: Props['plans']
  plans: Props['plans']
  listed: readonly Goal[]
  query: string
}

/** Goals: the overview. Tasks: each goal with its plan under it, as the search leaves them. */
const NO_NAMES: ReadonlyMap<string, string> = new Map()

function Listed({ snapshot, projectId, identity, entry, onOpenGoal, summary, controls, admin, ...shown }: ListedProps) {
  const { given, plans, listed, query, me, names } = shown
  // With no goal yet, the view's empty state says so alone: no brief, no list, no search (goals-overview.md).
  if (summary) {
    if (!snapshot?.goals.length) return null
    const notes = { projectId, identity, me: me ?? '', names: names ?? NO_NAMES, cursor: snapshot.cursor }
    const reports = (goalId: string) => goalReports(goalId, snapshot.work, snapshot.artifacts)
    return (
      <GoalsOverview goals={snapshot.goals} plans={given} notes={notes} onOpenGoal={onOpenGoal} reports={reports} />
    )
  }
  return (
    <SearchQuery.Provider value={query}>
      <ol className="goal-list">
        {listed.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            projectId={projectId}
            identity={identity}
            controls={controls}
            admin={admin}
            compact={plans?.[g.id] !== undefined}
            next={plans?.[g.id]?.next}
          >
            {plans?.[g.id]?.view}
            {entry?.(g)}
          </GoalCard>
        ))}
      </ol>
    </SearchQuery.Provider>
  )
}

export function GoalList({
  snapshot,
  projectId,
  identity,
  controls,
  canAct,
  admin,
  onOpenStudio,
  onInvite,
  plans: given,
  entry,
  boardFailed,
  onRetryBoard,
  summary,
  onOpenGoal,
  me,
  names,
}: Props) {
  const plans = drawn(summary, given)
  const [query, setQuery] = useState('')
  const { tabbed, shown, listed, anyPlan, choose, followed, decisionFollowed } = useChosenGoal(snapshot, plans, query)
  useClearHiding(followed, setQuery)
  useClearHiding(decisionFollowed, setQuery)
  return (
    <section className="goals" aria-labelledby="goals-title">
      <Head tasks={controls} anyPlan={anyPlan} snapshot={snapshot} query={query} onQuery={setQuery} />
      <BoardFailed failed={boardFailed} snapshot={snapshot} onRetry={onRetryBoard} />
      <NoAnswer found={!anyPlan || tabbed.length + listed.length > 0} query={query} />
      {!snapshot && <Skeleton label="Reading the goals…" />}
      {snapshot?.goals.length === 0 && <NoGoals canAct={canAct} onOpenStudio={onOpenStudio} onInvite={onInvite} />}
      {controls && !canAct && <ViewerNote snapshot={snapshot} />}
      {shown && <Rail goals={tabbed} shown={shown.id} plans={plans} onChoose={choose} />}
      <Listed
        {...{ snapshot, projectId, identity, entry, onOpenGoal, given, plans, listed, query, me, names }}
        summary={summary}
        controls={controls && canAct}
        admin={controls && canAct && admin === true}
      />
      {snapshot && <NativeTasks snapshot={snapshot} projectId={projectId} identity={identity} canAct={canAct} />}
    </section>
  )
}

/**
 * What waits on the viewer in the other goals: one compact line, each goal a press away. Nothing arriving there
 * switches the goal the viewer chose.
 */
function Elsewhere({
  goals,
  shown,
  plans,
  onChoose,
}: {
  goals: readonly Goal[]
  shown: string
  plans: Props['plans']
  onChoose: (id: string) => void
}) {
  const others = goals.filter((g) => g.id !== shown && plans?.[g.id]?.attention)
  if (others.length === 0) return null
  return (
    <p className="goal-elsewhere">
      <span className="field-label">Also for you</span>
      {others.map((g) => (
        <button key={g.id} type="button" className="text-button" onClick={() => onChoose(g.id)}>
          {g.title}
        </button>
      ))}
    </p>
  )
}

interface RailProps {
  goals: readonly Goal[]
  shown: string
  plans: Props['plans']
  onChoose: (id: string) => void
}

/** The goals' rail, and under it what waits on the viewer in the goals not shown. */
function Rail({ goals, shown, plans, onChoose }: RailProps) {
  return (
    <>
      <GoalTabs
        goals={goals}
        tabs={Object.fromEntries(goals.map((g) => [g.id, plans?.[g.id]?.tab]))}
        chosen={shown}
        onChoose={onChoose}
      />
      <Elsewhere goals={goals} shown={shown} plans={plans} onChoose={onChoose} />
    </>
  )
}

const GoalCount = ({ snapshot }: { snapshot: Snapshot | undefined }) =>
  snapshot ? <span className="count">{snapshot.goals.length}</span> : null

/** A viewer on Tasks is told who can act on the goals, once there are goals to act on. */
function ViewerNote({ snapshot }: { snapshot: Snapshot | undefined }) {
  if (!snapshot?.goals.length) return null
  return <p className="view-note">You’re a viewer. Editors and admins can pause, stop or ask for a review.</p>
}

/** Briefs and research from Sophia (A05, A11); their Hold and Stop are the goal controls above. */
function NativeTasks({
  snapshot,
  projectId,
  identity,
  canAct,
}: {
  snapshot: Snapshot
  projectId: string
  identity: Identity
  canAct: boolean
}) {
  if (snapshot.work.length === 0) return null
  return (
    <>
      <h3 className="view-subhead">{workHeading(snapshot.work)}</h3>
      <ol className="task-list">
        {snapshot.work.map((t) => (
          <TaskCard key={t.id} task={t} projectId={projectId} identity={identity} canAct={canAct} />
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
    <EmptyState
      actions={
        <>
          <button type="button" className="pill" onClick={onOpenStudio}>
            Open the Studio
          </button>
          {canAct && (
            <button type="button" className="pill" onClick={onInvite}>
              Invite people
            </button>
          )}
        </>
      }
    >
      No goals yet. They’ll come from your conversations with Sophia in the room.
    </EmptyState>
  )
}
