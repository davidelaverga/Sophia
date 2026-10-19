// Who the served board names (docs/plans/served-names.md; informe-25 DL-05). The board's view carries people's ids
// only, so each name comes from the project's members (A25), said as the stage says it (an address is no name), and the
// viewer as their account says. A member with no name, or an id no active member has, is left out on purpose: the
// board's own words then read («for someone», «Someone decides»), never an invented name.
import type { ProjectMember } from '@sophia/contracts'
import type { Identity } from '../../../app/dev-identity.ts'
import { spokenName } from '../../conversation/conversation-view.ts'
import type { Resource } from '../../resources/resource.ts'

type Person = Resource['owner']

/** The viewer as the board names them: their account's name, an address said as a name; null when not known. */
export function viewerOf(identity: Identity, viewerId: string | null): Person | null {
  if (viewerId === null) return null
  return {
    id: viewerId,
    name: identity.displayName ?? spokenName(identity.name),
    avatarUrl: identity.avatarUrl ?? null,
  }
}

/** Every member the project knows by name, then the viewer, whose own account wins over the room's name for them. */
export function boardPeople(viewer: Person | null, members: readonly ProjectMember[]): Record<string, Person> {
  const named = members.flatMap((m) =>
    m.name === null ? [] : [[m.actorId, { id: m.actorId, name: spokenName(m.name), avatarUrl: null }] as const],
  )
  return { ...Object.fromEntries(named), ...(viewer ? { [viewer.id]: viewer } : {}) }
}
