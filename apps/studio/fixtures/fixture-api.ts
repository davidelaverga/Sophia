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
} from './data.ts'
import { DEMO } from './demo.ts'
import { libraryVersions } from './demo-library.ts'
import {
  content,
  editDescription,
  citedSources,
  DESIGN_TASK,
  designingTask,
  OLDER_REPORT,
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
import { focusRequest, focusSet, roomFocus, type Showing } from './focus-data.ts'
import { reviewed, type Reviews } from './review-data.ts'
import { created, finished, type Tasks } from './task-data.ts'
import type { ConversationMessage, ConversationSummary, ProjectTask, VersionReview } from '../src/api/vision.ts'
import { MESSAGE_PAGE, type conversationMission } from './conversation-data.ts'
import { conversationWritten, type TalkWrites } from './conversation-writes.ts'
import type { ProjectRelease } from '@sophia/contracts'
import { searchHits, searchPage } from './search-data.ts'
import { closed, digestOf, MEETING, markSeen, meetingList, recapOf, soFarOf, type Meeting } from './meeting-data.ts'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** Requests the fixture didn't expect, as `METHOD /path`: the checks assert there are none. */
export const unexpected: string[] = []
/** What was answered, as `snapshot:2`, `mission:2`: a check can tell an update reached the page. */
export const served: string[] = []

/** The project as the API holds it now: the revision moves with each event. */
interface Project {
  revision: number
  exchange: boolean
  messages: (string | Said)[]
  /** The viewer's messages to the room, by their Idempotency-Key: the same key again replays the receipt. */
  contributions?: Map<string, { text: string; receipt: ContributionReceipt }>
  /** The next message lands, but its reply is lost on the way (`window.fixture.loseNextContributionReply`). */
  loseContributionReply?: boolean
  /** While set, messages land but their replies wait for `releaseMessages` (`window.fixture.holdMessages`). */
  messagesHeld?: (() => void)[] | null
  /** A20's replies read fails as the API's `unavailable` (`window.fixture.failReplies`). */
  failReplies?: boolean
  /** How many versions of the fixture report are published (report-data.ts). */
  reportVersions: number
  /** The fixture report's title (report-data.ts): LONG_TITLE with `title=long`. */
  reportTitle: string
  /** Its first two versions are shaped like the pilot's (`history=pilot`, report-data.ts). */
  pilot?: boolean
  /** Someone is waiting at the door (report-data.ts). */
  waiting: boolean
  /** This viewer's role in the project (`role=viewer`); the fixture's own, admin, otherwise. */
  role?: Membership['role']
  /** The report's description on Knowledge (report-data.ts). */
  description: Description
  /**
   * How reads of the report's versions fail from now on: `unavailable`, as an API that lost its database answers;
   * `not_found`, as it refuses a report this person may not read; false, they succeed.
   */
  versionsFail: false | 'unavailable' | 'not_found'
  /** Reads of a version's sources wait until the page lets them through (`hold=sources`), as a slow API's do. */
  sourcesHeld: boolean
  /** So do reads of a version's text (`hold=text`). */
  textHeld: boolean
  /** The research task's result revision (report-data.ts): 1 unless the check revises it. */
  taskRevision?: 1 | 2
  /** Reads of the research task wait until the page lets them through (`hold=task`), as a slow API's do. */
  taskHeld?: boolean
  /** The research task runs (`research=running`): how many sources it has read. */
  researching?: { reads: number } | null
  /** Reads of the research task fail (`window.fixture.failTask`), as an API that lost its database answers. */
  taskFails?: boolean
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
  /** The project's goals (the work fixture's one, LFE-07). */
  goals?: Snapshot['goals']
  /** A goal's command (Request review, Hold, Stop), with its idempotency key; absent, a command is unexpected. */
  onCommand?: (command: GoalCommand, key: string) => void
  /** The floor and Sophia's presence as the page asked for them (data.ts, room-people checks). */
  room?: RoomAsked
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
  /** The versions' reviews (review-data.ts, A16); absent, their requests are unexpected. */
  reviews?: Reviews
  /** What members carried in from Personal (the project list's releases, chapter 1); absent, none. */
  carriedIn?: ProjectRelease[]
  /** The project list holds other projects only (`carried=elsewhere`): this one is past its first ones. */
  carriedElsewhere?: boolean
  /** The reader's reports are in another project too (`reports=elsewhere`): its count is under the filters. */
  reportsElsewhere?: boolean
  /** While set, the project list's reads wait for these (`window.fixture.holdProjects`). */
  projectsHeld?: (() => void)[] | null
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
  /** While set, the brief's reads wait for these (`mission=hold`, `window.fixture.holdMission`). */
  missionHeld?: (() => void)[] | null
}

/** The conversations as the A18 reads give them (and its writes keep them), and the reads that fail. */
export interface Conversations extends TalkWrites {
  list: ConversationSummary[]
  messages: Record<string, ConversationMessage[]>
  /** The list's reads fail (`conversations=fail`, `window.fixture.failConversations`). */
  failList: boolean
}

function hrefOf(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.href
  return input
}

const streams = new Set<ReadableStreamDefaultController<string>>()

const frameOf = (sequence: number) => `id: ${sequence}\ndata: ${JSON.stringify(projectEvent(sequence))}\n\n`

/**
 * The project's event stream, open until the page drops it; pings keep it from looking stalled. Dropped by its
 * signal, it fails the read under way, as a fetch does: the feed waits on that read before it resyncs.
 */
function eventStream(project: Project, after: number, signal: AbortSignal | null | undefined): Response {
  let ping: ReturnType<typeof setInterval> | undefined
  let mine: ReadableStreamDefaultController<string> | undefined
  const close = () => {
    clearInterval(ping)
    if (mine) streams.delete(mine)
  }
  const body = new ReadableStream<string>({
    start: (controller) => {
      mine = controller
      streams.add(controller)
      controller.enqueue(': ping\n\n')
      // The events after the page's cursor come first, as the API sends its history.
      for (let sequence = after + 1; sequence <= project.revision; sequence += 1) controller.enqueue(frameOf(sequence))
      ping = setInterval(() => controller.enqueue(': ping\n\n'), 5000)
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
  return withFocus(project, project.waiting ? { ...work, lobby: [waitingAtTheDoor] } : work)
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

/** The project moves one revision, and the event saying so goes to every open stream. */
export function publish(project: Project): void {
  project.revision += 1
  for (const controller of streams) controller.enqueue(frameOf(project.revision))
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

function answer(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const signal = init?.signal
  const base = `/api/v1/projects/${PROJECT}`
  const path = url.pathname
  if (method === 'GET' && path === `${base}/snapshot`) {
    served.push(`snapshot:${project.revision}`)
    return json(snapshotOf(project))
  }
  const records = recordsAnswer(project, method, url, init)
  if (records !== undefined) return records
  if (method === 'GET' && path === `${base}/membership`) return json(membershipOf(project))
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
  return conversationWritten(project.conversations, path, init, {
    viewer: project.role === 'viewer',
    record: (what) => served.push(what),
    moved: () => publish(project),
  })
}

/** The proposed reads of the vision (A13's search, A14's focus); undefined for any other request. */
function visionRead(project: Project, url: URL) {
  if (url.pathname === `/api/v1/projects/${PROJECT}/search`) return searchAnswer(project, url)
  if (url.pathname === `/api/v1/projects/${PROJECT}/discussion/replies`) return repliesRead(project)
  const talk = project.conversations && conversationRead(project.conversations, url)
  if (talk !== undefined) return talk
  if (url.pathname === '/api/v1/projects') return projectListAnswer(project)
  const reviews = REVIEWS_OF.exec(url.pathname)
  if (reviews?.[2]) return reviewsRead(project, reviews[2])
  const tasksOf = TASKS_OF.exec(url.pathname)?.[1]
  if (tasksOf) return tasksRead(project, tasksOf)
  if (url.pathname !== `/api/v1/rooms/${ROOM}/focus` || !project.showing) return undefined
  served.push('room-focus:read')
  return json(roomFocus(project.showing, project.revision))
}

/** The brief, the meeting's records and the invitations sent (none) (A08, A12); undefined for any other request. */
function recordsAnswer(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}`
  const path = url.pathname
  const vision = visionAnswer(project, method, url, init)
  if (vision !== undefined) return vision
  if (path.startsWith(`${base}/mission`)) return missionAnswer(project, method, path, init)
  if (method === 'GET' && path.startsWith(`${base}/meetings`)) return meetingAnswer(project, path)
  if (method === 'GET' && path === `${base}/since` && project.meeting)
    return json(digestOf(project.meeting, project.revision))
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
const MESSAGES_OF = /^\/api\/v1\/conversations\/([0-9a-f-]{36})\/messages$/

/** A18's reads: the list, or a page of a conversation's messages; undefined for any other request. */
function conversationRead(talk: Conversations, url: URL) {
  if (url.pathname === `/api/v1/projects/${PROJECT}/conversations`) return conversationsRead(talk)
  const messagesOf = MESSAGES_OF.exec(url.pathname)?.[1]
  return messagesOf ? messagesRead(talk, messagesOf, url) : undefined
}

/** The project's conversations (A18), as listed. */
function conversationsRead(talk: Conversations) {
  if (talk.failList) return unavailable()
  served.push('conversations:read')
  return json({ conversations: talk.list })
}

/** A page of a conversation's messages (A18): the newest MESSAGE_PAGE, or those before `before`, oldest first. */
function messagesRead(talk: Conversations, conversationId: string, url: URL) {
  if (talk.failMessagesOf === conversationId) return unavailable()
  const all = talk.messages[conversationId]
  if (!all) return null
  const before = url.searchParams.get('before')
  // A cursor this list never gave is the client's mistake: unexpected, not an empty page.
  if (before !== null && !/^[1-9][0-9]*$/u.test(before)) return null
  const end = Math.min(all.length, Number(before ?? all.length))
  const start = Math.max(0, end - MESSAGE_PAGE)
  served.push(`messages:${conversationId.slice(-2)}:${String(start)}`)
  return json({ messages: all.slice(start, end), before: start > 0 ? String(start) : null })
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
  return json({ projects: project.carriedElsewhere ? [other] : [listed], personalEpoch: 1 })
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

/** What the page writes: the room's focus (PUT), else what it posts. */
function written(project: Project, method: string, path: string, init: RequestInit | undefined) {
  if (method === 'PUT' && path === `/api/v1/projects/${PROJECT}/seen`) return seenPut(project, init)
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
const ELSEWHERE = { projectId: '00000000-0000-4000-8000-0000000000a9', title: 'Another project', count: 3 }

/**
 * The report viewer's and Knowledge's requests (SMC-M03): the fixture report's versions, their sources and text, its
 * task, its card, and an edit of its description.
 */
function answerReport(project: Project, method: string, url: URL, init: RequestInit | undefined) {
  const path = url.pathname
  if (method === 'PATCH') return edited(project, path, init)
  if (method !== 'GET') return null
  if (path === '/api/v1/knowledge/reports') {
    const filter = { q: url.searchParams.get('q'), format: url.searchParams.get('format') }
    const published = versions(project.reportVersions, project.reportTitle, project.pilot, project.designed)
    const list = reportList(published, project.description, url.searchParams.get('cursor'), filter)
    return json(project.reportsElsewhere ? { ...list, projects: [...list.projects, ELSEWHERE] } : list)
  }
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
  return null
}

/** A report's versions (the fixture report's, or the older one's, which Knowledge's cover reads) and its sources. */
function versionsOf(project: Project, path: string): Response | Promise<Response> | null {
  if (path === `/api/v1/artifacts/${REPORT}/versions`) return versionsRead(project)
  if (path === `/api/v1/artifacts/${OLDER_REPORT}/versions`) return json(olderVersions())
  // The older report cites nothing: its Sources tab reads an empty list.
  if (path.startsWith(`/api/v1/artifacts/${OLDER_REPORT}/versions/`) && path.endsWith('/sources')) {
    return json({ sources: [] })
  }
  const shelved = DEMO ? shelvedRead(path) : null
  if (shelved) return shelved
  if (path.startsWith(`/api/v1/artifacts/${REPORT}/versions/`) && path.endsWith('/sources')) return sourcesRead(project)
  return null
}

/** The demo library's reports (demo-library.ts): their one version, and their sources, none. */
function shelvedRead(path: string): Response | null {
  const listed = /^\/api\/v1\/artifacts\/([0-9a-f-]{36})\/versions(\/[0-9a-f-]{36}\/sources)?$/.exec(path)
  const shelf = listed ? libraryVersions(listed[1] ?? '') : null
  if (!listed || !shelf) return null
  return json(listed[2] ? { sources: [] } : shelf)
}

/** The design task of the research's page, read while it is designed (`design=designing`, B-19), then published. */
function designRead(project: Project): Response | null {
  if (!project.designing && !project.designed) return null
  return json(designingTask(project.designed ? 'published' : 'designing'))
}

/** An edit of the report's description on Knowledge, answered as the API answers it. */
function edited(project: Project, path: string, init: RequestInit | undefined) {
  if (path !== `/api/v1/artifacts/${REPORT}/summary`) return null
  const { next, reply } = editDescription(project.description, init?.body, membership.actorId)
  project.description = next
  return reply
}

/** The brief, and a note written in it, its withdrawal's preview and its withdrawal (brief-data.ts). */
function missionAnswer(project: Project, method: string, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}/mission`
  if (method === 'GET' && path === base) {
    const held = project.missionHeld
    if (held) return new Promise<Response>((resolve) => held.push(() => resolve(missionRead(project))))
    return missionRead(project)
  }
  return project.notes ? notesAnswer(project.revision, project.notes, method, path, init) : null
}

/** The brief as read: refused while notes are unread or reads fail (`failMission`), else with the conversations' part. */
function missionRead(project: Project): Response {
  if (project.notes?.unread || project.missionFails) return new Response(JSON.stringify(UNAVAILABLE), { status: 503 })
  served.push(`mission:${project.revision}`)
  return json(withContext(mission(project.revision, project.notes?.kept, !project.notes?.refused), project.missionPlus))
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
  project.messages.push({ id, text: body.text, me: true, ...(replyTo ? { replyTo } : {}) })
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

/** What the page posts: a room token, a goal's command, the floor passed on, or a message to the room. */
function posted(project: Project, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}`
  if (path === `${base}/contributions`) return contributed(project, init)
  const reviewOf = REVIEWS_OF.exec(path)?.[2]
  if (reviewOf) return reviewPosted(project, reviewOf, init)
  if (path === `${base}/tasks`) return taskPosted(project, init)
  const doneOf = TASK_DONE.exec(path)?.[1]
  if (doneOf) return taskDone(project, doneOf, init)
  if (path === `/api/v1/rooms/${ROOM}/meetings/${MEETING}/close`) return meetingClosed(project, init)
  if (path === `${base}/room-token`) return json(roomToken)
  if (path === `${base}/commands`) return admitted(project, init)
  if (path === `/api/v1/rooms/${ROOM}/input-floor`) return floorPassed(project, init)
  return null
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

/** Reads of sources the page holds, each waiting to be let through (`window.fixture.releaseSources`). */
const heldSources: (() => void)[] = []

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

export function installFixtureApi(project: Project): void {
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const url = new URL(hrefOf(input), window.location.href)
    const response = answer(project, method, url, init)
    if (response) return Promise.resolve(response)
    unexpected.push(`${method} ${url.pathname}`)
    console.error(`[fixture] unexpected request: ${method} ${url.pathname}`)
    return Promise.resolve(new Response(JSON.stringify({ code: 'fixture_unexpected' }), { status: 501 }))
  }
}
