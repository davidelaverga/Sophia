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
import { TextMode, Toggle } from '../voice/RoomDock.tsx'
import { roomKey } from '../voice/room-keys.ts'
import { RoomStage } from '../voice/RoomStage.tsx'
import { LookingIndicator } from '../voice/SophiaControls.tsx'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { LENS_LABEL, LensSwitcher } from './LensSwitcher.tsx'
import { chatSignature, mergeNames, panelNote, toggled, type Panel } from './side-panel.ts'
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

/**
 * The side panel's state, kept by the project's body so it outlives a visit to another view: which tab is open,
 * whose toggle opened it, and what is new behind it (a reply that finished while the person read Goals still marks
 * Chat when they come back). `studio`: the room is on screen, so an open tab is in view.
 */
export function useRoomPanel(snapshot: Snapshot | undefined, room: ProjectRoom, studio: boolean) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [opener, setOpener] = useState<Panel | null>(null)
  const unread = useUnread(chatSignature(snapshot, room.chat), studio && panel === 'chat')
  const brief = useBriefUpdates(studio && panel === 'brief')
  return {
    panel,
    opener,
    unread,
    brief,
    /** A corner toggle or its key opens, swaps or closes the panel, and is where the focus returns on closing. */
    toggle: (p: Panel) => {
      setPanel((open) => toggled(open, p))
      setOpener(p)
    },
    /** A tab inside the panel, or its Close: the toggle that opened it stays the one the focus returns to. */
    show: setPanel,
  }
}

export type RoomPanel = ReturnType<typeof useRoomPanel>

interface Props {
  projectId: string
  identity: Identity
  room: ProjectRoom
  snapshot: Snapshot | undefined
  panel: RoomPanel
  /** What Sophia is looking at, in words, or null (lookingText). */
  looking: string | null
}

/** Names the room has known this visit, by identity, so a line keeps its author's name after they leave. */
function useKnownNames(room: ProjectRoom): ReadonlyMap<string, string> {
  const [known, setKnown] = useState<ReadonlyMap<string, string>>(() => new Map())
  const merged = mergeNames(known, room.participants)
  if (merged !== known) setKnown(merged)
  return merged
}

/** After a switch that goes away when pressed, the focus stays in the head, on its microphone. */
const focusHeadMicrophone = () =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('.side-panel-call [aria-label="Microphone"]')?.focus({ preventScroll: true }),
  )

/**
 * The call's switches for the panel's head: the microphone while in the call, the camera and the screen while they
 * are on, text mode while it is on, and what Sophia is looking at. Each switch is the dock's own, so it says the same
 * and does the same. The head shows them only where the panel covers the dock (760 px and below), so the icon and its
 * pressed state carry the meaning, as in the dock on a phone. The looking line is for the eye: the dock's own is the
 * one announced.
 */
function CallSwitches({ room, looking }: { room: ProjectRoom; looking: string | null }) {
  const me = room.participants.find((p) => p.local)
  if (!me) return null
  return (
    <>
      <LookingIndicator text={looking} quiet />
      <Toggle
        on={me.micOn}
        label="Microphone"
        keys={roomKey('microphone')}
        icons={['mic', 'micOff']}
        onToggle={() => void room.setMicrophone(!me.micOn)}
      />
      <TextMode room={room} />
      {me.cameraOn && (
        <Toggle
          on
          label="Camera"
          keys={roomKey('camera')}
          icons={['camera', 'cameraOff']}
          onToggle={() => {
            void room.setCamera(false)
            focusHeadMicrophone()
          }}
        />
      )}
      {me.screenOn && (
        <Toggle
          on
          label="Stop sharing"
          keys={roomKey('screen')}
          icons={['screen', 'screen']}
          onToggle={() => {
            void room.setScreenShare(false)
            focusHeadMicrophone()
          }}
        />
      )}
    </>
  )
}

export function StudioShell({ projectId, identity, room, snapshot, panel, looking }: Props) {
  const { state, setLens, setDraft } = useViewerState(identity.name, projectId)
  const me = useMembership(projectId, identity.name, identity.token).data?.actorId ?? ''
  const names = useKnownNames(room)
  useShortcuts({
    '1': () => setLens('converse'),
    '2': () => setLens('explore'),
    '3': () => setLens('build'),
    c: () => panel.toggle('chat'),
    b: () => panel.toggle('brief'),
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
        corner={
          <PanelToggles
            open={panel.panel}
            onToggle={panel.toggle}
            unread={panel.unread}
            updated={panel.brief.updated}
          />
        }
      />
      <SidePanel
        open={panel.panel}
        opener={panel.opener}
        onOpen={panel.show}
        chat={
          <Conversation
            {...common}
            snapshot={snapshot}
            room={room}
            draft={state.drafts.converse ?? ''}
            onDraft={(text) => setDraft('converse', text)}
            onShowRoom={() => panel.show(null)}
          />
        }
        brief={<MissionPanel {...common} cursor={snapshot?.cursor} onRevision={panel.brief.onRevision} />}
        call={<CallSwitches room={room} looking={looking} />}
        note={panelNote(panel.panel, room.mediaError, room.error)}
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
