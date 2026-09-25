// Sign-in screens: Supabase magic link, dev identities, or a configuration hint. Each is a quiet room
// with Sophia's light at rest above the words.
import { useState } from 'react'
import { SophiaLight } from '../features/light/SophiaLight.tsx'
import { authMode, sendMagicLink, verifyEmailCode } from './auth.ts'
import { devIdentities, type Identity } from './dev-identity.ts'
import { ProviderButtons } from './ProviderButtons.tsx'

/** Auth served by the local Supabase stack: sign-in emails land in Mailpit, not a real inbox. */
const LOCAL_AUTH = /^http:\/\/(127\.0\.0\.1|localhost):54321/.test(import.meta.env.VITE_SUPABASE_URL ?? '')
const MAILPIT_URL = 'http://127.0.0.1:54324'

export function Centered({ title, children, busy }: { title: string; children?: React.ReactNode; busy?: boolean }) {
  return (
    <main className="screen" aria-busy={busy}>
      <SophiaLight mode="rest" target={null} attention={null} working={false} />
      <div className="screen-mark">
        <span className="mark-dot" aria-hidden />
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

type Step = { step: 'idle' | 'sending' | 'sent' } | { step: 'error'; message: string }

function EmailSignIn({ notice }: { notice: string | undefined }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<Step>({ step: 'idle' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ step: 'sending' })
    try {
      await sendMagicLink(email.trim())
      setState({ step: 'sent' })
    } catch (err: unknown) {
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Could not send the link.' })
    }
  }

  if (state.step === 'sent') return <LinkSent email={email} onReset={() => setState({ step: 'idle' })} />
  return (
    <Centered title="Sign in to Sophia">
      {notice && (
        <p className="form-error" role="alert">
          {notice}
        </p>
      )}
      <ProviderButtons />
      <form className="field" onSubmit={(e) => void submit(e)}>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="pill primary" disabled={state.step === 'sending'}>
          {state.step === 'sending' ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
      {state.step === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="muted">New here? The same link creates your account.</p>
    </Centered>
  )
}

function LinkSent({ email, onReset }: { email: string; onReset: () => void }) {
  return (
    <Centered title="Check your email">
      <p>
        We sent a sign-in link and a code to <strong>{email}</strong>. Open the link in this browser, or enter the code
        here if you read your email somewhere else.
      </p>
      <CodeForm email={email} />
      {LOCAL_AUTH && (
        <p className="muted">
          Local stack: the email is in{' '}
          <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
            Mailpit
          </a>
          .
        </p>
      )}
      <button type="button" className="text-button" onClick={onReset}>
        Use another email
      </button>
    </Centered>
  )
}

/** The emailed code signs in on this browser whichever device the email was read on. */
export function CodeForm({ email }: { email: string }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<Step>({ step: 'idle' })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ step: 'sending' })
    try {
      await verifyEmailCode(email, code.trim())
      // Signed in: the auth listener replaces this screen with the project.
    } catch (err: unknown) {
      setState({ step: 'error', message: err instanceof Error ? err.message : 'That code did not work.' })
    }
  }
  return (
    <>
      <form className="field" onSubmit={(e) => void submit(e)}>
        <label htmlFor="email-code" className="sr-only">
          Code from the email
        </label>
        <input
          id="email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,10}"
          required
          placeholder="Code from the email"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <button type="submit" className="pill primary" disabled={state.step === 'sending'}>
          {state.step === 'sending' ? 'Checking…' : 'Sign in with code'}
        </button>
      </form>
      {state.step === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
    </>
  )
}
