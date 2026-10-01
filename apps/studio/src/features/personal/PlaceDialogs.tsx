// The places' two sheets besides your data (direction C): confirming it's you before your personal space opens again,
// and how privacy works. They are the Studio's sheet (app/Sheet.tsx), like Passkeys: modal, closed with Esc or Close.
import { useCallback, useEffect, useState } from 'react'
import { PROVIDER_NAME } from '../../app/auth.ts'
import { CodeField } from '../../app/CodeField.tsx'
import {
  sendUnlockCode,
  unlockWays,
  unlockWithCode,
  unlockWithPasskey,
  unlockWithProvider,
  type Confirmed,
  type UnlockWays,
} from '../../app/reauth.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { PRIVACY_RULES, UNLOCK } from './places-view.ts'

/** Dev identities have nothing to check: a short pause, so the press still answers. */
const DEV_PAUSE_MS = 600

export function PrivacySheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet id="c-privacy-h" title="How privacy works" onClose={onClose}>
      <ul className="privacy-rules">
        {PRIVACY_RULES.map((rule) => (
          <li key={rule.lead}>
            <strong>{rule.lead}</strong>
            {rule.rest}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

type Busy = null | 'passkey' | 'provider' | 'code'

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
      else if (outcome === 'other_account') setError(UNLOCK.otherAccount)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : UNLOCK.failed)
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, check }
}

type Check = ReturnType<typeof useCheck>['check']

/** Sending the code: on its way, sent (the field to type it, and a new one on request), or why it wasn't. */
type Sent = null | 'sending' | 'sent' | { failed: string }

function EmailCode({ ways, busy, check }: { ways: UnlockWays; busy: Busy; check: Check }) {
  const [sent, setSent] = useState<Sent>(null)
  const to = ways.email ?? 'your email'
  const send = () => {
    const email = ways.email
    if (!email) return setSent('sent') // a dev identity has nothing to send
    setSent('sending')
    sendUnlockCode(email).then(
      () => setSent('sent'),
      (err: unknown) => setSent({ failed: err instanceof Error ? err.message : UNLOCK.failed }),
    )
  }
  const ask = (
    <button className="pill" type="button" onClick={send}>
      Email me a code
    </button>
  )
  if (sent === null) return ask
  if (typeof sent === 'object') {
    return (
      <>
        <p className="form-error" role="alert">
          {sent.failed}
        </p>
        {ask}
      </>
    )
  }
  return (
    <>
      <p className="muted" role="status">
        {sent === 'sending' ? UNLOCK.sending(to) : UNLOCK.sent(to)}
      </p>
      {sent === 'sent' && (
        <CodeField
          id="c-code"
          action="Unlock"
          busy={busy === 'code'}
          focus
          onCheck={(value) => void check('code', () => unlockWithCode(ways.email ?? '', value))}
        />
      )}
      {sent === 'sent' && ways.email && (
        <button className="text-button" type="button" onClick={send}>
          Send a new code
        </button>
      )}
    </>
  )
}

/**
 * The ways besides a passkey. In a call a provider isn't offered: signing in again leaves this page, and the call
 * can't come along. When nothing is left, the sheet says so rather than showing nothing.
 */
function OtherWays(props: { ways: UnlockWays; busy: Busy; check: Check; inCall: boolean }) {
  const { ways, busy, check, inCall } = props
  const providers = inCall ? [] : ways.providers
  const code = !!ways.email || ways.dev
  return (
    <div className="unlock-ways">
      {inCall && ways.providers.length > 0 && (
        <p className="muted">{UNLOCK.inCall(ways.providers.map((p) => PROVIDER_NAME[p]).join(' or '))}</p>
      )}
      {providers.map((p) => (
        <button
          key={p}
          className="pill"
          type="button"
          onClick={() => void check('provider', () => unlockWithProvider(p))}
        >
          {busy === 'provider' ? `Checking with ${PROVIDER_NAME[p]}…` : `Continue with ${PROVIDER_NAME[p]}`}
        </button>
      ))}
      {code && <EmailCode ways={ways} busy={busy} check={check} />}
      {providers.length === 0 && !code && !inCall && <p className="muted">{UNLOCK.noOther}</p>}
    </div>
  )
}

function Outcome({ error, dev }: { error: string | null; dev: boolean }) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {dev && <p className="muted">{UNLOCK.dev}</p>}
    </>
  )
}

/** How this person can confirm it's them; if that can't be read, the sheet says so and offers to read it again. */
function useUnlockWays() {
  const [ways, setWays] = useState<UnlockWays | null>(null)
  const [failed, setFailed] = useState(false)
  const load = useCallback(() => {
    setFailed(false)
    unlockWays().then(setWays, () => setFailed(true))
  }, [])
  useEffect(load, [load])
  return { ways, failed, load }
}

/** The other ways once asked for: as they loaded, or why they couldn't, with a way to load them again. */
function Others(props: ReturnType<typeof useUnlockWays> & { busy: Busy; check: Check; inCall: boolean }) {
  const { ways, failed, load, busy, check, inCall } = props
  if (failed) {
    return (
      <p className="form-error" role="alert">
        {UNLOCK.waysFailed}{' '}
        <button className="text-button" type="button" onClick={load}>
          Try again
        </button>
      </p>
    )
  }
  return ways ? <OtherWays ways={ways} busy={busy} check={check} inCall={inCall} /> : null
}

interface UnlockProps {
  /** In a call: a provider, which leaves this page, isn't offered. */
  inCall: boolean
  onUnlocked: () => void
  onClose: () => void
}

export function UnlockSheet({ inCall, onUnlocked, onClose }: UnlockProps) {
  const loading = useUnlockWays()
  const { ways } = loading
  const [other, setOther] = useState(false)
  const { busy, error, check } = useCheck(ways, onUnlocked)
  // Every time it opens with the passkey first, when there is one; the other ways stay one tap away.
  const passkey = ways?.passkey ?? true
  const showOther = other || !passkey
  return (
    <Sheet id="c-unlock-h" title={UNLOCK.title} onClose={onClose}>
      <p className="sheet-lead">{passkey ? UNLOCK.withPasskey : UNLOCK.plain}</p>
      {passkey && (
        <button className="pill primary" type="button" onClick={() => void check('passkey', unlockWithPasskey)}>
          {busy === 'passkey' ? 'Confirming it’s you…' : 'Use passkey'}
        </button>
      )}
      {!showOther && (
        <button className="text-button" type="button" onClick={() => setOther(true)}>
          No passkey? Use another way
        </button>
      )}
      {showOther && <Others {...loading} busy={busy} check={check} inCall={inCall} />}
      <Outcome error={error} dev={!!ways?.dev} />
    </Sheet>
  )
}

interface DialogLayers {
  unlock: { after: (() => void) | null } | null
  setUnlock: (unlock: { after: (() => void) | null } | null) => void
  privacy: boolean
  setPrivacy: (open: boolean) => void
}

/** Whichever of the two is open over the places. */
export function PlaceDialogs(props: { layers: DialogLayers; inCall: boolean; onUnlocked: () => void }) {
  const { layers, inCall, onUnlocked } = props
  return (
    <>
      {layers.unlock && <UnlockSheet inCall={inCall} onUnlocked={onUnlocked} onClose={() => layers.setUnlock(null)} />}
      {layers.privacy && <PrivacySheet onClose={() => layers.setPrivacy(false)} />}
    </>
  )
}
