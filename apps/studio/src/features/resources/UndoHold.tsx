// Undo after Hold, where the Hold was pressed (docs/plans/undo-hold.md): «Put on hold.» with Undo for a few seconds,
// under the commands' status line. Its own polite live region, mounted before anything is said; nothing hands the
// focus to it, and if it leaves while it has the focus, the focus goes to the status line, never the page. The Hold
// it may take back, and for how long, are undo-hold.ts's: here only when, and the press.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { UNDO_HOLD, undoUntil } from './undo-hold.ts'

interface Props {
  /** The Hold an Undo may take back now (undo-hold.ts `undoableHold`), by its operation; null for none. */
  hold: string | null
  /** The Resume its press would send. */
  onUndo: () => void
  /** Where the focus goes if the Undo leaves while it has it. */
  status: RefObject<HTMLElement | null>
}

export function UndoHold({ hold, onUndo, status }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const press = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!hold) return undefined
    const left = undoUntil(hold, Date.now()) - Date.now()
    if (left <= 0) return undefined
    setOpen(hold)
    const timer = setTimeout(() => {
      if (press.current !== null && document.activeElement === press.current) status.current?.focus()
      setOpen((was) => (was === hold ? null : was))
    }, left)
    return () => clearTimeout(timer)
  }, [hold, status])
  const shown = hold !== null && open === hold
  return (
    <div className="act-undo" role="status" aria-live="polite">
      {shown && (
        <p className="act-note">
          {UNDO_HOLD.said}{' '}
          <button ref={press} type="button" className="text-button" onClick={onUndo}>
            {UNDO_HOLD.act}
          </button>
        </p>
      )}
    </div>
  )
}
