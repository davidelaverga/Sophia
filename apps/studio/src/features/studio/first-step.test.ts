import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIRST_LINE, isNew } from './first-step.ts'

describe('a new project’s first step (docs/plans/first-step.md)', () => {
  it('is new only with nothing recorded, no goal and nobody in the call', () => {
    assert.equal(isNew({ ledger: 'empty', goals: 0, inCall: false }), true)
    assert.equal(isNew({ ledger: 'present', goals: 0, inCall: false }), false)
    assert.equal(isNew({ ledger: 'empty', goals: 1, inCall: false }), false)
    assert.equal(isNew({ ledger: 'empty', goals: 0, inCall: true }), false)
  })

  it('is not new while the ledger is unread', () => {
    assert.equal(isNew({ ledger: undefined, goals: 0, inCall: false }), false)
  })

  it('says what to do first', () => {
    assert.deepEqual(FIRST_LINE, { text: 'A new project', note: 'Start by telling Sophia what it’s for.' })
  })
})
