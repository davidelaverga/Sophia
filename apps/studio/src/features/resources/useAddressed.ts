// What the address's fragment names under a prefix (link.ts), followed while the view is open: a link followed within
// the page names something new. Each time it is followed counts (`seq`), so a choice made since (a goal, a closed
// sheet) gives way to the address only when the address is followed again, never when it is merely read again.
import { useEffect, useState } from 'react'
import { linkedId } from './link.ts'

export interface Addressed {
  id: string | null
  /** How many times the address was followed: 0 for what the page opened with. */
  seq: number
}

export function useAddressed(prefix: string): Addressed {
  const [named, setNamed] = useState<Addressed>(() => ({ id: linkedId(window.location.hash, prefix), seq: 0 }))
  useEffect(() => {
    const follow = () => setNamed((n) => ({ id: linkedId(window.location.hash, prefix), seq: n.seq + 1 }))
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [prefix])
  return named
}
