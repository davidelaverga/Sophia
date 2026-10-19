import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Frame } from '@sophia/contracts/sse'
import { ApiError } from '../../api/client.ts'
import { applyFrame, initialFeed, rebase, type Feed } from '../../projectors/projection.ts'
import { MAX_BACKOFF_MS, MIN_BACKOFF_MS, runFeedLoop, type Connection, type FeedPorts } from './feed-loop.ts'

/** The spread on each wait (feed-reconnect.md): ±30 %. */
const JITTER = 0.3
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

/**
 * Scripted ports: each stream attempt runs the next scripted behaviour; the loop stops after them. `doors` answers
 * each "was the snapshot refused too?" in turn (a closed door when none is scripted). `random` spreads the waits; at
 * 0.5 they are the exact backoff.
 */
function harness(attempts: Attempt[], snapshotCursor = '0', doors: boolean[] = [], random = () => 0.5) {
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
    refused: () => Promise.resolve(doors.shift() ?? true),
    eventApplied: () => (eventsApplied += 1),
    sleep: (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    },
    random,
    wakes: () => () => undefined,
  }
  const run = () => runFeedLoop(ports, stop.signal)
  return {
    run,
    ports,
    stop,
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

/**
 * A wake source the check fires (the network back, the page shown), and waits that end only when woken or stopped,
 * as a long backoff is from the person's side.
 */
function wakeable(h: ReturnType<typeof harness>) {
  const listening = new Set<() => void>()
  h.ports.wakes = (wake) => {
    listening.add(wake)
    return () => listening.delete(wake)
  }
  h.ports.sleep = (ms: number, woken?: AbortSignal) => {
    h.sleeps.push(ms)
    return new Promise((resolve) => {
      woken?.addEventListener('abort', () => resolve())
      h.stop.signal.addEventListener('abort', () => resolve())
    })
  }
  return {
    listening,
    fire: () => {
      for (const wake of listening) wake()
    },
  }
}

/** Lets the loop run as far as it goes without a wait ending. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

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

  it('stops and reports denied when the stream and then the snapshot are refused', async () => {
    const h = harness([denied, stream(event('1'))])
    await h.run()
    assert.equal(h.connections.at(-1), 'denied')
    assert.deepEqual(h.followedFrom, ['0'])
  })

  it('keeps trying when only the stream was refused: the snapshot still answers', async () => {
    const h = harness([denied, denied, stream(event('1'))], '0', [false, false])
    await h.run()
    assert.ok(!h.connections.includes('denied'))
    assert.deepEqual(h.connections.slice(0, 3), ['reconnecting', 'reconnecting', 'live'])
    assert.deepEqual(h.followedFrom, ['0', '0', '0', '1'])
    assert.deepEqual(h.sleeps.slice(0, 2), [MIN_BACKOFF_MS, 2 * MIN_BACKOFF_MS])
  })

  it('backs off exponentially while failing and resets after a live connection', async () => {
    const h = harness([fail, fail, fail, fail, fail, stream(), fail])
    await h.run()
    const expected = [1, 2, 4, 8, MAX_BACKOFF_MS / MIN_BACKOFF_MS].map((n) => n * MIN_BACKOFF_MS)
    assert.deepEqual(h.sleeps.slice(0, 5), expected)
    assert.equal(h.sleeps[5], MIN_BACKOFF_MS) // the live connection reset the backoff
  })

  it('spreads each wait by ±30 % so pages that lost the stream together come back apart', async () => {
    const steps = [1, 2, 4, 8, 10].map((n) => n * MIN_BACKOFF_MS)
    const low = harness([fail, fail, fail, fail, fail], '0', [], () => 0)
    await low.run()
    assert.deepEqual(
      low.sleeps,
      steps.map((ms) => Math.round(ms * (1 - JITTER))),
    )
    const high = harness([fail, fail, fail, fail, fail], '0', [], () => 0.999_999)
    await high.run()
    assert.deepEqual(
      high.sleeps,
      steps.map((ms) => Math.round(ms * (1 + JITTER))),
    )
  })

  it('keeps every spread wait in its band, the doubling and the reset on the unspread step', async () => {
    const draws = [0.1, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4]
    let i = 0
    const h = harness([fail, fail, fail, fail, fail, stream(), fail], '0', [], () => draws[i++ % draws.length] ?? 0.5)
    await h.run()
    const steps = [1, 2, 4, 8, 10, 1, 2].map((n) => n * MIN_BACKOFF_MS)
    assert.equal(h.sleeps.length, steps.length)
    h.sleeps.forEach((ms, n) => {
      const step = steps[n] ?? 0
      assert.ok(ms >= step * (1 - JITTER) && ms <= step * (1 + JITTER), `wait ${String(n)}: ${String(ms)} ms`)
      assert.notEqual(ms, step, `wait ${String(n)} is spread`)
    })
  })

  it('a wake during the wait asks again at once, and two wakes in the same wait ask once', async () => {
    const h = harness([fail, fail, fail, fail])
    const source = wakeable(h)
    const running = h.run()
    try {
      await settle()
      assert.equal(h.followedFrom.length, 1, 'the stream was lost: the loop waits')
      source.fire() // the network is back
      await settle()
      assert.equal(h.followedFrom.length, 2, 'woken, it asks again at once')
      source.fire() // back online and the page shown, together
      source.fire()
      await settle()
      assert.equal(h.followedFrom.length, 3, 'one ask for the wait those two ended')
      await settle()
      assert.equal(h.followedFrom.length, 3, 'and no more until the next wait ends')
    } finally {
      h.stop.abort()
      await running
    }
  })

  it('nothing listens for a wake while the stream is open, only while the loop waits', async () => {
    let end: (() => void) | undefined
    const open: Attempt = (_after, onOpen) => {
      onOpen()
      return new Promise((resolve) => (end = resolve))
    }
    const h = harness([open, fail])
    const source = wakeable(h)
    const running = h.run()
    try {
      await settle()
      assert.equal(h.connections.at(-1), 'live')
      assert.equal(source.listening.size, 0)
      source.fire()
      await settle()
      assert.equal(h.followedFrom.length, 1, 'a wake while live asks nothing')
      end?.() // the server ends the stream: the loop waits, and listens
      await settle()
      assert.equal(source.listening.size, 1)
    } finally {
      h.stop.abort()
      await running
    }
  })
})
