// An owner as the Studio shows a person: their account's picture when there is one and it loads, else their initial.
// An owner whose name isn't known (A51's catalog, a null label: INC01-DES-002) gets a neutral mark, never a letter that
// would read as a name, and never their id.
import { Avatar } from '../../app/Avatar.tsx'
import type { Resource } from './resource.ts'

export function OwnerAvatar({ owner }: { owner: Resource['owner'] }) {
  if (owner.named === false) {
    return (
      <span className="resource-avatar">
        <span className="resource-avatar-unknown" aria-hidden />
      </span>
    )
  }
  return (
    <span className="resource-avatar">
      <Avatar identity={{ name: owner.name, displayName: owner.name, avatarUrl: owner.avatarUrl ?? null }} />
    </span>
  )
}
