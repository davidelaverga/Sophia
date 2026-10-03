// The account, one control in every bar (the places' and a project's): the avatar opens a menu with who is signed in,
// "Your data" and how privacy works, passkeys, and signing out. From a project the first two open at home, where the
// personal space's own sheets are. Locally the dev identity is chosen in its head. It closes like any popover
// (usePopover): Escape returns to the avatar, a press anywhere else closes it.
import { useState } from 'react'
import { Tip } from '@sophia/ui'
import { authMode, passkeysOffered } from './auth.ts'
import { Avatar } from './Avatar.tsx'
import { devIdentities, type Identity } from './dev-identity.ts'
import { PasskeySheet } from './PasskeySheet.tsx'
import { usePopover } from './usePopover.ts'

export interface AccountActions {
  data: () => void
  privacy: () => void
  chooseDev: (identity: Identity | null) => void
  signOut: () => void
}

/** Where the menu is: in the places D opens your data; in a project it takes you home first. */
type Where = 'places' | 'project'

const DATA_TIP: Record<Where, { label: string; keys: string | null }> = {
  places: { label: 'What your personal space keeps', keys: 'D' },
  project: { label: 'Opens at home', keys: null },
}

function DevChoice({ identity, onChoose }: { identity: Identity; onChoose: (i: Identity | null) => void }) {
  return (
    <select
      aria-label="Acting as"
      value={identity.name}
      onChange={(e) => onChoose(devIdentities.find((i) => i.name === e.target.value) ?? null)}
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
  )
}

function Head({ identity, onChoose }: { identity: Identity; onChoose: (i: Identity | null) => void }) {
  return (
    <div className="menu-head">
      {identity.displayName ?? identity.name}
      {authMode === 'dev' ? (
        <DevChoice identity={identity} onChoose={onChoose} />
      ) : (
        identity.displayName && <span>{identity.name}</span>
      )}
    </div>
  )
}

interface Props {
  identity: Identity
  where: Where
  actions: AccountActions
}

export function AccountMenu({ identity, where, actions }: Props) {
  const [open, setOpen] = useState(false)
  const [passkeys, setPasskeys] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  // The item goes with the menu: its button takes the focus first, so a sheet the item opens gives it back there.
  const pick = (run: () => void) => () => {
    menu.opener.current?.focus()
    setOpen(false)
    run()
  }
  const tip = DATA_TIP[where]
  return (
    <div ref={menu.wrap} className="account">
      <button
        ref={menu.opener}
        className="account-btn has-tip"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen(!open)}
      >
        <Avatar identity={identity} />
        <Tip label="Account" side="bottom" align="end" />
      </button>
      {open && (
        <div ref={menu.panel} className="account-menu" role="menu" aria-label="Account" onKeyDown={menu.onKeyDown}>
          <Head identity={identity} onChoose={actions.chooseDev} />
          <button role="menuitem" type="button" tabIndex={-1} className="has-tip" onClick={pick(actions.data)}>
            Your data
            <Tip label={tip.label} {...(tip.keys ? { keys: tip.keys } : {})} side="bottom" align="end" />
          </button>
          <button role="menuitem" type="button" tabIndex={-1} onClick={pick(actions.privacy)}>
            How privacy works
          </button>
          <span className="menu-sep" aria-hidden />
          {passkeysOffered && authMode !== 'dev' && (
            <button role="menuitem" type="button" tabIndex={-1} onClick={pick(() => setPasskeys(true))}>
              Passkeys
            </button>
          )}
          <button role="menuitem" type="button" tabIndex={-1} onClick={pick(actions.signOut)}>
            Sign out
          </button>
        </div>
      )}
      {passkeys && <PasskeySheet onClose={() => setPasskeys(false)} />}
    </div>
  )
}
