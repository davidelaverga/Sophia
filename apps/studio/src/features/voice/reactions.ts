// Reactions in the call (docs/plans/call-reactions.md): Meet's six, as they travel on LiveKit's data channel and as
// the room shows them. Pure, so the rules are unit-tested; reaction-channel.ts listens, useReactions keeps them.

/** Their own data topic: Sophia's bridge reads only the chat's, so a reaction never reaches her. */
export const REACTION_TOPIC = 'sophia.reaction'

export const REACTIONS = [
  { emoji: '👍', name: 'Thumbs up' },
  { emoji: '❤️', name: 'Heart' },
  { emoji: '😂', name: 'Laugh' },
  { emoji: '🎉', name: 'Celebrate' },
  { emoji: '👏', name: 'Clap' },
  { emoji: '😮', name: 'Surprised' },
] as const

export type ReactionEmoji = (typeof REACTIONS)[number]['emoji']

const isReaction = (value: unknown): value is ReactionEmoji => REACTIONS.some((r) => r.emoji === value)

/** A reaction's name, as a screen reader says it. */
export const reactionName = (emoji: ReactionEmoji): string => REACTIONS.find((r) => r.emoji === emoji)?.name ?? ''

export const encodeReaction = (emoji: ReactionEmoji): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(JSON.stringify({ kind: 'reaction', emoji }))

/** A packet read back: one of the six, or nothing for anything else. */
export function parseReaction(bytes: Uint8Array): ReactionEmoji | null {
  try {
    const packet: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof packet !== 'object' || packet === null) return null
    const emoji: unknown = Reflect.get(packet, 'emoji')
    return Reflect.get(packet, 'kind') === 'reaction' && isReaction(emoji) ? emoji : null
  } catch {
    return null
  }
}

/** At most one every 400 ms from here, so a held key never floods the room. */
export const paced = (now: number, last: number | null): boolean => last === null || now - last >= 400

/** How long a reaction floats on screen, and how many at most. */
export const SHOWN_FOR_MS = 4000
const SHOWN_MOST = 12

/** The reactions on screen with one more: the newest twelve. */
export const shownAfter = <T>(shown: readonly T[], next: T): T[] => [...shown, next].slice(-SHOWN_MOST)

/** A reaction on screen: who sent it (this person's own says «You»), and what. */
export interface Reaction {
  id: string
  name: string
  emoji: ReactionEmoji
  local: boolean
}
