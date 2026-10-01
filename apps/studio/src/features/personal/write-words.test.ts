import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { movedOn, personalFailure, readsAgain, unsent } from './write-words.ts'

const refused = (code: string, status = 409) => new ApiError(status, code, 'database words', 'never')

describe('a refused personal write', () => {
  it('says the space moved on, and is read again, when another tab or a second press got there first', () => {
    for (const code of ['stale_revision', 'invalid_state', 'not_found']) {
      assert.equal(movedOn(refused(code)), true, code)
      assert.equal(readsAgain(refused(code)), true, code)
      assert.equal(personalFailure(refused(code)), 'That changed a moment ago. This is how it is now.')
    }
  })

  it('says a write the person erased since is gone for good, and reads the space again', () => {
    assert.equal(movedOn(refused('request_erased')), true)
    assert.equal(personalFailure(refused('request_erased')), 'Your personal space was erased. This is how it is now.')
  })

  it('reads the space again when no answer came back, and says so without promising anything was lost or kept', () => {
    const unknown = refused('outcome_unknown', 0)
    assert.equal(movedOn(unknown), false)
    assert.equal(readsAgain(unknown), true)
    assert.equal(personalFailure(unknown), 'No answer came back. This is how it is now.')
  })

  it('reads nothing again for any other failure, and never shows the database’s words', () => {
    for (const err of [refused('forbidden', 403), refused('invalid_request', 422), new Error('x')]) {
      assert.equal(readsAgain(err), false)
      assert.doesNotMatch(personalFailure(err), /database/)
    }
  })
})

describe('a message that didn’t go', () => {
  it('was erased with the space, may have gone (no answer came back), or was not sent', () => {
    assert.equal(unsent(refused('request_erased')), 'erased')
    assert.equal(unsent(refused('outcome_unknown', 0)), 'unconfirmed')
    assert.equal(unsent(refused('unavailable', 503)), 'unsent')
    assert.equal(unsent(new Error('x')), 'unsent')
  })
})

describe('a space that is full', () => {
  it('says which limit, and what makes room', () => {
    assert.equal(
      personalFailure(refused('notes_full')),
      'Your notes are full: 2000 is the most a space keeps. Forget one to keep another.',
    )
    assert.equal(
      personalFailure(refused('carried_full')),
      'You’ve carried 2000 notes, the most one person can. Take one back to carry another.',
    )
    assert.equal(movedOn(refused('notes_full')), false)
  })
})
