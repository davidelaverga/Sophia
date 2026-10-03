import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boundaries, notOffered, offered, targetOf } from './actions.ts'
import { assignment, goal, item, plan, view } from './board-samples.ts'
import type { ItemAction, ItemView } from './board-view.ts'
import { boardOf } from './plan.ts'

const allowed = (kind: ItemAction['kind'], boundary: string | null = null, reason = `${kind} allowed`): ItemAction => ({
  kind,
  availability: 'allowed',
  reason,
  boundary,
})
const denied = (kind: ItemAction['kind'], reason: string): ItemAction => ({
  kind,
  availability: 'denied',
  reason,
  boundary: null,
})

/** The one row of a plan of `build`, observed as `over` says. */
function rowOf(over: Partial<ItemView>) {
  const row = boardOf(
    goal(plan([item('build')]), [view('build', { lifecycle: 'running', assignment: assignment('build'), ...over })]),
    {
      resources: [],
      people: {},
      viewerId: 'luis',
    },
  )?.rows[0]
  if (!row) throw new Error('no row')
  return row
}

describe('what a task’s sheet offers to send (G3)', () => {
  it('offers only what the view allows; a command it doesn’t mention is unavailable, not allowed', () => {
    const row = rowOf({ available_actions: [allowed('guidance'), allowed('stop')] })
    assert.deepEqual(offered(row), [{ kind: 'guidance' }, { kind: 'stop' }])
    assert.deepEqual(offered(rowOf({ available_actions: [] })), [])
  })

  it('says why the rest isn’t offered, one line per reason, names listed as said (UI-08)', () => {
    const viewer = 'Viewers ask and read; they don’t retask.'
    const row = rowOf({
      available_actions: [denied('guidance', viewer), denied('hold', viewer), denied('stop', viewer)],
    })
    assert.deepEqual(notOffered(row), ['Guidance, Hold and Stop: Viewers ask and read; they don’t retask.'])
    assert.deepEqual(offered(row), [])
  })

  it('says the mandate a builder acts within, once', () => {
    const mandate = 'Within Davide’s contribution to this project.'
    const row = rowOf({
      available_actions: [allowed('guidance', mandate), allowed('hold', mandate), allowed('stop', mandate)],
    })
    assert.deepEqual(boundaries(row), [mandate])
  })

  it('offers Hold while it isn’t held, and Resume only while it is; each with what it does', () => {
    const actions = [
      allowed('hold', null, 'Holds at its next safe point.'),
      allowed('resume', null, 'Resumes from its saved state.'),
    ]
    assert.deepEqual(offered(rowOf({ available_actions: actions })), [
      { kind: 'hold', tip: 'Holds at its next safe point.' },
    ])
    assert.deepEqual(offered(rowOf({ lifecycle: 'held', available_actions: actions })), [
      { kind: 'resume', tip: 'Resumes from its saved state.' },
    ])
  })

  it('aims at the exact assignment, generation and attempt shown; with none known, at nothing', () => {
    assert.deepEqual(targetOf(rowOf({}), 'project-1'), {
      project_id: 'project-1',
      work_id: 'build',
      assignment_id: 'assignment-build',
      assignment_generation: 3,
      attempt_id: 'attempt-build-3',
      session_id: 's-build',
    })
    assert.equal(targetOf(rowOf({ assignment: null }), 'project-1'), null)
  })
})
