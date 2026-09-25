// invoke / mic / finishExchange → the room dock (frontend bindings): one floating control for the room.
// Before joining it offers to join; in the room it holds microphone, camera, screen, the input floor
// and leave. Nothing here changes project work.
import { useQueryClient } from '@tanstack/react-query'
import type { ExchangeReceipt, Snapshot } from '@sophia/contracts'
import { Icon, SwapLabel, type IconName } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import { transferInputFloor } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { shortName, type FloorView } from './room-view.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

interface Props {
  room: ProjectRoom
  floor: FloorView
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  /** The floor was passed and the receipt says to whom: the stage shows it leave at once. */
  onPassed: (nextActorId: string) => void
}

/** Screen sharing needs getDisplayMedia, which phones do not offer; an insecure page has no mediaDevices. */
const canShareScreen = 'mediaDevices' in navigator && 'getDisplayMedia' in navigator.mediaDevices

export function RoomDock(props: Props) {
  const { room } = props
  const live = room.status === 'live' || room.status === 'reconnecting'
  return (
    <div className="dock-wrap">
      {(room.mediaError ?? (room.status === 'failed' ? room.error : null)) && (
        <p className="dock-note" role="alert">
          {room.mediaError ?? room.error}
        </p>
      )}
      <nav className="dock" aria-label="Room controls">
        {live ? <LiveControls {...props} /> : <JoinButton room={room} />}
      </nav>
    </div>
  )
}

function JoinButton({ room }: { room: ProjectRoom }) {
  const label = room.status === 'joining' ? 'joining' : room.status === 'failed' ? 'retry' : 'join'
  return (
    <button
      type="button"
      className="pill primary"
      disabled={room.status === 'joining'}
      onClick={() => void room.join()}
    >
      <span className="pill-dot" aria-hidden />
      <SwapLabel value={label} labels={{ join: 'Join the room', joining: 'Joining…', retry: 'Try again' }} />
    </button>
  )
}

interface ToggleProps {
  on: boolean
  label: string
  icons: [IconName, IconName]
  onToggle: () => void
}

/** A round toggle: its name says what it controls, aria-pressed says whether it is on. */
function Toggle({ on, label, icons, onToggle }: ToggleProps) {
  return (
    <button type="button" className="round" aria-pressed={on} aria-label={label} title={label} onClick={onToggle}>
      <Icon name={on ? icons[0] : icons[1]} />
    </button>
  )
}

function LiveControls({ room, floor, projectId, identity, snapshot, onPassed }: Props) {
  const me = room.participants.find((p) => p.local)
  return (
    <>
      <Toggle
        on={!!me?.micOn}
        label="Microphone"
        icons={['mic', 'micOff']}
        onToggle={() => void room.setMicrophone(!me?.micOn)}
      />
      <Toggle
        on={!!me?.cameraOn}
        label="Camera"
        icons={['camera', 'cameraOff']}
        onToggle={() => void room.setCamera(!me?.cameraOn)}
      />
      {canShareScreen && (
        <Toggle
          on={!!me?.screenOn}
          label="Share your screen"
          icons={['screen', 'screen']}
          onToggle={() => void room.setScreenShare(!me?.screenOn)}
        />
      )}
      <span className="dock-sep" aria-hidden />
      {snapshot && me && (
        <FloorControl floor={floor} me={me.identity} context={{ projectId, identity, snapshot }} onPassed={onPassed} />
      )}
      <span className="dock-sep" aria-hidden />
      <button
        type="button"
        className="round leave"
        aria-label="Leave the room"
        title="Leave the room"
        onClick={() => void room.leave()}
      >
        <Icon name="leave" />
      </button>
    </>
  )
}

interface FloorProps {
  floor: FloorView
  /** This person's identity in the room. */
  me: string
  context: { projectId: string; identity: Identity; snapshot: Snapshot }
  onPassed: (nextActorId: string) => void
}

/** Who may address Sophia, and the one action this person can take on it: take it, or pass it on. */
function FloorControl({ floor, me, context, onPassed }: FloorProps) {
  const { projectId, identity, snapshot } = context
  const queryClient = useQueryClient()
  const admission = useAdmission<string, ExchangeReceipt>(async (key, nextActorId) => {
    try {
      return await transferInputFloor(identity.token, snapshot.room.id, key, {
        nextActorId,
        expectedRoomRevision: snapshot.room.revision,
      })
    } finally {
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  })
  const pass = async (nextActorId: string) => {
    const receipt = await admission.submit(nextActorId)
    if (receipt) onPassed(receipt.inputActorId)
  }
  const busy = admission.state.status === 'sending'
  const holder = floor.holder ? (floor.mine ? 'You' : shortName(floor.holder.name)) : 'Open'
  return (
    <div className="floor">
      <span className="floor-label">Floor</span>
      <span key={holder} className="floor-name arrive">
        {holder}
      </span>
      <FloorAction floor={floor} me={me} busy={busy} onPass={(id) => void pass(id)} />
      {admission.state.status === 'rejected' && (
        <span className="floor-error" role="alert">
          {admission.state.error.message}
        </span>
      )}
    </div>
  )
}

interface ActionProps {
  floor: FloorView
  me: string
  busy: boolean
  onPass: (actorId: string) => void
}

function FloorAction({ floor, me, busy, onPass }: ActionProps) {
  const [only] = floor.passTargets
  if (floor.canTake) {
    return (
      <button type="button" className="pill warm" disabled={busy} onClick={() => onPass(me)}>
        Take the floor
      </button>
    )
  }
  if (floor.passTargets.length === 1 && only) {
    return (
      <button type="button" className="pill warm" disabled={busy} onClick={() => onPass(only.identity)}>
        Pass to {shortName(only.name)}
      </button>
    )
  }
  if (floor.passTargets.length > 1) {
    return (
      <select
        className="pill warm"
        aria-label="Pass the floor"
        value=""
        disabled={busy}
        onChange={(e) => onPass(e.target.value)}
      >
        <option value="" disabled>
          Pass to…
        </option>
        {floor.passTargets.map((p) => (
          <option key={p.identity} value={p.identity}>
            {shortName(p.name)}
          </option>
        ))}
      </select>
    )
  }
  return null
}
