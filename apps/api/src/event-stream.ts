// One SSE follower of a project (architecture 12 §7): writes authorized frames, re-reads after each
// committed-event notification or heartbeat, and closes on revocation, failure or disconnect.
import type { ServerResponse } from 'node:http'
import type { FastifyBaseLogger } from 'fastify'
import type { EventFrame, EventPage } from '@sophia/persistence'
import type { ProjectEventHub } from './event-hub.ts'

export interface EventStreamOptions {
  res: ServerResponse
  projectId: string
  /** Authorized page of frames after `after`, read under the follower's own actor. */
  read: (after: bigint) => Promise<EventPage>
  /** The page already read (and authorized) before the stream opened. */
  first: EventPage
  hub: ProjectEventHub
  heartbeatMs: number
  log: FastifyBaseLogger
}

const HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

/** SSE `id` is the decimal project sequence; `data` is an Event or CursorAdvance. */
const frameText = (f: EventFrame) => `id: ${f.sequence}\ndata: ${JSON.stringify(f)}\n\n`

export class ProjectEventStream {
  private cursor: bigint
  private closed = false
  /** At most one read in flight; a wake during a read triggers one more pass. */
  private reading = false
  private wokenWhileReading = false
  private readonly heartbeat: NodeJS.Timeout
  private readonly unfollow: () => void
  private readonly opts: EventStreamOptions

  constructor(opts: EventStreamOptions) {
    this.opts = opts
    this.cursor = BigInt(opts.first.cursor)
    opts.res.writeHead(200, HEADERS)
    opts.res.write('retry: 3000\n\n')
    this.write(opts.first.frames)
    this.unfollow = opts.hub.follow(opts.projectId, () => this.wake())
    // The heartbeat keeps proxies and client watchdogs informed, and re-reads in case a
    // notification was missed.
    this.heartbeat = setInterval(() => {
      opts.res.write(': ping\n\n')
      this.wake()
    }, opts.heartbeatMs)
    this.wake() // drain anything beyond the first page or committed meanwhile
  }

  wake(): void {
    void this.pump()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeat)
    this.unfollow()
    this.opts.res.end()
  }

  private write(frames: readonly EventFrame[]): void {
    for (const f of frames) this.opts.res.write(frameText(f))
  }

  private async pump(): Promise<void> {
    if (this.reading) {
      this.wokenWhileReading = true
      return
    }
    this.reading = true
    try {
      do {
        this.wokenWhileReading = false
        await this.drain()
      } while (this.shouldReadAgain())
    } catch (err: unknown) {
      this.opts.log.warn({ err }, 'event pump failed; client will reconnect from its cursor')
      this.close()
    } finally {
      this.reading = false
    }
  }

  /** A wake arrived during the last pass and the stream is still open. */
  private shouldReadAgain(): boolean {
    return this.wokenWhileReading && !this.closed
  }

  /** Read pages until caught up. Losing access (revocation) ends the stream. */
  private async drain(): Promise<void> {
    while (!this.closed) {
      const page = await this.opts.read(this.cursor)
      if (!page.visible) {
        this.close()
        return
      }
      if (page.frames.length === 0) return
      this.write(page.frames)
      this.cursor = BigInt(page.cursor)
    }
  }
}
