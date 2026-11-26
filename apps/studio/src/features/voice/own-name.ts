// This person in the call, named as they named themselves (one-truth.md). The call names each participant by
// the name their room token carried when they joined; a name saved since then reaches the others at their next join,
// and this tab at once: its own tile, People and the hand line read the saved name.
import type { RoomParticipant } from './room-view.ts'

/** The room with this person's own participant named `name`; the same room when there is nothing to change. */
export function withOwnName<R extends { participants: RoomParticipant[] }>(room: R, name: string | null): R {
  if (!name) return room
  const index = room.participants.findIndex((p) => p.local && p.name !== name)
  const me = room.participants[index]
  if (!me) return room
  return { ...room, participants: room.participants.with(index, { ...me, name }) }
}
