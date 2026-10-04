// The plan's fixture page (e2e/work.spec.ts): the Studio's own ProjectShell on Tasks, with its goals served at fetch
// (fixture-api.ts) and each goal's plan in its slot, from a labelled simulated `sophia.work.board.v1` view
// (work-data.ts) that the page first passes through the Studio's own reader (readBoardView): a view it refuses is
// shown as refused, never drawn. The query string picks who is looking, `viewer=davide|luis|mara` (default: Luis;
// Mara is a viewer who reads); `case=…` a scenario (work-cases.ts); `proposed=1` (no plan accepted yet: the first
// goal's plan is proposed); `superseded=1` (none shows); `two=1` (a second goal, its plan proposed); `goals=6`;
// `many=1`; `unplanned=1`; `since=1` (an earlier look); `expired=1|state` (the decision waiting on Davide past its
// expiry, or marked expired); `odd-id=1` (its id with quotes and brackets); `conflict=1` and `unknown=1` (how a decision's
// answer comes back); `later=1` (the second goal's plan held back until `workFixture.arrive()`); `coverage=partial|
// unavailable`; and how the simulated services answer (work-live.ts: `admission=`, `settle=`, `ask=`, `result=`).
// `workFixture` moves the page on as a live service would: `settle(id)` records a choice and `react(id)` takes it
// into the plan's next revision; `begin(workId)`, `reassign(workId)`, `replan()`, `arrive()`, `viewAs(viewer)`,
// `reconnect()`, `replay(operationId)` and `misdeliver(from, to)`. Whoever does a task opens on the resources' fixture.
// `review=…` (LFE-07.2): how the lead answers the goal's Request review (work-review.ts), read beside the board's view;
// `workFixture.goalCommands` lists each goal command sent, with its key; `reviewAgain()` brings in a later review.
// `challenge=unknown|denied`: how a challenge to the lead's review comes back (recorded by default;
// `workFixture.challenges` lists each sent); `editor=0`: the viewer can't act on the work, so there is no Challenge.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { GoalCommand } from '@sophia/contracts'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import type { Command, Receipt } from '../src/features/resources/receipts.ts'
import { linkHash } from '../src/features/resources/link.ts'
import { moving } from '../src/features/resources/motion.ts'
import type { Resource } from '../src/features/resources/resource.ts'
import {
  readBoardView,
  type ActionKind,
  type BoardView,
  type GoalView,
  type ItemAction,
} from '../src/features/work/planning/board-view.ts'
import type { DecisionAnswer } from '../src/features/work/planning/Decision.tsx'
import type { Challenge } from '../src/features/work/planning/challenges.ts'
import { PlanBoard } from '../src/features/work/planning/PlanBoard.tsx'
import { PlanNext } from '../src/features/work/planning/PlanNext.tsx'
import { PlanTab } from '../src/features/work/planning/PlanTab.tsx'
import { boardOf, forYou } from '../src/features/work/planning/plan.ts'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import { SOPHIAS_DESCRIPTION, TITLE } from './report-data.ts'
import { NOW, observations, resources as owned, tightClaude } from './resources-data.ts'
import { inCase } from './work-cases.ts'
import {
  CASES,
  firstGoal,
  fixtureParts,
  goal,
  manyTasks,
  moreGoals,
  moreViews,
  people,
  secondGoal,
  secondView,
  unplannedGoal,
  type Viewer,
} from './work-data.ts'
import {
  ask,
  answers,
  carried,
  commands,
  decide,
  misdeliver,
  nextReport,
  questions,
  readResult,
  receipts,
  reconnect,
  replay,
  serve,
  withActivity,
} from './work-live.ts'
import { openedWith, reviewedAgain, reviewer, reviewMode } from './work-review.ts'
import type { Question } from '../src/features/work/planning/ask.ts'
import type { Reviewed } from '../src/features/work/planning/review.ts'

declare global {
  interface Window {
    workFixture?: {
      unexpected: readonly string[]
      /** Each answer a decider gave, in order, and each command and receipt: for the checks to read. */
      answered?: readonly DecisionAnswer[]
      /** Each question sent to the conversation, each send of it included. */
      questions?: readonly Question[]
      commands?: readonly Command[]
      receipts?: readonly Receipt[]
      /** Why the page's view was refused, when it was. */
      refused?: readonly string[]
      settle?: (decisionId: string) => void
      react?: (decisionId: string) => void
      begin?: (workId: string) => void
      reassign?: (workId: string) => void
      replan?: () => void
      arrive?: () => void
      viewAs?: (viewer: Viewer) => void
      reconnect?: () => void
      /** Each goal command sent (Request review, Hold, Stop), with its key (LFE-07.2). */
      goalCommands?: readonly { kind: string; key: string }[]
      replay?: (operationId: string) => void
      misdeliver?: (from: string, to: string) => void
      /** The service's next observation of a task: its lifecycle, or one action's availability for this viewer. */
      setLifecycle?: (workId: string, lifecycle: GoalView['items'][number]['lifecycle']) => void
      /** The same assignment and generation, its next attempt in another native session. */
      nextAttempt?: (workId: string) => void
      /** `missing`: the view offers the action no more; any other, it offers it so (added back when missing). */
      setAvailability?: (workId: string, kind: ActionKind, availability: Availability) => void
      /** A later review in the last one's place (LFE-07.2): it arrives with its card closed. */
      reviewAgain?: () => void
      challenges?: { review: string; text: string; key: string }[]
    }
  }
}

const query = new URLSearchParams(window.location.search)
/** `two=1`: a second goal with its own plan; `goals=6`: four more, to see the goals' rail scroll. */
const six = query.get('goals') === '6'
const two = six || query.get('two') === '1'
/** The goal's commands reach the lead's side once the page has made it (Tasks, below). */
let onGoalCommand: ((command: GoalCommand, key: string) => void) | null = null
installFixtureApi({
  onCommand: (command, key) => onGoalCommand?.(command, key),
  revision: 1,
  exchange: false,
  messages: [],
  goals: [
    goal,
    ...(two ? [secondGoal] : []),
    ...(six ? moreGoals : []),
    ...(query.get('unplanned') === '1' ? [unplannedGoal] : []),
  ],
  // The room page's report (SMC-M03), at rest: this page reads none of it.
  reportVersions: 1,
  reportTitle: TITLE,
  waiting: false,
  description: SOPHIAS_DESCRIPTION,
  versionsFail: false,
  sourcesHeld: false,
  textHeld: false,
  textTampered: false,
  work: false,
})
window.workFixture = { unexpected, answered: answers, commands, receipts, questions }
const nothing = () => undefined

/** `review=…`: how the lead answers Request review (work-review.ts). */
const reviewAs = reviewMode(query.get('review'))

const asViewer = (v: string | null): Viewer => (v === 'davide' || v === 'mara' ? v : 'luis')
const scenario = CASES.find((c) => c === query.get('case')) ?? null
/** `tight=1`: Davide's Claude Code runs short, as on the resources' page; its task says so. */
const readings = observations.map((o) =>
  query.get('tight') === '1' && o.entitlement_id === 'ent-davide-anthropic' ? tightClaude(o) : o,
)

/** `since=1`: the viewer last looked a while ago, when three tasks stood elsewhere and one wasn't there. */
if (query.get('since') === '1') {
  const stood = {
    'work-0a': 'review',
    'work-1': 'working',
    'work-1-review': 'later',
    'work-2': 'later',
    'work-3': 'later',
    'work-4': 'free',
  }
  const seen = {
    items: Object.fromEntries(Object.entries(stood).map(([id, mark]) => [id, { mark, result: null }])),
    decisions: { d1: '4:proposed:not_needed', d2: '1:accepted:recorded' },
  }
  try {
    localStorage.setItem(
      `sophia.plan.seen.v2.${PROJECT}.${goal.id}.plan-1.${asViewer(query.get('viewer'))}`,
      JSON.stringify(seen),
    )
  } catch {
    // A browser that refuses storage shows nothing changed.
  }
}

/** The first goal as the page opens it: proposed, superseded, expired, crowded or in a scenario, as asked. */
function opening(viewer: Viewer): GoalView {
  let g = inCase(scenario, firstGoal(viewer), viewer)
  if (query.get('many') === '1') g = manyTasks(g)
  g = decisionsAsked(g)
  const current = g.current_plan
  if (current && query.get('proposed') === '1') {
    // Its scenario's own proposals stay beside it (`case=replan`).
    const shown = { ...current, state: 'proposed' as const, decision_ref: null }
    g = { ...g, current_plan: null, items: [], proposed_plans: [shown, ...g.proposed_plans] }
  }
  // Superseded, with no replacement and its work no longer observed: the goal shows as it does without a plan.
  if (current && query.get('superseded') === '1')
    g = { ...g, current_plan: { ...current, state: 'superseded' }, items: [] }
  return g
}

type Change = (g: GoalView) => GoalView
const { action, claude } = fixtureParts

/** `odd-id=1`: the decision waiting on Davide has an id with quotes and brackets, as the wire allows (any string). */
const ODD = 'd1"] [x'
const odd = query.get('odd-id') === '1'
const renamed = (id: string) => (odd && id === 'd1' ? ODD : id)

/** The first goal's decisions, as `expired=` and `odd-id=` ask: past expiry or marked so, and the odd id. */
const decisionsAsked: Change = (g) => {
  const how = query.get('expired')
  const past = new Date(NOW.getTime() - 3_600_000).toISOString()
  const expiring = (d: GoalView['decisions'][number]) =>
    d.state === 'proposed' && (how === '1' || how === 'state')
      ? { ...d, expires_at: past, ...(how === 'state' && { state: 'expired' as const }) }
      : d
  return { ...g, decisions: g.decisions.map((d) => ({ ...expiring(d), decision_id: renamed(d.decision_id) })) }
}

/** The review's proposal names the decision by the same id (`odd-id=1`). */
const reviewAsked = (r: Reviewed): Reviewed => {
  const last = r.last_review
  const proposal = last?.intervention
  if (!last || !proposal?.decision_id) return r
  return { ...r, last_review: { ...last, intervention: { ...proposal, decision_id: renamed(proposal.decision_id) } } }
}

const challenges: NonNullable<NonNullable<Window['workFixture']>['challenges']> = []
/** A challenge to the lead's review, taken as the lead's port would: recorded, unless the page asks otherwise. */
const challenge: Challenge = (challenged, text, key) => {
  challenges.push({ review: challenged.review_id, text, key })
  const said = query.get('challenge')
  return new Promise((done, fail) =>
    setTimeout(() => {
      if (said === 'unknown' && challenges.length === 1) fail(new Error('not confirmed'))
      else done(said === 'denied' ? 'denied' : 'recorded')
    }, 300),
  )
}
const editor = query.get('editor') !== '0'

/** A task's projection changed, as the service's next observation would. */
const observed =
  (workId: string, change: (v: GoalView['items'][number]) => Partial<GoalView['items'][number]>): Change =>
  (g) => ({
    ...g,
    items: g.items.map((v) => (v.work_id === workId ? { ...v, ...change(v) } : v)),
  })

/** What a settled command makes of its task: stopped (closed, its work kept), held (resumable), or running again. */
function settled(command: Command, effect: Receipt['effect'], viewer: Viewer): Change {
  const within = viewer === 'luis' ? 'Within Davide’s contribution to this project.' : null
  if (effect === 'stopped') {
    return observed(command.target.work_id, (v) => ({
      lifecycle: 'stopped',
      closed_reason: 'From its sheet. Completed work is kept.',
      available_actions: v.available_actions.filter((a) => a.kind === 'ask_sophia'),
    }))
  }
  if (effect === 'held') {
    return observed(command.target.work_id, (v) => ({
      lifecycle: 'held',
      available_actions: [...v.available_actions, action('resume', 'allowed', 'Resumes from its saved state.', within)],
    }))
  }
  return effect === 'resumed' ? observed(command.target.work_id, () => ({ lifecycle: 'running' })) : (g) => g
}

/** A choice recorded by the service, the plan not reacting yet. */
const settleChoice =
  (id: string): Change =>
  (g) => ({
    ...g,
    decisions: g.decisions.map((d) => {
      const choice = answers.findLast((a) => a.decision_id === id)?.choice ?? null
      const recorded = { selected_choice: choice, choice_receipt_id: `fixture-choice-${id}` }
      return d.decision_id === id ? { ...d, ...recorded, state: 'accepted', plan_reaction: 'pending' } : d
    }),
  })

/** The lead's next revision, with the choice taken in. */
const reactTo =
  (id: string): Change =>
  (g) => ({
    ...g,
    current_plan: g.current_plan ? { ...g.current_plan, revision: g.current_plan.revision + 1 } : null,
    decisions: g.decisions.map((d) => (d.decision_id === id ? { ...d, plan_reaction: 'recorded' } : d)),
  })

/** Davide's Claude Code reviewer takes a task and starts it, as its runtime would report it. */
const beginWith = (workId: string, viewer: Viewer): Change =>
  observed(workId, (v) => ({
    lifecycle: 'running',
    assignment: claude('claude-reviewer', 'reviewer', 1),
    available_actions: [...fixtureParts.commands(viewer, true), ...v.available_actions],
  }))

/** The same session given the task again: its next assignment generation, its next attempt. */
const nextGeneration = (workId: string): Change =>
  observed(workId, (v) =>
    v.assignment
      ? {
          assignment: {
            ...v.assignment,
            generation: v.assignment.generation + 1,
            attempt_id: `${v.assignment.attempt_id ?? 'attempt'}-next`,
          },
        }
      : {},
  )

/** A new plan for the goal: a new plan id. */
const replanned: Change = (g) =>
  g.current_plan ? { ...g, current_plan: { ...g.current_plan, plan_id: 'plan-1b', revision: 1 } } : g

/** Live changes to the first goal, as the service would make them. */
function controls(
  update: (change: Change) => void,
  setViewer: (v: Viewer) => void,
  setArrived: (a: boolean) => void,
  viewer: Viewer,
  lead: { commands: readonly { kind: string; key: string }[]; again: () => void },
) {
  return {
    unexpected,
    goalCommands: lead.commands,
    reviewAgain: lead.again,
    challenges,
    answered: answers,
    questions,
    commands,
    receipts,
    settle: (id: string) => update(settleChoice(id)),
    react: (id: string) => update(reactTo(id)),
    begin: (workId: string) => update(beginWith(workId, viewer)),
    reassign: (workId: string) => update(nextGeneration(workId)),
    replan: () => update(replanned),
    arrive: () => setArrived(true),
    viewAs: setViewer,
    reconnect,
    replay,
    misdeliver,
    setLifecycle: (workId: string, lifecycle: GoalView['items'][number]['lifecycle']) =>
      update(observed(workId, () => ({ lifecycle }))),
    nextAttempt: (workId: string) =>
      update(
        observed(workId, (v) =>
          v.assignment
            ? {
                assignment: {
                  ...v.assignment,
                  attempt_id: `${v.assignment.attempt_id ?? 'attempt'}-again`,
                  native_session_id: `${v.assignment.native_session_id ?? 'session'}-again`,
                },
              }
            : {},
        ),
      ),
    setAvailability: (workId: string, kind: ActionKind, availability: Availability) =>
      update(observed(workId, (v) => ({ available_actions: availableAs(v.available_actions, kind, availability) }))),
  }
}

type Availability = ItemAction['availability'] | 'missing'

/** One action of a task, as the service would observe it next: offered so, or no more. */
function availableAs(actions: readonly ItemAction[], kind: ActionKind, availability: Availability): ItemAction[] {
  if (availability === 'missing') return actions.filter((a) => a.kind !== kind)
  const was = actions.find((a) => a.kind === kind)
  const reason = availability === 'allowed' ? (was?.reason ?? 'Allowed again.') : 'No longer allowed for you here.'
  const now = { kind, availability, reason, boundary: was?.boundary ?? null }
  // In its place when it was there; added back after the rest when it wasn't.
  return was ? actions.map((a) => (a === was ? now : a)) : [...actions, now]
}

/** The page's view of the project, as a service would serve it, read through the Studio's own reader. */
function viewOf(first: GoalView, arrived: boolean, observedAt: Date): BoardView {
  const coverage = query.get('coverage')
  return {
    schema_version: 'sophia.work.board.v1',
    project_id: PROJECT,
    snapshot_cursor: `fixture-${String(observedAt.getTime())}`,
    observed_at: observedAt.toISOString(),
    coverage: coverage === 'partial' || coverage === 'unavailable' ? coverage : 'complete',
    goals: [first, ...(two && arrived ? [secondView] : []), ...(six ? moreViews : [])],
  }
}

interface Shared {
  resources: Resource[]
  viewerId: Viewer
  now: Date
  board: BoardView
  /** The first goal's progress review, read beside the view (LFE-07.2). */
  review: Reviewed
}

/** One goal's slot in Tasks: its board, NEXT, its tab in the goals' rail, what finds it, and whether it calls the viewer. */
function slot(g: GoalView, { resources, viewerId, now, board, review }: Shared, onCommand: ReturnType<typeof serve>) {
  const shown = boardOf(g, { resources, people, viewerId, project: board.project_id })
  const rows = shown?.rows ?? []
  return {
    view: (
      <PlanBoard
        projectId={board.project_id}
        goal={g}
        coverage={board.coverage}
        observedAt={board.observed_at}
        resources={resources}
        people={people}
        viewerId={viewerId}
        now={now}
        onDecide={decide}
        onCommand={onCommand}
        {...(editor && { onChallenge: challenge })}
        onAsk={ask}
        readResult={readResult}
        onOpenConversation={nothing}
        onOpenResource={(id) =>
          window.location.assign(`resources.html${carried(window.location.search)}${linkHash(id)}`)
        }
        observations={readings}
        review={g.goal_id === goal.id ? review : undefined}
      />
    ),
    next: (
      <PlanNext
        goal={g}
        review={g.goal_id === goal.id ? review : undefined}
        now={now}
        people={people}
        viewerId={viewerId}
      />
    ),
    tab: <PlanTab goal={g} resources={resources} people={people} viewerId={viewerId} now={now} />,
    words: rows.map((r) => r.item.purpose).join(' '),
    tasks: rows.map((r) => r.item.id),
    attention: (shown?.operable ?? false) && forYou(rows, g.decisions, viewerId, now),
  }
}

/** The page's clock runs from NOW, so ages count up and the freshness rings empty as they would. */
function useClock(update: (change: Change) => void) {
  const [now, setNow] = useState(NOW)
  useEffect(() => {
    const start = Date.now()
    let n = 0
    const tick = setInterval(() => {
      const at = new Date(NOW.getTime() + Date.now() - start)
      setNow(at)
      // Every 9 s, Codex's reviewer reports what it does next.
      if (Math.round((Date.now() - start) / 1000) % 9 === 0) update((g) => nextReport(g, at, n++))
    }, 1000)
    return () => clearInterval(tick)
  }, [update])
  return now
}

/**
 * The lead's side of Request review (LFE-07.2): the first goal's review, read beside the board's view, on its plan's
 * current revision; goal commands reach it through the fixture API's command route.
 */
function useLead(first: GoalView, viewer: Viewer) {
  const [review, setReview] = useState<Reviewed>(() =>
    reviewAsked(openedWith(reviewAs, { revision: first.current_plan?.revision ?? 1 })),
  )
  const revision = useRef(1)
  revision.current = first.current_plan?.revision ?? 1
  const [lead] = useState(() => reviewer(reviewAs, viewer, setReview, () => revision.current))
  useEffect(() => {
    onGoalCommand = lead.command
  }, [lead])
  const [again] = useState(() => () => setReview(reviewedAgain))
  // Read with the plan in force now, as the service would read the two together: a plan taken further leaves the
  // review on its own revision, said so.
  return { review: { ...review, revision: revision.current }, lead, again }
}

function Tasks() {
  const [viewer, setViewer] = useState<Viewer>(() => asViewer(query.get('viewer')))
  const [first, setFirst] = useState(() => opening(viewer))
  const [arrived, setArrived] = useState(query.get('later') !== '1')
  // Each change glides into place, as a live update would (motion.ts): a decided ask folds away, a task changes lanes.
  const [update] = useState(() => (change: Change) => moving(() => setFirst(change)))
  const now = useClock(update)
  const looking = useRef(viewer)
  looking.current = viewer
  const [onCommand] = useState(() => serve((command, effect) => update(settled(command, effect, looking.current))))
  const { review, lead, again } = useLead(first, viewer)
  useEffect(() => {
    window.workFixture = controls(
      update,
      (v) => {
        setViewer(v)
        setFirst(opening(v))
      },
      setArrived,
      viewer,
      { commands: lead.commands, again },
    )
  }, [update, viewer, lead, again])
  const board = viewOf(first, arrived, now)
  const read = readBoardView(board)
  if (!read.ok) {
    window.workFixture = { ...window.workFixture, unexpected, refused: read.problems }
    return <p role="alert">The fixture’s view was refused: {read.problems.join('; ')}</p>
  }
  const shared = { resources: withActivity(owned), viewerId: viewer, now, board: read.value, review }
  const plans = Object.fromEntries(
    read.value.goals
      .filter((g) => boardOf(g, { resources: [], people, viewerId: viewer }) || g.items.length > 0)
      .map((g) => [g.goal_id, slot(g, shared, onCommand)]),
  )
  return (
    <>
      <p className="fixture-label" role="note">
        Simulated — no lead, tool, host or conversation read · viewing as {people[viewer].name}
        {scenario ? ` · ${scenario}` : ''}
      </p>
      <ProjectShell
        projectId={PROJECT}
        view="work"
        identity={identity}
        account={null}
        onShow={nothing}
        onLeave={nothing}
        onWork={nothing}
        onSignOut={nothing}
        plans={plans}
      />
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('work.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <ShortcutScope.Provider value>
        <Tasks />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
