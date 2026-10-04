// What this Studio takes from Sophia in the room (livekit-room.ts): who she is, the packets she sends on the reply
// topic, and the moments when a live caption she was sending may never get its end here. Apart from the connection
// itself, so the dispatch is unit-tested.
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { CHAT_REPLY_TOPIC, parseChatPacket, type ChatPacket } from '@sophia/contracts/room-chat'
import type { RoomCallbacks } from './livekit-room.ts'

/** The bridge: the identity no person can be issued, with the standing only the API signs (amendment A06). */
export function isSophia(p: Participant): boolean {
  if (p.identity !== 'sophia') return false
  try {
    const value: unknown = JSON.parse(p.metadata ?? 'null')
    return typeof value === 'object' && value !== null && 'sophia' in value && value.sophia === true
  } catch {
    return false
  }
}

/** Each packet to its kind's callback; what Studio itself sends (input, mode) is never taken from her. */
export function fromSophia(packet: ChatPacket, cb: RoomCallbacks): void {
  if (packet.kind === 'notice') cb.onNotice?.(packet)
  else if (packet.kind === 'caption') cb.onCaption?.(packet)
  else if (packet.kind !== 'input' && packet.kind !== 'mode') cb.onChat?.(packet)
}

/**
 * Sophia's chat replies, result notices and live captions; anything else on the reply topic, or from anyone else, is
 * ignored. A caption under way may never get its end here when she leaves or joins again (her bridge's link was lost,
 * or it restarted) or while this connection is reconnecting: then the captions are told so (CX-0023).
 */
export function listenToSophia(room: Pick<Room, 'on'>, cb: RoomCallbacks): void {
  room.on(RoomEvent.DataReceived, (bytes, who, _kind, topic) => {
    if (topic !== CHAT_REPLY_TOPIC || !who || !isSophia(who)) return
    const packet = parseChatPacket(bytes)
    if (packet) fromSophia(packet, cb)
  })
  const herCaptionsLost = (p: Participant) => {
    if (isSophia(p)) cb.onCaptionsLost?.()
  }
  room.on(RoomEvent.ParticipantDisconnected, herCaptionsLost)
  room.on(RoomEvent.ParticipantConnected, herCaptionsLost)
  room.on(RoomEvent.Reconnecting, () => cb.onCaptionsLost?.())
}
