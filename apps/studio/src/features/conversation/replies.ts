// Replies in the room's chat (docs/plans/room-chat-replies.md): the words a reply quotes of the message it answers.
import { segmenter } from '../artifacts/cite-view.ts'

/** How many characters a quote keeps before «…». */
export const QUOTE_MAX = 48

/** The first words of a message, cut between characters as a person sees them (never inside an emoji), with «…». */
export function quoteOf(text: string, max = QUOTE_MAX): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  const seg = segmenter()
  const parts = seg ? Array.from(seg.segment(flat), (s) => s.segment) : Array.from(flat)
  if (parts.length <= max) return flat
  return `${parts
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`
}
