import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dueOf, dueWords } from './goal-due.ts'

describe('a goal’s target date, against today (goal-overdue.md)', () => {
  it('is overdue once the day has passed, due today on it, and later before', () => {
    assert.equal(dueOf('2026-10-30', '2026-11-02', false), 'overdue')
    assert.equal(dueOf('2026-11-02', '2026-11-02', false), 'today')
    assert.equal(dueOf('2026-11-20', '2026-11-02', false), 'later')
  })

  it('says nothing of a completed goal, or one with no date', () => {
    assert.equal(dueOf('2026-10-01', '2026-11-02', true), null)
    assert.equal(dueOf(null, '2026-11-02', false), null)
  })

  it('says it in words', () => {
    assert.equal(dueWords('2026-10-30', 'overdue'), 'overdue since 30 Oct 2026')
    assert.equal(dueWords('2026-11-02', 'today'), 'due today')
    assert.equal(dueWords('2026-11-20', 'later'), 'due 20 Nov 2026')
    assert.equal(dueWords('2026-10-01', null), 'due 1 Oct 2026')
  })
})
