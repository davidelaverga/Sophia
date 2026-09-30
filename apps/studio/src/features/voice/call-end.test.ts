import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CALL_END } from './call-end.ts'

describe('why a call ended', () => {
  it('only a lost connection is a failure: the others were on purpose, here or elsewhere', () => {
    const failures = Object.entries(CALL_END)
      .filter(([, end]) => end.failed)
      .map(([why]) => why)
    assert.deepEqual(failures, ['dropped'])
  })

  it('says where the call went when the same person joined from another tab', () => {
    assert.equal(CALL_END.elsewhere.note, 'You joined from another tab or device, so this one left the call.')
  })

  it('gives every ending its own sentence', () => {
    const notes = Object.values(CALL_END).map((end) => end.note)
    assert.equal(new Set(notes).size, notes.length)
    for (const note of notes) assert.match(note, /^[A-Z].*\.$/)
  })
})
