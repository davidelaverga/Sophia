// What the address's fragment names under a prefix (link.ts), followed while the view is open: a link followed within
// the page names something new. Each time it is followed counts (`seq`), so a choice made since (a goal, a closed
// sheet) gives way to the address only when the address is followed again, never when it is merely read again.
import { useEffect, useState } from 'react'
import { ADDRESS_MOVED } from '../../app/route.ts'
import { linkedId } from './link.ts'

export interface Addressed {
  id: string | null
  /** How many times the address was followed: 0 for what the page opened with. */
  seq: number
}

/** The router named a record in the fragment (openAt): a mounted view follows it as a link followed. */
export const ADDRESS_NAMED = 'sophia:address-named'

export function useAddressed(prefix: string): Addressed {
  const [named, setNamed] = useState<Addressed>(() => ({ id: linkedId(window.location.hash, prefix), seq: 0 }))
  useEffect(() => {
    const follow = () => setNamed((n) => ({ id: linkedId(window.location.hash, prefix), seq: n.seq + 1 }))
    window.addEventListener('hashchange', follow)
    window.addEventListener(ADDRESS_NAMED, follow)
    // The route's own moves (a view's path pushed) may drop the fragment: read again, not followed (`seq` stays, so a
    // choice made since stands), and a gone address is gone, never replayed (Codex P2 on #300).
    const moved = () => setNamed((n) => ({ id: linkedId(window.location.hash, prefix), seq: n.seq }))
    window.addEventListener(ADDRESS_MOVED, moved)
    return () => {
      window.removeEventListener('hashchange', follow)
      window.removeEventListener(ADDRESS_NAMED, follow)
      window.removeEventListener(ADDRESS_MOVED, moved)
    }
  }, [prefix])
  return named
}
