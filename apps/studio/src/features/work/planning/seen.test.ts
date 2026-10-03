import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Mark, PlanRow } from './plan.ts'
import { changedSince, whileAway } from './seen.ts'
import { shows } from './lenses.ts'

const row = (id: string, mark: Mark, person: string | null = 'davide'): PlanRow => ({
  item: {
    id,
    purpose: `Task ${id}`,
    parent_id: null,
    blocked_by: [],
    assignee_kind: 'assignment',
    assignee_id: null,
    activation: { kind: 'immediate', producer_work_id: null },
  },
  doer: {
    name: person ?? 'Unassigned',
    role: null,
    resource: null,
    person: person ? { id: person, name: person === 'davide' ? 'Davide' : 'Luis' } : null,
    session: null,
    state: null,
  },
  // A waiting task waits on someone only when a request names them: here, the one who does it.
  status: {
    mark,
    text: mark,
    rank: 0,
    on: mark === 'waiting' && person ? { id: person, name: person === 'davide' ? 'Davide' : 'Luis' } : null,
  },
  depth: 0,
})

describe('what changed since the last look', () => {
  it('is every task whose mark moved or that is new; nothing on a first visit', () => {
    const rows = [row('a', 'waiting'), row('b', 'working'), row('c', 'later')]
    assert.deepEqual([...changedSince(rows, { a: 'working', b: 'working' })], ['a', 'c'])
    assert.deepEqual([...changedSince(rows, null)], [])
  })

  it('is said in a few phrases, “you” where it waits on the viewer, the rest counted', () => {
    const rows = [row('a', 'waiting'), row('b', 'finished', 'luis'), row('c', 'checked'), row('d', 'free', null)]
    const away = whileAway(rows, new Set(['a', 'b', 'c', 'd']), 'davide')
    assert.deepEqual(away.phrases, [
      'Task a now waits on you',
      'Luis finished Task b, not checked yet',
      'Task c was checked',
    ])
    assert.equal(away.more, 1)
    assert.equal(whileAway(rows, new Set(['a']), 'luis').phrases[0], 'Task a waits on Davide')
    // Waiting, with no request naming anyone: said waiting, on no one.
    const none = { ...row('e', 'waiting'), status: { mark: 'waiting' as const, text: 'Waiting', rank: 0, on: null } }
    assert.equal(whileAway([none], new Set(['e']), 'davide').phrases[0], 'Task e is waiting')
  })
})

describe('a lens', () => {
  it('shows what its name says: what the viewer does, what waits, what is open', () => {
    const rows = [row('a', 'waiting'), row('b', 'working', 'luis'), row('c', 'free', null)]
    const ids = (lens: Parameters<typeof shows>[0], viewer: string) =>
      rows.filter((r) => shows(lens, r, viewer)).map((r) => r.item.id)
    assert.deepEqual(ids('all', 'luis'), ['a', 'b', 'c'])
    assert.deepEqual(ids('mine', 'luis'), ['b'])
    assert.deepEqual(ids('waiting', 'luis'), ['a'])
    assert.deepEqual(ids('open', 'luis'), ['c'])
  })
})
