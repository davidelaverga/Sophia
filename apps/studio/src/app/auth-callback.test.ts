import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readAuthCallback, withoutAuthParams } from './auth-callback.ts'

const STUDIO = 'https://sophia-studio.vercel.app'

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

  it('surfaces the error of an expired or reused link', () => {
    const href = `${STUDIO}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
    assert.deepEqual(readAuthCallback(href), { kind: 'error', message: 'Email link is invalid or has expired' })
  })

  it('drops every auth parameter but keeps the route', () => {
    assert.equal(withoutAuthParams(`${STUDIO}/p/abc/work?code=1&x=2#access_token=t`), '/p/abc/work?x=2')
    assert.equal(withoutAuthParams(`${STUDIO}/?error_description=bad&error=e`), '/')
  })
})
