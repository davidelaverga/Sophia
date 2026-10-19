import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { oneCall } from './one-call.ts'

interface Call {
  projectId: string
}

const call = (projectId: string): Call => ({ projectId })

describe('one call at a time', () => {
  it('ends nobody’s call when a project without one reports', () => {
    const one = oneCall<Call>()
    one.report('pitch', call('pitch'))
    assert.equal(one.report('notes', null), null)
  })

  it('leaves the call before when one starts in another project, and says no end for it', () => {
    const one = oneCall<Call>()
    const pitch = call('pitch')
    one.report('pitch', pitch)
    assert.deepEqual(one.report('notes', call('notes')), { leave: pitch, ended: null })
  })
})

describe('the opening that ended a call (call-ends-on-open.md)', () => {
  it('is read by that call’s end, once: the next end of a call there is a Leave', () => {
    const one = oneCall<Call>()
    const pitch = call('pitch')
    one.report('pitch', pitch)
    assert.equal(one.leaving(pitch, 'notes'), true)
    assert.deepEqual(one.report('pitch', null), { leave: null, ended: { call: pitch, opened: 'notes' } })
    const back = call('pitch')
    one.report('pitch', back)
    assert.deepEqual(one.report('pitch', null)?.ended, { call: back, opened: null })
  })

  it('outlives what the call reports while it ends (who speaks, a device): the end still says the opening', () => {
    const one = oneCall<Call>()
    const pitch = call('pitch')
    one.report('pitch', pitch)
    one.leaving(pitch, 'notes')
    const ending = call('pitch')
    assert.deepEqual(one.report('pitch', ending), { leave: null, ended: null })
    assert.deepEqual(one.report('pitch', null)?.ended, { call: ending, opened: 'notes' })
  })

  it('is forgotten by another call’s end, never read by it', () => {
    const one = oneCall<Call>()
    const pitch = call('pitch')
    const notes = call('notes')
    one.report('pitch', pitch)
    one.leaving(pitch, 'notes')
    one.report('notes', notes)
    assert.deepEqual(one.report('notes', null)?.ended, { call: notes, opened: null })
    const back = call('pitch')
    one.report('pitch', back)
    assert.deepEqual(one.report('pitch', null)?.ended, { call: back, opened: null })
  })

  it('is kept only while that call runs: asked again after its end, nothing is left and nothing kept', () => {
    const one = oneCall<Call>()
    const pitch = call('pitch')
    one.report('pitch', pitch)
    one.leaving(pitch, 'notes')
    one.report('pitch', null)
    // A render still holding the ended call asks once more (SignedIn's useOneCallInSight).
    assert.equal(one.leaving(pitch, 'notes'), false)
    const back = call('pitch')
    one.report('pitch', back)
    assert.deepEqual(one.report('pitch', null)?.ended, { call: back, opened: null })
  })

  it('is never a later call’s: a call that begins takes no cause kept from before it', () => {
    const one = oneCall<Call>()
    const pitch = call('pitch')
    one.report('pitch', pitch)
    one.leaving(pitch, 'notes')
    // Left for a call in another project instead, its end is never reported.
    one.report('notes', call('notes'))
    const back = call('pitch')
    one.report('pitch', back)
    assert.deepEqual(one.report('pitch', null)?.ended, { call: back, opened: null })
  })
})
