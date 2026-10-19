// Who the chat's message bar writes to (docs/plans/room-discussion.md): the room, always; Sophia too, while the person
// can talk to her now. A message being written keeps the target it was begun for: it never goes somewhere else
// because the call dropped or someone else took the floor. And what its line says of the room's message offline,
// beside the room's own note. Pure, so the rules and their words are unit-tested.
import { OFFLINE_WAITS, offlineWords } from '../personal/online.ts'
import { OFFLINE_END, OFFLINE_JOIN } from '../voice/call-end.ts'

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

/**
 * What the bar's line says of the room's message while offline (costuras seam #8): what waits (offlineWords) in place
 * of what it said (`words`). The room's note in the chat's foot above it may say offline already. Under the lost
 * call's line, the bar adds no line of its own, and of a held message says only that it isn't confirmed (#467). Under
 * the Join from rest's line, a held message and words written keep their own lines (Luis 2026-10-19 chose the held
 * message's words), and only an empty bar's «Your words wait here», which would say offline again with nothing of
 * its own, steps aside.
 */
export function offlineBarWords(
  field: { going: boolean; held: string | null; written: boolean },
  words: string | null,
  roomNote: string | null,
): string | null {
  if (roomNote === OFFLINE_END) return field.held === null ? null : words
  const waits = offlineWords(field)
  if (roomNote === OFFLINE_JOIN && waits === OFFLINE_WAITS) return null
  return waits ?? words
}
