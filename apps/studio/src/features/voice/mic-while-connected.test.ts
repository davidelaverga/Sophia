import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { micWhileConnected, type MicRoom } from './mic-while-connected.ts'

/** The room's events the room module listens to for changes (livekit-room.ts's CHANGES, as far as this rule goes). */
const CHANGES = [RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackUnpublished] as const

/** LiveKit's room as far as the rule reads it, in the check's hands: its state, the microphone, and its events. */
function fakeRoom() {
  const heard = new Map<string, (() => void)[]>()
  const room = {
    state: ConnectionState.Connected,
    localParticipant: { isMicrophoneEnabled: false },
    on: (event: string, fn: () => void) => {
      heard.set(event, [...(heard.get(event) ?? []), fn])
      return room
    },
  }
  const emit = (event: RoomEvent) => {
    for (const fn of heard.get(event) ?? []) fn()
  }
  return { room, fake: room as unknown as MicRoom, emit }
}

describe('the microphone a dropped call comes back with (review of call-rejoin.md)', () => {
  it('follows the microphone while the room is connected', () => {
    const { room, fake, emit } = fakeRoom()
    const micWas = micWhileConnected(fake, CHANGES)
    room.localParticipant.isMicrophoneEnabled = true
    emit(RoomEvent.TrackUnmuted)
    assert.equal(micWas(), true)
    room.localParticipant.isMicrophoneEnabled = false
    emit(RoomEvent.TrackMuted)
    assert.equal(micWas(), false)
  })

  it('a microphone muted while LiveKit reconnects comes back muted, though the call then drops', () => {
    const { room, fake, emit } = fakeRoom()
    const micWas = micWhileConnected(fake, CHANGES)
    room.localParticipant.isMicrophoneEnabled = true
    emit(RoomEvent.TrackUnmuted)
    room.state = ConnectionState.Reconnecting
    room.localParticipant.isMicrophoneEnabled = false
    emit(RoomEvent.TrackMuted) // the person muted during «Reconnecting…»: LiveKit mutes the track at once
    room.state = ConnectionState.Disconnected
    assert.equal(micWas(), false)
  })

  it('a teardown that unpublishes the microphone outside a connected room changes nothing', () => {
    const { room, fake, emit } = fakeRoom()
    const micWas = micWhileConnected(fake, CHANGES)
    room.localParticipant.isMicrophoneEnabled = true
    emit(RoomEvent.TrackUnmuted)
    room.state = ConnectionState.Reconnecting
    room.localParticipant.isMicrophoneEnabled = false
    emit(RoomEvent.LocalTrackUnpublished) // LiveKit giving up unpublishes before it says the call ended
    assert.equal(micWas(), true)
  })

  it('a mute heard once the room is disconnected changes nothing', () => {
    const { room, fake, emit } = fakeRoom()
    const micWas = micWhileConnected(fake, CHANGES)
    room.localParticipant.isMicrophoneEnabled = true
    emit(RoomEvent.TrackUnmuted)
    room.state = ConnectionState.Disconnected
    room.localParticipant.isMicrophoneEnabled = false
    emit(RoomEvent.TrackMuted)
    assert.equal(micWas(), true)
  })

  it('reads the microphone again once LiveKit reconnects', () => {
    const { room, fake, emit } = fakeRoom()
    const micWas = micWhileConnected(fake, CHANGES)
    room.localParticipant.isMicrophoneEnabled = true
    emit(RoomEvent.TrackUnmuted)
    room.state = ConnectionState.Reconnecting
    room.localParticipant.isMicrophoneEnabled = false
    room.state = ConnectionState.Connected
    emit(RoomEvent.Reconnected)
    assert.equal(micWas(), false)
  })
})
