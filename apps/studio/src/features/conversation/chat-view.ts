// The typed chat's pure rules: how replies fold into turns, what the foot of the chat offers, and what its status
// line says. React only renders them.
import type { SophiaPresence } from '@sophia/contracts'
import type { ChatReply } from '@sophia/contracts/room-chat'

export interface ChatTurn {
  id: string
  exchangeId: string
  text: string
  reply: string
  sequence: number
  state: 'sending' | 'responding' | 'complete' | 'refused' | 'unknown'
  reason: string | null
}

/** Duplicate/out-of-session packets cannot append another reply. No content is written to browser storage. */
export function receiveChat(turns: readonly ChatTurn[], packet: ChatReply): ChatTurn[] {
  return turns.map((t) => {
    if (t.state === 'complete' || t.state === 'refused') return t
    if (t.id !== packet.id || t.exchangeId !== packet.exchangeId || packet.sequence <= t.sequence) return t
    return {
      ...t,
      sequence: packet.sequence,
      reply: packet.kind === 'delta' ? t.reply + packet.text : t.reply,
      state: packet.kind === 'delta' || packet.kind === 'accepted' ? 'responding' : packet.kind,
      reason: packet.kind === 'refused' ? packet.text : null,
    }
  })
}

/** What the foot of the chat offers: its one way in, or the message bar. Never both. */
export type ChatEntry = 'start' | 'bar'

/**
 * The message bar is there only while there is a conversation to type into: this person is in the room and Sophia's
 * exchange exists (open, or paused). Until then the chat offers one way in, Chat with Sophia, which joins in text
 * mode and opens the exchange. A bar that cannot send, beside a button that starts, read as two ways to do one thing.
 */
export function chatEntry(inRoom: boolean, presence: SophiaPresence | undefined): ChatEntry {
  return inRoom && !!presence && presence.exchange !== 'none' ? 'bar' : 'start'
}

/** Typed words reach Sophia: her exchange is open and she is ready to take them. */
export function reachesSophia(presence: SophiaPresence | undefined): boolean {
  return presence?.exchange === 'open' && presence.voice === 'ready'
}

export interface ChatMoment {
  /** Chat with Sophia is under way. */
  starting: boolean
  /** The room connection is live, not reconnecting. */
  live: boolean
  /** This person holds the floor, so their words are the ones Sophia takes. */
  mine: boolean
  /** Sophia's replies are read, not heard. */
  textMode: boolean
}

/**
 * The line above the message bar: why Send waits, close to the room's own words for the same states, or that typing
 * reaches Sophia. Null when the bar speaks for itself. Whenever this returns a reason, Send is disabled.
 */
export function chatLine(presence: SophiaPresence, at: ChatMoment): string | null {
  if (at.starting) return 'Connecting to Sophia…'
  if (presence.exchange === 'paused')
    return presence.pauseReason === 'guest'
      ? 'Sophia is paused while a guest is here.'
      : 'Sophia is paused. Resume in the room.'
  if (!at.live) return 'Reconnecting to the room…'
  if (presence.voice === 'unavailable') return 'Sophia is unavailable right now.'
  if (presence.voice === 'recovering') return 'Reconnecting to Sophia…'
  if (presence.voice !== 'ready') return 'Sophia is joining…'
  if (!at.mine) return 'Take the floor to message Sophia.'
  return at.textMode ? 'Typing to Sophia' : null
}
