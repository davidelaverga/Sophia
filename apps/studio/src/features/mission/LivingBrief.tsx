import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { MissionPanel } from './MissionPanel.tsx'

type Props = ComponentProps<typeof MissionPanel>

/** Viewer-local panels stay mounted: opening, closing and expanding never discard an unsaved edit. */
export function LivingBrief(props: Props) {
  const [view, setView] = useState<'closed' | 'side' | 'full'>('closed')
  const [updated, setUpdated] = useState(false)
  const seen = useRef<number | null>(null)
  const { openControl, heading, rememberEditor } = useBriefFocus(view)
  const changed = useCallback((revision: number) => {
    if (seen.current !== null && revision > seen.current) setUpdated(true)
    seen.current = revision
  }, [])
  return (
    <div className="living-brief" data-view={view}>
      <button
        ref={openControl}
        type="button"
        className="pill brief-open"
        aria-expanded={view !== 'closed'}
        aria-controls="living-brief-panel"
        onClick={() => {
          setView('side')
          setUpdated(false)
        }}
      >
        Open brief{updated ? ' · Updated' : ''}
      </button>
      <aside
        id="living-brief-panel"
        className="brief-panel"
        aria-label="Project brief"
        hidden={view === 'closed'}
        onFocusCapture={(event) => rememberEditor(event.target)}
      >
        <header className="brief-panel-header">
          <h2 ref={heading} tabIndex={-1}>
            Project brief
          </h2>
          <div className="control-row">
            <button type="button" className="text-button" onClick={() => setView(view === 'full' ? 'side' : 'full')}>
              {view === 'full' ? 'Collapse brief' : 'Expand brief'}
            </button>
            <button type="button" className="text-button" onClick={() => setView('closed')}>
              Back to conversation
            </button>
          </div>
        </header>
        <div className="brief-panel-body">
          <MissionPanel {...props} onRevision={changed} />
        </div>
      </aside>
    </div>
  )
}

function useBriefFocus(view: 'closed' | 'side' | 'full') {
  const openControl = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const editor = useRef<HTMLElement | null>(null)
  const previousView = useRef(view)
  useLayoutEffect(() => {
    const previous = previousView.current
    previousView.current = view
    if (previous === view) return
    if (view === 'closed') openControl.current?.focus({ preventScroll: true })
    else if (previous === 'closed') {
      const target =
        editor.current?.isConnected && editor.current.getClientRects().length ? editor.current : heading.current
      target?.focus({ preventScroll: true })
    }
  }, [view])
  return {
    openControl,
    heading,
    rememberEditor: (target: EventTarget) => {
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]'))
        editor.current = target
    },
  }
}
