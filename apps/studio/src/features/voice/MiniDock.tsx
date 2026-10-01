// The room from every other view: a small floating pill, so the room stays one click away and a live
// call keeps its microphone and leave within reach while you read goals or work. What goes wrong with the
// call (a failed join, a blocked microphone) is said here too, not only on the Studio stage.
//
// Whatever this person is sending is shown here with its off switch: a camera or a shared screen is never
// on out of sight just because the view changed.
import { Icon, Tip } from '@sophia/ui'
import type { RoomParticipant } from './room-view.ts'
import { LookingIndicator } from './SophiaControls.tsx'
import type { ProjectRoom } from './useProjectRoom.ts'

interface Props {
  room: ProjectRoom
  /** What Sophia is looking at, in words: the indicator stays visible from every view. */
  looking: string | null
  onOpen: () => void
}

/** The camera and the shared screen while they are on: each says so and turns off with one press. */
function Sending({ room, me }: { room: ProjectRoom; me: RoomParticipant | undefined }) {
  return (
    <>
      {me?.cameraOn && (
        <button
          type="button"
          className="round has-tip"
          aria-pressed
          aria-label="Camera on: turn it off"
          onClick={() => void room.setCamera(false)}
        >
          <Icon name="camera" />
          <Tip label="Your camera is on. Turn it off" />
        </button>
      )}
      {me?.screenOn && (
        <button
          type="button"
          className="round has-tip"
          aria-pressed
          aria-label="Sharing your screen: stop"
          onClick={() => void room.setScreenShare(false)}
        >
          <Icon name="screen" />
          <Tip label="You are sharing your screen. Stop" />
        </button>
      )}
    </>
  )
}

export function MiniDock({ room, looking, onOpen }: Props) {
  const live = room.status === 'live' || room.status === 'reconnecting'
  const me = room.participants.find((p) => p.local)
  const note = room.mediaError ?? room.error
  return (
    <div className="mini-dock" role="group" aria-label="Project room">
      <LookingIndicator text={looking} />
      {note && (
        <p className="dock-note mini-note" role="alert">
          {note}
        </p>
      )}
      {live ? (
        <>
          <button type="button" className="pill has-tip" onClick={onOpen}>
            <span className="pill-dot" data-live aria-hidden />
            In the room · {room.participants.length}
            <Tip label="Open the room" />
          </button>
          <button
            type="button"
            className="round has-tip"
            aria-pressed={!!me?.micOn}
            aria-label="Microphone"
            onClick={() => void room.setMicrophone(!me?.micOn)}
          >
            <Icon name={me?.micOn ? 'mic' : 'micOff'} />
            <Tip label="Microphone" />
          </button>
          <Sending room={room} me={me} />
          <button
            type="button"
            className="round leave has-tip"
            aria-label="Leave the room"
            onClick={() => void room.leave()}
          >
            <Icon name="leave" />
            <Tip label="Leave the room" align="end" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="pill"
          disabled={room.status === 'joining' || !room.ready}
          onClick={() => void room.join()}
        >
          <span className="pill-dot" aria-hidden />
          {room.status === 'joining' ? 'Joining…' : room.status === 'failed' ? 'Try again' : 'Join the room'}
        </button>
      )}
    </div>
  )
}
