// Settings, in one place (docs/plans/account-settings.md): the account, the theme, a call's defaults, your data and
// help, gathered from where the Studio already keeps each choice. The avatar's menu opens it; nothing here is new state.
import { ConfirmButton, Segmented } from '@sophia/ui'
import { authMode, passkeysOffered } from './auth.ts'
import { Avatar } from './Avatar.tsx'
import { reportsOn } from './crash-report.ts'
import type { Identity } from './dev-identity.ts'
import { signedInWith } from './profile.ts'
import { EVERYWHERE } from './sign-out.ts'
import { Sheet } from './Sheet.tsx'
import { type Theme, useTheme } from './theme.ts'
import { rememberMic, useMicOnJoin } from '../features/voice/mic-preference.ts'
import { useMirror } from '../features/voice/mirror-preference.ts'

interface Props {
  identity: Identity
  onData: () => void
  onPrivacy: () => void
  onPasskeys: () => void
  onFeedback: () => void
  /** Every device the account is on, after asking (sign-out-scope.md). */
  onSignOutEverywhere: () => void
  /** The index of keys, handed over to: Settings closes first, one sheet at a time (Codex P1 on #398). */
  onShortcuts: () => void
  onClose: () => void
}

const THEMES: readonly { id: Theme; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
]

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-part">
      <h3 className="field-label">{title}</h3>
      {children}
    </section>
  )
}

/** A choice kept on this device, said in its words beside its box. */
function Check(props: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="settings-check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  )
}

/**
 * A call's defaults: the microphone on joining (the next join reads it) and the mirror (the stage reads it). Both are
 * the stores themselves, so the call's own microphone in the sheet's head moves the box too (Codex P2 on #398).
 */
function Calls() {
  const mic = useMicOnJoin()
  const mirror = useMirror()
  return (
    <Part title="Calls">
      <Check label="Join with my microphone on" checked={mic} onChange={rememberMic} />
      <Check label="Mirror my video" checked={mirror.on} onChange={(on) => on !== mirror.on && mirror.toggle()} />
    </Part>
  )
}

function Account({
  identity,
  onPasskeys,
  onSignOutEverywhere,
}: Pick<Props, 'identity' | 'onPasskeys' | 'onSignOutEverywhere'>) {
  const how = signedInWith(identity.provider)
  return (
    <Part title="Account">
      <div className="settings-who">
        <Avatar identity={identity} />
        <span className="account-names">
          <span className="account-name">{identity.displayName ?? identity.name}</span>
          {identity.displayName && <span>{identity.name}</span>}
          {how && <span>{how}</span>}
        </span>
      </div>
      {passkeysOffered && authMode !== 'dev' && (
        <button type="button" className="text-button" onClick={onPasskeys}>
          Passkeys
        </button>
      )}
      {/* The menu's Sign out is this device's; every device is asked for here, and asked about (sign-out-scope.md). */}
      <ConfirmButton {...EVERYWHERE} className="text-button" onConfirm={onSignOutEverywhere} />
    </Part>
  )
}

export function SettingsSheet(props: Props) {
  const [theme, setTheme] = useTheme()
  return (
    <Sheet id="settings-title" title="Settings" onClose={props.onClose} className="settings-sheet">
      <Account
        identity={props.identity}
        onPasskeys={props.onPasskeys}
        onSignOutEverywhere={props.onSignOutEverywhere}
      />
      <Part title="Appearance">
        <Segmented role="group" label="Theme" size="sm" items={THEMES} value={theme} onChange={setTheme} />
      </Part>
      <Calls />
      <Part title="Data and privacy">
        <button type="button" className="text-button" onClick={props.onData}>
          Your data
        </button>
        <button type="button" className="text-button" onClick={props.onPrivacy}>
          How privacy works
        </button>
        <span className="settings-links">
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms of use
          </a>
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy notice
          </a>
        </span>
      </Part>
      <Part title="Help">
        <button type="button" className="text-button" onClick={props.onShortcuts}>
          Keyboard shortcuts
        </button>
        {/* Only where it goes somewhere (crash-feedback.md). */}
        {reportsOn() && (
          <button type="button" className="text-button" onClick={props.onFeedback}>
            Send feedback
          </button>
        )}
      </Part>
    </Sheet>
  )
}
