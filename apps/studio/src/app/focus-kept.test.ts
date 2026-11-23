import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextFocus, type Candidate } from './focus-kept.ts'

const control = (slot: string | null = null, unusable = false): Candidate => ({ slot, unusable, fallback: false })
const fallback: Candidate = { slot: null, unusable: false, fallback: true }

describe('where a lost focus goes (focus-kept.md)', () => {
  it('to the control in the same slot: Hold hands it to Resume, wherever Resume stands', () => {
    // Request review, then Resume and Stop once held: Resume shares Hold's slot.
    assert.equal(nextFocus([control('pause'), control()], { slot: 'pause', index: 1 }), 0)
    assert.equal(nextFocus([control(), control('pause'), control()], { slot: 'pause', index: 0 }), 1)
  })

  it('else to the control now at its place, or the last before it', () => {
    assert.equal(nextFocus([control(), control()], { slot: null, index: 1 }), 1)
    assert.equal(nextFocus([control(), control()], { slot: null, index: 5 }), 1)
    assert.equal(nextFocus([control('pause')], { slot: 'link', index: 0 }), 0)
  })

  it('never to a control that can’t take it; to the fallback only when no control is left', () => {
    assert.equal(nextFocus([control(null, true), fallback], { slot: null, index: 0 }), 1)
    assert.equal(nextFocus([fallback, control()], { slot: null, index: 0 }), 1)
    assert.equal(nextFocus([control(null, true)], { slot: null, index: 0 }), -1)
    assert.equal(nextFocus([], { slot: 'pause', index: 0 }), -1)
  })
})
