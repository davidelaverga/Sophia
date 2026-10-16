import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DiscussionEntry } from '@sophia/contracts'
import { unseenCount } from './unread-title.ts'

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
  assert.equal(unseenCount(entries, new Set(['a']), 'me'), 1)
  assert.equal(unseenCount(entries, new Set(), null), 3)
  assert.equal(unseenCount(entries, new Set(['a', 'b', 'c', 'd']), 'me'), 0)
})
