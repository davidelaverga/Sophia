// The order the tiles come in. By attention (the default): what waits on an owner first, then what is online, then
// hosts not known, and offline ones last; within each, by owner and tool. Accounts are never ranked by how used they
// are: their percentages come from different providers and windows, which LFE-06.2 forbids weighing against each
// other. Or by owner, or by tool, as a list is read. Or as the viewer arranged them by hand (custom): dragged, or
// moved with Alt and the arrows; a resource they haven't placed yet comes after, by attention.
import { TOOL, type RequiredAction, type Resource } from './resource.ts'

export type Order = 'attention' | 'owner' | 'tool' | 'custom'
export const ORDERS: Order[] = ['attention', 'owner', 'tool', 'custom']
export const ORDER_LABEL: Record<Order, string> = {
  attention: 'Attention',
  owner: 'Owner',
  tool: 'Tool',
  custom: 'Custom',
}

const HOST_RANK = { online: 1, unknown: 2, offline: 3 } as const

const byName = (a: Resource, b: Resource) =>
  a.owner.name.localeCompare(b.owner.name) || TOOL[a.tool].localeCompare(TOOL[b.tool])
const byTool = (a: Resource, b: Resource) =>
  TOOL[a.tool].localeCompare(TOOL[b.tool]) || a.owner.name.localeCompare(b.owner.name)

/** How much a resource needs someone: a request waiting on its owner first, then its host's state. */
const rank = (r: Resource, actions: RequiredAction[]) =>
  actions.some((a) => a.resourceId === r.id && a.state === 'open') ? 0 : HOST_RANK[r.host.state]

export function ordered(
  resources: Resource[],
  order: Order,
  actions: RequiredAction[],
  custom: readonly string[] = [],
): Resource[] {
  if (order === 'owner') return resources.toSorted(byName)
  if (order === 'tool') return resources.toSorted(byTool)
  const byAttention = resources.toSorted((a, b) => rank(a, actions) - rank(b, actions) || byName(a, b))
  if (order !== 'custom') return byAttention
  const place = (r: Resource) => {
    const at = custom.indexOf(r.id)
    return at < 0 ? Infinity : at
  }
  return byAttention.toSorted((a, b) => place(a) - place(b))
}

/**
 * The order with one resource moved into another's place: before it when moving back, after it when moving on, as a
 * tile dropped on another takes its place. Unchanged when either isn't in the order.
 */
export function placed(ids: readonly string[], id: string, target: string): string[] {
  const from = ids.indexOf(id)
  const to = ids.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...ids]
  const rest = ids.filter((x) => x !== id)
  return [...rest.slice(0, to), id, ...rest.slice(to)]
}
