// Reading again as the project's feed moves (docs/plans/project-conversation-writes.md): a record that lands (Sophia's
// answer, another member's message) moves the feed's cursor, and what the view shows is read again.
import { useEffect, useRef } from 'react'

/**
 * Reads again each time the feed's position changes, the first one learned included: a read finished before the page
 * knew where the feed stood may have missed what landed meanwhile. (Mounted with a position already known, nothing.)
 */
export function useReadAgain(cursor: string | undefined, refetch: () => Promise<unknown>) {
  const seen = useRef(cursor)
  useEffect(() => {
    if (seen.current === cursor) return
    seen.current = cursor
    void refetch()
  }, [cursor, refetch])
}
