import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { feedStep } from './feed-step.ts'

describe('reading again as the feed moves', () => {
  it('reads again when the cursor moves and nothing is being read', () => {
    assert.deepEqual(feedStep({ seen: '1', pending: false }, '2', false), { seen: '2', pending: false, refetch: true })
  })

  it('keeps a move made during a read pending, and reads again once that read settles', () => {
    const during = feedStep({ seen: '1', pending: false }, '2', true)
    assert.deepEqual(during, { seen: '2', pending: true, refetch: false })
    assert.deepEqual(feedStep(during, '2', true), { seen: '2', pending: true, refetch: false })
    assert.deepEqual(feedStep(during, '2', false), { seen: '2', pending: false, refetch: true })
  })

  it('does nothing when the cursor stays and nothing is pending', () => {
    assert.deepEqual(feedStep({ seen: '2', pending: false }, '2', false), { seen: '2', pending: false, refetch: false })
  })
})
