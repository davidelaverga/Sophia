import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Need } from '@sophia/contracts'
import { needsOf, whereOf } from './needs.ts'

const wire = (over: Partial<Need> = {}): Need => ({
  id: 'decision:d1',
  kind: 'decision',
  title: 'Ship the retry with the hotfix?',
  projectId: '00000000-0000-4000-8000-000000000004',
  projectTitle: 'Product launch',
  expiresAt: '2026-10-11T10:20:00Z',
  detail: null,
  at: '2026-10-11T09:00:00Z',
  ref: { kind: 'mission_decision', id: 'd1' },
  ...over,
})

describe('what needs the person, from the wire', () => {
  it('becomes Home’s needs: the project by its title, the rest as it came', () => {
    assert.deepEqual(needsOf({ needs: [wire()] }), [
      {
        id: 'decision:d1',
        kind: 'decision',
        title: 'Ship the retry with the hotfix?',
        project: 'Product launch',
        expiresAt: '2026-10-11T10:20:00Z',
        detail: null,
      },
    ])
  })
  it('lives where its kind says: Tasks, Knowledge, the room; a reply, or anything without a project, in the personal space', () => {
    assert.deepEqual(whereOf(wire()), { projectId: '00000000-0000-4000-8000-000000000004', view: 'work' })
    const P = '00000000-0000-4000-8000-000000000004'
    assert.deepEqual(whereOf(wire({ kind: 'permission' })), { projectId: P, view: 'work' })
    assert.deepEqual(whereOf(wire({ kind: 'review' })), { projectId: P, view: 'knowledge' })
    assert.deepEqual(whereOf(wire({ kind: 'guest' })), { projectId: P, view: 'studio' })
    assert.deepEqual(whereOf(wire({ kind: 'reply', projectId: null, projectTitle: null })), { place: 'personal' })
    assert.deepEqual(whereOf(wire({ projectId: null })), { place: 'personal' })
  })
})
