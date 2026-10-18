// What the sign-in says when this tab was signed out by a cause it did not start (docs/plans/signed-out-elsewhere.md):
// one polite line in the first visit's lede's place, said once, never naming the account (the device may be shared).

/** How this tab came to be signed out without signing out itself: from elsewhere, or while the page was closed. */
export type Ending = 'elsewhere' | 'away'

/** Each cause's sentence, and the one that follows only when unsent words went here. */
export const ENDED_WORDS = {
  elsewhere: 'You were signed out in another tab or on another device, so this tab signed out too.',
  away: 'Your sign-in on this device ended while you were away.',
  cleared: 'Unsent words here were cleared.',
} as const

/**
 * A sign-out heard while the page was open (another tab's, or a refresh the Auth service refused once every device was
 * signed out elsewhere) came from elsewhere when an account was in and this tab's own Sign out was not under way.
 */
export const endedWhileIn = (accountWasIn: boolean, ownSignOut: boolean): Ending | null =>
  accountWasIn && !ownSignOut ? 'elsewhere' : null

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
