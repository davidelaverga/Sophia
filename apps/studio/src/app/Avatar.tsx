// A person's avatar: the provider's picture when there is one and it loads, otherwise their initial.
import { useState } from 'react'
import type { Identity } from './dev-identity.ts'
import { initialOf } from './profile.ts'

export function Avatar({ identity }: { identity: Pick<Identity, 'name' | 'displayName' | 'avatarUrl'> }) {
  const [broken, setBroken] = useState(false)
  if (identity.avatarUrl && !broken) {
    return (
      <img
        className="avatar"
        src={identity.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span className="avatar" aria-hidden>
      {initialOf(identity.displayName, identity.name)}
    </span>
  )
}
