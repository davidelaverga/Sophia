// Passkeys on the sign-in page, without a button of their own: the browser offers them in the email field's
// autofill list, and a quiet text link opens its picker where autofill isn't offered.
import { useEffect, useState } from 'react'
import { passkeyAutofillAvailable, passkeysOffered, signInWithPasskey } from './auth.ts'

/**
 * Keeps a passkey offer open in the email field's autofill list while the sign-in page is shown, renewing it
 * when its challenge expires. The auth listener takes over when someone picks a passkey. The offer is silent:
 * nobody asked for it, so a failure (no passkeys on this server, an unsupported browser) says nothing, and
 * "Use a passkey" remains the way that explains itself.
 */
export function usePasskeyAutofill(): void {
  useEffect(() => {
    const stop = new AbortController()
    const offer = async (): Promise<void> => {
      if (!(await passkeyAutofillAvailable())) return
      while (!stop.signal.aborted) {
        if ((await signInWithPasskey({ signal: stop.signal })) !== 'expired') return
      }
    }
    offer().catch(() => undefined)
    return () => stop.abort()
  }, [])
}

/** "Use a passkey": the browser's own picker, for browsers that don't list passkeys in autofill. */
export function PasskeyLink({ onError }: { onError: (message: string) => void }) {
  const [waiting, setWaiting] = useState(false)
  if (!passkeysOffered) return null
  const open = async () => {
    setWaiting(true)
    try {
      await signInWithPasskey()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'That passkey didn’t work here.')
    } finally {
      setWaiting(false)
    }
  }
  return (
    <button type="button" className="text-button" disabled={waiting} onClick={() => void open()}>
      {waiting ? 'Waiting for your passkey…' : 'Use a passkey'}
    </button>
  )
}
