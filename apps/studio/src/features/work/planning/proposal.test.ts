import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { item, plan } from './board-samples.ts'
import { changeSaid, compare } from './proposal.ts'

/** The target task, started once `producer` has a candidate, waiting on the one blocker `a,b`. */
const ready = (producer: string) =>
  item('target', { blocked_by: ['a,b'], activation: { kind: 'candidate_ready', producer_work_id: producer } })

describe('a proposed replacement beside the plan in force (UI-03)', () => {
  it('says what it adds, removes and changes, item by item', () => {
    const current = plan([item('a'), item('b'), item('c')])
    const proposed = plan([item('a'), item('b', { purpose: 'Do b differently', blocked_by: ['a'] }), item('d')], {
      revision: 3,
      state: 'proposed',
      decision_ref: null,
    })
    const change = compare(current, proposed)
    assert.deepEqual(
      [change.added.map((i) => i.id), change.removed.map((i) => i.id), change.changed.map((c) => [c.item.id, c.what])],
      [['d'], ['c'], [['b', ['what it does', 'what it waits on']]]],
    )
    assert.equal(changeSaid(change), '1 added · 1 changed · 1 removed')
  })

  it('compares what a task waits on as its own values, never joined into text (Codex F-030)', () => {
    const ids = [item('a,b'), item('a'), item('b')]
    const current = plan([...ids, item('target', { blocked_by: ['a,b'] })])
    const proposed = { ...current, revision: 3, state: 'proposed' as const, decision_ref: null }
    const changedOf = (items: ReturnType<typeof item>[]) =>
      compare(current, { ...proposed, items }).changed.map((c) => [c.item.id, c.what])
    // `a,b` is one blocker; `a` and `b` are two.
    assert.deepEqual(changedOf([...ids, item('target', { blocked_by: ['a', 'b'] })]), [
      ['target', ['what it waits on']],
    ])
    // The same blockers in another order are no change.
    const two = plan([...ids, item('target', { blocked_by: ['a', 'b'] })])
    assert.deepEqual(
      compare(two, { ...two, revision: 3, items: [...ids, item('target', { blocked_by: ['b', 'a'] })] }).changed,
      [],
    )
    // What starts it is part of it: its kind, and the producer it waits for.
    assert.deepEqual(changedOf([...ids, ready('a')]), [['target', ['what it waits on']]])
    const fromA = plan([...ids, ready('a')])
    assert.deepEqual(
      compare(fromA, { ...fromA, revision: 3, items: [...ids, ready('b')] }).changed.map((c) => c.what),
      [['what it waits on']],
    )
    assert.deepEqual(compare(fromA, { ...fromA, revision: 3, items: [...ids, ready('a')] }).changed, [])
  })

  it('says when no task changes', () => {
    const current = plan([item('a')])
    assert.equal(changeSaid(compare(current, { ...current, revision: 3, state: 'proposed' })), 'No task changes')
  })
})
