// The signed-in Studio's chunk (docs/plans/signed-in-later.md), fetched once: when a session is there, or as someone
// starts to sign in, so it is there by the time they are in.
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

/**
 * Whether who is in will most likely be someone: a session this browser keeps, or a sign-in's return (`?code=`). Read
 * from the page alone, so the chunk can be fetched while the session is still found out, never after it.
 */
export function sessionLikely(): boolean {
  if (new URL(window.location.href).searchParams.has('code')) return true
  try {
    for (let i = 0; i < localStorage.length; i++) if (KEPT_SESSION.test(localStorage.key(i) ?? '')) return true
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
