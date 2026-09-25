// renderRoom / v2StudioStage → StudioShell (frontend bindings): the shared room seen through this
// viewer's own lens. The lens and drafts are viewer-local (viewer-state.ts); the room, goals and events
// are shared.
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { RoomStage } from '../voice/RoomStage.tsx'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
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
  identity: Identity
  room: ProjectRoom
  snapshot: Snapshot | undefined
}

export function StudioShell({ projectId, identity, room, snapshot }: Props) {
  const { state, setLens, setDraft } = useViewerState(identity.name, projectId)
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
        Your draft stays on this device. Sending it to the shared conversation comes with project contributions.
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
