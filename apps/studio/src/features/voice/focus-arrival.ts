// Where the keyboard's focus goes as what the room shows changes hands (docs/plans/room-present.md). A version shown
// from this device is remembered until that version reaches the stage, which then takes the focus once; it is kept
// through a show with no reply, which may have been committed, and forgotten only when the show was refused. A report
// that arrives otherwise (another device or tab, a screen share ending) takes it only when it had nowhere to be.
let shownHere: { versionId: string; at: number } | null = null

/**
 * How long a show with no reply is waited for. A committed show reaches the stage in a second or two through the feed;
 * one never committed must not take the focus minutes later, when someone else shows the same version.
 */
export const SHOWN_HERE_MS = 60_000

/** This device just showed a report's version: that version's arrival on the stage takes the focus. */
export function markShownHere(versionId: string, now = Date.now()): void {
  shownHere = { versionId, at: now }
}

/** Whether the version arriving now was shown from here, lately; once it is, it is forgotten. */
export function takeShownHere(versionId: string, now = Date.now()): boolean {
  const mine = shownHere?.versionId === versionId && now - shownHere.at <= SHOWN_HERE_MS
  if (mine) shownHere = null
  return mine
}

/** The show of `versionId` was refused: nothing it asked for is coming (a newer show's marker stays). */
export function forgetShownHere(versionId: string): void {
  if (shownHere?.versionId === versionId) shownHere = null
}

/** The focus is nowhere: on the page itself, or on something gone. */
export const focusLost = (at: Element | null): boolean => !at || at === document.body || !at.isConnected

/** The room's Chat toggle, a place that stays: where the focus goes when what it was on leaves the stage. */
export function focusChat(): void {
  document.querySelector<HTMLElement>('.room-stage .panel-toggles [data-panel="chat"]')?.focus({ preventScroll: true })
}
