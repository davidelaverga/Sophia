import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { arrivals, knockWords } from './knock-alert.ts'

const entry = (id: string, displayName: string) => ({ id, displayName })

describe('a knock at the door (knock-alert.md)', () => {
  it('counts only who started waiting since the last look', () => {
    const seen = new Set(['a'])
    assert.deepEqual(arrivals(seen, [entry('a', 'Ana'), entry('b', 'Bea')]), [entry('b', 'Bea')])
    assert.deepEqual(arrivals(new Set(['a', 'b']), [entry('a', 'Ana')]), [])
  })

  it('says who asks, by name for one, by number for several', () => {
    assert.equal(knockWords([entry('a', 'Ana Ruiz')]), 'Ana Ruiz is asking to join')
    assert.equal(knockWords([entry('a', 'Ana'), entry('b', 'Bea')]), '2 people are asking to join')
  })
})
