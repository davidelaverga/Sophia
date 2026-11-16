// The shortcuts announce themselves once (docs/plans/keys-tip.md): «Tip: press ? to see the keys for this view.» in the
// bottom-left corner, over no control, on the first page that can say it truly. The status is mounted all along, so the
// line is announced as it comes and never takes the focus.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { endKeysTip, onTipSeen, tipSeenNow } from './keys-tip.ts'
import { modalOnScreen, typingSink } from './shortcuts.ts'
import { useMedia } from './useMedia.ts'

/** No keyboard to speak of: a phone or a tablet. */
const TOUCH = '(hover: none)'

/** `?` opens the index now: no sheet is up, and no field on screen takes stray typing (where `?` is a letter). */
const questionOpensIndex = () =>
  !modalOnScreen() && typingSink(document.querySelectorAll<HTMLElement>('[data-typing-sink]')) === null

/**
 * Whether `?` opens the index, read a frame after the page changes, while `on`: only until the tip has had its turn, so
 * the watch never outlives it.
 */
function useQuestionOpensIndex(on: boolean): boolean {
  const [opens, setOpens] = useState(false)
  useEffect(() => {
    if (!on) return undefined
    let frame = 0
    const read = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOpens(questionOpensIndex()))
    }
    read()
    const watch = new MutationObserver(read)
    watch.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'inert', 'aria-modal', 'data-typing-sink'],
    })
    return () => {
      watch.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [on])
  return opens
}

export function KeysTip() {
  const seen = useSyncExternalStore(onTipSeen, tipSeenNow, () => true)
  const touch = useMedia(TOUCH)
  const opens = useQuestionOpensIndex(!seen && !touch)
  return (
    <div className="keys-tip-status" role="status">
      {!seen && !touch && opens && (
        <div className="keys-tip arrive">
          <p>
            Tip: press <kbd>?</kbd> to see the keys for this view.
          </p>
          <button type="button" className="round has-tip" aria-label="Dismiss" onClick={endKeysTip}>
            <Icon name="close" />
            <Tip label="Dismiss" side="top" align="end" />
          </button>
        </div>
      )}
    </div>
  )
}
