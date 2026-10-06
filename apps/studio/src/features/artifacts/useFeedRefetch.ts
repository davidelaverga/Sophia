// A read of records that the project's feed may change (reviews, tasks): read again as the feed moves, on the same
// query, so a refresh that fails keeps what was read on screen (a new key per cursor would have none to keep).
import { useEffect, useRef } from 'react'

/** Reads again whenever `cursor` moves, joining a read already on its way rather than cancelling it. */
export function useFeedRefetch(cursor: string | undefined, refetch: (o: { cancelRefetch: boolean }) => unknown) {
  const was = useRef(cursor)
  useEffect(() => {
    if (was.current === cursor) return
    was.current = cursor
    void refetch({ cancelRefetch: false })
  }, [cursor, refetch])
}
