// Who is acting: a dev-identity switcher, or the signed-in person with Sign out.
import { shortName } from '../features/voice/room-view.ts'
import { authMode } from './auth.ts'
import { devIdentities, type Identity } from './dev-identity.ts'

interface Props {
  identity: Identity
  onChooseDev: (identity: Identity | null) => void
  onSignOut: () => void
}

export function IdentityControl({ identity, onChooseDev, onSignOut }: Props) {
  if (authMode === 'dev') {
    return (
      <label className="identity">
        <span className="avatar" aria-hidden>
          {shortName(identity.name).charAt(0)}
        </span>
        <span className="sr-only">Acting as</span>
        <select
          value={identity.name}
          onChange={(e) => onChooseDev(devIdentities.find((i) => i.name === e.target.value) ?? null)}
        >
          {/* The dev guest is for invitation links (/join), not the member Studio. */}
          {devIdentities
            .filter((i) => i.role !== 'guest')
            .map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
        </select>
      </label>
    )
  }
  return (
    <span className="identity">
      <span className="avatar" aria-hidden>
        {shortName(identity.name).charAt(0)}
      </span>
      <span className="identity-name" title={identity.name}>
        {identity.name}
      </span>
      <button type="button" className="ghost" onClick={onSignOut}>
        Sign out
      </button>
    </span>
  )
}
