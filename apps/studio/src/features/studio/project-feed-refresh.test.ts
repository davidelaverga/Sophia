import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import type { Frame } from '@sophia/contracts/sse'
import { initialFeed, type Feed } from '../../projectors/projection.ts'
import { feedPorts, snapshotKey } from './useProjectFeed.ts'

// #368 follow-up review: the feed's debounced refresh reads the snapshot again for every applied event, and the
// archived list only when a project event was among them (project.archived / project.unarchived on the API, the
// fixture's project.updated). Room, chat and lobby events, the frequent ones in a call, leave it alone: that read asks
// LiveKit for the archived projects' rooms.
const P = '00000000-0000-0000-0000-000000000001'
const ME = 'me'
const ARCHIVED = ['projects', ME, 'archived'] as const
/** Past the 120 ms debounce. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

let sequence = 0
const event = (type: string, entityType: string): Frame => {
  sequence += 1
  return {
    eventId: `e${String(sequence)}`,
    projectId: P,
    sequence: String(sequence),
    type,
    occurredAt: '2026-10-19T00:00:00Z',
    entityType,
    entityId: P,
    entityRevision: 1,
    references: [],
    summaryCode: type,
  }
}
const room = () => event('room.exchange_changed', 'room_exchange')
const archived = () => event('project.archived', 'project')

/** The ports over a cache holding a read snapshot and archived list, so an invalidation shows on their state. */
function harness() {
  sequence = 0
  const queryClient = new QueryClient()
  const key = snapshotKey(P, ME)
  const feed: { current: Feed | null } = { current: initialFeed('0') }
  const { ports, dispose } = feedPorts({
    token: 't',
    projectId: P,
    identity: ME,
    key,
    queryClient,
    feed,
    store: (next) => (feed.current = next),
    setConnection: () => undefined,
  })
  const read = () => {
    queryClient.setQueryData(key, { cursor: feed.current?.cursor ?? '0' })
    queryClient.setQueryData(ARCHIVED, { projects: [] })
  }
  read()
  /** One burst, as the feed loop runs it: each frame applied, then eventApplied. */
  const burst = async (...frames: Frame[]) => {
    for (const frame of frames) {
      ports.apply(frame)
      ports.eventApplied()
    }
    await settle()
  }
  const stale = () => ({
    snapshot: queryClient.getQueryState(key)?.isInvalidated,
    archived: queryClient.getQueryState(ARCHIVED)?.isInvalidated,
  })
  return { burst, stale, read, dispose }
}

describe('the feed’s refresh after applied events', () => {
  it('room events read the snapshot again and leave the archived list alone', async () => {
    const h = harness()
    await h.burst(room(), room())
    assert.deepEqual(h.stale(), { snapshot: true, archived: false })
    h.dispose()
  })

  it('a project event among them reads the archived list again too, wherever it falls in the burst', async () => {
    const h = harness()
    await h.burst(room(), archived(), room())
    assert.deepEqual(h.stale(), { snapshot: true, archived: true })
    h.read()
    await h.burst(archived())
    assert.deepEqual(h.stale(), { snapshot: true, archived: true })
    h.dispose()
  })

  it('once read for a project event, a later burst of room events leaves the archived list alone', async () => {
    const h = harness()
    await h.burst(archived())
    h.read()
    await h.burst(room())
    assert.deepEqual(h.stale(), { snapshot: true, archived: false })
    h.dispose()
  })
})
