import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { refusalCode, watchRefusals } from './refresh-refusal.ts'

const AUTH = 'https://project.supabase.co/auth/v1'
const REFRESH = `${AUTH}/token?grant_type=refresh_token`

/** The Auth service's answer, as it sends it: a status and a JSON body. */
const answer = (status: number, body: unknown) => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

/** A refusal with API 2024-01-01, which supabase-js asks for: the code is `code`. */
const refusal = (code: string) => answer(400, { code, message: 'Invalid Refresh Token' })

describe('the code in a refusal of the Auth service (signed-out-elsewhere.md)', () => {
  it('reads `code` with API 2024-01-01, and `error_code` from an answer without it', () => {
    assert.equal(
      refusalCode({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token' }),
      'refresh_token_not_found',
    )
    assert.equal(
      refusalCode({ code: 400, error_code: 'refresh_token_already_used', msg: 'Already Used' }),
      'refresh_token_already_used',
    )
  })

  it('is empty when the answer names none: still a refusal, of no known cause', () => {
    assert.equal(refusalCode({ code: 400, msg: 'Bad Request' }), '')
    assert.equal(refusalCode(null), '')
    assert.equal(refusalCode('Bad Request'), '')
  })
})

describe('the watch on the app’s Auth client: each refresh the Auth service refused', () => {
  it('is noted with its code before the response is handed on, its body unread for supabase-js', async () => {
    const watch = watchRefusals(refusal('refresh_token_already_used'))
    const response = await watch.fetch(REFRESH, { method: 'POST' })
    // Noted already, as supabase-js gets the response: before it removes the session and says SIGNED_OUT.
    assert.equal(watch.take(), 'refresh_token_already_used')
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { code: 'refresh_token_already_used', message: 'Invalid Refresh Token' })
  })

  it('is noted from an answer without API 2024-01-01, and from one whose body is not JSON', async () => {
    const older = watchRefusals(answer(400, { code: 400, error_code: 'session_expired', msg: 'Session Expired' }))
    await older.fetch(REFRESH, { method: 'POST' })
    assert.equal(older.take(), 'session_expired')
    const plain = watchRefusals(() => Promise.resolve(new Response('Too Many Requests', { status: 429 })))
    const response = await plain.fetch(new URL(REFRESH), { method: 'POST' })
    assert.equal(plain.take(), '')
    assert.equal(await response.text(), 'Too Many Requests')
  })

  it('is taken once: the next word finds none', async () => {
    const watch = watchRefusals(refusal('refresh_token_not_found'))
    await watch.fetch(REFRESH, { method: 'POST' })
    assert.equal(watch.take(), 'refresh_token_not_found')
    assert.equal(watch.take(), null)
  })

  it('leaves out what ends no session: a 5xx, a refresh that went through, another request or grant', async () => {
    const cases: [string, () => Promise<Response>][] = [
      [REFRESH, answer(503, { code: 503, msg: 'Service Unavailable' })],
      [REFRESH, answer(200, { access_token: 'a', refresh_token: 'r' })],
      [`${AUTH}/otp`, answer(429, { code: 'over_email_send_rate_limit', message: 'Too many' })],
      [`${AUTH}/token?grant_type=pkce`, refusal('flow_state_not_found')],
      [`${AUTH}/user`, refusal('session_not_found')],
    ]
    for (const [url, reply] of cases) {
      const watch = watchRefusals(reply)
      await watch.fetch(url)
      assert.equal(watch.take(), null, url)
    }
  })

  it('lets a failure on the network through, for supabase-js to read, and notes nothing', async () => {
    const watch = watchRefusals(() => Promise.reject(new TypeError('Failed to fetch')))
    await assert.rejects(watch.fetch(REFRESH, { method: 'POST' }), TypeError)
    assert.equal(watch.take(), null)
  })
})
