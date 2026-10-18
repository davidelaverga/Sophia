// What the sign-in says when this tab was signed out by a cause it did not start (docs/plans/signed-out-elsewhere.md):
// one polite line in the first visit's lede's place, said once, never naming the account (the device may be shared).

/**
 * How this tab came to be signed out without signing out itself: from elsewhere; by a refresh the Auth service refused
 * for another cause; or while the page was closed.
 */
export type Ending = 'elsewhere' | 'refused' | 'away'

/** Each cause's sentence, and the one that follows only when unsent words went here. */
export const ENDED_WORDS = {
  elsewhere: 'You were signed out in another tab or on another device, so this tab signed out too.',
  refused: 'Your sign-in on this device ended, so this tab signed out.',
  away: 'Your sign-in on this device ended while you were away.',
  cleared: 'Unsent words here were cleared.',
} as const

/** The Auth service's codes for a session it no longer has: signed out elsewhere (every device, or the others). */
const GONE_FROM_AUTH: readonly string[] = ['refresh_token_not_found', 'session_not_found']

/**
 * A sign-out heard while the page was open, with an account in and this tab's own Sign out not under way. `refused`:
 * the code of this tab's refresh the Auth service refused just before (refresh-refusal.ts), or null when none came, so
 * the word was another tab's. Another tab's, or a session gone from the Auth service, was signed out elsewhere; any
 * other refusal (a refresh token used twice, an expired session, a rate limit, a barred account) ended it here, and the
 * line blames no one elsewhere.
 */
export function endedWhileIn(accountWasIn: boolean, ownSignOut: boolean, refused: string | null): Ending | null {
  if (!accountWasIn || ownSignOut) return null
  return refused === null || GONE_FROM_AUTH.includes(refused) ? 'elsewhere' : 'refused'
}

/**
 * As the page loads: a session this device kept for an account (`before` the client started), gone once it checked it
 * (`after`), with nobody in, ended while the page was closed. A refresh that failed on the network leaves it kept.
 */
export const endedAtLoad = (kept: { before: boolean; after: boolean }, signedIn: boolean): Ending | null =>
  kept.before && !kept.after && !signedIn ? 'away' : null

/**
 * The line: nothing without a cause, nor before the clearing has said whether unsent words went (`cleared` undefined);
 * then the cause, and the cleared words only when some went.
 */
export function endedNotice(ending: Ending | undefined, cleared: boolean | undefined): string | null {
  if (ending === undefined || cleared === undefined) return null
  return cleared ? `${ENDED_WORDS[ending]} ${ENDED_WORDS.cleared}` : ENDED_WORDS[ending]
}
