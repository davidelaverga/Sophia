// The room's fixture page for the preservation checks (e2e/room.spec.ts): the Studio's own ProjectShell, with its
// project feed, query cache and room controller, over two faked boundaries: the API, answered at fetch
// (fixture-api.ts), and LiveKit (fake-livekit.ts, which the fixtures' Vite config puts in its place). It reaches no
// server and says so on screen. The query string picks the scenario: `call=on` (join on opening), `exchange=open`
// (Sophia's conversation is open and this viewer holds the floor), `refuse=camera` (the browser refuses it),
// `lobby=waiting` (someone is at the door), `place=knowledge` (Knowledge instead of the room), `hold=sources` (the
// report's sources come only once the check lets them through); the report viewer's own parameters (`report=…`) open
// the fixture report (report-data.ts). `window.fixture` lets a check move the project on, have a member write, drop the
// call, publish the report's next version, deliver a result notice, or read what happened.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountMenu } from '../src/app/AccountMenu.tsx'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { identity, PROJECT } from './data.ts'
import { asked, deliverNotice, dropCall } from './fake-livekit.ts'
import { installFixtureApi, publish, releaseSources, served, unexpected } from './fixture-api.ts'
import { researchNotice, SOPHIAS_DESCRIPTION, TEAMMATE } from './report-data.ts'

interface Fixture {
  /** A background update: an event on the project's stream, and a new snapshot and brief behind it. */
  update: () => void
  /** Another member writes in the room's discussion, and the event saying so goes out. */
  say: (text: string) => void
  /** The call's connection is lost. */
  drop: () => void
  /** The fixture report's next version is published (the viewer learns of it when it reads the list again). */
  publishReport: () => void
  /** A finished research result is told in the chat, as the bridge tells a reader. */
  notice: () => void
  /** A teammate edits the report's description elsewhere (the page learns of it when it reads the cards again). */
  describeElsewhere: (text: string) => void
  /** Reads of the report's versions fail from now on: unavailable, or refused (`not_found`); given false, they succeed. */
  failVersions: (how?: 'unavailable' | 'not_found' | false) => void
  /** The report's sources, held since the page opened (`hold=sources`), come now. */
  releaseSources: () => void
  /** The person goes home: the project is kept out of sight for its call, and the address is the places'. */
  away: () => void
  /** Back to the project, as the places' call control brings it back: its address names no report. */
  back: () => void
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
const project = {
  revision: 1,
  exchange: query.get('exchange') === 'open',
  messages: [] as string[],
  reportVersions: 1,
  waiting: query.get('lobby') === 'waiting',
  description: SOPHIAS_DESCRIPTION,
  versionsFail: false as false | 'unavailable' | 'not_found',
  sourcesHeld: query.get('hold') === 'sources',
}
installFixtureApi(project)

window.fixture = {
  update: () => publish(project),
  say: (text) => {
    project.messages.push(text)
    publish(project)
  },
  drop: dropCall,
  publishReport: () => {
    project.reportVersions += 1
  },
  notice: () => deliverNotice(researchNotice),
  describeElsewhere: (text) => {
    project.description = { text, revision: project.description.revision + 1, author: TEAMMATE }
  },
  failVersions: (how = 'unavailable') => {
    project.versionsFail = how
  },
  releaseSources: () => releaseSources(project),
  away: () => {
    window.history.pushState({ fixture: 'home' }, '', '/room.html?place=home') // the places' own entry
    sight.set?.(false)
  },
  back: () => {
    window.history.pushState(null, '', '/room.html')
    sight.set?.(true)
  },
  asked,
  served,
  unexpected,
}

const nothing = () => undefined

/** Shows or keeps out of sight the project (`window.fixture.away/back`), set once the page renders. */
const sight: { set: ((inSight: boolean) => void) | null } = { set: null }

/** The project as App.tsx holds it: out of sight while the person is in the places, and taking no keys then. */
function Kept({ children }: { children: ReactNode }) {
  const [inSight, setInSight] = useState(true)
  useEffect(() => {
    sight.set = setInSight
  }, [])
  return (
    <div hidden={!inSight}>
      <ShortcutScope.Provider value={inSight}>{children}</ShortcutScope.Provider>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('room.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <p className="fixture-label" role="note">
        Fixture — no API, no call
      </p>
      <Kept>
        <ProjectShell
          projectId={PROJECT}
          view={query.get('place') === 'knowledge' ? 'knowledge' : 'studio'}
          identity={identity}
          account={
            <AccountMenu
              identity={identity}
              where="project"
              actions={{ data: nothing, privacy: nothing, chooseDev: nothing, signOut: nothing }}
            />
          }
          onShow={nothing}
          onLeave={nothing}
          onWork={nothing}
          onSignOut={nothing}
          joinOnOpen={query.get('call') === 'on'}
        />
      </Kept>
    </QueryClientProvider>
  </StrictMode>,
)
