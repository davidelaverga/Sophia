// A token the API no longer takes is renewed once, and the request goes again (docs/plans/auth-session-renewal.md). A
// laptop that wakes past its token's hour asks before supabase-js has refreshed, and the API answers 401: the person is
// still signed in, so the project must not say «You've been signed out». Where a new token comes from is the App's
// (app/token-renewal.ts); a page with no App registers nothing, and its 401s are answers as before.

/** A new access token for `stale`, the one the API refused, or null when there is none to give. Never rejects. */
export type Renewal = (stale: string) => Promise<string | null>

let renewal: Renewal | null = null

/** Where new tokens come from: the App's Auth client, set once as it starts. */
export function renewTokensWith(renew: Renewal | null): void {
  renewal = renew
}

/** `work`'s result, or null once `signal` aborts first: a renewal waits within the request's own bound. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | null | undefined): Promise<T | null> {
  if (!signal) return work
  return new Promise((resolve) => {
    const stop = () => resolve(null)
    if (signal.aborted) return stop()
    signal.addEventListener('abort', stop, { once: true })
    void work.then(resolve, stop).finally(() => signal.removeEventListener('abort', stop))
  })
}

const bearerOf = (headers: Headers) => /^Bearer (.+)$/.exec(headers.get('authorization') ?? '')?.[1]

/**
 * fetch for the API. A 401 to a request with a bearer renews the token once and sends the same request again with the
 * new one: its other headers (the Idempotency-Key) and its body unchanged. 401 means the API refused the token before
 * handling anything, so nothing is done twice. A second 401 is the answer, as is a 401 nothing renews; a 403 never
 * renews. A request aborted while its token is renewed ends as an abort.
 */
export async function apiFetch(input: string, init: RequestInit): Promise<Response> {
  const reply = await fetch(input, init)
  const renew = renewal
  if (reply.status !== 401 || !renew) return reply
  const headers = new Headers(init.headers)
  const stale = bearerOf(headers)
  if (!stale) return reply
  const fresh = await untilAborted(renew(stale), init.signal)
  init.signal?.throwIfAborted()
  if (!fresh || fresh === stale) return reply
  void reply.body?.cancel().catch(() => undefined)
  headers.set('authorization', `Bearer ${fresh}`)
  return fetch(input, { ...init, headers })
}
