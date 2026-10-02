// The resource panel's fixture page (e2e/resources.spec.ts): the Studio's own ProjectShell on its Resources view, with
// the real ResourcePanel in it over labelled simulated data, so the panel is seen where it will live. The shell's own
// reads are answered at fetch (fixture-api.ts); the panel has no port that acts, and any other request is recorded as
// unexpected. The query string picks who is looking, `viewer=davide` (default: Luis); `stale=1` (Codex's reading has
// expired); `more=1` (Grok and Gemini CLI join the three enrollments); `quiet=1` (nothing waits on an owner).
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ResourcePanel } from '../src/features/resources/ResourcePanel.tsx'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import {
  actions,
  expiredAt,
  moreObservations,
  moreResources,
  NOW,
  observations,
  people,
  resources,
} from './resources-data.ts'

declare global {
  interface Window {
    resourcesFixture?: { unexpected: readonly string[] }
  }
}

installFixtureApi({ revision: 1, exchange: false, messages: [] })
window.resourcesFixture = { unexpected }
const nothing = () => undefined

const query = new URLSearchParams(window.location.search)
const viewer = query.get('viewer') === 'davide' ? people.davide : people.luis
const more = query.get('more') === '1'
const shown = more ? [...resources, ...moreResources] : resources
const stale = query.get('stale') === '1'
const read = [...observations, ...(more ? moreObservations : [])].map((o) =>
  stale && o.entitlement_id === 'ent-davide-openai' ? { ...o, valid_until: expiredAt() } : o,
)

const root = document.getElementById('root')
if (!root) throw new Error('resources.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no tool, host or account read · viewing as {viewer.name}
    </p>
    <QueryClientProvider client={new QueryClient()}>
      <ShortcutScope.Provider value>
        <ProjectShell
          projectId={PROJECT}
          view="resources"
          identity={identity}
          account={null}
          onShow={nothing}
          onLeave={nothing}
          onWork={nothing}
          onSignOut={nothing}
          resources={
            <ResourcePanel
              resources={shown}
              observations={read}
              actions={query.get('quiet') === '1' ? [] : actions}
              viewerId={viewer.id}
              now={NOW}
            />
          }
        />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
