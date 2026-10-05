// The fixture page's API, answered at fetch from data.ts: the project's snapshot and live event stream, the
// viewer's membership, the brief and a room token. Any other request is recorded and refused, so a check that
// reached for something else fails instead of passing on a real service. A background update is an event on the
// open stream: the Studio's own feed applies it and refetches the snapshot, as it does with the API.
import type { ExchangeReceipt, FloorRequest, GoalCommand, Receipt, Snapshot } from '@sophia/contracts'
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
} from './data.ts'
import {
  content,
  editDescription,
  citedSources,
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
import { focusRequest, focusSet, type Showing } from './focus-data.ts'

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** Requests the fixture didn't expect, as `METHOD /path`: the checks assert there are none. */
export const unexpected: string[] = []
/** What was answered, as `snapshot:2`, `mission:2`: a check can tell an update reached the page. */
export const served: string[] = []

/** The project as the API holds it now: the revision moves with each event. */
interface Project {
  revision: number
  exchange: boolean
  messages: string[]
  /** How many versions of the fixture report are published (report-data.ts). */
  reportVersions: number
  /** The fixture report's title (report-data.ts): LONG_TITLE with `title=long`. */
  reportTitle: string
  /** Its first two versions are shaped like the pilot's (`history=pilot`, report-data.ts). */
  pilot?: boolean
  /** Someone is waiting at the door (report-data.ts). */
  waiting: boolean
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
      ? { ...now, work: [researchTaskAt(project.taskRevision ?? 1).task] }
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
  if (path.startsWith(`${base}/mission`)) return missionAnswer(project, method, path, init)
  if (method === 'GET' && path === `${base}/membership`) return json(membership)
  if (method === 'GET' && path === `${base}/events`) {
    return eventStream(project, Number(url.searchParams.get('after') ?? '0'), signal)
  }
  if (method === 'POST' || method === 'PUT') return written(project, method, path, init)
  return answerReports(project, method, url, init)
}

/** What the page writes: the room's focus (PUT), else what it posts. */
function written(project: Project, method: string, path: string, init: RequestInit | undefined) {
  if (method === 'PUT') return path === `/api/v1/rooms/${ROOM}/focus` ? focusPut(project, init) : null
  return posted(project, path, init)
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
    const published = versions(project.reportVersions, project.reportTitle, project.pilot)
    return json(reportList(published, project.description, url.searchParams.get('cursor'), filter))
  }
  if (path === `/api/v1/artifacts/${REPORT}/versions`) return versionsRead(project)
  if (path.startsWith(`/api/v1/artifacts/${REPORT}/versions/`) && path.endsWith('/sources')) return sourcesRead(project)
  const source = /^\/api\/v1\/sources\/([0-9a-f-]{36})\/content$/.exec(path)?.[1]
  const text = source ? content(source, project.textTampered) : null
  if (text) return textRead(project, text)
  if (path === `/api/v1/projects/${PROJECT}/native-tasks/${TASK}`) return taskRead(project)
  return null
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
    served.push(`mission:${project.revision}`)
    return json(mission(project.revision, project.notes?.kept, !project.notes?.refused))
  }
  return project.notes ? notesAnswer(project.revision, project.notes, method, path, init) : null
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

/** What the page posts: a room token, a goal's command, or the floor passed on. */
function posted(project: Project, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}`
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

/** The API's answer to a key used before for another request (packages/domain/src/errors.ts). */
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
  const read = () => json(running ? researchRunning(running.reads) : researchTaskAt(project.taskRevision ?? 1))
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
  return json(versions(project.reportVersions, project.reportTitle, project.pilot))
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
