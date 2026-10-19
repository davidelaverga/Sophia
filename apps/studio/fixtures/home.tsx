// Home's fixture page (e2e/home.spec.ts): the Studio's own Welcome, inside Places' frame, over labelled simulated
// projects. The query string picks them: `projects=four` (default: Launch plan, Research notes, Design review, and
// Product launch, whose Standup starts in 10 min), `quiet` (the same four, the Standup tomorrow), `live` (Davide and
// Sophia in Pitch deck's room), `none`, `loading`, `failed` (their read failed); `window.homeFixture.reread(<set>)`
// reads them again with Home open, as Places does every 20 s, and answers that set; `locked=1` (the personal space
// locked), `call=<id>` (in that project's call, which `window.homeFixture.hangUp()` ends with Home open);
// `away=1` (Home starts out of sight, as when someone lands on another place); `companion=unavailable|reading` (Sophia
// can't answer in the personal space; or that isn't known yet), else she answers; `you=new` (no conversation yet), else
// one from yesterday with 3 notes; `voice=none` (no speech on this device), else one that hears "the launch felt rushed" when
// the check says so (`window.homeFixture.hear()`), if it is still listening. `window.homeFixture.pressed` lists each
// action taken,
// as "open <id>", "join <id>", "back <id>", "work", "new project", "unlock", "say <words>", "need <id>". `needs=some|none`: what
// needs you on the right (the vision flag; the demo's some); absent, the Studio's own Home, her light alone.
// `since=some|more|mine|seen`: what changed in each project since you last looked, read as Home reads it (below).
import { requestAddress } from '../src/features/resources/link.ts'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { ProjectSummary, ProjectUpdates } from '@sophia/contracts'
import { StrictMode, useEffect, useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import type { PersonalTurn } from '@sophia/contracts'
import {
  dateLine,
  greeting,
  homeShown,
  READ_FAILED,
  sophiaSays,
  workCount,
  youDoor,
} from '../src/features/personal/places-view.ts'
import { homeRowFor } from '../src/features/personal/focus.ts'
import type { Need } from '../src/features/personal/needs-you.ts'
import { VISION } from '../src/app/vision.ts'
import { Welcome } from '../src/features/personal/Welcome.tsx'
import { DEMO, DEMO_LABEL, HOME_PROJECT, PROJECT_NAME } from './demo.ts'
import { PROJECT } from './data.ts'
import { newMeeting, nothingSince, updatesWindowOf } from './meeting-data.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'
import { bootTheme } from '../src/app/theme.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNeeds } from '../src/features/personal/useNeeds.ts'
import { useCallSeen, useSaidOnce, useSinceNews } from '../src/features/personal/useSinceNews.ts'
import { turnShown } from '../src/features/personal/turn-shown.ts'
import { needsAnswer } from './fixture-api.ts'
import { InvitedBand } from '../src/features/access/InvitedBand.tsx'

declare global {
  interface Window {
    homeFixture?: {
      pressed: string[]
      hear: () => void
      landing: () => string | null
      needsReads: () => number
      /** `needsFail=1`: the route fails until this is called (the service back), so Try again can be seen to work. */
      recover: () => void
      /** The service goes away after a good read: every read from now on fails, the rows read last are kept. */
      breakNeeds: () => void
      /** The service refuses the person from now on (403): what was read before is not shown any more. */
      refuseNeeds: () => void
      /** `needs=api`: a decision due in 5 min comes, so it goes first, and the list is read again (the 20 s poll). */
      urgentNeed: () => void
      /** `needs=api`: a need leaves (answered elsewhere), and the list is read again. */
      dropNeed: (id: string) => void
      /** The projects are read again with Home open (Places reads them every 20 s) and answer another set. */
      reread: (set: string) => void
      /** `since=…`: the projects whose window was read, in the order asked. */
      sinceReads: () => string[]
      /** `call=<id>`: the call ends with Home open, as Leave in the places' bar ends it. */
      hangUp: () => void
    }
  }
}

const query = new URLSearchParams(window.location.search)
bootTheme(query.get('theme'))
const pressed: string[] = []
/** What `homeFixture.reread` answers: Home's own set, once it is on the page. */
let answerWith: (set: string) => void = () => undefined
/** What `homeFixture.hangUp` ends: Home's call, once it is on the page. */
let hangUp: () => void = () => undefined
/** How many times the needs' route was read (`needs=api`): none behind a shut padlock. */
let needsReads = 0
window.homeFixture = {
  pressed,
  needsReads: () => needsReads,
  recover: () => {
    failing = null
  },
  breakNeeds: () => {
    failing = 503
  },
  refuseNeeds: () => {
    failing = 403
  },
  urgentNeed: () => {
    urgent = true
    void client.invalidateQueries({ queryKey: ['vision', 'needs'] })
  },
  dropNeed: (id) => {
    seen.add(id)
    void client.invalidateQueries({ queryKey: ['vision', 'needs'] })
  },
  hear: () => HeardRecognition.listening?.hear(),
  reread: (next) => answerWith(next),
  sinceReads: () => [...sinceReads],
  hangUp: () => hangUp(),
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
  // The four after a while away (`quiet`): Product launch's Standup is tomorrow, so nothing starts soon and nobody is
  // in a room.
  quiet: [
    project(1, 'Launch plan'),
    project(2, 'Research notes', { members: 2 }),
    project(3, 'Design review'),
    project(4, HOME_PROJECT, { nextSession: { ...standup, startsAt: at(24 * 60 + 10), endsAt: at(24 * 60 + 40) } }),
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
/** `call=<id>`: the project whose call the person is in, until `homeFixture.hangUp()`. */
const CALL = query.get('call')
const callIn = (projectId: string | null) =>
  projectId ? { title: SETS[set]?.find((p) => p.projectId === projectId)?.title ?? '' } : null

/** What needs you, one of each kind, given out of order: the page orders them by urgency. */
const NEEDS: Record<string, Need[] | undefined> = {
  some: [
    {
      id: 'r1',
      kind: 'review',
      title: 'Q3 retention report, v3',
      project: 'Research notes',
      expiresAt: null,
      detail: 'Davide asks',
    },
    {
      id: 'p1',
      kind: 'permission',
      title: 'Claude Code asks to run the export tests',
      project: 'Launch plan',
      expiresAt: at(130),
      detail: null,
    },
    {
      id: 'g1',
      kind: 'guest',
      title: 'Marco Pereira is in the lobby',
      project: 'Design review',
      expiresAt: null,
      detail: 'Waiting 2 min',
    },
    {
      id: 'd1',
      kind: 'decision',
      title: 'Ship the retry with the hotfix?',
      project: HOME_PROJECT,
      expiresAt: at(20),
      detail: null,
    },
    {
      id: 's1',
      kind: 'reply',
      title: 'Sophia replied about the launch date',
      project: null,
      expiresAt: null,
      detail: 'Yesterday',
    },
  ],
  none: [],
}
const needs = VISION ? NEEDS[query.get('needs') ?? (DEMO ? 'some' : '')] : undefined
/**
 * `needs=api`: the Studio's own read of GET /api/v1/me/needs (api/needs.ts), answered here as the fixture's API would;
 * its seen write (POST …/needs/<id>/seen) is recorded as "seen <id>" and that need leaves the next answer.
 */
const viaApi = query.get('needs') === 'api'
/** `needsFail=1`: every read of the route fails (503) until `homeFixture.recover()`, so Home's note and its Try again can be checked. */
let failing: number | null = query.get('needsFail') === '1' ? 503 : null
/** The needs the answer leaves out: marked seen, or dropped (`homeFixture.dropNeed`). */
const seen = new Set<string>()
/** `homeFixture.urgentNeed()`: the answer adds a decision due in 5 min. */
let urgent = false
const urgentNeed = (now: number) => ({
  id: 'decision:d2',
  kind: 'decision',
  title: 'Approve the pricing copy?',
  projectId: PROJECT,
  projectTitle: PROJECT_NAME,
  expiresAt: new Date(now + 5 * 60_000).toISOString(),
  detail: null,
  at: new Date(now - 60_000).toISOString(),
  ref: { kind: 'work_decision', id: 'd2', within: '00000000-0000-4000-8000-0000000000c3', resourceId: null },
})
if (viaApi) {
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const { pathname } = new URL(url, window.location.href)
    const marked = /^\/api\/v1\/me\/needs\/([^/]+)\/seen$/.exec(pathname)
    if (marked && init?.method === 'POST') {
      const needId = decodeURIComponent(marked[1] ?? '')
      seen.add(needId)
      pressed.push(`seen ${needId}`)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (pathname === '/api/v1/me/needs') {
      needsReads += 1
      if (failing !== null) {
        const error =
          failing === 403
            ? { code: 'forbidden', message: 'Not permitted' }
            : { code: 'dependency_unavailable', message: 'The service is away' }
        const body = JSON.stringify({ error })
        return Promise.resolve(new Response(body, { status: failing, headers: { 'content-type': 'application/json' } }))
      }
      const now = Date.now()
      const answer = needsAnswer(now)
      const all = [...(urgent ? [urgentNeed(now)] : []), ...answer.needs]
      const body = JSON.stringify({ ...answer, needs: all.filter((n) => !seen.has(n.id)) })
      return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' } }))
    }
    return real(input, init)
  }
}
/**
 * `invited=1`: one member invitation waits for the person (A16): GET /api/v1/me/invitations answers it as the API
 * would, and POST /api/v1/invitations/<id>/accept is recorded as "accept <id>" and answers the project (the band then
 * reads the list again, empty). The band's Accept opens the project: recorded as "open <projectId>".
 */
const INVITED = query.get('invited') === '1'
const INVITATION = {
  id: '00000000-0000-4000-8000-0000000000a1',
  projectId: '00000000-0000-4000-8000-0000000000b1',
  projectTitle: 'Onboarding pilot',
  inviter: 'luis@sophia.test',
  role: 'editor',
  expiresAt: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
}
const json = (value: unknown) =>
  Promise.resolve(new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }))
if (INVITED) {
  const real = window.fetch.bind(window)
  let accepted = false
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const { pathname } = new URL(url, window.location.href)
    if (pathname === '/api/v1/me/invitations') return json({ invitations: accepted ? [] : [INVITATION] })
    if (pathname === `/api/v1/invitations/${INVITATION.id}/accept` && init?.method === 'POST') {
      accepted = true
      pressed.push(`accept ${INVITATION.id}`)
      return json({ projectId: INVITATION.projectId })
    }
    return real(input, init)
  }
}
/**
 * `since=some|more|mine|seen`: A34's window for each project (GET /api/v1/projects/<id>/since), as the fixture's meeting
 * answers it (meeting-data.ts's updatesWindowOf), after a seen mark. `some`: Launch plan holds 2 decisions and a new
 * report (the fixture's earlier decision and a proposal still open among them), Product launch a note kept, the others
 * nothing; `more`: one more decision in Launch plan's; `mine`: Launch plan holds the reader's own decision, the report
 * they asked for and a note kept in their name, and one decision of Marco's; `seen`: every window after a seen mark,
 * empty. `homeFixture.sinceReads()` lists the projects asked, in the order asked.
 */
const SINCE = query.get('since')
const sinceReads: string[] = []
const MARK = '3'
const MEMBER = '00000000-0000-4000-8000-0000000000c1'
/** The person reading, as A34 names actors: none of the fixture meeting's own. */
const READER = '00000000-0000-4000-8000-0000000000c2'
/** The account Home reads as: its token names the reader, as a signed-in token's subject does (unsigned here). */
const SINCE_ACCOUNT = { name: 'fixture-account', token: `e30.${btoa(JSON.stringify({ sub: READER }))}.fixture` }
const decision = (n: number) => ({
  decisionId: `00000000-0000-4000-8000-0000000000d${String(n)}`,
  statement: `Fixture decision ${String(n)}`,
  proposedBy: MEMBER,
  decidedBy: MEMBER,
  at: at(-60 * n),
  undoable: false,
})
/** Launch plan's window: the fixture's earlier meeting and `decisions` more since, with one report made. */
function launchPlanSince(decisions: number): ProjectUpdates {
  const meeting = newMeeting(
    () => ({
      people: [],
      guests: 0,
      decided: Array.from({ length: decisions }, (_, i) => decision(i + 1)),
      made: [
        {
          artifactId: '00000000-0000-4000-8000-0000000000e7',
          artifactVersionId: '00000000-0000-4000-8000-0000000000e8',
          title: 'Launch readout',
          versionNumber: 1,
          askedBy: MEMBER,
        },
      ],
      noted: [],
      open: [],
      work: [],
      names: { [MEMBER]: 'Marco' },
    }),
    () => true,
  )
  meeting.seen.sequence = MARK
  return updatesWindowOf(meeting, 9)
}
/** `mine`: Launch plan's window, mostly what the reader did themselves. */
const theirOwnSince = (): ProjectUpdates => ({
  ...nothingSince('9'),
  fromSequence: MARK,
  decided: [{ ...decision(1), decidedBy: READER }, decision(2)],
  made: [
    {
      artifactId: '00000000-0000-4000-8000-0000000000e7',
      artifactVersionId: '00000000-0000-4000-8000-0000000000e8',
      title: 'Launch readout',
      versionNumber: 1,
      askedBy: READER,
    },
  ],
  noted: [
    {
      entryId: '00000000-0000-4000-8000-0000000000f5',
      kind: 'observation',
      text: 'The readout goes out on Friday.',
      authoredBy: 'sophia',
      actorId: READER,
      at: at(-30),
    },
  ],
  names: { [MEMBER]: 'Marco', [READER]: 'Luis' },
})
function sinceOf(projectId: string): ProjectUpdates {
  if (SINCE === 'seen') return nothingSince('9')
  if (projectId === id(1) && SINCE === 'mine') return theirOwnSince()
  if (projectId === id(1)) return launchPlanSince(SINCE === 'more' ? 2 : 1)
  if (projectId !== id(4)) return nothingSince('9')
  const kept = {
    entryId: '00000000-0000-4000-8000-0000000000f4',
    kind: 'observation',
    text: 'The launch moves to the second week.',
    authoredBy: 'member' as const,
    actorId: MEMBER,
    at: at(-90),
  }
  return { ...nothingSince('9'), fromSequence: MARK, noted: [kept], names: { [MEMBER]: 'Marco' } }
}
if (SINCE) {
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const asked = /^\/api\/v1\/projects\/([^/]+)\/since$/.exec(new URL(url, window.location.href).pathname)?.[1]
    if (!asked) return real(input, init)
    sinceReads.push(asked)
    return json(sinceOf(asked))
  }
}
/** The band Home shows with `invited=1`: the person's own invitations, read and accepted as the Studio does. */
const INVITED_BAND = INVITED ? (
  <InvitedBand
    identity={{ name: 'Luis', role: 'admin', token: 'fixture-token' }}
    onOpen={(projectId) => pressed.push(`open ${projectId}`)}
  />
) : undefined
const client = new QueryClient()

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

/** Whether Sophia answers in the personal space, as the API's `companion` says: unknown while it is read. */
function answersOf(companion: string | null): boolean | undefined {
  if (companion === 'reading') return undefined
  return companion !== 'unavailable'
}
const answers = answersOf(query.get('companion'))
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
/** A need opened in a project: the view, the project, and the record's address (a request's, a decision's own, or its task's). */
const openPress = (
  view: string,
  projectId: string,
  where: { taskId?: string; decisionId?: string; requestId?: string; resourceId?: string },
) =>
  `open ${view} ${projectId}${
    where.requestId
      ? ` #request-${requestAddress(where.resourceId ?? null, where.requestId)}`
      : where.decisionId
        ? ` #decision-${where.decisionId}`
        : where.taskId
          ? ` #task-${where.taskId}`
          : ''
  }`

/** A personal log for the check of the seen mark: `log`, thirty turns in a short scrollport, the named reply (t9) the last, below the fold; `hidden`, the same under `hidden`. */
const TURNS = query.get('turns')

function FixtureLog({ hidden }: { hidden: boolean }) {
  return (
    <div className="msgs fixture-log" hidden={hidden} style={{ height: 120, overflow: 'auto' }}>
      {Array.from({ length: 30 }, (_, i) => (
        <div key={i} className="msg" data-turn={i === 29 ? 't9' : `t-${String(i)}`} style={{ height: 40 }}>
          turn {i}
        </div>
      ))}
    </div>
  )
}

/**
 * The fixture's personal space: with a log on the page (`turns=log|hidden`) the real watch decides, as it does in the
 * app; without one it is taken to show every turn it names. A hidden log gives up soon, for the check.
 */
const personalShown = (turnId: string | null) =>
  TURNS && turnId ? turnShown(turnId, TURNS === 'hidden' ? { within: 400 } : {}) : Promise.resolve(true)

/** What Home's presses do here: each is recorded in `homeFixture.pressed`. */
const ACTIONS: ComponentProps<typeof Welcome>['actions'] = {
  personal: () => pressed.push('personal'),
  notes: () => pressed.push('notes'),
  work: () => pressed.push('work'),
  newProject: () => pressed.push('new project'),
  unlock: () => pressed.push('unlock'),
  room: (projectId, action) => pressed.push(`${action} ${projectId}`),
  say,
  updates: (projectId) => pressed.push(`updates ${projectId}`),
}

/** The projects' set Home shows: the query's, until `homeFixture.reread` answers another. */
function useShown() {
  const [shown, setShown] = useState(set)
  useEffect(() => {
    answerWith = setShown
  }, [])
  return shown
}

/** The call the person is in (`call=<id>`), until `homeFixture.hangUp()` ends it with Home open. */
function useCall() {
  const [inCall, setInCall] = useState(CALL)
  useEffect(() => {
    hangUp = () => setInCall(null)
  }, [])
  return inCall
}

/**
 * Sophia's sentence, with what changed since you last looked read as Places reads it (`since=…`), and the call's
 * project read once as it ends, as SignedIn reads it.
 */
function useSays(projects: readonly ProjectSummary[] | undefined, away: boolean, inCall: string | null) {
  const call = callIn(inCall)
  const enabled = SINCE !== null
  useCallSeen(SINCE_ACCOUNT, inCall, enabled)
  const visit = useSinceNews(SINCE_ACCOUNT, projects && homeShown(projects, NOW), {
    here: !away,
    inCall: call !== null,
    covered: sophiaSays(projects, NOW, call, answers === true).length > 0,
    enabled,
  })
  const says = sophiaSays(projects, NOW, call, answers === true, visit.news)
  useSaidOnce(SINCE_ACCOUNT, visit, says)
  return says
}

/** Home, with a way to step away from it (as going to another place does), for the checks of what stops out of sight. */
function Home() {
  const [away, setAway] = useState(query.has('away'))
  const shown = useShown()
  const projects = SETS[shown]
  const inCall = useCall()
  const says = useSays(projects, away, inCall)
  const fromApi = useNeeds(
    'fixture-token',
    {
      project: (projectId, view, where) => pressed.push(openPress(view, projectId, where)),
      personal: (turnId) => {
        pressed.push('personal')
        return personalShown(turnId)
      },
    },
    { enabled: viaApi, locked },
  )
  return (
    <div className="places" data-place="home">
      {/* The check's own control: not part of a demo's recording, unless a check asks for it (`leave=1`). */}
      {(!DEMO || query.has('leave')) && (
        <button className="fixture-away" type="button" onClick={() => setAway((was) => !was)}>
          {away ? 'Back to Home' : 'Leave Home'}
        </button>
      )}
      {TURNS && <FixtureLog hidden={TURNS === 'hidden'} />}
      <div className="c-home" data-place-view="home" hidden={away}>
        <Welcome
          hello={greeting(NOW.getHours(), null, false)}
          name="Luis"
          date={dateLine(NOW)}
          says={says}
          you={you}
          reads={
            shown === 'failed'
              ? [{ state: 'failed', failed: READ_FAILED.projects, retry: () => undefined }]
              : fromApi.read
                ? [fromApi.read]
                : []
          }
          projects={projects}
          loadingProjects={shown === 'loading'}
          now={NOW}
          inCallProject={inCall}
          count={workCount(projects)}
          locked={locked}
          {...{ hidden: away, here: !away, invited: INVITED_BAND, answers }}
          needs={
            fromApi.seen ?? (needs ? { items: needs, open: (need) => pressed.push(`need ${need.id}`) } : undefined)
          }
          actions={ACTIONS}
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
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>
  </StrictMode>,
)
