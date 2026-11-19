// The shortcuts announce themselves once (docs/plans/keys-tip.md): «Tip: press ? to see the keys for this view.» in the
// bottom-left corner, above the floor band, on a page where it is true and where it covers no control. The status is
// mounted all along, at the end of the page (so Tab reaches it last), and the line is announced as it comes; it never
// takes the focus. Typing anywhere in the room says so the same way (docs/plans/type-anywhere-tip.md): one corner tip,
// said where the room's bar takes stray typing, once the keys' tip has had its turn, so never both at once.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import { keysTip, meets, type OnceTip } from './keys-tip.ts'
import { modalOnScreen, onScreen, typingSink } from './shortcuts.ts'
import { roomBar, TYPE_TIP_LINE, typeTip, typeTipShows } from './type-tip.ts'
import { useMedia } from './useMedia.ts'

/** No keyboard to speak of: a phone or a tablet. */
const TOUCH = '(hover: none)'

/** What a person works with: what the tip must never sit over. */
const CONTROLS = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"]), [role="button"]'

/** The caret in a field: `?` is a letter there, and typing already goes somewhere. */
const fieldFocused = () => {
  const el = document.activeElement
  return el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** The field on screen that takes stray typing now, if any. */
const sinkNow = () => typingSink(document.querySelectorAll<HTMLElement>('[data-typing-sink]'))

/** A control on screen, outside the tip, whose box its box meets. */
function coversControl(tip: HTMLElement): boolean {
  const box = tip.getBoundingClientRect()
  return [...document.querySelectorAll<HTMLElement>(CONTROLS)].some(
    (el) => !tip.contains(el) && meets(box, el.getBoundingClientRect()) && onScreen(el),
  )
}

/** Whether a tip may show now, given whether its box (shown, or measured unseen) covers a control. */
type Clear = (covers: () => boolean) => boolean

/** The keys' tip: `?` opens the index now (no sheet up, no field focused, none on screen taking stray typing). */
const keysClear: Clear = (covers) => !modalOnScreen() && !fieldFocused() && sinkNow() === null && !covers()

/** The typing tip: the room's bar takes stray typing now, nothing in the way (type-tip.ts). */
const typeClear: Clear = (covers) =>
  typeTipShows({
    keysTipSeen: keysTip.seenNow(),
    touch: window.matchMedia(TOUCH).matches,
    barTakesTyping: roomBar(sinkNow()),
    fieldFocused: fieldFocused(),
    modal: modalOnScreen(),
    coversControl: covers(),
  })

/**
 * Whether the tip may show, read a frame after the page changes, resizes or moves its focus, while `on`: only until the
 * tip has had its turn, so the watch never outlives it.
 */
function useClear(on: boolean, tip: RefObject<HTMLDivElement | null>, clear: Clear): boolean {
  const [now, setNow] = useState(false)
  useEffect(() => {
    if (!on) return undefined
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = tip.current
        setNow(!!el && clear(() => coversControl(el)))
      })
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
  }, [on, tip, clear])
  return now
}

/** Whether a tip has had its turn, followed as it ends here or in another tab. */
const useSeen = (once: OnceTip) => useSyncExternalStore(once.onSeen, once.seenNow, () => true)

interface CornerTipProps {
  once: OnceTip
  clear: Clear
  /** Whether it may have its turn yet (the typing tip waits for the keys'). */
  turn?: boolean
  line: ReactNode
  /** Its status's class: each tip has its own, mounted all along. */
  status: string
}

/** One line in the bottom-left corner, once per browser, with Dismiss. */
function CornerTip({ once, clear, turn = true, line, status }: CornerTipProps) {
  const seen = useSeen(once)
  const touch = useMedia(TOUCH)
  const tip = useRef<HTMLDivElement>(null)
  const on = turn && !seen && !touch
  const shown = useClear(on, tip, clear) && on
  useEffect(() => {
    if (shown) once.countShowing()
  }, [shown, once])
  return createPortal(
    <>
      {/* Unseen while it waits: the same box, measured against the controls, never read or reached. */}
      {on && !shown && (
        <div ref={tip} className="keys-tip keys-tip-measure" aria-hidden inert>
          {line}
          <span className="round" />
        </div>
      )}
      <div className={status} role="status">
        {shown && (
          <div ref={tip} className="keys-tip arrive">
            {line}
            <button type="button" className="round has-tip" aria-label="Dismiss" onClick={once.end}>
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

const KEYS_LINE = (
  <p>
    Tip: press <kbd>?</kbd> to see the keys for this view.
  </p>
)

export function KeysTip() {
  return <CornerTip once={keysTip} clear={keysClear} line={KEYS_LINE} status="keys-tip-status" />
}

const TYPE_LINE = <p>{TYPE_TIP_LINE}</p>

/** Typing anywhere in the room says so, once: after the keys' tip, never with it. */
export function TypeTip() {
  const keysSeen = useSeen(keysTip)
  return <CornerTip once={typeTip} clear={typeClear} turn={keysSeen} line={TYPE_LINE} status="type-tip-status" />
}
