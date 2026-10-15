// Reactions as the room hears them (docs/plans/call-reactions.md): on their own data topic, from a person in the room,
// one of the six; anything else, and anything from Sophia's participant, is let go. Pure of the connection's other
// listeners, so the fixture's LiveKit runs the same check.
import { RoomEvent, type Room } from 'livekit-client'
import { parseReaction, REACTION_TOPIC, type ReactionEmoji } from './reactions.ts'
import { isSophia } from './sophia-channel.ts'

export interface Heard {
  identity: string
  name: string
  emoji: ReactionEmoji
}

export function listenToReactions(room: Pick<Room, 'on'>, onReaction: (heard: Heard) => void): void {
  room.on(RoomEvent.DataReceived, (bytes, who, _kind, topic) => {
    if (topic !== REACTION_TOPIC || !who || isSophia(who)) return
    const emoji = parseReaction(bytes)
    if (emoji) onReaction({ identity: who.identity, name: who.name || who.identity.slice(0, 8), emoji })
  })
}
