// A passage of the open report, asked about or kept (docs/plans/room-passage.md): the member's own selection, never
// paraphrased, with where it came from. Pure, so the words are unit-tested and React only renders them.
import type { MissionWithdrawalPreview } from '@sophia/contracts'

/** Past this, a passage is cut at a word: both texts stay well inside the API's 2,000 characters. */
export const PASSAGE_MAX = 800
/** The chat's limit on one message: the composer's, and the room's, which drops a longer one. */
export const MESSAGE_MAX = 2000

/** The report and version a passage came from. */
export interface PassageSource {
  title: string
  version: number
}

/** Text cut at a word past `max` characters, with an ellipsis: at most `max + 1`. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const word = head.lastIndexOf(' ')
  return `${(word > 0 ? head.slice(0, word) : head).trimEnd()}…`
}

/** The selection made one line; null when it holds no letter or digit, so there is nothing to ask about or keep. */
export function passageText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  return /[\p{L}\p{N}]/u.test(text) ? cut(text, PASSAGE_MAX) : null
}

const sourceText = (source: PassageSource) => `${source.title}, v${String(source.version)}`

/**
 * The chat's message: the quote and its source first, then whatever the member had written; the question goes after.
 * It stays inside the chat's limit, the quote cut shorter when it must; a message already full is left as it is.
 */
export function askDraft(passage: string, source: PassageSource, draft: string): string {
  const tail = `” (${sourceText(source)})\n${draft}`
  const room = MESSAGE_MAX - tail.length - 2 // the opening quote, and an ellipsis
  return room < 1 ? draft : `“${cut(passage, room)}${tail}`
}

/** The brief's note: the quote, with where it came from. */
export const keptText = (passage: string, source: PassageSource): string => `“${passage}” — ${sourceText(source)}`

/** Undo forgets the note only when nothing but the note itself would go; otherwise the brief is where to decide. */
export const undoable = (preview: MissionWithdrawalPreview): boolean =>
  preview.decisions.length === 0 && preview.entries.every((entry) => entry.id === preview.entryId)

/** A write's moment, as useAdmission holds it. */
export type Step = 'idle' | 'sending' | 'done' | 'unknown' | 'rejected'
/** Undo's preview: not asked, being read, refused because something was built on the note, or unreadable. */
export type Check = 'none' | 'checking' | 'built' | 'unreadable'

export interface KeptLine {
  words: string
  error: boolean
  /** The line's one control: the note's write again, Undo, or the withdrawal again. */
  action: 'retry' | 'undo' | 'retry-undo' | null
  /** A write is open: another Keep would race it, so none is offered. */
  busy: boolean
  /** Said and done: the line may go after a few seconds. */
  settled: boolean
}

const line = (words: string, over: Partial<KeptLine> = {}): KeptLine => ({
  words,
  error: false,
  action: null,
  busy: false,
  settled: false,
  ...over,
})

interface Moment {
  keep: Step
  check: Check
  withdraw: Step
}

/** The kept line's words by moment, the withdrawal's first: the first that holds is said. */
const SAID: readonly (readonly [(m: Moment) => boolean, KeptLine])[] = [
  [(m) => m.withdraw === 'sending' || m.check === 'checking', line('Taking it out…', { busy: true })],
  [(m) => m.withdraw === 'done', line('Taken out of the brief.', { settled: true })],
  [(m) => m.withdraw === 'unknown', line('Not confirmed it was taken out.', { action: 'retry-undo', busy: true })],
  [(m) => m.withdraw === 'rejected', line('Couldn’t take it out: forget it from the brief.', { error: true })],
  [(m) => m.check === 'built', line('Something was built on it already: forget it from the brief.', { settled: true })],
  [
    (m) => m.check === 'unreadable',
    line('Couldn’t check what goes with it: forget it from the brief.', { error: true, action: 'undo' }),
  ],
  [(m) => m.keep === 'sending', line('Keeping it…', { busy: true })],
  [(m) => m.keep === 'unknown', line('Not confirmed it was kept.', { action: 'retry', busy: true })],
  [(m) => m.keep === 'rejected', line('Couldn’t keep it.', { error: true })],
  [(m) => m.keep === 'done', line('Kept in the brief.', { action: 'undo', settled: true })],
]

/** What the kept line says, from Keep's write, Undo's preview and its withdrawal. */
export const keptLine = (keep: Step, check: Check, withdraw: Step): KeptLine =>
  SAID.find(([holds]) => holds({ keep, check, withdraw }))?.[1] ?? line('')
