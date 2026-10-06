// Who follows what is shown (docs/plans/room-following.md, A14's «N following»): each member says the version they
// follow in a reliable packet on its own topic, sent to the members only (never to a guest), and only when it changes.
// What others said is kept by the sender the SFU authenticated, so nobody can speak for another, and nothing touches
// a participant's metadata (the standing the API signed). Said again to whoever joins. Back from a drop, a client says
// its own again («nothing» too) and asks the members theirs, forgetting what it heard until they answer: LiveKit keeps
// no reliable packet for a receiver that was away. Forgotten when its sender leaves.
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { standingOf } from './room-view.ts'
import { isSophia } from './sophia-channel.ts'

export const FOLLOWING_TOPIC = 'sophia.following.v1'

/** A member: the standing the API signed is a role (a guest, Sophia, or someone with none, is not). */
const MEMBERS = new Set(['admin', 'editor', 'viewer'])
const isMember = (p: Participant) => !isSophia(p) && MEMBERS.has(standingOf(p.metadata))

export const encodeFollowing = (following: string | null) => new TextEncoder().encode(JSON.stringify({ following }))

/** «What do you follow?», asked by a client back from a drop. */
export const encodeAsk = () => new TextEncoder().encode(JSON.stringify({ ask: true }))

type Packet = { following: string | null } | { ask: true }

/** A packet: a version said (null for nothing), or an ask; undefined for one that is neither. */
export function decodePacket(payload: Uint8Array): Packet | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (typeof value !== 'object' || value === null) return undefined
    if ('ask' in value) return value.ask === true ? { ask: true } : undefined
    if (!('following' in value)) return undefined
    const { following } = value
    if (following === null) return { following: null }
    return typeof following === 'string' && following !== '' ? { following } : undefined
  } catch {
    return undefined
  }
}

/** A packet's version, or null for nothing; undefined for a packet that is not one (an ask included). */
export function decodeFollowing(payload: Uint8Array): string | null | undefined {
  const packet = decodePacket(payload)
  return packet && 'following' in packet ? packet.following : undefined
}

export interface FollowingSignal {
  /** Say what this person follows; nothing is sent when it hasn't changed. */
  set: (versionId: string | null) => void
  /** What a member said they follow, by their identity; null for nothing, or a guest. */
  of: (identity: string) => string | null
}

/**
 * `resync`: back from a drop, say ours again and ask the members theirs, and answer their asks (the vision flag's;
 * without it, nobody follows anything and nothing is said).
 */
export function followingSignal(room: Room, onChange: () => void, { resync = false } = {}): FollowingSignal {
  let mine: string | null = null
  const heard = new Map<string, string>()
  const publish = (to: string[], data: ReturnType<typeof encodeAsk>) => {
    if (to.length === 0) return
    room.localParticipant
      .publishData(data, { reliable: true, destinationIdentities: to, topic: FOLLOWING_TOPIC })
      .catch(() => undefined)
  }
  const send = (to: string[]) => publish(to, encodeFollowing(mine))
  const members = () => [...room.remoteParticipants.values()].filter(isMember).map((p) => p.identity)
  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== FOLLOWING_TOPIC || !participant || !isMember(participant)) return
    const packet = decodePacket(payload)
    if (!packet) return
    // Asked: the answer goes to the asker only, «nothing» included.
    if ('ask' in packet) return resync ? send([participant.identity]) : undefined
    const { following } = packet
    if (following === null) heard.delete(participant.identity)
    else heard.set(participant.identity, following)
    onChange()
  })
  room.on(RoomEvent.ParticipantConnected, (p) => {
    if (mine !== null && isMember(p)) send([p.identity])
  })
  room.on(RoomEvent.ParticipantDisconnected, (p) => heard.delete(p.identity))
  room.on(RoomEvent.Reconnected, () => {
    if (!resync) return
    heard.clear()
    onChange()
    send(members())
    publish(members(), encodeAsk())
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
