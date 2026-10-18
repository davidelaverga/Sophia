import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callEnded } from './notice-view.ts'

const DROPPED = 'You were disconnected from the room.'

describe('a call that ended', () => {
  it('says why where its room is out of sight', () => {
    assert.deepEqual(callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: false }), {
      message: DROPPED,
      act: null,
    })
    assert.deepEqual(callEnded({ title: 'Pitch deck, Q4', note: null, here: false }), {
      message: 'You left Pitch deck, Q4.',
      act: null,
    })
  })

  it('says another project’s opening ended it, with Rejoin (call-ends-on-open.md)', () => {
    assert.deepEqual(callEnded({ title: 'Pitch deck, Q4', note: null, here: false, opened: 'Research notes' }), {
      message: 'Your call in “Pitch deck, Q4” ended when you opened “Research notes”.',
      act: 'Rejoin',
    })
    // A project whose title this page hasn't read (a link to one never listed) is named as another one.
    assert.deepEqual(callEnded({ title: 'Pitch deck, Q4', note: null, here: false, opened: null }), {
      message: 'Your call in “Pitch deck, Q4” ended when you opened another project.',
      act: 'Rejoin',
    })
  })

  it('says the room’s own reason before the opening: that is what ended it', () => {
    assert.deepEqual(callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: false, opened: 'Research notes' }), {
      message: DROPPED,
      act: null,
    })
  })

  it('leaves it to the room on screen, and never says the personal space opened: only the person opens it', () => {
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: DROPPED, here: true }), null)
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: null, here: true }), null)
    assert.equal(callEnded({ title: 'Pitch deck, Q4', note: null, here: true, opened: 'Research notes' }), null)
  })
})
