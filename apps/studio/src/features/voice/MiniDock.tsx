// The room from every other view: a small floating pill, so the room stays one click away and a live
// call keeps its microphone and leave within reach while you read goals or work.
import { Icon } from '@sophia/ui'
import type { ProjectRoom } from './useProjectRoom.ts'

export function MiniDock({ room, onOpen }: { room: ProjectRoom; onOpen: () => void }) {
  const live = room.status === 'live' || room.status === 'reconnecting'
  const me = room.participants.find((p) => p.local)
  if (!live) {
    return (
      <div className="mini-dock">
        <button type="button" className="pill" disabled={room.status === 'joining'} onClick={() => void room.join()}>
          <span className="pill-dot" aria-hidden />
          {room.status === 'joining' ? 'Joining…' : 'Join the room'}
        </button>
      </div>
    )
  }
  return (
    <div className="mini-dock" role="group" aria-label="Project room">
      <button type="button" className="pill" onClick={onOpen} title="Open the room">
        <span className="pill-dot" data-live aria-hidden />
        In the room · {room.participants.length}
      </button>
      <button
        type="button"
        className="round"
        aria-pressed={!!me?.micOn}
        aria-label="Microphone"
        title="Microphone"
        onClick={() => void room.setMicrophone(!me?.micOn)}
      >
        <Icon name={me?.micOn ? 'mic' : 'micOff'} />
      </button>
      <button
        type="button"
        className="round leave"
        aria-label="Leave the room"
        title="Leave the room"
        onClick={() => void room.leave()}
      >
        <Icon name="leave" />
      </button>
    </div>
  )
}
