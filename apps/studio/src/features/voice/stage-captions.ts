// Captions on the stage (docs/plans/room-stage-captions.md): what is said aloud, where the room can see it while Chat
// is closed, as Meet shows it. Pure, so the rules are unit-tested: which captions, in what order, named how, how much
// of each, and what comes back once they went.
import { captionText, type CaptionTurn } from '../conversation/captions.ts'

/** How long the stage keeps the captions after anything was last said (a word, or an end), in milliseconds. */
export const CAPTION_HOLD_MS = 6000

/** As many characters as a caption shows on the stage: a longer one shows its end, where the words are now. */
const MOST = 110

export interface StageCaption {
  id: string
  /** Who said it, as the room names them: Sophia, You, or a first name. */
  who: string
  sophia: boolean
  words: string
  said: CaptionTurn['state']
  /** The earlier of the two: quieter. */
  older: boolean
}

/** A caption's end, from a word's start, after an ellipsis, when it runs past what the stage shows. */
export function captionEnd(text: string, most = MOST): string {
  if (text.length <= most) return text
  const cut = text.slice(text.length - most)
  const space = cut.indexOf(' ')
  return `…${space > 0 && space < most / 3 ? cut.slice(space + 1) : cut}`
}

/** The last two captions with words, in the chat's order (one placed before another shows above it), newest last. */
export function stageCaptions(turns: readonly CaptionTurn[], label: (actorId: string) => string): StageCaption[] {
  const shown = turns
    .filter((t) => captionText(t))
    .toSorted((a, b) => a.at - b.at)
    .slice(-2)
  return shown.map((t, i) => ({
    id: t.id,
    who: t.speaker === 'sophia' ? 'Sophia' : label(t.actorId ?? ''),
    sophia: t.speaker === 'sophia',
    words: captionEnd(captionText(t)),
    said: t.state,
    older: i < shown.length - 1,
  }))
}

/** What a caption has said so far: how many fragments, and whether it ended. */
const sayingOf = (t: CaptionTurn) => `${String(t.parts.length)} ${t.state}`

/** What every caption has said so far, by id. */
export function saidSoFar(turns: readonly CaptionTurn[]): ReadonlyMap<string, string> {
  return new Map(turns.map((t) => [t.id, sayingOf(t)]))
}

/** One string for what was said so far: it changes with any caption's new words or end, and with a new caption. */
export const saidKey = (said: ReadonlyMap<string, string>) =>
  [...said].map(([id, saying]) => `${id}:${saying}`).join(' ')

/**
 * What the stage shows once the captions went: only captions that said something since (a new one, new words or an
 * end). All of them when they never went.
 */
export function newSince(
  turns: readonly CaptionTurn[],
  gone: ReadonlyMap<string, string> | null,
): readonly CaptionTurn[] {
  if (!gone) return turns
  return turns.filter((t) => gone.get(t.id) !== sayingOf(t))
}
