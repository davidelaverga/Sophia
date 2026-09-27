// "Pass to…" when the floor can go to several people: a menu, not a select. A select passes the floor on the
// first arrow key in some browsers; a menu acts only on a chosen name. Arrows move, Enter chooses, Escape
// closes and gives focus back to the button.
import { useEffect, useRef, useState } from 'react'
import { shortName, type RoomParticipant } from './room-view.ts'

interface Props {
  targets: readonly RoomParticipant[]
  busy: boolean
  onPass: (actorId: string) => void
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 }

/** Arrow keys move through the names, wrapping; true when the key was one of them. */
function focusStep(items: readonly HTMLElement[], key: string): boolean {
  const step = STEP[key]
  if (step === undefined) return false
  const i = items.findIndex((el) => el === document.activeElement)
  items[(i + step + items.length) % items.length]?.focus()
  return true
}

export function PassMenu({ targets, busy, onPass }: Props) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return (
    <span className="pass-menu">
      <button
        ref={button}
        type="button"
        className="pill warm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        Pass to…
      </button>
      {open && (
        <PassList
          targets={targets}
          onPass={(id) => {
            setOpen(false)
            onPass(id)
          }}
          onClose={(refocus) => {
            setOpen(false)
            if (refocus) button.current?.focus()
          }}
        />
      )}
    </span>
  )
}

interface ListProps {
  targets: readonly RoomParticipant[]
  onPass: (actorId: string) => void
  /** Escape gives focus back to the button; leaving the menu by clicking elsewhere does not. */
  onClose: (refocus: boolean) => void
}

function PassList({ targets, onPass, onClose }: ListProps) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [])
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose(true)
      return
    }
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    if (focusStep(items, e.key)) e.preventDefault()
  }
  return (
    <div
      ref={list}
      className="pass-list"
      role="menu"
      aria-label="Pass the floor to"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onClose(false)
      }}
    >
      {targets.map((p) => (
        <button key={p.identity} type="button" role="menuitem" onClick={() => onPass(p.identity)}>
          {shortName(p.name)}
        </button>
      ))}
    </div>
  )
}
