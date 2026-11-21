// Raised hands in the call (docs/plans/raise-hand.md): each member says their hand in a reliable packet on its own
// topic, to everyone in the call, and only when it changes. What others said is kept by the sender the SFU
// authenticated, so nobody raises another's hand, and nothing touches a participant's attributes or metadata (the API
// signs no one `canUpdateOwnMetadata`); only a member's is heard, as only a member's token can send one. A raised hand
// is said again to whoever joins, and answers an ask, at most once a second for each asker. Back from a drop, this
// person's own hand is lowered and said so, again until it is sent unless they raise it meanwhile, and the room is
// asked for theirs: what was heard before the drop is forgotten once the ask is sent, never an answer heard since.
// Forgotten when its sender leaves.
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { standingOf } from './room-view.ts'
import { isSophia } from './sophia-channel.ts'

export const HAND_TOPIC = 'sophia.hand.v1'

export const encodeHand = (hand: boolean) => new TextEncoder().encode(JSON.stringify({ hand }))
const encodeAsk = () => new TextEncoder().encode(JSON.stringify({ ask: true }))

type Packet = { hand: boolean } | { ask: true }

/** A packet: a hand raised or lowered, or an ask, as the object's own keys; undefined for anything else. */
export function decodeHand(payload: Uint8Array): Packet | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    if (Object.hasOwn(value, 'ask')) return Reflect.get(value, 'ask') === true ? { ask: true } : undefined
    const hand: unknown = Object.hasOwn(value, 'hand') ? Reflect.get(value, 'hand') : undefined
    return typeof hand === 'boolean' ? { hand } : undefined
  } catch {
    return undefined
  }
}

/** A member: the standing the API signed is a role (a guest, Sophia, or someone with none, is not). */
const MEMBERS = new Set(['admin', 'editor', 'viewer'])
const isMember = (p: Participant) => !isSophia(p) && MEMBERS.has(standingOf(p.metadata))

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

/** An ask answered at most once a second for each asker, so a page that keeps asking can't make this one flood. */
const ASK_PACE_MS = 1000
/**
 * How many times a reconnect's ask is tried (Codex P2 on #523): a channel that refuses for a moment is asked again, and
 * one that never takes it (a guest's token has no data grant) is let go after a few tries, never asked forever.
 */
const ASK_TRIES = 4

/**
 * How long after a drop's forget a hand from before, heard again, is still the same raise (the ask's answer), not a new
 * one said to a screen reader (hand-and-sync-announced.md).
 */
const REHEARD_MS = 5000

/** The hands forgotten after a drop, each with its own deadline: until then, one heard again is still the same raise. */
function forgottenHands(now: () => number) {
  const until = new Map<string, number>()
  return {
    keep: (identity: string) => void until.set(identity, now() + REHEARD_MS),
    /** Whether a raise heard now is one from before the drop; asked once, it is no longer kept. */
    heardAgain: (identity: string) => {
      const deadline = until.get(identity)
      until.delete(identity)
      return deadline !== undefined && now() <= deadline
    },
    drop: (identity: string) => void until.delete(identity),
  }
}

/**
 * What others said: each raised hand with the count of packets heard when it was, which only grows. A hand going up
 * is said to `onRaised` once: never when it was already up, nor when it is one from before a drop heard again.
 */
function heardHands(onChange: () => void, onRaised: (identity: string) => void, now: () => number) {
  const heard = new Map<string, number>()
  const forgotten = forgottenHands(now)
  let received = 0
  return {
    said: (identity: string, hand: boolean) => {
      received += 1
      const rising = hand && !heard.has(identity)
      if (hand) heard.set(identity, received)
      else heard.delete(identity)
      if (!hand) forgotten.drop(identity)
      else if (rising && !forgotten.heardAgain(identity)) onRaised(identity)
      onChange()
    },
    left: (identity: string) => {
      forgotten.drop(identity)
      if (heard.delete(identity)) onChange()
    },
    /** How many were heard so far: what a forget after a drop counts up to. */
    count: () => received,
    forget: (upTo: number) => {
      for (const [identity, at] of heard) {
        if (at > upTo) continue
        heard.delete(identity)
        forgotten.keep(identity)
      }
      onChange()
    },
    raised: (identity: string) => heard.has(identity),
  }
}

/**
 * This person's hand: what they chose (`mine`) and each change's turn. A lowering after a drop is sent again every
 * `retryMs` until it goes, while no newer choice and no end of the call has come; one still unsent when the call drops
 * again is sent after that reconnect too (Codex P2 on #523), so others never keep a hand this person sees lowered.
 */
function ownHand(publish: Publish, onChange: () => void, retryMs: number) {
  let mine = false
  /** A lowering others haven't been told of yet. */
  let unsent = false
  let turn = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  const newTurn = () => {
    clearTimeout(retry)
    turn += 1
    return turn
  }
  const lowerUntilSent = (which: number) => {
    publish(encodeHand(false))
      .then(() => {
        if (which === turn) unsent = false
      })
      .catch(() => {
        if (which === turn) retry = setTimeout(() => lowerUntilSent(which), retryMs)
      })
  }
  return {
    mine: () => mine,
    stop: () => void newTurn(),
    /** Back from a drop: lowered here at once, and said so until it goes, if it was raised or its lowering is unsent. */
    lower: () => {
      const which = newTurn()
      if (mine) {
        mine = false
        unsent = true
        onChange()
      }
      if (unsent) lowerUntilSent(which)
    },
    set: async (raised: boolean) => {
      if (raised === mine) return
      const which = newTurn()
      const owed = unsent
      mine = raised
      unsent = false
      onChange()
      try {
        await publish(encodeHand(raised))
      } catch (err) {
        if (which === turn) {
          mine = !raised
          // A raise refused while a lowering was owed: others may still see the hand from before, so it is owed still.
          unsent = owed
          if (owed) lowerUntilSent(newTurn())
        }
        onChange()
        throw err
      }
    },
  }
}

export interface HandOptions {
  retryMs?: number
  now?: () => number
  /** Another member's hand went up, by their identity: once per raise (hand-and-sync-announced.md). */
  onRaised?: (identity: string) => void
}

const noRaise = () => undefined

export function handSignal(
  room: Pick<Room, 'on'>,
  publish: Publish,
  onChange: () => void,
  { retryMs = 2000, now = Date.now, onRaised = noRaise }: HandOptions = {},
): HandSignal {
  const own = ownHand(publish, onChange, retryMs)
  const hands = heardHands(onChange, onRaised, now)
  const answered = new Map<string, number>()
  const tell = (to: string) => void publish(encodeHand(true), [to]).catch(() => undefined)
  const answer = (asker: string) => {
    const last = answered.get(asker)
    if (!own.mine() || (last !== undefined && now() - last < ASK_PACE_MS)) return
    answered.set(asker, now())
    tell(asker)
  }
  room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== HAND_TOPIC || !participant || !isMember(participant)) return
    const packet = decodeHand(payload)
    if (!packet) return
    // Asked: a raised hand answers the asker alone; a lowered one says nothing.
    if ('ask' in packet) answer(participant.identity)
    else hands.said(participant.identity, packet.hand)
  })
  room.on(RoomEvent.ParticipantConnected, (p) => {
    if (own.mine() && !isSophia(p)) tell(p.identity)
  })
  room.on(RoomEvent.ParticipantDisconnected, (p) => hands.left(p.identity))
  // Each reconnect's ask has its own turn; a later reconnect or the call's end stops an earlier one's tries.
  let turn = 0
  const ask = (mine: number, upTo: number, tries: number) => {
    publish(encodeAsk())
      .then(() => {
        if (mine === turn) hands.forget(upTo)
      })
      .catch(() => {
        if (mine === turn && tries < ASK_TRIES) setTimeout(() => ask(mine, upTo, tries + 1), retryMs)
      })
  }
  room.on(RoomEvent.Disconnected, () => {
    turn += 1
    own.stop()
  })
  room.on(RoomEvent.Reconnected, () => {
    turn += 1
    // Counted, not timed: an answer in the same clock tick as the drop's end is still one heard since.
    own.lower()
    ask(turn, hands.count(), 1)
  })
  return { set: own.set, mine: own.mine, raised: hands.raised }
}
