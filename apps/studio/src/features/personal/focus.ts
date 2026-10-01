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

/** Back to the Notes toggle once the notes close; to the heading when the toggle went with them (no notes left). */
export function focusNotesToggle(): void {
  requestAnimationFrame(() => {
    const toggle = document.querySelector<HTMLElement>('[aria-controls="c-notes"]')
    ;(toggle ?? document.getElementById('c-p-h'))?.focus({ preventScroll: true })
  })
}

/** Once the next frame is drawn: the control that takes the focus may be the one a state change brings back. */
export function focusSoon(selector: string): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }))
}
