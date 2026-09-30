// The account, behind the avatar (direction C): "Your data" and how privacy works live with the account, not in the
// bar; so do passkeys and signing out. Locally, the dev identity is chosen here.
import { useEffect, useRef, useState } from 'react'
import { authMode, passkeysOffered } from '../../app/auth.ts'
import { devIdentities, type Identity } from '../../app/dev-identity.ts'
import { PasskeySheet } from '../../app/PasskeySheet.tsx'
import { initialOf } from '../../app/profile.ts'

interface Props {
  identity: Identity
  open: boolean
  onOpen: (open: boolean) => void
  actions: {
    data: () => void
    privacy: () => void
    chooseDev: (identity: Identity | null) => void
    signOut: () => void
  }
}

function Avatar({ identity }: { identity: Identity }) {
  const [broken, setBroken] = useState(false)
  if (identity.avatarUrl && !broken) {
    return (
      <img
        className="ps-avatar"
        src={identity.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }
  return <span className="ps-avatar">{initialOf(identity.displayName, identity.name)}</span>
}

/** Up and Down move through the items, as in any menu. */
function moveFocus(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const at = items.findIndex((i) => i === document.activeElement)
  items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
}

function DevChoice({ identity, onChoose }: { identity: Identity; onChoose: (i: Identity | null) => void }) {
  return (
    <select
      aria-label="Acting as"
      value={identity.name}
      onChange={(e) => onChoose(devIdentities.find((i) => i.name === e.target.value) ?? null)}
    >
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

export function AccountMenu({ identity, open, onOpen, actions }: Props) {
  const menu = useRef<HTMLDivElement>(null)
  const [passkeys, setPasskeys] = useState(false)
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])
  const pick = (run: () => void) => () => {
    onOpen(false)
    run()
  }
  const dev = authMode === 'dev'
  return (
    <div className="acct">
      <button
        className="avatar-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => onOpen(!open)}
      >
        <Avatar identity={identity} />
      </button>
      {open && (
        <div ref={menu} className="menu" role="menu" onKeyDown={moveFocus}>
          <div className="menu-head">
            {identity.displayName ?? identity.name}
            {!dev && identity.displayName && <span>{identity.name}</span>}
            {dev && <DevChoice identity={identity} onChoose={actions.chooseDev} />}
          </div>
          <button role="menuitem" type="button" onClick={pick(actions.data)}>
            Your data <kbd>D</kbd>
          </button>
          <button role="menuitem" type="button" onClick={pick(actions.privacy)}>
            How privacy works
          </button>
          <span className="menu-sep" aria-hidden />
          {passkeysOffered && !dev && (
            <button role="menuitem" type="button" onClick={pick(() => setPasskeys(true))}>
              Passkeys
            </button>
          )}
          <button role="menuitem" type="button" onClick={pick(actions.signOut)}>
            Sign out
          </button>
        </div>
      )}
      {passkeys && <PasskeySheet onClose={() => setPasskeys(false)} />}
    </div>
  )
}
