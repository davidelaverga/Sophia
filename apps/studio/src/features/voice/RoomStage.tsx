// renderRoom → RoomStage (frontend bindings): the Studio's stage. Sophia's light holds the room and the
// people sit around her; when someone shares video it takes the stage and her light moves into a tile
// of her own. The lens bar and lens body are this viewer's own (viewer-state.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { countdown, nextSession, sessionLabel } from '../access/access-view.ts'
import { SophiaLight, type SophiaLightHandle } from '../light/SophiaLight.tsx'
import { Presences } from './Presences.tsx'
import { canShareScreen, RoomDock } from './RoomDock.tsx'
import { floorView, orderParticipants, roomLine, stageMode, type RoomLine, type StageMode } from './room-view.ts'
import { anchorOf, measureStage, sameGeometry, type StageGeometry } from './stage-geometry.ts'
import type { ProjectRoom } from './useProjectRoom.ts'
import { VideoStage } from './VideoStage.tsx'

interface Props {
  room: ProjectRoom
  snapshot: Snapshot | undefined
  projectId: string
  identity: Identity
  lensBar: ReactNode
  lensBody: ReactNode
  /** Sophia's line, when the room's own rules do not apply (a guest knows nothing of the floor). */
  line?: RoomLine
  /** Shown over the stage's top right: the lobby, for members. */
  aside?: ReactNode
}

/** The time, again every half minute: enough for "starts in 12 min". */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** The next session on the room's calendar, in a few words, or null. */
function sessionNote(snapshot: Snapshot | undefined, now: number): string | null {
  const next = nextSession(snapshot?.sessions ?? [], now)
  return next ? `${next.title} · ${sessionLabel(next, now)} · ${countdown(next, now)}` : null
}

/**
 * Measured whenever the layout can have moved: the stage resized, or who is where changed (`layout`
 * names the people and videos on the stage). State changes only when something actually moved.
 */
function useStageGeometry(
  stage: RefObject<HTMLElement | null>,
  holder: string | null,
  mode: StageMode,
  layout: string,
) {
  const [geometry, setGeometry] = useState<StageGeometry>({ target: null, attention: null })
  const [resized, setResized] = useState(0)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => setResized((n) => n + 1))
    observer.observe(el)
    // A video layout moves Sophia's tile when its frame changes (a note above the dock, another row).
    for (const part of el.querySelectorAll('.gallery, .present, [data-sophia-tile]')) observer.observe(part)
    return () => observer.disconnect()
  }, [stage, mode, layout])
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const next = measureStage(el, holder, mode)
    setGeometry((prev) => (sameGeometry(prev, next) ? prev : next))
  }, [stage, holder, mode, layout, resized])
  return geometry
}

/**
 * When the floor changes hands, it travels from the last holder, through Sophia, to the next. The person
 * who passes it sees it leave at once (`passed`, on the receipt); everyone else sees it when the room's
 * record changes. Either way it travels once.
 */
function useFloorHandoff(
  stage: RefObject<HTMLElement | null>,
  light: RefObject<SophiaLightHandle | null>,
  holder: string | null,
) {
  const previous = useRef(holder)
  const travel = useCallback(
    (next: string | null) => {
      const from = previous.current
      previous.current = next
      const el = stage.current
      if (!el || !from || !next || from === next) return
      const a = anchorOf(el, from)
      const b = anchorOf(el, next)
      if (a && b) light.current?.handoff(a, b)
    },
    [stage, light],
  )
  useEffect(() => travel(holder), [holder, travel])
  return travel
}

function SophiaLine({ line, session }: { line: RoomLine; session: string | null }) {
  return (
    <div className="sophia-line">
      <p className="line-text" aria-live="polite">
        <span key={line.text} className="arrive">
          {line.text}
        </span>
      </p>
      {line.note && (
        <p key={line.note} className="line-note arrive">
          {line.note}
        </p>
      )}
      {session && <p className="line-session">{session}</p>}
    </div>
  )
}

/** J joins; in the room, M, V and S toggle microphone, camera and screen (the dock's tips show them). */
function useRoomKeys(room: ProjectRoom) {
  const live = room.status === 'live' || room.status === 'reconnecting'
  const me = room.participants.find((p) => p.local)
  useShortcuts({
    j: room.status === 'idle' || room.status === 'failed' ? () => void room.join() : undefined,
    m: live ? () => void room.setMicrophone(!me?.micOn) : undefined,
    v: live ? () => void room.setCamera(!me?.cameraOn) : undefined,
    s: live && canShareScreen ? () => void room.setScreenShare(!me?.screenOn) : undefined,
  })
}

const runningGoals = (snapshot: Snapshot | undefined) =>
  snapshot?.goals.filter((g) => g.status === 'running' || g.status === 'checking').length ?? 0

export function RoomStage({ room, snapshot, projectId, identity, lensBar, lensBody, line, aside }: Props) {
  const stage = useRef<HTMLElement>(null)
  const now = useNow()
  const light = useRef<SophiaLightHandle>(null)
  const people = orderParticipants(room.participants)
  const holder = snapshot?.room.inputActorId ?? null
  const floor = floorView(holder, room.participants)
  const mode = stageMode(room.feeds)
  const running = runningGoals(snapshot)
  const live = room.status === 'live' || room.status === 'reconnecting'
  const layout = [...people.map((p) => p.identity), ...room.feeds.map((f) => f.key)].join(' ')
  const geometry = useStageGeometry(stage, floor.holder?.present ? floor.holder.identity : null, mode, layout)
  const passed = useFloorHandoff(stage, light, holder)
  useRoomKeys(room)
  return (
    <section
      ref={stage}
      className="room-stage"
      data-mode={mode}
      data-live={live || undefined}
      aria-label="Project room"
    >
      <SophiaLight
        ref={light}
        mode={live ? 'listen' : 'rest'}
        target={geometry.target}
        attention={geometry.attention}
        working={running > 0}
      />
      <div className="stage-top">{lensBar}</div>
      {aside}
      {mode === 'light' ? (
        <>
          <Presences people={people} floor={floor} revision={snapshot?.room.revision ?? 0} />
          <SophiaLine line={line ?? roomLine(room.status, floor, running)} session={sessionNote(snapshot, now)} />
          <div className="stage-body">{lensBody}</div>
        </>
      ) : (
        <VideoStage mode={mode} people={people} feeds={room.feeds} floor={floor} />
      )}
      <RoomDock
        room={room}
        floor={floor}
        projectId={projectId}
        identity={identity}
        snapshot={snapshot}
        onPassed={passed}
      />
    </section>
  )
}
