import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { legalDoc } from './legal.ts'

describe('the terms and the privacy notice (terms-privacy.md)', () => {
  it('opens a document at its own address, with or without a trailing slash', () => {
    assert.equal(legalDoc('/terms'), 'terms')
    assert.equal(legalDoc('/privacy/'), 'privacy')
  })

  it('leaves every other address to the Studio', () => {
    for (const path of ['/', '/join', '/terms/more', '/p/terms', '/privacy-policy']) assert.equal(legalDoc(path), null)
  })
})
