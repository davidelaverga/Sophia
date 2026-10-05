import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { freshness, observedAgo, type Resource } from '../../resources/resource.ts'
import { assignment, goal, item, plan, view } from './board-samples.ts'
import type { BoardDecision, ItemView, Lifecycle, Wait } from './board-view.ts'
import {
  actionable,
  allowed,
  boardOf,
  decidedFor,
  forViewer,
  forYou,
  LANE,
  latestDecisions,
  outsideOf,
  relation,
  shownPlan,
  waitsOn,
  whoDoes,
  type GoalView,
} from './plan.ts'

/** Davide's Claude Code, one session on `workId`, listed as the plan's assignment would name it. */
const resource = (workId: string, sessionId = `s-${workId}`): Resource => ({
  id: `res-${workId}`,
  owner: { id: 'davide', name: 'Davide' },
  tool: 'claude-code',
  entitlementId: 'ent',
  host: { state: 'online', observedAt: null },
  sessions: [
    { id: sessionId, role: 'worker', model: null, effort: null, assignment: { workId, title: 'x', state: 'running' } },
  ],
  controls: { steer: 'unqualified', hold: 'unqualified', stop: 'unqualified', permissions: 'unqualified' },
  reservePercent: null,
})

const people = { luis: { id: 'luis', name: 'Luis' }, davide: { id: 'davide', name: 'Davide' } }

const wait = (kind: Wait['kind'], respondent: string | null, state: Wait['state'] = 'pending'): Wait => ({
  kind,
  reference_id: `ref-${kind}`,
  respondent_id: respondent,
  detail: `About ${kind}`,
  state,
})

const readers = (viewerId: string | null = 'luis', resources: Resource[] = []) => ({ resources, people, viewerId })

/** The rows of a one-goal board. */
const rowsOf = (g: GoalView, viewerId: string | null = 'luis', resources: Resource[] = []) =>
  boardOf(g, readers(viewerId, resources))?.rows ?? []

/** Where one item stands, observed as `over` says, in a plan of it and anything else given. */
function standing(
  over: Partial<ItemView>,
  viewerId: string | null = 'luis',
  others = [item('build', { purpose: 'Implement the PDF retry' })],
) {
  const one = item('one')
  const row = rowsOf(goal(plan([...others, one]), [view('one', over)]), viewerId).find((r) => r.item.id === 'one')
  return [row?.status.mark, row?.status.text]
}

/** Where it stands, and why when its chip's few words can't say it (Codex F-011). */
function standingWhy(over: Partial<ItemView>) {
  const one = item('one')
  const row = rowsOf(goal(plan([one]), [view('one', over)])).find((r) => r.item.id === 'one')
  return [row?.status.mark, row?.status.text, row?.status.detail]
}

/** A review of the retry's candidate that also comes after it. */
const blocked = item('one', {
  blocked_by: ['build'],
  activation: { kind: 'candidate_ready', producer_work_id: 'build' },
})

/** A plan of the retry and `i`, `i` observed as `over` says. */
const retryAnd = (over: Partial<ItemView>, i = blocked) =>
  goal(plan([item('build', { purpose: 'Implement the PDF retry' }), i]), [view('one', over)])

/** A report from one attempt at one generation. */
const report = (attempt: string, generation: number) => ({
  observation_id: 'o',
  attempt_id: attempt,
  assignment_generation: generation,
  said: 'Ran the tests',
  observed_at: '2026-10-02T12:00:00Z',
  connection: 'online' as const,
})

describe('the plan the board shows', () => {
  it('is the accepted one; while none is, the proposed one, read only; a superseded or withdrawn one is history', () => {
    const accepted = plan([item('a')])
    const replacement = plan([item('a'), item('b')], {
      plan_id: 'plan-2',
      revision: 3,
      state: 'proposed',
      decision_ref: null,
    })
    assert.deepEqual(shownPlan(goal(accepted, [], { proposed_plans: [replacement] })), {
      plan: accepted,
      operable: true,
    })
    assert.deepEqual(shownPlan(goal(null, [], { proposed_plans: [replacement] })), {
      plan: replacement,
      operable: false,
    })
    assert.equal(shownPlan(goal(plan([item('a')], { state: 'superseded' }), [])), null)
    assert.equal(shownPlan(goal(plan([item('a')], { state: 'withdrawn' }), [])), null)
    assert.equal(shownPlan(null), null)
  })

  it('keeps a proposed plan’s items out of execution: no observation, no action, whatever the view says (UI-03)', () => {
    const replacement = plan([item('a')], { state: 'proposed', decision_ref: null })
    const g = goal(null, [view('a', { lifecycle: 'running', assignment: assignment('a'), available_actions: [] })], {
      proposed_plans: [replacement],
    })
    const board = boardOf(g, readers('davide'))
    assert.equal(board?.operable, false)
    assert.deepEqual(
      board?.rows.map((r) => [r.status.mark, r.view, r.actions]),
      [['later', null, []]],
    )
  })
})

describe('who does an item', () => {
  it('is its admitted assignment, exactly: the session its assignment names, never one found by its work', () => {
    const one = item('build')
    const observed = view('build', { lifecycle: 'running', assignment: assignment('build') })
    const who = whoDoes(one, observed, [resource('build')], people)
    assert.deepEqual(
      [who.name, who.role, who.kind, who.person?.name, who.resource?.id, who.session?.id],
      ['Davide’s Claude Code', 'worker', 'owner_native', 'Davide', 'res-build', 's-build'],
    )
    // Another session on the same work, not the one the assignment names: no session, not the first that matches.
    assert.equal(whoDoes(one, observed, [resource('build', 's-older')], people).session, null)
  })

  it('names Sophia’s own reviewer as itself, with no person and no subscription behind it (UI-16)', () => {
    const native = assignment('review', {
      native_session_id: null,
      executor: {
        kind: 'sophia_native',
        display_name: 'Sophia',
        role: 'Source reviewer',
        owner_id: null,
        resource_id: null,
      },
    })
    const who = whoDoes(
      item('review'),
      view('review', { lifecycle: 'running', assignment: native }),
      [resource('review')],
      people,
    )
    assert.deepEqual(
      [who.name, who.role, who.kind, who.person, who.resource, who.session],
      ['Sophia', 'Source reviewer', 'sophia_native', null, null, null],
    )
  })

  it('without an assignment: the person the plan names, a named assignment not running yet, or no one', () => {
    assert.equal(
      whoDoes(item('call', { assignee_kind: 'human', assignee_id: 'luis' }), null, [], people).person?.name,
      'Luis',
    )
    assert.equal(whoDoes(item('docs'), view('docs'), [resource('docs')], people).name, 'Assigned, not running yet')
    assert.equal(
      whoDoes(item('free', { assignee_kind: 'unassigned', assignee_id: null }), null, [], people).name,
      'Unassigned',
    )
  })
})

describe('where an item stands', () => {
  it('waits on whom a pending request names: the viewer first, then a person, then what it waits for (UI-07)', () => {
    const waits = [wait('native_permission', 'luis'), wait('product_decision', 'davide')]
    assert.deepEqual(standing({ lifecycle: 'waiting', assignment: assignment('one'), waiting_on: waits }, 'davide'), [
      'waiting',
      'Waiting on Davide',
    ])
    assert.deepEqual(standing({ lifecycle: 'waiting', assignment: assignment('one'), waiting_on: waits }, 'mara'), [
      'waiting',
      'Waiting on Luis',
    ])
    assert.deepEqual(
      standing({ lifecycle: 'waiting', assignment: assignment('one'), waiting_on: [wait('capacity', null)] }),
      ['waiting', 'Waiting for capacity'],
    )
    // A resolved or expired request calls no one.
    assert.deepEqual(
      standing({
        lifecycle: 'waiting',
        assignment: assignment('one'),
        waiting_on: [wait('product_decision', 'luis', 'resolved')],
      }),
      ['waiting', 'Waiting'],
    )
  })

  it('in motion: working, held, ready for review, changes needed (UI-04)', () => {
    const moving: [Lifecycle, string, string][] = [
      ['running', 'working', 'Working'],
      ['held', 'held', 'Held'],
      ['ready_for_review', 'review', 'Ready for review'],
      ['changes_required', 'changes', 'Changes needed'],
    ]
    for (const [lifecycle, mark, text] of moving)
      assert.deepEqual(standing({ lifecycle, assignment: assignment('one') }), [mark, text])
  })

  it('not begun: queued, or up next with every condition, or unassigned, its conditions still said', () => {
    const said = (over: Partial<ItemView>, i = blocked) =>
      rowsOf(retryAnd(over, i)).find((r) => r.item.id === 'one')?.status.text
    assert.equal(
      said({ waiting_on: [wait('capacity', null)] }),
      'After Implement the PDF retry, once there is a candidate to review, waiting for capacity',
    )
    assert.equal(
      said({ waiting_on: [wait('product_decision', 'davide')] }),
      'After Implement the PDF retry, once there is a candidate to review, waiting on Davide',
    )
    assert.equal(
      said({ lifecycle: 'queued', assignment: assignment('one') }),
      'Queued · after Implement the PDF retry, once there is a candidate to review',
    )
    const unassigned = item('one', { assignee_kind: 'unassigned', assignee_id: null, blocked_by: ['build'] })
    assert.deepEqual(standing({}, 'luis', []).slice(0, 1), ['later'])
    const row = rowsOf(retryAnd({}, unassigned)).find((r) => r.item.id === 'one')
    assert.deepEqual([row?.status.mark, row?.status.text], ['free', 'After Implement the PDF retry'])
  })

  it('complete only by its own policy, satisfied with evidence; a closed one is closed, never done (UI-06)', () => {
    const satisfied = { policy_ref: 'p', status: 'satisfied' as const, evidence_refs: ['e1'] }
    assert.deepEqual(standing({ lifecycle: 'complete', completion: satisfied }), ['complete', 'Complete'])
    assert.deepEqual(standingWhy({ lifecycle: 'complete', completion: { ...satisfied, evidence_refs: [] } }), [
      'unknown',
      'Not shown as complete',
      'Its policy isn’t satisfied with evidence.',
    ])
    // A check that passed for v1 doesn't make v2 complete (UI-05).
    const v2 = {
      source_id: 's',
      version_id: 'v2',
      sha256: 'b'.repeat(64),
      media_type: 'text/markdown',
      created_at: '2026-10-02T12:00:00Z',
      state: 'current' as const,
    }
    const versions = [v2]
    const oldCheck = { state: 'passed' as const, candidate_version_ref: 'v1', evidence_refs: ['check-v1'] }
    assert.deepEqual(
      standingWhy({ lifecycle: 'complete', completion: satisfied, candidates: versions, review: oldCheck }),
      ['unknown', 'Not shown as complete', 'Its check was of another version than the one it holds now.'],
    )
    // Codex F-009: a check of v2 beside two versions both claiming to be current, or beside none current, can't be
    // matched to the version held now: not complete, said why. Bound to no version, the policy's word stands.
    const v2Check = { ...oldCheck, candidate_version_ref: 'v2' }
    const v3 = { ...v2, version_id: 'v3', sha256: 'c'.repeat(64) }
    const unmatched = 'Its check can’t be matched to a single current version: two claim to be current, or none is.'
    for (const candidates of [
      [...versions, v3],
      [{ ...v2, state: 'previous' as const }],
      [{ ...v2, state: 'withdrawn' as const }],
      [],
    ]) {
      assert.deepEqual(standingWhy({ lifecycle: 'complete', completion: satisfied, candidates, review: v2Check }), [
        'unknown',
        'Not shown as complete', // a few words in its chip, the reason where it wraps (Codex F-011)
        unmatched,
      ])
    }
    assert.deepEqual(
      standingWhy({ lifecycle: 'complete', completion: satisfied, candidates: versions, review: v2Check }),
      ['complete', 'Complete', undefined],
    )
    // Codex F-020: a check of the version it holds now certifies only once passed.
    for (const [state, why] of [
      ['pending', 'Its check of the version it holds now is still pending.'],
      ['changes_required', 'Its check of the version it holds now found changes needed.'],
      ['inconclusive', 'Its check of the version it holds now was inconclusive.'],
    ] as const) {
      assert.deepEqual(
        standingWhy({
          lifecycle: 'complete',
          completion: satisfied,
          candidates: versions,
          review: { ...v2Check, state },
        }),
        ['unknown', 'Not shown as complete', why],
        state,
      )
    }
    const unbound = { ...v2Check, candidate_version_ref: null }
    assert.deepEqual(
      standing({ lifecycle: 'complete', completion: satisfied, candidates: [...versions, v3], review: unbound }),
      ['complete', 'Complete'],
    )
    for (const lifecycle of ['stopped', 'cancelled', 'failed', 'superseded'] as const) {
      const [mark] = standing({ lifecycle, closed_reason: 'Stopped by Davide' })
      assert.equal(mark, 'closed', lifecycle)
    }
  })

  it('unknown stays unknown, in Active, never Unassigned: no observation, an unknown state, an offline host', () => {
    const unassigned = [item('free', { assignee_kind: 'unassigned', assignee_id: null })]
    assert.deepEqual(
      rowsOf(goal(plan(unassigned), [])).map((r) => [r.status.mark, r.status.text]),
      [['unknown', 'Not observed']],
    )
    assert.deepEqual(standing({ lifecycle: 'unknown' }), ['unknown', 'State unknown'])
    // Codex F-002: the plan names who does it, the view says no one, and the work is past planning: not known.
    assert.deepEqual(standing({ lifecycle: 'queued', assignment: null }), ['unknown', 'Assignment not observed'])
    assert.deepEqual(standing({ lifecycle: 'running', assignment: null }), ['unknown', 'Assignment not observed'])
    assert.deepEqual(
      standing({ lifecycle: 'running', assignment: assignment('one', { observation_state: 'unknown' }) }),
      ['unknown', 'Not observed'],
    )
    const offline = assignment('one', { observation_state: 'offline' })
    assert.deepEqual(standing({ lifecycle: 'running', assignment: offline }), ['unknown', 'Host offline'])
    assert.equal(LANE.unknown, 'active')
  })

  it('puts each mark in its lane: Active, Up next, Unassigned, Complete, and Closed apart', () => {
    assert.deepEqual(
      Object.entries(LANE)
        .filter(([, lane]) => lane !== 'active')
        .map(([mark, lane]) => `${mark}:${lane}`),
      ['queued:next', 'later:next', 'free:unassigned', 'complete:complete', 'closed:closed'],
    )
  })
})

describe('a row’s report, its actions and whom it is for', () => {
  it('reports only from its current attempt and generation; an earlier attempt’s report is not its state (UI-02)', () => {
    const current = assignment('one')
    const of = (activity: ReturnType<typeof report>) =>
      rowsOf(goal(plan([item('one')]), [view('one', { lifecycle: 'running', assignment: current, activity })]))[0]
        ?.activity?.said ?? null
    assert.equal(of(report('attempt-one-3', 3)), 'Ran the tests')
    assert.equal(of(report('attempt-one-2', 2)), null)
    assert.equal(of(report('attempt-one-2', 3)), null)
    assert.equal(of(report('attempt-one-3', 2)), null) // the same attempt id at an older generation
  })

  it('offers only what the view allows; a missing action is unavailable, not allowed', () => {
    const actions = [
      { kind: 'hold' as const, availability: 'allowed' as const, reason: 'Within the mandate', boundary: null },
    ]
    const [row] = rowsOf(goal(plan([item('one')]), [view('one', { lifecycle: 'running', available_actions: actions })]))
    assert.ok(row)
    assert.equal(allowed(row, 'hold'), true)
    assert.equal(allowed(row, 'stop'), false)
  })

  it('is for the viewer when a pending request names them or they do it by hand; owning the account is not (UI-07)', () => {
    const now = new Date('2026-10-02T12:00:00Z')
    const running = view('build', { lifecycle: 'running', assignment: assignment('build') })
    const rows = rowsOf(
      goal(plan([item('build'), item('note', { assignee_kind: 'human', assignee_id: 'luis' })]), [
        running,
        view('note'),
      ]),
    )
    assert.equal(forYou(rows, [], 'davide', now), false) // Davide owns the account; nothing asks him
    assert.deepEqual(
      rows.filter((r) => forViewer(r, 'luis')).map((r) => r.item.id),
      ['note'],
    )
    const asking = rowsOf(
      goal(plan([item('build')]), [
        { ...running, lifecycle: 'waiting', waiting_on: [wait('product_decision', 'davide')] },
      ]),
    )
    assert.equal(forYou(asking, [], 'davide', now), true)
    assert.equal(forYou(asking, [], 'luis', now), false)
  })
})

describe('work outside the plan observed more than once (Codex F-045)', () => {
  const twice = [
    view('stray', { lifecycle: 'running', assignment: assignment('stray') }),
    view('stray', { lifecycle: 'planned' }),
    view('same', { lifecycle: 'running' }),
    view('same', { lifecycle: 'running' }),
    view('extra', { lifecycle: 'running' }),
  ]
  it('lists each once, those observed twice with no state of either; a single one as observed', () => {
    const board = boardOf(goal(plan([item('a')]), [view('a'), ...twice]), readers())
    assert.deepEqual(
      board?.outside.map((o) => [o.work_id, o.view?.lifecycle ?? null]),
      [
        ['stray', null],
        ['same', null],
        ['extra', 'running'],
      ],
    )
    assert.ok(board?.problems.includes('A task is observed twice'))
    assert.ok(board?.problems.includes('3 observed tasks aren’t in the plan in force'))
  })

  it('does the same with no plan in force: each once, by the same rule', () => {
    assert.deepEqual(
      outsideOf(goal(null, twice), null).map((o) => [o.work_id, o.view?.lifecycle ?? null]),
      [
        ['stray', null],
        ['same', null],
        ['extra', 'running'],
      ],
    )
  })

  it('leaves a task in the plan observed twice as before: no state of it, nothing it allows', () => {
    const board = boardOf(
      goal(plan([item('a')]), [
        view('a', { lifecycle: 'running', available_actions: [] }),
        view('a', { lifecycle: 'planned' }),
      ]),
      readers(),
    )
    const [row] = board?.rows ?? []
    assert.deepEqual([row?.view, row?.actions], [null, []])
    assert.deepEqual(board?.outside, [])
  })
})

describe('work the plan doesn’t hold, and a plan of another project (review P2)', () => {
  it('says what is observed outside the plan in force, never hiding it', () => {
    const board = boardOf(goal(plan([item('a')]), [view('a'), view('stray', { lifecycle: 'running' })]), readers())
    assert.deepEqual(
      board?.outside.map((v) => v.work_id),
      ['stray'],
    )
    assert.ok(board?.problems.includes('1 observed task isn’t in the plan in force'))
    // While only a proposal is shown, everything observed is outside a plan in force.
    const proposedOnly = goal(null, [view('a', { lifecycle: 'running' })], {
      proposed_plans: [plan([item('a')], { state: 'proposed', decision_ref: null })],
    })
    assert.deepEqual(
      boardOf(proposedOnly, readers())?.outside.map((v) => v.work_id),
      ['a'],
    )
  })

  it('never operates a plan of another project as this one’s', () => {
    const g = goal(plan([item('a')]), [view('a', { lifecycle: 'running', assignment: assignment('a') })])
    const board = boardOf(g, { ...readers(), project: 'project-2' })
    assert.equal(board?.operable, false)
    assert.ok(board?.problems.includes('It belongs to another project'))
    assert.equal(boardOf(g, { ...readers(), project: 'project-1' })?.operable, true)
  })
})

describe('the plan’s tree, its relations and its problems', () => {
  it('keeps every item once, however deep, each under its parent, and an orphan on its own (UI-01)', () => {
    const items = [
      item('a'),
      item('b', { parent_id: 'a' }),
      item('c', { parent_id: 'b' }),
      item('stray', { parent_id: 'gone' }),
    ]
    const board = boardOf(
      goal(
        plan(items),
        items.map((i) => view(i.id)),
      ),
      readers(),
    )
    assert.deepEqual(
      board?.rows.map((r) => [r.item.id, r.depth]),
      [
        ['a', 0],
        ['b', 1],
        ['c', 2],
        ['stray', 0],
      ],
    )
    assert.deepEqual(board?.problems, [])
  })

  it('shows a loop of parents, a loop of blockers, a missing blocker and a repeated id once each, and says so (UI-01)', () => {
    const loop = [item('x', { parent_id: 'y' }), item('y', { parent_id: 'x' })]
    const said = (items: ReturnType<typeof item>[], views: ItemView[] = []) => {
      const board = boardOf(goal(plan(items), views), readers())
      return { ids: board?.rows.map((r) => r.item.id).toSorted(), problems: board?.problems }
    }
    assert.deepEqual(said(loop), { ids: ['x', 'y'], problems: ['Some tasks are grouped in a loop'] })
    const blockers = [
      item('p', { blocked_by: ['q'] }),
      item('q', { blocked_by: ['p'] }),
      item('r', { blocked_by: ['gone'] }),
    ]
    assert.deepEqual(said(blockers).problems, [
      'A task waits on work that isn’t in the plan',
      'Some tasks wait on each other in a loop',
    ])
    assert.deepEqual(said([item('d'), item('d', { purpose: 'Again' })]), {
      ids: ['d'],
      problems: ['Two tasks share one id'],
    })
    const twice = said([item('e')], [view('e', { lifecycle: 'running' }), view('e', { lifecycle: 'complete' })])
    assert.deepEqual(twice.problems, ['A task is observed twice'])
    assert.equal(
      boardOf(goal(plan([item('e')]), [view('e'), view('e')]), readers())?.rows[0]?.status.text,
      'Not observed',
    )
  })

  it('orders tasks by what needs someone, each child under its parent', () => {
    const items = [
      item('free', { assignee_kind: 'unassigned', assignee_id: null }),
      item('later'),
      item('build'),
      item('review', { parent_id: 'build' }),
      item('done'),
    ]
    const views = [
      view('free'),
      view('later'),
      view('build', { lifecycle: 'waiting', waiting_on: [wait('native_permission', 'davide')] }),
      view('review'),
      view('done', {
        lifecycle: 'complete',
        completion: { policy_ref: 'p', status: 'satisfied', evidence_refs: ['e'] },
      }),
    ]
    assert.deepEqual(
      rowsOf(goal(plan(items), views)).map((r) => r.item.id),
      ['build', 'review', 'later', 'free', 'done'],
    )
  })

  it('knows what a task waits on, and says a review that also waits on others with both', () => {
    const review = item('r', { blocked_by: ['b'], activation: { kind: 'candidate_ready', producer_work_id: 'a' } })
    const p = plan([item('a', { purpose: 'Build it' }), item('b', { purpose: 'Measure it' }), review])
    assert.deepEqual(waitsOn(review), ['b', 'a'])
    assert.equal(relation(review, p), 'Reviews Build it, after Measure it')
  })
})

describe('decisions and a session’s last report', () => {
  const now = new Date('2026-10-02T12:00:00Z')
  const decision: BoardDecision = {
    decision_id: 'd',
    revision: 1,
    work_id: 'build',
    plan_id: 'plan-1',
    plan_revision: 2,
    candidate_version_ref: null,
    question: 'q',
    decider_id: 'davide',
    choices: [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ],
    expires_at: '2026-10-02T13:00:00Z',
    state: 'proposed',
    selected_choice: null,
    choice_receipt_id: null,
    plan_reaction: 'not_needed',
  }

  it('is a plan’s choice only when made for it, at its revision or before (Codex F-013, F-015)', () => {
    const r2 = plan([item('build')])
    assert.equal(r2.revision, 2)
    assert.equal(decidedFor(decision, r2), true)
    assert.equal(decidedFor({ ...decision, plan_revision: 1 }, r2), true) // carried forward
    assert.equal(decidedFor({ ...decision, plan_revision: 3 }, r2), false) // a later revision, not in force
    assert.equal(decidedFor({ ...decision, plan_id: 'plan-1-alt' }, r2), false) // another plan
  })

  it('answers a decision only while proposed and not past its expiry; one past it calls no one', () => {
    assert.equal(actionable(decision, now), true)
    assert.equal(actionable({ ...decision, expires_at: '2026-10-02T11:00:00Z' }, now), false)
    assert.equal(actionable({ ...decision, state: 'accepted' }, now), false)
    assert.equal(forYou([], [decision], 'davide', now), true)
    assert.equal(forYou([], [{ ...decision, expires_at: '2026-10-02T11:00:00Z' }], 'davide', now), false)
  })

  it('takes each decision at its latest revision, in any state and either order (Codex F-048)', () => {
    const r1 = decision
    const r2 = { ...decision, revision: 2, question: 'q, revised' }
    const other = { ...decision, decision_id: 'e', decider_id: 'luis' }
    // Two revisions proposed, in either order: only the later one is open.
    assert.deepEqual(latestDecisions([r1, r2]), [r2])
    assert.deepEqual(latestDecisions([r2, r1]), [r2])
    // The later one answered, expired or superseded: the older one proposed stays history, nothing is open of it.
    for (const state of ['accepted', 'declined', 'expired', 'superseded'] as const) {
      const ended = { ...r2, state }
      assert.deepEqual(latestDecisions([r1, ended]), [ended], state)
      assert.deepEqual(latestDecisions([ended, r1]), [ended], state)
      assert.equal(forYou([], [r1, ended], 'davide', now), false, state)
      assert.equal(forYou([], [ended, r1], 'davide', now), false, state)
    }
    // Decisions apart stay apart, in the order each first appears; one revision alone is itself.
    assert.deepEqual(latestDecisions([r1, other, r2]), [r2, other])
    assert.deepEqual(latestDecisions([other, r2, r1]), [other, r2])
    assert.deepEqual(latestDecisions([other]), [other])
    assert.equal(forYou([], [r1, r2], 'davide', now), true)
    assert.equal(forYou([], [{ ...r2, expires_at: '2026-10-02T11:00:00Z' }, r1], 'davide', now), false)
    assert.equal(forYou([], [r1, { ...r2, state: 'accepted' }, other], 'luis', now), true)
  })

  it('says how long ago a report was seen, to the second while fresh, and how fresh it still is', () => {
    assert.equal(observedAgo('2026-10-02T11:59:20Z', now), '40 s ago')
    assert.equal(observedAgo('2026-10-02T11:57:00Z', now), '3 min ago')
    assert.equal(freshness('2026-10-02T12:00:00Z', now), 1)
    assert.equal(freshness('2026-10-02T11:59:00Z', now), 0.5)
    assert.equal(freshness('2026-10-02T11:50:00Z', now), 0)
  })
})
