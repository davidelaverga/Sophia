// A read of records that the project's feed may change (reviews, tasks): read again as the feed moves, on the same
// query, so a refresh that fails keeps what was read on screen (a new key per cursor would have none to keep). A move
// during a read waits for that read to settle, then reads again: the read on its way may hold what came before.
import { useEffect, useRef } from 'react'
import { feedStep, type FeedRead } from './feed-step.ts'

export function useFeedRefetch(
  cursor: string | undefined,
  read: { isFetching: boolean; refetch: (o: { cancelRefetch: boolean }) => unknown },
) {
  const state = useRef<FeedRead>({ seen: cursor, pending: false })
  const { isFetching, refetch } = read
  useEffect(() => {
    const next = feedStep(state.current, cursor, isFetching)
    state.current = { seen: next.seen, pending: next.pending }
    if (next.refetch) void refetch({ cancelRefetch: false })
  }, [cursor, isFetching, refetch])
}
