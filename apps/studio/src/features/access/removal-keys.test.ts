import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { removalKeys } from './removal-keys.ts'

/** Keys k1, k2, … in the order asked for. */
const counter = () => {
  let n = 0
  return () => `k${String((n += 1))}`
}

describe('member removal keys (A29; Codex on #385)', () => {
  it('keeps the same key across retries of an unsettled removal', () => {
    const keys = removalKeys(counter())
    assert.equal(keys.keyFor('ana'), 'k1')
    assert.equal(keys.keyFor('ana'), 'k1', 'a retry after an unknown outcome is the same removal')
    assert.equal(keys.keyFor('beto'), 'k2', 'another member, another removal')
  })

  it('remove, rejoin, remove: a confirmed removal retires its key, so the next removal is new', () => {
    const keys = removalKeys(counter())
    const first = keys.keyFor('ana')
    keys.confirmed('ana')
    const second = keys.keyFor('ana')
    assert.notEqual(second, first, 'not answered with the first removal’s receipt')
    assert.equal(keys.keyFor('ana'), second)
  })
})
