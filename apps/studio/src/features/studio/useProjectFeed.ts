// Controller for snapshot + SSE (architecture 13 §3): one TanStack Query cache for server state, the
// pure projection for ordering, and runFeedLoop for reconnection. Events carry metadata only, so an
// applied event refreshes the snapshot.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getSnapshot } from '../../api/client.ts'
import { followEvents } from '../../api/stream.ts'
import { applyFrame, initialFeed, rebase, type Feed } from '../../projectors/projection.ts'
import { ACTS, contributionChanged, ERASING, feedResynced, feedStopped, ownerOf } from '../conversation/held-pages.ts'
import { runFeedLoop, type Connection, type FeedPorts } from './feed-loop.ts'
import { closedDoor, staleRetry } from './project-door.ts'

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
  /** The account whose snapshot this is; with the project, whose message changes this feed reports (held-pages.ts). */
  identity: string
  key: readonly unknown[]
  queryClient: QueryClient
  feed: { current: Feed | null }
  store: (feed: Feed) => void
  setConnection: (c: Connection) => void
}

export function feedPorts(deps: PortsDeps): { ports: FeedPorts; dispose: () => void } {
  const owner = ownerOf(deps.identity, deps.projectId)
  let refresh: ReturnType<typeof setTimeout> | undefined
  // A project event since the last refresh (archive-project.md: project.archived / project.unarchived; the fixture's
  // project.updated). Room, chat and lobby events leave the archived list alone: its read asks LiveKit for rooms.
  let archiveDue = false
  const current = () => {
    if (!deps.feed.current) throw new Error('feed loop started before the first snapshot')
    return deps.feed.current
  }
  const ports: FeedPorts = {
    current,
    apply: (frame) => {
      if (frame.type.startsWith('project.')) archiveDue = true
      const before = current()
      const next = applyFrame(before, frame)
      // A message corrected or withdrawn, once the feed took the frame (not a replay, not past a gap): kept by id
      // beyond the feed's bounded recent list (held-pages.ts).
      const took = !next.needsSnapshot && next.cursor !== before.cursor
      if (took && 'entityId' in frame && frame.entityType === 'contribution' && ACTS.has(frame.type))
        contributionChanged(owner, frame.entityId, ERASING.has(frame.type), {
          cursor: next.cursor,
          revision: frame.entityRevision,
        })
      deps.store(next)
      return next
    },
    resync: async () => {
      await deps.queryClient.refetchQueries({ queryKey: deps.key, exact: true })
      const fresh = deps.queryClient.getQueryData<{ cursor: string }>(deps.key)
      if (fresh) deps.store(rebase(current(), fresh.cursor))
      feedResynced(owner)
    },
    follow: (after, signal, onOpen, onFrame) =>
      followEvents({ token: deps.token, projectId: deps.projectId, after, signal, onOpen, onFrame }),
    setConnection: deps.setConnection,
    refused: async () => {
      await deps.queryClient.refetchQueries({ queryKey: deps.key, exact: true })
      return closedDoor(deps.queryClient.getQueryState(deps.key)?.error)
    },
    eventApplied: () => {
      clearTimeout(refresh)
      refresh = setTimeout(() => {
        void deps.queryClient.invalidateQueries({ queryKey: deps.key, exact: true })
        if (!archiveDue) return
        archiveDue = false
        // An archive or an unarchive elsewhere: the archived list (Archive.tsx's archivedKey) is read with the snapshot.
        void deps.queryClient.invalidateQueries({ queryKey: ['projects', deps.identity, 'archived'], exact: true })
      }, REFRESH_DEBOUNCE_MS)
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
  return {
    ports,
    dispose: () => {
      clearTimeout(refresh)
      feedStopped(owner)
    },
  }
}

export function useProjectFeed(projectId: string, identity: string, token: string) {
  const queryClient = useQueryClient()
  const key = useMemo(() => snapshotKey(projectId, identity), [projectId, identity])
  const snapshot = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getSnapshot(token, projectId, signal),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 3,
    // A view that could not be refreshed stays on screen (project-door.ts) and asks again by itself.
    refetchInterval: (query) => staleRetry(query.state.error, query.state.data !== undefined),
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
    const { ports, dispose } = feedPorts({
      token,
      projectId,
      identity,
      key,
      queryClient,
      feed: feedRef,
      store,
      setConnection,
    })
    void runFeedLoop(ports, stop.signal)
    return () => {
      stop.abort()
      dispose()
    }
  }, [ready, token, projectId, identity, key, queryClient, store])

  return { snapshot, feed, connection }
}
