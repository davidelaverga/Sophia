import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { AUTH_REQUEST_MS, refusals } from './auth-fetch.ts'

// The reliability baseline's gap #10 (docs/plans/reliability-retry-5xx-and-write-timeouts.md): the App's Auth client
// waits with an end, as the checks' client does (reauth.ts), so a refresh that never answers doesn't wait for good.

const realFetch = globalThis.fetch
const TOKEN = 'https://auth.sophia.test/auth/v1/token?grant_type=refresh_token'

/** An Auth service that takes the connection and never answers: the request ends only when its signal aborts. */
function silence(): void {
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
}

/** Lets the settled promise's handlers run (setImmediate isn't among the mocked timers). */
const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('the App’s Auth client has an end', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('a request that never answers is aborted at its bound, and not before', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    const seen = { outcome: 'waiting' as unknown, now: (): unknown => seen.outcome }
    const refresh = refusals.fetch(TOKEN, { method: 'POST' }).then(
      () => 'answered',
      (err: unknown) => err,
    )
    void refresh.then((v) => (seen.outcome = v))
    t.mock.timers.tick(AUTH_REQUEST_MS - 1)
    await settle()
    assert.equal(seen.now(), 'waiting')
    t.mock.timers.tick(1)
    await settle()
    const late = seen.now()
    assert.ok(late instanceof DOMException, `still ${String(late)} at ${String(AUTH_REQUEST_MS)} ms`)
    assert.equal(late.name, 'AbortError')
  })

  it('the client’s own abort ends it at once', async () => {
    silence()
    const caller = new AbortController()
    const refresh = refusals.fetch(TOKEN, { method: 'POST', signal: caller.signal })
    caller.abort()
    await assert.rejects(refresh, { name: 'AbortError' })
  })
})
