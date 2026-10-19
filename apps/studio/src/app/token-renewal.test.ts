import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RENEWED_LATELY_MS, tokenRenewal, type SessionAuth } from './token-renewal.ts'

// The reliability baseline's gap #3 (docs/plans/auth-session-renewal.md): where a refused request's new token comes
// from, at most once per refused token, never in a loop, and never another account's.

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const A = '00000000-0000-4000-8000-00000000d001'
const B = '00000000-0000-4000-8000-00000000e001'

/** An unsigned access token of `sub`'s sign-in `session`, its `n`th: a refresh keeps the sign-in and moves `n`. */
const jwt = (sub: string, n: number, session = `${sub}-sign-in`) =>
  `${part({ alg: 'none' })}.${part({ sub, session_id: session, n })}.synthetic`
const a = (n: number) => jwt(A, n)

/** An Auth client whose session holds `token`; each refresh gives that session's next token unless `refuses`. */
function authWith(token: string | null, refuses = false) {
  const state = { token, refreshes: 0 }
  const auth: SessionAuth = {
    getSession: () => Promise.resolve({ data: { session: state.token ? { access_token: state.token } : null } }),
    refreshSession: () => {
      state.refreshes += 1
      if (refuses || !state.token) return Promise.resolve({ data: { session: null }, error: new Error('refused') })
      const claims: unknown = JSON.parse(Buffer.from(state.token.split('.')[1] ?? '', 'base64url').toString())
      const { sub, session_id: session, n } = claims as { sub: string; session_id: string; n: number }
      state.token = jwt(sub, n + 1, session)
      return Promise.resolve({ data: { session: { access_token: state.token } }, error: null })
    },
  }
  return { auth, state }
}

describe('a refused token is renewed once', () => {
  it('the session’s token refused: one refresh, its new token', async () => {
    const { auth, state } = authWith(a(1))
    assert.equal(await tokenRenewal(auth)(a(1)), a(2))
    assert.equal(state.refreshes, 1)
  })

  it('every request the same token refused shares one refresh', async () => {
    const { auth, state } = authWith(a(1))
    const renew = tokenRenewal(auth)
    assert.deepEqual(await Promise.all([renew(a(1)), renew(a(1)), renew(a(1))]), [a(2), a(2), a(2)])
    assert.equal(await renew(a(1)), a(2))
    assert.equal(state.refreshes, 1)
  })

  it('a token already renewed elsewhere (the ticker) is given without a refresh', async () => {
    const { auth, state } = authWith(a(5))
    assert.equal(await tokenRenewal(auth)(a(1)), a(5))
    assert.equal(state.refreshes, 0)
  })

  it('nobody signed in any more: nothing to give, and no refresh', async () => {
    const { auth, state } = authWith(null)
    assert.equal(await tokenRenewal(auth)(a(1)), null)
    assert.equal(state.refreshes, 0)
  })

  it('a refresh that fails gives nothing: the refusal stands', async () => {
    const { auth } = authWith(a(1), true)
    assert.equal(await tokenRenewal(auth)(a(1)), null)
  })

  it('an Auth client that throws gives nothing, never a rejection', async () => {
    const auth: SessionAuth = {
      getSession: () => Promise.reject(new Error('lock lost')),
      refreshSession: () => Promise.reject(new Error('unreachable')),
    }
    assert.equal(await tokenRenewal(auth)(a(1)), null)
  })

  it('a token a renewal gave, refused within a minute, is not renewed again: no loop', async () => {
    const { auth, state } = authWith(a(1))
    let clock = 1_000_000
    const renew = tokenRenewal(auth, () => clock)
    assert.equal(await renew(a(1)), a(2))
    clock += RENEWED_LATELY_MS - 1
    assert.equal(await renew(a(2)), null)
    assert.equal(state.refreshes, 1)
  })

  it('a token a renewal gave that expires later, past the minute, is renewed: the next wake', async () => {
    const { auth, state } = authWith(a(1))
    let clock = 1_000_000
    const renew = tokenRenewal(auth, () => clock)
    assert.equal(await renew(a(1)), a(2))
    clock += 3600_000
    assert.equal(await renew(a(2)), a(3))
    assert.equal(state.refreshes, 2)
  })
})

// Independent review, P1: the session is read from the storage every tab shares. Another tab signed in as another
// account, not yet heard here, must never lend its token to this tab's refused request.
describe('a renewal never gives another sign-in’s token', () => {
  it('a session of another account in the storage: nothing, and no refresh (it would renew theirs)', async () => {
    const { auth, state } = authWith(jwt(B, 1))
    assert.equal(await tokenRenewal(auth)(a(1)), null)
    assert.equal(state.refreshes, 0)
  })

  it('the same account signed in anew elsewhere (another sign-in): nothing; this tab hears of it on its own', async () => {
    const { auth, state } = authWith(jwt(A, 1, 'a-new-sign-in'))
    assert.equal(await tokenRenewal(auth)(a(1)), null)
    assert.equal(state.refreshes, 0)
  })

  it('a refresh that comes back with another account’s token (the storage changed meanwhile): nothing', async () => {
    const { auth, state } = authWith(a(1))
    auth.refreshSession = () => {
      state.refreshes += 1
      return Promise.resolve({ data: { session: { access_token: jwt(B, 2) } }, error: null })
    }
    assert.equal(await tokenRenewal(auth)(a(1)), null)
  })

  it('a refused token that names no one: nothing, whatever the session holds', async () => {
    const { auth } = authWith(a(5))
    assert.equal(await tokenRenewal(auth)('not-a-token'), null)
  })
})
