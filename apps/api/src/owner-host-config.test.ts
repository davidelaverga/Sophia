import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownerHostEnrollmentFromEnv } from './owner-host-config.ts'
test('enrollment switch is exact, default off and never reflects invalid input', () => {
  assert.equal(ownerHostEnrollmentFromEnv(undefined), false)
  assert.equal(ownerHostEnrollmentFromEnv('off'), false)
  assert.equal(ownerHostEnrollmentFromEnv('on'), true)
  for (const value of ['', ' on', 'on ', 'ON', 'true', 'off\n', 'private-canary'])
    assert.throws(() => ownerHostEnrollmentFromEnv(value), {
      message: 'SOPHIA_OWNER_HOST_ENROLLMENT is on, off or unset',
    })
})
