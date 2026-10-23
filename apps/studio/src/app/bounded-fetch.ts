// fetch with an end for each request, for the Auth clients (auth-fetch.ts, reauth.ts): a lost connection says so
// instead of leaving a refresh or a check waiting for good.

/** Statuses whose reply has no body: a Response made with one would throw. */
const NO_BODY = new Set([101, 204, 205, 304])

/**
 * The reply read whole, handed on as it came (status, headers, bytes), so the bound covers its body too: headers that
 * come and a body that never ends would otherwise leave supabase-js reading for good (Codex P2 on #470). An Auth reply
 * is small JSON or nothing, and neither client streams.
 */
async function whole(reply: Response): Promise<Response> {
  const body = NO_BODY.has(reply.status) ? null : await reply.arrayBuffer()
  return new Response(body, { status: reply.status, statusText: reply.statusText, headers: reply.headers })
}

/**
 * fetch with an end for each request: its own controller, aborted after `ms` or with the caller's signal, which is
 * followed by hand (AbortSignal.any isn't in Safari 16.4, which the build targets). The end is the reply's body's.
 */
export const boundedFetch =
  (ms: number): typeof fetch =>
  (input, init) => {
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), ms)
    const caller = init?.signal
    const follow = () => stop.abort()
    if (caller?.aborted) stop.abort()
    else caller?.addEventListener('abort', follow, { once: true })
    return fetch(input, { ...init, signal: stop.signal })
      .then(whole)
      .finally(() => {
        clearTimeout(timer)
        caller?.removeEventListener('abort', follow)
      })
  }
