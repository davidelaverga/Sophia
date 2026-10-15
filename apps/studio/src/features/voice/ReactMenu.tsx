// React, in the dock (docs/plans/call-reactions.md): one round square, a smile, and the kit's menu over it with Meet's
// six. A reaction chosen goes to everyone in the call and floats up the room; the menu closes and the focus comes back.
import { useState } from 'react'
import { Icon, Menu, MenuItem, Tip, usePopover } from '@sophia/ui'
import { REACTIONS, type ReactionEmoji } from './reactions.ts'

export function ReactMenu({ onReact }: { onReact: (emoji: ReactionEmoji) => void }) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const react = (emoji: ReactionEmoji) => {
    menu.opener.current?.focus()
    setOpen(false)
    onReact(emoji)
  }
  return (
    <div ref={menu.wrap} className="react-menu">
      <button
        ref={menu.opener}
        type="button"
        className="round has-tip"
        aria-label="React"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="react" />
        <Tip label="React" />
      </button>
      {open && (
        <Menu popover={menu} label="React" side="top" align="center" className="react-list">
          {REACTIONS.map((r) => (
            <MenuItem key={r.emoji} onClick={() => react(r.emoji)}>
              {`${r.emoji} ${r.name}`}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}
