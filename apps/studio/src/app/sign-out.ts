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

/**
 * Ends the session with Supabase (sign-out-scope.md): this device's only, unless the person asked for every device the
 * account is signed in on. supabase-js's own default is every device.
 */
export async function endSession(
  auth: { signOut: (options: { scope: 'local' | 'global' }) => Promise<unknown> },
  everywhere: boolean,
): Promise<void> {
  await auth.signOut({ scope: everywhere ? 'global' : 'local' })
}

/** What a sign-out left (Codex P1 on #410). Stub: nothing said yet. */
export type Ended = 'ended' | 'here-only'

export const NOT_EVERYWHERE = ''

export const signedOutAfter = (_ended: Ended): { status: 'signed_out'; notice?: string } => ({ status: 'signed_out' })
