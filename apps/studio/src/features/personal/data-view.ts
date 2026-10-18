// "Your data" (direction C): what the personal space keeps, counted, and everything as plain text to copy. Pure.
import type { PersonalExport, PersonalSpace } from '@sophia/contracts'
import { clock } from '../../app/time-words.ts'

export interface Facts {
  days: number
  notes: number
  carried: number
}

/** The days are the server's count over the whole conversation (a long one lists only its newest turns). */
export function factsOf(space: Pick<PersonalSpace, 'days' | 'notes' | 'releases'>): Facts {
  return { days: space.days, notes: space.notes.length, carried: space.releases.length }
}

export const factWords = (facts: Facts) => ({
  days: `day${facts.days === 1 ? '' : 's'} with Sophia`,
  notes: `note${facts.notes === 1 ? '' : 's'}`,
  carried: 'carried to work',
})

/** A day as a copy kept for later says it: in full, never in words relative to the day it was made (export-dates.md). */
const FULL_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

/**
 * Everything, readable: when it was made, the notes, what was carried and where, then the conversation by day, each
 * message after its time, with each note Sophia suggested and the person hasn't decided on yet (one kept is in the
 * notes; one let go is deleted). When it was made is the export's own time, the first page's, where the notes come
 * from too; never the device's clock, which may be off (Codex P2 on #405).
 */
export function exportText(everything: PersonalExport, who: string): string {
  const made = new Date(everything.exportedAt)
  const lines = [`${who} · personal space with Sophia`, `As of ${FULL_DAY.format(made)}, ${clock(made)}`, '', 'Notes:']
  lines.push(...everything.notes.map((n) => `- ${n.text}`))
  if (everything.releases.length > 0) {
    lines.push('', 'Carried to projects:')
    lines.push(...everything.releases.map((r) => `- ${r.text} (${r.projectTitle ?? 'a project you left'})`))
  }
  lines.push('', 'Conversation:')
  let day = ''
  for (const t of everything.turns) {
    const at = new Date(t.createdAt)
    const label = FULL_DAY.format(at)
    if (label !== day) lines.push('', label)
    day = label
    lines.push(`${clock(at)} ${t.author === 'person' ? 'You' : 'Sophia'}: ${t.text}`)
    if (t.suggestion?.state === 'open') lines.push(`  Suggested note, not kept: ${t.suggestion.text}`)
  }
  return lines.join('\n')
}

/** The typed confirmation for the one thing that can't be undone. */
export const confirmsErasure = (typed: string) => typed.trim().toLowerCase() === 'delete'

/** What the "Your data" sheet says. */
export const DATA = {
  copy: 'Copy everything as text',
  copying: 'Copying…',
  locked: 'Your personal space is locked.',
  unlock: 'Unlock to copy or delete',
  erase: 'Delete all personal data',
  eraseSays: 'Conversations and notes are removed for good. What you carried to projects stays there.',
  confirm: 'Type “delete” to confirm',
  erased: 'Your personal space is empty. Sophia starts fresh with you, and your projects are unchanged.',
} as const
