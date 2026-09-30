import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterRoom, lockedBy, OPEN, shut } from './lock.ts'

describe('the personal padlock', () => {
  it('closes when the person closes it or a room is joined, and a room never takes over their lock', () => {
    assert.deepEqual(shut(OPEN, 'you'), { locked: true, by: 'you' })
    assert.deepEqual(shut(OPEN, 'room'), { locked: true, by: 'room' })
    assert.deepEqual(shut({ locked: true, by: 'you' }, 'room'), { locked: true, by: 'you' })
  })

  it('opens on leaving a room only when the room closed it', () => {
    assert.deepEqual(afterRoom({ locked: true, by: 'room' }), OPEN)
    assert.deepEqual(afterRoom({ locked: true, by: 'you' }), { locked: true, by: 'you' })
    assert.deepEqual(afterRoom(OPEN), OPEN)
    assert.equal(lockedBy(OPEN), null)
    assert.equal(lockedBy({ locked: true, by: 'room' }), 'room')
  })
})
