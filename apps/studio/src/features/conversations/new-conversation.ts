// Starting a conversation as writing (docs/plans/conversations-start.md, C8): the question is what matters; the first
// message is optional and, left empty, is the question; the project's proposals waiting are offered to start from.
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationAsk } from '../../api/conversations.ts'

/** What A18's start sends: the words trimmed, an empty first message being the question itself. */
export function askOf(fields: ConversationAsk): ConversationAsk {
  const title = fields.title.trim()
  const text = fields.text.trim()
  return { title, text: text || title, askSophia: fields.askSophia }
}

/** A question is enough to start. */
export const startable = (fields: ConversationAsk): boolean => fields.title.trim() !== ''

/** How many of the proposals waiting are offered to start from. */
const STARTERS = 3

/**
 * The proposals waiting to start a conversation from, newest first, three at most: only those that fit a question
 * (`most` characters, A18's limit), leaving out the one already the question.
 */
export function startersOf(pending: readonly MissionDecision[] | undefined, question: string, most: number): string[] {
  const asked = question.trim()
  return (pending ?? [])
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((d) => d.statement)
    .filter((s) => s !== asked && s.length <= most)
    .slice(0, STARTERS)
}
