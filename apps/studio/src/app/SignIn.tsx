// Sign-in screens: Supabase magic link, dev identities, or a configuration hint. Each is a quiet room
// with Sophia's light at rest above the words.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Field } from '@sophia/ui'
import { WRITE_TIMEOUT_MS } from '../api/timeouts.ts'
import type { LightMode } from '../features/light/engine.ts'
import type { Point } from '../features/light/motion.ts'
import { SophiaLight } from '../features/light/SophiaLight.tsx'
import { LINK_SLOW } from './auth-callback.ts'
import { authMode, passkeysOffered, sendMagicLink, verifyEmailCode } from './auth.ts'
import { CodeField } from './CodeField.tsx'
import { devIdentities, type Identity } from './dev-identity.ts'
import { startOver } from './link-accept.ts'
import { PasskeyLink, usePasskeySignIn } from './PasskeySignIn.tsx'
import { ProviderButtons } from './ProviderButtons.tsx'
import { SLOW_NOTE, useSlow } from './useSlow.ts'
import { Mark } from './Mark.tsx'
import { mailHome, plausibleEmail } from './mail-home.ts'
import { CODE_NOT_CONFIRMED, EMAIL_NOT_CONFIRMED, FIRST_EMAIL_NOT_CONFIRMED, waitAfter } from './auth-words.ts'
import { endsWithin } from './deadline.ts'

/** Auth served by the local Supabase stack: sign-in emails land in Mailpit, not a real inbox. */
const LOCAL_AUTH = /^http:\/\/(127\.0\.0\.1|localhost):54321/.test(import.meta.env.VITE_SUPABASE_URL ?? '')
const MAILPIT_URL = 'http://127.0.0.1:54324'

/**
 * What the light does on a quiet screen: rests, by default; listens to whoever writes, leaning towards them; thinks
 * while something goes; and, once they are through, condenses into the mark (`formed`, from where they wrote).
 */
export interface ScreenLight {
  mode: LightMode
  attention: Point | null
  pull?: Point | null
  formed?: { from: Point | null }
}

const AT_REST: ScreenLight = { mode: 'rest', attention: null }

export function Centered({
  title,
  children,
  busy,
  light = AT_REST,
}: {
  title: string
  children?: React.ReactNode
  busy?: boolean
  light?: ScreenLight
}) {
  return (
    <main className="screen" aria-busy={busy}>
      <SophiaLight
        mode={light.mode}
        target={null}
        attention={light.attention}
        working={false}
        screen
        pull={light.pull ?? null}
        formed={light.formed ?? null}
      />
      <div className="screen-mark">
        <Mark />
        <span className="mark-word">Sophia</span>
      </div>
      <div className="screen-body">
        <h1 className="screen-title arrive">{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** A closed door still leads somewhere: Sophia's front page (sign-in, or your projects). */
export function HomeLink() {
  return (
    <a className="pill" href="/">
      Go to Sophia
    </a>
  )
}

/** For a screen that waits on the API: one line once the wait has lasted (useSlow.ts), so it never just sits. */
export function SlowNote() {
  if (!useSlow(true)) return null
  return (
    <p className="muted arrive" role="status">
      {SLOW_NOTE}
    </p>
  )
}

interface OfferProps {
  account: string
  /** Continue was pressed, and signing in outlasted the wait: it goes on, and the person can start over. */
  slow?: boolean | undefined
  onAccept: () => Promise<void>
  onDecline: () => void
}

/**
 * A link carried a session and nobody is signed in: the account is named, as the Auth service reads it, and nothing
 * is signed in until the person says it is theirs. Someone else's link would otherwise sign them into that account.
 * Once they pressed Continue, nothing declines it while it is under way (link-accept.ts): a slow sign-in says so after
 * a while (SlowNote), and past the wait offers to start over (`startOver`): the same place loads again, so a link
 * that landed on an invitation (/join) goes on with it, and the attempt is left with the page.
 */
export function LinkOffer({ account, slow, onAccept, onDecline }: OfferProps) {
  const [signing, setSigning] = useState(false)
  const busy = signing || !!slow
  const accept = async () => {
    setSigning(true)
    await onAccept()
    setSigning(false)
  }
  return (
    <Centered title="Sign in as this account?">
      <p>
        This link signs you in to Sophia as <strong>{account}</strong>. Continue only if that address is yours.
      </p>
      <button type="button" className="pill primary" disabled={busy} onClick={() => void accept()}>
        {busy ? 'Signing in…' : 'Continue'}
      </button>
      <button type="button" className="text-button" disabled={busy} onClick={onDecline}>
        That’s not me
      </button>
      {signing && !slow && <SlowNote />}
      {slow && (
        <>
          <p className="form-error" role="alert">
            {LINK_SLOW}
          </p>
          <button type="button" className="pill" onClick={() => startOver(window.location)}>
            Start over
          </button>
        </>
      )}
    </Centered>
  )
}

interface SignInProps {
  onChooseDev: (identity: Identity) => void
  /** Why the last sign-in link did not work, when it did not. */
  notice?: string | undefined
}

export function SignIn({ onChooseDev, notice }: SignInProps) {
  if (authMode === 'supabase') return <EmailSignIn notice={notice} />
  if (authMode === 'dev') return <DevIdentityPicker onChoose={onChooseDev} />
  return (
    <Centered title="Sign-in isn’t configured">
      <p>
        Set <span className="mono">VITE_SUPABASE_URL</span> and{' '}
        <span className="mono">VITE_SUPABASE_PUBLISHABLE_KEY</span>, or run{' '}
        <span className="mono">node scripts/dev-stack.ts</span>.
      </p>
    </Centered>
  )
}

function DevIdentityPicker({ onChoose }: { onChoose: (identity: Identity) => void }) {
  return (
    <Centered title="Who’s here?">
      <p className="muted">Development identities. Each tab keeps its own.</p>
      <div className="identity-grid">
        {/* The guest identity is for invitation links (/join), where it is used on its own. */}
        {devIdentities
          .filter((i) => i.role !== 'guest')
          .map((i) => (
            <button key={i.name} type="button" onClick={() => onChoose(i)}>
              <strong>{i.name}</strong>
              <span className="muted">{i.role === 'none' ? 'not a member' : i.role}</span>
            </button>
          ))}
      </div>
    </Centered>
  )
}

type Step = { step: 'idle' | 'sending' | 'sent' } | { step: 'error'; message: string; field?: boolean }

/** Where a sign-in email goes, and where its code is checked: Supabase Auth, or a fixture's own. */
export interface EmailPorts {
  send?: ((email: string) => Promise<void>) | undefined
  verify?: ((email: string, code: string) => Promise<void>) | undefined
}

/** A screen with a pointer: there a field can take the focus; on touch it waits, so no keyboard covers the page. */
const finePointer = () => window.matchMedia('(pointer: fine)').matches

/** The address field takes the focus with a pointer, on arrival and each time the form comes back (another email). */
function useFocusOnPointer(shown: boolean) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (shown && finePointer()) field.current?.focus()
  }, [shown])
  return field
}

const NOT_AN_ADDRESS = 'Check the address: it needs a name, an @ and a domain.'

/**
 * The threshold (docs/plans/signin-threshold.md): Sophia notices whoever writes their address. While the field has the
 * focus or holds words she listens, leaning towards it; while the email goes she thinks; otherwise she rests. Her
 * attention is the field's centre, in the light's own box, read again when the window changes.
 */
function useListening(field: React.RefObject<HTMLInputElement | null>, email: string, step: Step['step']): ScreenLight {
  // The form is shown again after "Use another email", with a new field: she listens to that one.
  const shown = step !== 'sent'
  const [focused, setFocused] = useState(false)
  const [attention, setAttention] = useState<Point | null>(null)
  useEffect(() => {
    const input = field.current
    const box = input?.closest('.screen')?.querySelector('.light')
    if (!input || !box) return undefined
    const aim = () => {
      const f = input.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      setAttention({ x: f.left + f.width / 2 - b.left, y: f.top + f.height / 2 - b.top })
    }
    const focus = () => {
      aim()
      setFocused(true)
    }
    const blur = () => setFocused(false)
    // A field shown again starts from where the focus is, not from the one before it.
    if (document.activeElement === input) focus()
    else blur()
    input.addEventListener('focus', focus)
    input.addEventListener('blur', blur)
    window.addEventListener('resize', aim)
    return () => {
      input.removeEventListener('focus', focus)
      input.removeEventListener('blur', blur)
      window.removeEventListener('resize', aim)
    }
  }, [field, shown])
  if (step === 'sending') return { mode: 'think', attention }
  return focused || email.trim() !== '' ? { mode: 'listen', attention, pull: attention } : AT_REST
}

/** The address and its sending: checked here first, then sent; its step, and whether the field itself is wrong. */
function useAddress(send: (email: string) => Promise<void>) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<Step>({ step: 'idle' })
  const field = useFocusOnPointer(state.step !== 'sent')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Checked here, said in the page's own words, not in the browser's bubble.
    if (!plausibleEmail(email)) {
      setState({ step: 'error', message: NOT_AN_ADDRESS, field: true })
      field.current?.focus()
      return
    }
    setState({ step: 'sending' })
    try {
      await sendInTime(send(email.trim()), FIRST_EMAIL_NOT_CONFIRMED)
      setState({ step: 'sent' })
    } catch (err: unknown) {
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Could not send the link.' })
      // Send was disabled while it went: the focus goes back to the address, to try again.
      field.current?.focus()
    }
  }
  const invalid = state.step === 'error' && state.field === true
  const change = (value: string) => {
    setEmail(value)
    if (invalid) setState({ step: 'idle' })
  }
  return { email, state, setState, field, submit, invalid, change }
}

export function EmailSignIn({ notice, send = sendMagicLink, verify }: { notice: string | undefined } & EmailPorts) {
  const address = useAddress(send)
  const { email, state, setState, field, invalid } = address
  const showError = useCallback((message: string) => setState({ step: 'error', message }), [setState])
  const passkey = usePasskeySignIn(showError)
  const listening = useListening(field, email, state.step)
  // Through: she rests and the mark forms, rising from where the address was written. Kept while the screen stays.
  const through = useMemo<ScreenLight>(
    () => ({ mode: 'rest', attention: null, formed: { from: listening.attention } }),
    [listening.attention],
  )
  // One screen for both steps: the light carries on from listening to formed, instead of starting again.
  if (state.step === 'sent') {
    return (
      <Centered title="Check your email" light={through}>
        <LinkSent email={email.trim()} send={send} verify={verify} onReset={() => setState({ step: 'idle' })} />
      </Centered>
    )
  }
  return (
    <Centered title="Sign in to Sophia" light={listening}>
      {/* What opens, in the door's voice (docs/plans/sign-in-lede.md): the first screen says what Sophia is. */}
      <p className="screen-lede">A room where your team and Sophia think together.</p>
      {notice && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}
      <ProviderButtons />
      <Field as="form" size="lg" noValidate onSubmit={(e) => void address.submit(e)}>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          ref={field}
          id="email"
          type="email"
          required
          autoComplete={passkeysOffered ? 'username webauthn' : 'email'}
          placeholder="you@company.com"
          value={email}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'email-error' : undefined}
          onChange={(e) => address.change(e.target.value)}
        />
        <button type="submit" className="pill primary" disabled={state.step === 'sending'}>
          {state.step === 'sending' ? 'Sending…' : 'Email me a link'}
        </button>
      </Field>
      {state.step === 'sending' && <SlowNote />}
      {state.step === 'error' && (
        <p id="email-error" className="form-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="muted">New here? The same link creates your account.</p>
      <PasskeyLink {...passkey} />
    </Centered>
  )
}

/** How long a new email waits before it can be asked for again, in seconds: hosted Supabase Auth's own window per
 * address. Asked sooner, it answers how long is left, and the countdown takes that. */
const RESEND_AFTER = 60

/**
 * How long an email or a code may take before it is said not confirmed: Supabase's calls have no limit of their own,
 * and each is a write, which the Studio gives 90 s (CONTRIBUTING, «No wait is endless»; docs/plans/signin-limits.md).
 */
const AUTH_LIMIT_MS = WRITE_TIMEOUT_MS

/**
 * A sign-in email that ends: sent, refused, or not confirmed once a write's time has passed, said in `words` (a first
 * one, with no code field yet, says what still works if it arrives).
 */
export const sendInTime = (sending: Promise<void>, words = EMAIL_NOT_CONFIRMED) =>
  endsWithin(sending, AUTH_LIMIT_MS, words)

/**
 * Send again, once the wait has passed: it counts down, sends, and says so. While it waits or sends it can't be
 * pressed (aria-disabled, so the focus stays on it). A refusal is said as one, in the screen's error colour, and waits
 * as long as it says (or Auth's window, when it says too many and gives no time); a send that never answers ends after
 * a write's 90 s as not confirmed, and waits the window too, since the email may still arrive.
 */
function SendAgain({ email, send }: { email: string; send: (email: string) => Promise<void> }) {
  // Counted from when it may be asked again, not by subtracting ticks: a throttled background tab still reads true.
  const [until, setUntil] = useState(() => Date.now() + RESEND_AFTER * 1000)
  const [now, setNow] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [said, setSaid] = useState<{ text: string; failed: boolean }>({ text: '', failed: false })
  // A long send says so once it has lasted, as every long wait in the Studio does.
  const slow = useSlow(sending)
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  useEffect(() => {
    const tick = left > 0 ? setInterval(() => setNow(Date.now()), 1000) : undefined
    return () => clearInterval(tick)
  }, [left])
  const waitFor = (seconds: number) => {
    setNow(Date.now())
    setUntil(Date.now() + seconds * 1000)
  }
  const waiting = left > 0 || sending
  const again = async () => {
    if (waiting) return
    setSending(true)
    setSaid({ text: 'Sending…', failed: false })
    try {
      await sendInTime(send(email))
      setSaid({ text: 'Sent again. Only the newest link and code work.', failed: false })
      waitFor(RESEND_AFTER)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not send it again.'
      setSaid({ text: message, failed: true })
      waitFor(message === EMAIL_NOT_CONFIRMED ? RESEND_AFTER : waitAfter(message, RESEND_AFTER))
    }
    setSending(false)
  }
  return (
    <p className="send-again">
      <button type="button" className="text-button" aria-disabled={waiting || undefined} onClick={() => void again()}>
        {left > 0 ? `Send again in ${String(left)} s` : 'Send again'}
      </button>
      {/* One status from the start, its words changed in place; a failure in the error colour. */}
      <span className="muted" role="status" data-state={said.failed ? 'failed' : undefined}>
        {said.text}
        {slow && ` ${SLOW_NOTE}`}
      </span>
    </p>
  )
}

function LinkSent({
  email,
  send,
  verify,
  onReset,
}: {
  email: string
  send: (email: string) => Promise<void>
  verify: EmailPorts['verify']
  onReset: () => void
}) {
  const home = mailHome(email)
  return (
    <>
      <p>
        We sent a sign-in link and a code to <strong>{email}</strong>. Open the link in this browser, or enter the code
        here if you read your email somewhere else.
      </p>
      {home && (
        <a className="pill" href={home.url} target="_blank" rel="noreferrer">
          Open {home.name}
        </a>
      )}
      <CodeForm email={email} verify={verify} />
      {LOCAL_AUTH && (
        <p className="muted">
          Local stack: the email is in{' '}
          <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
            Mailpit
          </a>
          .
        </p>
      )}
      <SendAgain email={email} send={send} />
      <button type="button" className="text-button" onClick={onReset}>
        Use another email
      </button>
    </>
  )
}

/** The emailed code signs in on this browser whichever device the email was read on. It takes the focus: it is the one
 * thing left to do here. */
export function CodeForm({ email, verify = verifyEmailCode }: { email: string } & Pick<EmailPorts, 'verify'>) {
  const [state, setState] = useState<Step>({ step: 'idle' })
  const check = async (code: string) => {
    setState({ step: 'sending' })
    try {
      await endsWithin(verify(email, code), AUTH_LIMIT_MS, CODE_NOT_CONFIRMED)
      // Signed in: the auth listener replaces this screen with the project.
    } catch (err: unknown) {
      setState({ step: 'error', message: err instanceof Error ? err.message : 'That code did not work.' })
    }
  }
  return (
    <>
      <CodeField
        id="email-code"
        action="Sign in with code"
        busy={state.step === 'sending'}
        focus={finePointer()}
        onCheck={(code) => void check(code)}
      />
      {state.step === 'sending' && <SlowNote />}
      {state.step === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
    </>
  )
}
