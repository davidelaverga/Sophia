// A sheet: the Studio's panel over the page, for what needs the whole attention for a moment (passkeys, your data,
// unlocking the personal space, how privacy works). It is modal (useDialog: the focus moves in and back, Tab stays
// inside, Escape closes), a press on the veil closes it, and its head holds the title and Close; while a call is live,
// the call's switches sit under it (SheetCall), since the sheet covers the room's own. On a phone it rises from the
// bottom (theme.css). The invitation and resource sheets build their own heads the same way.
import { useRef } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { SheetCall } from './call-in-reach.tsx'
import { useDialog } from './useDialog.ts'

interface Props {
  /** The title's id, which names the dialog. */
  id: string
  title: string
  onClose: () => void
  /** Where the focus goes on closing when what opened the sheet is gone (useDialog). */
  returnTo?: () => HTMLElement | null
  children: React.ReactNode
}

export function Sheet({ id, title, onClose, returnTo, children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose, returnTo)
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="sheet-top">
          <header className="sheet-head">
            <h2 id={id}>{title}</h2>
            <button type="button" className="round has-tip" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
              <Tip label="Close" keys="Esc" side="bottom" align="end" />
            </button>
          </header>
          <SheetCall />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
