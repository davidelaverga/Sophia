// The order the tiles come in. By attention (the default): what waits on an owner first, then what is online, then
// hosts not known, and offline ones last; within each, by owner and tool. Accounts are never ranked by how used they
// are: their percentages come from different providers and windows, which LFE-06.2 forbids weighing against each
// other. Or by owner, or by tool, as a list is read.
import { TOOL, type RequiredAction, type Resource } from './resource.ts'

export type Order = 'attention' | 'owner' | 'tool'
export const ORDERS: Order[] = ['attention', 'owner', 'tool']
export const ORDER_LABEL: Record<Order, string> = { attention: 'Attention', owner: 'Owner', tool: 'Tool' }

const HOST_RANK = { online: 1, unknown: 2, offline: 3 } as const

const byName = (a: Resource, b: Resource) =>
  a.owner.name.localeCompare(b.owner.name) || TOOL[a.tool].localeCompare(TOOL[b.tool])
const byTool = (a: Resource, b: Resource) =>
  TOOL[a.tool].localeCompare(TOOL[b.tool]) || a.owner.name.localeCompare(b.owner.name)

/** How much a resource needs someone: a request waiting on its owner first, then its host's state. */
const rank = (r: Resource, actions: RequiredAction[]) =>
  actions.some((a) => a.resourceId === r.id && a.state === 'open') ? 0 : HOST_RANK[r.host.state]

export function ordered(resources: Resource[], order: Order, actions: RequiredAction[]): Resource[] {
  if (order === 'owner') return resources.toSorted(byName)
  if (order === 'tool') return resources.toSorted(byTool)
  return resources.toSorted((a, b) => rank(a, actions) - rank(b, actions) || byName(a, b))
}
