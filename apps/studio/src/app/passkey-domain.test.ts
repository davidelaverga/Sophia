import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { passkeysWorkOn } from './passkey-domain.ts'

describe('passkeysWorkOn', () => {
  it('accepts the RP ID and its subdomains', () => {
    assert.equal(passkeysWorkOn('sophia-ei.com', 'sophia-ei.com'), true)
    assert.equal(passkeysWorkOn('studio.sophia-ei.com', 'sophia-ei.com'), true)
    assert.equal(passkeysWorkOn('Studio.Sophia-EI.com', 'sophia-ei.com'), true)
  })

  it('refuses other hosts, look-alikes and a missing RP ID', () => {
    assert.equal(passkeysWorkOn('sophia-studio.vercel.app', 'sophia-ei.com'), false)
    assert.equal(passkeysWorkOn('evilsophia-ei.com', 'sophia-ei.com'), false)
    assert.equal(passkeysWorkOn('sophia-ei.com.evil.test', 'sophia-ei.com'), false)
    assert.equal(passkeysWorkOn('studio.sophia-ei.com', undefined), false)
    assert.equal(passkeysWorkOn('studio.sophia-ei.com', ''), false)
  })
})
