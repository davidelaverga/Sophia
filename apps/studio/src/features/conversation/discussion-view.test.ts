import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { barTarget, defaultTarget, TARGET_WORDS, targetsOf } from './discussion-view.ts'

describe('who the message bar writes to', () => {
  it('offers the room always, and Sophia too while the person can talk to her now', () => {
    assert.deepEqual(targetsOf(false), ['room'])
    assert.deepEqual(targetsOf(true), ['sophia', 'room'])
  })

  it('starts an empty bar on Sophia when she is ready, as the bar did before; on the room otherwise', () => {
    assert.equal(defaultTarget(true), 'sophia')
    assert.equal(defaultTarget(false), 'room')
    assert.deepEqual(barTarget(null, true), { target: 'sophia', other: 'room', held: false })
    assert.deepEqual(barTarget(null, false), { target: 'room', other: null, held: false })
  })

  it('keeps the target a message was begun for: a message to the room stays the room’s when Sophia is ready', () => {
    assert.deepEqual(barTarget('room', true), { target: 'room', other: 'sophia', held: false })
  })

  it('holds a message begun for Sophia while she can’t take it: never moved to the room on its own', () => {
    assert.deepEqual(barTarget('sophia', false), { target: 'sophia', other: 'room', held: true })
  })

  it('says who the message goes to', () => {
    assert.equal(TARGET_WORDS.room.placeholder, 'Message the room…')
    assert.equal(TARGET_WORDS.sophia.label, 'To Sophia')
  })
})
