// The microphone a dropped call comes back with (call-rejoin.md): as it was while the room was last connected, not as
// it reads while LiveKit tears the call down. Its own module, so its rule is unit-tested over a fake room.
import { ConnectionState, type Room, type RoomEvent } from 'livekit-client'

/** As much of LiveKit's room as the rule reads. */
export type MicRoom = Pick<Room, 'on' | 'state' | 'localParticipant'>

/** The microphone as it was while the room was last connected: not as it is while LiveKit reconnects or tears down. */
export function micWhileConnected(room: MicRoom, changes: readonly RoomEvent[]): () => boolean {
  let on = false
  const note = () => {
    if (room.state === ConnectionState.Connected) on = room.localParticipant.isMicrophoneEnabled
  }
  for (const event of changes) room.on(event, note)
  return () => on
}
