import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rehearsalReply } from './companion-rehearsal.ts'

describe('rehearsalReply', () => {
  it('answers by the words it recognises, and suggests a note only where the script has one', () => {
    const pitch = rehearsalReply('I have a pitch on Friday and I can’t sleep')
    assert.match(pitch.text, /least ready/)
    assert.equal(pitch.suggestion, 'Preparing a pitch for Friday')
    assert.equal(rehearsalReply('Just talk').suggestion, null)
  })

  it('always answers, the same way for the same message, and never suggests past 90 characters', () => {
    const odd = rehearsalReply('zzz')
    assert.ok(odd.text.length > 0)
    assert.deepEqual(rehearsalReply('zzz'), odd)
    for (const text of ['pitch', 'sleep', 'sister', 'nervous', 'story']) {
      assert.ok((rehearsalReply(text).suggestion ?? '').length <= 90)
    }
  })
})
