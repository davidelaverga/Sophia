// The plan's fixture page (e2e/work.spec.ts): the Studio's own ProjectShell on Tasks, with its goal served at fetch
// (fixture-api.ts) and the lead's plan in its slot over labelled simulated data. `proposed=1`: the plan is proposed,
// not accepted; `superseded=1`: it was replaced, so none shows.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import { PlanView } from '../src/features/work/planning/PlanView.tsx'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import { people, resources } from './resources-data.ts'
import { goal, plan } from './work-data.ts'

declare global {
  interface Window {
    workFixture?: { unexpected: readonly string[] }
  }
}

installFixtureApi({ revision: 1, exchange: false, messages: [], goals: [goal] })
window.workFixture = { unexpected }
const nothing = () => undefined

const query = new URLSearchParams(window.location.search)
const state = query.get('superseded') === '1' ? 'superseded' : query.get('proposed') === '1' ? 'proposed' : 'accepted'

const root = document.getElementById('root')
if (!root) throw new Error('work.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no lead, tool or host read
    </p>
    <QueryClientProvider client={new QueryClient()}>
      <ShortcutScope.Provider value>
        <ProjectShell
          projectId={PROJECT}
          view="work"
          identity={identity}
          account={null}
          onShow={nothing}
          onLeave={nothing}
          onWork={nothing}
          onSignOut={nothing}
          plan={<PlanView plan={plan(state)} resources={resources} people={people} />}
        />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
