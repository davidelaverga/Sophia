import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownerRunnerResultsFromEnv } from './runner-results-config.ts'

test('result switch is exact and never reflects invalid input', () => {
  assert.equal(ownerRunnerResultsFromEnv(undefined), false)
  assert.equal(ownerRunnerResultsFromEnv('off'), false)
  assert.equal(ownerRunnerResultsFromEnv('on'), true)
  for (const value of ['', ' on', 'on ', 'ON', 'true', 'off\n', 'private-body-canary'])
    assert.throws(() => ownerRunnerResultsFromEnv(value), {
      message: 'SOPHIA_OWNER_RUNNER_RESULTS is on, off or unset',
    })
})
