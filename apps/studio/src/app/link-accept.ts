// Signing in with the session a link offered, once the person said the account is theirs (auth.ts). The Auth client's
// setSession takes no AbortSignal and can hang, so the wait has an end: past it the offer says so and offers to start
// over, while the attempt goes on (it signs in if it lands). One attempt runs at a time: two would each try to sign in
// with the same refresh token. Pressing Continue is the person's word that the account is theirs, so nothing declines
// it while it is under way: a decline that raced a late sign-in could not keep that session off the device.
import { settleWithin } from './deadline.ts'

export type Acceptance = 'in' | 'refused' | 'late'

export interface LinkAcceptance {
  /** Signs in with the offer, or waits on the attempt under way, for at most the wait. */
  accept: () => Promise<Acceptance>
}

/** `set` sets the offered session: true once signed in, false when the Auth service refused it. */
export function linkAcceptance(set: () => Promise<boolean>, waitMs: number): LinkAcceptance {
  let attempt: Promise<boolean> | null = null
  return {
    accept: () => {
      attempt ??= set().catch(() => false)
      return settleWithin(
        attempt.then((signedIn): Acceptance => (signedIn ? 'in' : 'refused')),
        waitMs,
        'late',
      )
    },
  }
}
