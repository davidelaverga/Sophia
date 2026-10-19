import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BACK_ONLINE, CALL_END, keepsTextMode, keptNote, noteFor, noteRole, OFFLINE_END } from './call-end.ts'

describe('why a call ended', () => {
  it('only a lost connection is a failure: the others were on purpose, here or elsewhere', () => {
    const failures = Object.entries(CALL_END)
      .filter(([, end]) => end.failed)
      .map(([why]) => why)
    assert.deepEqual(failures, ['dropped'])
  })

  it('says where the call went when the same person joined from another tab', () => {
    assert.equal(CALL_END.elsewhere.note, 'You joined from another tab or device, so this one left the call.')
  })

  it('gives every ending its own sentence', () => {
    const notes = Object.values(CALL_END).map((end) => end.note)
    assert.equal(new Set(notes).size, notes.length)
    for (const note of notes) assert.match(note, /^[A-Z].*\.$/)
  })

  it('keeps text mode past a lost connection only: any other end leaves the next join to the microphone choice', () => {
    assert.equal(keepsTextMode('dropped'), true, 'trying again keeps a microphone that was off, off')
    for (const why of ['elsewhere', 'removed', 'closed'] as const) assert.equal(keepsTextMode(why), false, why)
    assert.equal(keepsTextMode(null), false, 'leaving on purpose')
  })
})

describe('a call lost offline (costuras seam #8)', () => {
  const lost = CALL_END.dropped.note

  it('says offline while the browser is, in Personal’s voice', () => {
    assert.equal(noteFor(lost, false), 'You’re offline, so the call ended here. Join again once you’re back.')
    assert.equal(noteFor(OFFLINE_END, false), OFFLINE_END, 'and keeps saying it')
  })

  it('back online, says that Try again rejoins', () => {
    assert.equal(noteFor(OFFLINE_END, true), 'You’re back online. Try again rejoins the call.')
    assert.equal(BACK_ONLINE, 'You’re back online. Try again rejoins the call.')
  })

  it('online, a lost call keeps its own words: a true proves nothing', () => {
    assert.equal(noteFor(lost, true), lost)
  })

  it('leaves every other note as it is, offline too: another end, a join refused, no note', () => {
    const others = [
      CALL_END.elsewhere.note,
      CALL_END.removed.note,
      CALL_END.closed.note,
      'The room isn’t available right now. Try again in a moment.',
      'You aren’t a member of this project.',
    ]
    for (const note of others) {
      assert.equal(noteFor(note, false), note, note)
      assert.equal(noteFor(note, true), note, note)
    }
    assert.equal(noteFor(null, false), null)
    assert.equal(noteFor(null, true), null)
  })

  it('says the two offline notes politely; the others stay alerts', () => {
    assert.equal(noteRole(OFFLINE_END), 'status')
    assert.equal(noteRole(BACK_ONLINE), 'status')
    assert.equal(noteRole(lost), 'alert')
    assert.equal(noteRole('The room isn’t available right now. Try again in a moment.'), 'alert')
  })
})

describe('what the room keeps when it says something, offline (review of costuras seam #8)', () => {
  const lost = CALL_END.dropped.note
  const down = 'The room isn’t available right now. Try again in a moment.'
  const unreached = 'Couldn’t connect to the room. Check your connection and try again.'

  it('offline, a join after a lost call that fails keeps the offline note: it never says the room isn’t there', () => {
    assert.equal(keptNote(down, { online: false, lost: true }), OFFLINE_END)
    assert.equal(keptNote(unreached, { online: false, lost: true }), OFFLINE_END)
  })

  it('offline, the call lost says so', () => {
    assert.equal(keptNote(lost, { online: false, lost: true }), OFFLINE_END)
  })

  it('online, every note is kept as said: a true proves nothing', () => {
    for (const note of [lost, down, unreached]) assert.equal(keptNote(note, { online: true, lost: true }), note, note)
  })

  it('offline with no call lost (a Join from rest), the note is kept as said', () => {
    assert.equal(keptNote(down, { online: false, lost: false }), down)
  })

  it('a join that begins says nothing yet', () => {
    assert.equal(keptNote(null, { online: false, lost: true }), null)
    assert.equal(keptNote(null, { online: true, lost: false }), null)
  })
})
