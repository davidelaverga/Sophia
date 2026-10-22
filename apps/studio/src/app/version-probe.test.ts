import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  browserPage,
  PROBE_ASK_MS,
  PROBE_EVERY_MS,
  PROBE_GAP_MS,
  servedVersion,
  versionProbe,
  type ProbePage,
} from './version-probe.ts'

// A tab left open asks the host for its version (docs/plans/version-probe.md; the baseline's M9): back into view or
// focus, at most once a minute, and every ten minutes while in view; a different id is said once, and the asking stops.

/** A page the checks drive: its clock, visibility, focus, interval and the host's answers. */
function fakePage(answer: () => Promise<unknown>) {
  const backs = new Set<() => void>()
  const ticks = new Set<() => void>()
  const state = { hidden: false, now: 0, asked: 0, every: 0 }
  const page: ProbePage = {
    hidden: () => state.hidden,
    now: () => state.now,
    served: () => {
      state.asked += 1
      return answer()
    },
    onBack: (ask) => {
      backs.add(ask)
      return () => backs.delete(ask)
    },
    every: (ms, ask) => {
      state.every = ms
      ticks.add(ask)
      return () => ticks.delete(ask)
    },
  }
  return {
    page,
    state,
    back: () => backs.forEach((ask) => ask()),
    tick: () => ticks.forEach((ask) => ask()),
    listening: () => backs.size + ticks.size,
  }
}

/** Lets the host's answer and what follows it settle. */
const settled = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('a tab left open asks for the version', () => {
  it('reads the served id only from a body that names one', () => {
    assert.equal(servedVersion({ version: 'b2' }), 'b2')
    for (const body of [null, 'b2', {}, { version: '' }, { version: 2 }, []]) assert.equal(servedVersion(body), null)
  })

  it('asks every ten minutes, within the baseline’s fifteen, and at most once a minute on coming back', () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b1' }))
    versionProbe(fake.page, 'b1', () => undefined)
    assert.equal(fake.state.every, PROBE_EVERY_MS)
    assert.equal(PROBE_EVERY_MS, 10 * 60_000)
    assert.equal(PROBE_GAP_MS, 60_000)
  })

  it('a different id on coming back is said once, and it asks no more', async () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b2' }))
    let told = 0
    versionProbe(fake.page, 'b1', () => (told += 1))
    assert.equal(fake.state.asked, 0, 'nothing asked as the page starts')
    fake.back()
    await settled()
    assert.equal(told, 1)
    assert.equal(fake.listening(), 0, 'no focus, view or interval listened to after')
    fake.state.now += PROBE_EVERY_MS
    fake.back()
    fake.tick()
    await settled()
    assert.equal(fake.state.asked, 1)
    assert.equal(told, 1)
  })

  it('the interval asks while in view, and a different id is said', async () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b2' }))
    let told = 0
    versionProbe(fake.page, 'b1', () => (told += 1))
    fake.tick()
    await settled()
    assert.equal(fake.state.asked, 1)
    assert.equal(told, 1)
  })

  it('the same id says nothing, and it asks again later', async () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b1' }))
    let told = 0
    versionProbe(fake.page, 'b1', () => (told += 1))
    fake.back()
    await settled()
    fake.tick()
    await settled()
    assert.equal(fake.state.asked, 2)
    assert.equal(told, 0)
  })

  it('a hidden tab asks nothing, on the interval or otherwise', async () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b2' }))
    let told = 0
    versionProbe(fake.page, 'b1', () => (told += 1))
    fake.state.hidden = true
    fake.back()
    fake.tick()
    await settled()
    assert.equal(fake.state.asked, 0)
    assert.equal(told, 0)
  })

  it('coming back twice within a minute asks once; the interval still asks', async () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b1' }))
    versionProbe(fake.page, 'b1', () => undefined)
    fake.back()
    await settled()
    fake.state.now += PROBE_GAP_MS - 1
    fake.back()
    await settled()
    assert.equal(fake.state.asked, 1, 'within the minute')
    fake.tick()
    await settled()
    assert.equal(fake.state.asked, 2, 'the interval')
    fake.state.now += PROBE_GAP_MS
    fake.back()
    await settled()
    assert.equal(fake.state.asked, 3, 'a minute after the last ask')
  })

  it('one ask at a time: coming back while the host is still answering asks nothing more', async () => {
    const pending: { answer?: (body: unknown) => void } = {}
    const fake = fakePage(() => new Promise((resolve) => (pending.answer = resolve)))
    versionProbe(fake.page, 'b1', () => undefined)
    fake.back()
    fake.tick()
    assert.equal(fake.state.asked, 1)
    pending.answer?.({ version: 'b1' })
    await settled()
    fake.tick()
    assert.equal(fake.state.asked, 2)
  })

  it('a failed read, a 404 or a body without an id is no word', async () => {
    for (const answer of [() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve(null)]) {
      const fake = fakePage(answer)
      let told = 0
      versionProbe(fake.page, 'b1', () => (told += 1))
      fake.back()
      await settled()
      assert.equal(told, 0)
      assert.equal(fake.listening(), 2, 'still asking')
    }
  })

  // Review P3 (2026-10-22): one ask at a time, so a request that hangs would stop the asking for good.
  it('the browser’s ask gives up after ten seconds', async () => {
    const asked: (AbortSignal | null | undefined)[] = []
    const win = {
      fetch: (_url: string, init?: RequestInit) => {
        asked.push(init?.signal)
        return Promise.resolve(new Response('{"version":"b1"}'))
      },
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a window of the one method the ask uses
    assert.equal(
      await browserPage(win as unknown as Window)
        .served()
        .then(servedVersion),
      'b1',
    )
    assert.ok(asked[0] instanceof AbortSignal, 'the ask carries a signal that ends it')
    assert.equal(PROBE_ASK_MS, 10_000)
  })

  it('stopped, it asks no more', async () => {
    const fake = fakePage(() => Promise.resolve({ version: 'b2' }))
    let told = 0
    const stop = versionProbe(fake.page, 'b1', () => (told += 1))
    stop()
    fake.back()
    fake.tick()
    await settled()
    assert.equal(fake.state.asked, 0)
    assert.equal(told, 0)
  })
})
