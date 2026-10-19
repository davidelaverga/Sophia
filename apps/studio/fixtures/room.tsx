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
// `looking=screen`; docs/plans/room-fixture-people.md).
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { Goal, GoalCommand } from '@sophia/contracts'
import type { ChatCaption } from '@sophia/contracts/room-chat'
import { OFFERED } from './invitations-data.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { forgetKept, keptAt, type Kept } from '../src/features/conversations/talk-store.ts'
import { accountOf } from '../src/app/auth-callback.ts'
import { messagesKey } from '../src/features/conversations/conversation-list.ts'
import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountMenu } from '../src/app/AccountMenu.tsx'
import { PrivacySheet } from '../src/features/personal/PlaceDialogs.tsx'
import type { View } from '../src/app/route.ts'
import { ShortcutScope } from '../src/app/shortcuts.ts'
import { ProjectShell } from '../src/features/studio/ProjectShell.tsx'
import { rememberWelcome } from '../src/features/access/welcome.ts'
import '../src/app/theme.css'
import { goalNote, noteKept, type Notes } from './brief-data.ts'
import { noShowing, walked } from './focus-data.ts'
import { noReviews } from './review-data.ts'
import { noTasks, taskOf } from './task-data.ts'
import { finishedAfter, newMeeting, type Meeting } from './meeting-data.ts'
import { ABSENT, identity, membership, PROJECT, type RoomAsked, type Said } from './data.ts'
import type { CallEnd } from '../src/features/voice/call-end.ts'
import {
  CONVERSATION,
  conversationMission,
  conversations,
  messageId,
  messagesOf,
  quietConversation,
  type FixtureMessage,
} from './conversation-data.ts'
import {
  asked,
  deliverCaption,
  deliverNotice,
  dropCall,
  disabling,
  enabling,
  joined,
  leaving,
  linkLost,
  reactFrom,
  setVoiceLevel,
  sophiaLeaves,
  speakWhileMuted,
} from './fake-livekit.ts'
import {
  count,
  endPause,
  nameOf,
  oneOfUs,
  others,
  personId,
  setFollowers,
  personLeaves,
  setSophia,
  setSpeaking,
  sophiaAsked,
  type SophiaState,
} from './fake-people.ts'
import {
  holdFeed,
  installFixtureApi,
  publish,
  type Conversations,
  releaseSources,
  releaseTask,
  releaseText,
  releaseCovers,
  served,
  unexpected,
} from './fixture-api.ts'
import { missionWrites } from './mission-writes.ts'
import { withdrawnElsewhere } from './conversation-writes.ts'
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
import { ResourcePanel } from '../src/features/resources/ResourcePanel.tsx'
import {
  actions as resourceActions,
  earlierReadings,
  NOW as RESOURCES_READ,
  observations as resourceObservations,
  people as resourcePeople,
  resources as resourceList,
} from './resources-data.ts'
import type { ExchangeAction } from './exchange-writes.ts'
import { sophiaArrives, stopScene } from './room-scene.ts'
import { DEMO_GOALS, goalsAdmitted, goalsSettled } from './demo-goals.ts'
import { demoResources, demoServedGoals } from './demo-work.ts'
import { bootTheme } from '../src/app/theme.ts'
import { startCrashReports } from '../src/app/crash-report.ts'
import { SkipLink } from '../src/app/SkipLink.tsx'

interface Fixture {
  /** A background update: an event on the project's stream, and a new snapshot and brief behind it. */
  update: () => void
  /** The door shuts under the shell: the next snapshot read is refused (403), with no move of the route. */
  shutDoor: () => void
  /** Sophia writes a difficulty on the demo's goal of that title, from a call, and the project's stream moves (goal-notes.md). */
  noteOnGoal: (title: string, text: string) => void
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
  /** The next room token is refused, so that join fails and offers Try again. */
  failToken: () => void
  /** The next request to revise the page is refused, a design under way (revise-section.md). */
  failEdit: () => void
  /** While on, requests to revise the page wait for their replies; off, they answer. */
  holdEdit: (on: boolean) => void
  /** The next read of the earlier discussion fails, as an unavailable API's (discussion-earlier.md). */
  failEarlier: () => void
  /** The next host control fails, as an unreachable room server's (host-controls.md). */
  failHost: () => void
  /** The next goal target saved finds someone else's first (goal-owner-date.md). */
  staleTarget: () => void
  /** The next invitation to this address fails, as an unavailable API's (invite-from-projects.md). */
  failInvite: (email: string) => void
  /** While on, host controls land but their replies wait; off, they answer. */
  holdHost: (on: boolean) => void
  /** Another member writes in the room's discussion, and the event saying so goes out. */
  say: (text: string) => void
  /** The viewer writes in it from another device, a phone, and the event saying so goes out (unread-title.md). */
  sayElsewhere: (text: string) => void
  /** While on, the project's events wait, as a frozen page's stream holds them; off, they come (messages-while-away.md). */
  holdFeed: (on: boolean) => void
  /** Someone starts waiting at the door, and the event saying so goes out (knock-alert.md). */
  knock: () => void
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
  /** Reads of the served board wait while on, as a slow API's do; off, the waiting ones are answered (search-honest.md). */
  holdBoard: (on: boolean) => void
  /** The conversations' list reads fail, or read again (A18). */
  failConversations: (on: boolean) => void
  /** The list's reads are refused (403), as to a reader no longer in the project, the feed not moving; or answer again. */
  refuseConversations: (on: boolean) => void
  /** The reads of a conversation's older pages fail, or read again. */
  failOlderMessages: (on: boolean) => void
  /** The second conversation gets a message: it is the newest now, and the list says so when read again (A18). */
  conversationMoves: () => void
  /**
   * Newer activity pushes this conversation past what the list holds (A33's newest 200, `more`), never erasing it; null
   * brings it back. The feed moves either way.
   */
  capPast: (conversationId: string | null) => void
  /** Another admin, elsewhere, erases this conversation: it leaves the list and its messages go; the feed moves. */
  eraseElsewhere: (conversationId: string) => void
  /**
   * The same, the feed held up: it doesn't move, so only a read made for another reason learns it. Its read within the
   * project answers not found (422), to a current member.
   */
  eraseQuietly: (conversationId: string) => void
  /** Every read of this conversation's messages, and of the list, fails from now on (null: they answer again). */
  failConversationReads: (conversationId: string | null) => void
  /** Only this conversation's message reads fail from now on (null: they answer again); the list's still answer. */
  failMessageReads: (conversationId: string | null) => void
  /**
   * This conversation's message reads are refused (403) from now on, as to a reader no longer in the project; it stays
   * listed, and the feed doesn't move (null: they answer again, the project given back).
   */
  refuseMessageReads: (conversationId: string | null) => void
  /** Another admin, elsewhere, withdraws the newest message with these words; the feed moves. */
  withdrawElsewhere: (conversationId: string, text: string) => void
  /** The same, the feed held up: it doesn't move, so only a read made for another reason learns it. */
  withdrawQuietly: (conversationId: string, text: string) => void
  /** From now on the list's reads wait, each to answer as the list was when asked (A18). */
  holdListReads: () => void
  /** The list's reads held are answered, each as it was when asked; the ones after answer at once. */
  releaseListReads: () => void
  /** From now on message reads that answer wait, each to answer as it was when asked; refusals answer at once. */
  holdMessageReads: () => void
  /** The message reads held are answered, each as it was when asked; the ones after answer at once. */
  releaseMessageReads: () => void
  /** The next message is stamped with its conversation's last time (two messages in one millisecond). */
  sameTimeNext: () => void
  /** The list says (or stops saying) that it holds the newest only (`more`); the feed moves. */
  listMore: (on: boolean) => void
  /** What the view keeps for this project and this page's account (talk-store.ts), as a check reads it. */
  kept: () => Kept | undefined
  /** Whether this page holds a read of the conversation's messages (its query's data), as a check reads it. */
  cachedMessages: (conversationId: string) => boolean
  /** Someone writes in the open conversation (the newest), and the feed moves (conversation-moves.md). */
  conversationMessage: (name: string, text: string) => void
  /** The brief's reads fail, or read again. */
  failMission: (on: boolean) => void
  /** While on, the brief's reads wait; off, the waiting ones are answered. */
  holdMission: (on: boolean) => void
  /** The brief's reads are refused (403), as to a reader no longer in the project; or answer again. */
  refuseMission: (on: boolean) => void
  /** The goals' targets reads fail, or read again (targets-robust.md). */
  failTargets: (on: boolean) => void
  /** While on, the goals' targets reads wait; off, the waiting ones are answered. */
  holdTargets: (on: boolean) => void
  /** The running meeting closes (another member closed it), and the feed moves (chapter 7's update). */
  endMeeting: () => void
  /** The project list's reads fail, or read again (chapter 1). */
  failProjects: (on: boolean) => void
  /** While on, the project list's reads wait; off, the waiting ones are answered (chapter 1). */
  holdProjects: (on: boolean) => void
  /** Lets the held membership reads through, and every later one (`membership=hold`). */
  releaseMembership: () => void
  /** While on, Sophia is out of reach: every API request fails as a lost connection (`outage=1`). */
  outage: (on: boolean) => void
  /** While on, only the membership's reads fail (`membership=fail`). */
  failMembership: (on: boolean) => void
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
  /** Someone leaves the room, by name (room-pin-fullscreen.md). */
  leaves?: (name: string) => void
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
  /** The Resources view draws again (`resources=crash` healed; view-boundary.md). */
  healView: () => void
  /** The next «Mark as seen» lands, but its reply is lost. */
  loseNextSeenReply: () => void
  /** Turning the microphone on waits until `releaseMicrophone`, as a browser still asking for it. */
  holdMicrophone: () => void
  releaseMicrophone: () => void
  /** Turning the microphone off waits until `releaseMute`, as LiveKit's mute does while a republish settles. */
  holdMute: () => void
  releaseMute: () => void
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
  /** The research task's reads are refused (403) from now on; given false, they are answered. */
  refuseTask: (on?: boolean) => void
  /** A live caption packet reaches this member, as the bridge sends what is said aloud (CX-0023): synthetic text. */
  caption: (packet: ChatCaption) => void
  /** Sophia's participant leaves the room (her bridge lost its link, or restarted). */
  sophiaLeaves: () => void
  /** Speech is heard on this person's muted microphone (muted-speech.md). */
  speakMuted: () => void
  /** The call's link is lost for a while (true), or back (false), as LiveKit reconnects (reconnecting-on-video.md). */
  linkLost: (lost: boolean) => void
  /** A teammate edits the report's description elsewhere (the page learns of it when it reads the cards again). */
  describeElsewhere: (text: string) => void
  /** Reads of the report's versions fail from now on: unavailable, or refused (`not_found`); given false, they succeed. */
  failVersions: (how?: 'unavailable' | 'not_found' | false) => void
  /** Reads of the design task fail from now on: refused (403) or unavailable (503); given false, they succeed. */
  failDesign: (how?: 'unavailable' | 'forbidden' | false) => void
  /** The page's own cache as it holds a report's or task's fence (read only, never set): its refusal and allowed reads. */
  fenceOf: (key: readonly string[]) => unknown
  /** Sets out the page's own queries under `key` again, through their own owned query functions (nothing set by hand). */
  refetch: (key: readonly string[]) => void
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
  /** How loud a voice is from now on, 0…1: `sophia`, the viewer (0) or the `n`th other person (voice-amplitude.md). */
  voiceLevel: (who: 'sophia' | number, level: number) => void
  /** Another member's change reaches the API just before the page's next pass: that pass is refused as stale. */
  moveRoom: () => void
  /** Whom the floor was passed to, by name, in order. */
  floorTo: readonly string[]
  /** What the room's connection was asked (fake-livekit.ts). */
  asked: readonly string[]
  /** Someone in the room reacts, by name, with any emoji the check gives (call-reactions.md). */
  reactFrom?: (name: string, emoji: string) => void
  /** The devices the last call opened with (call-devices.md); null before any. */
  readonly devicesOnJoin: Partial<Record<string, string>> | null
  /** The camera background the last call opened with (call-backgrounds.md); null before any. */
  readonly backgroundOnJoin: string | null
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

/** `designfail=forbidden|unavailable`: the design task's reads fail so from the start. */
const designFailOf = (v: string | null): false | 'unavailable' | 'forbidden' =>
  v === 'unavailable' || v === 'forbidden' ? v : false

const query = new URLSearchParams(window.location.search)

/** `resources=crash`: the Resources view fails to draw until `healView`, as a bug in a view would (view-boundary.md). */
let viewBroken = query.get('resources') === 'crash'

function MaybeBroken({ children }: { children: ReactNode }) {
  if (viewBroken) throw new Error('A view that fails to draw (fixture)')
  return children
}
bootTheme(query.get('theme'))
// As main.tsx starts them: on here only with `?sentry=1` (fixtures/crash-dsn.ts, crash-feedback.md).
startCrashReports()
// `earlyFail=1`: a failure while Sentry's chunk is still on its way, as a first render's could be (Codex P1 on #367).
if (query.has('earlyFail'))
  setTimeout(() => {
    throw new Error('An early failure')
  }, 0)
// `welcome=1`: the project was just joined, as accepting a member's invitation leaves it (newcomer-welcome.md).
if (query.get('welcome') === '1')
  rememberWelcome({ projectId: PROJECT, inviter: 'Lucia', role: 'editor', at: Date.now() })

/** The demo's notes on its rollout (goal-notes.md): Sophia's difficulty from the call, and the viewer's own. */
function demoGoalNotes() {
  const rollout = DEMO_GOALS.find((g) => g.status === 'running')
  if (!rollout) return []
  return [
    goalNote(1, rollout.id, {
      kind: 'observation',
      text: 'The pilot numbers hold: 2.4 days to a first shared report.',
      hours: 72,
    }),
    goalNote(2, rollout.id, {
      kind: 'blocker',
      text: 'From the call: legal review of the translated checklist lands Thursday; nothing ships before.',
      hours: 2,
      sophia: true,
    }),
  ]
}

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

/**
 * The goals' owners and dates the page asks for (`targets=`), by goal id; `late` makes the admin change the viewer's,
 * past its date (goal-overdue-health.md).
 */
function goalTargetsAsked(
  wanted: string | null,
): [string, { ownerId: string; targetDate: string; revision: number }][] {
  if (wanted !== '1' && wanted !== 'mine' && wanted !== 'late') return []
  const rollout: [string, { ownerId: string; targetDate: string; revision: number }] = [
    '00000000-0000-4000-8000-000000009001',
    { ownerId: personId(1), targetDate: '2026-10-30', revision: 1 },
  ]
  if (wanted === '1') return [rollout]
  if (wanted === 'late')
    return [
      rollout,
      ['00000000-0000-4000-8000-000000009002', { ownerId: membership.actorId, targetDate: '2026-10-25', revision: 1 }],
    ]
  return [
    rollout,
    ['00000000-0000-4000-8000-000000009002', { ownerId: membership.actorId, targetDate: '2026-11-20', revision: 1 }],
    ['00000000-0000-4000-8000-000000009003', { ownerId: membership.actorId, targetDate: '2026-10-01', revision: 1 }],
  ]
}

/** Four messages over two days in the viewer's zone: yesterday's evening, this morning (chat-times.md). */
function overTwoDays(): Said[] {
  const day = new Date()
  const at = (back: number, hour: number, minute: number) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate() - back, hour, minute).toISOString()
  return [
    { text: 'The deck is in Resources.', at: at(1, 17, 40) },
    { text: 'I’ll read it tonight.', me: true, at: at(1, 18, 5) },
    { text: 'Morning. Comments are in.', at: at(0, 8, 10) },
    { text: 'Thanks, reading them now.', me: true, at: at(0, 8, 25) },
  ]
}

const project = {
  revision: 1,
  doorShut: false,
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
  // `discussion=60`: that many messages from another member, more than the snapshot's 50 (discussion-earlier.md);
  // `discussion=days`: two from yesterday and two from today; `discussion=yesterday`, yesterday's two (chat-times.md).
  messages: (query.get('discussion') === 'days' || query.get('discussion') === 'yesterday'
    ? overTwoDays().slice(0, query.get('discussion') === 'days' ? 4 : 2)
    : Array.from({ length: Number(query.get('discussion')) || 0 }, (_, i) => `Message ${i + 1}`)) as (string | Said)[],
  contributions: new Map(),
  loseContributionReply: false,
  messagesHeld: null as (() => void)[] | null,
  failReplies: false,
  failToken: false,
  failEdit: false,
  editHeld: null as (() => void)[] | null,
  failEarlier: false,
  failHost: false,
  staleTarget: false,
  // `archived=1`: the project is archived (archive-project.md).
  archived: query.get('archived') === '1',
  // `targets=1`: the rollout is Marco's, due 30 October 2026 (goal-owner-date.md); `targets=mine` adds the admin change
  // as the viewer's, due 20 November, and the completed pilot as theirs, due 1 October (goal-overdue.md).
  goalTargets: new Map(goalTargetsAsked(query.get('targets'))),
  hostHeld: null as (() => void)[] | null,
  // The demo publishes both its versions (the second region's revision), unless `versions=` says otherwise.
  reportVersions: Math.min(VERSIONS_HELD, Math.max(1, Number(query.get('versions')) || (DEMO ? 2 : 1))),
  reportTitle: query.get('title') === 'long' ? LONG_TITLE : TITLE,
  pilot: query.get('history') === 'pilot',
  // `lobby=again`: the one waiting has knocked twice, so Block is offered; `lobby=two`: two people wait.
  waiting: query.get('lobby') === 'waiting' || query.get('lobby') === 'again' || query.get('lobby') === 'two',
  lobbyAsked: query.get('lobby'),
  ...(query.get('role') === 'viewer' ? { role: 'viewer' as const } : {}),
  // `fresh=1`: a project just made, nothing recorded yet (first-step.md).
  fresh: query.get('fresh') === '1',
  ...(query.get('role') === 'editor' ? { role: 'editor' as const } : {}),
  // `admins=1`: the viewer is the project's only admin, so leaving is refused (project-leave.md).
  soleAdmin: query.get('admins') === '1',
  // The invitations made here, kept as the API keeps them (invitations-data.ts): the demo's Invite has no dead end.
  invitations: {
    kept: [],
    made: 0,
    offered: query.get('invitable') === 'none' ? [] : OFFERED,
    failFor: null as string | null,
  },
  description: SOPHIAS_DESCRIPTION,
  versionsFail: false as false | 'unavailable' | 'not_found',
  // `designcard=on`: the design task itself is in the project's work (its own DesignCard); `failDesign` fails its read.
  designCard: query.get('designcard') === 'on',
  designFail: designFailOf(query.get('designfail')),
  sourcesHeld: query.get('hold') === 'sources',
  textHeld: query.get('hold') === 'text',
  activityHeld: query.get('hold') === 'activity',
  // The demo's research is on its second version, as its report (both published by default).
  taskRevision: RESEARCH_REVISION,
  taskHeld: query.get('hold') === 'task',
  coversHeld: query.get('hold') === 'covers',
  // `fail=task`: every read of the research task is refused (503), as the hosted cards' detail went unread.
  taskFails: query.get('fail') === 'task',
  taskRefused: false,
  researching: query.get('research') === 'running' ? { reads: 0 } : null,
  researchFinished: false,
  textTampered: query.get('tamper') === 'text',
  // The demo's page is published, unless `design=designing` asks for it still being designed.
  designed: query.get('designed') === 'on' || (DEMO && query.get('design') !== 'designing'),
  designing: query.get('design') === 'designing',
  pageTampered: query.get('tamper') === 'html',
  work: query.get('place') === 'work',
  // `reports=1`: the research task in the snapshot's work and the report's current version in its artifacts, as the API
  // serves them (goal-reports.md).
  goalReports: query.get('reports') === '1',
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
  // `targetsRead=hold` or `fail`: the goals' targets wait, or fail, from the first (targets-robust.md).
  targetsHeld: query.get('targetsRead') === 'hold' ? waiting() : null,
  targetsFail: query.get('targetsRead') === 'fail',
  carriedElsewhere: query.get('carried') === 'elsewhere',
  reportsElsewhere: query.get('reports') === 'elsewhere',
  cardAhead: query.get('card') === 'ahead',
  projectsHeld: query.get('projects') === 'hold' ? waiting() : null,
  membershipHeld: query.get('membership') === 'hold' ? waiting() : null,
  membershipFails: query.get('membership') === 'fail',
  outage: query.get('outage') === '1',
  outsider: query.get('member') === '0',
  // A13: searches held while the page asks (`holdSearch`).
  searchHeld: null as (() => void)[] | null,
  boardHeld: null as (() => void)[] | null,
  // `mission=fail`: the brief's reads fail from the first (notes-robust.md); `window.fixture.failMission` turns it.
  missionFails: query.get('mission') === 'fail',
  missionRefused: false,
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
    kept: DEMO ? demoGoalNotes() : [],
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
  shutDoor: () => {
    project.doorShut = true
    publish(project)
  },
  noteOnGoal: (title, text) => {
    const goal = DEMO_GOALS.find((g) => g.title === title)
    if (!goal) return
    project.notes.kept.push(
      goalNote(project.notes.kept.length + 10, goal.id, { kind: 'blocker', text, hours: 0, sophia: true }),
    )
    publish(project)
  },
  say: (text) => {
    project.messages.push(text)
    publish(project)
  },
  sayElsewhere: (text) => {
    project.messages.push({ text, me: true })
    publish(project)
  },
  holdFeed,
  knock: () => {
    project.waiting = true
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
  failToken: () => {
    project.failToken = true
  },
  failEdit: () => {
    project.failEdit = true
  },
  holdEdit: (on) => {
    const held = project.editHeld ?? []
    project.editHeld = on ? [] : null
    if (!on) for (const reply of held) reply()
  },
  failEarlier: () => {
    project.failEarlier = true
  },
  failHost: () => {
    project.failHost = true
  },
  staleTarget: () => {
    project.staleTarget = true
  },
  failInvite: (email) => {
    project.invitations.failFor = email
  },
  holdHost: (on) => {
    const held = project.hostHeld ?? []
    project.hostHeld = on ? [] : null
    if (!on) for (const reply of held) reply()
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
  refuseConversations: (on) => {
    if (project.conversations) project.conversations.refusedList = on
  },
  failOlderMessages: (on) => {
    if (project.conversations) project.conversations.failOlder = on
  },
  conversationMoves: () => {
    const moved = project.conversations?.list.find((c) => c.id === CONVERSATION.briefs)
    if (moved) moved.lastAt = '2026-10-06T10:00:00.000Z'
  },
  capPast: (conversationId) => {
    if (!project.conversations) return
    project.conversations.cappedOut = conversationId
    publish(project)
  },
  eraseElsewhere: (conversationId) => {
    if (!project.conversations) return
    erasedElsewhere(project.conversations, conversationId)
    publish(project)
  },
  eraseQuietly: (conversationId) => {
    if (project.conversations) erasedElsewhere(project.conversations, conversationId)
  },
  failConversationReads: (conversationId) => {
    if (!project.conversations) return
    project.conversations.failList = conversationId !== null
    project.conversations.failMessagesOf = conversationId
  },
  failMessageReads: (conversationId) => {
    if (project.conversations) project.conversations.failMessagesOf = conversationId
  },
  refuseMessageReads: (conversationId) => {
    if (project.conversations) project.conversations.refusedOf = conversationId
  },
  withdrawElsewhere: (conversationId, text) => {
    if (project.conversations && withdrawnElsewhere(project.conversations, conversationId, text)) publish(project)
  },
  withdrawQuietly: (conversationId, text) => {
    if (project.conversations) withdrawnElsewhere(project.conversations, conversationId, text)
  },
  holdListReads: () => {
    if (project.conversations) project.conversations.heldList ??= []
  },
  releaseListReads: () => {
    const held = project.conversations?.heldList ?? []
    if (project.conversations) project.conversations.heldList = null
    for (const answer of held) answer()
  },
  holdMessageReads: () => {
    if (project.conversations) project.conversations.heldMessages ??= []
  },
  releaseMessageReads: () => {
    const held = project.conversations?.heldMessages ?? []
    if (project.conversations) project.conversations.heldMessages = null
    for (const answer of held) answer()
  },
  sameTimeNext: () => {
    if (project.conversations) project.conversations.sameTimeNext = true
  },
  listMore: (on) => {
    if (!project.conversations) return
    project.conversations.more = on
    publish(project)
  },
  kept: () => keptAt(`${PROJECT} ${accountOf(identity)}`),
  cachedMessages: (conversationId) =>
    queryClient.getQueryData(messagesKey(conversationId, accountOf(identity))) !== undefined,
  conversationMessage: (name, text) => {
    const all: Partial<Record<string, FixtureMessage[]>> | undefined = project.conversations?.messages
    const thread = all?.[CONVERSATION.reading]
    if (!thread) return
    const at = new Date().toISOString()
    // A UUID, as A33's message ids are; numbered past the seeded ones.
    thread.push({ id: messageId(0x900 + thread.length), author: 'member', actorId: personId(1), name, text, at })
    publish(project)
  },
  failMission: (on) => {
    project.missionFails = on
  },
  refuseMission: (on) => {
    project.missionRefused = on
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
  failTargets: (on) => {
    project.targetsFail = on
  },
  holdTargets: (on) => {
    const held = project.targetsHeld ?? []
    project.targetsHeld = on ? held : null
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
  outage: (on) => {
    project.outage = on
  },
  failMembership: (on) => {
    project.membershipFails = on
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
  holdBoard: (on) => {
    if (!on) for (const answer of project.boardHeld ?? []) answer()
    project.boardHeld = on ? waiting() : null
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
  healView: () => {
    viewBroken = false
  },
  loseNextSeenReply: () => {
    project.meeting.seen.loseReply = true
  },
  holdMicrophone: () => {
    enabling.held = true
  },
  releaseMicrophone: () => {
    enabling.held = false
    for (const done of enabling.waiting.splice(0)) done()
  },
  holdMute: () => {
    disabling.held = true
  },
  releaseMute: () => {
    disabling.held = false
    for (const done of disabling.waiting.splice(0)) done()
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
  refuseTask: (on = true) => {
    project.taskRefused = on
  },
  caption: deliverCaption,
  sophiaLeaves,
  speakMuted: speakWhileMuted,
  linkLost,
  describeElsewhere: (text) => {
    project.description = { text, revision: project.description.revision + 1, author: TEAMMATE }
  },
  failVersions: (how = 'unavailable') => {
    project.versionsFail = how
  },
  failDesign: (how = 'forbidden') => {
    project.designFail = how
  },
  fenceOf: (key) => queryClient.getQueryData(key),
  refetch: (key) => void queryClient.refetchQueries({ queryKey: key }).catch(() => undefined),
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
  voiceLevel: setVoiceLevel,
  leaves: personLeaves,
  moveRoom: () => {
    project.roomMoves = true
  },
  floorTo,
  asked,
  reactFrom,
  get devicesOnJoin() {
    return joined.devices
  },
  get backgroundOnJoin() {
    return joined.background
  },
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

type Send = 'lost' | 'lostSlow' | 'refused' | 'refusedSlow' | 'slow' | 'late' | 'thenFail'

/** Read while the page's project is made, before any module constant below it: the list is its own. */
function sendAsked(which: string | null): Send | null {
  const sends: readonly Send[] = ['lost', 'lostSlow', 'refused', 'refusedSlow', 'slow', 'late', 'thenFail']
  return sends.find((s) => s === which) ?? null
}

/** How an erasure goes (`erase=`): its feed first, its first try never reaching the API, its reply lost, or at once. */
function eraseAsked(which: string | null): 'feedFirst' | 'unreached' | 'lost' | null {
  return which === 'feedFirst' || which === 'unreached' || which === 'lost' ? which : null
}

/** How a withdrawal's reply and the feed come (`withdraw=`): both late, the feed first, or at once. */
function withdrawAsked(which: string | null): 'slow' | 'feedFirst' | 'thenFail' | 'unreached' | null {
  return which === 'slow' || which === 'feedFirst' || which === 'thenFail' || which === 'unreached' ? which : null
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
      more: query.get('more') === '1',
      cappedOut: null as string | null,
      refusedOf: null as string | null,
      refusedList: false,
      heldList: null as (() => void)[] | null,
      heldMessages: null as (() => void)[] | null,
      sameTimeNext: false,
      failMessagesOf: (failMessages ? CONVERSATION.briefs : null) as string | null,
      failOlder: query.get('older') === 'fail',
      // `ask=off`: Sophia doesn't answer here, as while replies are off (CON-01 C1).
      askOff: query.get('ask') === 'off',
      send: sendAsked(query.get('send')),
      start: startAsked(query.get('start')),
      answerMs: query.get('answer') === 'slow' ? 10_000 : 900,
      answerUnknown: query.get('answer') === 'unknown',
      withdraw: withdrawAsked(query.get('withdraw')),
      erase: eraseAsked(query.get('erase')),
      receipts: new Map<string, { body: string; receipt: unknown }>(),
    },
    missionPlus: conversationMission(),
  }
}

/**
 * The project as the signed-in Studio shows it (SignedIn.tsx): its view moves as the person picks another (ViewNav,
 * the mini dock).
 */
/**
 * The account menu's actions on the fixture page (account-menu.md): How privacy works opens its sheet here; your
 * personal data goes to the personal space, as the app goes home; signing out goes to the sign-in.
 */
const demoAccount = (privacy: () => void) => ({
  data: () => window.location.assign(`personal.html${DEMO ? '?demo=1' : ''}`),
  privacy,
  chooseDev: nothing,
  signOut: () => window.location.assign(`signin.html${DEMO ? '?demo=1' : ''}`),
  // Every device: the sign-in, saying so, so a check can tell the two apart (sign-out-scope.md).
  signOutEverywhere: () => window.location.assign(`signin.html?everywhere=1${DEMO ? '&demo=1' : ''}`),
})

function Project({ background }: { background: boolean }) {
  const [view, setView] = useState<View>(viewOf(query.get('place')))
  const [privacy, setPrivacy] = useState(false)
  return (
    <>
      {privacy && <PrivacySheet onClose={() => setPrivacy(false)} />}
      <ProjectShell
        projectId={PROJECT}
        view={view}
        identity={identity}
        account={<AccountMenu identity={identity} where="project" actions={demoAccount(() => setPrivacy(true))} />}
        onShow={(next) => {
          if (SERVED.includes(next)) setView(next)
        }}
        onLeave={nothing}
        onWork={() => served.push('went:work')}
        onSignOut={nothing}
        joinOnOpen={query.get('call') === 'on'}
        background={background}
        resources={
          DEMO ? (
            <MaybeBroken>
              <DemoResources />
            </MaybeBroken>
          ) : undefined
        }
      />
    </>
  )
}

/** The resources' labelled fixture data told in the pilot's words and cast, as the demo's board is (demo-work.ts). */
const DEMO_RESOURCES = demoResources({ resources: resourceList, actions: resourceActions })

/**
 * The demo's Resources: the real panel over the resources' labelled fixture data (resources-data.ts), read-only (no
 * effort, act or task link wired, so nothing offers a press that does nothing; docs/plans/demo-resources.md), told as
 * the board is (docs/plans/demo-resources-story.md).
 */
function DemoResources() {
  return (
    <ResourcePanel
      resources={DEMO_RESOURCES.resources}
      observations={resourceObservations}
      actions={DEMO_RESOURCES.actions}
      viewerId={resourcePeople.luis.id}
      now={RESOURCES_READ}
      history={earlierReadings(resourceObservations)}
      scope="demo"
    />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('room.html must contain #root')

/** The page's reads, which `forgetAccount` clears as App clears them. */
const queryClient = new QueryClient()

createRoot(root).render(
  <StrictMode>
    {/* As main.tsx renders it beside the App (skip-link.md). */}
    <SkipLink />
    <QueryClientProvider client={queryClient}>
      <p className="fixture-label" role="note" data-demo={DEMO || undefined}>
        {DEMO ? DEMO_LABEL : 'Fixture — no API, no call'}
      </p>
      <Kept>{(background) => <Project background={background} />}</Kept>
    </QueryClientProvider>
  </StrictMode>,
)

/** Erased by another admin: out of the list, its messages gone, and its reads answered not found (fixture-api). */
function erasedElsewhere(talk: Conversations, conversationId: string) {
  const at = talk.list.findIndex((c) => c.id === conversationId)
  if (at >= 0) talk.list.splice(at, 1)
  delete talk.messages[conversationId]
  ;(talk.erasedIds ??= new Set()).add(conversationId)
}
