import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apiContributionsFromEnv } from './api-contribution-config.ts'

describe('stock API contribution exposure configuration', () => {
  it('keeps unset and explicit off disabled', () => {
    assert.equal(apiContributionsFromEnv(undefined), false)
    assert.equal(apiContributionsFromEnv('off'), false)
  })

  it('enables only explicit on', () => {
    assert.equal(apiContributionsFromEnv('on'), true)
  })

  it('rejects every other spelling without echoing configuration content', () => {
    for (const value of ['', ' ', 'ON', 'true', '1', 'admit', ' on ', 'off\r', 'invalid-private-value']) {
      assert.throws(() => apiContributionsFromEnv(value), {
        message: 'SOPHIA_API_CONTRIBUTIONS is on, off or unset',
      })
    }
  })
})
