import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { joinedIn, joinedWords } from './so-far-view.ts'

describe('how late the person joined', () => {
  const start = '2026-10-06T10:00:00.000Z'
  const at = (minutes: number, seconds = 0) => Date.parse(start) + minutes * 60_000 + seconds * 1000

  it('counts whole minutes from the meeting’s start; under two minutes is not late', () => {
    assert.equal(joinedIn(start, at(12, 40)), 12)
    assert.equal(joinedIn(start, at(2)), 2)
    assert.equal(joinedIn(start, at(1, 59)), null)
    assert.equal(joinedIn(start, at(-1)), null) // a clock behind the meeting's
  })

  it('says it in one line', () => {
    assert.equal(joinedWords(12), 'You joined 12 minutes in.')
    assert.equal(joinedWords(90), 'You joined 1 hour 30 minutes in.')
    assert.equal(joinedWords(60), 'You joined 1 hour in.')
  })
})
