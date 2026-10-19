import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RENEWED_LATELY_MS, tokenRenewal, type SessionAuth } from './token-renewal.ts'

// The reliability baseline's gap #3 (docs/plans/auth-session-renewal.md): where a refused request's new token comes
// from, at most once per refused token, and never in a loop.

/** An Auth client whose session holds `token`, each refresh giving the next `t<n>` unless `refuses`. */
function authWith(token: string | null, refuses = false) {
  const state = { token, refreshes: 0 }
  const auth: SessionAuth = {
    getSession: () => Promise.resolve({ data: { session: state.token ? { access_token: state.token } : null } }),
    refreshSession: () => {
      state.refreshes += 1
      if (refuses) return Promise.resolve({ data: { session: null }, error: new Error('refused') })
      state.token = `t${String(state.refreshes + 1)}`
      return Promise.resolve({ data: { session: { access_token: state.token } }, error: null })
    },
  }
  return { auth, state }
}

describe('a refused token is renewed once', () => {
  it('the session’s token refused: one refresh, its new token', async () => {
    const { auth, state } = authWith('t1')
    assert.equal(await tokenRenewal(auth)('t1'), 't2')
    assert.equal(state.refreshes, 1)
  })

  it('every request the same token refused shares one refresh', async () => {
    const { auth, state } = authWith('t1')
    const renew = tokenRenewal(auth)
    assert.deepEqual(await Promise.all([renew('t1'), renew('t1'), renew('t1')]), ['t2', 't2', 't2'])
    assert.equal(await renew('t1'), 't2')
    assert.equal(state.refreshes, 1)
  })

  it('a token already renewed elsewhere (the ticker) is given without a refresh', async () => {
    const { auth, state } = authWith('t5')
    assert.equal(await tokenRenewal(auth)('t1'), 't5')
    assert.equal(state.refreshes, 0)
  })

  it('nobody signed in any more: nothing to give, and no refresh', async () => {
    const { auth, state } = authWith(null)
    assert.equal(await tokenRenewal(auth)('t1'), null)
    assert.equal(state.refreshes, 0)
  })

  it('a refresh that fails gives nothing: the refusal stands', async () => {
    const { auth } = authWith('t1', true)
    assert.equal(await tokenRenewal(auth)('t1'), null)
  })

  it('an Auth client that throws gives nothing, never a rejection', async () => {
    const auth: SessionAuth = {
      getSession: () => Promise.reject(new Error('lock lost')),
      refreshSession: () => Promise.reject(new Error('unreachable')),
    }
    assert.equal(await tokenRenewal(auth)('t1'), null)
  })

  it('a token a renewal gave, refused within a minute, is not renewed again: no loop', async () => {
    const { auth, state } = authWith('t1')
    let clock = 1_000_000
    const renew = tokenRenewal(auth, () => clock)
    assert.equal(await renew('t1'), 't2')
    clock += RENEWED_LATELY_MS - 1
    assert.equal(await renew('t2'), null)
    assert.equal(state.refreshes, 1)
  })

  it('a token a renewal gave that expires later, past the minute, is renewed: the next wake', async () => {
    const { auth, state } = authWith('t1')
    let clock = 1_000_000
    const renew = tokenRenewal(auth, () => clock)
    assert.equal(await renew('t1'), 't2')
    clock += 3600_000
    assert.equal(await renew('t2'), 't3')
    assert.equal(state.refreshes, 2)
  })
})
