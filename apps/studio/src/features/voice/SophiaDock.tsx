// invoke / mic / finishExchange → SophiaDock (frontend bindings): the compact room dock. It shows who is
// in the room and speaking, who may address Sophia (the input floor), and says plainly that Sophia's own
// voice arrives with S1-05. Joining, passing the floor or leaving never changes project work.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ExchangeReceipt, Snapshot } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { transferInputFloor } from '../../api/client.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { floorView, orderParticipants, type RoomParticipant } from './room-view.ts'
import { useProjectRoom, type ProjectRoom } from './useProjectRoom.ts'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
}

export function SophiaDock({ projectId, identity, snapshot }: Props) {
  const room = useProjectRoom(projectId, identity.token, snapshot)
  const live = room.status === 'live' || room.status === 'reconnecting'
  return (
    <section className="dock" aria-label="Project room">
      <div className="dock-sophia">
        <span className={`orb${live ? ' ready' : ''}`} aria-hidden />
        <div>
          <strong>Sophia</strong>
          <p className="muted">Her voice joins the room with S1-05. Today the room carries yours.</p>
        </div>
      </div>
      {live ? (
        <LiveRoom room={room} projectId={projectId} identity={identity} snapshot={snapshot} />
      ) : (
        <JoinRoom room={room} />
      )}
    </section>
  )
}

function JoinRoom({ room }: { room: ProjectRoom }) {
  return (
    <div className="dock-room">
      {room.status === 'failed' && (
        <p className="form-error" role="alert">
          {room.error}
        </p>
      )}
      <button type="button" className="primary" disabled={room.status === 'joining'} onClick={() => void room.join()}>
        {room.status === 'joining' ? 'Joining…' : room.status === 'failed' ? 'Try again' : 'Join the room'}
      </button>
    </div>
  )
}

/** Phones start with the room folded: status, Mute and Leave stay visible; people and the floor unfold. */
const NARROW = '(max-width: 560px)'

function LiveRoom({ room, projectId, identity, snapshot }: { room: ProjectRoom } & Props) {
  const me = room.participants.find((p) => p.local)
  const [open, setOpen] = useState(() => !window.matchMedia(NARROW).matches)
  return (
    <div className="dock-room">
      <div className="control-row">
        <span role="status" className="muted">
          {room.status === 'reconnecting' ? 'Reconnecting to the room…' : `In the room · ${room.participants.length}`}
        </span>
        <button type="button" className="quiet dock-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide room' : 'Show room'}
        </button>
        <button type="button" onClick={() => void room.setMicrophone(!me?.micOn)}>
          {me?.micOn ? 'Mute' : 'Unmute'}
        </button>
        <button type="button" className="quiet" onClick={() => void room.leave()}>
          Leave the room
        </button>
      </div>
      {open && (
        <>
          <ul className="people" aria-label="In the room">
            {orderParticipants(room.participants).map((p) => (
              <PersonChip key={p.identity} person={p} />
            ))}
          </ul>
          {snapshot && <InputFloor room={room} projectId={projectId} identity={identity} snapshot={snapshot} />}
          {room.micError && <p className="muted">{room.micError}</p>}
        </>
      )}
    </div>
  )
}

function PersonChip({ person }: { person: RoomParticipant }) {
  const state = person.speaking ? 'speaking' : person.micOn ? 'listening' : 'muted'
  return (
    <li className={`person ${state}`}>
      <span className="dot" aria-hidden />
      <span>
        {person.name}
        {person.local && ' (you)'}
      </span>
      <span className="muted">{state}</span>
    </li>
  )
}

function InputFloor({ room, projectId, identity, snapshot }: { room: ProjectRoom } & Props & { snapshot: Snapshot }) {
  const queryClient = useQueryClient()
  const floor = floorView(snapshot.room.inputActorId, room.participants)
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
  const me = room.participants.find((p) => p.local)
  const busy = admission.state.status === 'sending'
  return (
    <div className="floor">
      <span>
        Can address Sophia:{' '}
        <strong>{floor.holder ? `${floor.holder.name}${floor.mine ? ' (you)' : ''}` : 'no one yet'}</strong>
      </span>
      {floor.canTake && me && (
        <button type="button" disabled={busy} onClick={() => void admission.submit(me.identity)}>
          Take it
        </button>
      )}
      {floor.passTargets.map((p) => (
        <button key={p.identity} type="button" disabled={busy} onClick={() => void admission.submit(p.identity)}>
          Pass to {p.name}
        </button>
      ))}
      {admission.state.status === 'rejected' && (
        <span className="form-error" role="alert">
          {admission.state.error.message}
        </span>
      )}
    </div>
  )
}
