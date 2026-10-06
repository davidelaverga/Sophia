// The room's fixture page for the preservation checks (e2e/room.spec.ts): the Studio's own ProjectShell, with its
// project feed, query cache and room controller, over two faked boundaries: the API, answered at fetch
// (fixture-api.ts), and LiveKit (fake-livekit.ts, which the fixtures' Vite config puts in its place). It reaches no
// server and says so on screen. The query string picks the scenario: `call=on` (join on opening), `exchange=open`
// (Sophia's conversation is open and this viewer holds the floor), `refuse=camera` (the browser refuses it),
// `lobby=waiting` (someone is at the door), `place=knowledge` (Knowledge instead of the room; `place=work`, the Work
// page with the research task's card), `hold=sources` (the report's sources come only once the check lets them through;
// `hold=text`, its text; `hold=task`, the research task's record), `tamper=text` (its text arrives as bytes its record
// does not name), `title=long` (the report's title runs far past the side pane's width), `versions=3` (that many of the
// report's versions are published already), `history=pilot` (its first two are shaped like the pilot's, CX-0026); the
// report viewer's own parameters (`report=…`) open the fixture report (report-data.ts). `window.fixture` lets a check
// move the project on, have a member write, drop the call, publish the report's next version, deliver a result notice
// (its revision, or a brief's) or a live caption, have Sophia leave, or read what happened. Others in the room, the
// floor, who speaks, Sophia's states and video come from fake-people.ts (`people`, `floor=1|me|absent`, `speaking`,
// `sophia=here|listening|settling|answering|speaking|blocked`, `voice`, `paused`, `video=camera|screen`,
// `looking=screen`; docs/plans/room-fixture-people.md).
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { ChatCaption } from '@sophia/contracts/room-chat'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountMenu } from '../src/app/AccountMenu.tsx'
import type { View } from '../src/app/route.ts'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { noteKept, type Notes } from './brief-data.ts'
import { noShowing, walked } from './focus-data.ts'
import { newMeeting, type Meeting } from './meeting-data.ts'
import { ABSENT, identity, membership, PROJECT, type RoomAsked, type Said } from './data.ts'
import type { CallEnd } from '../src/features/voice/call-end.ts'
import { asked, deliverCaption, deliverNotice, dropCall, leaving, sophiaLeaves } from './fake-livekit.ts'
import {
  count,
  endPause,
  nameOf,
  oneOfUs,
  others,
  personId,
  setSophia,
  setSpeaking,
  sophiaAsked,
  type SophiaState,
} from './fake-people.ts'
import {
  installFixtureApi,
  publish,
  releaseSources,
  releaseTask,
  releaseText,
  served,
  unexpected,
} from './fixture-api.ts'
import {
  briefNotice,
  LONG_TITLE,
  REPORT,
  researchNotice,
  revisedNotice,
  SOPHIAS_DESCRIPTION,
  TEAMMATE,
  TITLE,
  versionId,
} from './report-data.ts'

interface Fixture {
  /** A background update: an event on the project's stream, and a new snapshot and brief behind it. */
  update: () => void
  /** Another member writes in the room's discussion, and the event saying so goes out. */
  say: (text: string) => void
  /** The call's connection is lost. */
  drop: (why?: CallEnd) => void
  /** The fixture report's next version is published (the viewer learns of it when it reads the list again). */
  publishReport: () => void
  /** Sophia publishes the report's next version while it is open: the project's feed says so at once. */
  reviseLive: () => void
  /** A finished research result is told in the chat, as the bridge tells a member. */
  notice: () => void
  /**
   * The same task's result is revised: the report's second version is published, the task's record names it, and its
   * notice (revision 2) reaches the chat (CX-0022).
   */
  noticeRevised: () => void
  /** The page asked for is published while the person is away (`design=designing`, B-19). */
  designPublished: () => void
  /** The same task's result told as a brief's (synthetic): a card of another kind over the same files. */
  noticeBrief: () => void
  /** The research task's record, held since the page opened (`hold=task`), comes now. */
  releaseTask: () => void
  /** The running research task has read `reads` sources (`research=running`). */
  researchProgress: (reads: number) => void
  /** The running research task finished: it stays in the project's work, its result ready, as the API keeps it. */
  researchDone: () => void
  /** Something is built on every note in the brief: withdrawing one would take it too (brief-data.ts). */
  buildOnNotes: () => void
  /** The `n`th other person (or `me`, from another device) shows the report's current version; null, nothing is. */
  show: (n: number | 'me' | null) => void
  /** Sophia moves the shown report's focus to a section, as her `present_section` would (A14). */
  sophiaWalks: (anchor: string) => void
  /** The next message to the room lands, but its reply is lost: the page can't tell it was recorded. */
  loseNextContributionReply: () => void
  /** The next show lands, but its reply is lost: the page can't tell it was committed. */
  loseNextFocusReply: () => void
  /** The next close of the meeting lands, but its reply is lost. */
  loseNextCloseReply: () => void
  /** A note is kept in the brief, as by this viewer's Keep in another tab: the project moves. */
  keep: (text: string) => void
  /** The next «Mark as seen» lands, but its reply is lost. */
  loseNextSeenReply: () => void
  /** Leaving the call waits until `releaseLeave`, as a slow disconnect. */
  holdLeave: () => void
  /** Leaving the call fails on LiveKit's side, as a disconnect that rejects. */
  failLeave: () => void
  releaseLeave: () => void
  /** The recap's reads wait until `releaseRecaps`. */
  holdRecaps: () => void
  releaseRecaps: () => void
  /** The recap's reads fail (503) until called with false. */
  failRecaps: (fails?: boolean) => void
  /** The notes members wrote in the brief, by their text. */
  notes: () => readonly (string | null)[]
  /** The next note written lands, but its reply is lost: the page can't tell it was kept. */
  loseNextReply: () => void
  /** Reads of the research task fail from now on; given false, they succeed again. */
  failTask: (fails?: boolean) => void
  /** A live caption packet reaches this member, as the bridge sends what is said aloud (CX-0023): synthetic text. */
  caption: (packet: ChatCaption) => void
  /** Sophia's participant leaves the room (her bridge lost its link, or restarted). */
  sophiaLeaves: () => void
  /** A teammate edits the report's description elsewhere (the page learns of it when it reads the cards again). */
  describeElsewhere: (text: string) => void
  /** Reads of the report's versions fail from now on: unavailable, or refused (`not_found`); given false, they succeed. */
  failVersions: (how?: 'unavailable' | 'not_found' | false) => void
  /** The report's sources, held since the page opened (`hold=sources`), come now. */
  releaseSources: () => void
  /** Reads of the report's sources wait again from now on, until released. */
  holdSources: () => void
  /** The report's text, held since the page opened (`hold=text`), comes now. */
  releaseText: () => void
  /** The person goes home: the project is kept out of sight for its call, and the address is the places'. */
  away: () => void
  /** Back to the project, as the places' call control brings it back: its address names no report. */
  back: () => void
  /** Sophia's participant says this now (fake-people.ts). */
  sophia: (state: SophiaState) => void
  /** Who speaks now: 0 the viewer, `n` the `n`th other person, null no one. */
  speaking: (who: number | null) => void
  /** Another member's change reaches the API just before the page's next pass: that pass is refused as stale. */
  moveRoom: () => void
  /** Whom the floor was passed to, by name, in order. */
  floorTo: readonly string[]
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

/** The floor's holder the page asked for: the viewer, the `n`th other person, or someone not in the room. */
function holderAsked(floor: string | null): string | undefined {
  if (floor === 'me') return membership.actorId
  if (floor === 'absent') return ABSENT
  const n = oneOfUs(floor, false)
  return n === null ? undefined : personId(n)
}

const VOICES = ['recovering', 'unavailable'] as const
const PAUSES = ['guest', 'holder_left'] as const
const oneOf = <T extends string>(list: readonly T[], value: string | null): T | undefined =>
  list.find((item) => item === value)

/** A synthetic session on the room's calendar, starting `minutes` from now, for half an hour. */
function sessionIn(minutes: number) {
  const start = Date.now() + minutes * 60_000
  return {
    id: '00000000-0000-4000-8000-0000000000e9',
    title: 'Pilot review',
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 30 * 60_000).toISOString(),
    timeZone: 'UTC',
  }
}

const room: RoomAsked = {
  holder: holderAsked(query.get('floor')),
  voice: oneOf(VOICES, query.get('voice')),
  pauseReason: oneOf(PAUSES, query.get('paused')),
  // She sees a screen only while one is shared (`video=screen`): the first person's, so there must be one.
  looking:
    query.get('looking') === 'screen' && query.get('video') === 'screen' && count > 0
      ? { participantIdentity: personId(1), source: 'screen' }
      : null,
  // `session=soon`: a session on the room's calendar starts in ten minutes (Sophia's line names it).
  sessions: query.get('session') === 'soon' ? [sessionIn(10)] : [],
}
const floorTo: string[] = []

const project = {
  revision: 1,
  exchange: query.get('exchange') === 'open' || sophiaAsked,
  room,
  roomMoves: false,
  // As the API passes it: a new holder, one more pass, and a pause because the holder left is over.
  onFloor: (actorId: string) => {
    room.holder = actorId
    room.inputEpoch = (room.inputEpoch ?? 1) + 1
    if (room.pauseReason === 'holder_left') {
      room.pauseReason = undefined
      endPause()
    }
    floorTo.push(nameOf(actorId))
  },
  messages: [] as (string | Said)[],
  contributions: new Map(),
  loseContributionReply: false,
  reportVersions: Math.max(1, Number(query.get('versions')) || 1),
  reportTitle: query.get('title') === 'long' ? LONG_TITLE : TITLE,
  pilot: query.get('history') === 'pilot',
  waiting: query.get('lobby') === 'waiting',
  ...(query.get('role') === 'viewer' ? { role: 'viewer' as const } : {}),
  description: SOPHIAS_DESCRIPTION,
  versionsFail: false as false | 'unavailable' | 'not_found',
  sourcesHeld: query.get('hold') === 'sources',
  textHeld: query.get('hold') === 'text',
  taskRevision: 1 as 1 | 2,
  taskHeld: query.get('hold') === 'task',
  taskFails: false,
  researching: query.get('research') === 'running' ? { reads: 0 } : null,
  textTampered: query.get('tamper') === 'text',
  designed: query.get('designed') === 'on',
  designing: query.get('design') === 'designing',
  pageTampered: query.get('tamper') === 'html',
  work: query.get('place') === 'work',
  // `notes=off`: the brief allows this person no note.
  showing: noShowing(),
  // A12: the meeting this visit is, its recap built from what happens on the page (meeting-data.ts).
  // `meeting=earlier`: the running meeting began 12 minutes before the page, so joining is joining late.
  meeting: newMeeting(
    () => meetingRecords(),
    () => asked.includes('connect'),
    query.get('meeting') === 'earlier' ? Date.now() - 12 * 60_000 - 5_000 : Date.now(),
  ),
  notes: {
    kept: [],
    written: 0,
    receipts: new Map(),
    loseReply: false,
    builtOn: false,
    refused: query.get('notes') === 'off',
    unread: query.get('notes') === 'unread',
  } as Notes,
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
  reviseLive: () => {
    project.reportVersions += 1
    publish(project)
  },
  notice: () => {
    project.meeting.made = true
    deliverNotice(researchNotice)
  },
  noticeRevised: () => {
    project.reportVersions = 2
    project.taskRevision = 2
    deliverNotice(revisedNotice)
  },
  noticeBrief: () => deliverNotice(briefNotice),
  designPublished: () => {
    project.designing = false
    project.designed = true
    publish(project)
  },
  releaseTask: () => releaseTask(project),
  researchProgress: (reads) => {
    project.researching = { reads }
  },
  researchDone: () => {
    project.researching = null
    project.work = true
    publish(project)
  },
  buildOnNotes: () => {
    project.notes.builtOn = true
  },
  show: (n) => {
    project.showing.revision += 1
    project.showing.focus =
      n === null
        ? null
        : {
            artifactVersionId: versionId(project.reportVersions),
            guideId: n === 'me' ? membership.actorId : personId(n),
          }
    project.showing.at = { anchor: null, by: 'member', shownAt: project.showing.revision }
    publish(project)
  },
  sophiaWalks: (anchor) => {
    walked(project.showing, anchor)
    publish(project)
  },
  loseNextContributionReply: () => {
    project.loseContributionReply = true
  },
  loseNextFocusReply: () => {
    project.showing.loseReply = true
  },
  loseNextCloseReply: () => {
    project.meeting.loseReply = true
  },
  keep: (text) => {
    noteKept(
      project.notes,
      JSON.stringify({ kind: 'observation', epistemic: 'reported', text }),
      project.revision,
      `keep-${text}`,
    )
    publish(project)
  },
  loseNextSeenReply: () => {
    project.meeting.seen.loseReply = true
  },
  holdLeave: () => {
    leaving.held = true
  },
  failLeave: () => {
    leaving.fails = true
  },
  releaseLeave: () => {
    leaving.held = false
    for (const done of leaving.waiting.splice(0)) done()
  },
  holdRecaps: () => {
    project.meeting.recaps.held = []
  },
  releaseRecaps: () => {
    const held = project.meeting.recaps.held ?? []
    project.meeting.recaps.held = null
    for (const release of held) release()
  },
  failRecaps: (fails = true) => {
    project.meeting.recaps.fail = fails
  },
  notes: () => project.notes.kept.map((entry) => entry.text),
  loseNextReply: () => {
    project.notes.loseReply = true
  },
  failTask: (fails = true) => {
    project.taskFails = fails
  },
  caption: deliverCaption,
  sophiaLeaves,
  describeElsewhere: (text) => {
    project.description = { text, revision: project.description.revision + 1, author: TEAMMATE }
  },
  failVersions: (how = 'unavailable') => {
    project.versionsFail = how
  },
  releaseSources: () => releaseSources(project),
  holdSources: () => {
    project.sourcesHeld = true
  },
  releaseText: () => releaseText(project),
  away: () => {
    window.history.pushState({ fixture: 'home' }, '', '/room.html?place=home') // the places' own entry
    sight.set?.(false)
  },
  back: () => {
    window.history.pushState(null, '', '/room.html')
    sight.set?.(true)
  },
  sophia: setSophia,
  speaking: setSpeaking,
  moveRoom: () => {
    project.roomMoves = true
  },
  floorTo,
  asked,
  served,
  unexpected,
}

/** The meeting's records as the page holds them now: who is in it, the decision, the report made, the notes kept. */
function meetingRecords(): ReturnType<Meeting['records']> {
  const people = others()
  const at = new Date().toISOString()
  return {
    people: [membership.actorId, ...people.filter((p) => p.standing !== 'guest').map((p) => p.identity)].map(
      (actorId) => ({
        actorId,
      }),
    ),
    guests: people.filter((p) => p.standing === 'guest').length,
    decided: [
      {
        decisionId: '00000000-0000-4000-8000-0000000000ad',
        statement: 'Pilot the fixture with fourteen teams',
        proposedBy: personId(1),
        decidedBy: membership.actorId,
        at,
        undoable: false,
      },
    ],
    made: project.meeting.made
      ? [
          {
            artifactId: REPORT,
            artifactVersionId: versionId(project.reportVersions),
            title: project.reportTitle,
            versionNumber: project.reportVersions,
            askedBy: membership.actorId,
          },
        ]
      : [],
    noted: project.notes.kept.map((e) => ({
      entryId: e.id,
      kind: e.kind,
      text: e.text ?? '',
      authoredBy: e.authoredBy,
      actorId: e.actorId,
      at: e.recordedAt,
    })),
    open: [],
    work: [],
    // The proposed `names` (#105): every actor the fixture knows, so a name shows where the room never saw them.
    names: Object.fromEntries(
      [1, 2, 3, 4, 5]
        .map((n): [string, string] => [personId(n), nameOf(personId(n))])
        .concat([[membership.actorId, 'Fixture viewer']]),
    ),
  }
}

const nothing = () => undefined

/** The page `place=` names: Knowledge, Work (with the research task's card), Updates, else the room. */
const viewOf = (place: string | null) =>
  place === 'knowledge' || place === 'work' || place === 'updates' ? place : 'studio'

/** The views this fixture's API serves: the room, Knowledge, Work and Updates. The others' reads aren't faked, so their links stay. */
const SERVED: readonly View[] = ['studio', 'knowledge', 'work', 'updates']

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

/** The project as App.tsx shows it: its view moves as the person picks another (ViewNav, the mini dock). */
function Project() {
  const [view, setView] = useState<View>(viewOf(query.get('place')))
  return (
    <ProjectShell
      projectId={PROJECT}
      view={view}
      identity={identity}
      account={
        <AccountMenu
          identity={identity}
          where="project"
          actions={{ data: nothing, privacy: nothing, chooseDev: nothing, signOut: nothing }}
        />
      }
      onShow={(next) => {
        if (SERVED.includes(next)) setView(next)
      }}
      onLeave={nothing}
      onWork={nothing}
      onSignOut={nothing}
      joinOnOpen={query.get('call') === 'on'}
    />
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
        <Project />
      </Kept>
    </QueryClientProvider>
  </StrictMode>,
)
