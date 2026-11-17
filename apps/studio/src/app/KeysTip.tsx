// The shortcuts announce themselves once (docs/plans/keys-tip.md): «Tip: press ? to see the keys for this view.» in the
// bottom-left corner, above the floor band, on a page where it is true and where it covers no control. The status is
// mounted all along, at the end of the page (so Tab reaches it last), and the line is announced as it comes; it never
// takes the focus.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import { countShowing, endKeysTip, meets, onTipSeen, tipSeenNow } from './keys-tip.ts'
import { modalOnScreen, onScreen, typingSink } from './shortcuts.ts'
import { useMedia } from './useMedia.ts'

/** No keyboard to speak of: a phone or a tablet. */
const TOUCH = '(hover: none)'

/** What a person works with: what the tip must never sit over. */
const CONTROLS = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"]), [role="button"]'

/** The caret in a field: `?` is a letter there. */
const fieldFocused = () => {
  const el = document.activeElement
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** `?` opens the index now: no sheet up, no field focused, and none on screen taking stray typing. */
const questionOpensIndex = () =>
  !modalOnScreen() &&
  !fieldFocused() &&
  typingSink(document.querySelectorAll<HTMLElement>('[data-typing-sink]')) === null

/** A control on screen, outside the tip, whose box its box meets. */
function coversControl(tip: HTMLElement): boolean {
  const box = tip.getBoundingClientRect()
  return [...document.querySelectorAll<HTMLElement>(CONTROLS)].some(
    (el) => !tip.contains(el) && meets(box, el.getBoundingClientRect()) && onScreen(el),
  )
}

/** Whether the tip may show now: `?` opens the index, and its box (shown, or measured unseen) covers no control. */
const clearNow = (tip: HTMLElement | null) => !!tip && questionOpensIndex() && !coversControl(tip)

/**
 * Whether the tip may show, read a frame after the page changes, resizes or moves its focus, while `on`: only until the
 * tip has had its turn, so the watch never outlives it.
 */
function useClear(on: boolean, tip: RefObject<HTMLDivElement | null>): boolean {
  const [clear, setClear] = useState(false)
  useEffect(() => {
    if (!on) return undefined
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setClear(clearNow(tip.current)))
    }
    read()
    const watch = new MutationObserver(read)
    watch.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'inert', 'aria-modal', 'data-typing-sink'],
    })
    const events = ['resize', 'focusin', 'focusout'] as const
    for (const e of events) window.addEventListener(e, read)
    return () => {
      watch.disconnect()
      for (const e of events) window.removeEventListener(e, read)
      cancelAnimationFrame(frame)
    }
  }, [on, tip])
  return clear
}

function Line() {
  return (
    <p>
      Tip: press <kbd>?</kbd> to see the keys for this view.
    </p>
  )
}

export function KeysTip() {
  const seen = useSyncExternalStore(onTipSeen, tipSeenNow, () => true)
  const touch = useMedia(TOUCH)
  const tip = useRef<HTMLDivElement>(null)
  const on = !seen && !touch
  const shown = useClear(on, tip) && on
  useEffect(() => {
    if (shown) countShowing()
  }, [shown])
  return createPortal(
    <>
      {/* Unseen while it waits: the same box, measured against the controls, never read or reached. */}
      {on && !shown && (
        <div ref={tip} className="keys-tip keys-tip-measure" aria-hidden inert>
          <Line />
          <span className="round" />
        </div>
      )}
      <div className="keys-tip-status" role="status">
        {shown && (
          <div ref={tip} className="keys-tip arrive">
            <Line />
            <button type="button" className="round has-tip" aria-label="Dismiss" onClick={endKeysTip}>
              <Icon name="close" />
              <Tip label="Dismiss" side="top" align="end" />
            </button>
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
