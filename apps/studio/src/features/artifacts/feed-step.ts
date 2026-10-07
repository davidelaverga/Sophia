// When a read of the feed's records is made again (useFeedRefetch): pure, so the units test it.

export interface FeedRead {
  /** The cursor last acted on. */
  seen: string | undefined
  /** The cursor moved during a read: read again once that read settles (it may hold what came before the move). */
  pending: boolean
}

/** The next state, and whether to read again now. */
export function feedStep(
  state: FeedRead,
  cursor: string | undefined,
  fetching: boolean,
): FeedRead & { refetch: boolean } {
  const moved = cursor !== state.seen
  const due = moved || state.pending
  if (!due) return { ...state, refetch: false }
  return fetching ? { seen: cursor, pending: true, refetch: false } : { seen: cursor, pending: false, refetch: true }
}
