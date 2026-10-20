import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CallFence, keptIfStill } from './call-fence.ts'

/** A connection that records whether it was left. */
const connection = () => {
  const c = {
    left: 0,
    leave: async () => {
      await Promise.resolve()
      c.left += 1
    },
  }
  return c
}

describe('a join still wanted once connected (review round 2)', () => {
  it('a join still wanted keeps its connection', () => {
    const opened = connection()
    assert.equal(
      keptIfStill(opened, () => true),
      opened,
    )
    assert.equal(keptIfStill(opened, undefined), opened)
    assert.equal(opened.left, 0)
  })

  it('a join no longer wanted once connected is left at once, and fails', async () => {
    const opened = connection()
    assert.throws(() => keptIfStill(opened, () => false), /no longer wanted/)
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(opened.left, 1)
  })
})

describe('which join is the call', () => {
  it('a join that finishes while still the latest becomes the call', () => {
    const fence = new CallFence<ReturnType<typeof connection>>()
    const opened = connection()
    const call = fence.begin()
    assert.equal(fence.adopt(call, opened), true)
    assert.equal(fence.current, opened)
    assert.equal(opened.left, 0)
  })

  it('a join that Leave, or the page going away, overtook is left at once and never becomes the call', async () => {
    const fence = new CallFence<ReturnType<typeof connection>>()
    const call = fence.begin()
    await fence.end()
    const opened = connection()
    assert.equal(fence.adopt(call, opened), false)
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(opened.left, 1, 'no microphone stays connected behind a screen that says they left')
    assert.equal(fence.current, null)
  })

  it('a newer join supersedes one still under way', async () => {
    const fence = new CallFence<ReturnType<typeof connection>>()
    const first = fence.begin()
    const second = fence.begin()
    const older = connection()
    const newer = connection()
    assert.equal(fence.adopt(first, older), false)
    assert.equal(fence.adopt(second, newer), true)
    await Promise.resolve()
    await Promise.resolve()
    assert.deepEqual([older.left, newer.left], [1, 0])
    assert.equal(fence.current, newer)
  })

  it('leaving leaves the call, and its later events are no longer this person’s', async () => {
    const fence = new CallFence<ReturnType<typeof connection>>()
    const opened = connection()
    const call = fence.begin()
    fence.adopt(call, opened)
    assert.equal(fence.holds(opened), true)
    await fence.end()
    assert.equal(opened.left, 1)
    assert.equal(fence.current, null)
    assert.equal(fence.isCurrent(call), false)
    assert.equal(fence.holds(opened), false, 'a join still settling (its microphone arriving) is out of the call')
  })
})
