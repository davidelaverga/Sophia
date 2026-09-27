import type pg from 'pg'
import { ChannelListener } from '@sophia/persistence'

/** A registration made before the read that decides whether to wait, so a notification during that read counts. */
export interface HubWaiter {
  /** Resolve once notified (at once if a notification came since `arm`), after `waitMs`, or when `signal` aborts. */
  wait(waitMs: number, signal: AbortSignal): Promise<void>
  /** Stop listening. Always call it, whether or not the waiter waited. */
  cancel(): void
}

/**
 * One LISTEN connection per API process and channel, for long polls. A notification only says "something
 * for key X changed" (a runtime id, a room id); the waiting poll re-reads through the database function, which
 * authenticates its caller again. `arm(null)` wakes on any notification. On reconnect every waiter re-reads.
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

  /**
   * Listen for `key` (or, for null, anything) from now on. Arm before the read that finds nothing to return: a
   * commit that lands between that read and `wait` still wakes the wait, instead of waiting out the timeout.
   */
  async arm(key: string | null): Promise<HubWaiter> {
    this.listener ??= new ChannelListener(this.pool, this.channel, {
      onPayload: (payload) => this.wake(payload),
      onReconnect: () => this.wakeAll(),
      onError: (err) => this.onError(err),
    })
    await this.listener.listening
    const slot = key ?? '*'
    let set = this.waiters.get(slot)
    if (!set) this.waiters.set(slot, (set = new Set()))
    const registered = set
    let fired = false
    let release: (() => void) | null = null
    const notify = () => {
      fired = true
      release?.()
    }
    registered.add(notify)
    const cancel = () => {
      registered.delete(notify)
      if (registered.size === 0 && this.waiters.get(slot) === registered) this.waiters.delete(slot)
    }
    const wait = (waitMs: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (fired || signal.aborted) return resolve()
        const done = () => {
          clearTimeout(timer)
          signal.removeEventListener('abort', done)
          resolve()
        }
        const timer = setTimeout(done, waitMs)
        signal.addEventListener('abort', done, { once: true })
        release = done
      })
    return { wait, cancel }
  }

  private wake(key: string): void {
    for (const notify of this.waiters.get(key) ?? []) notify()
    for (const notify of this.waiters.get('*') ?? []) notify()
  }

  private wakeAll(): void {
    for (const set of this.waiters.values()) for (const notify of set) notify()
  }

  async close(): Promise<void> {
    this.wakeAll()
    await this.listener?.stop()
  }
}
