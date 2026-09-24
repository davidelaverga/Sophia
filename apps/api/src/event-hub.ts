import type pg from 'pg'
import { listenForProjectEvents } from '@sophia/persistence'

/**
 * One LISTEN connection per API process, fanned out to SSE followers by project.
 * Notifications only say "something committed in project X"; followers re-read under their actor.
 */
export class ProjectEventHub {
  private readonly followers = new Map<string, Set<() => void>>()
  private stopListening: Promise<() => Promise<void>> | undefined
  private readonly pool: pg.Pool
  private readonly onError: (err: Error) => void

  constructor(pool: pg.Pool, onError: (err: Error) => void) {
    this.pool = pool
    this.onError = onError
  }

  follow(projectId: string, wake: () => void): () => void {
    this.stopListening ??= listenForProjectEvents(
      this.pool,
      (p) => this.wake(p),
      (err) => this.onError(err),
    )
    this.stopListening.catch(this.onError)
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

  async close(): Promise<void> {
    this.followers.clear()
    if (this.stopListening) await (await this.stopListening.catch(() => async () => {}))()
  }
}
