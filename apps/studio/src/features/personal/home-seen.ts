// Whether Home has been shown to an account on this browser (docs/plans/home-welcome-once.md): «Welcome» is said on
// the first visit only, the hour's greeting after. A store that can't be read counts as seen, so a blocked store gives
// the hour's greeting rather than «Welcome» on every visit.

import { useEffect, useState } from 'react'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export const homeSeenKey = (account: string) => `sophia.home.seen.${account}`

export function seenHome(store: Pick<Store, 'getItem'> | null, account: string): boolean {
  try {
    return store === null || store.getItem(homeSeenKey(account)) !== null
  } catch {
    return true
  }
}

export function keepHomeSeen(store: Pick<Store, 'setItem'> | null, account: string): void {
  try {
    store?.setItem(homeSeenKey(account), '1')
  } catch {
    // Blocked storage: read as seen next time anyway.
  }
}

/** «Welcome» only for an empty personal space on an account Home hasn't seen here. */
export const welcomes = (at: { fresh: boolean; seenBefore: boolean }): boolean => at.fresh && !at.seenBefore

function browserStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * Whether Home had been seen by this account before this page: read once per page and account, so the visit that
 * welcomes keeps «Welcome»; kept once Home is on screen with its greeting read (`shown`).
 */
export function useSeenBefore(account: string, shown: boolean): boolean {
  const [read, setRead] = useState(() => ({ account, before: seenHome(browserStore(), account) }))
  const now = read.account === account ? read : { account, before: seenHome(browserStore(), account) }
  if (now !== read) setRead(now)
  useEffect(() => {
    if (shown) keepHomeSeen(browserStore(), account)
  }, [shown, account])
  return now.before
}
