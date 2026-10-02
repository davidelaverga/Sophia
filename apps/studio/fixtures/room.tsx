// The room's fixture page for the preservation checks (e2e/room.spec.ts): the real StudioShell — the stage, the dock,
// the Chat and Brief side panel — over a room this page holds (fake-room.ts) and a brief it answers itself
// (fixture-api.ts). It reaches no API, LiveKit or provider, and says so on screen. The query string picks the scenario:
// `call=on`, `exchange=open` (Sophia's conversation is open and this viewer holds the floor), `error=…`, `media=…`.
// `window.fixture` lets a check send a background update or read what was asked.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { membershipKey } from '../src/features/access/useAccess.ts'
import { StudioShell, useRoomPanel } from '../src/features/studio/StudioShell.tsx'
import { snapshotKey } from '../src/features/studio/useProjectFeed.ts'
import '../src/app/theme.css'
import { identity, membership, PROJECT, snapshot } from './data.ts'
import { asked, useFakeRoom, type Scenario } from './fake-room.ts'
import { installFixtureApi, unexpected } from './fixture-api.ts'

interface Fixture {
  /** A background update: the project and its brief move one revision, as the feed would bring them. */
  update: () => void
  asked: readonly string[]
  unexpected: readonly string[]
}

declare global {
  interface Window {
    fixture?: Fixture
  }
}

const query = new URLSearchParams(window.location.search)
const scenario: Scenario = {
  inCall: query.get('call') === 'on',
  error: query.get('error'),
  mediaError: query.get('media'),
}

const exchange = query.get('exchange') === 'open'
let revision = 1
installFixtureApi(() => revision)

const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
client.setQueryData(membershipKey(PROJECT, identity.name), membership)
client.setQueryData(snapshotKey(PROJECT, identity.name), snapshot(revision, exchange))

function Room() {
  const [current, setCurrent] = useState(() => snapshot(revision, exchange))
  const room = useFakeRoom(scenario)
  const panel = useRoomPanel(current, room, true)
  window.fixture = {
    update: () => {
      revision += 1
      const next = snapshot(revision, exchange)
      client.setQueryData(snapshotKey(PROJECT, identity.name), next)
      setCurrent(next)
    },
    asked,
    unexpected,
  }
  return (
    <StudioShell projectId={PROJECT} identity={identity} room={room} snapshot={current} panel={panel} looking={null} />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('room.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <p className="fixture-label" role="note">
        Fixture — no API, no call
      </p>
      <Room />
    </QueryClientProvider>
  </StrictMode>,
)
