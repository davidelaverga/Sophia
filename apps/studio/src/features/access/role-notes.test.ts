import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterSave, savedGone, savedNote, type RowNote } from './role-notes.ts'

const refusal: RowNote = { text: 'A project needs an admin: make another member an admin first' }
const checked: RowNote = { text: 'Saved. The reply was slow, so we checked.', polite: true }

describe('the members’ rows after a role change lands (focus-kept.md)', () => {
  it('says Saved on the row that changed, and clears a refusal left on another row', () => {
    const saved = savedNote()
    const notes = afterSave(new Map([['luis', refusal]]), 'ana', saved)
    assert.deepEqual([...notes], [['ana', saved]])
  })

  it('keeps another row’s status, and replaces this row’s refusal', () => {
    const saved = savedNote()
    const notes = afterSave(
      new Map([
        ['ana', refusal],
        ['marco', checked],
      ]),
      'ana',
      saved,
    )
    assert.deepEqual(
      [...notes],
      [
        ['marco', checked],
        ['ana', saved],
      ],
    )
  })

  it('lets a Saved go after its moment, never what was said since, nor a later Saved', () => {
    const first = savedNote()
    assert.equal(savedGone(afterSave(new Map(), 'ana', first), 'ana', first).size, 0)
    const since = new Map([['ana', refusal]])
    assert.equal(savedGone(since, 'ana', first), since)
    const later = afterSave(new Map(), 'ana', savedNote())
    assert.equal(savedGone(later, 'ana', first), later)
  })
})
