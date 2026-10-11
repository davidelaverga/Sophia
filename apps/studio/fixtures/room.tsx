// The room's fixture page for the preservation checks (e2e/room.spec.ts): the Studio's own ProjectShell, with its
// project feed, query cache and room controller, over two faked boundaries: the API, answered at fetch
// (fixture-api.ts), and LiveKit (fake-livekit.ts, which the fixtures' Vite config puts in its place). It reaches no
// server and says so on screen. The query string picks the scenario: `call=on` (join on opening), `exchange=open`
// (Sophia's conversation is open and this viewer holds the floor), `refuse=camera` (the browser refuses it),
// `lobby=waiting` (someone is at the door), `place=knowledge` (Knowledge instead of the room; `place=work`, the Work
// page with the research task's card), `hold=sources` (the report's sources come only once the check lets them through;
// `hold=text`, its text; `hold=task`, the research task's record; `hold=covers`, the demo library's covers),
// `tamper=text` (its text arrives as bytes its record does not name), `title=long` (the report's title runs far past
// the side pane's width), `versions=3` (that many of the report's versions are published already), `history=pilot` (its
// first two are shaped like the pilot's, CX-0026); the report viewer's own parameters (`report=…`) open the fixture
// report (report-data.ts). `window.fixture` lets a check move the project on, have a member write, drop the call,
// publish the report's next version, deliver a result notice (its revision, or a brief's) or a live caption, have
// Sophia leave, or read what happened. Others in the room, the floor, who speaks, Sophia's states and video come from
// fake-people.ts (`people`, `floor=1|me|absent`, `speaking`,
// `sophia=here|listening|settling|answering|speaking|blocked`, `voice`, `paused`, `video=camera|screen`,
// `looking=screen`; docs/plans/room-fixture-people.md). `qualification=on`: the room token names a voice qualification
// grant (A15), so the page emits its voice receipts; `window.fixture.voices` attaches Sophia's voice and a member's,
// `voicesLeave` unsubscribes them (LiveKit keeps one element to attach again), and `grant` says whether the next room
// tokens name the grant.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { Goal, GoalCommand } from '@sophia/contracts'
import type { ChatCaption } from '@sophia/contracts/room-chat'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { forgetKept } from '../src/features/conversations/talk-store.ts'
import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountMenu } from '../src/app/AccountMenu.tsx'
import type { View } from '../src/app/route.ts'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import '../src/app/theme.css'
import { noteKept, type Notes } from './brief-data.ts'
import { noShowing, walked } from './focus-data.ts'
import { noReviews } from './review-data.ts'
import { noTasks, taskOf } from './task-data.ts'
import { finishedAfter, newMeeting, type Meeting } from './meeting-data.ts'
import { ABSENT, identity, membership, PROJECT, type RoomAsked, type Said } from './data.ts'
import type { CallEnd } from '../src/features/voice/call-end.ts'
import { CONVERSATION, conversationMission, conversations, messagesOf, quietConversation } from './conversation-data.ts'
import {
  asked,
  deliverCaption,
  deliverNotice,
  dropCall,
  leaving,
  sophiaLeaves,
  voicesArrive,
  voicesLeave,
} from './fake-livekit.ts'
import {
  count,
  endPause,
  nameOf,
  oneOfUs,
  others,
  personId,
  setFollowers,
  setSophia,
  setSpeaking,
  sophiaAsked,
  type SophiaState,
} from './fake-people.ts'
import {
  grantTokens,
  installFixtureApi,
  publish,
  releaseSources,
  releaseTask,
  releaseText,
  releaseCovers,
  served,
  unexpected,
} from './fixture-api.ts'
import { missionWrites } from './mission-writes.ts'
import {
  briefNotice,
  LONG_TITLE,
  REPORT,
  researchNotice,
  revisedNotice,
  SOPHIAS_DESCRIPTION,
  TEAMMATE,
  TITLE,
  TASK,
  versionId,
  VERSIONS_HELD,
} from './report-data.ts'
import { DEMO, DEMO_LABEL, DEMO_VERSION, VIEWER_NAME } from './demo.ts'
import type { ExchangeAction } from './exchange-writes.ts'
import { sophiaArrives, stopScene } from './room-scene.ts'
import { DEMO_GOALS, goalsAdmitted, goalsSettled } from './demo-goals.ts'
import { demoServedGoals } from './demo-work.ts'

interface Fixture {
  /** A background update: an event on the project's stream, and a new snapshot and brief behind it. */
  update: () => void
  /** The room's recent discussion goes (it moved past what the snapshot holds): a reply to it is refused (A20). */
  forgetDiscussion: () => void
  /** The account is forgotten, as signing out or switching identity forgets it (App): reads cleared, nothing kept. */
  forgetAccount: () => void
  /** The oldest message leaves the recent discussion (past what the snapshot holds); a reply to it keeps its quote. */
  dropOldest: () => void
  /** While on, the viewer's messages land but their replies wait for `releaseMessages`. */
  holdMessages: (on: boolean) => void
  releaseMessages: () => void
  /** While on, the read of which messages answer which fails (A20). */
  failReplies: (on: boolean) => void
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
  /** The next review lands, but its reply is lost (A16). */
  loseNextReviewReply: () => void
  /** The next review never reaches the API (A16). */
  dropNextReview: () => void
  /** Another member reviews the current version (A16). */
  reviewAs: (verdict: 'approved' | 'changes_requested') => void
  /** This person reviews the current version from another device, with these words (A16). */
  reviewAsMe: (verdict: 'approved' | 'changes_requested', note: string | null) => void
  /** The next review lands and the feed moves, and only then is its reply lost (A16). */
  publishThenLoseReview: () => void
  /** While on, reviews land but their replies wait for `releaseReviews` (A16). */
  holdReviews: (on: boolean) => void
  releaseReviews: () => void
  /** Reviews' reads fail, or read again (A16). */
  failReviewReads: (on: boolean) => void
  /** Reviews' reads held since the page opened (`reviews=hold`) are answered now (A16). */
  releaseReviewReads: () => void
  /** Tasks' reads held since the page opened (`tasks=hold`) are answered now (A17). */
  releaseTaskReads: () => void
  /** While on, searches wait; off, the waiting ones are answered (A13). */
  holdSearch: (on: boolean) => void
  /** The conversations' list reads fail, or read again (A18). */
  failConversations: (on: boolean) => void
  /** The second conversation gets a message: it is the newest now, and the list says so when read again (A18). */
  conversationMoves: () => void
  /** The brief's reads fail, or read again. */
  failMission: (on: boolean) => void
  /** While on, the brief's reads wait; off, the waiting ones are answered. */
  holdMission: (on: boolean) => void
  /** The running meeting closes (another member closed it), and the feed moves (chapter 7's update). */
  endMeeting: () => void
  /** The project list's reads fail, or read again (chapter 1). */
  failProjects: (on: boolean) => void
  /** While on, the project list's reads wait; off, the waiting ones are answered (chapter 1). */
  holdProjects: (on: boolean) => void
  /** Lets the held membership reads through, and every later one (`membership=hold`). */
  releaseMembership: () => void
  /** Marco carries a note to this project, and the feed moves (chapter 1). */
  carryIn: () => void
  /** While on, tasks' writes land but their replies wait for `releaseTasks` (A17). */
  holdTasks: (on: boolean) => void
  releaseTasks: () => void
  /** Tasks' reads fail, or read again (A17). */
  failTaskReads: (on: boolean) => void
  /** The next task's write lands, but its reply is lost (A17). */
  loseNextTaskReply: () => void
  /** Marco makes a task from the current version's first passage, for the `n`th other person or (null) anyone (A17). */
  taskBy: (n: number | null) => void
  /** These others follow the shown version (their `sophia.following`, A14); the rest follow nothing. */
  followers: (people: number[]) => void
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
  /**
   * Sophia's voice and the first other person's reach the page, in this order (hers first unless asked): an audio
   * element each, as LiveKit attaches them, a recycled one first.
   */
  voices: (order?: readonly ('sophia' | 'member')[]) => void
  /** Their tracks are unsubscribed: the elements go, and LiveKit keeps one to attach again. */
  voicesLeave: () => void
  /** The next room tokens name the voice qualification grant, or not (A15). */
  grant: (on: boolean) => void
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
  /** The library's covers, held since the page opened (`hold=covers`), come now, 400 ms apart. */
  releaseCovers: () => void
  /** The person goes home: the project is kept out of sight for its call, and the address is the places'. */
  away: () => void
  /** Back to the project, as the places' call control brings it back: its address names no report. */
  back: () => void
  /** Sophia's participant says this now (fake-people.ts). */
  sophia: (state: SophiaState) => void
  /** Who speak now: 0 the viewer, `n` the `n`th other person, several at once as a list; null no one. */
  speaking: (who: number | readonly number[] | null) => void
  /** Another member's change reaches the API just before the page's next pass: that pass is refused as stale. */
  moveRoom: () => void
  /** Whom the floor was passed to, by name, in order. */
  floorTo: readonly string[]
  /** What the room's connection was asked (fake-livekit.ts). */
  asked: readonly string[]
  /** What the API answered, as `snapshot:2` (fixture-api.ts). */
  served: readonly string[]
  unexpected: readonly string[]
  /** The writes that reached the brief, each with its body (mission-writes.ts). */
  missionWrites: readonly { path: string; body: unknown }[]
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

/** The research task's revision at the start: the demo's second, the plain fixture's first. */
const RESEARCH_REVISION: 1 | 2 = DEMO_VERSION

/** The floor moves as the API moves it: a new holder, one more pass, and a pause because the holder left is over. */
function floorMoves(actorId: string): void {
  room.holder = actorId
  room.inputEpoch = (room.inputEpoch ?? 1) + 1
  if (room.pauseReason === 'holder_left') {
    room.pauseReason = undefined
    endPause()
  }
  floorTo.push(nameOf(actorId))
}

const project = {
  revision: 1,
  exchange: query.get('exchange') === 'open' || sophiaAsked,
  room,
  roomMoves: false,
  // As the API passes it. In the demo a pass made from the page ends the scene: the bridge ends the old holder's words.
  onFloor: (actorId: string) => {
    if (DEMO) stopScene()
    floorMoves(actorId)
  },
  // The demo's goals (demo-goals.ts): Goals reads them; Tasks acts on them. A command moves its goal as the API admits
  // it, and a moment later the runtime confirms where it settles.
  goals: DEMO ? [...DEMO_GOALS] : ([] as Goal[]),
  // The demo's board (demo-work.ts): the rollout's plan, so its Tasks draw a board as a planned goal's do.
  ...(DEMO && { servedGoals: demoServedGoals }),
  ...(DEMO
    ? {
        onCommand: (command: GoalCommand) => {
          project.goals = goalsAdmitted(project.goals, command)
          publish(project)
          window.setTimeout(() => {
            project.goals = goalsSettled(project.goals, command.goalId)
            publish(project)
          }, 600)
        },
      }
    : {}),
  // The API reads who is in the room from the LiveKit server: a guest among them keeps her out.
  guestHere: () => others().some((p) => p.standing === 'guest'),
  // As the API and her bridge answer her presses (exchange-writes.ts): in, she listens; quieted, she listens; ended,
  // she leaves the room; a pause lifted, she listens to the holder.
  onExchange: (action: ExchangeAction) => {
    // In the demo, her presses cut the scene short (room-scene.ts).
    if (DEMO) stopScene()
    if (action === 'end') {
      // Ended, nothing of it stays: no pause, nothing she looked at.
      project.exchange = false
      room.pauseReason = undefined
      room.looking = null
      endPause()
      sophiaLeaves()
      return
    }
    if (action === 'resume') {
      room.pauseReason = undefined
      endPause()
      return
    }
    project.exchange = true
    setSophia('listening')
    // In the demo, asked in, she says where the project stands (room-alive.md).
    if (DEMO && action === 'start') {
      sophiaArrives((actorId) => {
        floorMoves(actorId)
        publish(project)
      })
    }
  },
  messages: [] as (string | Said)[],
  contributions: new Map(),
  loseContributionReply: false,
  messagesHeld: null as (() => void)[] | null,
  failReplies: false,
  // The demo publishes both its versions (the second region's revision), unless `versions=` says otherwise.
  reportVersions: Math.min(VERSIONS_HELD, Math.max(1, Number(query.get('versions')) || (DEMO ? 2 : 1))),
  reportTitle: query.get('title') === 'long' ? LONG_TITLE : TITLE,
  pilot: query.get('history') === 'pilot',
  // `lobby=again`: the one waiting has knocked twice, so Block is offered; `lobby=two`: two people wait.
  waiting: query.get('lobby') === 'waiting' || query.get('lobby') === 'again' || query.get('lobby') === 'two',
  lobbyAsked: query.get('lobby'),
  ...(query.get('role') === 'viewer' ? { role: 'viewer' as const } : {}),
  description: SOPHIAS_DESCRIPTION,
  versionsFail: false as false | 'unavailable' | 'not_found',
  sourcesHeld: query.get('hold') === 'sources',
  textHeld: query.get('hold') === 'text',
  // The demo's research is on its second version, as its report (both published by default).
  taskRevision: RESEARCH_REVISION,
  taskHeld: query.get('hold') === 'task',
  coversHeld: query.get('hold') === 'covers',
  // `fail=task`: every read of the research task is refused (503), as the hosted cards' detail went unread.
  taskFails: query.get('fail') === 'task',
  researching: query.get('research') === 'running' ? { reads: 0 } : null,
  researchFinished: false,
  textTampered: query.get('tamper') === 'text',
  // The demo's page is published, unless `design=designing` asks for it still being designed.
  designed: query.get('designed') === 'on' || (DEMO && query.get('design') !== 'designing'),
  designing: query.get('design') === 'designing',
  pageTampered: query.get('tamper') === 'html',
  work: query.get('place') === 'work',
  // `notes=off`: the brief allows this person no note.
  showing: noShowing(),
  // A18: the project's conversations (`conversations=1`; `=none`, none; `=fail`, the list fails; `messages=fail`, the
  // second one's messages fail), and the brief's context beside them.
  // The demo holds the conversations too: none of its views reads as broken.
  ...conversationsAsked(query.get('conversations') ?? (DEMO ? '1' : null), query.get('messages') === 'fail'),
  // A16: the versions' reviews (review-data.ts).
  // Chapter 1: what members carried in from Personal (`carried=1`), and the project list failing (`projects=fail`).
  carriedIn: query.has('carried')
    ? [
        // As the API orders them: oldest first (project-list.ts); the Studio shows them newest first.
        {
          id: '00000000-0000-4000-8000-0000000007f0',
          text: 'Name the sources we trust',
          ownerName: 'Lucía',
          mine: false,
          createdAt: '2026-10-05T10:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-0000000007f1',
          text: 'Start the deck from one number I trust',
          ownerName: VIEWER_NAME,
          mine: true,
          createdAt: '2026-10-05T16:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-0000000007f2',
          text: 'Ask finance for the March close',
          ownerName: 'Marco',
          mine: false,
          createdAt: '2026-10-06T09:00:00.000Z',
        },
      ]
    : [],
  projectsFail: query.get('projects') === 'fail',
  missionHeld: query.get('mission') === 'hold' ? waiting() : null,
  carriedElsewhere: query.get('carried') === 'elsewhere',
  reportsElsewhere: query.get('reports') === 'elsewhere',
  cardAhead: query.get('card') === 'ahead',
  projectsHeld: query.get('projects') === 'hold' ? waiting() : null,
  membershipHeld: query.get('membership') === 'hold' ? waiting() : null,
  // A13: searches held while the page asks (`holdSearch`).
  searchHeld: null as (() => void)[] | null,
  missionFails: false,
  reviews: {
    ...noReviews(query.get('reviews') === 'fail'),
    heldReads: query.get('reviews') === 'hold' ? waiting() : null,
  },
  // A17: the report's tasks (task-data.ts).
  tasks: {
    ...noTasks(nameOf, (id) => Number(id.slice(-1)), query.get('tasks') === 'fail'),
    heldReads: query.get('tasks') === 'hold' ? waiting() : null,
  },
  // A12: the meeting this visit is, its recap built from what happens on the page (meeting-data.ts).
  // `meeting=earlier`: the running meeting began 12 minutes before the page, so joining is joining late.
  // `meetings=none`: none before this one, so none closed yet (chapter 7's update has nothing to build from).
  meeting: {
    ...newMeeting(
      () => meetingRecords(),
      () => asked.includes('connect'),
      query.get('meeting') === 'earlier' ? Date.now() - 12 * 60_000 - 5_000 : Date.now(),
    ),
    noPast: query.get('meetings') === 'none',
    // The demo's readout, published before any meeting here: among what changed, never what a meeting made.
    ...(DEMO ? { published: () => [readoutMade()] } : {}),
  },
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
  forgetAccount: () => {
    queryClient.clear()
    forgetKept()
  },
  forgetDiscussion: () => {
    project.messages.length = 0
    publish(project)
  },
  dropOldest: () => {
    project.messages.shift()
    publish(project)
  },
  holdMessages: (on) => {
    if (!on) for (const reply of project.messagesHeld ?? []) reply()
    project.messagesHeld = on ? [] : null
  },
  releaseMessages: () => {
    const held = project.messagesHeld ?? []
    project.messagesHeld = null
    for (const reply of held) reply()
  },
  failReplies: (on) => {
    project.failReplies = on
  },
  drop: dropCall,
  // Never past the versions the fixture holds (the demo's two): a further publish changes nothing.
  publishReport: () => {
    project.reportVersions = Math.min(VERSIONS_HELD, project.reportVersions + 1)
  },
  reviseLive: () => {
    project.reportVersions = Math.min(VERSIONS_HELD, project.reportVersions + 1)
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
    finishedAfter(project.meeting, {
      taskId: TASK,
      artifactId: REPORT,
      artifactVersionId: versionId(project.reportVersions),
      versionNumber: project.reportVersions,
      title: project.reportTitle,
    })
    project.researching = null
    project.researchFinished = true // the live records keep it: «since you last looked» lists it done
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
  loseNextReviewReply: () => {
    project.reviews.loseReply = true
  },
  dropNextReview: () => {
    project.reviews.drop = true
  },
  reviewAs: (verdict) => reviewBy(personId(1), verdict, verdict === 'approved' ? null : 'Tighten it'),
  reviewAsMe: (verdict, note) => reviewBy(membership.actorId, verdict, note),
  publishThenLoseReview: () => {
    project.reviews.publishThenLose = true
  },
  holdReviews: (on) => {
    if (!on) for (const reply of project.reviews.held ?? []) reply()
    project.reviews.held = on ? [] : null
  },
  releaseReviews: () => {
    const held = project.reviews.held ?? []
    project.reviews.held = null
    for (const reply of held) reply()
  },
  failReviewReads: (on) => {
    project.reviews.failReads = on
  },
  releaseReviewReads: () => {
    const held = project.reviews.heldReads ?? []
    project.reviews.heldReads = null
    for (const answer of held) answer()
  },
  failConversations: (on) => {
    if (project.conversations) project.conversations.failList = on
  },
  conversationMoves: () => {
    const moved = project.conversations?.list.find((c) => c.id === CONVERSATION.briefs)
    if (moved) moved.lastAt = '2026-10-06T10:00:00.000Z'
  },
  failMission: (on) => {
    project.missionFails = on
  },
  endMeeting: () => {
    project.meeting.closedAt = new Date().toISOString()
    project.meeting.atClose = project.meeting.records()
    publish(project)
  },
  holdMission: (on) => {
    const held = project.missionHeld ?? []
    project.missionHeld = on ? held : null
    if (!on) for (const answer of held) answer()
  },
  failProjects: (on) => {
    project.projectsFail = on
  },
  holdProjects: (on) => {
    const held = project.projectsHeld ?? []
    project.projectsHeld = on ? held : null
    if (!on) for (const answer of held) answer()
  },
  releaseMembership: () => {
    const held = project.membershipHeld ?? []
    project.membershipHeld = null
    for (const answer of held) answer()
  },
  carryIn: () => {
    project.carriedIn = [
      ...project.carriedIn,
      {
        id: '00000000-0000-4000-8000-0000000007f9',
        text: 'Ask the team for one number we trust',
        ownerName: 'Marco',
        mine: false,
        createdAt: '2026-10-06T12:00:00.000Z',
      },
    ]
    publish(project)
  },
  holdSearch: (on) => {
    if (!on) for (const answer of project.searchHeld ?? []) answer()
    project.searchHeld = on ? waiting() : null
  },
  releaseTaskReads: () => {
    const held = project.tasks.heldReads ?? []
    project.tasks.heldReads = null
    for (const answer of held) answer()
  },
  holdTasks: (on) => {
    if (!on) for (const reply of project.tasks.held ?? []) reply()
    project.tasks.held = on ? [] : null
  },
  releaseTasks: () => {
    const held = project.tasks.held ?? []
    project.tasks.held = null
    for (const reply of held) reply()
  },
  failTaskReads: (on) => {
    project.tasks.failReads = on
  },
  loseNextTaskReply: () => {
    project.tasks.loseReply = true
  },
  taskBy: (n) => {
    const owner = n === null ? null : personId(n)
    const from = {
      artifactId: REPORT,
      versionId: versionId(project.reportVersions),
      passage: '0.0.3',
      quote: DEMO ? 'The shorter checklist is the change most tied to teams that stayed.' : 'The fixture holds.',
    }
    project.tasks.list.unshift(taskOf(project.tasks, personId(1), { text: 'Check the figures', owner, from }))
    publish(project)
  },
  followers: (people) => setFollowers(people, project.showing.focus?.artifactVersionId ?? ''),
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
  voices: voicesArrive,
  voicesLeave,
  grant: grantTokens,
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
  releaseCovers: () => releaseCovers(project),
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
  missionWrites,
}

/** Answers waiting to be let through, typed as the fixture keeps them. */
function waiting(): (() => void)[] {
  return []
}

let reviewsBy = 0

/** A review of the current version by `by`, recorded as the API would, newest first; the feed moves (A16). */
function reviewBy(by: string, verdict: 'approved' | 'changes_requested', note: string | null) {
  const current = versionId(project.reportVersions)
  reviewsBy += 1
  const review = {
    reviewId: `00000000-0000-4000-8000-0000000f${String(reviewsBy).padStart(4, '0')}`,
    verdict,
    note,
    by,
    at: new Date().toISOString(),
  }
  project.reviews.byVersion.set(current, [review, ...(project.reviews.byVersion.get(current) ?? [])])
  publish(project)
}

/** Sophia's research as the records hold it now: running, or finished once it was (`researchDone`), else none. */
function researchWork(p: typeof project): { taskId: string; kind: string; state: string }[] {
  if (p.researching) return [{ taskId: TASK, kind: 'research', state: 'running' }]
  return p.researchFinished ? [{ taskId: TASK, kind: 'research', state: 'succeeded' }] : []
}

/** The project's report at its current version, as a recap or the digest names it. */
const readoutMade = (): ReturnType<Meeting['records']>['made'][number] => ({
  artifactId: REPORT,
  artifactVersionId: versionId(project.reportVersions),
  title: project.reportTitle,
  versionNumber: project.reportVersions,
  askedBy: membership.actorId,
})

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
        statement: DEMO ? 'Run the pilot with fourteen teams' : 'Pilot the fixture with fourteen teams',
        proposedBy: personId(1),
        decidedBy: membership.actorId,
        at,
        undoable: false,
      },
    ],
    made: project.meeting.made ? [readoutMade()] : [],
    noted: project.notes.kept.map((e) => ({
      entryId: e.id,
      kind: e.kind,
      text: e.text ?? '',
      authoredBy: e.authoredBy,
      actorId: e.actorId,
      at: e.recordedAt,
    })),
    open: [],
    // Sophia's research while it runs (`research=running`): the meeting's work, said as running at close if it was.
    work: researchWork(project),
    // The proposed `names` (#105): every actor the fixture knows, so a name shows where the room never saw them.
    names: Object.fromEntries(
      [1, 2, 3, 4, 5]
        .map((n): [string, string] => [personId(n), nameOf(personId(n))])
        .concat([[membership.actorId, VIEWER_NAME]]),
    ),
  }
}

const nothing = () => undefined

/** The page `place=` names: one of the views it serves (Work with the research task's card), else the room. */
const PLACES = ['knowledge', 'work', 'updates', 'conversations', 'goals', 'resources'] as const
const viewOf = (place: string | null): View => PLACES.find((p) => p === place) ?? 'studio'

/**
 * The views this page shows: every one (Conversations when the page asks for them). Goals reads the snapshot's goals;
 * Resources, with nothing serving it here, says what it will hold, as the product does until it is served.
 */
const SERVED: readonly View[] =
  query.has('conversations') || DEMO
    ? ['studio', 'conversations', 'goals', 'knowledge', 'work', 'updates', 'resources']
    : ['studio', 'goals', 'knowledge', 'work', 'updates', 'resources']

/** Shows or keeps out of sight the project (`window.fixture.away/back`), set once the page renders. */
const sight: { set: ((inSight: boolean) => void) | null } = { set: null }

/**
 * The project as the signed-in Studio holds it (SignedIn.tsx): out of sight while the person is in the places, and
 * taking no keys then.
 */
function Kept({ children }: { children: (background: boolean) => ReactNode }) {
  const [inSight, setInSight] = useState(true)
  useEffect(() => {
    sight.set = setInSight
  }, [])
  return (
    <div hidden={!inSight}>
      <ShortcutScope.Provider value={inSight}>{children(!inSight)}</ShortcutScope.Provider>
    </div>
  )
}

/** `send=lost`: the first message lands, its reply lost; `send=refused`: refused; `send=slow`: replies take 1.5 s (A18). */

/** `start=lost`: the first start lands, its reply lost; `start=slow`: its reply takes 1.5 s (A18). */
function startAsked(which: string | null): 'lost' | 'slow' | null {
  return which === 'lost' || which === 'slow' ? which : null
}

type Send = 'lost' | 'refused' | 'refusedSlow' | 'slow' | 'thenFail'

/** Read while the page's project is made, before any module constant below it: the list is its own. */
function sendAsked(which: string | null): Send | null {
  const sends: readonly Send[] = ['lost', 'refused', 'refusedSlow', 'slow', 'thenFail']
  return sends.find((s) => s === which) ?? null
}

/** The conversations a page asks for (A18), with the brief's context beside them; none when it asks for none. */
function conversationsAsked(which: string | null, failMessages: boolean) {
  if (which === null) return {}
  return {
    conversations: {
      list: which === 'none' ? [] : which === 'quiet' ? [...conversations(), quietConversation()] : conversations(),
      messages: { ...messagesOf(), [CONVERSATION.quiet]: [] },
      failList: which === 'fail',
      lastShown: DEMO || query.get('last') === '1',
      failMessagesOf: failMessages ? CONVERSATION.briefs : null,
      send: sendAsked(query.get('send')),
      start: startAsked(query.get('start')),
      answerMs: query.get('answer') === 'slow' ? 10_000 : 900,
      receipts: new Map<string, { body: string; receipt: unknown }>(),
    },
    missionPlus: conversationMission(),
  }
}

/**
 * The project as the signed-in Studio shows it (SignedIn.tsx): its view moves as the person picks another (ViewNav,
 * the mini dock).
 */
function Project({ background }: { background: boolean }) {
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
      background={background}
    />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('room.html must contain #root')

/** The page's reads, which `forgetAccount` clears as App clears them. */
const queryClient = new QueryClient()

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <p className="fixture-label" role="note" data-demo={DEMO || undefined}>
        {DEMO ? DEMO_LABEL : 'Fixture — no API, no call'}
      </p>
      <Kept>{(background) => <Project background={background} />}</Kept>
    </QueryClientProvider>
  </StrictMode>,
)
