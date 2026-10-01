// "Your data" (direction C): what the personal space keeps, counted, and everything as plain text to copy. Pure.
import type { PersonalExport, PersonalSpace } from '@sophia/contracts'
import { dayLabel } from './conversation-view.ts'

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

/**
 * Everything, readable: the notes, what was carried and where, then the conversation by day, with each note Sophia
 * suggested and the person hasn't decided on yet (one kept is in the notes; one let go is deleted).
 */
export function exportText(everything: PersonalExport, who: string, now: Date): string {
  const lines = [`${who} · personal space with Sophia`, '', 'Notes:', ...everything.notes.map((n) => `- ${n.text}`)]
  if (everything.releases.length > 0) {
    lines.push('', 'Carried to projects:')
    lines.push(...everything.releases.map((r) => `- ${r.text} (${r.projectTitle ?? 'a project you left'})`))
  }
  lines.push('', 'Conversation:')
  let day = ''
  for (const t of everything.turns) {
    const label = dayLabel(new Date(t.createdAt), now)
    if (label !== day) lines.push('', label)
    day = label
    lines.push(`${t.author === 'person' ? 'You' : 'Sophia'}: ${t.text}`)
    if (t.suggestion?.state === 'open') lines.push(`  Suggested note, not kept: ${t.suggestion.text}`)
  }
  return lines.join('\n')
}

/** The typed confirmation for the one thing that can't be undone. */
export const confirmsErasure = (typed: string) => typed.trim().toLowerCase() === 'delete'

/** What the "Your data" sheet says. */
export const DATA = {
  copy: 'Copy everything as text',
  locked: 'Your personal space is locked.',
  unlock: 'Unlock to copy or delete',
  erase: 'Delete all personal data',
  eraseSays: 'Conversations and notes are removed for good. What you carried to projects stays there.',
  confirm: 'Type “delete” to confirm',
  erased: 'Your personal space is empty. Sophia starts fresh with you, and your projects are unchanged.',
} as const
