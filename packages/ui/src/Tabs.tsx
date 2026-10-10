// A tab strip (the kit's fourth piece, docs/plans/tabs-scale.md): a row of tabs, the one that is on marked by its line,
// each naming the panel it controls. As every tab row in the Studio: the one selected is the one Tab reaches; the
// arrows, Home and End move the choice and the focus with it (roving.ts, automatic activation). It draws the `.tabs`
// theme.css styles, 36 px. The strip names itself (`label`); each tab takes an id (`idFor`) so its panel can be
// labelled by it.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { nextInRow } from './roving.ts'
import { tabsClass } from './tabs-class.ts'

export interface TabItem<K extends string> {
  id: K
  /** What the tab says. */
  label: ReactNode
  /** The panel it controls. */
  controls?: string
}

export interface TabsProps<K extends string> {
  /** The strip's name. */
  label: string
  items: readonly TabItem<K>[]
  value: K
  onChange: (id: K) => void
  /** An id for each tab, for the panel that names it. */
  idFor?: (id: K) => string
  className?: string
}

export function Tabs<K extends string>({ label, items, value, onChange, idFor, className }: TabsProps<K>) {
  const tabs = useRef(new Map<K, HTMLButtonElement>())
  const onKeyDown = (event: KeyboardEvent) => {
    const next = nextInRow(
      items.map((i) => i.id),
      value,
      event.key,
    )
    if (next === null) return
    event.preventDefault()
    onChange(next)
    tabs.current.get(next)?.focus()
  }
  return (
    <div className={tabsClass(className)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.id}
          ref={(el) => {
            if (el) tabs.current.set(item.id, el)
          }}
          type="button"
          role="tab"
          id={idFor?.(item.id)}
          aria-selected={item.id === value}
          aria-controls={item.controls}
          tabIndex={item.id === value ? 0 : -1}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
