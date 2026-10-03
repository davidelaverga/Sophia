// A menu or a small popover under the control that opens it (the account, who can see a place, the earlier days).
// While it is open, a press anywhere outside it closes it; Escape inside it closes it and gives the focus back to that
// control; Up and Down move through a menu's items. On opening, its first item takes the focus.
//
// It listens for `pointerdown`, not `click`: the click that opens a popover from elsewhere (a day's divider) has
// already pressed down by then, so it can't reach the new listener and close what it just opened.
import { useEffect, useRef } from 'react'

const FIRST = '[role="menuitem"], button:not([disabled]), input, a[href]'

function moveFocus(e: React.KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')]
  if (items.length === 0) return
  e.preventDefault()
  const at = items.findIndex((i) => i === document.activeElement)
  items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
}

export function usePopover(open: boolean, close: () => void) {
  /** The control and its popover: a press inside this is not outside. */
  const wrap = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const before = useRef<HTMLElement | null>(null)
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return undefined
    before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLElement>(FIRST)?.focus()
    const outside = (e: PointerEvent) => {
      if (!(e.target instanceof Node && wrap.current?.contains(e.target))) latest.current()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') moveFocus(e)
    if (e.key !== 'Escape') return
    e.preventDefault()
    latest.current()
    const back = opener.current ?? before.current
    back?.focus()
  }
  return { wrap, panel, opener, onKeyDown }
}
