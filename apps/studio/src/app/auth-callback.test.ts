import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LINK_FAILED,
  linkDecision,
  providerCheckPassed,
  readAuthCallback,
  tokenSession,
  tokenSubject,
  withoutAuthParams,
} from './auth-callback.ts'

const STUDIO = 'https://sophia-studio.vercel.app'

/** An unsigned token with these claims: only its payload is read here. */
const token = (claims: object) =>
  `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`

describe('auth callback', () => {
  it('reads the tokens an invitation link returns in the fragment', () => {
    const href = `${STUDIO}/#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=rrr&token_type=bearer&type=invite`
    assert.deepEqual(readAuthCallback(href), { kind: 'tokens', accessToken: 'aaa.bbb.ccc', refreshToken: 'rrr' })
  })

  it('tells a magic-link code apart from no callback at all', () => {
    assert.deepEqual(readAuthCallback(`${STUDIO}/p/abc/studio?code=4f1d`), { kind: 'code' })
    assert.deepEqual(readAuthCallback(`${STUDIO}/p/abc/studio`), { kind: 'none' })
    assert.deepEqual(readAuthCallback(`${STUDIO}/#access_token=only`), { kind: 'none' })
  })

  it('names an expired or reused link in the Studio’s words', () => {
    const href = `${STUDIO}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    assert.deepEqual(readAuthCallback(href), {
      kind: 'error',
      message: 'That sign-in link has expired or was already used. Ask for a new one below.',
    })
  })

  it('never shows the words an address carries: anyone can write them', () => {
    const words = 'error_description=Your+account+is+locked.+Call+555-0100'
    for (const href of [`${STUDIO}/?${words}`, `${STUDIO}/#${words}`, `${STUDIO}/?error=server_error&${words}`]) {
      assert.deepEqual(readAuthCallback(href), { kind: 'error', message: LINK_FAILED })
    }
    // A code the Studio does not know, even one that names an object's own property, is a failed link.
    for (const code of ['constructor', '__proto__', 'toString', 'made_up']) {
      assert.deepEqual(readAuthCallback(`${STUDIO}/?error_code=${code}`), { kind: 'error', message: LINK_FAILED })
    }
  })

  it('drops every auth parameter but keeps the route', () => {
    assert.equal(withoutAuthParams(`${STUDIO}/p/abc/work?code=1&x=2#access_token=t`), '/p/abc/work?x=2')
    assert.equal(withoutAuthParams(`${STUDIO}/?error_description=bad&error=e`), '/')
  })
})

describe('a link that carries a session', () => {
  it('reads whose it is from the token, and nothing from a token that is not one', () => {
    assert.equal(tokenSubject(token({ sub: 'a1b2', email: 'ana@sophia.test' })), 'a1b2')
    assert.equal(tokenSubject(token({ sub: 'ñandú-ü' })), 'ñandú-ü')
    for (const bad of ['not-a-token', 'a.b.c', token({ user: 'x' }), token({ sub: 7 }), '']) {
      assert.equal(tokenSubject(bad), null)
    }
  })

  it('never replaces another account signed in here, and never one it cannot read', () => {
    assert.equal(linkDecision('ana', 'ben'), 'refuse')
    assert.equal(linkDecision('ana', null), 'refuse')
    assert.equal(linkDecision('ana', 'ana'), 'keep')
  })

  it('asks first where nobody is signed in (or only a guest’s anonymous session)', () => {
    assert.equal(linkDecision(null, 'ben'), 'ask')
    assert.equal(linkDecision(null, null), 'ask')
  })
})

describe('the padlock’s check with a provider, across the redirect', () => {
  const AT = Date.parse('2026-09-30T20:00:00Z')
  const left = { user: 'ana', session: 's1', at: AT }

  it('reads which sign-in a token belongs to', () => {
    assert.equal(tokenSession(token({ sub: 'ana', session_id: 's1' })), 's1')
    assert.equal(tokenSession(token({ sub: 'ana' })), null)
  })

  it('passes when the same account comes back from a new sign-in, in time', () => {
    assert.equal(providerCheckPassed(left, { user: 'ana', session: 's2' }, AT + 60_000), true)
  })

  it('fails on coming back with Back or Cancel: the sign-in it left with proves nothing', () => {
    assert.equal(providerCheckPassed(left, { user: 'ana', session: 's1' }, AT + 60_000), false)
    assert.equal(providerCheckPassed(left, { user: 'ana', session: null }, AT + 60_000), false)
  })

  it('fails for another account, late, or a check that is not one', () => {
    assert.equal(providerCheckPassed(left, { user: 'ben', session: 's2' }, AT + 60_000), false)
    assert.equal(providerCheckPassed(left, { user: 'ana', session: 's2' }, AT + 11 * 60_000), false)
    for (const bad of [null, 'x', { user: 'ana', at: AT }, { ...left, session: '' }, { ...left, user: '' }]) {
      assert.equal(providerCheckPassed(bad, { user: 'ana', session: 's2' }, AT + 60_000), false)
    }
  })
})
