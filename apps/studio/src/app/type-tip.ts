// Typing anywhere in the room says so, once per browser (docs/plans/type-anywhere-tip.md): «Tip: just start typing to
// message the room.», where a letter typed now would land in the room's message bar (shortcuts.ts) and the bar writes
// to the room. Kept as the keys' tip is (`onceTip`, keys-tip.ts), under its own key; its turn comes only in a visit that
// began with the keys' tip already had, so the two never show together and one visit teaches one thing. A message
// started by typing ends it: the person already knows.
import { keysTip, onceTip, type OnceTip } from './keys-tip.ts'

export const TYPE_TIP_KEY = 'sophia.type-tip'

/** Luis's line, verbatim (2026-11-19). */
export const TYPE_TIP_LINE = 'Tip: just start typing to message the room.'

/** What the page is like now, as the tip reads it. */
export interface TypeTipMoment {
  /** The keys' tip had had its turn when this visit began: it goes first, in an earlier visit. */
  keysTipDoneAtLoad: boolean
  /** No keyboard to speak of: a phone or a tablet. */
  touch: boolean
  /** A letter typed now lands in the room's message bar, which writes to the room. */
  barTakesTyping: boolean
  /** A field has the caret: typing is already going somewhere. */
  fieldFocused: boolean
  /** A sheet is up: the page behind it takes no typing. */
  modal: boolean
  /** Whether the tip's box meets a control's: a scan of the page, so asked last. */
  coversControl: () => boolean
}

/** Whether the typing tip may show now: its words true, its turn come, and nothing in its way (measured last). */
export const typeTipShows = (m: TypeTipMoment): boolean =>
  m.keysTipDoneAtLoad && !m.touch && m.barTakesTyping && !m.fieldFocused && !m.modal && !m.coversControl()

interface FieldLike {
  matches: (selector: string) => boolean
}

/** Whether a field is the room's message bar (Composer.tsx marks it `data-chat-entry`). */
export const roomBar = (field: FieldLike | null): boolean => !!field && field.matches('[data-chat-entry]')

type BarLike = FieldLike & { closest: (selector: string) => { getAttribute: (name: string) => string | null } | null }

/** Whether the room's bar writes to the room now: its `.message-bar` says `data-target="room"`, not Sophia. */
export const barMessagesRoom = (field: BarLike | null): boolean =>
  !!field && roomBar(field) && field.closest('.message-bar')?.getAttribute('data-target') === 'room'

/** The typing tip's turn, read once per visit: whether the keys' tip was already had when it began. */
export function turnAtLoad(keys: OnceTip): () => boolean {
  let atLoad: boolean | undefined
  return () => (atLoad ??= keys.seenNow())
}

/** This page's turn for the typing tip (read the first time it is asked, as the page's tips mount). */
export const typeTipTurn = turnAtLoad(keysTip)

export const typeTip = onceTip(TYPE_TIP_KEY)

/** Stray typing went to this field: if it is the room's bar, a message was started by typing, and the tip is seen. */
export function startedByTyping(field: FieldLike | null, tip: OnceTip = typeTip) {
  if (roomBar(field)) tip.end()
}

// The room's bars mounted now: the tip watches the page only while there is one to speak of.
let bars = 0
const barListeners = new Set<() => void>()
const tellBars = () => {
  for (const listener of barListeners) listener()
}

/** A room's bar is mounted (Composer.tsx, in an effect); the function returned says it is gone. */
export function roomBarMounted(): () => void {
  bars += 1
  tellBars()
  return () => {
    bars -= 1
    tellBars()
  }
}

/** Whether a room's bar is mounted now. */
export const roomBarsNow = (): boolean => bars > 0

/** Hears the room's bars mount and unmount. */
export function onRoomBars(listener: () => void): () => void {
  barListeners.add(listener)
  return () => {
    barListeners.delete(listener)
  }
}
