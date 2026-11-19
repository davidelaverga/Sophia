// Typing anywhere in the room says so, once per browser (docs/plans/type-anywhere-tip.md): «Tip: just start typing to
// message the room.», where the room's message bar takes stray typing (shortcuts.ts). Kept as the keys' tip is
// (`onceTip`, keys-tip.ts), under its own key; it waits for the keys' tip to have had its turn, so the two never show
// together. A message started by typing ends it: the person already knows.
import { onceTip, type OnceTip } from './keys-tip.ts'

export const TYPE_TIP_KEY = 'sophia.type-tip'

/** Luis's line, verbatim (2026-11-19). */
export const TYPE_TIP_LINE = 'Tip: just start typing to message the room.'

/** What the page is like now, as the tip reads it. */
export interface TypeTipMoment {
  /** The keys' tip has had its turn in this browser: it goes first. */
  keysTipSeen: boolean
  /** No keyboard to speak of: a phone or a tablet. */
  touch: boolean
  /** The room's message bar is the field on screen that takes stray typing. */
  barTakesTyping: boolean
  /** A field has the caret: typing is already going somewhere. */
  fieldFocused: boolean
  /** A sheet is up: the page behind it takes no typing. */
  modal: boolean
  /** The tip's box meets a control's. */
  coversControl: boolean
}

/** Whether the typing tip may show now: its words true, the keys' tip had, and nothing in its way. */
export const typeTipShows = (m: TypeTipMoment): boolean =>
  m.keysTipSeen && !m.touch && m.barTakesTyping && !m.fieldFocused && !m.modal && !m.coversControl

/** Whether a field is the room's message bar (Composer.tsx marks it `data-chat-entry`). */
export const roomBar = (field: { matches: (selector: string) => boolean } | null): boolean =>
  !!field && field.matches('[data-chat-entry]')

export const typeTip = onceTip(TYPE_TIP_KEY)

/** Stray typing went to this field: if it is the room's bar, a message was started by typing, and the tip is seen. */
export function startedByTyping(field: { matches: (selector: string) => boolean } | null, tip: OnceTip = typeTip) {
  if (roomBar(field)) tip.end()
}
