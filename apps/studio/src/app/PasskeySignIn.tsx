// Passkeys on the sign-in page, without a button of their own: the browser offers them in the email field's
// autofill list, and a quiet text link opens its picker where autofill isn't offered.
import { useEffect, useRef, useState } from 'react'
import { passkeyAutofillAvailable, passkeysOffered, signInWithPasskey } from './auth.ts'

/** Renew the autofill offer before its challenge expires (Supabase Auth: 5 minutes by default). */
export const AUTOFILL_RENEW_MS = 4 * 60_000

/** One offer's signal: aborted when the page stops offering, or when it is time to renew the challenge. */
function roundSignal(stop: AbortSignal): { signal: AbortSignal; renewed: () => boolean; done: () => void } {
  const round = new AbortController()
  let renewed = false
  const timer = setTimeout(() => {
    renewed = true
    round.abort()
  }, AUTOFILL_RENEW_MS)
  const onStop = () => round.abort()
  stop.addEventListener('abort', onStop, { once: true })
  return {
    signal: round.signal,
    renewed: () => renewed,
    done: () => {
      clearTimeout(timer)
      stop.removeEventListener('abort', onStop)
    },
  }
}

/**
 * The autofill offer and the picker share the browser's single WebAuthn request: while one is pending, the
 * browser refuses another ("A request is already pending"). So they take turns. Opening the picker ends the
 * offer and waits until the browser has let it go; the offer resumes when the picker closes. The offer is
 * silent: nobody asked for it, so a failure says nothing, and "Use a passkey" remains the way that explains
 * itself. It is renewed before its challenge expires, so a passkey picked late still signs in the first time.
 */
export function usePasskeySignIn(onError: (message: string) => void) {
  const [picking, setPicking] = useState(false)
  const offer = useRef<{ stop: AbortController; settled: Promise<void> } | null>(null)
  useEffect(() => {
    if (picking) return undefined
    const stop = new AbortController()
    // Read through a function: the page can stop offering while a ceremony is awaited.
    const stopped = () => stop.signal.aborted
    const run = async (): Promise<void> => {
      if (!(await passkeyAutofillAvailable())) return
      while (!stopped()) {
        const round = roundSignal(stop.signal)
        const outcome = await signInWithPasskey({ signal: round.signal }).finally(round.done)
        if (outcome === 'signed_in' || stopped()) return
        if (outcome === 'dismissed' && !round.renewed()) return
      }
    }
    offer.current = { stop, settled: run().catch(() => undefined) }
    return () => stop.abort()
  }, [picking])
  const open = async () => {
    if (picking) return
    const current = offer.current
    current?.stop.abort()
    setPicking(true)
    try {
      await current?.settled
      if ((await signInWithPasskey()) === 'expired') onError('That took too long. Try the passkey again.')
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'That passkey didn’t work here.')
    } finally {
      setPicking(false)
    }
  }
  return { open, picking }
}

/** "Use a passkey": the browser's own picker, for browsers that don't list passkeys in autofill. */
export function PasskeyLink({ open, picking }: { open: () => Promise<void>; picking: boolean }) {
  if (!passkeysOffered) return null
  return (
    <button type="button" className="text-button" disabled={picking} onClick={() => void open()}>
      {picking ? 'Waiting for your passkey…' : 'Use a passkey'}
    </button>
  )
}
