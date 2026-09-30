import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LINK_FAILED, readAuthCallback, switchesAccount, tokenSubject, withoutAuthParams } from './auth-callback.ts'

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

  it('never replaces another account signed in here, and never without a readable account', () => {
    assert.equal(switchesAccount('ana', 'ben'), true)
    assert.equal(switchesAccount('ana', null), true)
    assert.equal(switchesAccount('ana', 'ana'), false)
    // Nobody signed in here (or only a guest's anonymous session): the link signs in, as an invitation does.
    assert.equal(switchesAccount(null, 'ben'), false)
  })
})
