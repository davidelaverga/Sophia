// The plan's fixture page (e2e/work.spec.ts): the Studio's own ProjectShell on Tasks, with its goals served at fetch
// (fixture-api.ts) and each goal's plan in its slot over labelled simulated data. The query string picks who is looking,
// `viewer=davide` (default: Luis); `proposed=1` (the plan is proposed, not accepted); `superseded=1` (it was replaced,
// so none shows); `two=1` (a second goal with its own plan); `conflict=1` (an answer comes back refused: the decision
// changed since it was read). A decider's answer is recorded as a lead would take it; `workFixture.settle(id)` records
// it as decided, as the lead's next plan revision would.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import type { Decide } from '../src/features/work/planning/Decision.tsx'
import { PlanView } from '../src/features/work/planning/PlanView.tsx'
import { current, type WorkPlan } from '../src/features/work/planning/plan.ts'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import { NOW, people, resources } from './resources-data.ts'
import { goal, plan, secondGoal, secondPlan } from './work-data.ts'

declare global {
  interface Window {
    workFixture?: {
      unexpected: readonly string[]
      /** Each answer a decider gave, in order: for the checks to read. */
      answered?: { decision: string; revision: number; choice: string }[]
      settle?: (decisionId: string) => void
    }
  }
}

const query = new URLSearchParams(window.location.search)
const two = query.get('two') === '1'
installFixtureApi({ revision: 1, exchange: false, messages: [], goals: two ? [goal, secondGoal] : [goal] })
const answered: NonNullable<NonNullable<Window['workFixture']>['answered']> = []
window.workFixture = { unexpected, answered }
const nothing = () => undefined

const viewer = query.get('viewer') === 'davide' ? 'davide' : 'luis'
const state = query.get('superseded') === '1' ? 'superseded' : query.get('proposed') === '1' ? 'proposed' : 'accepted'

/** The decider's answer, taken as a lead would: recorded, or refused when the page asked for a stale decision. */
const decide: Decide = (decision, choice) => {
  answered.push({ decision: decision.decision_id, revision: plan(state).revision, choice })
  return new Promise((done) => setTimeout(() => done(query.get('conflict') === '1' ? 'conflict' : 'recorded'), 300))
}

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

function Tasks() {
  const [first, setFirst] = useState(() => plan(state))
  useEffect(() => {
    window.workFixture = { unexpected, answered, settle: (id) => setFirst((p) => settled(p, id)) }
  }, [])
  const view = (p: WorkPlan) => (
    <PlanView plan={p} resources={resources} people={people} now={NOW} viewerId={viewer} onDecide={decide} />
  )
  // A plan in force or proposed fills its goal's slot; otherwise Tasks shows the goal as it does without one.
  const plans = Object.fromEntries(
    [first, ...(two ? [secondPlan] : [])].filter((p) => current(p)).map((p) => [p.goal_id, view(p)]),
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
