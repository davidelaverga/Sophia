// renderRoom / v2StudioStage → StudioShell (frontend bindings): the shared room seen through this
// viewer's own lens. The lens and drafts are viewer-local (viewer-state.ts); the room, goals and events
// are shared. The chat and the brief sit in a side panel beside the stage, as meeting apps have them, so the
// stage keeps Sophia's light and the people at its centre; the panel is this viewer's own, like the lens.
import { useEffect, useState, type ReactNode } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useCommands } from '../../app/useCommands.ts'
import { useMembership } from '../access/useAccess.ts'
import { askDraft } from '../artifacts/passage.ts'
import type { Passage } from '../artifacts/PassageBar.tsx'
import type { CaptionTurn } from '../conversation/captions.ts'
import { Conversation } from '../conversation/Conversation.tsx'
import { MissionPanel } from '../mission/MissionPanel.tsx'
import { CallSwitches, sendingOf } from '../voice/CallSwitches.tsx'
import { RoomStage } from '../voice/RoomStage.tsx'
import { LookingIndicator } from '../voice/SophiaControls.tsx'
import { useStageCaptions, type RoomNames } from '../voice/StageCaptions.tsx'
import { madeOnTheStage, type StageMadeState } from '../voice/StageMade.tsx'
import { showRenderOf, useStagePresent } from '../voice/StagePresent.tsx'
import { latestSpoken } from '../voice/voice-trail.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { LENS_LABEL, LensSwitcher } from './LensSwitcher.tsx'
import { chatSignature, panelNote, toggled, type Panel } from './side-panel.ts'
import { useKnownNames } from './useKnownNames.ts'
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
  const unread = useUnread(chatSignature(snapshot, room.chat, room.notices), studio && panel === 'chat')
  const brief = useBriefUpdates(studio && panel === 'brief')
  // A passage asked about from the report (PassageBar), until the chat's message takes it.
  const [asked, setAsked] = useState<Passage | null>(null)
  return {
    panel,
    opener,
    unread,
    brief,
    asked,
    /** A passage asked about: Chat opens, and its message takes the passage (useAskedInto). */
    ask: (passage: Passage) => {
      setAsked(passage)
      setPanel('chat')
      setOpener('chat')
    },
    /** The chat's message took the passage. */
    answered: () => setAsked(null),
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
  /** What is being said, held where the room lives (useHeldCaptions): the stage shows it while Chat is closed. */
  captions: readonly CaptionTurn[]
  /** What Sophia made, and putting it away, kept where the room lives (useStageMade). */
  made: StageMadeState
  /** For whoever joined late, the card that offers the meeting so far, kept where the room lives (useCatchUp). */
  catchUp?: ReactNode
  /** The project out of sight, the call still on: what its stage shows is followed by nobody here. */
  background?: boolean
}

/**
 * A passage asked about from the report: the chat's message takes it, before whatever was written there, and the
 * caret goes to the end, where the question goes. Nothing is sent.
 */
function useAskedInto(panel: RoomPanel, draft: string, write: (text: string) => void) {
  const { asked, answered } = panel
  useEffect(() => {
    if (!asked) return
    write(askDraft(asked.text, asked.source, draft))
    answered()
    // After the panel's own focus on opening: the message is where the question is typed.
    requestAnimationFrame(() => {
      const field = document.getElementById('converse-draft')
      if (!(field instanceof HTMLTextAreaElement)) return
      field.focus({ preventScroll: true }) // its caret is at the end, after the value it was given
    })
  }, [asked, answered, draft, write])
  return { draft, onDraft: write }
}

/** Who came as a guest this visit, so a guest's words stay marked after they leave. */
function useKnownGuests(room: ProjectRoom): ReadonlySet<string> {
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set())
  const fresh = room.participants.filter((p) => p.standing === 'guest' && !known.has(p.identity))
  if (fresh.length > 0) setKnown(new Set([...known, ...fresh.map((p) => p.identity)]))
  return known
}

/**
 * The call's switches for the panel's head, while in the call: what Sophia is looking at, then the dock's own switches
 * (CallSwitches: the microphone, text mode while it holds, the camera and the screen while they are on; no Leave,
 * which the dock keeps). The head shows them only where the panel covers the dock (760 px and below), so the icon and
 * its pressed state carry the meaning, as in the dock on a phone. The looking line is for the eye: the dock's own is
 * the one announced. The report pane's head shows them too where it covers the dock or the mini dock (SMC-M03);
 * `keys`: the tips name the room's keys only where they work, in the room.
 */
export function PanelCallSwitches({
  room,
  looking,
  keys = true,
}: {
  room: ProjectRoom
  looking: string | null
  keys?: boolean
}) {
  const me = room.participants.find((p) => p.local)
  if (!me) return null
  return (
    <>
      <LookingIndicator text={looking} quiet />
      <CallSwitches
        sending={sendingOf(me)}
        controls={{
          setMicrophone: (on) => void room.setMicrophone(on),
          setCamera: (on) => void room.setCamera(on),
          setScreenShare: (on) => void room.setScreenShare(on),
        }}
        textMode={{ on: room.textMode, onVoice: () => void room.setTextMode(false) }}
        keys={keys}
      />
    </>
  )
}

interface Extras {
  snapshot: Snapshot | undefined
  room: ProjectRoom
  made: StageMadeState
  panel: RoomPanel
  common: { projectId: string; identity: Identity; me: string; names: ReadonlyMap<string, string> }
  who: RoomNames
  spoken: string | null
  catchUp: ReactNode
  /** The project out of sight, the call still on (ProjectShell's `background`). */
  background: boolean
}

/**
 * Under her line in Converse, what she made (with Show everyone, where it is offered); and what the room shows to
 * everyone: presented on the stage, or the card that says who shows what.
 */
function useUnderTheLine(extras: Extras, chatOpen: boolean) {
  const { snapshot, room, made, panel, common, who, spoken, catchUp, background } = extras
  const present = useStagePresent(snapshot, room, { ...common, spoken, background })
  const show = showRenderOf(snapshot, room, common)
  const object = madeOnTheStage(made, room, { chatOpen, anyOpen: panel.panel !== null }, { ...common, who, show })
  // On the stage: what is shown to everyone, and, for whoever joined late, the meeting so far (A13, the flag's).
  const showing =
    present.card || catchUp ? (
      <>
        {present.card}
        {catchUp}
      </>
    ) : undefined
  return { present, under: object, showing }
}

/** The room's own keys, as commands: a lens by its number, Chat and the brief by their letters, said by their state. */
function useShellKeys(setLens: (lens: Lens) => void, panel: RoomPanel) {
  const toggle = (which: 'chat' | 'brief', words: string) => ({
    id: which,
    words: `${panel.panel === which ? 'Close' : 'Open'} the ${words}`,
    group: 'view' as const,
    key: which === 'chat' ? 'c' : 'b',
    run: () => panel.toggle(which),
  })
  useCommands([
    { id: 'lens-converse', words: 'Converse lens', group: 'view', key: '1', run: () => setLens('converse') },
    { id: 'lens-explore', words: 'Explore lens', group: 'view', key: '2', run: () => setLens('explore') },
    { id: 'lens-build', words: 'Build lens', group: 'view', key: '3', run: () => setLens('build') },
    toggle('chat', 'chat'),
    toggle('brief', 'brief'),
  ])
}

export function StudioShell(props: Props) {
  const { projectId, identity, room, snapshot, panel, looking, captions: held, made, catchUp = null } = props
  const background = props.background ?? false
  const { state, setLens, setDraft } = useViewerState(accountOf(identity), projectId)
  const chatDraft = useAskedInto(panel, state.drafts.converse ?? '', (text) => setDraft('converse', text))
  const me = useMembership(projectId, identity.name, identity.token).data?.actorId ?? ''
  const names = useKnownNames(room)
  useShellKeys(setLens, panel)
  const common = { projectId, identity, me, names }
  const who = { me, names, guests: useKnownGuests(room) }
  const chatOpen = panel.panel === 'chat'
  const captions = useStageCaptions(held, room, chatOpen, who)
  const stageExtras = { snapshot, room, made, panel, common, who, spoken: latestSpoken(held), catchUp, background }
  const { present, under, showing } = useUnderTheLine(stageExtras, chatOpen)
  return (
    <div className="studio">
      <RoomStage
        room={room}
        snapshot={snapshot}
        projectId={projectId}
        identity={identity}
        lensBar={<LensSwitcher lens={state.lens} onChange={setLens} />}
        lensBody={<LensBody lens={state.lens} made={under} />}
        captions={captions}
        presented={present.presented}
        showing={showing}
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
            {...chatDraft}
            onShowRoom={() => panel.show(null)}
          />
        }
        brief={<MissionPanel {...common} cursor={snapshot?.cursor} onRevision={panel.brief.onRevision} />}
        call={<PanelCallSwitches room={room} looking={looking} />}
        note={panelNote(panel.panel, room.mediaError, room.error)}
      />
    </div>
  )
}

/** The lens's own body under Sophia's line: what she made, in Converse; what is coming, in the others. */
function LensBody({ lens, made }: { lens: Lens; made: ReactNode }) {
  return (
    <div id="lens-stage" className="lens-body" role="tabpanel" aria-labelledby={`lens-${lens}`}>
      {lens === 'converse' ? made : <ComingLens lens={lens} />}
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
