import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { movedOn, personalFailure } from './write-words.ts'

const refused = (code: string, status = 409) => new ApiError(status, code, 'database words', 'never')

describe('a refused personal write', () => {
  it('says the space moved on, and is read again, when another tab or a second press got there first', () => {
    for (const code of ['stale_revision', 'invalid_state']) {
      assert.equal(movedOn(refused(code)), true, code)
      assert.equal(personalFailure(refused(code)), 'That changed a moment ago. This is how it is now.')
    }
  })

  it('reads nothing again for any other failure, and never shows the database’s words', () => {
    for (const err of [refused('forbidden', 403), refused('outcome_unknown', 0), new Error('x')]) {
      assert.equal(movedOn(err), false)
      assert.doesNotMatch(personalFailure(err), /database/)
    }
  })
})
