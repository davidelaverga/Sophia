// What a v1.2 guide is told of a task's own state and of a refused or accepted control (CX-0026). Pure: synthetic
// standings, one per case of the explanation table.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ReportVersion, TaskStanding } from '@sophia/persistence'
import { refusedControl, steerAccepted, taskStateOf, type Control, type Refused } from './control-words.ts'

const TASK = '00000000-0000-4000-8000-0000000000a1'
const NEXT = '00000000-0000-4000-8000-0000000000a2'

const v = (n: number): ReportVersion => ({
  id: `00000000-0000-4000-8000-0000000000b${String(n)}`,
  versionNumber: n,
  parentId: null,
  sourceId: `00000000-0000-4000-8000-0000000000c${String(n)}`,
  taskId: TASK,
  renditionOnly: false,
  pdf: false,
  cited: 1,
  added: 1,
  dropped: 0,
  sections: null,
})

/** One task, under way unless `over` says otherwise; its goal has nothing else under way unless `over` adds it. */
function standing(over: Partial<TaskStanding> = {}): TaskStanding {
  const own = { state: over.state ?? 'running', phase: over.phase ?? 'running' }
  const underWay = own.state === 'pending' || own.state === 'running'
  return {
    taskId: TASK,
    kind: 'research',
    goalId: TASK,
    goalStatus: 'running',
    published: null,
    previous: null,
    current: null,
    latestTaskId: TASK,
    inFlight: underWay ? [{ taskId: TASK, ...own }] : [],
    ...over,
    ...own,
  }
}

const refused = (action: Control, s: TaskStanding | null, over: Partial<Refused> = {}) =>
  refusedControl({ action, refusedAs: 'invalid_state', standing: s, researchGate: true, ...over })

const NEVER_SAID = /admitted|queued|will be applied|not (yet )?(started|begun)/i

describe('control_work’s explanation table', () => {
  it('answers each refused control from the action, the goal and the task’s own job, never "admitted" or later', () => {
    const cases: Array<[Control, TaskStanding | null, string]> = [
      ['steer', standing({ goalStatus: 'held', phase: 'held' }), 'not_applied:on_hold'],
      ['hold', standing({ goalStatus: 'holding', phase: 'holding' }), 'not_applied:on_hold'],
      ['resume', standing({ goalStatus: 'holding', phase: 'holding' }), 'not_applied:settling'],
      ['resume', standing(), 'not_applied:not_held'],
      ['hold', standing({ goalStatus: 'ready', state: 'pending', phase: 'queued' }), 'not_applied:not_started'],
      ['stop', standing({ goalStatus: 'stopping', phase: 'stopping' }), 'not_applied:stopped'],
      ['steer', standing({ state: 'cancelled', phase: 'stopped', goalStatus: 'stopped' }), 'not_applied:stopped'],
      ['hold', standing({ goalStatus: 'completed', state: 'succeeded', published: v(1) }), 'not_applied:finished'],
      ['steer', standing({ state: 'failed', phase: 'failed' }), 'not_applied:ended_without_report'],
      ['resume', standing({ goalStatus: 'held', phase: 'held' }), 'not_applied:changed'],
      ['steer', null, 'not_applied:unread'],
    ]
    for (const [action, s, code] of cases) {
      const out = refused(action, s)
      assert.equal(out.code, code, `${action} on ${JSON.stringify(s && [s.goalStatus, s.state])}`)
      assert.deepEqual([out.applied, out.pending, out.reason.startsWith('Not applied. ')], [false, false, true])
      assert.doesNotMatch(`${out.reason} ${out.next ?? ''}`, NEVER_SAID)
    }
    assert.equal(refused('hold', standing(), { refusedAs: 'stale_revision' }).code, 'not_applied:changed')
    // A finished task whose goal holds a follow-up: the Hold refused the steer, not the finished report.
    const follow = { taskId: NEXT, state: 'running' as const, phase: 'held' as const }
    const heldFollowUp = standing({ goalStatus: 'held', state: 'succeeded', phase: 'held', inFlight: [follow] })
    const held = refused('steer', { ...heldFollowUp, published: v(1), latestTaskId: NEXT })
    assert.deepEqual([held.code, held.next], ['not_applied:on_hold', undefined])
    assert.equal(refused('hold', { ...heldFollowUp, goalStatus: 'ready' }).code, 'not_applied:not_started')
  })

  it('offers a follow-up only for a steer on research that ended, and says when none can start', () => {
    const done = standing({ goalStatus: 'completed', state: 'succeeded', published: v(1), current: v(2) })
    const steer = refused('steer', { ...done, latestTaskId: NEXT })
    assert.equal(
      steer.reason,
      'Not applied. This research already finished and published version 1; the report is now at version 2. Nothing was changed and nothing is waiting.',
    )
    assert.match(steer.next ?? '', new RegExp(`amendsTaskId ${NEXT}\\); start it only if they confirm\\.$`))
    assert.deepEqual([steer.publishedVersion, steer.currentVersion], [1, 2])
    for (const researchGate of [true, null]) assert.match(refused('steer', done, { researchGate }).next ?? '', /amends/)
    assert.doesNotMatch(refused('steer', done, { researchGate: false }).next ?? '', /start_research/)
    assert.equal(refused('stop', done).next, undefined, 'only a steer meant a change to the report')
    assert.equal(refused('steer', { ...done, kind: 'draft_brief' }).next, undefined)
  })

  it('reads a task’s state from its own job, so a held goal never hides a finished task', () => {
    assert.equal(taskStateOf({ state: 'succeeded', phase: 'held' }), 'finished')
    assert.equal(taskStateOf({ state: 'running', phase: 'held' }), 'on_hold')
    assert.equal(taskStateOf({ state: 'pending', phase: 'dispatched' }), 'waiting_to_start')
    assert.equal(taskStateOf({ state: 'cancelled', phase: 'denied' }), 'refused')
    assert.equal(taskStateOf({ state: 'outcome_unknown', phase: 'outcome_unknown' }), 'unconfirmed')
  })

  it('says an accepted steer is not applied yet, and names the follow-up it reaches when the task named finished', () => {
    const queued = standing({ state: 'pending', phase: 'queued' })
    assert.equal(
      steerAccepted(queued),
      `Steer accepted for waiting-to-start research (taskId ${TASK}). It is not applied yet, and no confirmation comes back here.`,
    )
    const finished = standing({
      state: 'succeeded',
      phase: 'result_ready',
      inFlight: [{ taskId: NEXT, state: 'running', phase: 'running' }],
    })
    assert.match(steerAccepted(finished), new RegExp(`^Steer accepted for running research \\(taskId ${NEXT}\\)\\.`))
    // A task whose outcome is unknown is named, never called running.
    const unconfirmed = { state: 'outcome_unknown' as const, phase: 'outcome_unknown' as const }
    assert.equal(
      steerAccepted(standing({ ...unconfirmed, inFlight: [{ taskId: TASK, ...unconfirmed }] })),
      `Steer accepted for research (taskId ${TASK}). It is not applied yet, and no confirmation comes back here.`,
    )
    assert.equal(
      steerAccepted(standing({ state: 'failed', phase: 'failed', inFlight: [] })),
      'Steer accepted. No confirmation comes back here; project_status says where the work stands.',
    )
  })
})
