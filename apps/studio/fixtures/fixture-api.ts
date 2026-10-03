// The fixture page's API, answered at fetch from data.ts: the project's snapshot and live event stream, the
// viewer's membership, the brief and a room token. Any other request is recorded and refused, so a check that
// reached for something else fails instead of passing on a real service. A background update is an event on the
// open stream: the Studio's own feed applies it and refetches the snapshot, as it does with the API.
import type { GoalCommand, Receipt, Snapshot } from '@sophia/contracts'
import { projectEvent, membership, mission, PROJECT, roomToken, snapshot } from './data.ts'

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
  goals?: Snapshot['goals']
  /** A goal's command (Request review, Hold, Stop), with its idempotency key; absent, a command is unexpected. */
  onCommand?: (command: GoalCommand, key: string) => void
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
    return json(snapshot(project.revision, project.exchange, project.messages, project.goals))
  }
  if (method === 'GET' && path === `${base}/mission`) {
    served.push(`mission:${project.revision}`)
    return json(mission(project.revision))
  }
  if (method === 'GET' && path === `${base}/membership`) return json(membership)
  if (method === 'GET' && path === `${base}/events`) {
    return eventStream(project, Number(url.searchParams.get('after') ?? '0'), signal)
  }
  return method === 'POST' ? posted(project, path, init) : null
}

/** What the page posts: a room token, or a goal's command. */
function posted(project: Project, path: string, init: RequestInit | undefined) {
  const base = `/api/v1/projects/${PROJECT}`
  if (path === `${base}/room-token`) return json(roomToken)
  if (path === `${base}/commands`) return admitted(project, init)
  return null
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
