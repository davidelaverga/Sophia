import type pg from 'pg'
import { ProjectEventListener } from '@sophia/persistence'

/**
 * One LISTEN connection per API process, fanned out to SSE followers by project.
 * Notifications only say "something committed in project X"; followers re-read under their actor.
 * The listener reconnects by itself; on reconnect every follower re-reads from its cursor.
 */
export class ProjectEventHub {
  private readonly followers = new Map<string, Set<() => void>>()
  private listener: ProjectEventListener | undefined
  private readonly pool: pg.Pool
  private readonly onError: (err: Error) => void

  constructor(pool: pg.Pool, onError: (err: Error) => void) {
    this.pool = pool
    this.onError = onError
  }

  follow(projectId: string, wake: () => void): () => void {
    this.listener ??= new ProjectEventListener(this.pool, {
      onProject: (p) => this.wake(p),
      onReconnect: () => this.wakeAll(),
      onError: (err) => this.onError(err),
    })
    let set = this.followers.get(projectId)
    if (!set) this.followers.set(projectId, (set = new Set()))
    set.add(wake)
    return () => {
      set.delete(wake)
      if (set.size === 0) this.followers.delete(projectId)
    }
  }

  private wake(projectId: string): void {
    for (const wake of this.followers.get(projectId) ?? []) wake()
  }

  private wakeAll(): void {
    for (const set of this.followers.values()) for (const wake of set) wake()
  }

  async close(): Promise<void> {
    this.followers.clear()
    await this.listener?.stop()
  }
}
