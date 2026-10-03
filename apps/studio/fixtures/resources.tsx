// The resource panel's fixture page (e2e/resources.spec.ts): the Studio's own ProjectShell on its Resources view, with
// the real ResourcePanel in it over labelled simulated data, so the panel is seen where it will live. The shell's own
// reads are answered at fetch (fixture-api.ts); the panel has no port that acts, and any other request is recorded as
// unexpected. The query string picks who is looking, `viewer=davide` (default: Luis); `stale=1` (Codex's reading has
// expired); `more=1` (Grok and Gemini CLI join the three enrollments); `quiet=1` (nothing waits on an owner);
// `busy=1` (Codex's account at 92 % and 78 %, Davide's Claude Code at 95 %); `spent=1` (Codex's spend limit passed, at 120 %);
// `loading=1` (the resources not read yet, until `resourcesFixture.load()`); `refreshing=1` (read again, the last read's
// data still in hand). Live, as a live read would: `resourcesFixture.addRequest()` brings a request to wait on Davide,
// `answerRequest()` answers the first, `swapRequest()` answers it while another comes, `spendCredits(n)` moves Gemini's
// balance, and `setHost(id, state)` moves a host.
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
  earlierReadings,
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
      answerRequest?: () => void
      load?: () => void
      setHost?: (id: string, state: Resource['host']['state']) => void
      spendCredits?: (left: number) => void
      swapRequest?: () => void
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

const waitingOn = (list: typeof actions, id: string) =>
  list.filter((a) => a.ownerId === id && a.state === 'open').length

/** The view over data that can change while it is open, as a live read's would. */
type LiveState = {
  actions: typeof actions
  resources: typeof shown
  observations: typeof read
  loading: boolean
}

/** What a test can change while the page is open, as a live read would. */
function controls(setLive: React.Dispatch<React.SetStateAction<LiveState>>): NonNullable<Window['resourcesFixture']> {
  return {
    unexpected,
    load: () => setLive((l) => ({ ...l, loading: false })),
    answerRequest: () =>
      setLive((l) => ({ ...l, actions: l.actions.map((a, i) => (i === 0 ? { ...a, state: 'resolved' } : a)) })),
    addRequest: () => setLive((l) => ({ ...l, actions: [...l.actions, arriving(l.actions.length + 1)] })),
    // Gemini's balance moves: only its count changes, no percentage.
    spendCredits: (left) =>
      setLive((l) => ({
        ...l,
        observations: l.observations.map((o) =>
          o.entitlement_id === 'ent-luis-google' ? { ...o, windows: o.windows.map((w) => ({ ...w, value: left })) } : o,
        ),
      })),
    // In one read, the request waiting is answered and another comes to wait on the same tool: the count stays 1.
    swapRequest: () =>
      setLive((l) => ({
        ...l,
        actions: [
          ...l.actions.map((a, i) => (i === 0 ? { ...a, state: 'resolved' as const } : a)),
          { ...arriving(l.actions.length + 1), resourceId: 'davide-claude', sessionId: 'claude-worker' },
        ],
      })),
    setHost: (id, state) =>
      setLive((l) => ({
        ...l,
        resources: l.resources.map((r) => (r.id === id ? { ...r, host: { ...r.host, state } } : r)),
      })),
  }
}

function Live() {
  const [live, setLive] = useState<LiveState>({
    actions: query.get('quiet') === '1' ? [] : actions,
    resources: shown,
    observations: read,
    loading: query.get('loading') === '1' || query.get('refreshing') === '1',
  })
  useEffect(() => {
    window.resourcesFixture = controls(setLive)
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
          resources={live.loading && query.get('refreshing') !== '1' ? [] : live.resources}
          observations={live.observations}
          actions={live.actions}
          viewerId={viewer.id}
          now={NOW}
          loading={live.loading}
          history={earlierReadings(read)}
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
