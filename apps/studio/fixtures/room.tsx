// The room's fixture page for the preservation checks (e2e/room.spec.ts): the Studio's own ProjectShell, with its
// project feed, query cache and room controller, over two faked boundaries: the API, answered at fetch
// (fixture-api.ts), and LiveKit (fake-livekit.ts, which the fixtures' Vite config puts in its place). It reaches no
// server and says so on screen. The query string picks the scenario: `call=on` (join on opening), `exchange=open`
// (Sophia's conversation is open and this viewer holds the floor), `refuse=camera` (the browser refuses it).
// `window.fixture` lets a check move the project on, have a member write, drop the call, or read what happened.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { asked, dropCall } from './fake-livekit.ts'
import { installFixtureApi, publish, served, unexpected } from './fixture-api.ts'

interface Fixture {
  /** A background update: an event on the project's stream, and a new snapshot and brief behind it. */
  update: () => void
  /** Another member writes in the room's discussion, and the event saying so goes out. */
  say: (text: string) => void
  /** The call's connection is lost. */
  drop: () => void
  /** What the room's connection was asked (fake-livekit.ts). */
  asked: readonly string[]
  /** What the API answered, as `snapshot:2` (fixture-api.ts). */
  served: readonly string[]
  unexpected: readonly string[]
}

declare global {
  interface Window {
    fixture?: Fixture
  }
}

const query = new URLSearchParams(window.location.search)
const project = { revision: 1, exchange: query.get('exchange') === 'open', messages: [] as string[] }
installFixtureApi(project)

window.fixture = {
  update: () => publish(project),
  say: (text) => {
    project.messages.push(text)
    publish(project)
  },
  drop: dropCall,
  asked,
  served,
  unexpected,
}

const nothing = () => undefined

const root = document.getElementById('root')
if (!root) throw new Error('room.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <p className="fixture-label" role="note">
        Fixture — no API, no call
      </p>
      <ShortcutScope.Provider value>
        <ProjectShell
          projectId={PROJECT}
          view="studio"
          identity={identity}
          account={null}
          onShow={nothing}
          onLeave={nothing}
          onWork={nothing}
          onSignOut={nothing}
          joinOnOpen={query.get('call') === 'on'}
        />
      </ShortcutScope.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
