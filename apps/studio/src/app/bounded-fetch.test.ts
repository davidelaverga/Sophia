import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { boundedFetch } from './bounded-fetch.ts'

// Codex P2 on #470 (docs/plans/auth-session-renewal.md): the bound covers the reply's body too. An Auth service, or a
// proxy before it, that sends its headers and then nothing more left `response.json()` waiting for good, and the
// client's own abort, once the headers were in, could no longer stop it.

const realFetch = globalThis.fetch
const BOUND_MS = 20_000
const TOKEN = 'https://auth.sophia.test/auth/v1/token?grant_type=refresh_token'

/**
 * An Auth service whose reply's headers come at once and whose body never ends: as a fetch does, the body fails once
 * the request's signal aborts.
 */
function headersThenSilence(): void {
  globalThis.fetch = (_url, init) => {
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('{"access_token":'))
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
      },
    })
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }))
  }
}

/** Lets the settled promise's handlers run (setImmediate isn't among the mocked timers). */
const settle = () => new Promise((resolve) => setImmediate(resolve))

/** The request's reply read whole as JSON, as supabase-js reads it: what it came to, or where it still waits. */
function readWhole(reply: Promise<Response>): { now: () => unknown } {
  let outcome: unknown = 'waiting'
  void reply
    .then((r) => r.json())
    .then(
      () => (outcome = 'read'),
      (err: unknown) => (outcome = err),
    )
  return { now: () => outcome }
}

describe('a bounded fetch ends with the reply’s body, not its headers', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('a body that never ends is aborted at the bound, and not before', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    headersThenSilence()
    const read = readWhole(boundedFetch(BOUND_MS)(TOKEN, { method: 'POST' }))
    await settle()
    t.mock.timers.tick(BOUND_MS - 1)
    await settle()
    assert.equal(read.now(), 'waiting')
    t.mock.timers.tick(1)
    await settle()
    const late = read.now()
    assert.ok(late instanceof DOMException, `still ${String(late)} at ${String(BOUND_MS)} ms`)
    assert.equal(late.name, 'AbortError')
  })

  it('the client’s own abort, after the headers came, ends the read at once', async () => {
    headersThenSilence()
    const caller = new AbortController()
    const read = readWhole(boundedFetch(BOUND_MS)(TOKEN, { method: 'POST', signal: caller.signal }))
    await settle()
    caller.abort()
    await settle()
    const ended = read.now()
    assert.ok(ended instanceof DOMException, `still ${String(ended)} after the client aborted`)
    assert.equal(ended.name, 'AbortError')
  })

  it('a reply that comes whole is handed on as it came: its status, its headers and its body', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response('{"code":"refresh_token_not_found"}', {
          status: 400,
          headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
        }),
      )
    const reply = await boundedFetch(BOUND_MS)(TOKEN, { method: 'POST' })
    assert.equal(reply.status, 400)
    assert.equal(reply.headers.get('x-supabase-api-version'), '2024-01-01')
    assert.deepEqual(await reply.clone().json(), { code: 'refresh_token_not_found' })
    assert.deepEqual(await reply.json(), { code: 'refresh_token_not_found' })
  })

  it('a reply with no body (a sign-out’s 204) is handed on with none', async () => {
    globalThis.fetch = () => Promise.resolve(new Response(null, { status: 204 }))
    const reply = await boundedFetch(BOUND_MS)('https://auth.sophia.test/auth/v1/logout', { method: 'POST' })
    assert.equal(reply.status, 204)
    assert.equal(await reply.text(), '')
  })
})
