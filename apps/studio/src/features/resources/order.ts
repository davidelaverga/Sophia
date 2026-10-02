// The order the tiles come in. By attention (the default): what waits on an owner first, then what is online, the
// most used account first, then hosts not known, and offline ones last. Or by owner, or by tool, as a list is read.
import { capacity, TOOL, type QuotaObservation, type RequiredAction, type Resource } from './resource.ts'

export type Order = 'attention' | 'owner' | 'tool'
export const ORDERS: Order[] = ['attention', 'owner', 'tool']
export const ORDER_LABEL: Record<Order, string> = { attention: 'Attention', owner: 'Owner', tool: 'Tool' }

const HOST_RANK = { online: 1, unknown: 2, offline: 3 } as const

interface Context {
  actions: RequiredAction[]
  observations: QuotaObservation[]
  now: Date
}

const byName = (a: Resource, b: Resource) =>
  a.owner.name.localeCompare(b.owner.name) || TOOL[a.tool].localeCompare(TOOL[b.tool])
const byTool = (a: Resource, b: Resource) =>
  TOOL[a.tool].localeCompare(TOOL[b.tool]) || a.owner.name.localeCompare(b.owner.name)

/** How much a resource needs someone: its rank (lower first), then how used its account is (more first). */
function need(r: Resource, { actions, observations, now }: Context): [number, number] {
  const waits = actions.some((a) => a.resourceId === r.id && a.state === 'open')
  const used = capacity(
    observations.find((o) => o.entitlement_id === r.entitlementId),
    now,
  ).limiting?.percent
  return [waits ? 0 : HOST_RANK[r.host.state], used ?? -1]
}

export function ordered(resources: Resource[], order: Order, context: Context): Resource[] {
  if (order === 'owner') return resources.toSorted(byName)
  if (order === 'tool') return resources.toSorted(byTool)
  const needs = new Map(resources.map((r) => [r.id, need(r, context)]))
  return resources.toSorted((a, b) => {
    const [rankA = 0, usedA = 0] = needs.get(a.id) ?? []
    const [rankB = 0, usedB = 0] = needs.get(b.id) ?? []
    return rankA - rankB || usedB - usedA || byName(a, b)
  })
}
