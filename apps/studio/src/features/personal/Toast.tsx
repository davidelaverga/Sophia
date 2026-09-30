// A notice with undo (direction C): one at a time, eight seconds, a bar that shows the time left. What it says is
// what happened ("Carried to Launch plan"); Undo reverses exactly that.
import { useCallback, useEffect, useRef, useState } from 'react'

interface Notice {
  id: number
  message: string
  undo: (() => void) | null
}

const SHOWN_MS = 8000

export function useToast() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const next = useRef(0)
  const show = useCallback((message: string, undo?: () => void) => {
    next.current += 1
    setNotice({ id: next.current, message, undo: undo ?? null })
  }, [])
  const hide = useCallback(() => setNotice(null), [])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(hide, SHOWN_MS)
    return () => clearTimeout(timer)
  }, [notice, hide])
  return { notice, show, hide }
}

export function Toast({ notice, onHide }: { notice: Notice | null; onHide: () => void }) {
  return (
    <div className={`toast${notice ? ' show' : ''}`} role="status" aria-live="polite">
      <span>{notice?.message}</span>
      {notice?.undo && (
        <button
          className="btn"
          type="button"
          onClick={() => {
            onHide()
            notice.undo?.()
          }}
        >
          Undo
        </button>
      )}
      {/* A new notice restarts the bar. */}
      <span className="bar" key={notice?.id ?? 0} />
    </div>
  )
}

export type ShowToast = ReturnType<typeof useToast>['show']
