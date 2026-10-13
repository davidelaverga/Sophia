// Receipt-aware CON-01 confirmations retain their form until settlement. The kit's Button supplies the standard
// controls; unlike ConfirmButton, confirming does not close before an asynchronous or uncertain receipt.
import { Button } from '@sophia/ui'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  className: 'conv-withdraw-form' | 'conv-erase-form'
  label: string
  action: 'Withdraw' | 'Remove' | 'Erase'
  busy: boolean
  unknown: boolean
  refused: string | null
  onConfirm: () => void
  onKeep: () => void
  children: ReactNode
}

const PENDING = { Withdraw: 'Withdrawing…', Remove: 'Removing…', Erase: 'Erasing…' }
const PAST = { Withdraw: 'withdrawn', Remove: 'removed', Erase: 'erased' }

export function ConversationConfirmation(props: Props) {
  const safe = useRef<HTMLButtonElement>(null)
  useEffect(() => safe.current?.focus(), [])
  const keep = () => {
    if (!props.busy) props.onKeep()
  }
  const said = props.unknown
    ? `Not confirmed: ${props.action} sends it again; it won’t be ${PAST[props.action]} twice.`
    : props.refused
  return (
    <div
      className={props.className}
      role="group"
      aria-label={props.label}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        keep()
      }}
    >
      <p className="conv-note">{props.children}</p>
      <div className="conv-compose-acts">
        <Button
          kind="danger"
          size="sm"
          aria-disabled={props.busy || undefined}
          onClick={() => !props.busy && props.onConfirm()}
        >
          {props.busy ? PENDING[props.action] : props.action}
        </Button>
        <Button ref={safe} size="sm" aria-disabled={props.busy || undefined} onClick={keep}>
          Keep it
        </Button>
      </div>
      {said && (
        <p className="conv-note" role="alert">
          {said}
        </p>
      )}
    </div>
  )
}
