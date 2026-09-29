// A button whose action cuts someone off asks first, in place: what will happen, then the choice. Focus goes
// to the safe answer, so a second Enter never confirms by accident.
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** The button at rest, e.g. "Turn off link". */
  label: string
  /** What will happen, e.g. "Nobody new can use it." */
  warning: ReactNode
  /** The confirming button, e.g. "Turn off". */
  confirm: string
  /** The safe answer. */
  keep?: string
  /** The button at rest: quiet by default, a pill among other pills. */
  className?: string
  disabled?: boolean
  /** Called when it starts asking, e.g. to find out what the action would reach. */
  onAsk?: () => void
  /** The confirming button waits, e.g. until that is known. */
  confirmDisabled?: boolean
  onConfirm: () => void
}

export function ConfirmButton(props: Props) {
  const { label, warning, confirm, keep = 'Keep', className = 'ghost', disabled = false, onAsk, onConfirm } = props
  const confirmDisabled = props.confirmDisabled ?? false
  const [asking, setAsking] = useState(false)
  const safe = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (asking) safe.current?.focus()
  }, [asking])
  if (!asking) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          setAsking(true)
          onAsk?.()
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <span className="confirm" role="group" aria-label={label}>
      <span className="confirm-note" aria-live="polite">
        {warning}
      </span>
      <button ref={safe} type="button" className="ghost" onClick={() => setAsking(false)}>
        {keep}
      </button>
      <button
        type="button"
        className="pill danger"
        disabled={confirmDisabled}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirm}
      </button>
    </span>
  )
}
