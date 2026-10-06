// Who follows what is shown (docs/plans/room-following.md, A14's «N following»): each member says the version they
// follow in a reliable packet on its own topic, sent to the members only (never to a guest), and only when it changes.
// What others said is kept by the sender the SFU authenticated, so nobody can speak for another, and nothing touches
// a participant's metadata (the standing the API signed). Said again to whoever joins, and to all when the connection
// comes back; forgotten when its sender leaves.
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { standingOf } from './room-view.ts'
import { isSophia } from './sophia-channel.ts'

export const FOLLOWING_TOPIC = 'sophia.following.v1'

/** A member: the standing the API signed is a role (a guest, Sophia, or someone with none, is not). */
const MEMBERS = new Set(['admin', 'editor', 'viewer'])
const isMember = (p: Participant) => !isSophia(p) && MEMBERS.has(standingOf(p.metadata))

export const encodeFollowing = (following: string | null) => new TextEncoder().encode(JSON.stringify({ following }))

/** A packet's version, or null for nothing; undefined for a packet that is not one. */
export function decodeFollowing(payload: Uint8Array): string | null | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (typeof value !== 'object' || value === null || !('following' in value)) return undefined
    const { following } = value
    return typeof following === 'string' && following !== '' ? following : following === null ? null : undefined
  } catch {
    return undefined
  }
}

export interface FollowingSignal {
  /** Say what this person follows; nothing is sent when it hasn't changed. */
  set: (versionId: string | null) => void
  /** What a member said they follow, by their identity; null for nothing, or a guest. */
  of: (identity: string) => string | null
}

export function followingSignal(room: Room, onChange: () => void): FollowingSignal {
  let mine: string | null = null
  const heard = new Map<string, string>()
  const send = (to: string[]) => {
    if (to.length === 0) return
    room.localParticipant
      .publishData(encodeFollowing(mine), { reliable: true, destinationIdentities: to, topic: FOLLOWING_TOPIC })
      .catch(() => undefined)
  }
  const members = () => [...room.remoteParticipants.values()].filter(isMember).map((p) => p.identity)
  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== FOLLOWING_TOPIC || !participant || !isMember(participant)) return
    const following = decodeFollowing(payload)
    if (following === undefined) return
    if (following === null) heard.delete(participant.identity)
    else heard.set(participant.identity, following)
    onChange()
  })
  room.on(RoomEvent.ParticipantConnected, (p) => {
    if (mine !== null && isMember(p)) send([p.identity])
  })
  room.on(RoomEvent.ParticipantDisconnected, (p) => heard.delete(p.identity))
  room.on(RoomEvent.Reconnected, () => {
    if (mine !== null) send(members())
  })
  return {
    set: (versionId) => {
      if (versionId === mine) return
      mine = versionId
      send(members())
    },
    of: (identity) => heard.get(identity) ?? null,
  }
}
