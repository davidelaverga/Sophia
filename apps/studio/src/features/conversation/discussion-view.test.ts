import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OFFLINE_UNSENT, OFFLINE_WAITS } from '../personal/online.ts'
import { OFFLINE_END, OFFLINE_JOIN } from '../voice/call-end.ts'
import { barTarget, defaultTarget, offlineBarWords, TARGET_WORDS, targetsOf } from './discussion-view.ts'

describe('who the message bar writes to', () => {
  it('offers the room always, and Sophia too while the person can talk to her now', () => {
    assert.deepEqual(targetsOf(false), ['room'])
    assert.deepEqual(targetsOf(true), ['sophia', 'room'])
  })

  it('starts an empty bar on Sophia when she is ready, as the bar did before; on the room otherwise', () => {
    assert.equal(defaultTarget(true), 'sophia')
    assert.equal(defaultTarget(false), 'room')
    assert.deepEqual(barTarget(null, true), { target: 'sophia', other: 'room', held: false })
    assert.deepEqual(barTarget(null, false), { target: 'room', other: null, held: false })
  })

  it('keeps the target a message was begun for: a message to the room stays the room’s when Sophia is ready', () => {
    assert.deepEqual(barTarget('room', true), { target: 'room', other: 'sophia', held: false })
  })

  it('holds a message begun for Sophia while she can’t take it: never moved to the room on its own', () => {
    assert.deepEqual(barTarget('sophia', false), { target: 'sophia', other: 'room', held: true })
  })

  it('says who the message goes to', () => {
    assert.equal(TARGET_WORDS.room.placeholder, 'Message the room…')
    assert.equal(TARGET_WORDS.sophia.label, 'To Sophia')
  })
})

describe('what the bar’s line says of the room’s message offline, beside the room’s note (seam #8)', () => {
  const held = { going: false, held: 'Once only.', written: true }
  const notConfirmed = 'Not confirmed: “Once only.”'
  const heldWords =
    'You’re offline, so “Once only.” isn’t confirmed. Send it again once you’re back; it won’t be written twice.'
  const written = { going: false, held: null, written: true }
  const empty = { going: false, held: null, written: false }

  it('with no offline note from the room, says what waits in place of what it said', () => {
    assert.equal(offlineBarWords(held, notConfirmed, null), heldWords)
    assert.equal(offlineBarWords(written, null, null), OFFLINE_UNSENT)
    assert.equal(offlineBarWords(empty, 'Refused.', null), OFFLINE_WAITS)
  })

  it('after a Join pressed offline from rest, a held message keeps the words Luis chose, and words written theirs', () => {
    assert.equal(offlineBarWords(held, notConfirmed, OFFLINE_JOIN), heldWords)
    assert.equal(offlineBarWords(written, null, OFFLINE_JOIN), OFFLINE_UNSENT)
  })

  it('after a Join pressed offline from rest, an empty bar adds nothing: the room’s line already says offline', () => {
    assert.equal(offlineBarWords(empty, null, OFFLINE_JOIN), null)
    assert.equal(offlineBarWords(empty, 'Refused.', OFFLINE_JOIN), null)
  })

  it('under the lost call’s line, as #467 has it: a held message says only that it isn’t confirmed, nothing else', () => {
    assert.equal(offlineBarWords(held, notConfirmed, OFFLINE_END), notConfirmed)
    assert.equal(offlineBarWords(written, null, OFFLINE_END), null)
    assert.equal(offlineBarWords(empty, null, OFFLINE_END), null)
  })

  it('says nothing of a message on its way: how it ends is said when it does', () => {
    assert.equal(offlineBarWords({ going: true, held: null, written: true }, null, OFFLINE_JOIN), null)
    assert.equal(offlineBarWords({ going: true, held: null, written: true }, null, null), null)
  })
})
