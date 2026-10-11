// What needs the person, read for Home (docs/plans/needs-api.md): the proposed read (A15), under the vision flag, every
// 20 s as the projects are; and the way to each need, where it lives. Undefined while the flag is off, the padlock is
// shut (the read carries Sophia's replies: nothing personal is read or kept while it is), the read is on its way or
// failed: Home is then as it was, her light alone.
import { useQuery } from '@tanstack/react-query'
import type { Need as WireNeed } from '@sophia/contracts'
import { clockSkew, listNeeds, needsOf, whereOf, type NeedAt } from '../../api/needs.ts'
import type { View } from '../../app/route.ts'
import { VISION } from '../../app/vision.ts'
import type { Need } from './needs-you.ts'

export interface NeedsGo {
  /** A project's view, at the record the need names when the Studio has an address for it. */
  project: (projectId: string, view: View, at: NeedAt) => void
  personal: () => void
}

/** Home's needs, their opener, and the service's clock against the browser's (ms to add to now). */
export type NeedsSeen = { items: readonly Need[]; open: (need: Need) => void; skew: number }

export interface NeedsOptions {
  /** The vision flag by default; the fixture decides for itself. */
  enabled?: boolean
  /** The personal padlock: shut, nothing is read and nothing read is shown. */
  locked?: boolean
}

/** Opens a need where it lives. */
export function openNeed(wire: readonly WireNeed[], go: NeedsGo, need: Need): void {
  const found = wire.find((w) => w.id === need.id)
  const where = found ? whereOf(found) : { place: 'personal' as const }
  if ('place' in where) go.personal()
  else go.project(where.projectId, where.view, where.at)
}

export function useNeeds(token: string, go: NeedsGo, options: NeedsOptions = {}): NeedsSeen | undefined {
  const { enabled = VISION, locked = false } = options
  const read = useQuery({
    queryKey: ['vision', 'needs', token],
    // When the answer arrived, beside it: `readAt` is the service's clock and this is the browser's, at the same moment.
    queryFn: async ({ signal }) => ({ list: await listNeeds(token, signal), receivedAt: Date.now() }),
    enabled: enabled && !locked,
    refetchInterval: 20_000,
    retry: false,
  })
  const got = read.data
  if (!got || locked) return undefined
  const wire = got.list.needs
  return {
    items: needsOf(got.list),
    open: (need) => openNeed(wire, go, need),
    skew: clockSkew(got.list.readAt, got.receivedAt),
  }
}
