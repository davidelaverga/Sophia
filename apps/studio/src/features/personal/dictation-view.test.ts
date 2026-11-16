import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dictationTrouble } from './dictation-view.ts'

const BLOCKED = 'Sophia can’t hear you: the microphone is blocked for this site.'

describe('why dictation stopped', () => {
  it('says the microphone is blocked, whoever blocked it: the site or the browser’s service', () => {
    assert.equal(dictationTrouble('not-allowed'), BLOCKED)
    assert.equal(dictationTrouble('service-not-allowed'), BLOCKED)
  })

  it('says nothing was caught, and that it can be tried again', () => {
    assert.equal(dictationTrouble('no-speech'), 'Didn’t catch anything. Try again.')
  })

  it('says dictation needs a connection', () => {
    assert.equal(dictationTrouble('network'), 'Dictation needs a connection.')
  })

  it('says nothing for any other reason, its own abort included, as before', () => {
    for (const code of ['aborted', 'audio-capture', 'language-not-supported', 'bad-grammar', '', undefined, 7]) {
      assert.equal(dictationTrouble(code), null)
    }
  })
})
