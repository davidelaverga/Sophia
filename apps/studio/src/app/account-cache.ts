// The server state App caches for one account (App.tsx). Another account coming in, even at the same address, gets a
// cache of its own before anything of it renders, so nothing read for the last one is shown to the next, not even for a
// frame; the last one's is cleared once the next has taken over, never while rendering (Codex's review of a06db118).
import { createContext } from 'react'
import { QueryClient } from '@tanstack/react-query'

export interface AccountCache {
  /** The account signed in (accountOf: its token's subject), or null while nobody is. */
  account: string | null
  client: QueryClient
}

/**
 * How a read is asked again: never after a refusal the API marks `retry: never` (a 403 behind «No access» does not
 * change by asking: e2e-real Q2); anything else three times, as TanStack's default. A read's own `retry` wins.
 */
export const retryRead = (failures: number, error: unknown): boolean => !finalRefusal(error) && failures < 3

/**
 * An API refusal marked `retry: never` (ApiError's shape), read without importing the API client: this module loads on
 * the sign-in page, which fetches none of the signed-in Studio, its client or the validators (signed-in-later.spec).
 */
const finalRefusal = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'retry' in error && error.retry === 'never'

export const cacheOf = (account: string | null): AccountCache => ({
  account,
  client: new QueryClient({ defaultOptions: { queries: { retry: retryRead } } }),
})

/** The cache for `account`: the one it has, or a new, empty one. */
export const cacheFor = (cache: AccountCache, account: string | null): AccountCache =>
  cache.account === account ? cache : cacheOf(account)

/**
 * Nothing personal stays in memory while the padlock is shut: every personal read goes, under whichever address it was
 * read (an email change reads it again under the new one), and the reads on their way stop with their queries. So does
 * what needs the person (A15): its replies are Sophia's words to them (Codex on #245), and so is the room's mentions
 * read, the same mixed list (needs-api.md): every account, cursor and shape it was kept under (P1 4309009938).
 */
export const forgetPersonalReads = (client: QueryClient): void => {
  client.removeQueries({ queryKey: ['personal'] })
  client.removeQueries({ queryKey: ['vision', 'needs'] })
  client.removeQueries({ queryKey: ['mentions', 'needs'] })
}

/**
 * Whether the personal padlock is shut (SignedIn's own, useLock): what reads the person's mixed Needs list in a project
 * (the room's mentions) doesn't while it is, mounted or hidden (CONTRIBUTING's personal space, P1 4309009938).
 */
export const PersonalLocked = createContext(false)
