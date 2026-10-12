// The tiles' order, at the toolbar's end: a menu in the app's own look (the kit's, as the account's), not the system's
// list. It opens on the order in use, the arrows move through the others, Enter or a press chooses, and Escape gives
// the focus back to its button (usePopover).
import { useEffect, useState } from 'react'
import { Button, Icon, Menu, MenuItem, usePopover } from '@sophia/ui'
import { ORDER_LABEL, ORDERS, type Order } from './order.ts'

interface Props {
  order: Order
  onChange: (order: Order) => void
}

export function SortMenu({ order, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  useEffect(() => {
    if (open) menu.panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }, [open, menu.panel])
  const choose = (o: Order) => {
    menu.opener.current?.focus()
    setOpen(false)
    if (o !== order) onChange(o)
  }
  return (
    <div ref={menu.wrap} className="field quiet resource-sort">
      <Button
        ref={menu.opener}
        kind="ghost"
        size="lg"
        className="resource-sort-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="resource-sort-label">Sort</span>
        {ORDER_LABEL[order]}
        <Icon name="chevron" size={12} />
      </Button>
      {open && (
        <Menu popover={menu} label="Sort" className="resource-sort-menu">
          {ORDERS.map((o) => (
            <MenuItem key={o} checked={o === order} onClick={() => choose(o)}>
              {ORDER_LABEL[o]}
            </MenuItem>
          ))}
        </Menu>
      )}
    </div>
  )
}
