// Your notes, by date, and to a file (docs/plans/notes-order-export.md): newest or oldest first, and a Markdown file of
// them, oldest first, each with its day and hers said. Pure, so the order and the file are unit-tested.
import type { PersonalNote } from '@sophia/contracts'

export type NotesOrder = 'newest' | 'oldest'

/** The notes newest or oldest first; notes of one moment keep the order they came in. */
export function orderNotes(notes: readonly PersonalNote[], order: NotesOrder): PersonalNote[] {
  const sign = order === 'newest' ? -1 : 1
  return notes.toSorted((a, b) => sign * (Date.parse(a.createdAt) - Date.parse(b.createdAt)))
}

/** «16 Oct 2026», in the reader's own zone. */
const fullDay = (at: string | Date) =>
  new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const two = (n: number) => String(n).padStart(2, '0')

/** «sophia-notes-2026-10-16.md». */
export const notesFileName = (now: Date) =>
  `sophia-notes-${String(now.getFullYear())}-${two(now.getMonth() + 1)}-${two(now.getDate())}.md`

/** A note's words on one line: its line breaks folded to spaces, so a line of its own never reads as a note (Codex P2 on #394). */
const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ')

/** The file: a title, then a line a note, oldest first: «- words · 12 Oct 2026 (from Sophia)». */
export function notesFile(notes: readonly PersonalNote[], now: Date): string {
  const lines = orderNotes(notes, 'oldest').map(
    (n) => `- ${oneLine(n.text)} · ${fullDay(n.createdAt)}${n.keptBy === 'sophia' ? ' (from Sophia)' : ''}`,
  )
  return [`# Your notes with Sophia · ${fullDay(now)}`, '', ...lines, ''].join('\n')
}
