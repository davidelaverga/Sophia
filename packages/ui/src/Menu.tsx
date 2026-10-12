// A menu (the kit's sixth piece, docs/plans/menu-scale.md): the list a control opens, 6 px under it (or over it),
// aligned to its end, its start or its middle, in the `.menu` theme.css plane, its rows 32 px in the body type. It is
// the panel of a `usePopover`: the hook gives it its ref and its keys (the arrows move, Escape and Tab close and give
// the focus back), and the control keeps `aria-haspopup="menu"` and `aria-expanded`. A `MenuItem` acts or, given
// `checked`, is one of a set and wears the mark when it is the one on; a `MenuHead` says who or what the menu is
// about; a `MenuSep` draws a line between groups.
import type { ComponentProps, ReactNode } from 'react'
import { itemRole, menuClass, type MenuAlign, type MenuSide } from './menu-class.ts'
import type { Popover } from './usePopover.ts'

export interface MenuProps {
  /** The menu's name. */
  label: string
  /** The popover it is the panel of. */
  popover: Popover
  side?: MenuSide
  align?: MenuAlign
  className?: string
  children: ReactNode
}

export function Menu({ label, popover, side, align, className, children }: MenuProps) {
  return (
    <div
      ref={popover.panel}
      className={menuClass(side, align, className)}
      role="menu"
      aria-label={label}
      onKeyDown={popover.onKeyDown}
    >
      {children}
    </div>
  )
}

export interface MenuItemProps extends Omit<ComponentProps<'button'>, 'type' | 'role' | 'disabled'> {
  /** Given, the item is one of a set (a radio item), and the one checked wears the mark. */
  checked?: boolean
  /** A press that waits: it keeps the focus and says so, and pressing it does nothing. */
  disabled?: boolean
  /** A word or two beside the item's own, in the label type (a day's topics), cut at the row's end. */
  detail?: ReactNode
}

export function MenuItem({ checked, disabled = false, detail, children, onClick, ...rest }: MenuItemProps) {
  return (
    <button
      type="button"
      role={itemRole(checked)}
      tabIndex={-1}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        if (!disabled) onClick?.(e)
      }}
      {...rest}
    >
      {children}
      {detail !== undefined && <span className="menu-detail">{detail}</span>}
      {checked && <span className="menu-mark" aria-hidden />}
    </button>
  )
}

/** Who or what the menu is about, over its items. */
export function MenuHead({ children }: { children: ReactNode }) {
  return <div className="menu-head">{children}</div>
}

/** A line between two groups of items. */
export function MenuSep() {
  return <span className="menu-sep" aria-hidden />
}
