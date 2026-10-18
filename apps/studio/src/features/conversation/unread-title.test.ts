import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DiscussionEntry } from '@sophia/contracts'
import { withUnseen } from './unread-title.ts'

const entry = (id: string, actorId: string, origin: DiscussionEntry['origin'] = 'composer'): DiscussionEntry => ({
  id,
  actorId,
  intent: 'discuss',
  origin,
  text: 'words',
  sourceId: 's',
  sha256: 'h',
  createdAt: '2026-10-16T10:00:00Z',
})

test('counts the typed messages not seen, never the viewer’s own nor a voice turn', () => {
  const entries = [entry('a', 'marco'), entry('b', 'marco'), entry('c', 'me'), entry('d', 'lucia', 'voice')]
  assert.equal(withUnseen(new Set(), entries, new Set(['a']), 'me').size, 1)
  assert.equal(withUnseen(new Set(), entries, new Set(), null).size, 3)
  assert.equal(withUnseen(new Set(), entries, new Set(['a', 'b', 'c', 'd']), 'me').size, 0)
})

test('a message rolled out of the snapshot’s 50 still counts (Codex P2 on #418)', () => {
  const first = withUnseen(new Set(), [entry('a', 'marco')], new Set(), 'me')
  const window = Array.from({ length: 50 }, (_, i) => entry(`n${String(i)}`, 'marco'))
  assert.equal(withUnseen(first, window, new Set(), 'me').size, 51)
})

test('nothing new gives the same set back, so a refresh alone renders nothing', () => {
  const counted = withUnseen(new Set(), [entry('a', 'marco'), entry('b', 'marco')], new Set(), 'me')
  assert.equal(withUnseen(counted, [entry('b', 'marco'), entry('c', 'me')], new Set(), 'me'), counted)
})
