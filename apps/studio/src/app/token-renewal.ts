// Where the API's requests get a new token when the API refuses theirs (api/renew.ts, auth-session-renewal.md): the
// App's Supabase Auth client. supabase-js refreshes on its own only in a shown tab, every 30 s, once the token has under
// 90 s left; a laptop that wakes past the hour asks the API before that refresh has come back.

/** What a renewal asks of the Auth client: supabase-js's own `getSession` and `refreshSession`. */
export interface SessionAuth {
  getSession(): Promise<{ data: { session: { access_token: string } | null } }>
  refreshSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>
}

/**
 * A token a renewal gave that the API refuses this soon after isn't expired: the API refuses it for another cause, and
 * renewing again would only loop (the feed starts again on each new token).
 */
export const RENEWED_LATELY_MS = 60_000

/** The token now: the session's if it is already another than the refused one, else a refresh's; null without one. */
async function renewed(auth: SessionAuth, stale: string): Promise<string | null> {
  const { data } = await auth.getSession()
  const now = data.session?.access_token ?? null
  if (now !== stale) return now // the ticker or another request renewed it, or nobody is signed in any more
  const { data: refreshed, error } = await auth.refreshSession()
  return error ? null : (refreshed.session?.access_token ?? null)
}

/**
 * The renewal the API's requests use: one per refused token, shared by every request it refused, and none for a token
 * a renewal gave less than a minute ago. A renewal that fails gives null: the 401 stands, and so do today's words. A
 * refresh the Auth service refuses still signs out as before (refresh-refusal.ts).
 */
export function tokenRenewal(
  auth: SessionAuth,
  now: () => number = Date.now,
): (stale: string) => Promise<string | null> {
  let last: { stale: string; fresh: Promise<string | null> } | null = null
  let gave: { token: string; at: number } | null = null
  return (stale) => {
    if (last?.stale === stale) return last.fresh
    if (gave?.token === stale && now() - gave.at < RENEWED_LATELY_MS) return Promise.resolve(null)
    const fresh = renewed(auth, stale).then(
      (token) => {
        if (token) gave = { token, at: now() }
        return token
      },
      () => null,
    )
    last = { stale, fresh }
    return fresh
  }
}
