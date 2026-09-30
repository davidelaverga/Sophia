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
