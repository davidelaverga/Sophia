// Whether the project can be shown, from how its snapshot answers. Pure, so the rules are unit-tested; the shell
// only renders the result.
import { ApiError } from '../../api/client.ts'
import type { Connection } from './feed-loop.ts'

/** Why the project cannot be shown: session ended (401), not a member (403), or it never loaded. */
export type Blocked = 'expired' | 'denied' | 'unreachable'

/** The API's own refusal: the session ended (401) or this person is not a member (403). */
export const closedDoor = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403)

/**
 * A closed door (401, 403) blocks the project whatever was on screen. A refresh that fails any other way blocks
 * only a project that never loaded: once it has, the last view stays with the room and its controls. A person in
 * the call must never be left with an open microphone behind a notice that has no mute and no leave.
 */
export function blockedBy(error: Error | null, loaded: boolean): Blocked | null {
  if (!error) return null
  if (error instanceof ApiError && error.status === 401) return 'expired'
  if (error instanceof ApiError && error.status === 403) return 'denied'
  return loaded ? null : 'unreachable'
}

/** The view on screen could not be refreshed: it stays, and the bar says it is reconnecting. */
export function isStale(error: Error | null, loaded: boolean): boolean {
  return !!error && loaded && !closedDoor(error)
}

/** What the bar says about the feed: nothing while blocked (the notice says why), Reconnecting while stale. */
export function shownConnection(connection: Connection, blocked: Blocked | null, stale: boolean): Connection | null {
  if (blocked) return null
  return stale ? 'reconnecting' : connection
}

/** How often a stale view asks again, until the snapshot answers. A closed door is not asked again. */
export const STALE_RETRY_MS = 5000
export function staleRetry(error: Error | null, loaded: boolean): number | false {
  return isStale(error, loaded) ? STALE_RETRY_MS : false
}
