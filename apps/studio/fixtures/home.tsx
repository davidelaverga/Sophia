// Home's fixture page (e2e/home.spec.ts): the Studio's own Welcome, inside Places' frame, over labelled simulated
// projects. The query string picks them: `projects=four` (default: Launch plan, Research notes, Design review, and
// Product launch, whose Standup starts in 10 min), `live` (Davide and Sophia in Pitch deck's room), `none`, `loading`,
// `failed` (their read failed); `locked=1` (the personal space locked), `call=<id>` (in that project's call);
// `away=1` (Home starts out of sight, as when someone lands on another place); `you=new` (no conversation yet), else
// one from yesterday with 3 notes; `voice=none` (no speech on this device), else one that hears "the launch felt rushed" when
// the check says so (`window.homeFixture.hear()`), if it is still listening. `window.homeFixture.pressed` lists each
// action taken,
// as "open <id>", "join <id>", "back <id>", "work", "new project", "unlock", "say <words>".
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { ProjectSummary } from '@sophia/contracts'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PersonalTurn } from '@sophia/contracts'
import {
  dateLine,
  greeting,
  READ_FAILED,
  sophiaSays,
  workCount,
  youDoor,
} from '../src/features/personal/places-view.ts'
import { homeRowFor } from '../src/features/personal/focus.ts'
import { Welcome } from '../src/features/personal/Welcome.tsx'
import { DEMO, DEMO_LABEL, HOME_PROJECT } from './demo.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'

declare global {
  interface Window {
    homeFixture?: { pressed: string[]; hear: () => void; landing: () => string | null }
  }
}

const query = new URLSearchParams(window.location.search)
const pressed: string[] = []
window.homeFixture = {
  pressed,
  hear: () => HeardRecognition.listening?.hear(),
  // Where the focus lands on the way back from Personal (focus.ts): an element's id, else its tag.
  landing: () => {
    const at = homeRowFor('personal')
    return at ? at.id || at.tagName.toLowerCase() : null
  },
}
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
const standup = { id: 'session-1', title: 'Standup', startsAt: at(10), endsAt: at(40), timeZone: 'UTC' }
const SETS: Record<string, ProjectSummary[] | undefined> = {
  four: [
    project(1, 'Launch plan'),
    project(2, 'Research notes', { members: 2 }),
    project(3, 'Design review'),
    project(4, HOME_PROJECT, { nextSession: standup }),
  ],
  live: [
    project(1, 'Launch plan'),
    project(5, 'Pitch deck', { room: { people: ['davide@sophia.test'], sophia: true } }),
  ],
  // The demo's (`demo`): its project's room is live, with Marco, Lucía and Sophia in it.
  demo: [
    project(4, HOME_PROJECT, {
      room: { people: ['Marco', 'Lucía'], sophia: true },
    }),
    project(1, 'Launch plan'),
    project(2, 'Research notes', { members: 2 }),
    project(3, 'Design review'),
  ],
  none: [],
  loading: undefined,
  failed: undefined,
}
const set = query.get('projects') ?? (DEMO ? 'demo' : 'four')
const projects = SETS[set]
const inCall = query.get('call')
const call = inCall ? { title: projects?.find((p) => p.projectId === inCall)?.title ?? '' } : null

const yesterday = new Date(NOW.getTime() - 26 * 3_600_000).toISOString()
// The demo's Personal: its last words minutes ago, as Home's «Continue» says them.
const lastWords = DEMO ? new Date(NOW.getTime() - 8 * 60_000).toISOString() : yesterday
const turn = (text: string): PersonalTurn => ({
  id: 't1',
  seq: 1,
  author: 'person',
  text,
  createdAt: lastWords,
  replyTo: null,
  reply: 'answered',
  suggestion: null,
})
const fresh = query.get('you') === 'new'
const locked = query.get('locked') === '1'
const you = youDoor({
  locked: locked ? 'you' : null,
  turns: fresh
    ? []
    : [
        turn(
          DEMO ? 'Keep it here for now. I promised a date I couldn’t keep.' : 'The launch pressure is getting to me',
        ),
      ],
  // The demo's Personal keeps one note: Home says the same.
  notes: fresh ? 0 : DEMO ? 1 : 3,
  now: NOW,
})

/** A voice this page can hear: it says one sentence when the check says so, never on a timer that load can race. */
class HeardRecognition extends EventTarget {
  lang = ''
  interimResults = false
  continuous = false
  processLocally = true
  static available = () => Promise.resolve(query.get('voice') === 'none' ? 'unavailable' : 'available')
  static install = () => Promise.resolve(true)
  /** The recognizer listening now, if one is. */
  static listening: HeardRecognition | null = null
  start() {
    HeardRecognition.listening = this
  }
  hear() {
    HeardRecognition.listening = null
    this.dispatchEvent(Object.assign(new Event('result'), { results: [[{ transcript: 'the launch felt rushed' }]] }))
    this.dispatchEvent(new Event('end'))
  }
  stop() {
    if (HeardRecognition.listening === this) HeardRecognition.listening = null
    this.dispatchEvent(new Event('end'))
  }
  abort() {
    if (HeardRecognition.listening === this) HeardRecognition.listening = null
  }
}
Reflect.set(globalThis, 'SpeechRecognition', HeardRecognition)

/** Words handed to Sophia's conversation, as Places hands them (it opens Personal and its composer sends them). */
const say = (text: string) => pressed.push(`say ${text}`)

/** Home, with a way to step away from it (as going to another place does), for the checks of what stops out of sight. */
function Home() {
  const [away, setAway] = useState(query.has('away'))
  return (
    <div className="places" data-place="home">
      {/* The check's own control: not part of a demo's recording. */}
      {!DEMO && (
        <button className="fixture-away" type="button" onClick={() => setAway((was) => !was)}>
          {away ? 'Back to Home' : 'Leave Home'}
        </button>
      )}
      <div className="c-home" data-place-view="home" hidden={away}>
        <Welcome
          hello={greeting(NOW.getHours(), null, false)}
          name="Luis"
          date={dateLine(NOW)}
          says={sophiaSays(projects, NOW, call)}
          you={you}
          reads={set === 'failed' ? [{ state: 'failed', failed: READ_FAILED.projects, retry: () => undefined }] : []}
          projects={projects}
          loadingProjects={set === 'loading'}
          now={NOW}
          inCallProject={inCall}
          count={workCount(projects)}
          locked={locked}
          hidden={away}
          actions={{
            personal: () => pressed.push('personal'),
            notes: () => pressed.push('notes'),
            work: () => pressed.push('work'),
            newProject: () => pressed.push('new project'),
            unlock: () => pressed.push('unlock'),
            room: (projectId, action) => pressed.push(`${action} ${projectId}`),
            say,
          }}
        />
      </div>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('home.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note" data-demo={DEMO || undefined}>
      {DEMO ? DEMO_LABEL : 'Simulated — Home over labelled projects, no account'}
    </p>
    <Home />
  </StrictMode>,
)
