// renderRoom / v2StudioStage → StudioShell (frontend bindings): the shared room seen through this
// viewer's own lens. The lens and drafts are viewer-local (viewer-state.ts); goals and events are shared.
import { LENS_LABEL, LensSwitcher } from './LensSwitcher.tsx'
import { useViewerState } from './useViewerState.ts'
import type { Lens } from './viewer-state.ts'

/** What each lens will hold, and which goal brings it. Stated plainly instead of showing fake content. */
const COMING: Record<Exclude<Lens, 'converse'>, { title: string; body: string }> = {
  explore: {
    title: 'An idea taking shape',
    body: 'Directions, generated images and side-by-side comparisons arrive with image jobs (S1-06).',
  },
  build: {
    title: 'The work taking shape',
    body: 'Runnable prototypes with Preview, Source and Diff arrive with S1-07.',
  },
}

interface Props {
  projectId: string
  viewerName: string
}

export function StudioShell({ projectId, viewerName }: Props) {
  const { state, setLens, setDraft } = useViewerState(viewerName, projectId)
  return (
    <section className="studio" aria-label="Studio">
      <LensSwitcher lens={state.lens} viewerName={viewerName} onChange={setLens} />
      <div id="lens-stage" className="lens-stage" role="tabpanel" aria-labelledby={`lens-${state.lens}`}>
        {state.lens === 'converse' ? (
          <ConverseStage draft={state.drafts.converse ?? ''} onDraft={(text) => setDraft('converse', text)} />
        ) : (
          <ComingStage lens={state.lens} />
        )}
      </div>
    </section>
  )
}

function ConverseStage({ draft, onDraft }: { draft: string; onDraft: (text: string) => void }) {
  return (
    <div className="converse">
      <h2>Thinking together</h2>
      <label htmlFor="converse-draft" className="muted">
        Your draft stays on this device, through reconnects and updates from the project. Sending it to the shared
        conversation comes with project contributions.
      </label>
      <textarea
        id="converse-draft"
        rows={5}
        value={draft}
        placeholder="What should Sophia and the team think about next?"
        onChange={(e) => onDraft(e.target.value)}
      />
    </div>
  )
}

function ComingStage({ lens }: { lens: Exclude<Lens, 'converse'> }) {
  const coming = COMING[lens]
  return (
    <div className="coming">
      <span className="eyebrow">{LENS_LABEL[lens]}</span>
      <h2>{coming.title}</h2>
      <p className="muted">{coming.body}</p>
    </div>
  )
}
