// Starting a conversation as writing (docs/plans/conversations-start.md, C8): the question is what matters; the first
// message is optional and, left empty, is the question; the project's proposals waiting are offered to start from.
import type { MissionDecision } from '@sophia/contracts'
import type { ConversationAsk } from '../../api/vision.ts'

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

/** The proposals waiting to start a conversation from, three at most, leaving out the one already the question. */
export function startersOf(pending: readonly MissionDecision[] | undefined, question: string): string[] {
  const asked = question.trim()
  return (pending ?? [])
    .map((d) => d.statement)
    .filter((s) => s !== asked)
    .slice(0, STARTERS)
}
