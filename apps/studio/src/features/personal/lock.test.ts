import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lockedBy, lockStore, onCallStart, OPEN, storedLock } from './lock.ts'

const ROOM = { locked: true, by: 'room' } as const
const YOU = { locked: true, by: 'you' } as const

/** A browser's storage for one key, or one that throws on reads, on writes, or both. */
function storage(initial: string | null = null, fails: { read?: boolean; write?: boolean } = {}) {
  let value = initial
  return {
    get value() {
      return value
    },
    getItem: () => {
      if (fails.read) throw new Error('blocked')
      return value
    },
    setItem: (_key: string, next: string) => {
      if (fails.write) throw new Error('full')
      value = next
    },
    removeItem: () => {
      if (fails.write) throw new Error('full')
      value = null
    },
  }
}

describe('the personal padlock', () => {
  it('reads what the device stored: open, shut by a call, or shut by the person', () => {
    assert.deepEqual(storedLock(null), OPEN)
    assert.deepEqual(storedLock('room'), ROOM)
    assert.deepEqual(storedLock('you'), YOU)
    assert.deepEqual(storedLock('locked'), YOU, 'as it was written before the reason was kept')
    assert.equal(lockedBy(OPEN), null)
    assert.equal(lockedBy(ROOM), 'room')
  })

  it('is shut by every call, and a call never takes over the person’s own lock', () => {
    assert.equal(onCallStart(null), 'room')
    assert.equal(onCallStart('room'), 'room')
    assert.equal(onCallStart('you'), 'you')
    assert.equal(onCallStart('locked'), 'locked')
  })

  it('keeps one stored value for every tab, and tells this tab’s readers of each change', () => {
    const kept = storage()
    const store = lockStore('k', kept)
    let told = 0
    const off = store.subscribe(() => {
      told += 1
    })
    store.write('room')
    assert.deepEqual([store.read(), kept.value, told], ['room', 'room', 1])
    store.write(null)
    assert.deepEqual([store.read(), kept.value, told], [null, null, 2])
    off()
    store.write('you')
    assert.equal(told, 2)
  })

  it('starts shut where the browser keeps nothing: the space never shows unasked', () => {
    const store = lockStore('k', storage(null, { read: true, write: true }))
    assert.equal(store.read(), 'you')
    store.write(null)
    assert.equal(store.read(), null, 'the person opened it for this page')
    assert.equal(lockStore('k', null).read(), 'you')
  })

  it('keeps its own last write for this page when storage refuses it', () => {
    const kept = storage(null, { write: true })
    const store = lockStore('k', kept)
    store.write('you')
    assert.deepEqual([store.read(), kept.value], ['you', null])
  })
})
