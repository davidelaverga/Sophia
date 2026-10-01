import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callEnded } from './notice-view.ts'

const DROPPED = 'You were disconnected from the room.'

describe('a call that ended', () => {
  it('says why where its room is out of sight, and that the personal space opened again', () => {
    assert.equal(
      callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: false, reopens: true }),
      'You were disconnected from the room. Your personal space is open again.',
    )
    assert.equal(
      callEnded({ title: 'Pitch deck, Q4', note: null, here: false, reopens: false }),
      'You left Pitch deck, Q4.',
    )
  })

  it('leaves the rest to the room on screen, but still says the personal space opened again', () => {
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: true, reopens: false }), null)
    assert.equal(
      callEnded({ title: 'Pitch deck, Q4', note: null, here: true, reopens: true }),
      'Your personal space is open again.',
    )
  })
})
