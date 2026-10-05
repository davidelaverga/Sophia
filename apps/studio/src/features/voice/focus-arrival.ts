// Where the keyboard's focus goes as what the room shows changes hands (docs/plans/room-present.md). A show pressed on
// this device is remembered until its report reaches the stage, which then takes the focus once; a report that arrives
// otherwise (another device, a screen share ending) takes it only when it had nowhere to be.
let shownHere = false

/** This device just showed a report: its arrival on the stage takes the focus. */
export function markShownHere(): void {
  shownHere = true
}

/** Whether the report arriving now was shown from here; asked once, it is forgotten. */
export function takeShownHere(): boolean {
  const was = shownHere
  shownHere = false
  return was
}

/** The focus is nowhere: on the page itself, or on something gone. */
export const focusLost = (at: Element | null): boolean => !at || at === document.body || !at.isConnected

/** The room's Chat toggle, a place that stays: where the focus goes when what it was on leaves the stage. */
export function focusChat(): void {
  document.querySelector<HTMLElement>('.room-stage .panel-toggles [data-panel="chat"]')?.focus({ preventScroll: true })
}
