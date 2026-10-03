import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Resource } from '../../resources/resource.ts'
import { current, planRows, startsWhen, whoDoes, type PlanItem, type WorkPlan } from './plan.ts'

const item = (id: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id,
  purpose: `Do ${id}`,
  parent_id: null,
  blocked_by: [],
  assignee_kind: 'assignment',
  assignee_id: `assignment-${id}`,
  activation: { kind: 'immediate', producer_work_id: null },
  ...over,
})

const plan = (items: PlanItem[], over: Partial<WorkPlan> = {}): WorkPlan => ({
  plan_id: 'plan-1',
  revision: 2,
  mission_revision: 3,
  state: 'accepted',
  items,
  goal_id: 'goal-1',
  next_checkpoint: null,
  assumptions: [],
  decisions: [],
  ...over,
})

const resource = (id: string, workId: string | null): Resource => ({
  id,
  owner: { id: 'davide', name: 'Davide' },
  tool: 'claude-code',
  entitlementId: 'ent',
  host: { state: 'online', observedAt: null },
  sessions: [
    {
      id: `${id}-worker`,
      role: 'worker',
      model: null,
      effort: null,
      assignment: workId ? { workId, title: 'x', state: 'running' } : null,
    },
  ],
  controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unqualified' },
  reservePercent: null,
})

describe('the lead’s plan', () => {
  it('is shown while in force or proposed; a superseded or withdrawn one is history', () => {
    assert.equal(current(plan([], { state: 'accepted' }))?.state, 'accepted')
    assert.equal(current(plan([], { state: 'proposed' }))?.state, 'proposed')
    assert.equal(current(plan([], { state: 'superseded' })), null)
    assert.equal(current(plan([], { state: 'withdrawn' })), null)
    assert.equal(current(null), null)
  })

  it('lists its items in plan order, each grouped under its parent; an orphan stands on its own', () => {
    const rows = planRows(
      plan([item('build'), item('docs'), item('review', { parent_id: 'build' }), item('stray', { parent_id: 'gone' })]),
    )
    assert.deepEqual(
      rows.map((r) => [r.item.id, r.depth]),
      [
        ['build', 0],
        ['review', 1],
        ['docs', 0],
        ['stray', 0],
      ],
    )
  })

  it('says when an item starts: now, after what it waits for, or once a candidate is ready', () => {
    const build = item('build', { purpose: 'Implement the PDF retry' })
    const docs = item('docs', { blocked_by: ['build'] })
    const review = item('review', { activation: { kind: 'candidate_ready', producer_work_id: 'build' } })
    const p = plan([build, docs, review])
    assert.equal(startsWhen(build, p), 'Starts now')
    assert.equal(startsWhen(docs, p), 'After “Implement the PDF retry”')
    assert.equal(startsWhen(review, p), 'When “Implement the PDF retry” has a candidate')
    assert.equal(
      startsWhen(item('free', { assignee_kind: 'unassigned', assignee_id: null }), p),
      'Ready for someone to take',
    )
  })

  it('finds who does an item through the session it is assigned to, and never makes one up', () => {
    const resources = [resource('davide-claude', 'build')]
    const people = { luis: { id: 'luis', name: 'Luis' } }
    assert.deepEqual((({ name, role, state }) => ({ name, role, state }))(whoDoes(item('build'), resources, people)), {
      name: 'Davide’s Claude Code',
      role: 'worker',
      state: 'running',
    })
    assert.equal(whoDoes(item('docs'), resources, people).name, 'Assigned, not running yet')
    assert.equal(whoDoes(item('call', { assignee_kind: 'human', assignee_id: 'luis' }), resources, people).name, 'Luis')
    assert.equal(
      whoDoes(item('free', { assignee_kind: 'unassigned', assignee_id: null }), resources, people).name,
      'Unassigned',
    )
  })
})
