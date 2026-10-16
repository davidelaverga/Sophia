// Signing out leaves nothing personal on this device (App's leaveSession).
/**
 * The drafts go at once, and again once the sign-out has settled, however it went: words written while it was on its
 * way (typed, or back from a send that failed) don't stay either.
 */
export async function signOutForgetting(signOut: () => Promise<void>, forget: () => void): Promise<void> {
  forget()
  try {
    await signOut()
  } finally {
    forget()
  }
}

/** What a sign-out left: this device signed out and, when asked, every device; or only this one (Codex P1 on #410). */
export type Ended = 'ended' | 'here-only'

/** A result that carries an error: supabase-js resolves a failed call with `{ error }` instead of rejecting. */
const failed = (result: unknown): boolean =>
  typeof result === 'object' &&
  result !== null &&
  'error' in result &&
  result.error !== null &&
  result.error !== undefined

/**
 * Ends the session with Supabase (sign-out-scope.md): this device's only, unless the person asked for every device the
 * account is signed in on. supabase-js's own default is every device. A logout that fails (a 5xx, the network) still
 * removes this device's session (supabase-js 2.117.1, `_signOut`): asked for every device, only this one is out.
 */
export async function endSession(
  auth: { signOut: (options: { scope: 'local' | 'global' }) => Promise<unknown> },
  everywhere: boolean,
): Promise<Ended> {
  const result = await auth.signOut({ scope: everywhere ? 'global' : 'local' })
  return everywhere && failed(result) ? 'here-only' : 'ended'
}

/** Said on the sign-in when every device was asked and only this one is out. */
export const NOT_EVERYWHERE =
  'You’re signed out here. Your other devices may still be signed in: sign in and try “Sign out of all devices” again.'

/** The state a sign-out leaves: signed out, and said so when the other devices may still be in. */
export const signedOutAfter = (ended: Ended): { status: 'signed_out'; notice?: string } =>
  ended === 'here-only' ? { status: 'signed_out', notice: NOT_EVERYWHERE } : { status: 'signed_out' }
