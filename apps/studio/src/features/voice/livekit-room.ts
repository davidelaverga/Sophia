// invoke / mic → RoomAudio (frontend bindings): one LiveKit room connection, outside React. The room is
// transport only: joining, muting or leaving never touches project work (architecture 06 §2).
import { Room, RoomEvent, Track, type Participant, type RemoteTrack } from 'livekit-client'
import type { RoomParticipant } from './room-view.ts'

export type RoomStatus = 'live' | 'reconnecting' | 'ended'

export interface RoomConnection {
  participants: () => RoomParticipant[]
  setMicrophone: (on: boolean) => Promise<void>
  leave: () => Promise<void>
}

interface Callbacks {
  /** Someone joined, left, spoke or muted: re-read `participants()`. */
  onChange: () => void
  onStatus: (status: RoomStatus) => void
}

const toView = (p: Participant, local: boolean): RoomParticipant => ({
  identity: p.identity,
  name: p.name || p.identity.slice(0, 8),
  speaking: p.isSpeaking,
  micOn: p.isMicrophoneEnabled,
  local,
})

/** Remote voices play through hidden audio elements, removed when the track or the room ends. */
function remoteAudio(room: Room): void {
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    const el = track.attach()
    el.dataset.sophiaRoomAudio = ''
    document.body.append(el)
  })
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    for (const el of track.detach()) el.remove()
  })
}

const CHANGES = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.TrackSubscribed,
] as const

export async function connectRoom(serverUrl: string, token: string, cb: Callbacks): Promise<RoomConnection> {
  const room = new Room({ adaptiveStream: true, dynacast: true })
  for (const event of CHANGES) room.on(event, cb.onChange)
  room.on(RoomEvent.Reconnecting, () => cb.onStatus('reconnecting'))
  room.on(RoomEvent.Reconnected, () => cb.onStatus('live'))
  room.on(RoomEvent.Disconnected, () => {
    for (const el of document.querySelectorAll('[data-sophia-room-audio]')) el.remove()
    cb.onStatus('ended')
  })
  remoteAudio(room)
  await room.connect(serverUrl, token)
  return {
    participants: () => [
      toView(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].map((p) => toView(p, false)),
    ],
    setMicrophone: async (on) => {
      await room.localParticipant.setMicrophoneEnabled(on)
      cb.onChange()
    },
    leave: () => room.disconnect(),
  }
}
