// Account providers as one quiet row of marks above the email form. Each leaves for its own consent page and
// comes back signed in; a first visit creates the account, as the email link does.
import { useState } from 'react'
import { Tip } from '@sophia/ui'
import { oauthProviders, signInWithProvider, type OAuthProvider } from './auth.ts'

const PROVIDER_NAME: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub', azure: 'Microsoft' }

const GITHUB_MARK =
  'M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.84c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.18.58.69.48A10.02 10.02 0 0022 12c0-5.52-4.48-10-10-10z'

function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === 'github')
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="currentColor">
        <path d={GITHUB_MARK} />
      </svg>
    )
  if (provider === 'azure')
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
        <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
        <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
        <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
      </svg>
    )
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

/** Nothing when no provider is enabled: the email form then stands alone. */
export function ProviderButtons() {
  const [leaving, setLeaving] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (oauthProviders.length === 0) return null

  const go = async (provider: OAuthProvider) => {
    setLeaving(provider)
    setError(null)
    try {
      await signInWithProvider(provider) // the page leaves on success
    } catch (err: unknown) {
      setLeaving(null)
      setError(err instanceof Error ? err.message : `Couldn’t open ${PROVIDER_NAME[provider]}.`)
    }
  }
  return (
    <>
      <div className="providers" role="group" aria-label="Continue with an account">
        {oauthProviders.map((p) => (
          <button
            key={p}
            type="button"
            className="provider has-tip"
            aria-label={`Continue with ${PROVIDER_NAME[p]}`}
            aria-busy={leaving === p}
            disabled={leaving !== null}
            onClick={() => void go(p)}
          >
            <ProviderMark provider={p} />
            <Tip label={leaving === p ? `Opening ${PROVIDER_NAME[p]}…` : PROVIDER_NAME[p]} />
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="or" aria-hidden>
        <span>or</span>
      </div>
    </>
  )
}
