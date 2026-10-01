// A modal panel's keyboard contract: focus moves in when it opens and back to what opened it when it closes (or, when
// that is gone or was the page itself, where `returnTo` says), Tab stays inside, Escape closes. The latest onClose is
// always used, so a parent that re-renders (a voice in the call, a knock at the door) never pulls focus out of a field
// someone is typing in.
import { useContext, useEffect, useRef, type RefObject } from 'react'
import { ShortcutScope } from './shortcuts.ts'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Tab from the last control goes to the first, Shift+Tab from the first (or the panel) goes to the last. */
function keepFocusInside(e: KeyboardEvent, root: HTMLElement): void {
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = items[0]
  const last = items.at(-1)
  if (!first || !last) return
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

export function useDialog(
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnTo?: () => HTMLElement | null,
): void {
  const close = useRef(onClose)
  const back = useRef(returnTo)
  // Its keys only while its part of the page takes keys: a sheet left open in a project kept out of sight takes none.
  const scoped = useContext(ShortcutScope)
  useEffect(() => {
    close.current = onClose
    back.current = returnTo
  })
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    return () => {
      const nowhere = !opener?.isConnected || opener === document.body
      ;((nowhere ? back.current?.() : null) ?? opener)?.focus()
    }
  }, [panel])
  useEffect(() => {
    if (!scoped) return undefined
    // Back on screen (a project kept for its call, shown again), it takes the focus again: the browser moved it out
    // when its part of the page was hidden.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      else if (e.key === 'Tab' && panel.current) keepFocusInside(e, panel.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, scoped])
}
