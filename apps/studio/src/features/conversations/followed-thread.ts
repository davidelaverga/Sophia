// A conversation's thread read held in the cache is shown only as followed: read where the project's feed stands now,
// or kept on screen as the feed moved (useReadAgain reads it again then). One no view showed as the feed moved may
// hold what was withdrawn meanwhile, by another tab or an admin: opened again, it is let go before it can be shown,
// with whatever it lets be pressed there, and read again; a read that fails then shows nothing of it (PR #199
// r4237833438). Only that thread goes: no other conversation's, reader's or project's read, and nothing kept of drafts
// or writes held (talk-store). No read sets out but the one its opening makes.
import type { QueryClient } from '@tanstack/react-query'
import type { ThreadHeld } from './conversation-list.ts'

/**
 * Where the feed stood when the thread read held set out, as its newest page notes it (`readAt`; each older page is
 * read after it, a refetch reading them all again in order); none where that wasn't known.
 */
export function readAtOf(held: ThreadHeld): string | undefined {
  const newest = held?.pages[0]
  return newest && 'readAt' in newest && typeof newest.readAt === 'string' ? newest.readAt : undefined
}

/**
 * The thread read under `key` let go where nothing shows it now and it wasn't read where the feed stands (`cursor`):
 * its opening reads it again, never showing it as it was. Whether it was let go.
 */
export function dropUnfollowed(queryClient: QueryClient, key: readonly unknown[], cursor: string | undefined): boolean {
  const query = queryClient.getQueryCache().find<ThreadHeld>({ queryKey: key, exact: true })
  const held = query?.state.data
  if (!query || held === undefined || query.getObserversCount() > 0 || readAtOf(held) === cursor) return false
  queryClient.removeQueries({ queryKey: key, exact: true })
  return true
}
