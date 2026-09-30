import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Snapshot } from '@sophia/contracts'
import { chatSignature, isNew, mergeNames, toggled } from './side-panel.ts'

const withDiscussion = (n: number) => ({ discussion: Array.from({ length: n }) }) as unknown as Snapshot

describe('the room side panel', () => {
  it('counts what the chat holds: entries, turns, and replies once they begin', () => {
    assert.equal(chatSignature(undefined, []), 0)
    assert.equal(chatSignature(withDiscussion(2), []), 2)
    assert.equal(chatSignature(withDiscussion(2), [{ reply: '' }, { reply: 'Hi' }]), 5)
  })

  it('closes a panel opened twice, and swaps to another in place', () => {
    assert.equal(toggled(null, 'chat'), 'chat')
    assert.equal(toggled('chat', 'chat'), null)
    assert.equal(toggled('chat', 'brief'), 'brief')
  })

  it('marks something new only when it grew and is out of view', () => {
    assert.equal(isNew(5, 3, false), true)
    assert.equal(isNew(5, 3, true), false, 'in view: nothing to point at')
    assert.equal(isNew(3, 3, false), false)
    assert.equal(isNew(null, 3, false), false, 'not read yet')
    assert.equal(isNew(5, null, false), false, 'nothing seen yet: the first read is the baseline')
  })

  it('keeps every name seen this visit, and the same map when nobody is new', () => {
    const known = mergeNames(new Map(), [{ identity: 'a', name: 'Ana' }])
    assert.equal(mergeNames(known, [{ identity: 'a', name: 'Ana' }]), known, 'nothing new: the same map')
    const later = mergeNames(known, [{ identity: 'b', name: 'Bo' }])
    assert.deepEqual(
      [...later],
      [
        ['a', 'Ana'],
        ['b', 'Bo'],
      ],
      'Ana left the room and keeps her name',
    )
    assert.equal(mergeNames(later, [{ identity: 'b', name: 'Bob' }]).get('b'), 'Bob', 'a renamed person is renamed')
  })
})
