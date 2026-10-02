// Signing in with the session a link offered, once the person said the account is theirs (auth.ts). The Auth client's
// setSession takes no AbortSignal and can hang, so the wait has an end: past it the offer says so and offers to start
// over, while the attempt goes on. Its result is still the press's when it comes (`outcome`): signed in, or refused and
// said so, never "Signing in…" for good. One attempt runs at a time: two would each try to sign in with the same
// refresh token. Pressing Continue is the person's word that the account is theirs, so nothing declines
// it while it is under way: a decline that raced a late sign-in could not keep that session off the device.
import { settleWithin } from './deadline.ts'

export type Acceptance = 'in' | 'refused' | 'late'

export interface LinkAcceptance {
  /** Signs in with the offer, or waits on the attempt under way, for at most the wait. */
  accept: () => Promise<Acceptance>
  /** The attempt's own result, however long it takes: what a press that outlasted the wait gets in the end. */
  outcome: () => Promise<Exclude<Acceptance, 'late'>>
}

/** `set` sets the offered session: true once signed in, false when the Auth service refused it. */
export function linkAcceptance(set: () => Promise<boolean>, waitMs: number): LinkAcceptance {
  let attempt: Promise<boolean> | null = null
  const outcome = () => {
    attempt ??= set().catch(() => false)
    return attempt.then((signedIn) => (signedIn ? ('in' as const) : ('refused' as const)))
  }
  return { accept: () => settleWithin(outcome(), waitMs, 'late'), outcome }
}
