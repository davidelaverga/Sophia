import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { item, plan } from './board-samples.ts'
import { changeSaid, compare } from './proposal.ts'

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

  it('says when no task changes', () => {
    const current = plan([item('a')])
    assert.equal(changeSaid(compare(current, { ...current, revision: 3, state: 'proposed' })), 'No task changes')
  })
})
