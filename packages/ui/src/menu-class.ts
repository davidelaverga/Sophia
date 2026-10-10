// The menu's pure part (docs/plans/menu-scale.md): its class and its scale, with no React, so a node test can hold
// them. A menu hangs under (or over) the control that opens it, 6 px away, aligned to its end, its start or its
// middle; its rows are 32 px in the body type, 44 to a finger.
export type MenuSide = 'bottom' | 'top'
export type MenuAlign = 'start' | 'center' | 'end'

/** The menu's scale, in px: the gap from its control, its padding, the gap between rows, a row, a row to a finger. */
export const MENU = { offset: 6, pad: 6, gap: 2, row: 32, touchRow: 44, minWidth: 160 } as const

/** `menu`, `menu-top` when it opens over its control, its alignment, then the menu's own classes. */
export function menuClass(side: MenuSide = 'bottom', align: MenuAlign = 'end', className = ''): string {
  return ['menu', side === 'top' ? 'menu-top' : '', `menu-${align}`, className.trim()].filter(Boolean).join(' ')
}

/** An item that can be checked (one order of several) is a radio item; one that acts is a plain item. */
export function itemRole(checked: boolean | undefined): 'menuitem' | 'menuitemradio' {
  return checked === undefined ? 'menuitem' : 'menuitemradio'
}
