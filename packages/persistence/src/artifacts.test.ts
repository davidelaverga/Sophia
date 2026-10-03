import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { searchQuery } from './artifacts.ts'

describe('report search', () => {
  it('turns typed words into required prefixes, and nothing typed into query syntax', () => {
    assert.equal(searchQuery('Managed  hosts'), 'managed:* & hosts:*')
    assert.equal(searchQuery('Città, perché?'), 'città:* & perché:*')
    assert.equal(searchQuery("x' | y:* & !(z)"), 'x:* & y:* & z:*')
    assert.equal(searchQuery('a b c d e f g h i j'), 'a:* & b:* & c:* & d:* & e:* & f:* & g:* & h:*')
    assert.equal(searchQuery(':* | !'), null)
    assert.equal(searchQuery(null), null)
  })
})
