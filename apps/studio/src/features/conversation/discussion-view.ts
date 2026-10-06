// Who the chat's message bar writes to (docs/plans/room-discussion.md): the room, always; Sophia too, while the person
// can talk to her now. A message being written keeps the target it was begun for: it never goes somewhere else
// because the call dropped or someone else took the floor. Pure, so the rule and its words are unit-tested.

export type Target = 'room' | 'sophia'

/** The targets the bar offers: the room always, Sophia while her conversation is open and the person holds the floor. */
export const targetsOf = (sophiaReady: boolean): readonly Target[] => (sophiaReady ? ['sophia', 'room'] : ['room'])

/** Where an empty bar starts: Sophia when she is ready (talking to her is what the bar did before), else the room. */
export const defaultTarget = (sophiaReady: boolean): Target => (sophiaReady ? 'sophia' : 'room')

export interface BarTarget {
  target: Target
  /** The other target the switch offers; null when there is none. */
  other: Target | null
  /** The message was begun for Sophia, who can't take it now: nothing is sent until the person moves it to the room. */
  held: boolean
}

/**
 * The bar's target: the one the message was begun for (`chosen`, fixed once something is written, or by the switch),
 * else where an empty bar starts. A message begun for Sophia stays hers while she can't take it: held, not moved.
 */
export function barTarget(chosen: Target | null, sophiaReady: boolean): BarTarget {
  const target = chosen ?? defaultTarget(sophiaReady)
  const held = target === 'sophia' && !sophiaReady
  const other = held ? 'room' : (targetsOf(sophiaReady).find((t) => t !== target) ?? null)
  return { target, other, held }
}

export const TARGET_WORDS: Record<Target, { label: string; placeholder: string }> = {
  room: { label: 'To the room', placeholder: 'Message the room…' },
  sophia: { label: 'To Sophia', placeholder: 'Message Sophia…' },
}

/** What a held message says: why it waits, and the way on. */
export const HELD_WORDS = 'Sophia can’t take this message now. Send it to the room instead?'
