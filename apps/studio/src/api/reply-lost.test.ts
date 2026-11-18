import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from './client.ts'
import { replyLost } from './reply-lost.ts'

// A save whose reply never came may have landed; one the API refused did not (docs/plans/save-reply-lost.md).
describe('replyLost', () => {
  it('is a network failure, a timeout, no reply, a 5xx or an unreadable reply', () => {
    assert.equal(replyLost(new TypeError('Failed to fetch')), true)
    assert.equal(replyLost(new DOMException('signal is aborted without reason', 'AbortError')), true)
    assert.equal(replyLost(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'never')), true)
    assert.equal(replyLost(new ApiError(503, 'http_503', 'That didn’t go through. Try again.', 'never')), true)
    assert.equal(replyLost(new ApiError(200, 'contract_violation', 'Sophia’s reply couldn’t be read.', 'never')), true)
  })

  it('is never the API’s refusal', () => {
    assert.equal(replyLost(new ApiError(409, 'stale_revision', 'The goal’s target changed', 'never')), false)
    assert.equal(replyLost(new ApiError(409, 'invalid_state', 'A project needs an admin', 'never')), false)
    assert.equal(replyLost(new ApiError(403, 'forbidden', 'Only an admin changes roles', 'never')), false)
    assert.equal(replyLost(new ApiError(422, 'invalid_request', 'Unknown role', 'never')), false)
  })
})
