// The account, one control in every bar (the places' and a project's): the avatar opens a menu with who is signed in,
// "Your data" and how privacy works, passkeys, and signing out. From a project the first two open at home, where the
// personal space's own sheets are. Locally the dev identity is chosen in its head. It is the kit's menu, and closes
// like any popover (usePopover): Escape returns to the avatar, a press anywhere else closes it.
import { useState } from 'react'
import { Menu, MenuHead, MenuItem, MenuSep, Tip, usePopover } from '@sophia/ui'
import { authMode, passkeysOffered } from './auth.ts'
import { Avatar } from './Avatar.tsx'
import { devIdentities, type Identity } from './dev-identity.ts'
import { askCommands } from './CommandsHost.tsx'
import { PasskeySheet } from './PasskeySheet.tsx'
import { keyLabel, onMac } from './shortcuts.ts'
import { type Theme, useTheme } from './theme.ts'

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
    <MenuHead>
      {identity.displayName ?? identity.name}
      {authMode === 'dev' ? (
        <DevChoice identity={identity} onChoose={onChoose} />
      ) : (
        identity.displayName && <span>{identity.name}</span>
      )}
    </MenuHead>
  )
}

/** The appearance (docs/plans/light-mode.md): the dark room, the report's paper, or the system's. */
const THEMES: readonly (readonly [Theme, string])[] = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['system', 'Follow the system'],
]

function Appearance() {
  const [theme, setTheme] = useTheme()
  return (
    <>
      <MenuSep />
      {THEMES.map(([value, label]) => (
        <MenuItem key={value} checked={theme === value} onClick={() => setTheme(value)}>
          {label}
        </MenuItem>
      ))}
    </>
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
        <Menu popover={menu} label="Account" className="account-menu">
          <Head identity={identity} onChoose={actions.chooseDev} />
          <MenuItem className="has-tip" onClick={pick(actions.data)}>
            Your data
            <Tip label={tip.label} {...(tip.keys ? { keys: tip.keys } : {})} side="bottom" align="end" />
          </MenuItem>
          <MenuItem onClick={pick(actions.privacy)}>How privacy works</MenuItem>
          <Appearance />
          {where === 'project' && (
            <>
              <MenuSep />
              <MenuItem detail={keyLabel('mod+/', onMac)} onClick={pick(() => askCommands('index'))}>
                Keyboard shortcuts
              </MenuItem>
            </>
          )}
          <MenuSep />
          {passkeysOffered && authMode !== 'dev' && (
            <MenuItem onClick={pick(() => setPasskeys(true))}>Passkeys</MenuItem>
          )}
          <MenuItem onClick={pick(actions.signOut)}>Sign out</MenuItem>
        </Menu>
      )}
      {passkeys && <PasskeySheet onClose={() => setPasskeys(false)} />}
    </div>
  )
}
