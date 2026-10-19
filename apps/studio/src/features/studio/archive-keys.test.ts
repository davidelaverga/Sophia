import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { archiveKeys } from './archive-keys.ts'

/** Keys k1, k2, … in the order asked for. */
const counter = () => {
  let n = 0
  return () => `k${String((n += 1))}`
}

const archive = { account: 'ana', projectId: 'p1', archived: true }
const bringBack = { ...archive, archived: false }

describe('archive keys (A30; Codex on #368)', () => {
  it('keeps one key per account, project and choice while unanswered', () => {
    const keys = archiveKeys(counter())
    assert.equal(keys.keyFor(archive), 'k1')
    assert.equal(keys.keyFor({ ...archive }), 'k1', 'the same choice, asked again from anywhere on the page')
    assert.equal(keys.keyFor(bringBack), 'k2', 'bringing it back is another write')
    assert.equal(keys.keyFor({ ...archive, projectId: 'p2' }), 'k3', 'another project')
    assert.equal(keys.keyFor({ ...archive, account: 'beto' }), 'k4', 'another account')
  })

  it('after no reply, or a reply that could not be read, the key stays', () => {
    const keys = archiveKeys(counter())
    const first = keys.keyFor(archive)
    keys.settled(archive, new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
    assert.equal(keys.keyFor(archive), first)
    keys.settled(archive, new TypeError('Failed to fetch'))
    assert.equal(keys.keyFor(archive), first)
  })

  it('answered, landed or refused, the key goes: the next press is a new write', () => {
    const keys = archiveKeys(counter())
    const first = keys.keyFor(archive)
    keys.settled(archive)
    const second = keys.keyFor(archive)
    assert.notEqual(second, first, 'landed: not answered with the first receipt')
    keys.settled(archive, new ApiError(403, 'forbidden', 'Only an admin can archive the project', 'never'))
    assert.notEqual(keys.keyFor(archive), second, 'refused')
  })

  it('settling one choice leaves the other’s key', () => {
    const keys = archiveKeys(counter())
    const back = keys.keyFor(bringBack)
    keys.keyFor(archive)
    keys.settled(archive)
    assert.equal(keys.keyFor(bringBack), back)
  })
})
