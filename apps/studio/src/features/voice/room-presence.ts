// Who is in a project's room before this person joins (one-truth.md): the presence the server gives Home and Work
// (`ProjectSummary.room`), so People and Join say what Home says. In the call, the call's own list wins. The API sends
// `room: null` when it couldn't ask the room server in time (or there is none): unknown, never nobody.
import type { ProjectList } from '@sophia/contracts'
import { inTheRoom } from '../personal/places-view.ts'
import { shortName } from './room-view.ts'

/**
 * What the server last said of a room: still being read, unknown (the read failed, the project isn't listed, or the
 * server couldn't say), or who was in it.
 */
export type RoomPresence =
  { known: false; settled: boolean } | { known: true; people: readonly string[]; sophia: boolean; words: string | null }

export const READING: RoomPresence = { known: false, settled: false }
export const UNKNOWN: RoomPresence = { known: false, settled: true }

/** The room of `projectId` in the person's project list; unknown when the list doesn't have it or can't say. */
export function presenceIn(list: ProjectList | undefined, projectId: string): RoomPresence {
  const room = list?.projects.find((p) => p.projectId === projectId)?.room
  if (!room) return UNKNOWN
  return { known: true, people: room.people.map(shortName), sophia: room.sophia, words: inTheRoom(room) }
}

/** The read of the person's project list, as the query holds it. */
export interface ListRead {
  data: ProjectList | undefined
  dataUpdatedAt: number
  isError: boolean
}

/**
 * What the latest read says now: failed, unknown, even with an older answer kept (it is no longer current); not yet
 * answered since this person left the call (`leftAt`), still being read; else the room it lists.
 */
export function presenceRead(read: ListRead, leftAt: number, projectId: string): RoomPresence {
  if (read.isError) return UNKNOWN
  if (read.data === undefined || read.dataUpdatedAt < leftAt) return READING
  return presenceIn(read.data, projectId)
}

/** The initials Join shows beside its words (Work's card shows the same): at most three, in the server's order. */
export const facesOf = (presence: RoomPresence): readonly string[] =>
  presence.known ? presence.people.slice(0, 3).map((name) => name.charAt(0)) : []
