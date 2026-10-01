// Signing in with the session a link offered, once the person said the account is theirs (auth.ts). The Auth client's
// setSession takes no AbortSignal and can hang, so the wait has an end: the offer comes back, to try again or to say
// it isn't theirs. One attempt runs at a time, and a retry waits on it. A decline wins over an attempt that lands
// after it: that session is signed out on this device, and until none of it is left nothing shows it (`refusing`).
import { settleWithin } from './deadline.ts'

export interface SessionPort {
  /** Sets the offered session: true once signed in, false when the Auth service refused it. */
  set: () => Promise<boolean>
  /** Signs this device out, and only this one: resolves once no session is left on it, rejects while one is. */
  signOut: () => Promise<void>
}

export type Acceptance = 'in' | 'refused' | 'late'

export interface LinkAcceptance {
  /** Signs in with the offer, or waits on the attempt under way, for at most the wait. */
  accept: () => Promise<Acceptance>
  /** The person said it isn't theirs. True when an attempt is still under way (and is now refused). */
  decline: () => boolean
  /** A declined attempt's session may be on this device: under way, or landed and not signed out (yet). */
  refusing: () => boolean
}

export function linkAcceptance(port: SessionPort, waitMs: number): LinkAcceptance {
  let attempt: Promise<boolean> | null = null
  let settled = false
  let declined = false
  const run = async (): Promise<boolean> => {
    let signedIn = await port.set().catch(() => false)
    if (signedIn && declined) {
      // A session the person refused that couldn't be signed out keeps the fence up: it never shows.
      const gone = await port.signOut().then(
        () => true,
        () => false,
      )
      if (!gone) return false
      signedIn = false
    }
    settled = true
    return signedIn
  }
  return {
    accept: () => {
      attempt ??= run()
      return settleWithin(
        attempt.then((signedIn): Acceptance => (signedIn ? 'in' : 'refused')),
        waitMs,
        'late',
      )
    },
    decline: () => {
      declined = true
      return attempt !== null && !settled
    },
    refusing: () => declined && attempt !== null && !settled,
  }
}
