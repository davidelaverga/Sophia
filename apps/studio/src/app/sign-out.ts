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

/** The part of Supabase's Auth client a sign-out uses: the call, and the word that this device's session went. */
interface SessionEnd {
  signOut: (options: { scope: 'local' | 'global' }) => Promise<unknown>
  onAuthStateChange: (callback: (event: string) => void) => { data: { subscription: { unsubscribe: () => void } } }
}

/**
 * Ends the session with Supabase (sign-out-scope.md): this device's only, unless the person asked for every device the
 * account is signed in on. supabase-js's own default is every device. A call that fails may or may not have removed
 * this device's session (supabase-js 2.117.1, `_signOut`): a logout's 5xx removes it, a refresh that failed first
 * doesn't. Whether it went is what supabase-js says to its listeners (SIGNED_OUT) before the call resolves. Gone, asked
 * for every device, only this one is out; still here, nothing ended, and the sign-out fails (Codex P1s on #410).
 */
export async function endSession(auth: SessionEnd, everywhere: boolean): Promise<Ended> {
  // Set by the listener, as the call runs: an object, so what the call changes is read after it.
  const session = { removed: false }
  const { data } = auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') session.removed = true
  })
  try {
    const result = await auth.signOut({ scope: everywhere ? 'global' : 'local' })
    if (!failed(result)) return 'ended'
    if (!session.removed) throw new Error('The sign-out failed: this device’s session is still here.')
    return everywhere ? 'here-only' : 'ended'
  } finally {
    data.subscription.unsubscribe()
  }
}

/**
 * What «Sign out of all devices» says before it signs out (Codex P1 on #410, third): a global sign-out revokes the
 * refresh tokens, and an access token already given lives to its expiry (jwt_expiry 3600 s in supabase/config.toml,
 * Supabase's default), which is all the API checks. So the others go within the hour, not at once.
 */
export const EVERYWHERE = {
  label: 'Sign out of all devices',
  warning: 'This one signs out now. Your other devices are signed out within an hour, when their sign-in next renews.',
  confirm: 'Sign out everywhere',
  keep: 'Stay signed in',
} as const

/** Said on the sign-in when every device was asked and only this one is out. */
export const NOT_EVERYWHERE =
  'You’re signed out here. Your other devices may still be signed in: sign in and try “Sign out of all devices” again.'

/** The state a sign-out leaves: signed out, and said so when the other devices may still be in. */
export const signedOutAfter = (ended: Ended): { status: 'signed_out'; notice?: string } =>
  ended === 'here-only' ? { status: 'signed_out', notice: NOT_EVERYWHERE } : { status: 'signed_out' }
