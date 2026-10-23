import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersonalNote } from '@sophia/contracts'
import { notesFile, notesFileName, orderNotes } from './notes-export.ts'

// Your notes, by date, and to a file (docs/plans/notes-order-export.md).
const note = (id: string, text: string, day: number, keptBy: PersonalNote['keptBy'] = 'person'): PersonalNote => ({
  id,
  text,
  keptBy,
  fromTurnId: null,
  createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
})
const notes = [note('b', 'Call Ana', 15), note('a', 'Book the room', 12, 'sophia'), note('c', 'Read the contract', 14)]

describe('notes by date', () => {
  it('sorts newest or oldest first', () => {
    assert.deepEqual(
      orderNotes(notes, 'newest').map((n) => n.id),
      ['b', 'c', 'a'],
    )
    assert.deepEqual(
      orderNotes(notes, 'oldest').map((n) => n.id),
      ['a', 'c', 'b'],
    )
  })

  it('writes a file of them, oldest first, with hers said, named by the day', () => {
    const now = new Date('2026-10-16T09:00:00.000Z')
    assert.equal(
      notesFile(notes, now),
      [
        '# Your notes with Sophia · 16 Oct 2026',
        '',
        '- Book the room · 12 Oct 2026 (from Sophia)',
        '- Read the contract · 14 Oct 2026',
        '- Call Ana · 15 Oct 2026',
        '',
      ].join('\n'),
    )
    assert.equal(notesFileName(now), 'sophia-notes-2026-10-16.md')
  })

  it('keeps one line a note when a note holds line breaks (Codex P2 on #394)', () => {
    const now = new Date('2026-10-16T09:00:00.000Z')
    const lines = notesFile([note('d', 'First line\n- not a note\r\nthird', 13)], now).split('\n')
    assert.deepEqual(
      lines.filter((l) => l.startsWith('- ')),
      ['- First line - not a note third · 13 Oct 2026'],
    )
  })
})
