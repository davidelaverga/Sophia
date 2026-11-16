import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { searchWords as shared } from '@sophia/contracts/search-words'
import { searchQuery, searchWords } from './artifacts.ts'

describe('report search', () => {
  it('reads the words with the function the Studio reads them with (search-words-like-the-api.md)', () => {
    assert.equal(searchWords, shared)
  })

  it('turns typed words into required prefixes, and nothing typed into query syntax', () => {
    assert.equal(searchQuery('Managed  hosts'), 'managed:* & hosts:*')
    assert.equal(searchQuery('Città, perché?'), 'città:* & perché:*')
    assert.equal(searchQuery("x' | y:* & !(z)"), 'x:* & y:* & z:*')
    assert.equal(searchQuery('a b c d e f g h i j'), 'a:* & b:* & c:* & d:* & e:* & f:* & g:* & h:*')
    assert.equal(searchQuery(':* | !'), null)
    assert.equal(searchQuery(null), null)
  })

  it('asks for a word of digits signed as well, as the parser keeps "-01" and "+5"; any other word as typed', () => {
    assert.equal(
      searchQuery('V50-20261106-MENTION-01'),
      "v50:* & (20261106:* | '-20261106':* | '+20261106':*) & mention:* & (01:* | '-01':* | '+01':*)",
    )
    assert.equal(searchQuery('x01 ٣'), 'x01:* & ٣:*', 'only ASCII digits, the ones the parser signs')
  })
})
