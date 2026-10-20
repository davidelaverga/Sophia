// The microphone a dropped call comes back with (call-rejoin.md): as it was while the room was last connected, not as
// it reads while LiveKit tears the call down. Its own module, so its rule is unit-tested over a fake room.
import { ConnectionState, RoomEvent, type Room } from 'livekit-client'

/** As much of LiveKit's room as the rule reads. */
export type MicRoom = Pick<Room, 'on' | 'state' | 'localParticipant'>

/**
 * The microphone as it was while the room was last connected, read on each of the room's `changes`: not as it reads
 * while LiveKit tears the call down, which unpublishes the tracks first. A mute or unmute is heard in any state but
 * disconnected, since LiveKit mutes the track at once, «Reconnecting…» too; once LiveKit reconnects, it is read again.
 */
export function micWhileConnected(room: MicRoom, changes: readonly RoomEvent[]): () => boolean {
  let on = false
  const read = () => {
    on = room.localParticipant.isMicrophoneEnabled
  }
  const note = () => {
    if (room.state === ConnectionState.Connected) read()
  }
  const muted = () => {
    if (room.state !== ConnectionState.Disconnected) read()
  }
  for (const event of changes) room.on(event, note)
  room.on(RoomEvent.TrackMuted, muted)
  room.on(RoomEvent.TrackUnmuted, muted)
  room.on(RoomEvent.Reconnected, read)
  return () => on
}
