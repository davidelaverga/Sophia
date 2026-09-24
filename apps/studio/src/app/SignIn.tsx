// Sign-in screens: Supabase magic link, dev identities, or a configuration hint.
import { useState } from 'react'
import { authMode, sendMagicLink } from './auth.ts'
import { devIdentities, type Identity } from './dev-identity.ts'

/** Auth served by the local Supabase stack: sign-in emails land in Mailpit, not a real inbox. */
const LOCAL_AUTH = /^http:\/\/(127\.0\.0\.1|localhost):54321/.test(import.meta.env.VITE_SUPABASE_URL ?? '')
const MAILPIT_URL = 'http://127.0.0.1:54324'

export function Centered({ title, children, busy }: { title: string; children?: React.ReactNode; busy?: boolean }) {
  return (
    <main className="centered" aria-busy={busy}>
      <span className="orb big" aria-hidden />
      <h2>{title}</h2>
      {children}
    </main>
  )
}

export function SignIn({ onChooseDev }: { onChooseDev: (identity: Identity) => void }) {
  if (authMode === 'supabase') return <EmailSignIn />
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
        {devIdentities.map((i) => (
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

function EmailSignIn() {
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
      <form className="signin" onSubmit={(e) => void submit(e)}>
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
        <button type="submit" className="primary" disabled={state.step === 'sending'}>
          {state.step === 'sending' ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
      {state.step === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
    </Centered>
  )
}

function LinkSent({ email, onReset }: { email: string; onReset: () => void }) {
  return (
    <Centered title="Check your email">
      <p>
        We sent a sign-in link to <strong>{email}</strong>. Open it in this browser.
      </p>
      {LOCAL_AUTH && (
        <p className="muted">
          Local stack: the email is in{' '}
          <a href={MAILPIT_URL} target="_blank" rel="noreferrer">
            Mailpit
          </a>
          .
        </p>
      )}
      <button type="button" className="text" onClick={onReset}>
        Use another email
      </button>
    </Centered>
  )
}
