// A task's doer's account, as the board says it (LFE-06.6): what it is short of, in a few words for its tile and its
// sheet, and where there is room (room.ts). Said only for a task its session is at: a finished one, or one no session
// works on yet, says nothing, whatever its account.
import type { QuotaObservation, Resource } from '../../resources/resource.ts'
import { capacityOf, roomElsewhere, shortTileWords, shortWords, type Room } from '../../resources/room.ts'
import type { Mark, PlanRow } from './plan.ts'

/** The marks of a task whose session is at it: running, waiting, queued for it, or held with its allowance kept. */
const AT_IT: ReadonlySet<Mark> = new Set(['waiting', 'working', 'queued', 'held'])

export interface Account {
  /** "runs out in ~34 min", for its sheet; null when it isn't short. */
  short: string | null
  /** "out in ~34 min", for its tile. */
  tile: string | null
  room: Room | null
}

export interface Readings {
  observations?: readonly QuotaObservation[] | undefined
  resources: readonly Resource[]
  now: Date
  viewerId?: string | null | undefined
}

const NOTHING: Account = { short: null, tile: null, room: null }

export function accountOf(row: PlanRow, { observations, resources, now, viewerId }: Readings): Account {
  const resource = row.doer.resource
  if (!resource || !observations || !AT_IT.has(row.status.mark)) return NOTHING
  const held = capacityOf(resource, observations, now)
  return {
    short: shortWords(held),
    tile: shortTileWords(held),
    room: roomElsewhere(resource, resources, observations, now, viewerId ?? ''),
  }
}
