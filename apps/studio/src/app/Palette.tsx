// The palette (docs/plans/commands.md): ⌘K, a dialog in the middle of the screen with the kit's search field over the
// commands the page offers now; typing narrows them, ↑ ↓ move, Enter runs, Escape closes and gives the focus back. With
// nothing typed, what waits on the viewer leads («For you»), then what was run last («Recent»;
// docs/plans/palette-knows.md).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Search } from '@sophia/ui'
import { paletteRows, type Offered, type PaletteRow } from './commands.ts'
import { noteRun, readRecent } from './palette-recent.ts'
import { keyLabel, onMac } from './shortcuts.ts'
import { useOffered } from './useCommands.ts'
import { SheetCall } from './call-in-reach.tsx'
import { useDialog } from './useDialog.ts'

interface Props {
  onClose: () => void
  /** Where the project has Search (`/`): Enter on nothing matching opens it. */
  onSearch?: (() => void) | undefined
}

/** What is typed, what it names, which row is active, and what the keys do. */
function usePalette({ onClose, onSearch }: Props) {
  const all = useOffered()
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  // What was run last, read once as the palette opens.
  const [recent] = useState(readRecent)
  const rows = useMemo(() => paletteRows(query, all, recent), [query, all, recent])
  const shown = rows.map((r) => r.command)
  const active = shown[Math.min(at, Math.max(shown.length - 1, 0))]
  const pick = (command: Offered) => {
    onClose()
    // «For you» names things that pass: only the rest is kept as run last.
    if (command.group !== 'you') noteRun(command.id)
    command.run()
  }
  const type = (text: string) => {
    setQuery(text)
    setAt(0)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return // an IME's candidate keys are the field's, not the list's (Codex on #238)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setAt((was) => Math.min(Math.max(was + (e.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active) pick(active)
      else if (onSearch && query.trim() !== '') {
        onClose()
        onSearch()
      }
    }
  }
  return { query, type, rows, shown, active, setAt, pick, onKey }
}

function Row({
  id,
  row: { command, label },
  active,
  onPick,
  onPoint,
}: {
  id: string
  row: PaletteRow
  active: boolean
  onPick: () => void
  onPoint: () => void
}) {
  return (
    <li id={id} role="option" aria-selected={active} className="palette-row" onPointerMove={onPoint} onClick={onPick}>
      <span className="palette-group">{label}</span>
      <span className="palette-words">{command.words}</span>
      {command.key !== undefined && <kbd>{keyLabel(command.key, onMac)}</kbd>}
    </li>
  )
}

/** The rows, or the one line when nothing matches. */
function Rows({ id, p, canSearch }: { id: string; p: ReturnType<typeof usePalette>; canSearch: boolean }) {
  if (p.shown.length === 0) {
    return (
      <p className="palette-none">
        {canSearch ? (
          <>
            Nothing does that. <kbd>↵</kbd> searches the project instead.
          </>
        ) : (
          'Nothing does that.'
        )}
      </p>
    )
  }
  return (
    <ul id={id} className="palette-list" role="listbox" aria-label="Commands">
      {p.rows.map((row, i) => (
        <Row
          key={row.command.id}
          id={`${id}-${row.command.id}`}
          row={row}
          active={row.command === p.active}
          onPick={() => p.pick(row.command)}
          onPoint={() => p.setAt(i)}
        />
      ))}
    </ul>
  )
}

export function Palette(props: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useDialog(panel, props.onClose)
  // The field, not the panel, takes the focus: typing is what the palette is for.
  useEffect(() => field.current?.focus(), [])
  const p = usePalette(props)
  const listId = useId()
  // The row the keys chose stays in the list's view, the focus staying in the field.
  const activeId = p.active ? `${listId}-${p.active.id}` : null
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])
  const onVeil = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) props.onClose()
  }
  return (
    <div className="sheet-backdrop palette-veil" onPointerDown={onVeil}>
      <div
        ref={panel}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        tabIndex={-1}
        onKeyDown={p.onKey}
      >
        {/* A live call's switches stay in reach under the veil, as in every sheet (call-in-reach.tsx). */}
        <SheetCall />
        <Search
          ref={field}
          className="palette-field"
          role="combobox"
          aria-label="Command"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={p.active ? `${listId}-${p.active.id}` : undefined}
          autoComplete="off"
          placeholder="Type a command or a view…"
          value={p.query}
          onChange={(e) => p.type(e.target.value)}
        />
        <Rows id={listId} p={p} canSearch={props.onSearch !== undefined} />
      </div>
    </div>
  )
}
