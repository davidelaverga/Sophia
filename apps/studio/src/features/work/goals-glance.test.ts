import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal } from '@sophia/contracts'
import { countsOf, goalsShown, groupOf, MANY, stateLine, wayLine, type GoalGlance } from './goals-glance.ts'

const goal = (id: string, status: Goal['status'], title = id, criteria = 0): Goal => ({
  id,
  projectId: 'p',
  title,
  revision: 1,
  authorityEpoch: 1,
  status,
  outcome: `${title}, done well`,
  criteria: Array.from({ length: criteria }, (_, i) => ({
    id: `c${String(i)}`,
    description: 'A criterion',
    required: true,
    verification: 'checked',
  })),
  stateRevision: 1,
})

const NONE = { permissions: 0, decisions: 0, capacity: 0, outside: 0, blocked: 0 }

const glance = (over: Partial<GoalGlance> = {}): GoalGlance => ({
  lanes: ['complete', 'active', 'active', 'next', 'blocked'],
  people: [],
  ways: NONE,
  ...over,
})

describe('a goal’s group (docs/plans/goals-overview.md)', () => {
  it('puts each of the eight states where a person acts on it', () => {
    const states = ['running', 'checking', 'holding', 'stopping', 'ready', 'held', 'stopped', 'completed'] as const
    assert.deepEqual(
      states.map((s) => groupOf(s)),
      ['motion', 'motion', 'motion', 'motion', 'ready', 'paused', 'paused', 'done'],
    )
  })
})

describe('the line under a goal', () => {
  it('says what each state means now', () => {
    assert.equal(stateLine(goal('a', 'ready'), glance()), '5 tasks planned')
    assert.equal(stateLine(goal('a', 'ready'), undefined), 'No plan yet')
    assert.equal(stateLine(goal('a', 'running'), glance()), '1 of 5 done')
    assert.equal(stateLine(goal('a', 'running'), undefined), 'No plan on the board yet')
    assert.equal(stateLine(goal('a', 'checking', 'a', 2), glance()), 'Checking the outcome against 2 criteria')
    assert.equal(stateLine(goal('a', 'holding'), glance()), 'Holding · stops after its current step')
    assert.equal(stateLine(goal('a', 'held'), glance()), 'Held · 1 of 5 done')
    assert.equal(stateLine(goal('a', 'stopping'), glance()), 'Stopping · finished work is kept')
    assert.equal(stateLine(goal('a', 'stopped'), undefined), 'Stopped')
    assert.equal(stateLine(goal('a', 'completed'), glance()), 'Completed')
  })

  it('sums what is in the way by kind, and says nothing when nothing is', () => {
    assert.equal(
      wayLine(glance({ ways: { ...NONE, permissions: 1, blocked: 1 } })),
      '1 waiting on a permission · 1 blocked',
    )
    assert.equal(
      wayLine(glance({ ways: { ...NONE, decisions: 2, capacity: 1 } })),
      '2 waiting on a decision · 1 waiting for capacity',
    )
    assert.equal(wayLine(glance({ ways: { ...NONE, outside: 1 } })), '1 waiting on another service')
    assert.equal(wayLine(glance()), null)
    assert.equal(wayLine(undefined), null)
  })
})

describe('many goals: the filters and the search', () => {
  const goals = [
    goal('a', 'running', 'Roll out the onboarding'),
    goal('b', 'ready', 'Map the admin flow'),
    goal('c', 'held', 'Localise pricing'),
    goal('d', 'stopped', 'Pilot a paid tier'),
    goal('e', 'completed', 'Run the pilot'),
  ]
  const plans = { a: { attention: true, words: 'Translate the checklist Marco' }, b: {} }

  it('keeps the goals of a filter, and counts each', () => {
    assert.deepEqual(
      goalsShown(goals, plans, 'paused', '').map((g) => g.id),
      ['c', 'd'],
    )
    assert.deepEqual(
      goalsShown(goals, plans, 'you', '').map((g) => g.id),
      ['a'],
    )
    assert.equal(goalsShown(goals, plans, 'all', '').length, 5)
    assert.deepEqual(countsOf(goals, plans), { all: 5, motion: 1, you: 1, ready: 1, paused: 2, done: 1 })
  })

  it('finds a goal by its title, its outcome or its tasks', () => {
    assert.deepEqual(
      goalsShown(goals, plans, 'all', 'PRICING').map((g) => g.id),
      ['c'],
    )
    assert.deepEqual(
      goalsShown(goals, plans, 'all', 'checklist').map((g) => g.id),
      ['a'],
    )
    assert.deepEqual(goalsShown(goals, plans, 'paused', 'onboarding'), [])
  })

  it('offers the filters and the search past six goals', () => {
    assert.equal(MANY, 6)
  })
})
