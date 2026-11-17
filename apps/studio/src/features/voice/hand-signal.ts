// Raised hands in the call (docs/plans/raise-hand.md): each person says their hand in a reliable packet on its own
// topic, to everyone in the call, and only when it changes. What others said is kept by the sender the SFU
// authenticated, so nobody raises another's hand, and nothing touches a participant's attributes or metadata (the API
// signs no one `canUpdateOwnMetadata`). A raised hand is said again to whoever joins, and answers an ask. Back from a
// drop, this person's own hand is lowered and said so, and the room is asked for theirs: what was heard before the
// drop is forgotten once the ask is sent, never an answer heard since. Forgotten when its sender leaves.
import { RoomEvent, type Room } from 'livekit-client'
import { isSophia } from './sophia-channel.ts'

export const HAND_TOPIC = 'sophia.hand.v1'

export const encodeHand = (hand: boolean) => new TextEncoder().encode(JSON.stringify({ hand }))
const encodeAsk = () => new TextEncoder().encode(JSON.stringify({ ask: true }))

type Packet = { hand: boolean } | { ask: true }

/** A packet: a hand raised or lowered, or an ask; undefined for anything else. */
export function decodeHand(payload: Uint8Array): Packet | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (typeof value !== 'object' || value === null) return undefined
    if ('ask' in value) return value.ask === true ? { ask: true } : undefined
    return 'hand' in value && typeof value.hand === 'boolean' ? { hand: value.hand } : undefined
  } catch {
    return undefined
  }
}

/** How the signal sends on its topic: to everyone in the call, or to these identities alone. */
export type Publish = (data: Uint8Array<ArrayBuffer>, to?: string[]) => Promise<void>

export interface HandSignal {
  /** Raise or lower this person's hand; nothing is sent when it hasn't changed. A send refused puts it back. */
  set: (raised: boolean) => Promise<void>
  /** This person's hand. */
  mine: () => boolean
  /** Whether another person's hand is raised, by their identity. */
  raised: (identity: string) => boolean
}

export function handSignal(room: Pick<Room, 'on'>, publish: Publish, onChange: () => void): HandSignal {
  let mine = false
  /** Each raised hand, with when it was heard: the count of packets heard so far, which only grows. */
  const heard = new Map<string, number>()
  let received = 0
  const tell = (to: string) => void publish(encodeHand(true), [to]).catch(() => undefined)
  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== HAND_TOPIC || !participant || isSophia(participant)) return
    const packet = decodeHand(payload)
    if (!packet) return
    // Asked: a raised hand answers the asker alone; a lowered one says nothing.
    if ('ask' in packet) {
      if (mine) tell(participant.identity)
      return
    }
    received += 1
    if (packet.hand) heard.set(participant.identity, received)
    else heard.delete(participant.identity)
    onChange()
  })
  room.on(RoomEvent.ParticipantConnected, (p) => {
    if (mine && !isSophia(p)) tell(p.identity)
  })
  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    if (heard.delete(p.identity)) onChange()
  })
  room.on(RoomEvent.Reconnected, () => {
    // Counted, not timed: an answer in the same clock tick as the drop's end is still one heard since.
    const upTo = received
    if (mine) {
      mine = false
      void publish(encodeHand(false)).catch(() => undefined)
    }
    onChange()
    publish(encodeAsk())
      .then(() => {
        for (const [identity, at] of heard) if (at <= upTo) heard.delete(identity)
        onChange()
      })
      .catch(() => undefined)
  })
  return {
    set: async (raised) => {
      if (raised === mine) return
      mine = raised
      onChange()
      try {
        await publish(encodeHand(raised))
      } catch (err) {
        if (mine === raised) mine = !raised
        onChange()
        throw err
      }
    },
    mine: () => mine,
    raised: (identity) => heard.has(identity),
  }
}
