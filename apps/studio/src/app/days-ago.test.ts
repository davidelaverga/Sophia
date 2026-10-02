import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openedLabel } from './days-ago.ts'

describe('openedLabel', () => {
  it('says when, in days', () => {
    const now = new Date(2026, 8, 25, 10).getTime()
    assert.equal(openedLabel(new Date(2026, 8, 25, 1).getTime(), now), 'Today')
    assert.equal(openedLabel(new Date(2026, 8, 24, 23).getTime(), now), 'Yesterday')
    assert.equal(openedLabel(new Date(2026, 8, 21, 12).getTime(), now), '4 days ago')
    assert.notEqual(openedLabel(new Date(2026, 7, 1).getTime(), now), '55 days ago')
  })
})
