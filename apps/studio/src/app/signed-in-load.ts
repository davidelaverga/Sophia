// The signed-in Studio's chunk (docs/plans/signed-in-later.md), fetched once: with the session's check when an
// account's session is likely, once one is there, or as someone starts to sign in, so it is there by the time they are.
import { readAuthCallback } from './auth-callback.ts'
import type { Studio } from './SignedIn.tsx'

let loading: Promise<{ Studio: typeof Studio }> | null = null

/** The signed-in Studio's module: one fetch, whoever asks first; a failed one forgotten, so the next asks again. */
export function loadSignedIn(): Promise<{ Studio: typeof Studio }> {
  loading ??= import('./SignedIn.tsx').catch((err: unknown) => {
    loading = null
    throw err
  })
  return loading
}

/** Supabase's own key for a session it keeps (`sb-<project>-auth-token`). */
const KEPT_SESSION = /^sb-.+-auth-token$/

/** A kept session that is an account's, as supabase-js keeps it: not a guest's left from a room's door. */
function anAccounts(kept: string | null): boolean {
  try {
    const session = JSON.parse(kept ?? 'null') as { user?: { is_anonymous?: boolean } } | null
    return session !== null && session.user?.is_anonymous !== true
  } catch {
    return false
  }
}

// A sign-in's return (a provider's `?code=`, a link's tokens), read as the page loads, as auth.ts reads it: signing in
// takes them out of the address before any effect runs.
const returning = ['code', 'tokens'].includes(readAuthCallback(window.location.href).kind)

/**
 * Whether who is in will most likely be an account: a sign-in's return, or a session this browser keeps for one. Read
 * from the page alone, so the chunk can be fetched while the session is still found out, never after.
 */
export function sessionLikely(): boolean {
  if (returning) return true
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? ''
      if (KEPT_SESSION.test(key) && anAccounts(localStorage.getItem(key))) return true
    }
  } catch {
    // Storage refused: nothing is known ahead, and the chunk comes once the session is.
  }
  return false
}

/** Fetched ahead, never waited on: not on a connection that asks to save data. */
export function warmSignedIn(): void {
  const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  if (!saving) void loadSignedIn().catch(() => undefined)
}
