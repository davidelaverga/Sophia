import { useCallback, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { MissionPanel } from './MissionPanel.tsx'

type Props = ComponentProps<typeof MissionPanel>

/** Viewer-local panels stay mounted: opening, closing and expanding never discard an unsaved edit. */
export function LivingBrief(props: Props) {
  const [view, setView] = useState<'closed' | 'side' | 'full'>('closed')
  const [updated, setUpdated] = useState(false)
  const seen = useRef<number | null>(null)
  const changed = useCallback((revision: number) => {
    if (seen.current !== null && revision > seen.current) setUpdated(true)
    seen.current = revision
  }, [])
  return (
    <div className="living-brief" data-view={view}>
      <button
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
      <aside id="living-brief-panel" className="brief-panel" aria-label="Project brief" hidden={view === 'closed'}>
        <header className="brief-panel-header">
          <h2>Project brief</h2>
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
