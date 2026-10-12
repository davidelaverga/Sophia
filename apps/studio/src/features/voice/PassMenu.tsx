// "Pass to…" when the floor can go to several people: a menu, not a select. A select passes the floor on the
// first arrow key in some browsers; a menu acts only on a chosen name. It is the kit's menu over the dock
// (usePopover): the arrows move, Enter chooses, Escape closes and gives the focus back to the button.
import { useState } from 'react'
import { Button, Menu, MenuItem, usePopover } from '@sophia/ui'
import { shortName, type RoomParticipant } from './room-view.ts'
import { DockWord } from './DockWord.tsx'

interface Props {
  targets: readonly RoomParticipant[]
  busy: boolean
  onPass: (actorId: string) => void
}

export function PassMenu({ targets, busy, onPass }: Props) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  // The name goes with the menu: the button takes the focus first, so what follows the pass finds it there.
  const pass = (actorId: string) => {
    menu.opener.current?.focus()
    setOpen(false)
    onPass(actorId)
  }
  return (
    <div ref={menu.wrap} className="pass-menu">
      <Button
        ref={menu.opener}
        kind="warm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        <DockWord icon="pass" said="Pass the floor to…">
          Pass to…
        </DockWord>
      </Button>
      {open && (
        <Menu popover={menu} label="Pass the floor to" side="top" align="center" className="pass-list">
          {targets.map((p) => (
            <MenuItem key={p.identity} onClick={() => pass(p.identity)}>
              {shortName(p.name)}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}
