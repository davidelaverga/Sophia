// The toast: one line for a result whose place is not on screen (a note carried away, a room left from elsewhere,
// the padlock shut), with Undo when it can be undone. One at a time for eight seconds, the time left drawn along its
// foot; a new one replaces the last. A result whose place stays on screen is said there instead, as the lobby says
// "Declined … · Let in instead". It rests above the floor (--floor), so it never covers the dock or a message bar.
// The words come from the caller's view module.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Notice {
  id: number
  message: string
  undo: (() => void) | null
  /** The control the focus was on when it appeared: Undo, which goes with the toast, hands the focus back there. */
  from: HTMLElement | null
}

const SHOWN_MS = 8000

/** Where the focus is, when it is on a control (not the page). */
function focused(): HTMLElement | null {
  const at = document.activeElement
  return at instanceof HTMLElement && at !== document.body ? at : null
}

/** Back to `el`, while it is still on screen. */
function handBack(el: HTMLElement | null) {
  if (el?.isConnected && el.getClientRects().length > 0) el.focus({ preventScroll: true })
}

export function useToast() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const next = useRef(0)
  const show = useCallback((message: string, undo?: () => void) => {
    next.current += 1
    setNotice({ id: next.current, message, undo: undo ?? null, from: focused() })
  }, [])
  const hide = useCallback(() => setNotice(null), [])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(hide, SHOWN_MS)
    return () => clearTimeout(timer)
  }, [notice, hide])
  return { notice, show, hide }
}

export type ShowToast = ReturnType<typeof useToast>['show']

export function Toast({ notice, onHide }: { notice: Notice | null; onHide: () => void }) {
  return (
    <div className="toast" data-shown={notice ? '' : undefined} role="status" aria-live="polite">
      <span>{notice?.message}</span>
      {notice?.undo && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            onHide()
            notice.undo?.()
            handBack(notice.from)
          }}
        >
          Undo
        </button>
      )}
      {/* A new notice restarts the line. */}
      <span className="toast-time" key={notice?.id ?? 0} aria-hidden />
    </div>
  )
}
