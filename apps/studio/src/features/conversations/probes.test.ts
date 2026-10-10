import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { PROBE, Probes, type ProbeWork } from './probes.ts'

const NOT_FOUND = Object.assign(new Error('Conversation not found'), { code: 'not_found' })
const UNAVAILABLE = Object.assign(new Error('The records can’t be read right now'), { code: 'unavailable' })

/** Lets every answer already given be heard (promise callbacks), without moving the clock. */
const heard = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

/** A read held by the check: it answers when told, and never on its own (its abort ignored, as a stuck one would). */
interface Held {
  id: string
  ok: () => void
  fail: (err: unknown) => void
}

function workWith(answer: (id: string) => Promise<unknown>, keeps: (id: string) => boolean = () => true) {
  const reads: string[] = []
  const settled: string[] = []
  const work: ProbeWork = {
    read: (id) => {
      reads.push(id)
      return answer(id)
    },
    keeps,
    settle: (id) => settled.push(id),
    notFound: (err) => err === NOT_FOUND,
  }
  return { work, reads, settled }
}

describe('Probes: reading directly a conversation left out of the newest (PR #199 r4235629899, Codex)', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))
  afterEach(() => mock.timers.reset())

  it('three reads that never answer hold no slot past their deadline: the fourth runs, nothing is settled', async () => {
    const held: Held[] = []
    const { work, reads, settled } = workWith(
      (id) => new Promise<unknown>((ok, fail) => held.push({ id, ok: () => ok(null), fail })),
    )
    const probes = new Probes(work)
    for (const id of ['c1', 'c2', 'c3', 'c4']) probes.start(id)
    assert.deepEqual(reads, ['c1', 'c2', 'c3'])
    assert.deepEqual(probes.load, { flying: 3, watched: 4 })
    mock.timers.tick(PROBE.deadline)
    await heard()
    // Their attempts ended at the deadline (inconclusive): the waiting one runs; none is settled.
    assert.deepEqual(reads, ['c1', 'c2', 'c3', 'c4'])
    assert.equal(probes.load.flying, 1)
    // An answer from an attempt already ended, even not found, settles nothing.
    held[0]?.fail(NOT_FOUND)
    await heard()
    assert.deepEqual(settled, [])
    // Each is read again on its own clock (the fourth's own deadline passed meanwhile): three at once, no more.
    mock.timers.tick(PROBE.first)
    await heard()
    assert.deepEqual(reads.slice(4).toSorted(), ['c1', 'c2', 'c3'])
    assert.equal(probes.load.flying, 3)
    assert.deepEqual(settled, [])
  })

  it('not found settles it, once, and it is read no more', async () => {
    const { work, reads, settled } = workWith(() => Promise.reject(NOT_FOUND))
    const probes = new Probes(work)
    probes.start('c1')
    await heard()
    assert.deepEqual(settled, ['c1'])
    assert.deepEqual(probes.load, { flying: 0, watched: 0 })
    mock.timers.tick(PROBE.longest * 2)
    await heard()
    assert.deepEqual(reads, ['c1'])
  })

  it('read (there, only older) or unavailable: nothing settled, read again 30 s on, then the wait doubles', async () => {
    let n = 0
    const { work, reads, settled } = workWith(() => (n++ % 2 === 0 ? Promise.resolve({}) : Promise.reject(UNAVAILABLE)))
    const probes = new Probes(work)
    probes.start('c1')
    await heard()
    assert.equal(reads.length, 1)
    mock.timers.tick(PROBE.first - 1)
    await heard()
    assert.equal(reads.length, 1)
    mock.timers.tick(1)
    await heard()
    assert.equal(reads.length, 2)
    mock.timers.tick(PROBE.first * 2)
    await heard()
    assert.equal(reads.length, 3)
    assert.deepEqual(settled, [])
    assert.equal(probes.load.watched, 1)
  })

  it('nothing kept for it any more: it is not read, and is let go', async () => {
    const { work, reads } = workWith(
      () => Promise.resolve({}),
      () => false,
    )
    const probes = new Probes(work)
    probes.start('c1')
    await heard()
    assert.deepEqual(reads, [])
    assert.equal(probes.load.watched, 0)
  })

  it('stopped while its read is stuck (listed again): its slot is given back at once; its late answer is ignored', async () => {
    const held: Held[] = []
    const { work, reads, settled } = workWith(
      (id) => new Promise<unknown>((ok, fail) => held.push({ id, ok: () => ok(null), fail })),
    )
    const probes = new Probes(work)
    for (const id of ['c1', 'c2', 'c3', 'c4']) probes.start(id)
    probes.stop('c1')
    assert.deepEqual(reads, ['c1', 'c2', 'c3', 'c4'])
    held[0]?.fail(NOT_FOUND)
    await heard()
    assert.deepEqual(settled, [])
  })

  it('a view mounted twice over (StrictMode: setup, cleanup, setup) reads again once opened', async () => {
    const { work, reads } = workWith(() => Promise.resolve({}))
    const probes = new Probes(work)
    probes.open()
    probes.stopAll()
    probes.open()
    probes.start('c1')
    await heard()
    assert.deepEqual(reads, ['c1'])
  })

  it('the view gone: every read stops, none starts after', async () => {
    const { work, reads } = workWith(() => new Promise<unknown>(() => undefined))
    const probes = new Probes(work)
    for (const id of ['c1', 'c2', 'c3', 'c4']) probes.start(id)
    probes.stopAll()
    probes.start('c5')
    mock.timers.tick(PROBE.longest * 2)
    await heard()
    assert.deepEqual(reads, ['c1', 'c2', 'c3'])
    assert.deepEqual(probes.load, { flying: 0, watched: 0 })
  })
})
