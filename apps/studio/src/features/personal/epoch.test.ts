import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { epochNow, erasedElsewhere } from './epoch.ts'

describe('the epoch a personal write is made against', () => {
  it('is the space’s when it is shown, else the Work list’s, and 0 with neither', () => {
    assert.equal(epochNow(undefined, undefined), 0)
    assert.equal(epochNow({ epoch: 2 }, undefined), 2)
    assert.equal(epochNow(undefined, { personalEpoch: 3 }), 3, 'while the space is locked, Work knows it')
    assert.equal(
      epochNow({ epoch: 1 }, { personalEpoch: 2 }),
      1,
      'what a space shown from before an erasure writes is refused, though Work already names the newer epoch',
    )
    assert.equal(epochNow({ epoch: 4 }, { personalEpoch: 3 }), 4)
  })
})

describe('an erasure on another device', () => {
  it('is seen once the Work list names a newer epoch than the space shown', () => {
    assert.equal(erasedElsewhere({ epoch: 1 }, { personalEpoch: 2 }), true)
    assert.equal(erasedElsewhere({ epoch: 2 }, { personalEpoch: 2 }), false)
    assert.equal(erasedElsewhere({ epoch: 3 }, { personalEpoch: 2 }), false, 'the space read since')
    assert.equal(erasedElsewhere(undefined, { personalEpoch: 2 }), false, 'nothing shown, nothing to read again')
    assert.equal(erasedElsewhere({ epoch: 1 }, undefined), false)
  })
})
