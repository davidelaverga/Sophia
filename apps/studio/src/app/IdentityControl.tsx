// Who is acting: a dev-identity switcher, or the signed-in person with Sign out.
import { useState } from 'react'
import { shortName } from '../features/voice/room-view.ts'
import { authMode, passkeysOffered } from './auth.ts'
import { PasskeySheet } from './PasskeySheet.tsx'
import { devIdentities, type Identity } from './dev-identity.ts'
import { initialOf } from './profile.ts'

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
  const shown = identity.displayName ?? identity.name
  return (
    <span className="identity">
      <Avatar identity={identity} />
      <span
        className="identity-name"
        title={identity.displayName ? `${identity.displayName} · ${identity.name}` : shown}
      >
        <span className="sr-only">Signed in as </span>
        {shown}
      </span>
      {passkeysOffered && identity.role !== 'guest' && <PasskeysButton />}
      <button type="button" className="ghost" onClick={onSignOut}>
        Sign out
      </button>
    </span>
  )
}

/** The provider's picture when there is one and it loads; otherwise the initial, as before. */
function Avatar({ identity }: { identity: Identity }) {
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

function PasskeysButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="ghost" onClick={() => setOpen(true)}>
        Passkeys
      </button>
      {open && <PasskeySheet onClose={() => setOpen(false)} />}
    </>
  )
}
