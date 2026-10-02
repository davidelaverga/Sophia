// An owner as the Studio shows a person: their account's picture when there is one and it loads, else their initial.
import { Avatar } from '../../app/Avatar.tsx'
import type { Resource } from './resource.ts'

export function OwnerAvatar({ owner }: { owner: Resource['owner'] }) {
  return (
    <span className="resource-avatar">
      <Avatar identity={{ name: owner.name, displayName: owner.name, avatarUrl: owner.avatarUrl ?? null }} />
    </span>
  )
}
