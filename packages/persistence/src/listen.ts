import type pg from 'pg'

/** Channel notified on commit of every project_events insert (db/migrations/0005). Payload: project UUID. */
export const PROJECT_EVENTS_CHANNEL = 'sophia_project_events'

/** Channel notified on commit of every runtime command (db/migrations/0012). Payload: runtime instance UUID. */
export const RUNTIME_COMMANDS_CHANNEL = 'sophia_runtime_commands'

export interface ListenHandlers {
  /** Something committed in this project; subscribers re-read under their own actor. */
  onProject: (projectId: string) => void
  /** LISTEN is live again after a failure: notifications may have been missed, so re-read everything. */
  onReconnect: () => void
  onError: (err: Error) => void
}

/** The same, for any channel: `onPayload` receives each notification's payload. */
export interface ChannelHandlers {
  onPayload: (payload: string) => void
  onReconnect: () => void
  onError: (err: Error) => void
}

const MIN_RETRY_MS = 1000
const MAX_RETRY_MS = 30_000

/**
 * One pooled connection held in LISTEN on one channel. When it fails, the broken client is destroyed
 * (never returned to the pool), LISTEN is re-established with backoff, and `onReconnect` wakes every
 * follower.
 */
export class ChannelListener {
  private client: pg.PoolClient | null = null
  private stopped = false
  private retryMs = MIN_RETRY_MS
  private timer: NodeJS.Timeout | undefined
  private readonly pool: pg.Pool
  private readonly channel: string
  private readonly handlers: ChannelHandlers
  private markListening: () => void = () => undefined
  /** Resolves once LISTEN is first established (tests and startup checks wait on it). */
  readonly listening: Promise<void>

  constructor(pool: pg.Pool, channel: string, handlers: ChannelHandlers) {
    if (!/^[a-z_]+$/.test(channel)) throw new Error(`invalid channel name ${channel}`)
    this.pool = pool
    this.channel = channel
    this.handlers = handlers
    this.listening = new Promise((resolve) => {
      this.markListening = resolve
    })
    void this.connect(false)
  }

  private readonly onNotification = (msg: pg.Notification) => {
    if (msg.channel === this.channel && msg.payload) this.handlers.onPayload(msg.payload)
  }

  private async connect(recovering: boolean): Promise<void> {
    let client: pg.PoolClient | null = null
    try {
      const connected = await this.pool.connect()
      client = connected
      connected.on('notification', this.onNotification)
      // Stays attached after a failure: a destroyed client can emit more errors, and an 'error' event
      // without a listener would crash the process. Only the current connection triggers recovery.
      connected.on('error', (err) => {
        if (this.client === connected) this.fail(err)
      })
      await connected.query(`LISTEN ${this.channel}`)
      if (this.stopped) {
        connected.release()
        return
      }
      this.client = connected
      this.retryMs = MIN_RETRY_MS
      this.markListening()
      if (recovering) this.handlers.onReconnect()
    } catch (err: unknown) {
      client?.release(true)
      this.retry(err instanceof Error ? err : new Error(String(err)))
    }
  }

  private fail(err: Error): void {
    const broken = this.client
    this.client = null
    broken?.release(true) // destroy: a failed connection must not go back to the pool
    this.retry(err)
  }

  private retry(err: Error): void {
    this.handlers.onError(err)
    if (this.stopped) return
    this.timer = setTimeout(() => void this.connect(true), this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS)
  }

  async stop(): Promise<void> {
    this.stopped = true
    clearTimeout(this.timer)
    const client = this.client
    this.client = null
    if (!client) return
    client.off('notification', this.onNotification)
    await client.query(`UNLISTEN ${this.channel}`).catch(() => undefined)
    client.release()
  }
}

/** Project events (db/migrations/0005): `onProject` receives the project UUID of each committed event. */
export class ProjectEventListener extends ChannelListener {
  constructor(pool: pg.Pool, handlers: ListenHandlers) {
    super(pool, PROJECT_EVENTS_CHANNEL, {
      onPayload: handlers.onProject,
      onReconnect: handlers.onReconnect,
      onError: handlers.onError,
    })
  }
}
