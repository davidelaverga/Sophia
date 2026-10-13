// The server state App caches for one account (App.tsx). Another account coming in, even at the same address, gets a
// cache of its own before anything of it renders, so nothing read for the last one is shown to the next, not even for a
// frame; the last one's is cleared once the next has taken over, never while rendering (Codex's review of a06db118).
import { QueryClient } from '@tanstack/react-query'

export interface AccountCache {
  /** The account signed in (accountOf: its token's subject), or null while nobody is. */
  account: string | null
  client: QueryClient
}

export const cacheOf = (account: string | null): AccountCache => ({ account, client: new QueryClient() })

/** The cache for `account`: the one it has, or a new, empty one. */
export const cacheFor = (cache: AccountCache, account: string | null): AccountCache =>
  cache.account === account ? cache : cacheOf(account)

/**
 * Nothing personal stays in memory while the padlock is shut: every personal read goes, under whichever address it was
 * read (an email change reads it again under the new one), and the reads on their way stop with their queries. So does
 * what needs the person (A15): its replies are Sophia's words to them (Codex on #245).
 */
export const forgetPersonalReads = (client: QueryClient): void => {
  client.removeQueries({ queryKey: ['personal'] })
  client.removeQueries({ queryKey: ['vision', 'needs'] })
}
