// Who follows what is shown (docs/plans/room-following.md, A14's «N following»): each member says the version they
// follow in a reliable packet on its own topic, sent to the members only (never to a guest), and only when it changes.
// What others said is kept by the sender the SFU authenticated, so nobody can speak for another, and nothing touches
// a participant's metadata (the standing the API signed). Said again to whoever joins. Back from a drop, a client says
// its own again («nothing» too) and asks the members theirs, forgetting what it heard before the drop, never an answer
// heard since: LiveKit keeps no reliable packet for a receiver that was away. Forgotten when its sender leaves.
import { ConnectionState, RoomEvent, type Participant, type Room } from 'livekit-client'
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
 * Back from a drop: say ours again, and ask the members theirs. What was heard before the drop is forgotten only once
 * they are asked, and only that: an answer heard since, the same version included, stays. An ask refused is asked
 * again, so a transient failure never leaves the counts empty for the rest of the call. Each drop is its own resync: a
 * later one, or the call ending, stops an earlier one's retries.
 */
function onReconnect(
  room: Room,
  on: { members: () => string[]; received: () => number; forget: (upTo: number) => void; sayMine: () => void },
  retryMs: number,
) {
  let retry: ReturnType<typeof setTimeout> | undefined
  let resyncs = 0
  const ask = (which: number, upTo: number) => {
    const to = on.members()
    // Nobody to ask (only guests, or Sophia): never an ask to everyone, which would reach a guest.
    if (to.length === 0) return on.forget(upTo)
    room.localParticipant
      .publishData(encodeAsk(), { reliable: true, destinationIdentities: to, topic: FOLLOWING_TOPIC })
      .then(() => which === resyncs && on.forget(upTo))
      .catch(() => {
        if (which !== resyncs || room.state === ConnectionState.Disconnected) return
        retry = setTimeout(() => ask(which, upTo), retryMs)
      })
  }
  const stop = () => {
    clearTimeout(retry)
    resyncs += 1
  }
  room.on(RoomEvent.Disconnected, stop)
  room.on(RoomEvent.Reconnected, () => {
    stop()
    // Counted, not timed: an answer in the same clock tick as the drop's end is still one heard since.
    const upTo = on.received()
    on.sayMine()
    ask(resyncs, upTo)
  })
}

/**
 * `resync`: back from a drop, say ours again and ask the members theirs, and answer their asks (the vision flag's;
 * without it, nobody follows anything and nothing is said).
 */
export function followingSignal(
  room: Room,
  onChange: () => void,
  { resync = false, retryMs = 2000 } = {},
): FollowingSignal {
  let mine: string | null = null
  /** Each member's word, with when it was heard: the count of words heard so far, which only grows. */
  const heard = new Map<string, { version: string; at: number }>()
  let received = 0
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
    received += 1
    if (following === null) heard.delete(participant.identity)
    else heard.set(participant.identity, { version: following, at: received })
    onChange()
  })
  room.on(RoomEvent.ParticipantConnected, (p) => {
    if (mine !== null && isMember(p)) send([p.identity])
  })
  room.on(RoomEvent.ParticipantDisconnected, (p) => heard.delete(p.identity))
  if (resync) {
    const forget = (upTo: number) => {
      for (const [identity, word] of heard) if (word.at <= upTo) heard.delete(identity)
      onChange()
    }
    onReconnect(room, { members, received: () => received, forget, sayMine: () => send(members()) }, retryMs)
  }
  return {
    set: (versionId) => {
      if (versionId === mine) return
      mine = versionId
      send(members())
    },
    of: (identity) => heard.get(identity)?.version ?? null,
  }
}
