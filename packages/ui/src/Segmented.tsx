// A segmented control (the kit's third piece, docs/plans/segmented-scale.md): one box of presses of which one is on,
// with the thumb that slides to it (useSlidingThumb) and, for tabs and radios, the arrows that move the choice and
// one Tab stop for the row (roving.ts). It draws the `.segmented` theme.css already styles, 36 px with 28 px presses
// (`sm`: 32 with 24). Each item is a press: its words (`label`), a count beside them, a tip, the panel it controls,
// a class and data of its own. The box names itself (`label`) and may be described (`describedBy`).
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { nextInRow } from './roving.ts'
import {
  itemClass,
  itemRole,
  itemState,
  roves,
  segmentedClass,
  type SegmentedRole,
  type SegmentedSize,
} from './segmented-class.ts'
import { Tip } from './Tip.tsx'
import { useSlidingThumb } from './useSlidingThumb.ts'

interface TipWords {
  label: string
  keys?: string
  side?: 'top' | 'bottom'
  align?: 'center' | 'end'
}

export interface SegmentedItem<K extends string> {
  id: K
  /** What the press says. */
  label: ReactNode
  /** Its name when its words are not words alone (an icon beside them). */
  name?: string
  /** How many it shows, in the small mono beside its words. */
  count?: number
  tip?: TipWords
  /** The panel it controls (a tab). */
  controls?: string
  className?: string
  /** `data-*` of the press's own (a place, a badge). */
  data?: Record<string, string | undefined>
}

export interface SegmentedProps<K extends string> {
  role: SegmentedRole
  /** The box's name. */
  label: string
  describedBy?: string
  items: readonly SegmentedItem<K>[]
  value: K
  onChange: (id: K) => void
  size?: SegmentedSize
  className?: string
  /** An id for each press (a tab a panel names). */
  idFor?: (id: K) => string
}

const dataAttrs = (data: Record<string, string | undefined> | undefined): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))

export function Segmented<K extends string>(props: SegmentedProps<K>) {
  const { role, label, describedBy, items, value, onChange, size, className, idFor } = props
  const box = useSlidingThumb<HTMLDivElement>(value)
  const presses = useRef(new Map<K, HTMLButtonElement>())
  const moving = roves(role)
  const onKeyDown = (event: KeyboardEvent) => {
    if (!moving) return
    const next = nextInRow(
      items.map((i) => i.id),
      value,
      event.key,
    )
    if (next === null) return
    event.preventDefault()
    onChange(next)
    presses.current.get(next)?.focus()
  }
  return (
    <div
      ref={box}
      className={segmentedClass({ ...(size !== undefined && { size }), ...(className !== undefined && { className }) })}
      role={role}
      aria-label={label}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <Press
          key={item.id}
          item={item}
          role={role}
          on={item.id === value}
          stop={moving ? (item.id === value ? 0 : -1) : undefined}
          id={idFor?.(item.id)}
          hold={(el) => {
            if (el) presses.current.set(item.id, el)
          }}
          onPress={() => onChange(item.id)}
        />
      ))}
    </div>
  )
}

interface PressProps<K extends string> {
  item: SegmentedItem<K>
  role: SegmentedRole
  on: boolean
  /** Its place in the Tab order: 0 or -1 as a tab or a radio, none as a pressed button. */
  stop: number | undefined
  id: string | undefined
  hold: (el: HTMLButtonElement | null) => void
  onPress: () => void
}

/** One press of the box: its words, its count, its tip, and the attribute of its role that says it is on. */
function Press<K extends string>({ item, role, on, stop, id, hold, onPress }: PressProps<K>) {
  return (
    <button
      ref={hold}
      type="button"
      role={itemRole(role)}
      id={id}
      className={itemClass(item.tip !== undefined, item.className)}
      data-thumb={item.id}
      aria-label={item.name}
      aria-controls={item.controls}
      {...itemState(role, on)}
      tabIndex={stop}
      {...dataAttrs(item.data)}
      onClick={onPress}
    >
      {item.label}
      {item.count !== undefined && <span className="filter-count">{item.count}</span>}
      {item.tip && (
        <Tip
          label={item.tip.label}
          {...(item.tip.keys !== undefined && { keys: item.tip.keys })}
          {...(item.tip.side !== undefined && { side: item.tip.side })}
          {...(item.tip.align !== undefined && { align: item.tip.align })}
        />
      )}
    </button>
  )
}
