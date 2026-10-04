// Arriving in Personal (docs/plans/personal-twenty.md): the day's answers under her first line of a new day (the
// session to get ready for with her is readyFor, places-view.ts). Each is a way to start: a press sends its words, as
// the field's would. Pure, so the conversation and its checks read the same answers.
import type { PersonalTurn } from '@sophia/contracts'

/** A way in: what the row says, a quiet note beside it, and the words a press sends. */
export interface Way {
  label: string
  note: string | null
  words: string
}

/** How you arrive today, in a word: sent as a sentence. */
export const ARRIVALS: readonly Way[] = [
  { label: 'Light today', note: null, words: 'Light today.' },
  { label: 'Steady', note: null, words: 'Steady today.' },
  { label: 'Heavy today', note: null, words: 'Heavy today.' },
]

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const today = (iso: string, now: Date) => startOfDay(new Date(iso)) === startOfDay(now)

/**
 * The day's answers are due: her greeting is the last line (her line of a new day, not a reply), and you haven't said
 * anything today yet, nor is a message of yours on its way. A greeting from an earlier day nobody answered counts too:
 * the server greets once after a quiet spell, so without it a day could go by without them.
 */
export function arriving(turns: readonly PersonalTurn[], now: Date, sending: boolean): boolean {
  const last = turns.at(-1)
  if (sending || last?.author !== 'sophia' || last.replyTo !== null) return false
  return !turns.some((t) => t.author === 'person' && today(t.createdAt, now))
}
