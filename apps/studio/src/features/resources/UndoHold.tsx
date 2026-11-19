// Undo after Hold, where the Hold was pressed (docs/plans/undo-hold.md): the button alone for a few seconds, under
// the commands' status line, which already says «Held.». Its own polite live region, mounted before anything is
// said; nothing hands the focus to it, and when it leaves while it has the focus, for any reason, the focus goes to
// the status line, never the page. Which Hold, and for how long, are undo-hold.ts's; its windows are this sheet's own (SessionActs keys it by the
// execution shown), so a sheet closed, turned or showing another attempt starts with none.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Tip } from '@sophia/ui'
import { UNDO_HOLD, undoWatch } from './undo-hold.ts'

interface Props {
  /** The Hold on its way for the execution shown (undo-hold.ts `pendingHold`); null for none. */
  pending: string | null
  /** The Hold an Undo may take back now (undo-hold.ts `undoableHold`); null for none. */
  hold: string | null
  /** What Resume does, as its own press says it. */
  tip?: string | undefined
  /** The Resume its press would send. */
  onUndo: () => void
  /** Where the focus goes when the Undo leaves while it has it. */
  status: RefObject<HTMLElement | null>
}

/** Whether the Undo's press has the focus, kept until the focus goes somewhere else on purpose. */
function useFocusHandedBack(shown: boolean, status: RefObject<HTMLElement | null>) {
  const had = useRef(false)
  useLayoutEffect(() => {
    if (shown || !had.current) return
    had.current = false
    const at = document.activeElement
    if (at === null || at === document.body) status.current?.focus()
  }, [shown, status])
  return {
    onFocus: () => {
      had.current = true
    },
    onBlur: (e: React.FocusEvent) => {
      if (e.relatedTarget instanceof Node) had.current = false
    },
  }
}

export function UndoHold({ pending, hold, tip, onUndo, status }: Props) {
  const [watch] = useState(undoWatch)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => watch.see(pending), [pending, watch])
  useEffect(() => {
    const until = watch.offer(hold, Date.now())
    if (hold === null || until === null) {
      setOpen(null)
      return undefined
    }
    setOpen(hold)
    const timer = setTimeout(() => setOpen((was) => (was === hold ? null : was)), until - Date.now())
    return () => clearTimeout(timer)
  }, [hold, watch])
  const shown = hold !== null && open === hold
  const focus = useFocusHandedBack(shown, status)
  return (
    <div className="act-undo" role="status" aria-live="polite">
      {shown && (
        <p className="act-note">
          <button
            type="button"
            className={tip ? 'text-button has-tip' : 'text-button'}
            aria-label={tip ? `${UNDO_HOLD.act}: ${tip}` : undefined}
            onClick={onUndo}
            {...focus}
          >
            {UNDO_HOLD.act}
            {tip && <Tip label={tip} side="top" />}
          </button>
        </p>
      )}
    </div>
  )
}
