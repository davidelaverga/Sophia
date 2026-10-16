// The account, one control in every bar (the places' and a project's): the avatar opens a menu with who is signed in
// (their picture, name, email and how they signed in; account-menu.md), «Your name» where the server serves profiles
// (profile-editor.md), "Your data" and how privacy works, passkeys, and signing out. From a project the first two open at home, where the
// personal space's own sheets are. Locally the dev identity is chosen in its head. It is the kit's menu, and closes
// like any popover (usePopover): Escape returns to the avatar, a press anywhere else closes it.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Menu, MenuHead, MenuItem, MenuSep, Tip, usePopover } from '@sophia/ui'
import { authMode, passkeysOffered } from './auth.ts'
import { accountOf } from './auth-callback.ts'
import { Avatar } from './Avatar.tsx'
import { devIdentities, type Identity } from './dev-identity.ts'
import { askCommands } from './CommandsHost.tsx'
import { PasskeySheet } from './PasskeySheet.tsx'
import { ProfileSheet } from './ProfileSheet.tsx'
import { keyLabel, onMac } from './shortcuts.ts'
import { signedInWith } from './profile.ts'
import { type Theme, useTheme } from './theme.ts'
import { useMyProfile } from './useMyProfile.ts'

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

/** In a project, the item says whose data it is: the personal space's, at home (account-menu.md). */
const DATA_LABEL: Record<Where, string> = { places: 'Your data', project: 'Your personal data' }

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

/**
 * Who is signed in: their picture, their name (the one their projects see, else the provider's, else the email), the
 * email under a name, and how they signed in. The email is theirs to see here; it is never their name to others.
 */
function Head({
  identity,
  name,
  onChoose,
}: {
  identity: Identity
  name: string | null
  onChoose: (i: Identity | null) => void
}) {
  const how = signedInWith(identity.provider)
  return (
    <MenuHead>
      <span className="account-who">
        <Avatar identity={identity} />
        <span className="account-names">
          <span className="account-name">{name ?? identity.name}</span>
          {authMode !== 'dev' && name && <span>{identity.name}</span>}
          {authMode !== 'dev' && how && <span>{how}</span>}
        </span>
      </span>
      {authMode === 'dev' && <DevChoice identity={identity} onChoose={onChoose} />}
    </MenuHead>
  )
}

/** The appearance (docs/plans/light-mode.md): the dark room, the report's paper, or the system's. */
const THEMES: readonly (readonly [Theme, string, string])[] = [
  ['dark', 'Dark', 'Dark'],
  ['light', 'Light', 'Light'],
  // One word on the row; its whole name, which holds the word, for whoever hears it.
  ['system', 'System', 'Follow the system'],
]

/** The theme on one row: the menu's radio items side by side, the one on lit (account-menu.md). */
function Appearance() {
  const [theme, setTheme] = useTheme()
  return (
    <>
      <MenuSep />
      <div className="menu-choices" role="group" aria-label="Theme">
        <span className="menu-choices-label" aria-hidden>
          Theme
        </span>
        {THEMES.map(([value, label, name]) => (
          <MenuItem key={value} checked={theme === value} aria-label={name} onClick={() => setTheme(value)}>
            {label}
          </MenuItem>
        ))}
      </div>
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
  // The account the sheet was opened for: another account coming in (another tab) closes it, so nothing typed for one
  // is ever saved for the next (Codex P1 on #388).
  const [naming, setNaming] = useState<string | null>(null)
  const mine = useMyProfile(identity)
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
          <Head
            identity={identity}
            name={mine.profile?.displayName ?? identity.displayName ?? null}
            onChoose={actions.chooseDev}
          />
          {mine.offered && <MenuItem onClick={pick(() => setNaming(accountOf(identity)))}>Your name</MenuItem>}
          <MenuItem className="has-tip" onClick={pick(actions.data)}>
            {DATA_LABEL[where]}
            <Tip label={tip.label} {...(tip.keys ? { keys: tip.keys } : {})} side="bottom" align="end" />
          </MenuItem>
          <MenuItem onClick={pick(actions.privacy)}>How privacy works</MenuItem>
          <Appearance />
          <MenuSep />
          <MenuItem detail={keyLabel('mod+/', onMac)} onClick={pick(() => askCommands('index'))}>
            Keyboard shortcuts
          </MenuItem>
          <MenuSep />
          {passkeysOffered && authMode !== 'dev' && (
            <MenuItem onClick={pick(() => setPasskeys(true))}>Passkeys</MenuItem>
          )}
          <MenuItem onClick={pick(actions.signOut)}>Sign out</MenuItem>
        </Menu>
      )}
      {passkeys && <PasskeySheet onClose={() => setPasskeys(false)} />}
      {/* Out of the bar, as the project's sheets are (ProjectName): the bar's own styles never reach the sheet. */}
      {naming !== null &&
        naming === accountOf(identity) &&
        createPortal(<ProfileSheet key={naming} identity={identity} onClose={() => setNaming(null)} />, document.body)}
    </div>
  )
}
