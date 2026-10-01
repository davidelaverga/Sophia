import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callEnded } from './notice-view.ts'

const DROPPED = 'You were disconnected from the room.'

describe('a call that ended', () => {
  it('says why where its room is out of sight', () => {
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: false }), DROPPED)
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: null, here: false }), 'You left Pitch deck, Q4.')
  })

  it('leaves it to the room on screen, and never says the personal space opened: only the person opens it', () => {
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: true }), null)
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: null, here: true }), null)
  })
})
