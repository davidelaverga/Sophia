// Reading again as the project's feed moves (docs/plans/project-conversation-writes.md): a record that lands (Sophia's
// answer, another member's message) moves the feed's cursor, and what the view shows is read again.
import { useEffect, useRef } from 'react'

/** Reads again each time the feed moves on from a position already seen (not on the first, which the read is). */
export function useReadAgain(cursor: string | undefined, refetch: () => Promise<unknown>) {
  const seen = useRef(cursor)
  useEffect(() => {
    if (seen.current === cursor) return
    const moved = seen.current !== undefined
    seen.current = cursor
    if (moved) void refetch()
  }, [cursor, refetch])
}
