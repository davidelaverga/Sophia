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

/** Ends the session with Supabase (stub: sign-out-scope.md). */
export const endSession = (
  _auth: { signOut: (options: { scope: 'local' | 'global' }) => Promise<unknown> },
  _everywhere: boolean,
): Promise<void> => Promise.resolve()
