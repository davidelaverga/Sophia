import type pg from 'pg'
import { ChannelListener } from '@sophia/persistence'

/**
 * One LISTEN connection per API process and channel, for long polls. A notification only says "something
 * for key X changed" (a runtime id, a room id); the waiting poll re-reads through the database function, which
 * authenticates its caller again. `wait(null, …)` wakes on any notification. On reconnect every waiter re-reads.
 */
export class NotificationHub {
  private readonly waiters = new Map<string, Set<() => void>>()
  private listener: ChannelListener | undefined
  private readonly pool: pg.Pool
  private readonly channel: string
  private readonly onError: (err: Error) => void

  constructor(pool: pg.Pool, channel: string, onError: (err: Error) => void) {
    this.pool = pool
    this.channel = channel
    this.onError = onError
  }

  /** Resolve once `key` (or, for null, anything) is notified, `waitMs` passes or `signal` aborts. */
  async wait(key: string | null, waitMs: number, signal: AbortSignal): Promise<void> {
    this.listener ??= new ChannelListener(this.pool, this.channel, {
      onPayload: (payload) => this.wake(payload),
      onReconnect: () => this.wakeAll(),
      onError: (err) => this.onError(err),
    })
    await this.listener.listening
    const slot = key ?? '*'
    await new Promise<void>((resolve) => {
      let set = this.waiters.get(slot)
      if (!set) this.waiters.set(slot, (set = new Set()))
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        set.delete(done)
        if (set.size === 0) this.waiters.delete(slot)
        resolve()
      }
      const timer = setTimeout(done, waitMs)
      signal.addEventListener('abort', done, { once: true })
      set.add(done)
    })
  }

  private wake(key: string): void {
    for (const done of this.waiters.get(key) ?? []) done()
    for (const done of this.waiters.get('*') ?? []) done()
  }

  private wakeAll(): void {
    for (const set of this.waiters.values()) for (const done of set) done()
  }

  async close(): Promise<void> {
    this.wakeAll()
    await this.listener?.stop()
  }
}
