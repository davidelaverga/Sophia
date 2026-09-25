import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Frame } from '@sophia/contracts/sse'
import { ApiError } from '../../api/client.ts'
import { applyFrame, initialFeed, rebase, type Feed } from '../../projectors/projection.ts'
import { MAX_BACKOFF_MS, MIN_BACKOFF_MS, runFeedLoop, type Connection, type FeedPorts } from './feed-loop.ts'

const P = '00000000-0000-0000-0000-000000000001'
const event = (sequence: string): Frame => ({
  eventId: `e${sequence}`,
  projectId: P,
  sequence,
  type: 'command.admitted',
  occurredAt: '2026-09-24T00:00:00Z',
  entityType: 'command',
  entityId: `c${sequence}`,
  entityRevision: 1,
  references: [],
  summaryCode: 'command.request_review',
})
const advance = (sequence: string): Frame => ({ projectId: P, type: 'cursor.advanced', sequence })

type Attempt = (after: string, onOpen: () => void, onFrame: (f: Frame) => void) => Promise<void>

/** Scripted ports: each stream attempt runs the next scripted behaviour; the loop stops after them. */
function harness(attempts: Attempt[], snapshotCursor = '0') {
  let feed: Feed = initialFeed('0')
  const connections: Connection[] = []
  const followedFrom: string[] = []
  const sleeps: number[] = []
  let eventsApplied = 0
  let resyncs = 0
  const stop = new AbortController()
  const ports: FeedPorts = {
    current: () => feed,
    apply: (frame) => (feed = applyFrame(feed, frame)),
    resync: () => {
      resyncs += 1
      feed = rebase(feed, snapshotCursor)
      return Promise.resolve()
    },
    follow: (after, _signal, onOpen, onFrame) => {
      followedFrom.push(after)
      const next = attempts.shift()
      if (!next) {
        stop.abort()
        return Promise.resolve()
      }
      return next(after, onOpen, onFrame)
    },
    setConnection: (c) => connections.push(c),
    eventApplied: () => (eventsApplied += 1),
    sleep: (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    },
  }
  const run = () => runFeedLoop(ports, stop.signal)
  return {
    run,
    connections,
    followedFrom,
    sleeps,
    get feed() {
      return feed
    },
    get eventsApplied() {
      return eventsApplied
    },
    get resyncs() {
      return resyncs
    },
  }
}

const stream =
  (...frames: Frame[]): Attempt =>
  (_after, onOpen, onFrame) => {
    onOpen()
    for (const f of frames) onFrame(f)
    return Promise.resolve()
  }

const denied: Attempt = () => Promise.reject(new ApiError(403, 'forbidden', 'Not permitted', 'never'))
const fail: Attempt = () => Promise.reject(new Error('network'))

describe('runFeedLoop', () => {
  it('reconnects from the last applied cursor, not from the start', async () => {
    const h = harness([stream(event('1'), event('2')), stream(event('3'))])
    await h.run()
    assert.deepEqual(h.followedFrom, ['0', '2', '3'])
    assert.equal(h.feed.cursor, '3')
    assert.equal(h.eventsApplied, 3)
  })

  it('resynchronizes from a snapshot on a gap instead of guessing', async () => {
    const h = harness([stream(event('1'), event('5'))], '5')
    await h.run()
    assert.equal(h.resyncs, 1)
    assert.ok(h.connections.includes('resyncing'))
    assert.deepEqual(h.followedFrom, ['0', '5'])
  })

  it('does not refresh server state for cursor advances (hidden events)', async () => {
    const h = harness([stream(advance('4'))])
    await h.run()
    assert.equal(h.feed.cursor, '4')
    assert.equal(h.eventsApplied, 0)
  })

  it('stops and reports denied on 401/403', async () => {
    const h = harness([denied, stream(event('1'))])
    await h.run()
    assert.equal(h.connections.at(-1), 'denied')
    assert.deepEqual(h.followedFrom, ['0'])
  })

  it('backs off exponentially while failing and resets after a live connection', async () => {
    const h = harness([fail, fail, fail, fail, fail, stream(), fail])
    await h.run()
    const expected = [1, 2, 4, 8, MAX_BACKOFF_MS / MIN_BACKOFF_MS].map((n) => n * MIN_BACKOFF_MS)
    assert.deepEqual(h.sleeps.slice(0, 5), expected)
    assert.equal(h.sleeps[5], MIN_BACKOFF_MS) // the live connection reset the backoff
  })
})
