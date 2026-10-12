import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Need } from '@sophia/contracts'
import { atOf, clockSkew, needsOf, whereOf, withoutResources } from './needs.ts'

const P = '00000000-0000-4000-8000-000000000004'

const wire = (over: Partial<Need> = {}): Need => ({
  id: 'decision:d1',
  kind: 'decision',
  title: 'Ship the retry with the hotfix?',
  projectId: P,
  projectTitle: 'Product launch',
  expiresAt: '2026-10-11T10:20:00Z',
  detail: null,
  at: '2026-10-11T09:00:00Z',
  ref: { kind: 'work_decision', id: 'd1', within: null, resourceId: null },
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
  it('lives where its kind says: Tasks, Resources, the room; a reply, or anything without a project, in the personal space', () => {
    assert.deepEqual(whereOf(wire()), { projectId: P, view: 'work', at: { decisionId: 'd1' } })
    // A permission at its request in Resources (Codex on #245, round 10): the task's sheet only names the wait.
    const wait = { kind: 'work_wait', id: 'action-1', within: 'w1', resourceId: 'davide-claude' } as const
    assert.deepEqual(whereOf(wire({ kind: 'permission', ref: wait })), {
      projectId: P,
      view: 'resources',
      at: { requestId: 'action-1', resourceId: 'davide-claude', taskId: 'w1' },
    })
    assert.deepEqual(
      whereOf(wire({ kind: 'guest', ref: { kind: 'lobby_entry', id: 'g1', within: null, resourceId: null } })),
      {
        projectId: P,
        view: 'studio',
        at: {},
      },
    )
    assert.deepEqual(whereOf(wire({ kind: 'reply', projectId: null, projectTitle: null })), { place: 'personal' })
    assert.deepEqual(whereOf(wire({ projectId: null })), { place: 'personal' })
  })
  it('opens the record its ref names when the Studio has an address for it: a wait at its request, a decision at its own choice', () => {
    // A wait is addressed by its request (A13's reference), with its resource and its task along for the record.
    assert.deepEqual(atOf({ kind: 'work_wait', id: 'req-1', within: 'w1', resourceId: 'r1' }), {
      requestId: 'req-1',
      resourceId: 'r1',
      taskId: 'w1',
    })
    assert.deepEqual(atOf({ kind: 'work_wait', id: 'req-1', within: null, resourceId: null }), { requestId: 'req-1' })
    // A decision is its own address on the board (its choice stands there, not in its task's sheet), with or without
    // the task that holds it (Codex on #245, round 8).
    assert.deepEqual(atOf({ kind: 'work_decision', id: 'd1', within: null, resourceId: null }), { decisionId: 'd1' })
    assert.deepEqual(atOf({ kind: 'work_decision', id: 'd1', within: 'w3', resourceId: null }), { decisionId: 'd1' })
    assert.deepEqual(atOf({ kind: 'personal_turn', id: 't9', within: null, resourceId: null }), {})
  })
  it('keeps the service’s clock: the skew from readAt and when the answer arrived; nothing from an unreadable readAt', () => {
    const received = Date.parse('2026-10-11T09:00:00Z')
    assert.equal(clockSkew('2026-10-11T09:00:10Z', received), 10_000)
    assert.equal(clockSkew('2026-10-11T08:59:30Z', received), -30_000)
    assert.equal(clockSkew('not a time', received), 0)
  })
})

describe('a need opened in the signed-in app, Resources not served yet (Codex on #245)', () => {
  it('opens a permission at the task that holds its wait; every other view as it is', () => {
    assert.deepEqual(withoutResources('resources', { requestId: 'req-1', resourceId: 'r1', taskId: 'w1' }), {
      view: 'work',
      at: { taskId: 'w1' },
    })
    assert.deepEqual(withoutResources('resources', { requestId: 'req-1' }), { view: 'work', at: {} })
    assert.deepEqual(withoutResources('work', { decisionId: 'd1' }), { view: 'work', at: { decisionId: 'd1' } })
  })
})
