// The resource panel's fixture page (e2e/resources.spec.ts): the Studio's own ProjectShell on its Resources view, with
// the real ResourcePanel in it over labelled simulated data, so the panel is seen where it will live. The shell's own
// reads are answered at fetch (fixture-api.ts); the panel has no port that acts, and any other request is recorded as
// unexpected. The query string picks who is looking, `viewer=davide` (default: Luis); `stale=1` (Codex's reading has
// expired); `more=1` (Grok and Gemini CLI join the three enrollments); `quiet=1` (nothing waits on an owner);
// `busy=1` (Codex's account at 92 % and 78 %, Davide's Claude Code at 95 %); `spent=1` (Codex's spend limit passed, at 120 %);
// `loading=1` (the resources not read yet, until `resourcesFixture.load()`); `refreshing=1` (read again, the last read's
// data still in hand). Live, as a live read would: `resourcesFixture.addRequest()` brings a request to wait on Davide,
// `answerRequest()` answers the first, `swapRequest()` answers it while another comes, `spendCredits(n)` moves Gemini's
// balance, and `setHost(id, state)` moves a host. An owner's effort request is taken as a runtime would:
// `advance(sessionId)` moves a restart one step (stopping, starting, then running with it), `failStop(sessionId)` leaves
// its stop unconfirmed, and `nextRun(sessionId)` starts its next run with what was asked.
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
import type { EffortAsk } from '../src/features/resources/change.ts'
import type { Resource, Session } from '../src/features/resources/resource.ts'
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
      /** What owners asked of their sessions' effort, in order: for the checks to read. */
      asked?: { sessionId: string; level: string | null; when: string | null }[]
      addRequest?: () => void
      answerRequest?: () => void
      load?: () => void
      setHost?: (id: string, state: Resource['host']['state']) => void
      advance?: (sessionId: string) => void
      failStop?: (sessionId: string) => void
      nextRun?: (sessionId: string) => void
      spendCredits?: (left: number) => void
      swapRequest?: () => void
    }
  }
}

installFixtureApi({ revision: 1, exchange: false, messages: [] })
window.resourcesFixture = { unexpected }
const nothing = () => undefined
/** Each effort an owner asks for: kept here, where a launch configuration would take it. */
const asked: NonNullable<NonNullable<Window['resourcesFixture']>['asked']> = []

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
  /** What each session's owner asked of its effort, as its runtime holds it. */
  asks: Record<string, EffortAsk | undefined>
}

/** The live state with one session changed. */
const withSession = (l: LiveState, id: string, change: (s: Session) => Session): LiveState => ({
  ...l,
  resources: l.resources.map((r) => ({ ...r, sessions: r.sessions.map((s) => (s.id === id ? change(s) : s)) })),
})

/** A session started with a level: ultracode is Claude Code's mode, over the effort it had. */
const startedWith = (s: Session, level: string): Session => ({
  ...s,
  effort: level === 'ultracode' ? s.effort : level,
  mode: level === 'ultracode' ? 'ultracode' : null,
  change: null,
})

/**
 * A restart's next step, as OMNIGENT §6 has it: its attempt stops (its work kept and queued, the requests it had
 * waiting retired), a new one starts with the level asked, then runs it.
 */
function advanced(l: LiveState, id: string): LiveState {
  const ask = l.asks[id]
  if (ask?.when !== 'now') return l
  const session = l.resources.flatMap((r) => r.sessions).find((s) => s.id === id)
  if (!session?.change) {
    const stopping = withSession(l, id, (s) => ({
      ...s,
      change: { level: ask.level, phase: 'stopping' },
      assignment: s.assignment && { ...s.assignment, state: 'queued' },
    }))
    const retired = l.actions.map((a) =>
      a.sessionId === id && a.state === 'open' ? { ...a, state: 'superseded' as const } : a,
    )
    return { ...stopping, actions: retired }
  }
  if (session.change.phase === 'stopping') {
    return withSession(l, id, (s) => ({ ...s, change: { level: ask.level, phase: 'starting' } }))
  }
  const running = withSession(l, id, (s) => ({
    ...startedWith(s, ask.level),
    assignment: s.assignment && { ...s.assignment, state: 'running' },
  }))
  return { ...running, asks: { ...l.asks, [id]: undefined } }
}

/** What a test can change while the page is open, as a live read would. */
function controls(setLive: React.Dispatch<React.SetStateAction<LiveState>>): NonNullable<Window['resourcesFixture']> {
  return {
    unexpected,
    asked,
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
    advance: (id) => setLive((l) => advanced(l, id)),
    failStop: (id) =>
      setLive((l) =>
        withSession(l, id, (s) => ({ ...s, change: { level: s.change?.level ?? '', phase: 'unconfirmed' } })),
      ),
    nextRun: (id) =>
      setLive((l) => {
        const ask = l.asks[id]
        if (ask?.when !== 'next') return l
        return { ...withSession(l, id, (s) => startedWith(s, ask.level)), asks: { ...l.asks, [id]: undefined } }
      }),
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
    asks: {},
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
          onEffort={(sessionId, ask) => {
            asked.push({ sessionId, level: ask?.level ?? null, when: ask?.when ?? null })
            setLive((l) => ({ ...l, asks: { ...l.asks, [sessionId]: ask ?? undefined } }))
          }}
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
