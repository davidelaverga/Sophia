// The shortcuts announce themselves once (docs/plans/keys-tip.md): «Tip: press ? to see the keys for this view.» in the
// bottom-left corner, above the floor band, on a page where it is true and where it covers no control. The status is
// mounted all along, at the end of the page (so Tab reaches it last), and the line is announced as it comes; it never
// takes the focus. Typing anywhere in the room says so the same way (docs/plans/type-anywhere-tip.md): one corner tip,
// said where the room's bar takes stray typing, once the keys' tip has had its turn, so never both at once.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import { keysTip, meets, type OnceTip } from './keys-tip.ts'
import { modalOnScreen, onScreen, strayNow, typingSink } from './shortcuts.ts'
import {
  barMessagesRoom,
  onRoomBars,
  roomBarsNow,
  TYPE_TIP_LINE,
  typeTip,
  typeTipShows,
  typeTipTurn,
} from './type-tip.ts'
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

/** The bar typing would go to, if a letter typed now lands in the room's bar and the bar writes to the room. */
const roomTakesTyping = () => {
  const sink = sinkNow()
  return !!sink && barMessagesRoom(sink) && strayNow(sink)
}

/** The typing tip: a letter typed now would message the room, nothing in the way (type-tip.ts); controls last. */
const typeClear: Clear = (covers) =>
  typeTipShows({
    keysTipDoneAtLoad: typeTipTurn(),
    touch: window.matchMedia(TOUCH).matches,
    barTakesTyping: roomTakesTyping(),
    fieldFocused: fieldFocused(),
    modal: modalOnScreen(),
    coversControl: covers,
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
      attributeFilter: ['class', 'hidden', 'inert', 'aria-modal', 'data-typing-sink', 'data-target'],
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
  /** Whether it may have its turn, and the page be watched for it, now (the typing tip: its turn, a bar mounted). */
  turn?: boolean
  line: ReactNode
  /** Its status's class: each tip has its own, mounted all along. */
  status: string
  /** Where it is drawn when it comes back on the same page, outside the status: said once, then only shown. */
  quiet?: string
}

/** The tip as it shows: its line, and Dismiss. */
function TipBox({
  boxRef,
  line,
  onDismiss,
}: {
  boxRef: RefObject<HTMLDivElement | null>
  line: ReactNode
  onDismiss: () => void
}) {
  return (
    <div ref={boxRef} className="keys-tip arrive">
      {line}
      <button type="button" className="round has-tip" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" />
        <Tip label="Dismiss" side="top" align="end" />
      </button>
    </div>
  )
}

/**
 * Where it shows now: in the status (said) the first time it comes on this page, outside it (only shown) when it comes
 * back, for a tip that has a quiet place. Its comings are followed as it renders.
 */
function useSaid(shown: boolean, quiet: string | undefined): { said: boolean; again: boolean } {
  const [comings, setComings] = useState(0)
  const [wasShown, setWasShown] = useState(false)
  if (shown !== wasShown) {
    setWasShown(shown)
    if (shown) setComings((n) => n + 1)
  }
  const unsaid = comings > 1 && quiet !== undefined
  return { said: shown && !unsaid, again: shown && unsaid }
}

/** One line in the bottom-left corner, once per browser, with Dismiss. */
function CornerTip({ once, clear, turn = true, line, status, quiet }: CornerTipProps) {
  const seen = useSeen(once)
  const touch = useMedia(TOUCH)
  const tip = useRef<HTMLDivElement>(null)
  const on = turn && !seen && !touch
  const shown = useClear(on, tip, clear) && on
  const { said, again } = useSaid(shown, quiet)
  useEffect(() => {
    if (shown) once.countShowing()
  }, [shown, once])
  const box = <TipBox boxRef={tip} line={line} onDismiss={once.end} />
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
        {said && box}
      </div>
      {quiet !== undefined && <div className={quiet}>{again && box}</div>}
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

/** Typing anywhere in the room says so, once: in a visit after the keys' tip, and only while a room's bar is mounted. */
export function TypeTip() {
  const bars = useSyncExternalStore(onRoomBars, roomBarsNow, () => false)
  return (
    <CornerTip
      once={typeTip}
      clear={typeClear}
      turn={typeTipTurn() && bars}
      line={TYPE_LINE}
      status="type-tip-status"
      quiet="type-tip-again"
    />
  )
}
