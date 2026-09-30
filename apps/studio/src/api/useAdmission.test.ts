import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pressFor } from './useAdmission.ts'

describe('an admission', () => {
  it('sends only the open intent again after no reply, so a second press can never make a second record', () => {
    assert.equal(pressFor('unknown'), 'retry')
    for (const status of ['idle', 'sending', 'done', 'rejected'] as const) assert.equal(pressFor(status), 'submit')
  })
})
