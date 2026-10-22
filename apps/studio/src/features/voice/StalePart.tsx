// A part of the call gone after a deploy (docs/plans/stale-part-call.md): the line, and Reload, one press. Nothing
// reloads by itself: that would cut a call (new-version.md).
// `takeFocus`: the line replaces the Join that was pressed, which leaves the page with the focus; Reload takes it, so
// the keyboard isn't left at the top of the page (review P3, 2026-10-22). A focus held anywhere else stays.
import { useEffect, useRef } from 'react'
import { STALE_PART } from './part-gone.ts'

export function StalePart({ takeFocus = false }: { takeFocus?: boolean }) {
  const reload = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const lost = document.activeElement === null || document.activeElement === document.body
    if (takeFocus && lost) reload.current?.focus({ preventScroll: true })
  }, [takeFocus])
  return (
    <>
      <span>{STALE_PART}</span>
      <button ref={reload} type="button" className="text-button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </>
  )
}
