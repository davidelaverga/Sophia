import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Need } from '@sophia/contracts'
import { atOf, clockSkew, needsOf, whereOf } from './needs.ts'

const P = '00000000-0000-4000-8000-000000000004'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
const VERSION = '00000000-0000-4000-8000-0000000000b2'

const wire = (over: Partial<Need> = {}): Need => ({
  id: 'decision:d1',
  kind: 'decision',
  title: 'Ship the retry with the hotfix?',
  projectId: P,
  projectTitle: 'Product launch',
  expiresAt: '2026-10-11T10:20:00Z',
  detail: null,
  at: '2026-10-11T09:00:00Z',
  ref: { kind: 'mission_decision', id: 'd1', artifactId: null },
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
    assert.deepEqual(whereOf(wire()), { projectId: P, view: 'work', at: {} })
    assert.deepEqual(whereOf(wire({ kind: 'permission', ref: { kind: 'work_item', id: 'w1', artifactId: null } })), {
      projectId: P,
      view: 'work',
      at: { taskId: 'w1' },
    })
    assert.deepEqual(
      whereOf(wire({ kind: 'review', ref: { kind: 'artifact_version', id: VERSION, artifactId: REPORT } })),
      {
        projectId: P,
        view: 'knowledge',
        at: { report: { artifactId: REPORT, versionId: VERSION, size: 'side', format: 'markdown' } },
      },
    )
    assert.deepEqual(whereOf(wire({ kind: 'guest', ref: { kind: 'lobby_entry', id: 'g1', artifactId: null } })), {
      projectId: P,
      view: 'studio',
      at: {},
    })
    assert.deepEqual(whereOf(wire({ kind: 'reply', projectId: null, projectTitle: null })), { place: 'personal' })
    assert.deepEqual(whereOf(wire({ projectId: null })), { place: 'personal' })
  })
  it('opens the record its ref names when the Studio has an address for it; a version without its report, only its view', () => {
    assert.deepEqual(atOf({ kind: 'work_item', id: 'w1', artifactId: null }), { taskId: 'w1' })
    assert.deepEqual(atOf({ kind: 'artifact_version', id: VERSION, artifactId: null }), {})
    assert.deepEqual(atOf({ kind: 'mission_decision', id: 'd1', artifactId: null }), {})
    assert.deepEqual(atOf({ kind: 'personal_turn', id: 't9', artifactId: null }), {})
  })
  it('keeps the service’s clock: the skew from readAt and when the answer arrived; nothing from an unreadable readAt', () => {
    const received = Date.parse('2026-10-11T09:00:00Z')
    assert.equal(clockSkew('2026-10-11T09:00:10Z', received), 10_000)
    assert.equal(clockSkew('2026-10-11T08:59:30Z', received), -30_000)
    assert.equal(clockSkew('not a time', received), 0)
  })
})
