// Home's fixture page (e2e/home.spec.ts): the Studio's own HomeDoors, inside Places' frame, over labelled simulated
// projects. The query string picks them: `projects=four` (default: Launch plan, Research notes, Design review, and
// Product launch, whose Standup starts in 10 min), `live` (Davide and Sophia in Pitch deck's room), `none`, `loading`;
// `failed` (their read failed); `explain=1` (the first-visit note), `locked=1` (the personal space locked),
// `call=<id>` (in that project's call), `modal=1` (a sheet open over Home, as Your data would be).
// `window.homeFixture.pressed` lists each action taken, as "open <id>", "join <id>", "personal", "work"...
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { ProjectSummary } from '@sophia/contracts'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HomeDoors } from '../src/features/personal/HomeDoors.tsx'
import {
  dateLine,
  greeting,
  homeAttention,
  homeSummary,
  READ_FAILED,
  workCount,
  youDoor,
} from '../src/features/personal/places-view.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'

declare global {
  interface Window {
    homeFixture?: { pressed: string[] }
  }
}

const query = new URLSearchParams(window.location.search)
const pressed: string[] = []
window.homeFixture = { pressed }
const NOW = new Date()
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const id = (n: number) => `00000000-0000-4000-8000-00000000000${String(n)}`

const project = (n: number, title: string, over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  projectId: id(n),
  title,
  role: 'editor',
  members: 3,
  room: null,
  nextSession: null,
  releases: [],
  ...over,
})
const standup = {
  id: 'session-1',
  title: 'Standup',
  startsAt: at(10),
  endsAt: at(40),
  timeZone: 'UTC',
}
const SETS: Record<string, ProjectSummary[] | undefined> = {
  four: [
    project(1, 'Launch plan'),
    project(2, 'Research notes', { members: 2 }),
    project(3, 'Design review'),
    project(4, 'Product launch', { nextSession: standup }),
  ],
  live: [
    project(1, 'Launch plan'),
    project(5, 'Pitch deck', { room: { people: ['davide@sophia.test'], sophia: true } }),
  ],
  none: [],
  loading: undefined,
  failed: undefined,
}
const projects = SETS[query.get('projects') ?? 'four']
const locked = query.get('locked') === '1'
const inCall = query.get('call')
const failed = query.get('projects') === 'failed'

function Home() {
  const [explain, setExplain] = useState(query.get('explain') === '1')
  const press = (what: string) => () => pressed.push(what)
  return (
    <div className="places" data-place="home">
      <div className="c-home" data-place-view="home">
        <HomeDoors
          hello={greeting(NOW.getHours(), 'Luis', false)}
          date={dateLine(NOW)}
          summary={homeSummary(projects, NOW)}
          attention={homeAttention(projects, NOW, inCall)}
          explain={explain}
          reads={failed ? [{ state: 'failed', failed: READ_FAILED.projects, retry: () => undefined }] : []}
          loadingProjects={!projects && !failed}
          you={youDoor({ locked: locked ? 'you' : null, turns: [], notes: 0, now: NOW })}
          count={workCount(projects)}
          projects={projects}
          now={NOW}
          inCallProject={inCall}
          lockedBy={locked ? 'you' : null}
          actions={{
            personal: press('personal'),
            notes: press('notes'),
            work: press('work'),
            newProject: press('new project'),
            lock: press('lock'),
            explained: () => setExplain(false),
            room: (projectId, action) => pressed.push(`${action} ${projectId}`),
          }}
        />
      </div>
      {query.get('modal') === '1' && (
        <div className="fixture-sheet" role="dialog" aria-modal="true" aria-label="Your data">
          A sheet over Home
        </div>
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('home.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — Home over labelled projects, no account
    </p>
    <Home />
  </StrictMode>,
)
