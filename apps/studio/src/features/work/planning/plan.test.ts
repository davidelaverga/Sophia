import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { freshness, observedAgo, type RequiredAction, type Resource } from '../../resources/resource.ts'
import {
  actionable,
  current,
  forYou,
  planRows,
  relation,
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

/** An open request of a session, on Davide. */
const request = (sessionId: string, workId = 'build'): RequiredAction => ({
  id: `a-${sessionId}`,
  workId,
  resourceId: 'r',
  sessionId,
  ownerId: 'davide',
  operation: 'Run a command',
  deadline: null,
  state: 'open',
  openTarget: null,
})

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
    const say = (i: PlanItem, resources: Resource[] = [], actions: RequiredAction[] = []) => {
      const s = status(i, whoDoes(i, resources, people), p, actions, people)
      return [s.mark, s.text]
    }
    // Waiting on someone only when an open request of its session names them; else waiting, on no one.
    assert.deepEqual(say(build, [resource('build', 'waiting')], [request('s-build')]), ['waiting', 'Waiting on Davide'])
    assert.deepEqual(say(build, [resource('build', 'waiting')]), ['waiting', 'Waiting'])
    // A request left from the session's earlier work names no one for this one.
    assert.deepEqual(say(build, [resource('build', 'waiting')], [request('s-build', 'earlier')]), [
      'waiting',
      'Waiting',
    ])
    assert.deepEqual(say(build, [resource('build', 'waiting')], [{ ...request('s-build'), state: 'resolved' }]), [
      'waiting',
      'Waiting',
    ])
    // Recorded and queued share a lane, each said as itself.
    assert.deepEqual(say(build, [resource('build', 'recorded')]), ['queued', 'Recorded'])
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

describe('the plan’s tree and its decisions', () => {
  it('keeps every item, however deep, each once, even one caught in a loop of parents', () => {
    const a = item('a')
    const b = item('b', { parent_id: 'a' })
    const c = item('c', { parent_id: 'b' })
    const rows = planRows(plan([a, b, c]), [], people)
    assert.deepEqual(
      rows.map((r) => [r.item.id, r.depth]),
      [
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ],
    )
    const x = item('x', { parent_id: 'y' })
    const y = item('y', { parent_id: 'x' })
    assert.deepEqual(
      planRows(plan([x, y]), [], people)
        .map((r) => r.item.id)
        .toSorted(),
      ['x', 'y'],
    )
  })

  it('says a review that also waits on others with both', () => {
    const a = item('a', { purpose: 'Build it' })
    const b = item('b', { purpose: 'Measure it' })
    const review = item('r', {
      blocked_by: ['b'],
      activation: { kind: 'candidate_ready', producer_work_id: 'a' },
    })
    const p = plan([a, b, review])
    assert.equal(relation(review, p), 'Reviews Build it, after Measure it')
    assert.equal(
      status(review, whoDoes(review, [], people), p).text,
      'After Measure it, once there is a candidate to review',
    )
  })

  it('finds a task’s session by the assignment it names before its work', () => {
    const named = item('build', { assignee_id: 'asg-2' })
    const first = resource('build', 'running')
    const second: Resource = {
      ...resource('build', 'queued'),
      id: 'res-other',
      sessions: [
        {
          id: 's-other',
          role: 'worker',
          model: null,
          effort: null,
          assignment: { workId: 'build', title: 'x', state: 'queued', id: 'asg-2' },
        },
      ],
    }
    assert.equal(whoDoes(named, [first, second], people).session?.id, 's-other')
    assert.equal(whoDoes(item('build'), [first, second], people).session?.id, 's-build') // no id: its work
    // Handing over: the new session isn't there yet, and the old one names another assignment: not taken.
    const old: Resource = {
      ...resource('build', 'running'),
      sessions: [
        {
          id: 's-old',
          role: 'worker',
          model: null,
          effort: null,
          assignment: { workId: 'build', title: 'x', state: 'running', id: 'asg-1' },
        },
      ],
    }
    assert.equal(whoDoes(named, [old], people).session, null)
  })

  it('answers a decision only while proposed and not past its expiry', () => {
    const now = new Date('2026-10-02T12:00:00Z')
    const d = {
      decision_id: 'd',
      revision: 1,
      question: 'q',
      decider_id: 'davide',
      state: 'proposed' as const,
      choices: [],
      selected_choice: null,
      expires_at: '2026-10-02T13:00:00Z',
    }
    assert.equal(actionable(d, now), true)
    assert.equal(actionable({ ...d, expires_at: '2026-10-02T11:00:00Z' }, now), false)
    assert.equal(actionable({ ...d, state: 'accepted' }, now), false)
    // For the rail's "for you": a decision of theirs to answer counts; one past its expiry calls no one.
    const p = plan([], { decisions: [d] })
    assert.equal(forYou([], p, 'davide', now), true)
    assert.equal(
      forYou([], plan([], { decisions: [{ ...d, expires_at: '2026-10-02T11:00:00Z' }] }), 'davide', now),
      false,
    )
  })
})
