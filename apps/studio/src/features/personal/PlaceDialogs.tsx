// The places' two sheets besides your data (direction C): confirming it's you before your personal space opens again,
// and how privacy works. They are the Studio's sheet (app/Sheet.tsx), like Passkeys: modal, closed with Esc or Close.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { PROVIDER_NAME } from '../../app/auth.ts'
import { CodeField } from '../../app/CodeField.tsx'
import { orLate } from '../../app/deadline.ts'
import {
  passkeyAtFirst,
  sendUnlockCode,
  unlockWays,
  unlockWithCode,
  unlockWithPasskey,
  unlockWithProvider,
  type UnlockWays,
} from '../../app/reauth.ts'
import { Sheet } from '../../app/Sheet.tsx'
import type { Checked } from '../../app/unlock-check.ts'
import { placeLanding } from './focus.ts'
import { codeButton, otherWaysNote, otherWaysShown, PRIVACY_RULES, UNLOCK, type OtherWaysShown } from './places-view.ts'

/** Dev identities have nothing to check: a short pause, so the press still answers. */
const DEV_PAUSE_MS = 600

/** How long the ways may take to load before the sheet says they couldn't (the passkey works meanwhile). */
const WAYS_MS = 20_000

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

const devPause = () => new Promise<Checked>((resolve) => setTimeout(() => resolve('confirmed'), DEV_PAUSE_MS))

/**
 * Runs one check at a time: a confirmed one unlocks, a dismissed one waits, anything else says why. The sheet going
 * away (Esc, Close, another tab's unlock) closes a passkey prompt still open, and a check that answers after it went
 * does nothing: only the sheet whose check passed goes on.
 */
function useCheck(ways: UnlockWays | null, onUnlocked: () => void) {
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const gone = useRef(new AbortController())
  useEffect(() => {
    const here = new AbortController()
    gone.current = here
    return () => here.abort()
  }, [])
  const check = async (kind: Exclude<Busy, null>, run: (signal: AbortSignal) => Promise<Checked | void>) => {
    if (running.current) return
    running.current = true
    const signal = gone.current.signal
    setBusy(kind)
    setError(null)
    try {
      const outcome = ways?.dev ? await devPause() : await run(signal)
      if (signal.aborted) return
      if (outcome === 'confirmed') onUnlocked()
      else if (outcome === 'other_account') setError(UNLOCK.otherAccount)
      else if (typeof outcome === 'object') setError(outcome.failed)
    } catch (err: unknown) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : UNLOCK.failed)
    } finally {
      running.current = false
      setBusy(null)
    }
  }
  return { busy, error, check }
}

type Check = ReturnType<typeof useCheck>['check']

/**
 * A part of the sheet that replaced the control that had the focus (the press for the other ways, the passkey once the
 * account turned out to have none) takes the focus on arrival: its first control, or the sheet. Focus that is anywhere
 * else stays where it is.
 */
function useCatchFocus(box: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    const first = box.current?.querySelector<HTMLElement>('button, input')
    ;(first ?? box.current?.closest<HTMLElement>('[role="dialog"]'))?.focus()
  }, [box])
}

/**
 * The code by email: one button to ask for it, kept through sending ("Sending…", the focus with it) until the code's
 * field takes the focus; then a new code on request, whose field starts empty.
 */
function EmailCode(props: { ways: UnlockWays; me: string | null; busy: Busy; check: Check }) {
  const { ways, me, busy, check } = props
  const [codes, setCodes] = useState(0)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const to = ways.email ?? 'your email'
  const send = () => {
    const email = ways.email
    setFailed(null)
    if (!email) return setCodes((n) => n + 1) // a dev identity has nothing to send
    setSending(true)
    void sendUnlockCode(email).then(
      () => {
        setSending(false)
        setCodes((n) => n + 1)
      },
      (err: unknown) => {
        setSending(false)
        setFailed(err instanceof Error ? err.message : UNLOCK.failed)
      },
    )
  }
  const button = codeButton({ codes, sending, canResend: !!ways.email })
  return (
    <>
      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}
      {(sending || codes > 0) && (
        <p className="muted" role="status">
          {sending ? UNLOCK.sending(to) : UNLOCK.sent(to)}
        </p>
      )}
      {codes > 0 && (
        <CodeField
          key={codes}
          id="c-code"
          action="Unlock"
          busy={busy === 'code'}
          focus
          onCheck={(value) => void check('code', () => unlockWithCode(me, ways.email ?? '', value))}
        />
      )}
      {button && (
        <button
          className={button.quiet ? 'text-button' : 'pill'}
          type="button"
          aria-disabled={sending || undefined}
          onClick={sending ? undefined : send}
        >
          {button.label}
        </button>
      )}
    </>
  )
}

/**
 * The ways besides a passkey. In a call a provider isn't offered: signing in again leaves this page, and the call
 * can't come along; the sheet says how to use it instead, and says so when there is no other way at all.
 */
function OtherWays(props: { ways: UnlockWays; me: string | null; busy: Busy; check: Check; inCall: boolean }) {
  const { ways, me, busy, check, inCall } = props
  const box = useRef<HTMLDivElement>(null)
  useCatchFocus(box)
  const providers = inCall ? [] : ways.providers
  const code = !!ways.email || ways.dev
  const note = otherWaysNote({ providers: ways.providers.map((p) => PROVIDER_NAME[p]), code }, inCall)
  return (
    <div ref={box} className="unlock-ways">
      {note && <p className="muted">{note}</p>}
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
      {code && <EmailCode ways={ways} me={me} busy={busy} check={check} />}
    </div>
  )
}

function WaysFailed({ onRetry }: { onRetry: () => void }) {
  const box = useRef<HTMLParagraphElement>(null)
  useCatchFocus(box)
  return (
    <p ref={box} className="form-error" role="alert">
      {UNLOCK.waysFailed}{' '}
      <button className="text-button" type="button" onClick={onRetry}>
        Try again
      </button>
    </p>
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

/**
 * How this person can confirm it's them: loading, loaded, or that they couldn't load (a failure, or no answer in
 * WAYS_MS), with a way to load them again. Only the latest load counts.
 */
function useUnlockWays() {
  const [ways, setWays] = useState<UnlockWays | null>(null)
  const [failed, setFailed] = useState(false)
  const loads = useRef(0)
  const load = useCallback(() => {
    loads.current += 1
    const mine = loads.current
    setFailed(false)
    const settle = (loaded: UnlockWays | 'late' | null) => {
      if (mine !== loads.current) return
      if (loaded && loaded !== 'late') setWays(loaded)
      else setFailed(true)
    }
    void orLate(unlockWays(), WAYS_MS).then(settle, () => settle(null))
  }, [])
  useEffect(load, [load])
  return { ways, failed, load }
}

interface BelowProps {
  shown: OtherWaysShown
  loading: ReturnType<typeof useUnlockWays>
  me: string | null
  busy: Busy
  check: Check
  inCall: boolean
  onAsk: () => void
}

/**
 * Below the passkey (otherWaysShown): the press for the other ways, which waits as "Loading…" (the focus stays on it)
 * until they come; the ways; or that they couldn't load, said at once, whose Try again hands the focus to the sheet.
 */
function Below({ shown, loading, me, busy, check, inCall, onAsk }: BelowProps) {
  const { ways } = loading
  if (shown === 'failed') {
    return (
      <WaysFailed
        onRetry={() => {
          loading.load()
          document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="c-unlock-h"]')?.focus()
        }}
      />
    )
  }
  if (shown === 'ways' && ways) return <OtherWays ways={ways} me={me} busy={busy} check={check} inCall={inCall} />
  const waiting = shown === 'loading'
  return (
    <button
      className="text-button"
      type="button"
      aria-disabled={waiting || undefined}
      onClick={waiting ? undefined : onAsk}
    >
      {waiting ? 'Loading…' : 'No passkey? Use another way'}
    </button>
  )
}

interface UnlockProps {
  /** The signed-in person (read from the app's own token): a check must come back as them. */
  me: string | null
  /** In a call: a provider, which leaves this page, isn't offered. */
  inCall: boolean
  onUnlocked: () => void
  onClose: () => void
}

export function UnlockSheet({ me, inCall, onUnlocked, onClose }: UnlockProps) {
  const loading = useUnlockWays()
  const { ways } = loading
  const [asked, setAsked] = useState(false)
  const { busy, error, check } = useCheck(ways, onUnlocked)
  // Every time it opens with the passkey first, also while the ways load; the other ways stay one press away. Where no
  // passkey can be offered, the other ways are what it waits for.
  const passkey = ways?.passkey ?? passkeyAtFirst
  const shown = otherWaysShown({ ways, failed: loading.failed, asked: asked || !passkey })
  return (
    <Sheet id="c-unlock-h" title={UNLOCK.title} onClose={onClose} returnTo={placeLanding}>
      <p className="sheet-lead">{passkey ? UNLOCK.withPasskey : UNLOCK.plain}</p>
      {passkey && (
        <button
          className="pill primary"
          type="button"
          onClick={() => void check('passkey', (signal) => unlockWithPasskey(me, signal))}
        >
          {busy === 'passkey' ? 'Confirming it’s you…' : 'Use passkey'}
        </button>
      )}
      <Below
        shown={shown}
        loading={loading}
        me={me}
        busy={busy}
        check={check}
        inCall={inCall}
        onAsk={() => setAsked(true)}
      />
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
export function PlaceDialogs(props: {
  layers: DialogLayers
  me: string | null
  inCall: boolean
  onUnlocked: () => void
}) {
  const { layers, me, inCall, onUnlocked } = props
  return (
    <>
      {layers.unlock && (
        <UnlockSheet me={me} inCall={inCall} onUnlocked={onUnlocked} onClose={() => layers.setUnlock(null)} />
      )}
      {layers.privacy && <PrivacySheet onClose={() => layers.setPrivacy(false)} />}
    </>
  )
}
