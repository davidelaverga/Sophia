// A message's words taken elsewhere (docs/plans/conversation-acts.md): to the clipboard, or quoted in the message
// being written. Pure, so the shapes are unit-tested.
import { clock, dayOf } from '../../app/time-words.ts'

interface Words {
  text: string
  at: string
}

/** The words for the clipboard: as written, then who said them and when on a line of their own. */
export const clipOf = (m: Words, who: string, now: number): string =>
  `${m.text}\n— ${who}, ${dayOf(m.at, now)} ${clock(m.at)}`

/** The words quoted in a message: each line after «> », then who said them. */
export const quoteOf = (m: Pick<Words, 'text'>, who: string): string =>
  `${m.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}\n— ${who}`

/** The draft with a quote under it: a blank line between, and one after, for the answer. */
export const withQuote = (draft: string, quote: string): string =>
  draft.trim() === '' ? `${quote}\n\n` : `${draft.replace(/\s+$/, '')}\n\n${quote}\n\n`
