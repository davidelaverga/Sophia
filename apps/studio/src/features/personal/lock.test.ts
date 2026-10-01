import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterRoom, followed, lockedBy, onCallChange, OPEN, shut, storedLock } from './lock.ts'

const ROOM = { locked: true, by: 'room' } as const
const YOU = { locked: true, by: 'you' } as const

describe('the personal padlock', () => {
  it('closes when the person closes it or a room is joined, and a room never takes over their lock', () => {
    assert.deepEqual(shut(OPEN, 'you'), YOU)
    assert.deepEqual(shut(OPEN, 'room'), ROOM)
    assert.deepEqual(shut(YOU, 'room'), YOU)
  })

  it('opens on leaving a room only when the room closed it', () => {
    assert.deepEqual(afterRoom(ROOM), OPEN)
    assert.deepEqual(afterRoom(YOU), YOU)
    assert.deepEqual(afterRoom(OPEN), OPEN)
    assert.equal(lockedBy(OPEN), null)
    assert.equal(lockedBy(ROOM), 'room')
  })

  it('shuts again for every new call, also one that replaces another without a pause', () => {
    assert.deepEqual(onCallChange(OPEN, null, 'a'), ROOM)
    // Unlocked during call a, then straight into call b.
    assert.deepEqual(onCallChange(OPEN, 'a', 'b'), ROOM)
    assert.deepEqual(onCallChange(OPEN, 'a', 'a'), OPEN)
    assert.deepEqual(onCallChange(ROOM, 'b', null), OPEN)
    assert.deepEqual(onCallChange(YOU, 'b', null), YOU)
  })

  it('follows another tab, but never opens one that holds a call', () => {
    assert.deepEqual(storedLock('room'), ROOM)
    assert.deepEqual(storedLock('you'), YOU)
    assert.deepEqual(storedLock('locked'), YOU, 'as it was written before the reason was kept')
    assert.deepEqual(storedLock(null), OPEN)
    assert.deepEqual(followed(storedLock('room'), false), ROOM)
    assert.deepEqual(followed(OPEN, false), OPEN)
    assert.deepEqual(followed(OPEN, true), ROOM)
    assert.deepEqual(followed(YOU, true), YOU)
  })
})
