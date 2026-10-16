import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal } from '@sophia/contracts'
import {
  briefOf,
  goalsShown,
  healthLine,
  healthOf,
  MANY,
  canOpenInTasks,
  ordered,
  rowLine,
  stateLine,
  wayLine,
  withDue,
  type GoalGlance,
} from './goals-glance.ts'
import type { Ask } from './planning/plan.ts'

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
  lanes: ['complete', 'active', 'active', 'next', 'next'],
  people: [],
  ways: NONE,
  ...over,
})

const ask: Ask = { id: 'a', kind: 'request', words: 'Open the shared folder', by: 'Marco’s Claude Code', target: 't' }
const stuck = glance({ ways: { ...NONE, permissions: 1, blocked: 1 } })

describe('a goal’s health (docs/plans/goals-overview.md)', () => {
  it('needs attention when moving with something in its way or waiting on the viewer; else on track', () => {
    assert.equal(healthOf(goal('a', 'running'), { glance: stuck }), 'attention')
    assert.equal(healthOf(goal('a', 'running'), { glance: glance(), asks: [ask] }), 'attention')
    assert.equal(healthOf(goal('a', 'running'), { glance: glance() }), 'track')
    assert.equal(healthOf(goal('a', 'checking'), undefined), 'track')
  })

  it('reads the other states as people do', () => {
    const states = ['ready', 'holding', 'held', 'stopping', 'stopped', 'completed'] as const
    assert.deepEqual(
      states.map((s) => healthOf(goal('a', s), undefined)),
      ['new', 'paused', 'paused', 'paused', 'paused', 'done'],
    )
    assert.equal(healthOf(goal('a', 'ready'), { asks: [ask] }), 'attention')
  })

  it('needs attention when its latest note is a difficulty (docs/plans/goal-notes.md)', () => {
    const difficulty = { kind: 'blocker' as const, said: 'Sophia “Legal lands Thursday.”' }
    assert.equal(healthOf(goal('a', 'running'), { glance: glance(), note: difficulty }), 'attention')
    assert.equal(healthOf(goal('a', 'ready'), { note: difficulty }), 'attention')
    assert.equal(healthOf(goal('a', 'held'), { note: difficulty }), 'paused')
    assert.equal(
      healthOf(goal('a', 'running'), { glance: glance(), note: { ...difficulty, kind: 'observation' } }),
      'track',
    )
  })
})

describe('a note on a goal’s row (docs/plans/goal-notes.md)', () => {
  const note = { kind: 'observation' as const, said: 'Sophia “The first candidate renders in 41 s.”' }

  it('is the line of a goal that needs nothing, in place of where it is', () => {
    assert.equal(rowLine(goal('a', 'running'), { glance: glance(), checkpoint: 'Next', note }), note.said)
    assert.equal(rowLine(goal('a', 'ready'), { note }), note.said)
  })

  it('says a difficulty in place of the way; what waits on the viewer still comes first', () => {
    const difficulty = { ...note, kind: 'blocker' as const }
    assert.equal(rowLine(goal('a', 'running'), { glance: stuck, note: difficulty }), difficulty.said)
    assert.equal(
      rowLine(goal('a', 'running'), { glance: stuck, asks: [ask], note: difficulty }),
      `1 waiting on you · ${difficulty.said}`,
    )
    assert.equal(rowLine(goal('a', 'running'), { glance: stuck, note }), '1 waiting on a permission · 1 blocked')
  })
})

describe('the brief', () => {
  it('says first what waits on the viewer, in words', () => {
    assert.equal(briefOf(0), 'Nothing waits on you.')
    assert.equal(briefOf(1), 'One thing waits on you.')
    assert.equal(briefOf(2), 'Two things wait on you.')
    assert.equal(briefOf(12), '12 things wait on you.')
  })

  it('counts the goals by health, the done ones left out', () => {
    const goals = [goal('a', 'running'), goal('b', 'running'), goal('c', 'ready'), goal('d', 'completed')]
    assert.equal(healthLine(goals, { a: { glance: stuck } }), '1 needs attention · 1 on track · 1 not started')
    assert.equal(healthLine([goal('d', 'completed')], {}), '')
    assert.equal(healthLine(goals, { a: { glance: stuck }, b: { overdue: true } }), '2 need attention · 1 not started')
  })
})

describe('the line under a goal', () => {
  it('says what each state means now', () => {
    assert.equal(stateLine(goal('a', 'ready'), glance()), '5 tasks planned')
    assert.equal(stateLine(goal('a', 'ready'), undefined), 'No plan yet')
    assert.equal(stateLine(goal('a', 'running'), glance()), '1 of 5 done')
    assert.equal(stateLine(goal('a', 'checking', 'a', 2), glance()), 'Checking the outcome against 2 criteria')
    assert.equal(stateLine(goal('a', 'holding'), glance()), 'Holding · stops after its current step')
    assert.equal(stateLine(goal('a', 'held'), glance()), 'Held · 1 of 5 done')
    assert.equal(stateLine(goal('a', 'stopping'), glance()), 'Stopping · finished work is kept')
    assert.equal(stateLine(goal('a', 'stopped'), undefined), 'Stopped')
  })

  it('sums what is in the way by kind, and says nothing when nothing is', () => {
    assert.equal(wayLine(stuck), '1 waiting on a permission · 1 blocked')
    assert.equal(wayLine(glance({ ways: { ...NONE, outside: 1 } })), '1 waiting on another service')
    assert.equal(wayLine(glance()), null)
    assert.equal(wayLine(undefined), null)
  })

  it('says, after the health word, what matters now', () => {
    assert.equal(rowLine(goal('a', 'running'), { glance: stuck }), '1 waiting on a permission · 1 blocked')
    assert.equal(rowLine(goal('a', 'running'), { glance: glance(), asks: [ask] }), '1 waiting on you')
    assert.equal(
      rowLine(goal('a', 'running'), { glance: glance(), checkpoint: 'The review passes' }),
      'Next · The review passes',
    )
    assert.equal(rowLine(goal('a', 'running'), { glance: glance() }), '1 of 5 done')
    assert.equal(rowLine(goal('a', 'ready'), undefined), 'No plan yet')
    assert.equal(rowLine(goal('a', 'held'), { glance: glance() }), 'Held · 1 of 5 done')
    assert.equal(rowLine(goal('a', 'completed', 'Pilot'), undefined), 'Pilot, done well')
  })
})

describe('the goals in order, and many of them', () => {
  const goals = [
    goal('e', 'completed', 'Run the pilot'),
    goal('c', 'held', 'Localise pricing'),
    goal('b', 'ready', 'Map the admin flow'),
    goal('t', 'running', 'Large reports'),
    goal('a', 'running', 'Roll out the onboarding'),
  ]
  const plans = { a: { glance: stuck, words: 'Translate the checklist Marco' }, t: { glance: glance() } }

  it('puts what needs attention first, then on track, not started, paused, done', () => {
    assert.deepEqual(
      ordered(goals, plans).map((g) => g.id),
      ['a', 't', 'b', 'c', 'e'],
    )
  })

  it('finds a goal by its title, its outcome or its tasks', () => {
    assert.deepEqual(
      goalsShown(goals, plans, 'PRICING').map((g) => g.id),
      ['c'],
    )
    assert.deepEqual(
      goalsShown(goals, plans, 'checklist').map((g) => g.id),
      ['a'],
    )
    assert.equal(goalsShown(goals, plans, '  ').length, 5)
  })

  it('offers the search past six goals', () => {
    assert.equal(MANY, 6)
  })
})

describe('«Open in Tasks» only where Tasks shows a plan (Codex P2 on #300)', () => {
  it('offers it for a goal whose board has tasks, not for one observed with none planned', () => {
    assert.equal(canOpenInTasks({ glance: glance() }), true)
    assert.equal(canOpenInTasks({ glance: glance({ lanes: [] }) }), false)
    assert.equal(canOpenInTasks({}), false)
    assert.equal(canOpenInTasks(undefined), false)
  })
})

describe('a goal past its date (docs/plans/goal-overdue-health.md)', () => {
  const late = { glance: glance(), overdue: true }

  it('needs attention while moving or ready; paused and done stay so', () => {
    assert.equal(healthOf(goal('a', 'running'), late), 'attention')
    assert.equal(healthOf(goal('a', 'ready'), { overdue: true }), 'attention')
    assert.equal(healthOf(goal('a', 'held'), { overdue: true }), 'paused')
    assert.equal(healthOf(goal('a', 'completed'), { overdue: true }), 'done')
  })

  it('says where it is when nothing else explains the attention: its row says the date', () => {
    assert.equal(rowLine(goal('a', 'running'), { overdue: true }), 'No plan on the board yet')
    assert.equal(rowLine(goal('a', 'running'), { ...late, asks: [ask] }), '1 waiting on you')
  })

  it('is counted in the brief when it is the viewer’s', () => {
    assert.equal(briefOf(0, 1), 'One of your goals is overdue.')
    assert.equal(briefOf(0, 2), 'Two of your goals are overdue.')
    assert.equal(briefOf(1, 1), 'One thing waits on you, and one of your goals is overdue.')
    assert.equal(briefOf(2, 3), 'Two things wait on you, and three of your goals are overdue.')
    assert.equal(briefOf(0, 0), 'Nothing waits on you.')
  })

  it('is marked from the targets: past its day and not completed', () => {
    const goals = [goal('a', 'running'), goal('b', 'running'), goal('c', 'completed'), goal('d', 'running')]
    const targets = new Map([
      ['a', { goalId: 'a', ownerId: null, targetDate: '2026-10-01', revision: 1 }],
      ['b', { goalId: 'b', ownerId: null, targetDate: '2026-10-16', revision: 1 }],
      ['c', { goalId: 'c', ownerId: null, targetDate: '2026-10-01', revision: 1 }],
    ])
    const plans = withDue(goals, { a: { glance: glance() } }, targets, '2026-10-16')
    assert.deepEqual(
      goals.map((g) => plans[g.id]?.overdue ?? false),
      [true, false, false, false],
    )
    assert.deepEqual(plans['a']?.glance, glance())
  })
})
