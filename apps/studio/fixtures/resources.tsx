// The resource panel's fixture page (e2e/resources.spec.ts): the Studio's own ProjectShell on its Resources view, with
// the real ResourcePanel in it over labelled simulated data, so the panel is seen where it will live. The shell's own
// reads are answered at fetch (fixture-api.ts); the panel has no port that acts, and any other request is recorded as
// unexpected. The query string picks who is looking, `viewer=davide` (default: Luis); `stale=1` (Codex's reading has
// expired); `more=1` (Grok and Gemini CLI join the three enrollments); `quiet=1` (nothing waits on an owner);
// `busy=1` (Codex's account at 92 % and 78 %, Davide's Claude Code at 95 %); `spent=1` (Codex's spend limit passed, at 120 %);
// `loading=1` (the resources not read yet). Live, `resourcesFixture.addRequest()` brings a request to wait on Davide and
// `setHost(id, state)` moves a host, as a live read would.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ResourcePanel } from '../src/features/resources/ResourcePanel.tsx'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'
import type { Resource } from '../src/features/resources/resource.ts'
import {
  actions,
  arriving,
  busyClaude,
  busyCodex,
  spentCodex,
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
    resourcesFixture?: {
      unexpected: readonly string[]
      addRequest?: () => void
      setHost?: (id: string, state: Resource['host']['state']) => void
    }
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
const busy = query.get('busy') === '1'
const spent = query.get('spent') === '1'
const read = [...observations, ...(more ? moreObservations : [])].map((o) => {
  if (busy && o.entitlement_id === 'ent-davide-anthropic') return busyClaude(o)
  if (o.entitlement_id !== 'ent-davide-openai') return o
  if (stale) return { ...o, valid_until: expiredAt() }
  if (spent) return spentCodex(o)
  return busy ? busyCodex(o) : o
})

const loading = query.get('loading') === '1'
const waitingOn = (list: typeof actions, id: string) =>
  list.filter((a) => a.ownerId === id && a.state === 'open').length

/** The view over data that can change while it is open, as a live read's would. */
function Live() {
  const [live, setLive] = useState({ actions: query.get('quiet') === '1' ? [] : actions, resources: shown })
  useEffect(() => {
    window.resourcesFixture = {
      unexpected,
      addRequest: () => setLive((l) => ({ ...l, actions: [...l.actions, arriving(l.actions.length + 1)] })),
      setHost: (id, state) =>
        setLive((l) => ({
          ...l,
          resources: l.resources.map((r) => (r.id === id ? { ...r, host: { ...r.host, state } } : r)),
        })),
    }
  }, [])
  return (
    <ProjectShell
      projectId={PROJECT}
      view="resources"
      identity={identity}
      account={null}
      onShow={nothing}
      onLeave={nothing}
      onWork={nothing}
      onSignOut={nothing}
      resourcesWaiting={waitingOn(live.actions, viewer.id)}
      resources={
        <ResourcePanel
          resources={live.resources}
          observations={read}
          actions={live.actions}
          viewerId={viewer.id}
          now={NOW}
          loading={loading}
        />
      }
    />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('resources.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no tool, host or account read · viewing as {viewer.name}
    </p>
    <QueryClientProvider client={new QueryClient()}>
      <ShortcutScope.Provider value>
        <Live />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
