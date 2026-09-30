// renderRoom / v2StudioStage → StudioShell (frontend bindings): the shared room seen through this
// viewer's own lens. The lens and drafts are viewer-local (viewer-state.ts); the room, goals and events
// are shared. The chat and the brief sit in a side panel beside the stage, as meeting apps have them, so the
// stage keeps Sophia's light and the people at its centre; the panel is this viewer's own, like the lens.
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { useMembership } from '../access/useAccess.ts'
import { Conversation } from '../conversation/Conversation.tsx'
import { MissionPanel } from '../mission/MissionPanel.tsx'
import { RoomStage } from '../voice/RoomStage.tsx'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { LENS_LABEL, LensSwitcher } from './LensSwitcher.tsx'
import { chatSignature, mergeNames, toggled, type Panel } from './side-panel.ts'
import { PanelToggles, SidePanel, useBriefUpdates, useUnread } from './SidePanel.tsx'
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

/** Names the room has known this visit, by identity, so a line keeps its author's name after they leave. */
function useKnownNames(room: ProjectRoom): ReadonlyMap<string, string> {
  const [known, setKnown] = useState<ReadonlyMap<string, string>>(() => new Map())
  const merged = mergeNames(known, room.participants)
  if (merged !== known) setKnown(merged)
  return merged
}

export function StudioShell({ projectId, identity, room, snapshot }: Props) {
  const { state, setLens, setDraft } = useViewerState(identity.name, projectId)
  const [panel, setPanel] = useState<Panel | null>(null)
  const unread = useUnread(chatSignature(snapshot, room.chat), panel === 'chat')
  const brief = useBriefUpdates(panel === 'brief')
  const me = useMembership(projectId, identity.name, identity.token).data?.actorId ?? ''
  const names = useKnownNames(room)
  useShortcuts({
    '1': () => setLens('converse'),
    '2': () => setLens('explore'),
    '3': () => setLens('build'),
    c: () => setPanel((open) => toggled(open, 'chat')),
    b: () => setPanel((open) => toggled(open, 'brief')),
  })
  const common = { projectId, identity, me, names }
  return (
    <div className="studio">
      <RoomStage
        room={room}
        snapshot={snapshot}
        projectId={projectId}
        identity={identity}
        lensBar={<LensSwitcher lens={state.lens} onChange={setLens} />}
        lensBody={
          <div id="lens-stage" className="lens-body" role="tabpanel" aria-labelledby={`lens-${state.lens}`}>
            {state.lens !== 'converse' && <ComingLens lens={state.lens} />}
          </div>
        }
        corner={<PanelToggles open={panel} onOpen={setPanel} unread={unread} updated={brief.updated} />}
      />
      <SidePanel
        open={panel}
        onOpen={setPanel}
        chat={
          <Conversation
            {...common}
            snapshot={snapshot}
            room={room}
            draft={state.drafts.converse ?? ''}
            onDraft={(text) => setDraft('converse', text)}
          />
        }
        brief={<MissionPanel {...common} cursor={snapshot?.cursor} onRevision={brief.onRevision} />}
      />
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
