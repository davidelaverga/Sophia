// followProjectEvents over fetch streaming. EventSource cannot send an Authorization header, and a
// bearer token must never travel in a URL.
import { parseSse, type Frame } from '@sophia/contracts/sse'
import { ApiError } from './client.ts'

/**
 * The API sends a `: ping` comment every 10 s. A stream silent for longer than this is treated as
 * dead even if the socket still looks open (a proxy can keep a zombie connection after the API
 * dies), so "Live" never outlives the actual stream.
 */
export const STREAM_IDLE_TIMEOUT_MS = 25_000

export class StreamStalled extends Error {}

export interface FollowOptions {
  token: string
  projectId: string
  after: string
  signal: AbortSignal
  onOpen: () => void
  onFrame: (frame: Frame) => void
  idleTimeoutMs?: number
}

/** Aborts its own signal when the parent aborts or when `alive()` is not called in time. */
class StallWatch {
  stalled = false
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly parent: AbortSignal
  private readonly idleMs: number
  private readonly abortFromParent = () => this.controller.abort()

  constructor(parent: AbortSignal, idleMs: number) {
    this.parent = parent
    this.idleMs = idleMs
    parent.addEventListener('abort', this.abortFromParent)
    this.alive()
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  alive(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.stalled = true
      this.controller.abort()
    }, this.idleMs)
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.parent.removeEventListener('abort', this.abortFromParent)
  }
}

async function streamError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null
  return new ApiError(res.status, body?.code ?? `http_${res.status}`, body?.message ?? res.statusText, 'never')
}

async function readFrames(body: NonNullable<Response['body']>, watch: StallWatch, onFrame: (f: Frame) => void) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let rest = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    watch.alive() // any bytes, including heartbeats, prove the stream is alive
    const parsed = parseSse(rest + value)
    rest = parsed.rest
    for (const frame of parsed.frames) onFrame(frame)
  }
}

/** Resolves when the server ends the stream; throws ApiError, StreamStalled or an abort. */
export async function followEvents(opts: FollowOptions): Promise<void> {
  const watch = new StallWatch(opts.signal, opts.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS)
  try {
    const res = await fetch(`/api/v1/projects/${opts.projectId}/events?after=${opts.after}`, {
      headers: { authorization: `Bearer ${opts.token}`, accept: 'text/event-stream' },
      signal: watch.signal,
    })
    if (!res.ok || !res.body) throw await streamError(res)
    opts.onOpen()
    watch.alive()
    await readFrames(res.body, watch, opts.onFrame)
  } catch (err: unknown) {
    throw watch.stalled ? new StreamStalled('No data or heartbeat from the project stream') : err
  } finally {
    watch.dispose()
  }
}
