// The places' two sheets besides your data (direction C): confirming it's you before your personal space opens again,
// and how privacy works. They are the Studio's sheet (app/Sheet.tsx), like Passkeys: modal, closed with Esc or Close.
import { useEffect, useState } from 'react'
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

function OtherWays(props: { ways: UnlockWays; busy: Busy; check: ReturnType<typeof useCheck>['check'] }) {
  const { ways, busy, check } = props
  const [code, setCode] = useState(false)
  return (
    <div className="unlock-ways">
      {ways.providers.map((p) => (
        <button
          key={p}
          className="pill"
          type="button"
          onClick={() => void check('provider', () => unlockWithProvider(p))}
        >
          {busy === 'provider' ? `Checking with ${PROVIDER_NAME[p]}…` : `Continue with ${PROVIDER_NAME[p]}`}
        </button>
      ))}
      {(ways.email || ways.dev) && !code && (
        <button
          className="pill"
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
        <>
          <p className="muted">Code sent to {ways.email ?? 'your email'}</p>
          <CodeField
            id="c-code"
            action="Unlock"
            busy={busy === 'code'}
            focus
            onCheck={(value) => void check('code', () => unlockWithCode(ways.email ?? '', value))}
          />
        </>
      )}
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

export function UnlockSheet({ onUnlocked, onClose }: { onUnlocked: () => void; onClose: () => void }) {
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
      {showOther && ways && <OtherWays ways={ways} busy={busy} check={check} />}
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
export function PlaceDialogs({ layers, onUnlocked }: { layers: DialogLayers; onUnlocked: () => void }) {
  return (
    <>
      {layers.unlock && <UnlockSheet onUnlocked={onUnlocked} onClose={() => layers.setUnlock(null)} />}
      {layers.privacy && <PrivacySheet onClose={() => layers.setPrivacy(false)} />}
    </>
  )
}
