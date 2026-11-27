// Back and Forward under a view that stays mounted (focus-kept.md): what the entry's address names (`?invite=`) is read
// again, rather than written over with what the view held.
import { useEffect, useState } from 'react'

/**
 * Runs `read` in the render after each Back or Forward, while this component stays mounted: the entry's address is then
 * the one to show, so what it names is read before anything is written over it.
 */
export function useOnBackForward(read: () => void) {
  const [pops, setPops] = useState(0)
  useEffect(() => {
    const popped = () => setPops((n) => n + 1)
    window.addEventListener('popstate', popped)
    return () => window.removeEventListener('popstate', popped)
  }, [])
  const [readAt, setReadAt] = useState(pops)
  if (readAt !== pops) {
    setReadAt(pops)
    read()
  }
}
