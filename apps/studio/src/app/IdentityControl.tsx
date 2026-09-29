// Who is acting: a dev-identity switcher, or the signed-in person with Sign out.
import { useState } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { shortName } from '../features/voice/room-view.ts'
import { authMode, passkeysOffered } from './auth.ts'
import { PasskeySheet } from './PasskeySheet.tsx'
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
      {passkeysOffered && identity.role !== 'guest' && <PasskeysButton />}
      <button type="button" className="ghost" onClick={onSignOut}>
        Sign out
      </button>
    </span>
  )
}

function PasskeysButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="round has-tip" aria-label="Passkeys" onClick={() => setOpen(true)}>
        <Icon name="passkey" />
        <Tip label="Passkeys" side="bottom" align="end" />
      </button>
      {open && <PasskeySheet onClose={() => setOpen(false)} />}
    </>
  )
}
