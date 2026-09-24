// Who is acting: a dev-identity switcher, or the signed-in email with Sign out.
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
        <span className="sr-only">Acting as</span>
        <select
          value={identity.name}
          onChange={(e) => onChooseDev(devIdentities.find((i) => i.name === e.target.value) ?? null)}
        >
          {devIdentities.map((i) => (
            <option key={i.name} value={i.name}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <span className="identity-chip">
      <span className="identity-name" title={identity.name}>
        {identity.name}
      </span>
      <button type="button" className="quiet" onClick={onSignOut}>
        Sign out
      </button>
    </span>
  )
}
