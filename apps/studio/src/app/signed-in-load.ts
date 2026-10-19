// The signed-in Studio's chunk (docs/plans/signed-in-later.md), fetched once: with the session's check when an
// account's session is likely, once one is there, or as someone starts to sign in, so it is there by the time they are.
import { readAuthCallback } from './auth-callback.ts'
import { accountSessionKept } from './kept-session.ts'
import { legalDoc } from './legal.ts'
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

// A sign-in's return (a provider's `?code=`, a link's tokens), read as the page loads, as auth.ts reads it: signing in
// takes them out of the address before any effect runs.
const returning = ['code', 'tokens'].includes(readAuthCallback(window.location.href).kind)

/**
 * Whether who is in will most likely be an account: a sign-in's return, or a session this browser keeps for one. Read
 * from the page alone, so the chunk can be fetched while the session is still found out, never after. Storage refused,
 * nothing is known ahead, and the chunk comes once the session is.
 */
export const sessionLikely = (): boolean => returning || accountSessionKept()

/** Fetched ahead, never waited on: not on a connection that asks to save data. */
export function warmSignedIn(): void {
  const saving = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  if (!saving) void loadSignedIn().catch(() => undefined)
}

// An account's session likely as the page loads: the chunk goes as the app starts, beside the session's check, never
// after the first render (one more round of requests, which a slow connection or a dev server's modules pay in full).
// Not for the terms and the privacy notice: they read on their own and load nothing of the Studio (Codex on #366).
if (sessionLikely() && legalDoc(window.location.pathname) === null) warmSignedIn()
