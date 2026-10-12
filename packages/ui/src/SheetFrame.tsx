// A sheet's frame (the kit's fifth piece, docs/plans/sheet-frame.md): the veil, the panel beside the page (role dialog,
// modal, named by its title or a name given), its sticky top (the head: the title or a head of its own, the actions,
// Close; then whatever sits under the head: a call's switches, a strip of tabs) and its body. It draws the `.sheet`
// theme.css already styles and knows nothing of focus or keys: the Studio's `Sheet` wires its dialog contract
// (useDialog) and the call's switches around it, and hands the panel's ref here.
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { Button } from './Button.tsx'
import { Icon } from './Icon.tsx'
import { sheetClass, sheetHeadClass } from './sheet-class.ts'

interface Naming {
  /** The title's id (`aria-labelledby`), when the head is the title. */
  id?: string
  title?: string
  /** A head of the sheet's own instead of the title (a resource's logo, name and owner). */
  head?: ReactNode
  /** The sheet's name when its head is its own (`aria-label`). */
  label?: string
}

export interface SheetFrameProps extends Naming {
  /** The panel, for the dialog contract and for keys the sheet takes itself. */
  panelRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  /** Presses in the head before Close (steps, a copy). */
  actions?: ReactNode
  /** Under the head, in the sticky top: a call's switches, a strip of tabs. */
  top?: ReactNode
  className?: string
  headClassName?: string
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  /** `data-*` of the sheet's own (a tool). */
  data?: Record<string, string | undefined>
  children?: ReactNode
}

const dataAttrs = (data: Record<string, string | undefined> | undefined): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]))

export function SheetFrame(props: SheetFrameProps) {
  const { panelRef, onClose, id, title, head, label, actions, top, className, headClassName, onKeyDown } = props
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className={sheetClass(className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={head === undefined ? id : undefined}
        aria-label={head === undefined ? undefined : label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        {...dataAttrs(props.data)}
      >
        <div className="sheet-top">
          <header className={sheetHeadClass(headClassName)}>
            {head ?? <h2 id={id}>{title}</h2>}
            <span className="sheet-acts">
              {actions}
              <Button
                kind="icon"
                size="sm"
                aria-label="Close"
                onClick={onClose}
                tip={{ label: 'Close', keys: 'Esc', side: 'bottom', align: 'end' }}
              >
                <Icon name="close" />
              </Button>
            </span>
          </header>
          {top}
        </div>
        <div className="sheet-body">{props.children}</div>
      </div>
    </div>
  )
}
