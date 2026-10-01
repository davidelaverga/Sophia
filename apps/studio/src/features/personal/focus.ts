// Where the focus goes in the personal space when the control that had it goes away (a suggestion decided, Ask again
// pressed, the notes closed): never the page, where the next letter typed would be a place's key (L locks the space).

/** The message bar where a keyboard is at hand; on touch the heading, so no phone keyboard pops up uninvited. */
export function focusConversation(): void {
  const touch = matchMedia('(hover: none)').matches
  const field = touch ? null : document.querySelector<HTMLElement>('#c-input:not(:disabled)')
  ;(field ?? document.getElementById('c-p-h'))?.focus({ preventScroll: true })
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
