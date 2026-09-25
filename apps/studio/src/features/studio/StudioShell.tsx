// renderRoom / v2StudioStage → StudioShell (frontend bindings): the shared room seen through this
// viewer's own lens. The lens and drafts are viewer-local (viewer-state.ts); the room, goals and events
// are shared.
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { RoomStage } from '../voice/RoomStage.tsx'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { LENS_LABEL, LensSwitcher } from './LensSwitcher.tsx'
import { useViewerState } from './useViewerState.ts'
import type { Lens } from './viewer-state.ts'

/** What each lens will hold, stated plainly instead of showing fake content (the goal is noted for us). */
const COMING: Record<Exclude<Lens, 'converse'>, { title: string; body: string }> = {
  // S1-06, image jobs.
  explore: {
    title: 'An idea taking shape',
    body: 'Directions, generated images and side-by-side comparisons will appear here.',
  },
  // S1-07, runnable prototypes.
  build: {
    title: 'The work taking shape',
    body: 'Runnable prototypes, with their preview, source and changes, will appear here.',
  },
}

interface Props {
  projectId: string
  identity: Identity
  room: ProjectRoom
  snapshot: Snapshot | undefined
}

export function StudioShell({ projectId, identity, room, snapshot }: Props) {
  const { state, setLens, setDraft } = useViewerState(identity.name, projectId)
  useShortcuts({ '1': () => setLens('converse'), '2': () => setLens('explore'), '3': () => setLens('build') })
  return (
    <RoomStage
      room={room}
      snapshot={snapshot}
      projectId={projectId}
      identity={identity}
      lensBar={<LensSwitcher lens={state.lens} onChange={setLens} />}
      lensBody={
        <div id="lens-stage" className="lens-body" role="tabpanel" aria-labelledby={`lens-${state.lens}`}>
          {state.lens === 'converse' ? (
            <Composer draft={state.drafts.converse ?? ''} onDraft={(text) => setDraft('converse', text)} />
          ) : (
            <ComingLens lens={state.lens} />
          )}
        </div>
      }
    />
  )
}

function Composer({ draft, onDraft }: { draft: string; onDraft: (text: string) => void }) {
  return (
    <div className="composer">
      <label htmlFor="converse-draft" className="sr-only">
        Your draft
      </label>
      <textarea
        id="converse-draft"
        rows={1}
        value={draft}
        placeholder="What should Sophia and the team think about next?"
        onChange={(e) => onDraft(e.target.value)}
      />
      <p className="composer-note">
        Sending isn’t available yet. Your draft stays on this device, and only you see it.
      </p>
    </div>
  )
}

function ComingLens({ lens }: { lens: Exclude<Lens, 'converse'> }) {
  const coming = COMING[lens]
  return (
    <div className="coming">
      <span className="eyebrow">{LENS_LABEL[lens]}</span>
      <h2>{coming.title}</h2>
      <p>{coming.body}</p>
    </div>
  )
}
