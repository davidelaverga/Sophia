import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setSignedIn, stillSignedIn } from './signed-in.ts'

describe('stillSignedIn', () => {
  it('is the account signed in now: not after leaving, not after another signs in', () => {
    setSignedIn('luis@sophia.test')
    assert.equal(stillSignedIn('luis@sophia.test'), true)
    setSignedIn('davide@sophia.test')
    assert.equal(stillSignedIn('luis@sophia.test'), false)
    setSignedIn(null)
    assert.equal(stillSignedIn('davide@sophia.test'), false)
  })
})
