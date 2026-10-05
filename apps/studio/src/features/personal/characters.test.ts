import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { capped, clip, lengthOf } from './characters.ts'

describe('lengths in characters, as the API and the database count them', () => {
  it('counts an emoji as one character, not the two UTF-16 units length sees', () => {
    assert.equal(lengthOf('abc'), 3)
    assert.equal(lengthOf('😊😊'), 2)
    assert.equal(lengthOf('a😊b'), 3)
    assert.equal(lengthOf(''), 0)
  })

  it('clips to the most characters a field holds, never splitting an emoji', () => {
    assert.equal(clip('abcdef', 4), 'abcd')
    assert.equal(clip('😊'.repeat(95), 90), '😊'.repeat(90))
    assert.equal(clip('ab😊', 3), 'ab😊')
    assert.equal(clip('ab😊c', 3), 'ab😊')
    assert.equal(clip('short', 90), 'short')
  })
})

describe('a field at its most refuses to grow, as maxLength did, and loses nothing', () => {
  it('takes what fits, refuses what would pass the most, and always takes a deletion', () => {
    assert.equal(capped('abc', 'abcd', 4), 'abcd')
    assert.equal(capped('abcd', 'abXcd', 4), 'abcd')
    assert.equal(capped('abcdef', 'abcde', 4), 'abcde') // already past it (a prefill): shrinking is taken
    assert.equal(capped('😊'.repeat(90), `${'😊'.repeat(90)}a`, 90), '😊'.repeat(90))
    // A paste past the most keeps what was there and as much of the paste as fits, as maxLength did.
    assert.equal(capped('abcd', 'ab12345cd', 6), 'ab12cd')
    assert.equal(capped('', '😊'.repeat(95), 90), '😊'.repeat(90))
  })
})
