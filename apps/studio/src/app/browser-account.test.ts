// The browser stores (viewer state, personal flags, meetings, talk) key by the account (accountOf: the token's subject),
// not the email (identity.name). Two accounts sharing an address on one browser never read each other's stored state, and
// the same account under a new email (USER_UPDATED) keeps its state. Covered by e2e/app-auth.spec.ts in the real app.
//
// This file tests the key functions themselves: accountOf and viewerKey, which are the only two used from .ts files the
// test runner can import. The same-address / renamed-email assertions here verify the properties those key functions must
// have for the store isolation to hold; the Chromium checks verify the real call sites.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accountOf, tokenSubject } from './auth-callback.ts'
import { viewerKey } from '../features/studio/viewer-state.ts'

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** An unsigned token whose `sub` claim is `id`. */
const tokenWith = (id: string, email: string) => `header.${part({ sub: id, email, role: 'authenticated' })}.sig`

const DAVIDE_ID = '00000000-0000-4000-8000-00000000d001'
const OTHER_ID = '00000000-0000-4000-8000-00000000d002'
const EMAIL = 'davide@sophia.test'
const NEW_EMAIL = 'davide.new@sophia.test'

const davide = { name: EMAIL, token: tokenWith(DAVIDE_ID, EMAIL) }
const renamed = { name: NEW_EMAIL, token: tokenWith(DAVIDE_ID, NEW_EMAIL) }
const otherAtSameAddress = { name: EMAIL, token: tokenWith(OTHER_ID, EMAIL) }

const PROJECT = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'

describe('accountOf', () => {
  it('returns the token subject, not the email', () => {
    assert.equal(accountOf(davide), DAVIDE_ID)
    assert.equal(tokenSubject(davide.token), DAVIDE_ID)
  })

  it('is the same for the same account under a new email', () => {
    assert.equal(accountOf(renamed), DAVIDE_ID)
    assert.equal(accountOf(davide), accountOf(renamed))
  })

  it('differs for another account at the same address', () => {
    assert.equal(accountOf(otherAtSameAddress), OTHER_ID)
    assert.notEqual(accountOf(davide), accountOf(otherAtSameAddress))
  })

  it('falls back to name only when the token carries no readable subject', () => {
    const noSub = { name: 'local-dev', token: 'not.a.jwt' }
    assert.equal(accountOf(noSub), 'local-dev')
  })
})

describe('viewerKey keys by account', () => {
  it('is the same key for the same account under a new email', () => {
    assert.equal(viewerKey(accountOf(davide), PROJECT), viewerKey(accountOf(renamed), PROJECT))
  })

  it('is a different key for another account at the same address', () => {
    assert.notEqual(viewerKey(accountOf(davide), PROJECT), viewerKey(accountOf(otherAtSameAddress), PROJECT))
  })

  it('would have been the same (wrong) key if both used the email', () => {
    // This is the old bug: keying by identity.name gives both accounts the same key.
    assert.equal(viewerKey(davide.name, PROJECT), viewerKey(otherAtSameAddress.name, PROJECT))
  })
})
