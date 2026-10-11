// What needs the person, read for Home (docs/plans/needs-api.md): the proposed read (A15), under the vision flag, every
// 20 s as the projects are; and the way to each need, where it lives. Undefined while the flag is off, the read is on
// its way or failed: Home is then as it was, her light alone.
import { useQuery } from '@tanstack/react-query'
import type { Need as WireNeed } from '@sophia/contracts'
import { listNeeds, needsOf, whereOf } from '../../api/needs.ts'
import type { View } from '../../app/route.ts'
import { VISION } from '../../app/vision.ts'
import type { Need } from './needs-you.ts'

export interface NeedsGo {
  project: (projectId: string, view: View) => void
  personal: () => void
}

export type NeedsSeen = { items: readonly Need[]; open: (need: Need) => void }

/** Opens a need where it lives. */
export function openNeed(wire: readonly WireNeed[], go: NeedsGo, need: Need): void {
  const found = wire.find((w) => w.id === need.id)
  const where = found ? whereOf(found) : { place: 'personal' as const }
  if ('place' in where) go.personal()
  else go.project(where.projectId, where.view)
}

export function useNeeds(token: string, go: NeedsGo, enabled = VISION): NeedsSeen | undefined {
  const read = useQuery({
    queryKey: ['vision', 'needs', token],
    queryFn: ({ signal }) => listNeeds(token, signal),
    enabled,
    refetchInterval: 20_000,
    retry: false,
  })
  const wire = read.data?.needs
  if (!wire) return undefined
  return { items: needsOf({ needs: wire }), open: (need) => openNeed(wire, go, need) }
}
