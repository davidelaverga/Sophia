// Controller for snapshot + SSE (architecture 13 §3): one TanStack Query cache for server state, the
// pure projection for ordering, and runFeedLoop for reconnection. Events carry metadata only, so an
// applied event refreshes the snapshot.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getSnapshot } from '../../api/client.ts'
import { followEvents } from '../../api/stream.ts'
import { applyFrame, initialFeed, rebase, type Feed } from '../../projectors/projection.ts'
import { runFeedLoop, type Connection, type FeedPorts } from './feed-loop.ts'

export type { Connection } from './feed-loop.ts'

/** Events shown as recent history on first load. */
const HISTORY = 20n
/** Coalesce snapshot refreshes when several events arrive together. */
const REFRESH_DEBOUNCE_MS = 120

export function snapshotKey(projectId: string, identity: string) {
  return ['snapshot', projectId, identity] as const
}

const historyStart = (cursor: string) => (BigInt(cursor) > HISTORY ? (BigInt(cursor) - HISTORY).toString() : '0')

interface PortsDeps {
  token: string
  projectId: string
  key: readonly unknown[]
  queryClient: QueryClient
  feed: { current: Feed | null }
  store: (feed: Feed) => void
  setConnection: (c: Connection) => void
}

function feedPorts(deps: PortsDeps): { ports: FeedPorts; dispose: () => void } {
  let refresh: ReturnType<typeof setTimeout> | undefined
  const current = () => {
    if (!deps.feed.current) throw new Error('feed loop started before the first snapshot')
    return deps.feed.current
  }
  const ports: FeedPorts = {
    current,
    apply: (frame) => {
      const next = applyFrame(current(), frame)
      deps.store(next)
      return next
    },
    resync: async () => {
      await deps.queryClient.refetchQueries({ queryKey: deps.key, exact: true })
      const fresh = deps.queryClient.getQueryData<{ cursor: string }>(deps.key)
      if (fresh) deps.store(rebase(current(), fresh.cursor))
    },
    follow: (after, signal, onOpen, onFrame) =>
      followEvents({ token: deps.token, projectId: deps.projectId, after, signal, onOpen, onFrame }),
    setConnection: deps.setConnection,
    eventApplied: () => {
      clearTimeout(refresh)
      refresh = setTimeout(
        () => void deps.queryClient.invalidateQueries({ queryKey: deps.key, exact: true }),
        REFRESH_DEBOUNCE_MS,
      )
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
  return { ports, dispose: () => clearTimeout(refresh) }
}

export function useProjectFeed(projectId: string, identity: string, token: string) {
  const queryClient = useQueryClient()
  const key = useMemo(() => snapshotKey(projectId, identity), [projectId, identity])
  const snapshot = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getSnapshot(token, projectId, signal),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 3,
    refetchOnWindowFocus: false,
  })

  const [feed, setFeed] = useState<Feed | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const feedRef = useRef<Feed | null>(null)
  const store = useCallback((next: Feed) => {
    feedRef.current = next
    setFeed(next)
  }, [])

  // First snapshot: start the history window a few events back. Later snapshots only rebase.
  const cursor = snapshot.data?.cursor
  useEffect(() => {
    if (cursor === undefined) return
    store(feedRef.current ? rebase(feedRef.current, cursor) : initialFeed(historyStart(cursor)))
  }, [cursor, store])

  const ready = feed !== null
  useEffect(() => {
    if (!ready) return undefined
    const stop = new AbortController()
    const { ports, dispose } = feedPorts({ token, projectId, key, queryClient, feed: feedRef, store, setConnection })
    void runFeedLoop(ports, stop.signal)
    return () => {
      stop.abort()
      dispose()
    }
  }, [ready, token, projectId, key, queryClient, store])

  return { snapshot, feed, connection }
}
