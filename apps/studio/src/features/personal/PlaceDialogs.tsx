// The two dialogs of the places (direction C): confirming it's you before your personal side opens again, and how
// privacy works. They sit over the whole frame; focus moves in when they open and back when they close (useDialog).
import { useEffect, useRef, useState } from 'react'
import type { OAuthProvider } from '../../app/auth.ts'
import {
  sendUnlockCode,
  unlockWays,
  unlockWithCode,
  unlockWithPasskey,
  unlockWithProvider,
  type Confirmed,
  type UnlockWays,
} from '../../app/reauth.ts'
import { useDialog } from '../../app/useDialog.ts'
import { LockShut } from './icons.tsx'

const PROVIDER_NAME: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub', azure: 'Microsoft' }
const OTHER_ACCOUNT = 'That was another account. Your personal side stays locked.'
/** Dev identities have nothing to check: a short pause, so the press still answers. */
const DEV_PAUSE_MS = 600

function Frame(props: { labelledBy: string; onClose: () => void; children: React.ReactNode }) {
  const card = useRef<HTMLDivElement>(null)
  useDialog(card, props.onClose)
  return (
    <div
      className="c3-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.labelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div ref={card} className="c3-dialog-card" tabIndex={-1}>
        {props.children}
      </div>
    </div>
  )
}

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  return (
    <Frame labelledBy="c-privacy-h" onClose={onClose}>
      <h3 id="c-privacy-h">How privacy works</h3>
      <ul className="c3-rules">
        <li>
          <strong>Private on the left, shared on the right.</strong>Your personal space is yours alone. Your projects,
          their members and the team’s Sophia can’t read it.
        </li>
        <li>
          <strong>Nothing crosses unless you carry it.</strong>A note goes to one project exactly as written, and you
          can take it back.
        </li>
        <li>
          <strong>The padlock closes your side.</strong>Opening it again asks for your passkey. It also closes by itself
          when you join a room.
        </li>
      </ul>
      <div className="acts">
        <button className="btn primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </Frame>
  )
}

type Busy = null | 'passkey' | 'provider' | 'code'

function CodeForm({ email, busy, onCheck }: { email: string; busy: boolean; onCheck: (code: string) => void }) {
  const [code, setCode] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.focus(), [])
  return (
    <form
      className="c3-code"
      onSubmit={(e) => {
        e.preventDefault()
        onCheck(code)
      }}
    >
      <label htmlFor="c-code">Code sent to {email}</label>
      <div className="row">
        <input
          ref={field}
          id="c-code"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="6 digits"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <button className="btn primary" type="submit" disabled={code.length !== 6 || busy}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </form>
  )
}

interface UnlockProps {
  onUnlocked: () => void
  onClose: () => void
}

/** Runs one check: a confirmed one unlocks, a dismissed one waits, another account or a failure says so. */
function useCheck(ways: UnlockWays | null, onUnlocked: () => void) {
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const check = async (kind: Exclude<Busy, null>, run: () => Promise<Confirmed | void>) => {
    setBusy(kind)
    setError(null)
    try {
      const outcome = ways?.dev
        ? await new Promise<Confirmed>((r) => setTimeout(() => r('confirmed'), DEV_PAUSE_MS))
        : await run()
      if (outcome === 'confirmed') onUnlocked()
      else if (outcome === 'other_account') setError(OTHER_ACCOUNT)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try another way.')
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, check }
}

function OtherWays(props: { ways: UnlockWays; busy: Busy; check: ReturnType<typeof useCheck>['check'] }) {
  const { ways, busy, check } = props
  const [code, setCode] = useState(false)
  const email = ways.email ?? 'your email'
  return (
    <div className="c3-alt">
      {ways.providers.map((p) => (
        <button
          key={p}
          className="btn"
          type="button"
          onClick={() => void check('provider', () => unlockWithProvider(p))}
        >
          {busy === 'provider' ? `Checking with ${PROVIDER_NAME[p]}…` : `Continue with ${PROVIDER_NAME[p]}`}
        </button>
      ))}
      {(ways.email || ways.dev) && (
        <button
          className="btn"
          type="button"
          onClick={() => {
            setCode(true)
            if (ways.email) void sendUnlockCode(ways.email).catch(() => undefined)
          }}
        >
          Email me a code
        </button>
      )}
      {code && (
        <CodeForm
          email={email}
          busy={busy === 'code'}
          onCheck={(value) => void check('code', () => unlockWithCode(ways.email ?? '', value))}
        />
      )}
    </div>
  )
}

function PasskeyFirst(props: { passkey: boolean; busy: Busy; onPasskey: () => void; onClose: () => void }) {
  return (
    <div className="acts">
      {props.passkey && (
        <button className="btn primary" type="button" onClick={props.onPasskey}>
          {props.busy === 'passkey' ? 'Confirming it’s you…' : 'Use passkey'}
        </button>
      )}
      <button className="btn ghost" type="button" onClick={props.onClose}>
        Cancel
      </button>
    </div>
  )
}

export function UnlockDialog({ onUnlocked, onClose }: UnlockProps) {
  const [ways, setWays] = useState<UnlockWays | null>(null)
  const [other, setOther] = useState(false)
  const { busy, error, check } = useCheck(ways, onUnlocked)
  useEffect(() => {
    void unlockWays().then(setWays)
  }, [])
  // Every time it opens with the passkey first, when there is one; the other ways stay one tap away.
  const passkey = ways?.passkey ?? true
  const showOther = other || !passkey
  return (
    <Frame labelledBy="c-unlock-h" onClose={onClose}>
      <span className="c3-dialog-icon" aria-hidden>
        <LockShut />
      </span>
      <h3 id="c-unlock-h">Unlock your personal side</h3>
      <p>{passkey ? 'Confirm it’s you with your passkey.' : 'Confirm it’s you.'}</p>
      <PasskeyFirst
        passkey={passkey}
        busy={busy}
        onPasskey={() => void check('passkey', unlockWithPasskey)}
        onClose={onClose}
      />
      {!showOther && (
        <button className="link c3-other" type="button" onClick={() => setOther(true)}>
          No passkey? Use another way
        </button>
      )}
      {showOther && ways && <OtherWays ways={ways} busy={busy} check={check} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {ways?.dev && <small>Dev identities: nothing is checked here.</small>}
    </Frame>
  )
}

interface DialogLayers {
  unlock: { after: (() => void) | null } | null
  setUnlock: (unlock: { after: (() => void) | null } | null) => void
  privacy: boolean
  setPrivacy: (open: boolean) => void
}

/** Whichever dialog is open over the places. */
export function PlaceDialogs({ layers, onUnlocked }: { layers: DialogLayers; onUnlocked: () => void }) {
  return (
    <>
      {layers.unlock && <UnlockDialog onUnlocked={onUnlocked} onClose={() => layers.setUnlock(null)} />}
      {layers.privacy && <PrivacyDialog onClose={() => layers.setPrivacy(false)} />}
    </>
  )
}
