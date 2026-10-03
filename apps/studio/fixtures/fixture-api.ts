// The fixture page's API, answered at fetch from data.ts: the project's snapshot and live event stream, the
// viewer's membership, the brief and a room token. Any other request is recorded and refused, so a check that
// reached for something else fails instead of passing on a real service. A background update is an event on the
// open stream: the Studio's own feed applies it and refetches the snapshot, as it does with the API.
import type { Snapshot } from '@sophia/contracts'
import { projectEvent, membership, mission, PROJECT, roomToken, snapshot } from './data.ts'
import {
  content,
  editDescription,
  citedSources,
  REPORT,
  reportList,
  researchTaskAt,
  TASK,
  versions,
  waitingAtTheDoor,
  type Description,
} from './report-data.ts'

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
  /** A version's text arrives as bytes its record does not name (`tamper=text`). */
  textTampered: boolean
  /** The research task is in the project's work (`place=work`): its card lists the report's outputs. */
  work: boolean
  /** The project's goals (the work fixture's one, LFE-07). */
  goals?: Snapshot['goals']
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
  const now = snapshot(project.revision, project.exchange, project.messages, project.goals)
  const work = project.work ? { ...now, work: [researchTaskAt(project.taskRevision ?? 1).task] } : now
  return project.waiting ? { ...work, lobby: [waitingAtTheDoor] } : work
}

/** The project moves one revision, and the event saying so goes to every open stream. */
export function publish(project: Project): void {
  project.revision += 1
  for (const controller of streams) controller.enqueue(frameOf(project.revision))
}

function answer(project: Project, method: string, url: URL, signal: AbortSignal | null | undefined, body: unknown) {
  const base = `/api/v1/projects/${PROJECT}`
  const path = url.pathname
  if (method === 'GET' && path === `${base}/snapshot`) {
    served.push(`snapshot:${project.revision}`)
    return json(snapshotOf(project))
  }
  if (method === 'GET' && path === `${base}/mission`) {
    served.push(`mission:${project.revision}`)
    return json(mission(project.revision))
  }
  if (method === 'GET' && path === `${base}/membership`) return json(membership)
  if (method === 'GET' && path === `${base}/events`) {
    return eventStream(project, Number(url.searchParams.get('after') ?? '0'), signal)
  }
  if (method === 'POST' && path === `${base}/room-token`) return json(roomToken)
  return answerReport(project, method, url, body)
}

/**
 * The report viewer's and Knowledge's requests (SMC-M03): the fixture report's versions, their sources and text, its
 * task, its card, and an edit of its description.
 */
function answerReport(project: Project, method: string, url: URL, body: unknown) {
  const path = url.pathname
  if (method === 'PATCH' && path === `/api/v1/artifacts/${REPORT}/summary`) {
    const { next, reply } = editDescription(project.description, body, membership.actorId)
    project.description = next
    return reply
  }
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

/** Reads of the research task the page holds, each waiting to be let through (`window.fixture.releaseTask`). */
const heldTasks: (() => void)[] = []

/** The research task at its revision now; while the page holds it, a read that answers once let through. */
function taskRead(project: Project): Response | Promise<Response> {
  const read = () => json(researchTaskAt(project.taskRevision ?? 1))
  served.push(`task:${String(project.taskRevision ?? 1)}`)
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
    const response = answer(project, method, url, init?.signal, init?.body)
    if (response) return Promise.resolve(response)
    unexpected.push(`${method} ${url.pathname}`)
    console.error(`[fixture] unexpected request: ${method} ${url.pathname}`)
    return Promise.resolve(new Response(JSON.stringify({ code: 'fixture_unexpected' }), { status: 501 }))
  }
}
