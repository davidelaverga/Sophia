// The next ask's keys (docs/plans/next-ask.md), pure so a node test holds them: at an empty field with a suggestion,
// Tab or → puts the suggestion in the field and Escape puts it away. Anywhere else, or with a modifier, or while an input
// method composes, every key is left alone: with words written Tab is Tab, and Shift+Tab still goes back.

/** A key press as the field sees it. */
export interface KeyPress {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
}

export type NextAskMove = 'accept' | 'putAway'

const MOVES: Readonly<Record<string, NextAskMove>> = { Tab: 'accept', ArrowRight: 'accept', Escape: 'putAway' }

/** No modifier held, and no input method composing. */
const plain = (p: KeyPress) => !p.shiftKey && !p.altKey && !p.ctrlKey && !p.metaKey && !p.isComposing

/** What a key does to the suggestion: accept it, put it away, or nothing (the key is the field's). */
export function nextAskKey(press: KeyPress, value: string, suggested: boolean): NextAskMove | null {
  if (!suggested || value !== '' || !plain(press)) return null
  return MOVES[press.key] ?? null
}
