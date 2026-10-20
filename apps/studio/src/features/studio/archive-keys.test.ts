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

  it('a refusal or no reply leaves the other choice’s key', () => {
    const keys = archiveKeys(counter())
    const back = keys.keyFor(bringBack)
    keys.keyFor(archive)
    keys.settled(archive, new ApiError(403, 'forbidden', 'Only an admin can archive the project', 'never'))
    assert.equal(keys.keyFor(bringBack), back, 'refused: the project is as it was')
    keys.settled(archive, new TypeError('Failed to fetch'))
    assert.equal(keys.keyFor(bringBack), back, 'no reply')
  })

  it('one choice landing lets go of the other’s unanswered key, so pressing it later is a new write', () => {
    const keys = archiveKeys(counter())
    const first = keys.keyFor(archive)
    keys.settled(archive, new TypeError('Failed to fetch'))
    keys.keyFor(bringBack)
    keys.settled(bringBack)
    assert.notEqual(keys.keyFor(archive), first, 'archived again, not answered with the lost archive’s receipt')
    const back = keys.keyFor(bringBack)
    keys.settled(bringBack, new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
    keys.settled(archive)
    assert.notEqual(keys.keyFor(bringBack), back, 'the mirror: brought back again under a new key')
  })

  it('a read of the archived list started after no reply lets go of that key, whatever it shows (Codex on #471)', () => {
    const keys = archiveKeys(counter())
    const lost = keys.keyFor(archive)
    keys.settled(archive, new TypeError('Failed to fetch'))
    // Landed, then brought back by another admin, with or without a read between: the old key would get its receipt.
    keys.reading('ana')()
    assert.notEqual(keys.keyFor(archive), lost, 'archived again, not answered with the lost archive’s receipt')
    const back = keys.keyFor(bringBack)
    keys.settled(bringBack, new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
    keys.reading('ana')()
    assert.notEqual(keys.keyFor(bringBack), back, 'the mirror: brought back again under a new key')
  })

  it('a read started before no reply, or while the key was on its way again, leaves it', () => {
    const keys = archiveKeys(counter())
    const lost = keys.keyFor(archive)
    const before = keys.reading('ana')
    keys.settled(archive, new TypeError('Failed to fetch'))
    before()
    assert.equal(keys.keyFor(archive), lost, 'started before the reply was lost: it says nothing of the write')
    // keyFor sent it again: on its way, only its own answer settles it.
    const during = keys.reading('ana')
    during()
    keys.settled(archive, new TypeError('Failed to fetch'))
    assert.equal(keys.keyFor(archive), lost, 'read while on its way again')
  })

  it('another account’s read leaves the key', () => {
    const keys = archiveKeys(counter())
    const lost = keys.keyFor(archive)
    keys.settled(archive, new TypeError('Failed to fetch'))
    keys.reading('beto')()
    assert.equal(keys.keyFor(archive), lost)
  })
})
