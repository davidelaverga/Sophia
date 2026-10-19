// fetch with an end for each request, for the Auth clients (auth-fetch.ts, reauth.ts): a lost connection says so
// instead of leaving a refresh or a check waiting for good.

/**
 * fetch with an end for each request: its own controller, aborted after `ms` or with the caller's signal, which is
 * followed by hand (AbortSignal.any isn't in Safari 16.4, which the build targets). The end is the reply's headers';
 * an Auth reply's body is small.
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
    return fetch(input, { ...init, signal: stop.signal }).finally(() => {
      clearTimeout(timer)
      caller?.removeEventListener('abort', follow)
    })
  }
