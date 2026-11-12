import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { queryRefusal } from '../../../fixtures/search-query.ts'

// The fixture refuses a query as A38's queryOf does (packages/persistence/src/search.ts), so the e2e meets the API's
// answers (search-words-like-the-api.md).
describe('the fixture search refuses as the API does (review P3)', () => {
  it('finds nothing under two characters once trimmed, or with no letter or digit', () => {
    assert.equal(queryRefusal(' a '), 'nothing')
    assert.equal(queryRefusal('\u{10428}'), 'nothing', 'one astral letter is one character')
    assert.equal(queryRefusal('--'), 'nothing')
    assert.equal(queryRefusal('ab'), null)
  })

  it('refuses a word longer than 64 characters, counted in code points; 64 is searched', () => {
    assert.equal(queryRefusal(`ok ${'a'.repeat(65)}`), 'invalid')
    assert.equal(queryRefusal('a'.repeat(64)), null)
    assert.equal(queryRefusal('\u{10428}'.repeat(64)), null)
  })
})
