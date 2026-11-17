import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dictationTrouble } from './dictation-view.ts'

const BLOCKED = 'Sophia can’t hear you: the microphone is blocked for this site.'

describe('why dictation stopped', () => {
  it('says the microphone is blocked for this site', () => {
    assert.equal(dictationTrouble('not-allowed'), BLOCKED)
  })

  it('says nothing was caught, and that it can be tried again', () => {
    assert.equal(dictationTrouble('no-speech'), 'Didn’t catch anything. Try again.')
  })

  it('says the microphone isn’t available', () => {
    assert.equal(dictationTrouble('audio-capture'), 'Sophia can’t hear you: the microphone isn’t available.')
  })

  it('says nothing for any other reason, its own abort included, as before', () => {
    // `service-not-allowed` is the browser refusing its speech service, not this site's microphone; `network` can't
    // stop recognition on the device (Luis, 2026-11-16).
    for (const code of [
      'aborted',
      'service-not-allowed',
      'network',
      'language-not-supported',
      'bad-grammar',
      '',
      undefined,
      7,
    ]) {
      assert.equal(dictationTrouble(code), null)
    }
  })
})
