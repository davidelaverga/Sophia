// The plan's fixture page (e2e/work.spec.ts): the Studio's own ProjectShell on Tasks, with its goals served at fetch
// (fixture-api.ts) and each goal's plan in its slot over labelled simulated data. The query string picks who is looking,
// `viewer=davide` (default: Luis); `proposed=1` (the plan is proposed, not accepted); `superseded=1` (it was replaced,
// so none shows); `two=1` (a second goal with its own plan); `conflict=1` (an answer comes back refused: the decision
// changed since it was read). A decider's answer is recorded as a lead would take it; `workFixture.settle(id)` records
// it as decided, as the lead's next plan revision would. Whoever does a task opens on the resources' fixture
// (resources.html#resource-<id>), as Resources would; `#task-<id>` opens a task with the page. `expired=1`: the
// decision is past its expiry; `unknown=1`: an answer comes back not confirmed; `unplanned=1`: a goal without a plan;
// `staggered=1`: Sophia answers the first question slower than the next. `workFixture.replan()` replaces the first
// goal's plan with a new one (a new plan id), as the lead would. `later=1` (with `two=1`): the second goal's plan is
// held back until `workFixture.arrive()`, as a slower read would.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import type { Decide } from '../src/features/work/planning/Decision.tsx'
import { PlanBoard } from '../src/features/work/planning/PlanBoard.tsx'
import { PlanNext } from '../src/features/work/planning/PlanNext.tsx'
import { PlanTab } from '../src/features/work/planning/PlanTab.tsx'
import { linkHash } from '../src/features/resources/link.ts'
import { moving } from '../src/features/resources/motion.ts'
import type { RequiredAction, Resource } from '../src/features/resources/resource.ts'
import { current, type WorkPlan } from '../src/features/work/planning/plan.ts'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import { SOPHIAS_DESCRIPTION, TITLE } from './report-data.ts'
import { actions, NOW, observations, people, resources, tightClaude } from './resources-data.ts'
import { act, ask, carried, nextActivity, withActivity } from './work-live.ts'
import { goal, manyTasks, moreGoals, morePlans, plan, secondGoal, secondPlan, unplannedGoal } from './work-data.ts'

declare global {
  interface Window {
    workFixture?: {
      unexpected: readonly string[]
      /** Each answer a decider gave, in order: for the checks to read. */
      answered?: { decision: string; revision: number; choice: string }[]
      settle?: (decisionId: string) => void
      begin?: (workId: string) => void
      replan?: () => void
      arrive?: () => void
    }
  }
}

const query = new URLSearchParams(window.location.search)
/** `two=1`: a second goal with its own plan; `goals=6`: four more, to see the goals' rail scroll. */
const six = query.get('goals') === '6'
const two = six || query.get('two') === '1'
installFixtureApi({
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
const answered: NonNullable<NonNullable<Window['workFixture']>['answered']> = []
window.workFixture = { unexpected, answered }
const nothing = () => undefined

const viewer = query.get('viewer') === 'davide' ? 'davide' : 'luis'
/** `tight=1`: Davide's Claude Code runs short, as on the resources' page; its task says so. */
const readings = observations.map((o) =>
  query.get('tight') === '1' && o.entitlement_id === 'ent-davide-anthropic' ? tightClaude(o) : o,
)

/** `since=1`: the viewer last looked a while ago, when four tasks stood elsewhere (and one wasn't there). */
if (query.get('since') === '1') {
  const before = {
    'work-0a': 'finished',
    'work-1': 'working',
    'work-1-review': 'later',
    'work-2': 'later',
    'work-3': 'later',
    'work-4': 'free',
  }
  try {
    localStorage.setItem(`sophia.plan.seen.v1.plan-1.${viewer}`, JSON.stringify(before))
  } catch {
    // A browser that refuses storage shows nothing changed.
  }
}
const state = query.get('superseded') === '1' ? 'superseded' : query.get('proposed') === '1' ? 'proposed' : 'accepted'

/** The decider's answer, taken as a lead would: recorded, or refused when the page asked for a stale decision. */
const decide: Decide = (decision, choice) => {
  // The answer names the decision's own revision, as the lead's API would check it (decision.v1).
  answered.push({ decision: decision.decision_id, revision: decision.revision, choice })
  const said = query.get('conflict') === '1' ? 'conflict' : query.get('unknown') === '1' ? 'unknown' : 'recorded'
  return new Promise((done) => setTimeout(() => done(said), 300))
}

/** `expired=1`: the decision waiting on Davide is past its expiry. */
const expiredIf = (p: WorkPlan): WorkPlan =>
  query.get('expired') === '1'
    ? {
        ...p,
        decisions: p.decisions.map((d) =>
          d.state === 'proposed' ? { ...d, expires_at: new Date(NOW.getTime() - 3_600_000).toISOString() } : d,
        ),
      }
    : p

/** The lead's next revision with a recorded answer: the decision accepted with the choice its decider gave. */
const settled = (p: WorkPlan, id: string): WorkPlan => {
  const choice = answered.findLast((a) => a.decision === id)?.choice ?? null
  return {
    ...p,
    revision: p.revision + 1,
    decisions: p.decisions.map((d) =>
      d.decision_id === id ? { ...d, state: 'accepted', selected_choice: choice } : d,
    ),
  }
}

/** Davide's Claude Code reviewer takes `workId` and starts it, as its runtime would report it. */
const begun = (list: Resource[], workId: string): Resource[] =>
  list.map((r) => ({
    ...r,
    sessions: r.sessions.map((s) =>
      s.id === 'claude-reviewer' ? { ...s, assignment: { workId, title: workId, state: 'running' as const } } : s,
    ),
  }))

/** One plan's slot in Tasks: its board, NEXT, its tab in the goals' rail, and what finds it. */
interface Shared {
  resources: Resource[]
  people: typeof people
  viewerId: string
  actions: RequiredAction[]
}

function slot(p: WorkPlan, now: Date, shared: Shared) {
  return {
    view: (
      <PlanBoard
        plan={p}
        now={now}
        onDecide={decide}
        onAct={act}
        onAsk={ask}
        onOpenResource={(id) =>
          window.location.assign(`resources.html${carried(window.location.search)}${linkHash(id)}`)
        }
        observations={readings}
        {...shared}
      />
    ),
    next: <PlanNext plan={p} />,
    tab: <PlanTab plan={p} now={now} {...shared} />,
    words: p.items.map((i) => i.purpose).join(' '),
    tasks: p.items.map((i) => i.id),
  }
}

function Tasks() {
  const [first, setFirst] = useState(() => expiredIf(query.get('many') === '1' ? manyTasks(plan(state)) : plan(state)))
  const [live, setLive] = useState(() => withActivity(resources))
  const [arrived, setArrived] = useState(query.get('later') !== '1')
  // The page's clock runs from NOW, so ages count up and the freshness rings empty as they would.
  const [now, setNow] = useState(NOW)
  useEffect(() => {
    const start = Date.now()
    let n = 0
    const tick = setInterval(() => {
      const at = new Date(NOW.getTime() + Date.now() - start)
      setNow(at)
      // Every 9 s, Codex's reviewer reports what it does next.
      if (Math.round((Date.now() - start) / 1000) % 9 === 0) setLive((l) => nextActivity(l, at, n++))
    }, 1000)
    return () => clearInterval(tick)
  }, [])
  useEffect(() => {
    // Each change glides into place, as a live update would (motion.ts): a decided ask folds away, a task changes lanes.
    window.workFixture = {
      unexpected,
      answered,
      settle: (id) => moving(() => setFirst((p) => settled(p, id))),
      begin: (workId) => moving(() => setLive((l) => begun(l, workId))),
      replan: () => setFirst((p) => ({ ...p, plan_id: 'plan-1b', revision: 1 })),
      arrive: () => setArrived(true),
    }
  }, [])
  const shared = { resources: live, people, viewerId: viewer, actions }
  // A plan in force or proposed fills its goal's slot; otherwise Tasks shows the goal as it does without one.
  const plans = Object.fromEntries(
    [first, ...(two && arrived ? [secondPlan] : []), ...(six ? morePlans : [])]
      .filter((p) => current(p))
      .map((p) => [p.goal_id, slot(p, now, shared)]),
  )
  return (
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
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('work.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no lead, tool or host read · viewing as {viewer === 'davide' ? 'Davide' : 'Luis'}
    </p>
    <QueryClientProvider client={new QueryClient()}>
      <ShortcutScope.Provider value>
        <Tasks />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
