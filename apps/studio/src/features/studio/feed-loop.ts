// The follow/reconnect/resync loop behind useProjectFeed, free of React so it can be tested alone.
// Reconnects from the last *applied* cursor; a gap resynchronizes from a snapshot, never guesses.
import type { Frame } from '@sophia/contracts/sse'
import { ApiError } from '../../api/client.ts'
import type { Feed } from '../../projectors/projection.ts'

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'resyncing' | 'denied'

export interface FeedPorts {
  /** The feed as last applied. */
  current(): Feed
  /** Apply one frame and return the new feed (the port stores it). */
  apply(frame: Frame): Feed
  /** Fetch a new snapshot and rebase the feed on its cursor. */
  resync(): Promise<void>
  /** One stream attempt from `after`; resolves when it ends, throws on failure. */
  follow(after: string, signal: AbortSignal, onOpen: () => void, onFrame: (frame: Frame) => void): Promise<void>
  setConnection(connection: Connection): void
  /** A real event (not a cursor advance) was applied: server state changed. */
  eventApplied(): void
  /**
   * The stream was refused: ask for the snapshot again, and resolve to whether it was refused too. If it was, the
   * door is closed and the screen shows its notice (project-door.ts). If not, only the stream stumbled.
   */
  refused(): Promise<boolean>
  sleep(ms: number): Promise<void>
}

export const MIN_BACKOFF_MS = 1000
export const MAX_BACKOFF_MS = 10_000

const isAccessError = (err: unknown) => err instanceof ApiError && (err.status === 401 || err.status === 403)

/** One stream attempt. A gap aborts it so the loop can resync. */
async function followOnce(ports: FeedPorts, stop: AbortSignal, onLive: () => void): Promise<'ended' | 'denied'> {
  const attempt = new AbortController()
  const abortAttempt = () => attempt.abort()
  stop.addEventListener('abort', abortAttempt)
  try {
    await ports.follow(ports.current().cursor, attempt.signal, onLive, (frame) => {
      const next = ports.apply(frame)
      if (next.needsSnapshot) attempt.abort()
      else if (frame.type !== 'cursor.advanced') ports.eventApplied()
    })
    return 'ended'
  } catch (err: unknown) {
    return isAccessError(err) ? 'denied' : 'ended'
  } finally {
    stop.removeEventListener('abort', abortAttempt)
  }
}

/**
 * Runs until `stop` aborts or the project's door is closed. A refused stream alone does not end it: the snapshot is
 * asked first, so a closed door reaches the screen as its notice and a stumble is retried like any other. Ending
 * on the stream's word left the project on screen, frozen, behind a small "No access".
 */
export async function runFeedLoop(ports: FeedPorts, stop: AbortSignal): Promise<void> {
  let backoff = MIN_BACKOFF_MS
  // Read through a function: `stop` can abort while this loop awaits.
  const stopped = () => stop.aborted
  const onLive = () => {
    ports.setConnection('live')
    backoff = MIN_BACKOFF_MS
  }
  while (!stopped()) {
    if (ports.current().needsSnapshot) {
      ports.setConnection('resyncing')
      await ports.resync()
      continue
    }
    if ((await followOnce(ports, stop, onLive)) === 'denied' && (await ports.refused())) {
      ports.setConnection('denied')
      return
    }
    if (stopped() || ports.current().needsSnapshot) continue
    ports.setConnection('reconnecting')
    await ports.sleep(backoff)
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
  }
}
