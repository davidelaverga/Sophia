import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Resource } from '../../resources/resource.ts'
import {
  current,
  freshness,
  observedAgo,
  planRows,
  status,
  waitsOn,
  whoDoes,
  type PlanItem,
  type WorkPlan,
} from './plan.ts'

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

type Work = NonNullable<Resource['sessions'][number]['assignment']>['state']

/** Davide's Claude Code, its one session on `workId` in `state`. */
const resource = (workId: string, state: Work = 'running'): Resource => ({
  id: `res-${workId}`,
  owner: { id: 'davide', name: 'Davide' },
  tool: 'claude-code',
  entitlementId: 'ent',
  host: { state: 'online', observedAt: null },
  sessions: [
    { id: `s-${workId}`, role: 'worker', model: null, effort: null, assignment: { workId, title: 'x', state } },
  ],
  controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unqualified' },
  reservePercent: null,
})

const people = { luis: { id: 'luis', name: 'Luis' } }

describe('the lead’s plan', () => {
  it('is shown while in force or proposed; a superseded or withdrawn one is history', () => {
    assert.equal(current(plan([], { state: 'accepted' }))?.state, 'accepted')
    assert.equal(current(plan([], { state: 'proposed' }))?.state, 'proposed')
    assert.equal(current(plan([], { state: 'superseded' })), null)
    assert.equal(current(plan([], { state: 'withdrawn' })), null)
    assert.equal(current(null), null)
  })

  it('finds who does an item through the session it is assigned to, and never makes one up', () => {
    const who = whoDoes(item('build'), [resource('build')], people)
    assert.deepEqual(
      [who.name, who.role, who.state, who.person?.name],
      ['Davide’s Claude Code', 'worker', 'running', 'Davide'],
    )
    assert.equal(whoDoes(item('docs'), [], people).name, 'Assigned, not running yet')
    assert.equal(
      whoDoes(item('call', { assignee_kind: 'human', assignee_id: 'luis' }), [], people).person?.name,
      'Luis',
    )
    assert.equal(
      whoDoes(item('free', { assignee_kind: 'unassigned', assignee_id: null }), [], people).name,
      'Unassigned',
    )
  })

  it('says where each task stands: waiting on whom, working, or not started and what for, or free', () => {
    const build = item('build', { purpose: 'Implement the PDF retry' })
    const p = plan([build])
    const say = (i: PlanItem, resources: Resource[] = []) => {
      const s = status(i, whoDoes(i, resources, people), p)
      return [s.mark, s.text]
    }
    assert.deepEqual(say(build, [resource('build', 'waiting')]), ['waiting', 'Waiting on Davide'])
    assert.deepEqual(say(build, [resource('build', 'running')]), ['working', 'Working'])
    assert.deepEqual(say(build, [resource('build', 'queued')]), ['queued', 'Queued'])
    assert.deepEqual(say(item('docs', { blocked_by: ['build'] })), ['later', 'After Implement the PDF retry'])
    const review = item('review', { activation: { kind: 'candidate_ready', producer_work_id: 'build' } })
    assert.deepEqual(say(review), ['later', 'Once there is a candidate to review'])
    assert.deepEqual(say(item('free', { assignee_kind: 'unassigned', assignee_id: null })), ['free', 'Free to take'])
    assert.deepEqual(say(item('soon')), ['later', 'Not started'])
  })

  it('knows what a task waits on: its blockers and the build whose candidate it reviews', () => {
    assert.deepEqual(waitsOn(item('docs', { blocked_by: ['a', 'b'] })), ['a', 'b'])
    assert.deepEqual(waitsOn(item('r', { activation: { kind: 'candidate_ready', producer_work_id: 'build' } })), [
      'build',
    ])
    assert.deepEqual(waitsOn(item('now')), [])
  })

  it('orders tasks by what moves, keeps each child under its parent, and an orphan on its own', () => {
    const p = plan([
      item('free', { assignee_kind: 'unassigned', assignee_id: null }),
      item('later'),
      item('build'),
      item('review', { parent_id: 'build' }),
      item('stray', { parent_id: 'gone' }),
      item('pane'),
    ])
    const rows = planRows(p, [resource('build', 'waiting'), resource('pane', 'running')], people)
    assert.deepEqual(
      rows.map((r) => [r.item.id, r.depth]),
      [
        ['build', 0],
        ['review', 1],
        ['pane', 0],
        ['later', 0],
        ['stray', 0],
        ['free', 0],
      ],
    )
  })
})

describe('a task that has ended, and a session’s last report', () => {
  it('says a finished run apart from a checked result, and both before anything else', () => {
    const finished = item('a', { outcome: { state: 'finished', at: '2026-10-02T11:00:00Z' } })
    const checked = item('b', { outcome: { state: 'checked', at: '2026-10-02T11:00:00Z' } })
    const p = plan([finished, checked])
    const running = whoDoes(finished, [resource('a', 'running')], people)
    assert.deepEqual(status(finished, running, p), { mark: 'finished', text: 'Finished, not checked yet', rank: 5 })
    assert.equal(status(checked, whoDoes(checked, [], people), p).mark, 'checked')
  })

  it('says how long ago a report was seen, to the second while fresh, and how fresh it still is', () => {
    const now = new Date('2026-10-02T12:00:00Z')
    assert.equal(observedAgo('2026-10-02T11:59:20Z', now), '40 s ago')
    assert.equal(observedAgo('2026-10-02T11:57:00Z', now), '3 min ago')
    assert.equal(freshness('2026-10-02T12:00:00Z', now), 1)
    assert.equal(freshness('2026-10-02T11:59:00Z', now), 0.5)
    assert.equal(freshness('2026-10-02T11:50:00Z', now), 0)
  })
})
