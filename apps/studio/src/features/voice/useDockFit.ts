import { useEffect, type RefObject } from 'react'
import { wraps } from './dock-fit.ts'

/** The dock's own controls, as laid out: not a tip, which hangs outside the row. */
const rowOf = (dock: HTMLElement) =>
  [...dock.children]
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ top: r.top, bottom: r.bottom }))

const isClock = (node: Node) => {
  const element = node instanceof Element ? node : node.parentElement
  return element !== null && element.closest('.dock-time') !== null
}

/** The call's clock as it reads: its width changes only with its length (9:59 to 10:00, past an hour). */
const clockLength = (dock: HTMLElement) => dock.querySelector('.dock-time')?.textContent.length ?? 0

/**
 * Tried with its words, then with icons where they would wrap (`data-tight`, theme.css): in one go, before anything
 * paints, so the dock is never seen on two rows it didn't need.
 */
function fit(dock: HTMLElement) {
  dock.removeAttribute('data-tight')
  if (wraps(rowOf(dock))) dock.setAttribute('data-tight', '')
}

/**
 * The dock keeps one row while its icons fit (docs/plans/visual-fit.md): checked when its controls change and when the
 * stage around it does (a panel opened beside it, a window resized). Its height, read after, stays --dock-h.
 */
export function useDockFit(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const dock = ref.current?.querySelector<HTMLElement>('.dock')
    const stage = ref.current?.closest<HTMLElement>('.room-stage')
    if (!dock || !stage) return undefined
    let live = true
    let clock = clockLength(dock)
    const again = () => {
      if (!live) return
      clock = clockLength(dock)
      fit(dock)
    }
    again()
    // Its own attribute is not watched: setting it is not a change of controls. Nor is each tick of the call's clock,
    // whose tabular digits keep their width until it reads longer.
    const controls = new MutationObserver((changes) => {
      if (changes.some((c) => !isClock(c.target)) || clockLength(dock) !== clock) again()
    })
    controls.observe(dock, { childList: true, subtree: true, characterData: true })
    const room = new ResizeObserver(again)
    room.observe(stage)
    // The words measured in a fallback face are measured again in Geist once it arrives.
    void document.fonts.ready.then(again)
    return () => {
      live = false
      controls.disconnect()
      room.disconnect()
      dock.removeAttribute('data-tight')
    }
  }, [ref])
}
