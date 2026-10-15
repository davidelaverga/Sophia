// A new project's first step (docs/plans/first-step.md): while nothing is recorded, no goal exists and nobody is in the
// call, the room says to tell Sophia what the project is for. Pure: the stage only renders it.
import type { MissionContext } from '@sophia/contracts'
import type { RoomLine } from '../voice/room-view.ts'

/** New: the ledger read and empty, no goal, nobody in the call. Unread, it is not called new: nothing is guessed. */
export const isNew = (p: { ledger: MissionContext['readState'] | undefined; goals: number; inCall: boolean }) =>
  p.ledger === 'empty' && p.goals === 0 && !p.inCall

/** Sophia's line while the project is new. */
export const FIRST_LINE: RoomLine = { text: 'A new project', note: 'Start by telling Sophia what it’s for.' }
