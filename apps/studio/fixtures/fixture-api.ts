// The fixture page's API, answered at fetch from data.ts: the project's snapshot and live event stream, the
// viewer's membership, the brief and a room token. Any other request is recorded and refused, so a check that
// reached for something else fails instead of passing on a real service. A background update is an event on the
// open stream: the Studio's own feed applies it and refetches the snapshot, as it does with the API.
import type {
  ContributionReceipt,
  ExchangeReceipt,
  FloorRequest,
  GoalCommand,
  Membership,
  MissionContext,
  Receipt,
  Snapshot,
  SourceReviewAvailability,
  WorkBoardView,
} from '@sophia/contracts'
import {
  EXCHANGE,
  projectEvent,
  membership,
  mission,
  PROJECT,
  ROOM,
  roomToken,
  snapshot,
  type RoomAsked,
  type Said,
  authorOf,
  entryIdOf,
  idOf,
  said,
} from './data.ts'
import { hostActed, others, personId } from './fake-people.ts'
import { missionWritten } from './mission-writes.ts'
import { DEMO, DEMO_ORIGINS, PROJECT_NAME, VIEWER_NAME } from './demo.ts'
import { exchangeWritten, type ExchangeAction } from './exchange-writes.ts'
import { libraryVersions } from './demo-library.ts'
import {
  content,
  editDescription,
  citedSources,
  DESIGN_TASK,
  designingTask,
  OLDER_REPORT,
  ELSEWHERE_REPORT,
  elsewhereCard,
  elsewhereVersions,
  matchesFilter,
  olderVersions,
  REPORT,
  reportList,
  researchRunning,
  researchTaskAt,
  TASK,
  versions,
  waitingAtTheDoor,
  type Description,
} from './report-data.ts'
import { readingRead } from './reading-data.ts'
import { noteKept, noteWithdrawn, withdrawalPreview, type Notes } from './brief-data.ts'
import { invitationsAnswer, type Invitations } from './invitations-data.ts'
import { focusRequest, focusSet, roomFocus, type Showing } from './focus-data.ts'
import { reviewed, type Reviews } from './review-data.ts'
import { created, finished, type Tasks } from './task-data.ts'
import type { ProjectTask, VersionReview } from '../src/api/vision.ts'
import {
  MESSAGE_PAGE,
  type conversationMission,
  type FixtureConversation,
  type FixtureMessage,
} from './conversation-data.ts'
import { wireList, wireMessage } from './conversation-wire.ts'
import {
  conversationErased,
  conversationWithdrawn,
  conversationWritten,
  type TalkWrites,
} from './conversation-writes.ts'
import type { ProjectRelease, ReportList } from '@sophia/contracts'
import { searchHits, searchPage } from './search-data.ts'
import { SOURCE_REVIEW } from './source-review-data.ts'
import {
  closed,
  MEETING,
  markSeen,
  meetingList,
  nothingSince,
  recapOf,
  soFarOf,
  updatesWindowOf,
  type Meeting,
} from './meeting-data.ts'
import { profileAnswer } from './profile-data.ts'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** Requests the fixture didn't expect, as `METHOD /path`: the checks assert there are none. */
export const unexpected: string[] = []
/** What was answered, as `snapshot:2`, `mission:2`: a check can tell an update reached the page. */
export const served: string[] = []

/** The project as the API holds it now: the revision moves with each event. */
interface Project {
  revision: number
  /** The project's title once renamed (project-rename.md); absent, the snapshot's own. */
  title?: string
  /** The next request to revise the page is refused, a design under way (`window.fixture.failEdit`). */
  failEdit?: boolean
  /** While set, requests to revise the page land but their replies wait (`window.fixture.holdEdit`). */
  editHeld?: (() => void)[] | null
  /** The viewer is the project's only admin (`admins=1`): leaving is refused (project-leave.md). */
  soleAdmin?: boolean
  /** The viewer left the project (A22): it leaves their list. */
  left?: boolean
  /** The project is archived (A30, `archived=1`): out of the list, in the archived one. */
  archived?: boolean
  exchange: boolean
  /** The door shut under the shell (`window.fixture.shutDoor`): every snapshot read from now on is refused (403). */
  doorShut?: boolean
  messages: (string | Said)[]
  /** The viewer's messages to the room, by their Idempotency-Key: the same key again replays the receipt. */
  contributions?: Map<string, { text: string; receipt: ContributionReceipt }>
  /** The next message lands, but its reply is lost on the way (`window.fixture.loseNextContributionReply`). */
  loseContributionReply?: boolean
  /** While set, messages land but their replies wait for `releaseMessages` (`window.fixture.holdMessages`). */
  messagesHeld?: (() => void)[] | null
  /** The goals' owners and dates (A25), by goal id; `targets=1` gives the rollout one. */
  goalTargets?: Map<string, { ownerId: string | null; targetDate: string | null; revision: number }>
  /** The next target saved finds someone else's first (`window.fixture.staleTarget`). */
  staleTarget?: boolean
  /** Members an admin removed (A29), by actor id. */
  removedMembers?: Set<string>
  /** Members' roles as an admin changed them (A27), by actor id. */
  memberRoles?: Map<string, Membership['role']>
  /** The next host control is refused as an unreachable room server's (`window.fixture.failHost`). */
  failHost?: boolean
  /**
   * The next «Mute everyone» mutes everyone, then is refused, as the API's when its record fails after the room server
   * acted (`window.fixture.failAfterMuteAll`).
   */
  failAfterMuteAll?: boolean
  /** While set, host controls land but their replies wait for `holdHost(false)` (`window.fixture.holdHost`). */
  hostHeld?: (() => void)[] | null
  /** The next read of the earlier discussion fails as the API's `unavailable` (`window.fixture.failEarlier`). */
  failEarlier?: boolean
  /** A20's replies read fails as the API's `unavailable` (`window.fixture.failReplies`). */
  failReplies?: boolean
  /** The next room token is refused as an unavailable API's, so the join fails (`window.fixture.failToken`). */
  failToken?: boolean
  /** How many versions of the fixture report are published (report-data.ts). */
  reportVersions: number
  /** The fixture report's title (report-data.ts): LONG_TITLE with `title=long`. */
  reportTitle: string
  /** Its first two versions are shaped like the pilot's (`history=pilot`, report-data.ts). */
  pilot?: boolean
  /** Someone is waiting at the door (report-data.ts). */
  waiting: boolean
  /** `lobby=again` (knocked twice) or `lobby=two` (two waiting); anything else, one first knock. */
  lobbyAsked?: string | null
  /** This viewer's role in the project (`role=viewer`, `role=editor`); the fixture's own, admin, otherwise. */
  role?: Membership['role']
  /** A project just made (`fresh=1`, first-step.md): its ledger holds nothing yet. */
  fresh?: boolean
  /** The invitations made here (invitations-data.ts); absent, the list is empty and making one is unexpected. */
  invitations?: Invitations
  /** The report's description on Knowledge (report-data.ts). */
  description: Description
  /** The next edit of it lands, but its reply is lost (`summary=lost`, description-reply-lost.md). */
  summaryLost?: boolean
  /** Knowledge's reads of the cards wait until the page lets them through (`holdReports`), as a slow API's do. */
  reportsHeld?: boolean
  /**
   * How reads of the report's versions fail from now on: `unavailable`, as an API that lost its database answers;
   * `not_found`, as it refuses a report this person may not read; false, they succeed.
   */
  versionsFail: false | 'unavailable' | 'not_found'
  /** The design task itself is in the project's work, as its own card (`designcard=on`). */
  designCard?: boolean
  /** Reads of the design task fail: refused (403, this person's own), or unavailable (503); false, they succeed. */
  designFail?: false | 'unavailable' | 'forbidden'
  /** Reads of a version's sources wait until the page lets them through (`hold=sources`), as a slow API's do. */
  sourcesHeld: boolean
  /** So do reads of a version's text (`hold=text`). */
  textHeld: boolean
  /** Reads of the project's activity never answer (`hold=activity`), as a hosted API starting cold. */
  activityHeld?: boolean
  /** The research task's result revision (report-data.ts): 1 unless the check revises it. */
  taskRevision?: 1 | 2
  /** Reads of the research task wait until the page lets them through (`hold=task`), as a slow API's do. */
  taskHeld?: boolean
  /** Reads of the demo library's covers wait until the page lets them through (`hold=covers`), then 400 ms apart. */
  coversHeld?: boolean
  /** The research task runs (`research=running`): how many sources it has read. */
  researching?: { reads: number } | null
  /** Reads of the research task fail (`window.fixture.failTask`), as an API that lost its database answers. */
  taskFails?: boolean
  /** Reads of the research task are refused to this person (403), as after a revoked membership (`refuseTask`). */
  taskRefused?: boolean
  /** A version's text arrives as bytes its record does not name (`tamper=text`). */
  textTampered: boolean
  /** Version 1 carries a designed HTML page (SDD-01, `designed=on`), and the research task lists it. */
  designed?: boolean
  /** The research's HTML page is still being designed (`design=designing`, B-19). */
  designing?: boolean
  /** The designed page arrives as bytes its record does not name (`tamper=html`). */
  pageTampered?: boolean
  /** The research task is in the project's work (`place=work`): its card lists the report's outputs. */
  work: boolean
  /** The snapshot carries the research task and the report's current version (`reports=1`, goal-reports.md). */
  goalReports?: boolean
  /** The project's goals (the work fixture's one, LFE-07). */
  goals?: Snapshot['goals']
  /** What Sophia offers for a source review (WBC-02); absent, the pilot is not enabled. */
  review?: SourceReviewAvailability
  /**
   * Each source review proposed, with its key and its body (`proposed=lost|unreadable|held`): the first `lose` replies
   * are lost (the request having arrived) or a success whose body cannot be read; the next is answered. `held`: the first
   * is recorded and its answer waits in `held` until the page lets it go, the second's reply is lost, the next answered.
   * Absent, a proposal is unexpected.
   */
  proposals?: {
    lose: number
    how: 'lost' | 'unreadable' | 'held'
    sent: { key: string; body: unknown }[]
    held?: ((read: () => void) => void)[]
    /** Each read of a proposal by its key, as answered: `recorded <key>` or `not_found <key>`. */
    reads?: string[]
  }
  /** The goals of the board Sophia serves, as the page holds them now (`admits=`); absent, none. */
  servedGoals?: () => WorkBoardView['goals']
  /** A decision on the served board answered (`admits=`): its receipt; absent, an answer is unexpected. */
  onAnswer?: (decisionId: string, answer: unknown) => unknown
  /** A goal's command (Request review, Hold, Stop), with its idempotency key; absent, a command is unexpected. */
  onCommand?: (command: GoalCommand, key: string) => void
  /** The floor and Sophia's presence as the page asked for them (data.ts, room-people checks). */
  room?: RoomAsked
  /** Sophia's conversation moved (exchange-writes.ts); absent, a press on it is unexpected. */
  onExchange?: (action: ExchangeAction) => void
  /** A guest is in the room, as the LiveKit server lists them (exchange-writes.ts). */
  guestHere?: () => boolean
  /** The floor passed on to this actor; absent, passing it is unexpected. */
  onFloor?: (actorId: string) => void
  /** The room moves (another member's change) just before the next pass reaches the API. */
  roomMoves?: boolean
  /** The notes members wrote in the brief (brief-data.ts); absent, writing one is unexpected. */
  notes?: Notes
  /** What the room shows to everyone (focus-data.ts); absent, showing is unexpected. */
  showing?: Showing
  /** While set, searches wait for `holdSearch(false)` (A13). */
  searchHeld?: (() => void)[] | null
  /** While set, reads of the served board wait for `holdBoard(false)` (search-honest.md). */
  boardHeld?: (() => void)[] | null
  /** The versions' reviews (review-data.ts, A16); absent, their requests are unexpected. */
  reviews?: Reviews
  /** What members carried in from Personal (the project list's releases, chapter 1); absent, none. */
  carriedIn?: ProjectRelease[]
  /** The project list holds other projects only (`carried=elsewhere`): this one is past its first ones. */
  carriedElsewhere?: boolean
  /** The reader's reports are in another project too (`reports=elsewhere`): its count is under the filters. */
  reportsElsewhere?: boolean
  /** The report's card names a version its versions list doesn't hold yet (`card=ahead`): just published. */
  cardAhead?: boolean
  /** While set, the project list's reads wait for these (`window.fixture.holdProjects`). */
  projectsHeld?: (() => void)[] | null
  /** While set, the membership's reads wait for these (`membership=hold`, `window.fixture.releaseMembership`). */
  membershipHeld?: (() => void)[] | null
  /** While set, the snapshot's reads wait for these (`snapshot=hold`, `window.fixture.releaseSnapshot`): not loaded. */
  snapshotHeld?: (() => void)[] | null
  /** Sophia is out of reach (`outage=1`, `window.fixture.outage`): every API request fails as a lost connection. */
  outage?: boolean
  /** The membership's reads fail as the API's `unavailable`, the rest answer (`membership=fail`, `failMembership`). */
  membershipFails?: boolean
  /** This viewer is no member of the project (`member=0`): its reads are refused, as the API refuses them. */
  outsider?: boolean
  /** The project list's reads fail (`projects=fail`). */
  projectsFail?: boolean
  /** The report's tasks (task-data.ts, A17); absent, their requests are unexpected. */
  tasks?: Tasks
  /** The meeting the room is in (meeting-data.ts, A12); absent, its requests are unexpected. */
  meeting?: Meeting
  /** The project's conversations (conversation-data.ts, A18); absent, their requests are unexpected. */
  conversations?: Conversations
  /** What the brief adds for the conversations' context: a purpose, accepted decisions, one still open. */
  missionPlus?: ReturnType<typeof conversationMission>
  /** The brief's reads fail (`window.fixture.failMission`). */
  missionFails?: boolean
  /** The brief's reads refused (403), as to a reader no longer in the project (`refuseMission`). */
  missionRefused?: boolean
  /** While set, the brief's reads wait for these (`mission=hold`, `window.fixture.holdMission`). */
  missionHeld?: (() => void)[] | null
  /** The goals' targets read fails (`targetsRead=fail`, `window.fixture.failTargets`). */
  targetsFail?: boolean
  /** While set, the goals' targets reads wait for these (`targetsRead=hold`, `window.fixture.holdTargets`). */
  targetsHeld?: (() => void)[] | null
  /** The project's members read fails (`membersRead=fail`, `window.fixture.failMembers`). */
  membersFail?: boolean
}

/** The conversations as the fixtures keep them (A33 serves them, conversation-wire.ts), and the reads that fail. */
export interface Conversations extends TalkWrites {
  list: FixtureConversation[]
  messages: Record<string, FixtureMessage[]>
  /** The list's reads fail (`conversations=fail`, `window.fixture.failConversations`). */
  failList: boolean
  /** The list's reads are refused (403), as to a reader no longer in the project (`refuseConversations`). */
  refusedList?: boolean
  /** The list says each one's last message (A18 proposed; `last=1`, and the demo). */
  lastShown?: boolean
  /** The list says older conversations exist that it doesn't hold (`more=1`, A33's `more`). */
  more?: boolean
  /** One pushed past what the list holds by newer activity, never erased: left out, the list saying `more` (`capPast`). */
  cappedOut?: string | null
  /** While set, the list's reads wait for these, each to answer as the list was when asked (`holdListReads`). */
  heldList?: (() => void)[] | null
  /**
   * While set, message reads that would answer wait for these, each to answer as the conversation was when asked
   * (`holdMessageReads`); a refusal, a not found or a failure answers at once.
   */
  heldMessages?: (() => void)[] | null
  /** Reads of the pages before the newest fail (`older=fail`, `window.fixture.failOlderMessages`). */
  failOlder?: boolean
  /** Sophia doesn't answer here (`ask=off`): the list says `ask: unavailable`, as the API does while replies are off. */
  askOff?: boolean
}

function hrefOf(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.href
  return input
}

/** An open stream: what reaches it, how the server ends it, and how it goes silent with its socket still open. */
interface OpenStream {
  send: (chunk: string) => void
  end: () => void
  stall: () => void
}

const streams = new Set<OpenStream>()

const frameOf = (sequence: number) => `id: ${sequence}\ndata: ${JSON.stringify(projectEvent(sequence))}\n\n`

/**
 * The project's event stream, open until the page drops it; pings keep it from looking stalled. Dropped by its
 * signal, it fails the read under way, as a fetch does: the feed waits on that read before it resyncs.
 */
function eventStream(project: Project, after: number, signal: AbortSignal | null | undefined): Response {
  let ping: ReturnType<typeof setInterval> | undefined
  let mine: OpenStream | undefined
  const close = () => {
    clearInterval(ping)
    if (mine) streams.delete(mine)
  }
  const body = new ReadableStream<string>({
    start: (controller) => {
      let silent = false
      const open: OpenStream = {
        send: (chunk) => {
          if (!silent) controller.enqueue(chunk)
        },
        end: () => {
          close()
          controller.close()
        },
        stall: () => {
          silent = true
          clearInterval(ping)
        },
      }
      mine = open
      streams.add(open)
      open.send(': ping\n\n')
      // The events after the page's cursor come first, as the API sends its history.
      for (let sequence = after + 1; sequence <= project.revision; sequence += 1) open.send(frameOf(sequence))
      ping = setInterval(() => open.send(': ping\n\n'), 5000)
      signal?.addEventListener('abort', () => {
        close()
        controller.error(new DOMException('The stream was dropped', 'AbortError'))
      })
    },
    cancel: close,
  })
  return new Response(body.pipeThrough(new TextEncoderStream()), { headers: { 'content-type': 'text/event-stream' } })
}

/**
 * The project's snapshot now, with someone at the door when the page asked for it (`lobby=waiting`), and the research
 * task in its work on the Work page (`place=work`).
 */
function snapshotOf(project: Project) {
  const now = snapshot(project.revision, project.exchange, project.messages, project.goals, project.room)
  const running = project.researching ? researchRunning(project.researching.reads).task : null
  const work = running
    ? { ...now, work: [running] }
    : project.work
      ? { ...now, work: [researchTaskAt(project.taskRevision ?? 1, project.designed, project.designing).task] }
      : now
  const designed = project.designCard
    ? { ...work, work: [...work.work, designingTask(project.designed ? 'published' : 'designing').task] }
    : work
  const reported = project.goalReports ? withGoalReports(project, designed) : designed
  const titled = project.title ? { ...reported, title: project.title } : reported
  return withFocus(project, project.waiting ? { ...titled, lobby: lobbyOf(project.lobbyAsked) } : titled)
}

/** The research task in the snapshot's work and the report's current version in its artifacts (goal-reports.md). */
function withGoalReports(project: Project, now: Snapshot): Snapshot {
  const task = researchTaskAt(project.taskRevision ?? 1, project.designed, project.designing).task
  const current = versions(project.reportVersions, project.reportTitle, project.pilot)[0]
  return {
    ...now,
    work: now.work.some((t) => t.id === task.id) ? now.work : [...now.work, task],
    artifacts: current ? [current] : now.artifacts,
  }
}

/** What the room shows, as the snapshot carries it, with the report's current version among its artifacts. */
function withFocus(project: Project, now: Snapshot): Snapshot {
  const focus = project.showing?.focus
  if (!focus || !project.showing) return now
  const current = versions(project.reportVersions, project.reportTitle, project.pilot)[0]
  return {
    ...now,
    sharedFocus: { ...focus, revision: project.showing.revision },
    artifacts: current ? [current] : [],
  }
}

/** While set, the events published wait here, as a frozen page's stream holds them (`window.fixture.holdFeed`). */
let feedHeld: string[] | null = null

/** While set, the next event published skips a sequence (`window.fixture.gap`). */
let skipNext = false

/** The project moves one revision, and the event saying so goes to every open stream, unless the feed is held. */
export function publish(project: Project): void {
  project.revision += skipNext ? 2 : 1
  skipNext = false
  const frame = frameOf(project.revision)
  if (feedHeld) feedHeld.push(frame)
  else for (const stream of streams) stream.send(frame)
}

/**
 * While on, the events published wait instead of reaching the page, as a phone's frozen page or a sleeping laptop
 * leaves them; off, they come, in order (messages-while-away.md). A read of the snapshot meanwhile has them all.
 */
export function holdFeed(on: boolean): void {
  const held = feedHeld ?? []
  feedHeld = on ? held : null
  if (on) return
  for (const frame of held) for (const stream of streams) stream.send(frame)
}

// The feed's failures, from the server's side (feed-reconnect.md). Each acts on the streams open now; the page's next
// stream is a healthy one.

/** The server ends every open stream, as an API restart or a proxy's idle cut does: the page reconnects. */
export function dropStream(): void {
  for (const stream of streams) stream.end()
}

/** The open streams stay open and send nothing more, no ping either, as a zombie proxy connection: the page stalls. */
export function stallStream(): void {
  for (const stream of streams) stream.stall()
}

/** The next event published skips a sequence, as a lost frame would: the page reads the snapshot again. */
export function gap(): void {
  skipNext = true
}

const isCommand = (value: unknown): value is GoalCommand =>
  typeof value === 'object' && value !== null && 'kind' in value && 'goalId' in value

/** A goal's command, admitted as the API admits it: its receipt says sent, never done. */
function admitted(project: Project, init: RequestInit | undefined): Response | null {
  if (!project.onCommand || typeof init?.body !== 'string') return null
  const command: unknown = JSON.parse(init.body)
  if (!isCommand(command)) return null
  project.onCommand(command, new Headers(init.headers).get('idempotency-key') ?? '')
  const receipt: Receipt = {
    commandId: crypto.randomUUID(),
    projectId: PROJECT,
    cursor: String(project.revision),
    stage: 'admitted',
    goalId: command.goalId,
    goalRevision: command.expectedGoalRevision,
    authorityEpoch: command.expectedAuthorityEpoch,
  }
  return json(receipt)
}

/** A rename (A21): the title the request names, for every read from now on. */
function renamed(project: Project, init: RequestInit | undefined): Response {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const title: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'title') : null
  if (typeof title !== 'string' || !title.trim()) {
    const problem = { code: 'invalid_request', message: 'A project needs a title', requestId: PROJECT, retry: 'never' }
    return new Response(JSON.stringify(problem), { status: 422, headers: { 'content-type': 'application/json' } })
  }
  project.title = title
  served.push(`rename:${title}`)
  return json({ projectId: PROJECT, title, cursor: String(project.revision) })
}

/** Leaving (A22): recorded, and the project leaves the list; the only admin is refused as the API refuses them. */
function departed(project: Project): Response {
  if (project.soleAdmin && (project.role ?? membership.role) === 'admin') {
    const problem = {
      code: 'invalid_state',
      message: 'You’re the project’s only admin, so you can’t leave it yet',
      requestId: PROJECT,
      retry: 'never',
    }
    return new Response(JSON.stringify(problem), { status: 409, headers: { 'content-type': 'application/json' } })
  }
  project.left = true
  served.push('leave')
  return json({ projectId: PROJECT, cursor: String(project.revision) })
}

/** A room token, unless the next one is to fail (`failToken`); each one asked for is recorded (`room-token`). */
function tokenAnswer(project: Project): Response {
  served.push('room-token')
  if (!project.failToken) return json(roomToken)
  project.failToken = false
  return unavailable()
}

/** An admin archives the project, or brings it back (A30): recorded, and the lists read it so. */
function archived(project: Project, init: RequestInit | undefined): Response {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const wanted = typeof body === 'object' && body !== null && Reflect.get(body, 'archived') === true
  project.archived = wanted
  served.push(`archive:${String(wanted)}`)
  return json({ projectId: PROJECT, archived: wanted, cursor: String(project.revision) })
}

/** A request to revise the page's sections (requestDesignEdit): recorded; refused once as a design under way. */
function designEdited(project: Project, init: RequestInit | undefined): Response | Promise<Response> {
  const held = project.editHeld
  if (held) return new Promise((resolve) => held.push(() => resolve(designAdmitted(project, init))))
  return designAdmitted(project, init)
}

function designAdmitted(project: Project, init: RequestInit | undefined): Response {
  if (project.failEdit) {
    project.failEdit = false
    const problem = {
      code: 'invalid_state',
      message: 'A design of this page is under way',
      requestId: PROJECT,
      retry: 'never',
    }
    return new Response(JSON.stringify(problem), { status: 409, headers: { 'content-type': 'application/json' } })
  }
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const field = (k: string): unknown => (typeof body === 'object' && body !== null ? Reflect.get(body, k) : undefined)
  const sections = field('sections')
  const versionId = field('versionId')
  served.push(`html-edit:${Array.isArray(sections) ? sections.join(',') : ''}:${String(field('instruction'))}`)
  const id = '00000000-0000-4000-8000-0000000009e1'
  return new Response(
    JSON.stringify({
      taskId: id,
      state: 'designing',
      versionId,
      baseCandidateId: id,
      sections,
      shell: false,
      styles: false,
    }),
    { status: 202, headers: { 'content-type': 'application/json' } },
  )
}

/** The project's own writes: its rename (A21), a member leaving it (A22), an admin's host controls (A24). */
function projectWritten(
  project: Project,
  path: string,
  init: RequestInit | undefined,
): Response | Promise<Response> | null {
  const base = `/api/v1/projects/${PROJECT}`
  if (path === `${base}/title`) return renamed(project, init)
  if (path === `${base}/html-edits`) return designEdited(project, init)
  if (path === `${base}/leave`) return departed(project)
  if (path === `${base}/archive`) return archived(project, init)
  const removal = MEMBER_REMOVAL.exec(path)?.[1]
  if (removal) return memberRemoved(project, removal)
  const host = HOST_ACT.exec(path)
  if (path === `${base}/room/mute-all`) return mutedAll(project)
  return host?.[1] && isHostAct(host[2]) ? hostAct(project, host[2], host[1]) : null
}

const HOST_ACT = new RegExp(
  `^/api/v1/projects/${PROJECT}/room/people/([0-9a-f-]+)/(mute|remove|stop-camera|stop-screen)$`,
)

type HostAct = 'mute' | 'remove' | 'stop-camera' | 'stop-screen'
const isHostAct = (what: string | undefined): what is HostAct =>
  what === 'mute' || what === 'remove' || what === 'stop-camera' || what === 'stop-screen'

/**
 * An admin mutes everyone else (A31), in the API's order (rooms.ts): every other microphone in the fake room goes off,
 * then the act is recorded and answered. Held, only the answer waits. With `failAfterMuteAll`, the answer is refused.
 */
function mutedAll(project: Project): Response | Promise<Response> {
  if (project.failHost) {
    project.failHost = false
    return unavailable()
  }
  served.push('mute-all')
  for (const p of others()) hostActed('mute', p.identity)
  const reply = project.failAfterMuteAll ? unavailable() : new Response(null, { status: 204 })
  project.failAfterMuteAll = false
  const held = project.hostHeld
  return held ? new Promise((resolve) => held.push(() => resolve(reply))) : reply
}

/** An admin acts on someone (A24, A31): recorded, and LiveKit's server applies it to the fake room. */
function hostAct(project: Project, what: HostAct, identity: string): Response | Promise<Response> {
  if (project.failHost) {
    project.failHost = false
    return unavailable()
  }
  served.push(`${what}:${identity}`)
  const done = () => {
    hostActed(what, identity)
    return new Response(null, { status: 204 })
  }
  const held = project.hostHeld
  return held ? new Promise((resolve) => held.push(() => resolve(done()))) : done()
}

/** The project's activity (A28): sixty acts, the oldest its creation; 50 a page, newest first. */
function activityRead(url: URL): Response {
  const people = [
    { id: membership.actorId, name: VIEWER_NAME },
    { id: personId(1), name: 'Marco' },
    { id: personId(2), name: 'Lucía' },
  ]
  const kinds = [
    { type: 'project.renamed', summaryCode: 'project.renamed', onMember: false },
    { type: 'goal.target_set', summaryCode: 'goal.target', onMember: false },
    { type: 'project.member_role_changed', summaryCode: 'project.member_role', onMember: true },
    { type: 'room.host_removed', summaryCode: 'room.host_removed', onMember: true },
  ]
  const all = Array.from({ length: 60 }, (_, i) => {
    const sequence = i + 1
    const kind =
      sequence === 1
        ? { type: 'project.created', summaryCode: 'project.created', onMember: false }
        : kinds[(sequence + 3) % 4]
    const actor = people[(sequence + 1) % 3] ?? people[0]
    const target = kind?.onMember ? (people[(sequence + 2) % 3] ?? null) : null
    return {
      sequence: String(sequence),
      occurredAt: new Date(Date.UTC(2026, 9, 15, 9, sequence)).toISOString(),
      type: kind?.type ?? 'project.renamed',
      summaryCode: kind?.summaryCode ?? 'project.renamed',
      actor,
      target,
    }
  }).toReversed()
  const before = Number(url.searchParams.get('before') ?? '61')
  const page = all.filter((e) => Number(e.sequence) < before).slice(0, 50)
  const more = all.some((e) => Number(e.sequence) < Number(page.at(-1)?.sequence ?? '0'))
  return json({ entries: page, before: more ? (page.at(-1)?.sequence ?? null) : null })
}

/** The project's own reads: its discussion (A20 proposed, A23), its goals' targets and its members (A25). */
function projectRead(project: Project, url: URL): Response | Promise<Response> | null {
  const base = `/api/v1/projects/${PROJECT}`
  if (url.pathname === `${base}/activity`)
    return project.activityHeld ? new Promise<Response>(() => undefined) : activityRead(url)
  if (url.pathname.startsWith(`${base}/discussion`)) return discussionRead(project, url)
  if (url.pathname === `${base}/goal-targets`) return targetsAnswer(project)
  if (url.pathname !== `${base}/members`) return null
  return project.membersFail ? new Response(JSON.stringify(UNAVAILABLE), { status: 503 }) : membersRead(project)
}

/** The goals' targets as read: held while asked (`holdTargets`), refused while they fail (`failTargets`). */
function targetsAnswer(project: Project): Response | Promise<Response> {
  const held = project.targetsHeld
  if (held) return new Promise<Response>((resolve) => held.push(() => resolve(targetsNow(project))))
  return targetsNow(project)
}

/** The goals' targets once let through: refused while they fail, each refusal recorded (`targets-refused`), else read. */
function targetsNow(project: Project): Response {
  if (!project.targetsFail) return goalTargetsRead(project)
  served.push('targets-refused')
  return new Response(JSON.stringify(UNAVAILABLE), { status: 503 })
}

/** The goals' owners and dates (A25). */
function goalTargetsRead(project: Project): Response {
  const targets = [...(project.goalTargets?.entries() ?? [])].map(([goalId, t]) => ({ goalId, ...t }))
  return json({ targets })
}

/** The project's members (A25): the viewer and the two others the room fixture names, with roles as changed (A27). */
function membersRead(project: Project): Response {
  const roleOf = (actorId: string, start: Membership['role']) => project.memberRoles?.get(actorId) ?? start
  const gone = project.removedMembers ?? new Set<string>()
  return json({
    members: (
      [
        {
          actorId: membership.actorId,
          role: roleOf(membership.actorId, project.role ?? membership.role),
          name: VIEWER_NAME,
        },
        { actorId: personId(1), role: roleOf(personId(1), 'editor'), name: 'Marco' },
        { actorId: personId(2), role: roleOf(personId(2), 'viewer'), name: 'Lucía' },
      ] as const
    ).filter((m) => !gone.has(m.actorId)),
  })
}

const GOAL_TARGET = new RegExp(`^/api/v1/projects/${PROJECT}/goals/([0-9a-f-]+)/target$`)
const MEMBER_ROLE = new RegExp(`^/api/v1/projects/${PROJECT}/members/([0-9a-f-]+)/role$`)
const MEMBER_REMOVAL = new RegExp(`^/api/v1/projects/${PROJECT}/members/([0-9a-f-]+)/removal$`)

/** A member removed (A29): an admin's; recorded, and the member leaves the list. */
function memberRemoved(project: Project, actorId: string): Response {
  if ((project.role ?? membership.role) !== 'admin') return refused('Only an admin removes members')
  ;(project.removedMembers ??= new Set()).add(actorId)
  served.push(`remove-member:${actorId}`)
  return json({ actorId, cursor: String(project.revision) })
}

/** The project's own PUTs: a goal's owner and date (A25), a member's role (A27); null for any other path. */
function projectPut(project: Project, path: string, init: RequestInit | undefined): Response | null {
  const target = GOAL_TARGET.exec(path)?.[1]
  if (target) return goalTargetPut(project, target, init)
  const member = MEMBER_ROLE.exec(path)?.[1]
  return member ? rolePut(project, member, init) : null
}

/** The role a request names, or null. */
function requestedRole(init: RequestInit | undefined): Membership['role'] | null {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const next: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'role') : null
  return next === 'admin' || next === 'editor' || next === 'viewer' ? next : null
}

const NEEDS_AN_ADMIN = {
  code: 'invalid_state',
  message: 'A project needs an admin: make another member an admin first',
  requestId: PROJECT,
  retry: 'never',
}

/** A member's role changed (A27): an admin's; the only admin stepping down is refused, as the API refuses it. */
function rolePut(project: Project, actorId: string, init: RequestInit | undefined): Response {
  if ((project.role ?? membership.role) !== 'admin') return refused('Only an admin changes roles')
  const next = requestedRole(init)
  if (!next) return refused('Unknown role')
  const roles = (project.memberRoles ??= new Map())
  if (actorId === membership.actorId && next !== 'admin' && project.soleAdmin)
    return new Response(JSON.stringify(NEEDS_AN_ADMIN), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })
  roles.set(actorId, next)
  served.push(`role:${actorId}:${next}`)
  return json({ actorId, role: next, revision: 2, cursor: String(project.revision) })
}

/** A goal's owner and date set (A25): an editor's or an admin's, compare-and-set on its revision. */
function goalTargetPut(project: Project, goalId: string, init: RequestInit | undefined): Response {
  if (project.role === 'viewer') return refused('Only editors and admins set a goal’s owner and date')
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const field = (k: string): unknown => (typeof body === 'object' && body !== null ? Reflect.get(body, k) : undefined)
  const [ownerId, targetDate, expected] = [field('ownerId'), field('targetDate'), field('expectedRevision')]
  const targets = (project.goalTargets ??= new Map())
  const now = targets.get(goalId)
  if (project.staleTarget) {
    project.staleTarget = false
    targets.set(goalId, { ownerId: personId(2), targetDate: '2026-12-01', revision: (now?.revision ?? 0) + 1 })
    publish(project)
    const problem = { code: 'stale_revision', message: 'The goal’s target changed', requestId: PROJECT, retry: 'never' }
    return new Response(JSON.stringify(problem), { status: 409, headers: { 'content-type': 'application/json' } })
  }
  served.push(`target:${String(ownerId)}:${String(targetDate)}:${String(expected)}`)
  const next = {
    ownerId: typeof ownerId === 'string' ? ownerId : null,
    targetDate: typeof targetDate === 'string' ? targetDate : null,
    revision: (now?.revision ?? 0) + 1,
  }
  targets.set(goalId, next)
  publish(project)
  return json({ goalId, ...next, cursor: String(project.revision) })
}

/** The room's discussion read: A20's replies (proposed), or a page of it (A23). */
const discussionRead = (project: Project, url: URL) =>
  url.pathname.endsWith('/replies') ? repliesRead(project) : discussionPage(project, url)

/** A page of the room's discussion (A23): the 50 before `before`, oldest first; `before` again while older ones remain. */
function discussionPage(project: Project, url: URL): Response {
  const anchor = url.searchParams.get('before')
  served.push(`discussion:${anchor ?? 'newest'}`)
  if (project.failEarlier) {
    project.failEarlier = false
    return unavailable()
  }
  const all = project.messages.map(said)
  const end = anchor ? all.findIndex((e) => e.id === anchor) : all.length
  if (end < 0) {
    const problem = {
      code: 'not_found',
      message: 'That message is no longer in the discussion.',
      requestId: PROJECT,
      retry: 'never',
    }
    return new Response(JSON.stringify(problem), { status: 422, headers: { 'content-type': 'application/json' } })
  }
  const start = Math.max(0, end - 50)
  const entries = all.slice(start, end)
  return json({ entries, before: start > 0 ? (entries[0]?.id ?? null) : null })
}

/**
 * The snapshot as the API serves it; refused once the door is shut under the shell (`window.fixture.shutDoor`). Held
 * (`snapshot=hold`), it answers once let through, as it is then.
 */
function snapshotAnswer(project: Project): Response | Promise<Response> {
  const held = project.snapshotHeld
  if (held) return new Promise<Response>((resolve) => held.push(() => resolve(snapshotAnswer(project))))
  served.push(`snapshot:${project.revision}`)
  return project.doorShut ? refused('You no longer have access to this project') : json(snapshotOf(project))
}

function answer(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const signal = init?.signal
  const base = `/api/v1/projects/${PROJECT}`
  const path = url.pathname
  if (method === 'GET' && path === `${base}/snapshot`) return snapshotAnswer(project)
  const records = recordsAnswer(project, method, url, init)
  if (records !== undefined) return records
  if (method === 'GET' && path === `${base}/membership`) return membershipRead(project)
  if (method === 'GET' && path === `${base}/events`) {
    return eventStream(project, Number(url.searchParams.get('after') ?? '0'), signal)
  }
  if (method === 'POST' || method === 'PUT') return written(project, method, path, init)
  return answerReports(project, method, url, init)
}

/** The vision's proposed reads, and A18's writes; undefined for any other request. */
function visionAnswer(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  if (method === 'GET') return visionRead(project, url)
  return method === 'POST' ? talkWritten(project, url.pathname, init) : undefined
}

/** A18's writes, where the page keeps conversations; undefined for any other request. */
function talkWritten(project: Project, path: string, init: RequestInit | undefined) {
  if (!project.conversations) return undefined
  const ctx = {
    viewer: project.role === 'viewer',
    admin: membershipOf(project).role === 'admin',
    record: (what: string) => served.push(what),
    moved: () => publish(project),
    cursor: () => String(project.revision),
  }
  const talk = project.conversations
  const taken = conversationWithdrawn(talk, path, init, ctx)
  if (taken !== undefined) return taken
  const erasure = conversationErased(talk, path, init, ctx)
  return erasure === undefined ? conversationWritten(talk, path, init, ctx) : erasure
}

/** A need's ref, with the record that holds it when the address needs it: a version's report, a decision's work item. */
const needRef = (kind: string, id: string, within: string | null = null, resourceId: string | null = null) => ({
  kind,
  id,
  within,
  resourceId,
})

/** What needs the viewer (A15, docs/plans/needs-api.md): one of each kind, given out of order; the Studio sorts them. */
export function needsAnswer(now = Date.now()) {
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString()
  const here = { projectId: PROJECT, projectTitle: PROJECT_NAME }
  const need = (id: string, kind: string, title: string, over: Record<string, unknown>) => ({
    id,
    kind,
    title,
    ...here,
    expiresAt: null,
    detail: null,
    ...over,
  })
  return {
    readAt: new Date(now).toISOString(),
    needs: [
      need('permission:wait-w1', 'permission', 'Claude Code asks to run the export tests', {
        // A wait has no expiry (A13): a permission says how long it has waited instead.
        detail: 'Asked 10 min ago',
        at: at(-10),
        // The wait by its request (A13's reference, the request Resources lists), the work item that holds it, and
        // the resource whose tool holds the request.
        ref: needRef('work_wait', 'action-1', '00000000-0000-4000-8000-0000000000c1', 'davide-claude'),
      }),
      need('guest:g1', 'guest', 'Marco Pereira is in the lobby', {
        detail: 'Waiting 2 min',
        at: at(-2),
        ref: needRef('lobby_entry', 'g1'),
      }),
      need('decision:d1', 'decision', 'Ship the retry with the hotfix?', {
        expiresAt: at(20),
        at: at(-60),
        ref: needRef('work_decision', 'd1', '00000000-0000-4000-8000-0000000000c3'), // the work item that holds it
      }),
      need('reply:t9', 'reply', 'Sophia replied about the launch date', {
        projectId: null,
        projectTitle: null,
        detail: 'Yesterday',
        at: at(-1440),
        ref: needRef('personal_turn', 't9'),
      }),
    ],
  }
}

/** The person's archived projects (A30): this one, when it is. */
function archivedListAnswer(project: Project): Response {
  served.push('projects:archived')
  const listed = { projectId: PROJECT, title: 'Fixture project', role: project.role ?? membership.role, members: 3 }
  const projects = project.archived && !project.left ? [{ ...listed, room: null, nextSession: null, releases: [] }] : []
  return json({ projects, personalEpoch: 1 })
}

/** The person's own reads (the projects they are in, what needs them); undefined for any other request. */
function ownRead(project: Project, url: URL) {
  if (url.pathname === '/api/v1/projects') return projectListAnswer(project)
  if (url.pathname === '/api/v1/projects/archived') return archivedListAnswer(project)
  if (url.pathname === '/api/v1/me/needs') return json(needsAnswer())
  return undefined
}

/** The proposed reads of the vision (A13's search, A14's focus); undefined for any other request. */
function visionRead(project: Project, url: URL) {
  if (url.pathname === `/api/v1/projects/${PROJECT}/search`) return searchAnswer(project, url)
  const read = projectRead(project, url)
  if (read) return read
  const talk = project.conversations && conversationRead(project.conversations, url, membershipOf(project).role)
  if (talk !== undefined) return talk
  const own = ownRead(project, url)
  if (own !== undefined) return own
  const reviews = REVIEWS_OF.exec(url.pathname)
  if (reviews?.[2]) return reviewsRead(project, reviews[2])
  const tasksOf = TASKS_OF.exec(url.pathname)?.[1]
  if (tasksOf) return tasksRead(project, tasksOf)
  if (url.pathname !== `/api/v1/rooms/${ROOM}/focus` || !project.showing) return undefined
  served.push('room-focus:read')
  return json(roomFocus(project.showing, project.revision))
}

/** The brief, the meeting's records and the invitations sent (A08, A12); undefined for any other request. */
function recordsAnswer(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}`
  const path = url.pathname
  const vision = visionAnswer(project, method, url, init)
  if (vision !== undefined) return vision
  if (path.startsWith(`${base}/mission`)) return missionAnswer(project, method, path, init)
  if (method === 'GET' && path.startsWith(`${base}/meetings`)) return meetingAnswer(project, path)
  // Home reads it too (home-since-you-looked.md): a project with no meeting has nothing new since its last mark.
  if (method === 'GET' && path === `${base}/since`)
    return json(
      project.meeting ? updatesWindowOf(project.meeting, project.revision) : nothingSince(String(project.revision)),
    )
  if (project.invitations) return invitationsAnswer(project.invitations, method, path, init, base) ?? undefined
  if (method === 'GET' && path === `${base}/invitations`) return json({ invitations: [] })
  return undefined
}

/** A project search (A13, search-data.ts): one page of the hits, three a page. */
function searchAnswer(project: Project, url: URL): Response | Promise<Response> | null {
  const q = url.searchParams.get('q') ?? ''
  const cursor = url.searchParams.get('cursor')
  const meeting = project.meeting
  if (!meeting) return null
  served.push(`search:${q}:${cursor ?? '0'}`)
  const held = project.searchHeld
  const kept = project.notes?.kept ?? []
  const report = { versions: project.reportVersions, title: project.reportTitle, pilot: project.pilot }
  const page = () => json(searchPage(searchHits({ meeting, kept, report }, q), cursor))
  return held ? new Promise<Response>((resolve) => held.push(() => resolve(page()))) : page()
}

/** This viewer's membership: the fixture's own, in the role the page asked for. */
const membershipOf = (project: Project) => ({ ...membership, role: project.role ?? membership.role })

/** The reader's membership; while held, a read that waits until it is let through. */
function membershipRead(project: Project): Response | Promise<Response> {
  if (project.membershipFails) {
    served.push('membership:failed')
    return unavailable()
  }
  const held = project.membershipHeld
  if (held) return new Promise<Response>((resolve) => held.push(() => resolve(json(membershipOf(project)))))
  return json(membershipOf(project))
}

/** What a closed meeting's work made after it (the proposed `after` route): the running one's, once closed; none else. */
function afterAnswer(meeting: Meeting, path: string): Response | null {
  const afterOf = /\/meetings\/([^/]+)\/after$/.exec(path)?.[1]
  if (!afterOf) return null
  served.push('after')
  return json({ updates: afterOf === MEETING && meeting.closedAt ? meeting.after : [] })
}

/** The meeting's list and its recap (A12, meeting-data.ts). */
function meetingAnswer(project: Project, path: string): Promise<Response> | Response | null {
  const meeting = project.meeting
  const base = `/api/v1/projects/${PROJECT}/meetings`
  if (!meeting) return null
  if (path === base) return json(meetingList(meeting))
  const after = afterAnswer(meeting, path)
  if (after) return after
  if (path === `${base}/${MEETING}/so-far`) {
    served.push('so-far')
    return json(soFarOf(meeting, project.revision))
  }
  const recap = recapOf(meeting, /\/meetings\/([^/]+)\/recap$/.exec(path)?.[1] ?? '')
  if (!recap) return null
  const { held, fail } = meeting.recaps
  if (fail) return unavailable()
  served.push(`recap:${recap.endedAt ? 'closed' : 'running'}`)
  if (!held) return json(recap)
  return new Promise((resolve) => held.push(() => resolve(json(recap))))
}

/** A conversation this person can't see (erased): not found, as A33 refuses it (422, packages/domain/src/errors.ts). */
const conversationGone = () =>
  new Response(
    JSON.stringify({
      code: 'not_found',
      message: 'Conversation not found',
      requestId: '00000000-0000-4000-8000-0000000000ce',
      retry: 'never',
    }),
    { status: 422, headers: { 'content-type': 'application/json' } },
  )

/** A reader not a current member of the project: refused, before anything of a conversation is read (A33, CC-0072). */
const projectRefused = () =>
  new Response(
    JSON.stringify({
      code: 'forbidden',
      message: 'Not permitted',
      requestId: '00000000-0000-4000-8000-0000000000fb',
      retry: 'never',
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  )

/** The API's answer while it can't read the records (packages/domain/src/errors.ts). */
const unavailable = () =>
  new Response(
    JSON.stringify({
      code: 'unavailable',
      message: 'The records can’t be read right now',
      requestId: '00000000-0000-4000-8000-0000000000bf',
      retry: 'safe_read',
    }),
    { status: 503 },
  )

/** Any report's reviews or tasks (A16, A17): the report (and the version) captured. */
const REVIEWS_OF = /^\/api\/v1\/artifacts\/([0-9a-f-]{36})\/versions\/([0-9a-f-]{36})\/reviews$/
const TASKS_OF = /^\/api\/v1\/artifacts\/([0-9a-f-]{36})\/tasks$/
/** A page of a conversation's messages, read within its project (A33 getProjectConversationMessages). */
const MESSAGES_OF = /^\/api\/v1\/projects\/([0-9a-f-]{36})\/conversations\/([0-9a-f-]{36})\/messages$/

/** A33's reads: the list, or a page of a conversation's messages; undefined for any other request. */
function conversationRead(talk: Conversations, url: URL, role: Membership['role']) {
  if (url.pathname === `/api/v1/projects/${PROJECT}/conversations`) return conversationsRead(talk, role)
  const scoped = MESSAGES_OF.exec(url.pathname)
  if (!scoped?.[2]) return undefined
  // Another project's: this reader is a member of this fixture's only, and is refused there before anything is read.
  return scoped[1] === PROJECT ? messagesRead(talk, scoped[2], url) : projectRefused()
}

/** The project's conversations (A33), as listed, each one's newest message where the page asks for last messages. */
function conversationsRead(talk: Conversations, role: Membership['role']) {
  if (talk.failList) return unavailable()
  // As to a reader no longer in the project: refused (403), nothing of the list read.
  if (talk.refusedList) {
    served.push('conversations-refused')
    return projectRefused()
  }
  served.push('conversations:read')
  const opts = {
    lastShown: talk.lastShown === true,
    viewer: role === 'viewer',
    admin: role === 'admin',
    more: talk.more === true || Boolean(talk.cappedOut),
    askOff: talk.askOff === true,
  }
  const listed = talk.cappedOut ? talk.list.filter((c) => c.id !== talk.cappedOut) : talk.list
  const asRead = json(wireList(listed, talk.messages, opts))
  // Held: it answers later as it was read now, a read under way across what happens meanwhile (Codex at 7969d40).
  const held = talk.heldList
  return held ? new Promise<Response>((resolve) => held.push(() => resolve(asRead))) : asRead
}

/** A conversation's read that fails, is refused or finds it erased, before any of its messages is read; else null. */
function unreadable(talk: Conversations, conversationId: string): Response | null {
  if (talk.failMessagesOf === conversationId) return unavailable()
  // As to a reader no longer in the project: refused (403), the conversation itself never read.
  if (talk.refusedOf === conversationId) {
    served.push(`messages-refused:${conversationId.slice(-2)}`)
    return projectRefused()
  }
  // Erased here: as 0063's row policy hides it, the API refuses its read as not found. A page reads it again only as
  // the feed moves (the open thread and the list read at once), before the list shows it gone.
  if (talk.erasedIds?.has(conversationId)) {
    served.push(`messages-gone:${conversationId.slice(-2)}`)
    return conversationGone()
  }
  return null
}

/** A page of a conversation's messages (A18): the newest MESSAGE_PAGE, or those before `before`, oldest first. */
function messagesRead(talk: Conversations, conversationId: string, url: URL) {
  const unread = unreadable(talk, conversationId)
  if (unread) return unread
  const all = talk.messages[conversationId]
  if (!all) return null
  const before = url.searchParams.get('before')
  if (before !== null && talk.failOlder) return unavailable()
  // A cursor this list never gave is the client's mistake: unexpected, not an empty page.
  if (before !== null && !/^[1-9][0-9]*$/u.test(before)) return null
  const end = Math.min(all.length, Number(before ?? all.length))
  const start = Math.max(0, end - MESSAGE_PAGE)
  served.push(`messages:${conversationId.slice(-2)}:${String(start)}`)
  const asRead = json({
    conversationId,
    messages: all.slice(start, end).map((m, i) => wireMessage(m, start + i)),
    before: start > 0 ? String(start) : null,
  })
  // Held: it answers later as it was read now, a read under way across what happens meanwhile (CX-0074).
  const held = talk.heldMessages
  return held ? new Promise<Response>((resolve) => held.push(() => resolve(asRead))) : asRead
}

/** Who waits at the door: one first knock, one knocking again (`lobby=again`), or two (`lobby=two`). */
function lobbyOf(asked: string | null | undefined) {
  if (asked === 'again') return [{ ...waitingAtTheDoor, knocks: 2 }]
  if (asked === 'two') {
    return [
      waitingAtTheDoor,
      { ...waitingAtTheDoor, id: '00000000-0000-4000-8000-0000000000b7', displayName: 'Bea Soto' },
    ]
  }
  return [waitingAtTheDoor]
}

/** The person's projects (`GET /api/v1/projects`): this one, with what members carried in from Personal. */
function projectListAnswer(project: Project): Response | Promise<Response> {
  const held = project.projectsHeld
  if (held) return new Promise<Response>((resolve) => held.push(() => resolve(projectListAnswer(project))))
  if (project.projectsFail) return unavailable()
  served.push('projects:read')
  const room = null
  const listed = {
    projectId: PROJECT,
    title: 'Fixture project',
    role: project.role ?? membership.role,
    members: 3,
    room,
    nextSession: null,
    releases: project.carriedIn ?? [],
  }
  const other = { ...listed, projectId: '00000000-0000-4000-8000-0000000000a9', title: 'Another project', releases: [] }
  const mine = project.left || project.archived ? [] : [listed]
  return json({ projects: project.carriedElsewhere ? [other] : mine, personalEpoch: 1 })
}

/** A version's reviews as read (A16): none where the page keeps none, and then the read isn't counted. */
function reviewsRead(project: Project, versionId: string) {
  if (project.reviews?.failReads) return unavailable()
  const reply = () => {
    if (project.reviews) served.push('reviews:read')
    return json({ reviews: project.reviews?.byVersion.get(versionId) ?? [] })
  }
  const held = project.reviews?.heldReads
  return held ? new Promise<Response>((resolve) => held.push(() => resolve(reply()))) : reply()
}

/** A report's tasks as read (A17): the fixture report's, where the page keeps them; any other report's, none. */
function tasksRead(project: Project, artifactId: string) {
  if (project.tasks?.failReads) return unavailable()
  const reply = () => {
    if (project.tasks) served.push('tasks:read')
    return json({ tasks: artifactId === REPORT ? (project.tasks?.list ?? []) : [] })
  }
  const held = project.tasks?.heldReads
  return held ? new Promise<Response>((resolve) => held.push(() => resolve(reply()))) : reply()
}

/** A review written (A16): 201, once per key; a viewer is refused; a reply lost when the page asks for that. */
function reviewPosted(project: Project, versionId: string, init: RequestInit | undefined) {
  const reviews = project.reviews
  if (!reviews) return null
  if (project.role === 'viewer') return notAllowed()
  if (reviews.drop) {
    reviews.drop = false
    return Promise.reject(new TypeError('Failed to fetch')) // it never reached the API: nothing recorded
  }
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const done = reviewed(reviews, versionId, membership.actorId, key, init?.body)
  if (!done) return null
  if (reviews.loseReply) {
    reviews.loseReply = false
    if (done.first) served.push(`review:${done.review.verdict}`)
    // It landed, but neither its reply nor its event has reached the page yet: only Try again can tell it.
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  if (done.first) served.push(`review:${done.review.verdict}`)
  return reviewAnswer(project, reviews, done)
}

/** A review's reply: after the feed moved and then lost, held until released, or at once (the feed moving). */
function reviewAnswer(project: Project, reviews: Reviews, done: { review: VersionReview; first: boolean }) {
  const reply = () =>
    new Response(JSON.stringify(done.review), { status: 201, headers: { 'content-type': 'application/json' } })
  if (reviews.publishThenLose) {
    reviews.publishThenLose = false
    publish(project) // its record reaches the page while the press is still on its way
    return new Promise<Response>((_, reject) => setTimeout(() => reject(new TypeError('Failed to fetch')), 1500))
  }
  // Held, it is recorded at once and its reply waits; the feed moves with whatever comes next, not with the release.
  const held = reviews.held
  if (held) return new Promise<Response>((resolve) => held.push(() => resolve(reply())))
  if (done.first) publish(project) // a record: the feed moves
  return reply()
}

/** A task done (A17): `/api/v1/projects/{project}/tasks/{task}/done`, the task captured. */
const TASK_DONE = new RegExp(`^/api/v1/projects/${PROJECT}/tasks/([0-9a-f-]{36})/done$`)

/** The answer to a task's write (A17): its reply lost when the page asks for that, else the task and the feed moved. */
function taskAnswer(project: Project, tasks: Tasks, done: { task: ProjectTask; first: boolean }, what: string) {
  if (done.first) served.push(`task:${what}`)
  if (tasks.loseReply) {
    tasks.loseReply = false
    return Promise.reject(new TypeError('Failed to fetch')) // it landed; only Try again can tell it
  }
  const reply = () =>
    new Response(JSON.stringify(done.task), {
      status: what === 'create' ? 201 : 200,
      headers: { 'content-type': 'application/json' },
    })
  // Held, it is recorded at once and its reply waits; the feed moves with whatever comes next, not with the release.
  const held = tasks.held
  if (held) return new Promise<Response>((resolve) => held.push(() => resolve(reply())))
  if (done.first) publish(project) // a record: the feed moves
  return reply()
}

/** A task made from a passage (A17): 201, once per key; a viewer is refused. */
function taskPosted(project: Project, init: RequestInit | undefined) {
  const tasks = project.tasks
  if (!tasks) return null
  if (project.role === 'viewer') return refused('Only editors and admins make tasks')
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const done = created(tasks, membership.actorId, key, init?.body)
  return done ? taskAnswer(project, tasks, done, 'create') : null
}

/** A task done (A17): by whoever it is for (anyone's, any member's), an editor or an admin. */
function taskDone(project: Project, taskId: string, init: RequestInit | undefined) {
  const tasks = project.tasks
  const task = tasks?.list.find((t) => t.taskId === taskId)
  if (!tasks || !task) return null
  const mine = task.owner === null || task.owner === membership.actorId
  if (project.role === 'viewer' && !mine) return refused('Only whoever it is for, an editor or an admin marks it done')
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const done = finished(tasks, taskId, membership.actorId, key)
  return done ? taskAnswer(project, tasks, done, 'done') : null
}

/** A refusal in the API's words: 403, never retried. */
const refused = (message: string) =>
  new Response(
    JSON.stringify({ code: 'forbidden', message, requestId: '00000000-0000-4000-8000-0000000000bd', retry: 'never' }),
    { status: 403 },
  )

/** A close by a member who may only read: closing is an editor's or an admin's (A12). */
const notAllowed = () =>
  new Response(
    JSON.stringify({
      code: 'forbidden',
      message: 'Only editors and admins close a meeting',
      requestId: '00000000-0000-4000-8000-0000000000be',
      retry: 'never',
    }),
    { status: 403 },
  )

/** The meeting closed for everyone (A12): once, whatever key a later close carries. */
function meetingClosed(project: Project, init: RequestInit | undefined): Promise<Response> | Response | null {
  const meeting = project.meeting
  if (!meeting) return null
  if (project.role === 'viewer') return notAllowed()
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const first = meeting.closes.size === 0
  if (first) publish(project) // the close is a record: the feed moves, and the receipt names where it is
  const receipt = closed(meeting, key, project.revision)
  if (first) served.push('meeting:closed')
  if (meeting.loseReply) {
    meeting.loseReply = false
    return Promise.reject(new TypeError('Failed to fetch')) // it closed; the page never hears so
  }
  return new Response(JSON.stringify(receipt), { status: 202, headers: { 'content-type': 'application/json' } })
}

/** A decision on the served board answered (`admits=`): the page's receipt for it; null for any other write. */
function answered(project: Project, method: string, path: string, init: RequestInit | undefined): Response | null {
  const decision = new RegExp(`^/api/v1/projects/${PROJECT}/decisions/([^/]+)/answer$`).exec(path)?.[1]
  if (method !== 'POST' || !decision || !project.onAnswer) return null
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  return json(project.onAnswer(decodeURIComponent(decision), body))
}

/** What the page writes: the room's focus (PUT), else what it posts. */
function written(project: Project, method: string, path: string, init: RequestInit | undefined) {
  if (method === 'POST' && path === `/api/v1/projects/${PROJECT}/plans/source-review` && project.proposals)
    return proposed(project.proposals, init)
  const receipt = answered(project, method, path, init)
  if (receipt) return receipt
  if (method === 'PUT' && path === `/api/v1/projects/${PROJECT}/seen`) return seenPut(project, init)
  const put = method === 'PUT' ? projectPut(project, path, init) : null
  if (put) return put
  if (method === 'PUT') return path === `/api/v1/rooms/${ROOM}/focus` ? focusPut(project, init) : null
  return posted(project, path, init)
}

/** The viewer saw up to a sequence (A13): 204, never lowered; a lost reply has still landed. */
function seenPut(project: Project, init: RequestInit | undefined): Promise<Response> | Response | null {
  const meeting = project.meeting
  const request: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const ok = typeof request === 'object' && request !== null && 'sequence' in request
  if (!meeting || !ok || typeof request.sequence !== 'string') return null
  served.push(`seen:${request.sequence}`)
  markSeen(meeting, request.sequence)
  if (!meeting.seen.loseReply) return new Response(null, { status: 204 })
  meeting.seen.loseReply = false
  return Promise.reject(new TypeError('Failed to fetch')) // it landed; the page never hears so
}

/**
 * Showing a report, or stopping (the proposed A14 writer): refused when the room moved since the page read it; else
 * the focus is this member's, the room's next revision publishes it, and the same key replays the receipt.
 */
function focusPut(project: Project, init: RequestInit | undefined): Response | Promise<Response> | null {
  const showing = project.showing
  const request = focusRequest(init?.body)
  if (!showing || !request) return null
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const replayed = showing.receipts.get(key)
  // The house rule (packages/persistence/src/commands.ts): a key used for another request is refused, never replayed.
  if (replayed) return replayed.request === JSON.stringify(request) ? json(replayed.receipt) : keyConflict()
  if (project.roomMoves) {
    project.roomMoves = false
    publish(project)
  }
  if (request.expectedRoomRevision !== project.revision) return staleRoom()
  publish(project)
  const receipt = focusSet(showing, request, membership.actorId, key, project.revision)
  served.push(`focus:${request.artifactVersionId ?? 'none'}`)
  if (!showing.loseReply) return json(receipt)
  showing.loseReply = false
  return Promise.reject(new TypeError('Failed to fetch')) // it landed; the page never hears so
}

/** The reports' requests: the long report the reading checks read (reading-data.ts), else the fixture report's. */
function answerReports(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const reading = method === 'GET' ? readingRead(url.pathname) : null
  return reading ? json(reading) : answerReport(project, method, url, init)
}

/** Another project the reader has reports in (`reports=elsewhere`), as the report list names it. */
const ELSEWHERE = { projectId: '00000000-0000-4000-8000-0000000000a9', title: 'Another project' }

/** The fixture report's card, naming a version published since its versions were read. */
const ahead = (card: ReportList['reports'][number]): ReportList['reports'][number] =>
  card.artifactId === REPORT ? { ...card, currentVersionId: '00000000-0000-4000-8000-0000000000dd' } : card

/** Knowledge's list of reports, as the reader asked for it (words, a format, a page, a project). */
function reportsAnswer(project: Project, url: URL) {
  const filter = { q: url.searchParams.get('q'), format: url.searchParams.get('format') }
  const published = versions(project.reportVersions, project.reportTitle, project.pilot, project.designed)
  const listed = reportList(published, project.description, url.searchParams.get('cursor'), filter)
  const list = project.cardAhead ? { ...listed, reports: listed.reports.map(ahead) } : listed
  if (!project.reportsElsewhere) return json(list)
  // The other project's report, under the same words and format; listed only when one is left.
  const theirs = [elsewhereCard(ELSEWHERE.projectId, ELSEWHERE.title)].filter((c) => matchesFilter(c, filter))
  const projects = theirs.length > 0 ? [...list.projects, { ...ELSEWHERE, count: theirs.length }] : list.projects
  const asked = url.searchParams.get('project')
  if (asked === ELSEWHERE.projectId) return json({ reports: theirs, projects, nextCursor: null })
  // Every project: theirs after this project's, on the last page (it is the oldest).
  if (asked === 'all' && list.nextCursor === null)
    return json({ ...list, reports: [...list.reports, ...theirs], projects })
  return json({ ...list, projects })
}

/** Reads of the report cards the page holds, each waiting to be let through (`window.fixture.releaseReports`). */
const heldReports: (() => void)[] = []

/** Knowledge's cards; while the page holds them, a read that answers once let through, with the cards as they are. */
function reportsRead(project: Project, url: URL): Response | Promise<Response> {
  if (!project.reportsHeld) return reportsAnswer(project, url)
  return new Promise((resolve) => heldReports.push(() => resolve(reportsAnswer(project, url))))
}

/** Lets the held reads of the cards through, and every later one. */
export function releaseReports(project: Project): void {
  project.reportsHeld = false
  for (const release of heldReports.splice(0)) release()
}

/**
 * The report viewer's and Knowledge's requests (SMC-M03): the fixture report's versions, their sources and text, its
 * task, its card, and an edit of its description.
 */
function answerReport(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const path = url.pathname
  if (method === 'PATCH') return edited(project, path, init)
  if (method !== 'GET') return null
  if (path === '/api/v1/knowledge/reports') return reportsRead(project, url)
  const listed = versionsOf(project, path)
  if (listed) return listed
  const source = /^\/api\/v1\/sources\/([0-9a-f-]{36})\/content$/.exec(path)?.[1]
  const text = source ? content(source, project.textTampered, project.pageTampered) : null
  if (text) {
    served.push(`content:${source ?? ''}`)
    return textRead(project, text)
  }
  if (path === `/api/v1/projects/${PROJECT}/native-tasks/${TASK}`) return taskRead(project)
  if (path === `/api/v1/projects/${PROJECT}/native-tasks/${DESIGN_TASK}`) return designRead(project)
  return workRead(project, path)
}

/** A report's versions (the fixture report's, or the older one's, which Knowledge's cover reads) and its sources. */
function versionsOf(project: Project, path: string): Response | Promise<Response> | null {
  if (/^\/api\/v1\/artifacts\/[0-9a-f-]{36}\/versions\/[0-9a-f-]{36}\/source-origins$/.test(path))
    return originsRead(path)
  if (path === `/api/v1/artifacts/${REPORT}/versions`) return versionsRead(project)
  if (path === `/api/v1/artifacts/${OLDER_REPORT}/versions`) return json(olderVersions())
  if (path === `/api/v1/artifacts/${ELSEWHERE_REPORT}/versions`) return json(elsewhereVersions(ELSEWHERE.projectId))
  // The older report and the other project's cite nothing: their Sources tab reads an empty list.
  const citesNothing = [OLDER_REPORT, ELSEWHERE_REPORT].some((id) =>
    path.startsWith(`/api/v1/artifacts/${id}/versions/`),
  )
  if (citesNothing && path.endsWith('/sources')) {
    return json({ sources: [] })
  }
  const shelved = DEMO ? shelvedRead(project, path) : null
  if (shelved) return shelved
  if (path.startsWith(`/api/v1/artifacts/${REPORT}/versions/`) && path.endsWith('/sources')) return sourcesRead(project)
  return null
}

/** Reads of the library's covers the page holds, each waiting to be let through (`window.fixture.releaseCovers`). */
const heldCovers: (() => void)[] = []

/** The demo library's reports (demo-library.ts): their one version, and their sources, none. */
function shelvedRead(project: Project, path: string): Response | Promise<Response> | null {
  const listed = /^\/api\/v1\/artifacts\/([0-9a-f-]{36})\/versions(\/[0-9a-f-]{36}\/sources)?$/.exec(path)
  const shelf = listed ? libraryVersions(listed[1] ?? '') : null
  if (!listed || !shelf) return null
  if (listed[2]) return json({ sources: [] })
  if (!project.coversHeld) return json(shelf)
  return new Promise<Response>((resolve) => heldCovers.push(() => resolve(json(shelf))))
}

/** Lets the held covers through one after another, 400 ms apart, as a slow API answers them; and every later one. */
export function releaseCovers(project: Project): void {
  project.coversHeld = false
  heldCovers.splice(0).forEach((release, i) => setTimeout(release, (i + 1) * 400))
}

/** The design task of the research's page, read while it is designed (`design=designing`, B-19), then published. */
function designRead(project: Project): Response | null {
  if (project.designFail) {
    const [status, retry] = project.designFail === 'forbidden' ? [403, 'never'] : [503, 'safe_read']
    served.push(`design:${project.designFail}`)
    const body = { code: project.designFail, message: 'No', requestId: '00000000-0000-4000-8000-0000000000bb', retry }
    return new Response(JSON.stringify(body), { status })
  }
  if (!project.designing && !project.designed && !project.designCard) return null
  return json(designingTask(project.designed ? 'published' : 'designing'))
}

/**
 * Tasks' reads from the board Sophia serves (WBC-02), answered as the API answers a project with no plan yet: the goals
 * show alone. The source-review pilot is not enabled unless the page offers it (`review`): then each goal offers
 * Review sources.
 */
function workRead(project: Project, path: string) {
  if (path === `/api/v1/projects/${PROJECT}/plans`) {
    const board: WorkBoardView = {
      schema_version: 'sophia.work.board.v1',
      project_id: PROJECT,
      snapshot_cursor: String(project.revision),
      observed_at: new Date().toISOString(),
      coverage: 'complete',
      goals: project.servedGoals?.() ?? [],
    }
    const held = project.boardHeld
    return held ? new Promise<Response>((resolve) => held.push(() => resolve(json(board)))) : json(board)
  }
  if (path === `/api/v1/projects/${PROJECT}/plans/source-review`) {
    if (project.review) served.push(`review:offered:${String(project.review.sources.length)}`)
    return json(project.review ?? REVIEW_NOT_ENABLED)
  }
  const key = PROPOSAL_READ.exec(path)?.[1]
  if (key !== undefined && project.proposals) return proposalRead(project.proposals, decodeURIComponent(key))
  return null
}

const PROPOSAL_READ = new RegExp(`^/api/v1/projects/${PROJECT}/plans/source-review/proposals/([^/]+)$`)

/**
 * The viewer's own proposal under its key, as the service recorded it: every one sent arrived and was recorded (a lost
 * reply is lost on its way back), so any key it was sent under is found; any other is not.
 */
function proposalRead(p: NonNullable<Project['proposals']>, key: string): Response {
  const recorded = p.sent.some((s) => s.key === key)
  p.reads?.push(`${recorded ? 'recorded' : 'not_found'} ${key}`)
  if (!recorded) {
    return new Response(
      JSON.stringify({ code: 'not_found', message: 'Proposal not found', requestId: proposalId(9), retry: 'never' }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    )
  }
  return new Response(proposalAnswered().body, { status: 200, headers: { 'content-type': 'application/json' } })
}

const REVIEW_NOT_ENABLED: SourceReviewAvailability = {
  enabled: false,
  reason: 'Source review is not enabled for this project.',
  runtimeReady: false,
  maxAllowanceUsd: null,
  limits: {
    maxSources: 3,
    maxInputBytes: 32768,
    maxModelRequests: 8,
    maxReportBytes: 16384,
    web: false,
    shell: false,
    connectors: false,
  },
  route: {
    role: 'sophia-source-review-v1',
    id: 'source-review-luna-high-v1',
    provider: 'openai-review',
    model: 'gpt-6-luna',
    reasoningEffort: 'high',
    maxTokens: 16000,
    prices: { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
    priceUnit: 'usd_per_million_tokens',
  },
  sources: [],
}

/** An edit of the report's description on Knowledge, answered as the API answers it. */
function edited(project: Project, path: string, init: RequestInit | undefined) {
  if (path !== `/api/v1/artifacts/${REPORT}/summary`) return null
  const { next, reply } = editDescription(project.description, init?.body, membership.actorId)
  project.description = next
  if (!project.summaryLost) return reply
  project.summaryLost = false
  return Promise.reject(new TypeError('Failed to fetch')) // it landed; the page never hears so
}

/** The brief, and a note written in it, its withdrawal's preview and its withdrawal (brief-data.ts). */
function missionAnswer(project: Project, method: string, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}/mission`
  if (method === 'GET' && path === base) {
    const held = project.missionHeld
    if (held) return new Promise<Response>((resolve) => held.push(() => resolve(missionRead(project))))
    return missionRead(project)
  }
  // A08's proposal and decision, from a conversation's context (C7, mission-writes.ts).
  const brief = project.missionPlus ? missionWritten(project.missionPlus, method, path, init) : null
  if (brief) return brief
  return project.notes ? notesAnswer(project.revision, project.notes, method, path, init) : null
}

/** The brief as read: refused while notes are unread or reads fail (`failMission`), else with the conversations' part. */
function missionRead(project: Project): Response {
  if (project.notes?.unread || project.missionFails) return new Response(JSON.stringify(UNAVAILABLE), { status: 503 })
  // As to a reader no longer in the project: refused (403), nothing of the brief read (`refuseMission`).
  if (project.missionRefused) {
    served.push('mission-refused')
    return projectRefused()
  }
  served.push(`mission:${project.revision}`)
  const read = withContext(mission(project.revision, project.notes?.kept, !project.notes?.refused), project.missionPlus)
  // Just made, nothing is recorded until its first note: the ledger reads empty (first-step.md).
  const fresh = project.fresh && read.entries.length === 0
  return json(fresh ? { ...read, readState: 'empty', mission: null } : read)
}

/** The brief with what the conversations' context adds (a purpose, accepted decisions, one still open), if any. */
function withContext(ctx: MissionContext, plus: Project['missionPlus']): MissionContext {
  if (!plus || !ctx.mission) return ctx
  return {
    ...ctx,
    mission: { ...ctx.mission, purpose: plus.purpose },
    constraints: plus.constraints,
    pending: plus.pending,
  }
}

/** A note written in the brief, or its withdrawal. */
function notesAnswer(revision: number, notes: Notes, method: string, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}/mission/entries`
  if (method === 'POST' && path === base) {
    const kept = noteKept(notes, init?.body, revision, new Headers(init?.headers).get('idempotency-key') ?? '')
    if (!kept) return null
    served.push('note:kept')
    if (!notes.loseReply) return json(kept)
    notes.loseReply = false
    return Promise.reject(new TypeError('Failed to fetch')) // it landed; the page never hears so
  }
  const entryId = new RegExp(`^${base}/([0-9a-f-]{36})/withdrawal$`).exec(path)?.[1]
  return entryId ? withdrawal(revision, notes, method, entryId, init) : null
}

/** A note's withdrawal: what it would erase (GET), then the note withdrawn (POST). */
function withdrawal(revision: number, notes: Notes, method: string, entryId: string, init: RequestInit | undefined) {
  if (method === 'GET') {
    const preview = withdrawalPreview(notes, entryId)
    return preview && json(preview)
  }
  const withdrawn = method === 'POST' ? noteWithdrawn(notes, entryId, init?.body, revision) : null
  if (withdrawn) served.push('note:withdrawn')
  return withdrawn && json(withdrawn)
}

/** A message to the room (A05), recorded once per key as the viewer's discussion; the feed carries it to the chat. */
function contributed(project: Project, init: RequestInit | undefined): Response | Promise<Response> | null {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const map = project.contributions
  if (!map || !isContribution(body)) return null
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const replayed = map.get(key)
  // The same key replays its receipt; with other words it is refused, as the API refuses it.
  if (replayed) {
    served.push('replayed:contribution')
    return replayed.text === body.text ? recorded(replayed.receipt) : keyConflict()
  }
  const replyTo = replyOf(project, body)
  if (replyTo instanceof Response) return replyTo
  const id = entryIdOf(project.messages.length)
  project.messages.push({
    id,
    text: body.text,
    me: true,
    at: new Date().toISOString(),
    ...(replyTo ? { replyTo } : {}),
  })
  publish(project)
  served.push(`contribution:${body.intent}`)
  const receipt: ContributionReceipt = {
    contributionId: `00000000-0000-4000-8000-${String(map.size + 1).padStart(12, 'f')}`,
    projectId: PROJECT,
    sourceId: '00000000-0000-4000-8000-0000000000ae',
    sha256: '0'.repeat(64),
    intent: body.intent,
    cursor: String(project.revision),
    stage: 'recorded',
  }
  map.set(key, { text: body.text, receipt })
  return contributionAnswer(project, receipt)
}

/** A message's reply: at once, held until `releaseMessages`, or lost on the way. */
function contributionAnswer(project: Project, receipt: ContributionReceipt): Response | Promise<Response> {
  const held = project.messagesHeld
  if (held) return new Promise((resolve) => held.push(() => resolve(recorded(receipt))))
  if (!project.loseContributionReply) return recorded(receipt)
  project.loseContributionReply = false
  return Promise.reject(new TypeError('Failed to fetch')) // it landed; the page never hears so
}

/** A contribution recorded, as the API answers it: 202. */
const recorded = (receipt: ContributionReceipt) =>
  new Response(JSON.stringify(receipt), { status: 202, headers: { 'content-type': 'application/json' } })

const isContribution = (value: unknown): value is { text: string; intent: ContributionReceipt['intent'] } =>
  typeof value === 'object' &&
  value !== null &&
  'text' in value &&
  typeof value.text === 'string' &&
  'intent' in value &&
  typeof value.intent === 'string'

/** What the page posts: a room token, a goal's command, the floor passed on, a message to the room, or Sophia asked in. */
function posted(project: Project, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}`
  if (path === `${base}/contributions`) return contributed(project, init)
  const reviewOf = REVIEWS_OF.exec(path)?.[2]
  if (reviewOf) return reviewPosted(project, reviewOf, init)
  if (path === `${base}/tasks`) return taskPosted(project, init)
  const doneOf = TASK_DONE.exec(path)?.[1]
  if (doneOf) return taskDone(project, doneOf, init)
  if (path === `/api/v1/rooms/${ROOM}/meetings/${MEETING}/close`) return meetingClosed(project, init)
  if (path === `${base}/room-token`) return tokenAnswer(project)
  const own = projectWritten(project, path, init)
  if (own) return own
  if (path === `${base}/commands`) return admitted(project, init)
  if (path === `/api/v1/rooms/${ROOM}/input-floor`) return floorPassed(project, init)
  return exchangeWritten(project, path, init, () => publish(project))
}

const isFloorRequest = (value: unknown): value is FloorRequest =>
  typeof value === 'object' &&
  value !== null &&
  'nextActorId' in value &&
  typeof value.nextActorId === 'string' &&
  'expectedRoomRevision' in value &&
  typeof value.expectedRoomRevision === 'number'

/** The API's answer when its database is out of reach (packages/domain/src/errors.ts). */
const UNAVAILABLE = {
  code: 'unavailable',
  message: 'Sophia is unavailable',
  requestId: '00000000-0000-4000-8000-0000000000bd',
  retry: 'safe_read',
}

/**
 * A20: the entry a message answers (`threadId`), with who wrote it and its first words, recorded with the reply;
 * refused when the discussion no longer holds it; none, undefined.
 */
function replyOf(project: Project, body: object): Said['replyTo'] | Response {
  const id = 'threadId' in body && typeof body.threadId === 'string' ? body.threadId : undefined
  if (id === undefined) return undefined
  const original = project.messages.find((m, n) => idOf(m, n) === id)
  if (original === undefined) return noLongerThere()
  served.push(`contribution-reply:${id}`)
  const text = typeof original === 'string' ? original : original.text
  return { id, actorId: authorOf(original), excerpt: text.slice(0, 80) }
}

/** The API's answer to a key used before for another request (packages/domain/src/errors.ts). */

/** A reply to an entry the discussion no longer holds (A20): refused, nothing recorded. */
const noLongerThere = () =>
  new Response(
    JSON.stringify({
      code: 'invalid_state',
      message: 'That message is no longer in the discussion.',
      requestId: '00000000-0000-4000-8000-0000000000bd',
      retry: 'never',
    }),
    { status: 409 },
  )

/** A20's proposed read: which entries answer which, with the original's first words (an excerpt, as recorded). */
function repliesRead(project: Project) {
  if (project.failReplies) {
    served.push('replies:failed')
    return unavailable()
  }
  const replies = project.messages.flatMap((m, n) =>
    typeof m === 'string' || !m.replyTo ? [] : [{ entryId: idOf(m, n), replyTo: m.replyTo }],
  )
  served.push('replies:read')
  return json({ replies })
}

const keyConflict = () =>
  new Response(
    JSON.stringify({
      code: 'idempotency_conflict',
      message: 'This key was used for another request',
      requestId: '00000000-0000-4000-8000-0000000000bc',
      retry: 'never',
    }),
    { status: 409 },
  )

/** The API's answer to a pass made against a room that moved meanwhile (packages/domain/src/errors.ts). */
const staleRoom = () =>
  new Response(
    JSON.stringify({
      code: 'stale_revision',
      message: 'The room changed',
      requestId: '00000000-0000-4000-8000-0000000000bb',
      retry: 'never',
    }),
    { status: 409 },
  )

/**
 * The floor passed on, as the API moves it: refused when the room moved since the page read it; else the holder
 * changes and the room's next revision, published, names them.
 */
function floorPassed(project: Project, init: RequestInit | undefined): Response | null {
  const request: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  if (!project.onFloor || !isFloorRequest(request)) return null
  if (project.roomMoves) {
    project.roomMoves = false
    publish(project)
  }
  if (request.expectedRoomRevision !== project.revision) return staleRoom()
  project.onFloor(request.nextActorId)
  publish(project)
  const receipt: ExchangeReceipt = {
    exchangeId: EXCHANGE,
    roomId: ROOM,
    revision: project.revision,
    inputActorId: request.nextActorId,
  }
  return json(receipt)
}

/** Reads of the research task the page holds, each waiting to be let through (`window.fixture.releaseTask`). */
const heldTasks: (() => void)[] = []

/** The research task at its revision now; while the page holds it, a read that answers once let through. */
function taskRead(project: Project): Response | Promise<Response> {
  const running = project.researching
  const read = () =>
    json(
      running
        ? researchRunning(running.reads)
        : researchTaskAt(project.taskRevision ?? 1, project.designed, project.designing),
    )
  served.push(`task:${String(project.taskRevision ?? 1)}`)
  if (project.taskRefused) {
    const body = {
      code: 'forbidden',
      message: 'Not permitted',
      requestId: '00000000-0000-4000-8000-0000000000bd',
      retry: 'never',
    }
    return new Response(JSON.stringify(body), { status: 403 })
  }
  if (project.taskFails) {
    const body = {
      code: 'unavailable',
      message: 'Sophia is unavailable',
      requestId: '00000000-0000-4000-8000-0000000000bc',
      retry: 'safe_read',
    }
    return new Response(JSON.stringify(body), { status: 503 })
  }
  if (!project.taskHeld) return read()
  return new Promise((resolve) => heldTasks.push(() => resolve(read())))
}

/** Lets the held reads of the task through, and every later one. */
export function releaseTask(project: Project): void {
  project.taskHeld = false
  for (const release of heldTasks.splice(0)) release()
}

/** The API's error bodies for a failed read of the versions, with their status (packages/domain/src/errors.ts). */
const VERSIONS_FAILURE = {
  unavailable: { status: 503, served: 'versions:failed', message: 'Sophia is unavailable', retry: 'safe_read' },
  not_found: { status: 422, served: 'versions:refused', message: 'Artifact not found', retry: 'never' },
} as const

/** The report's versions, or a failed read once the page asked for that (`window.fixture.failVersions`). */
function versionsRead(project: Project): Response {
  if (project.versionsFail) {
    const failure = VERSIONS_FAILURE[project.versionsFail]
    served.push(failure.served)
    const body = {
      code: project.versionsFail,
      message: failure.message,
      requestId: '00000000-0000-4000-8000-0000000000ba',
      retry: failure.retry,
    }
    return new Response(JSON.stringify(body), { status: failure.status })
  }
  served.push(`versions:${String(project.reportVersions)}`)
  return json(versions(project.reportVersions, project.reportTitle, project.pilot, project.designed))
}

const proposalId = (n: number) => `00000000-0000-4000-8000-0000000072${String(n).padStart(2, '0')}`

/**
 * A source review proposed: recorded; while `lose` lasts, its reply is lost (a connection cut) or a 200 whose body
 * cannot be read; then answered. `held`: the first one's answer waits for the page, the second's is lost.
 */
function proposed(p: NonNullable<Project['proposals']>, init: RequestInit | undefined): Promise<Response> {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  p.sent.push({ key: new Headers(init?.headers).get('idempotency-key') ?? '', body })
  if (p.how === 'held' && p.sent.length === 1) {
    // Recorded; its answer is on its way until the page lets it go.
    return new Promise((reply) => p.held?.push((read) => reply(readThen(proposalAnswered(), read))))
  }
  if (p.how === 'held' && p.sent.length === 2) return Promise.reject(new TypeError('Failed to fetch'))
  if (p.sent.length <= p.lose && p.how === 'lost') return Promise.reject(new TypeError('Failed to fetch'))
  if (p.sent.length <= p.lose) return Promise.resolve(new Response('{"plan":', { status: 200 }))
  return Promise.resolve(proposalAnswered())
}

/**
 * A reply that says when the page has read it: once its body is parsed and what the page does with it has run (the
 * microtasks after the parse), so a check waits on the page, never on a clock.
 */
function readThen(res: Response, read: () => void): Response {
  const parse = res.json.bind(res)
  res.json = async () => {
    const value: unknown = await parse()
    setTimeout(read, 0)
    return value
  }
  return res
}

/** Sophia's answer to a proposal: recorded, with its plan, decision and work. */
function proposalAnswered(): Response {
  return new Response(
    JSON.stringify({
      projectId: proposalId(0),
      planId: proposalId(1),
      planRevision: 1,
      decisionId: proposalId(2),
      decisionRevision: 1,
      workId: proposalId(3),
      goalId: proposalId(4),
      goalRevision: 1,
      criteriaRef: 'goal:criteria:1',
      manifestSourceId: proposalId(5),
      allowanceUsd: 0.5,
      limits: SOURCE_REVIEW.limits,
      route: SOURCE_REVIEW.route,
      cursor: '2',
    }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  )
}

/** Reads of sources the page holds, each waiting to be let through (`window.fixture.releaseSources`). */
const heldSources: (() => void)[] = []

/**
 * A19 (proposed): where a version's sources came from. The demo's report says it for its four; any other version knows
 * none. `origins=fail`: the read fails, and every project source says «From the project». `origins=missing`: the
 * conversation named is one the list doesn't hold (gone, or not this reader's).
 */
function originsRead(path: string): Response {
  const asked = new URLSearchParams(window.location.search).get('origins')
  if (asked === 'fail') return new Response(JSON.stringify(UNAVAILABLE), { status: 503 })
  const origins = DEMO && path.startsWith(`/api/v1/artifacts/${REPORT}/`) ? DEMO_ORIGINS : []
  const gone = '00000000-0000-4000-8000-0000000000c9'
  return json({
    origins: asked === 'missing' ? origins.map((o) => (o.kind === 'conversation' ? { ...o, id: gone } : o)) : origins,
  })
}

/** What a version cites; while the page holds them, a read that answers once let through. */
function sourcesRead(project: Project): Response | Promise<Response> {
  if (!project.sourcesHeld) return json(citedSources)
  return new Promise((resolve) => heldSources.push(() => resolve(json(citedSources))))
}

/** Lets the held reads of sources through, and every later one. */
export function releaseSources(project: Project): void {
  project.sourcesHeld = false
  for (const release of heldSources.splice(0)) release()
}

/** Reads of text the page holds, each waiting to be let through (`window.fixture.releaseText`). */
const heldTexts: (() => void)[] = []

/** A version's text; while the page holds it, a read that answers once let through. */
function textRead(project: Project, text: unknown): Response | Promise<Response> {
  if (!project.textHeld) return json(text)
  return new Promise((resolve) => heldTexts.push(() => resolve(json(text))))
}

/** Lets the held reads of text through, and every later one. */
export function releaseText(project: Project): void {
  project.textHeld = false
  for (const release of heldTexts.splice(0)) release()
}

/** A project's read refused to someone who isn't its member, as the API answers it. */
const outside = () =>
  new Response(
    JSON.stringify({
      code: 'forbidden',
      message: 'Not a member of this project',
      requestId: '00000000-0000-4000-8000-0000000000bd',
      retry: 'never',
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  )

/** Where `server=kept` journals the keyed writes that reached the service, in the tab: each try, with its key. */
export const JOURNAL = 'fixture.server.journal'

/** A keyed write as it reached the service. */
interface Journaled {
  method: string
  path: string
  key: string
  body: string | null
}

const isJournaled = (w: unknown): w is Journaled =>
  typeof w === 'object' &&
  w !== null &&
  typeof Reflect.get(w, 'method') === 'string' &&
  typeof Reflect.get(w, 'path') === 'string' &&
  typeof Reflect.get(w, 'key') === 'string'

function journaled(): Journaled[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(JOURNAL) ?? '[]')
    return Array.isArray(kept) ? kept.filter(isJournaled) : []
  } catch {
    return []
  }
}

/** A keyed write that reached the service goes into the journal, whatever it is answered. */
function journal(method: string, url: URL, init: RequestInit | undefined): void {
  const key = new Headers(init?.headers).get('idempotency-key')
  if (method !== 'POST' || !key || !url.pathname.startsWith('/api/')) return
  const body = typeof init?.body === 'string' ? init.body : null
  sessionStorage.setItem(JOURNAL, JSON.stringify([...journaled(), { method, path: url.pathname, key, body }]))
}

/** The journal applied again as the page loads, its answers unheard: the service holds what it held before. */
function replayJournal(project: Project): void {
  for (const w of journaled()) {
    const init = {
      method: w.method,
      headers: { 'idempotency-key': w.key },
      ...(w.body === null ? {} : { body: w.body }),
    }
    const reply = answer(project, w.method, new URL(w.path, window.location.href), init)
    void Promise.resolve(reply).catch(() => undefined)
  }
}

/**
 * `server=kept`: the synthetic service outlives a reload of the tab, as a real one does (reliability-held-on-reload.md).
 * Each keyed write that reaches it is journaled in the tab and applied again, unanswered, as the page loads.
 */
export function installFixtureApi(project: Project): void {
  const kept = new URLSearchParams(window.location.search).get('server') === 'kept'
  if (kept) replayJournal(project)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = new URL(hrefOf(input), window.location.href)
    if (project.outage && url.pathname.startsWith('/api/')) return Promise.reject(new TypeError('Failed to fetch'))
    if (project.outsider && url.pathname.startsWith(`/api/v1/projects/${PROJECT}/`)) return Promise.resolve(outside())
    if (kept) journal(method, url, init)
    // The person's own profile (A32): one per token, whatever the page shows (profile-data.ts).
    const profile = profileAnswer(method, url.pathname, init)
    if (profile) return Promise.resolve(profile)
    const response = answer(project, method, url, init)
    if (response) return Promise.resolve(response)
    unexpected.push(`${method} ${url.pathname}`)
    console.error(`[fixture] unexpected request: ${method} ${url.pathname}`)
    return Promise.resolve(new Response(JSON.stringify({ code: 'fixture_unexpected' }), { status: 501 }))
  }
}
