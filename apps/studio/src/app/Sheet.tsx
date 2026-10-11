// A sheet: the Studio's panel over the page, for what needs the whole attention for a moment (passkeys, your data,
// unlocking the personal space, how privacy works, a task, a resource, inviting). The frame is the kit's (SheetFrame:
// the veil, the panel, its head with Close, its body); this wires the Studio around it: it is modal (useDialog: the
// focus moves in and back, Tab stays inside, Escape closes), and while a call is live the call's switches sit under
// its head (SheetCall), since the sheet covers the room's own. A sheet with a head of its own (a resource) gives
// `head` and `label`; one with tabs or keys of its own gives `top`, `onKeyDown` and its `panelRef`. On a phone it
// rises from the bottom (theme.css).
import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { SheetFrame } from '@sophia/ui'
import { SheetCall } from './call-in-reach.tsx'
import { useDialog } from './useDialog.ts'

interface Props {
  /** The title's id, which names the dialog (when the head is the title). */
  id?: string
  title?: string
  /** A head of the sheet's own instead of the title, and then its name. */
  head?: ReactNode
  label?: string
  onClose: () => void
  /** Where the focus goes on closing when what opened the sheet is gone (useDialog). */
  returnTo?: () => HTMLElement | null
  /** Presses in the head before Close. */
  actions?: ReactNode
  /** Under the head, after the call's switches: a strip of tabs. */
  top?: ReactNode
  className?: string
  headClassName?: string
  /** The panel, when the sheet takes keys or focus of its own (page turns); else the sheet keeps one. */
  panelRef?: RefObject<HTMLDivElement | null>
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  data?: Record<string, string | undefined>
  children: ReactNode
}

export function Sheet(props: Props) {
  const { onClose, returnTo, panelRef, top, children, ...frame } = props
  const own = useRef<HTMLDivElement>(null)
  const panel = panelRef ?? own
  useDialog(panel, onClose, returnTo)
  return (
    <SheetFrame
      {...frame}
      panelRef={panel}
      onClose={onClose}
      top={
        <>
          <SheetCall />
          {top}
        </>
      }
    >
      {children}
    </SheetFrame>
  )
}
