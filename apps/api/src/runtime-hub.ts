import type pg from 'pg'
import { ChannelListener, RUNTIME_COMMANDS_CHANNEL } from '@sophia/persistence'

/**
 * One LISTEN connection per API process for runtime command queues (db/migrations/0012). A notification only
 * says "runtime X has a new command"; the waiting long poll re-reads the queue through the runtime function,
 * which authenticates the caller again. On reconnect every waiter re-reads.
 */
export class RuntimeCommandHub {
  private readonly waiters = new Map<string, Set<() => void>>()
  private listener: ChannelListener | undefined
  private readonly pool: pg.Pool
  private readonly onError: (err: Error) => void

  constructor(pool: pg.Pool, onError: (err: Error) => void) {
    this.pool = pool
    this.onError = onError
  }

  /** Resolve once runtime `runtimeId` gets a command, `waitMs` passes or `signal` aborts. */
  async wait(runtimeId: string, waitMs: number, signal: AbortSignal): Promise<void> {
    this.listener ??= new ChannelListener(this.pool, RUNTIME_COMMANDS_CHANNEL, {
      onPayload: (id) => this.wake(id),
      onReconnect: () => this.wakeAll(),
      onError: (err) => this.onError(err),
    })
    await this.listener.listening
    await new Promise<void>((resolve) => {
      let set = this.waiters.get(runtimeId)
      if (!set) this.waiters.set(runtimeId, (set = new Set()))
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        set.delete(done)
        if (set.size === 0) this.waiters.delete(runtimeId)
        resolve()
      }
      const timer = setTimeout(done, waitMs)
      signal.addEventListener('abort', done, { once: true })
      set.add(done)
    })
  }

  private wake(runtimeId: string): void {
    for (const done of this.waiters.get(runtimeId) ?? []) done()
  }

  private wakeAll(): void {
    for (const set of this.waiters.values()) for (const done of set) done()
  }

  async close(): Promise<void> {
    this.wakeAll()
    await this.listener?.stop()
  }
}
