// A conversation's thread read held in the cache is shown only as followed: read where the project's feed stands now,
// or kept on screen as the feed moved (useReadAgain reads it again then). One no view showed as the feed moved may
// hold what was withdrawn meanwhile, by another tab or an admin: opened again, it is let go before it can be shown,
// with whatever it lets be pressed there, and read again; a read that fails then shows nothing of it (PR #199
// r4237833438). Only that thread goes: no other conversation's, reader's or project's read, and nothing kept of drafts
// or writes held (talk-store). No read sets out but the one its opening makes.
import type { QueryClient } from '@tanstack/react-query'
import type { ThreadHeld } from './conversation-list.ts'

/**
 * A feed position: the contract's decimal cursor (`CURSOR_PATTERN` in @sophia/contracts, which the A16 validator applies
 * to a receipt's `cursor`). Written here, not imported: that package's root reads files at load and is server-only, so a
 * runtime import from it left the Studio blank at 7ff0eac9.
 */
const POSITION = /^(0|[1-9][0-9]*)$/

/**
 * Where the feed stood when the thread read held set out, as its newest page notes it (`readAt`; each older page is
 * read after it, a refetch reading them all again in order); none where that wasn't known.
 */
export function readAtOf(held: ThreadHeld): string | undefined {
  const newest = held?.pages[0]
  return newest && 'readAt' in newest && typeof newest.readAt === 'string' ? newest.readAt : undefined
}

/** A feed position as a number, where it is one. */
const positionOf = (cursor: string | undefined) =>
  cursor !== undefined && POSITION.test(cursor) ? BigInt(cursor) : undefined

/**
 * Whether a read current at `readAt` is current where the feed stands (`cursor`): read there or after, as a start's
 * receipt can be (its own position, ahead of a page whose feed hasn't caught up yet; PR #199 r4237924424). Positions
 * compare as numbers; where either isn't one, only both unknown counts.
 */
export function followedAt(readAt: string | undefined, cursor: string | undefined): boolean {
  const read = positionOf(readAt)
  const now = positionOf(cursor)
  if (read === undefined || now === undefined) return readAt === undefined && cursor === undefined
  return read >= now
}

/**
 * The thread read under `key` let go where nothing shows it now and it isn't current where the feed stands (`cursor`):
 * its opening reads it again, never showing it as it was. Whether it was let go.
 */
export function dropUnfollowed(queryClient: QueryClient, key: readonly unknown[], cursor: string | undefined): boolean {
  const query = queryClient.getQueryCache().find<ThreadHeld>({ queryKey: key, exact: true })
  const held = query?.state.data
  if (!query || held === undefined || query.getObserversCount() > 0 || followedAt(readAtOf(held), cursor)) return false
  queryClient.removeQueries({ queryKey: key, exact: true })
  return true
}
