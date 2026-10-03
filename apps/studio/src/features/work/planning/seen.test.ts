import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assignment, goal, item, plan, view } from './board-samples.ts'
import type { BoardDecision, ItemView } from './board-view.ts'
import { shows } from './lenses.ts'
import { boardOf, type PlanRow } from './plan.ts'
import { changedSince, glance, whileAway } from './seen.ts'

const people = { davide: { id: 'davide', name: 'Davide' }, luis: { id: 'luis', name: 'Luis' } }

/** The rows of a plan of the given items, each observed as given. */
function rowsOf(
  entries: [string, Partial<ItemView>, Partial<Parameters<typeof item>[1]>?][],
  viewerId = 'davide',
): PlanRow[] {
  const items = entries.map(([id, , over]) => item(id, { purpose: `Task ${id}`, ...over }))
  const views = entries.map(([id, over]) => view(id, over))
  return boardOf(goal(plan(items), views), { resources: [], people, viewerId })?.rows ?? []
}

const waitingOn = (who: string): Partial<ItemView> => ({
  lifecycle: 'waiting',
  assignment: assignment('x'),
  waiting_on: [{ kind: 'product_decision', reference_id: 'r', respondent_id: who, detail: 'Choose', state: 'pending' }],
})

const candidate = (version: string) => ({
  source_id: 's',
  version_id: version,
  sha256: 'e'.repeat(64),
  media_type: 'text/markdown',
  created_at: '2026-10-02T12:00:00Z',
  state: 'current' as const,
})

const decision = (state: BoardDecision['state']): BoardDecision => ({
  decision_id: 'd1',
  revision: 4,
  work_id: 'a',
  plan_id: 'plan-1',
  plan_revision: 2,
  candidate_version_ref: null,
  question: 'Ship it?',
  decider_id: 'davide',
  choices: [
    { key: 'ship', label: 'Ship it now' },
    { key: 'wait', label: 'Wait' },
  ],
  expires_at: '2026-10-02T13:00:00Z',
  state,
  selected_choice: state === 'accepted' ? 'ship' : null,
  choice_receipt_id: null,
  plan_reaction: state === 'accepted' ? 'pending' : 'not_needed',
})

describe('what changed since the last look', () => {
  it('is every task whose mark or result moved, or that is new; nothing on a first visit', () => {
    const before = rowsOf([
      ['a', { lifecycle: 'running', assignment: assignment('a') }],
      ['b', {}],
    ])
    const seen = glance(before, [])
    const after = rowsOf([
      ['a', waitingOn('davide')],
      ['b', {}],
      ['c', {}],
    ])
    assert.deepEqual([...changedSince(after, seen)], ['a', 'c'])
    const resulted = rowsOf([
      ['a', { lifecycle: 'running', assignment: assignment('a'), candidates: [candidate('v1')] }],
      ['b', {}],
    ])
    assert.deepEqual([...changedSince(resulted, seen)], ['a'])
    assert.deepEqual([...changedSince(after, null)], [])
  })

  it('says decisions first, then new results, then what blocks, then the rest; all of it on request (G5)', () => {
    const before = rowsOf([
      ['a', {}],
      ['b', {}],
      ['c', {}],
      ['d', {}],
      ['e', {}],
    ])
    const seen = glance(before, [decision('proposed')])
    const after = rowsOf([
      ['a', { lifecycle: 'running', assignment: assignment('a') }],
      ['b', waitingOn('davide')],
      ['c', { lifecycle: 'ready_for_review', assignment: assignment('c'), candidates: [candidate('c-v1')] }],
      ['d', { lifecycle: 'failed', closed_reason: 'It crashed' }],
      ['e', {}],
    ])
    const away = whileAway(after, [decision('accepted')], seen, 'davide', people)
    assert.deepEqual(away.phrases, [
      'You chose Ship it now: Ship it?',
      'Task c has a new result: c-v1',
      'Task b now waits on you',
    ])
    assert.deepEqual(away.rest, ['Task d failed', 'Task a started'])
    assert.equal(away.more, 2)
    assert.equal(
      whileAway(after, [decision('accepted')], seen, 'luis', people).phrases[0],
      'Davide chose Ship it now: Ship it?',
    )
    assert.deepEqual(whileAway(after, [], null, 'davide', people), { phrases: [], more: 0, rest: [] })
  })
})

describe('a lens', () => {
  it('shows what its name says: what a request asks of you or you do by hand, what waits, what is unassigned', () => {
    const rows = rowsOf(
      [
        ['a', waitingOn('davide')],
        ['b', { lifecycle: 'running', assignment: assignment('b') }],
        ['c', {}, { assignee_kind: 'unassigned', assignee_id: null }],
        ['d', {}, { assignee_kind: 'human', assignee_id: 'luis' }],
      ],
      'luis',
    )
    const ids = (lens: Parameters<typeof shows>[0], viewer: string) =>
      rows
        .filter((r) => shows(lens, r, viewer))
        .map((r) => r.item.id)
        .toSorted()
    assert.deepEqual(ids('all', 'luis'), ['a', 'b', 'c', 'd'])
    assert.deepEqual(ids('mine', 'luis'), ['d']) // by hand
    assert.deepEqual(ids('mine', 'davide'), ['a']) // asked; owning b's account is not enough
    assert.deepEqual(ids('waiting', 'luis'), ['a'])
    assert.deepEqual(ids('unassigned', 'luis'), ['c'])
  })
})
