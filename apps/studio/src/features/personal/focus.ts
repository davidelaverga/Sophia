// Where the focus goes in the personal space when the control that had it goes away (a suggestion decided, Ask again
// pressed, the notes closed): never the page, where the next letter typed would be a place's key (L locks the space).
import { onScreen } from '../../app/shortcuts.ts'

/**
 * The message bar where a keyboard is at hand; on touch the conversation itself, so no phone keyboard pops up
 * uninvited and a letter typed next on a keyboard is still text for the bar (it is inside the typing scope, shortcuts.ts).
 */
export function focusConversation(): void {
  const touch = matchMedia('(hover: none)').matches
  const field = touch ? null : document.querySelector<HTMLElement>('#c-input:not(:disabled)')
  ;(field ?? document.getElementById('c-log'))?.focus({ preventScroll: true })
}

/** Where the focus lands in a place when what had it is gone: home's Personal door, else the place's heading. */
export function placeLanding(): HTMLElement | null {
  const landings = document.querySelectorAll<HTMLElement>('[data-door="personal"] .c2-main, #c-w-h, #c-p-h')
  return [...landings].find((el) => onScreen(el)) ?? null
}

/**
 * The places' bar's Personal switch: it stays in the bar wherever the person is, so a focus whose control went with
 * the personal space (a lock from L, the chip or another tab) waits there until the arrival moves it to the door.
 */
export function focusPersonalSwitch(): void {
  document.querySelector<HTMLElement>('.places-switch [data-place="personal"]')?.focus({ preventScroll: true })
}

/** The places' bar's account button: where a sheet opened from a project's account menu gives the focus back. */
export const placesAccount = (): HTMLElement | null => document.querySelector<HTMLElement>('.places-bar .account-btn')

/** Back to the Notes toggle once the notes close; to the heading when the toggle went with them (no notes left). */
export function focusNotesToggle(): void {
  requestAnimationFrame(() => {
    const toggle = document.querySelector<HTMLElement>('[aria-controls="c-notes"]')
    ;(toggle ?? document.getElementById('c-p-h'))?.focus({ preventScroll: true })
  })
}

/**
 * A control that appears in place of the one that had the focus (a refused note's form): it takes the focus only if
 * that was dropped (it went with the change). A person who moved on meanwhile keeps it where they put it. Whether it
 * moved.
 */
export function focusIfDropped(el: HTMLElement | null): boolean {
  const now = document.activeElement
  if (now && now !== document.body) return false
  el?.focus({ preventScroll: true })
  return true
}

/**
 * A focus move that waits (an answer, a slide, the voice heard), taken as the act begins: at the end it moves the focus
 * only if the person left it where the act did, or it was dropped. The control that had it may still be on screen,
 * about to go; whoever moved on meanwhile keeps the focus where they put it.
 */
export function focusLater(): (el: HTMLElement | null) => void {
  const from = document.activeElement
  return (el) => {
    const now = document.activeElement
    if (now && now !== document.body && now !== from) return
    el?.focus({ preventScroll: true })
  }
}

/** Once the next frame is drawn: the control that takes the focus may be the one a state change brings back. */
export function focusSoon(selector: string): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }))
}
