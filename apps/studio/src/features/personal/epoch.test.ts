import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { epochNow } from './epoch.ts'

describe('the epoch a personal write is made against', () => {
  it('is the newer of the space and the Work list as read, and 0 with neither', () => {
    assert.equal(epochNow(undefined, undefined), 0)
    assert.equal(epochNow({ epoch: 2 }, undefined), 2)
    assert.equal(epochNow(undefined, { personalEpoch: 3 }), 3, 'while the space is locked, Work knows it')
    assert.equal(epochNow({ epoch: 1 }, { personalEpoch: 2 }), 2, 'Work read after an erasure the space has not seen')
    assert.equal(epochNow({ epoch: 4 }, { personalEpoch: 3 }), 4)
  })
})
