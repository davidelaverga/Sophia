import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { readBoardView } from './board-view.ts'

// The packet's own synthetic examples, installed byte for byte (docs/missions/2026-10-03-workboard-connection).
const examples = new URL('../../../../../../docs/missions/2026-10-03-workboard-connection/examples/', import.meta.url)
const example = (name: string): unknown => JSON.parse(readFileSync(new URL(name, examples), 'utf8'))

type Path = readonly (string | number)[]
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** A deep copy of a JSON value with the value at `path` replaced, or removed (`undefined`): a negative case. */
function edited(value: unknown, path: Path, to: unknown): unknown {
  const copy: unknown = structuredClone(value)
  let at: unknown = copy
  for (const key of path.slice(0, -1)) at = isObject(at) ? at[key] : undefined
  const last = path.at(-1)
  if (!isObject(at) || last === undefined) throw new Error(`no ${path.join('.')} to change`)
  if (to === undefined) delete at[last]
  else at[last] = to
  return copy
}

describe('readBoardView', () => {
  it('accepts the packet’s review-ready board as given', () => {
    const read = readBoardView(example('board-review-ready.json'))
    assert.equal(read.ok, true, read.ok ? '' : read.problems.join('\n'))
  })

  it('refuses each of the packet’s negative boards, saying why', () => {
    const board = example('board-review-ready.json')
    const item = ['goals', 0, 'items', 0]
    const plan = ['goals', 0, 'current_plan']
    const cases: [string, Path, unknown, RegExp][] = [
      ['complete without its policy', [...item, 'lifecycle'], 'complete', /complete only with/],
      ['accepted without its decision', [...plan, 'decision_ref'], null, /names its decision/],
      [
        'a candidate trigger without its producer',
        [...plan, 'items', 0, 'activation'],
        { kind: 'candidate_ready', producer_work_id: null },
        /names its producer/,
      ],
    ]
    for (const [name, path, to, says] of cases) {
      const read = readBoardView(edited(board, path, to))
      assert.equal(read.ok, false, name)
      if (!read.ok) assert.match(read.problems.join('\n'), says, name)
    }
  })

  it('refuses a shape that isn’t the board’s: a missing field, an unknown one, a wrong value', () => {
    const board = example('board-review-ready.json')
    const item = ['goals', 0, 'items', 0]
    const missing = readBoardView(edited(board, [...item, 'assignment'], undefined))
    const extra = readBoardView(edited(board, [...item, 'owner_ok'], true))
    const wrong = readBoardView(edited(board, [...item, 'lifecycle'], 'done'))
    const hash = readBoardView(edited(board, [...item, 'candidates', 0, 'sha256'], 'AAAA'))
    const v1 = readBoardView(edited(board, ['goals', 0, 'current_plan', 'schema_version'], 'sophia.work.plan.v1'))
    const project = readBoardView(edited(board, ['goals', 0, 'current_plan', 'project_id'], 'another-project'))
    const placed = readBoardView(edited(board, ['goals', 0, 'current_plan', 'goal_id'], 'another-goal'))
    for (const [read, says] of [
      [missing, /items\[0\]\.assignment: missing/],
      [extra, /owner_ok: not in the shape/],
      [wrong, /lifecycle: one of/],
      [hash, /sha256: a lowercase sha256/],
      [v1, /schema_version: one of sophia\.work\.plan\.v2/],
      [project, /project_id: the view's project, fixture-project/],
      [placed, /goal_id: its goal, fixture-goal/],
    ] as const) {
      assert.equal(read.ok, false)
      if (!read.ok) assert.match(read.problems.join('\n'), says)
    }
    assert.equal(readBoardView(null).ok, false)
    assert.equal(readBoardView([]).ok, false)
  })

  it('refuses a decision two of whose choices share a key, whatever their words (Codex F-028)', () => {
    const board = example('board-review-ready.json')
    const choices = ['goals', 0, 'decisions', 0, 'choices']
    for (const same of [
      [
        { key: 'same', label: 'Follow up now' },
        { key: 'same', label: 'Note it only' },
      ],
      [
        { key: 'same', label: 'Follow up now' },
        { key: 'same', label: 'Follow up now' },
      ],
    ]) {
      const read = readBoardView(edited(board, choices, same))
      assert.equal(read.ok, false)
      if (!read.ok) assert.deepEqual(read.problems, ['$.goals[0].decisions[0].choices: each choice its own key'])
    }
    // Distinct keys, as the packet has them, and the same words under distinct keys, are read as given.
    const distinct = [
      { key: 'one', label: 'Follow up' },
      { key: 'two', label: 'Follow up' },
    ]
    assert.equal(readBoardView(edited(board, choices, distinct)).ok, true)
  })

  it('refuses an accepted decision that names none of its choices; one not yet decided names none (Codex F-032)', () => {
    const board = example('board-review-ready.json')
    const decision = ['goals', 0, 'decisions', 0]
    const accepted = (selected: string | null) =>
      readBoardView(
        edited(edited(board, [...decision, 'state'], 'accepted'), [...decision, 'selected_choice'], selected),
      )
    for (const selected of [null, 'missing-key']) {
      const read = accepted(selected)
      assert.equal(read.ok, false)
      if (!read.ok) {
        assert.deepEqual(read.problems, [
          '$.goals[0].decisions[0].selected_choice: an accepted decision names one of its choices',
        ])
      }
    }
    // Accepted with one of its own choices, and proposed with none, as the packet has it, are read as given.
    assert.equal(accepted('follow_up').ok, true)
    assert.equal(readBoardView(board).ok, true)
  })

  it('refuses two decisions with one id at one revision, in a goal or across goals; another revision is another (Codex F-035)', () => {
    const board = example('board-review-ready.json')
    const read = readBoardView(board)
    if (!read.ok) throw new Error(read.problems.join('\n'))
    const [first] = read.value.goals
    const decision = first?.decisions[0]
    if (!first || !decision) throw new Error('no decision in the packet')
    const other = { ...decision, question: 'Another question?', work_id: first.items[1]?.work_id ?? decision.work_id }
    const twice = readBoardView(edited(board, ['goals', 0, 'decisions'], [decision, other]))
    assert.equal(twice.ok, false)
    if (!twice.ok)
      assert.deepEqual(twice.problems, ['$.goals[0].decisions[1]: another decision has this id at this revision'])
    // Across goals too: a second goal with the same decision.
    const second = {
      ...first,
      goal_id: 'fixture-goal-2',
      current_plan: first.current_plan && { ...first.current_plan, goal_id: 'fixture-goal-2' },
      proposed_plans: first.proposed_plans.map((p) => ({ ...p, goal_id: 'fixture-goal-2' })),
    }
    const across = readBoardView(edited(board, ['goals', 1], second))
    assert.equal(across.ok, false)
    if (!across.ok)
      assert.deepEqual(across.problems, ['$.goals[1].decisions[0]: another decision has this id at this revision'])
    // The same id at another revision, or another id, is another decision: read as given.
    const revised = { ...other, revision: decision.revision + 1 }
    assert.equal(readBoardView(edited(board, ['goals', 0, 'decisions'], [decision, revised])).ok, true)
    assert.equal(
      readBoardView(edited(board, ['goals', 0, 'decisions'], [decision, { ...other, decision_id: 'another' }])).ok,
      true,
    )
  })

  it('refuses a decision not yet decided that names a choice; one naming none is read as given (Codex F-036)', () => {
    const board = example('board-review-ready.json')
    const decision = ['goals', 0, 'decisions', 0]
    const early = readBoardView(edited(board, [...decision, 'selected_choice'], 'follow_up'))
    assert.equal(early.ok, false)
    if (!early.ok) {
      assert.deepEqual(early.problems, [
        '$.goals[0].decisions[0].selected_choice: a decision not yet decided names none',
      ])
    }
    assert.equal(readBoardView(board).ok, true)
  })

  it('refuses two plans of a goal with one id at one revision, in force or proposed; another revision is another (Codex F-039)', () => {
    const board = example('board-review-ready.json')
    const read = readBoardView(board)
    if (!read.ok) throw new Error(read.problems.join('\n'))
    const current = read.value.goals[0]?.current_plan
    if (!current) throw new Error('no plan in force in the packet')
    const [task, ...rest] = current.items
    if (!task) throw new Error('no task in the plan')
    const clone = {
      ...current,
      state: 'proposed' as const,
      decision_ref: null,
      items: [{ ...task, purpose: 'Something else under the same id' }, ...rest],
    }
    const proposed = ['goals', 0, 'proposed_plans']
    // A proposal with the plan in force's id and revision.
    const asCurrent = readBoardView(edited(board, proposed, [clone]))
    assert.equal(asCurrent.ok, false)
    if (!asCurrent.ok) {
      assert.deepEqual(asCurrent.problems, [
        '$.goals[0].proposed_plans[0]: another plan of this goal has this id at this revision',
      ])
    }
    // Two proposals with one id and revision.
    const next = { ...clone, revision: current.revision + 1 }
    const twice = readBoardView(edited(board, proposed, [next, { ...next, items: current.items }]))
    assert.equal(twice.ok, false)
    if (!twice.ok) {
      assert.deepEqual(twice.problems, [
        '$.goals[0].proposed_plans[1]: another plan of this goal has this id at this revision',
      ])
    }
    // The same id at another revision, and another id, are other plans: read as given.
    assert.equal(readBoardView(edited(board, proposed, [next])).ok, true)
    assert.equal(readBoardView(edited(board, proposed, [next, { ...clone, plan_id: 'another-plan' }])).ok, true)
  })

  it('refuses an item two of whose versions share an id; two distinct versions both current stay readable (Codex F-042)', () => {
    const board = example('board-review-ready.json')
    const read = readBoardView(board)
    if (!read.ok) throw new Error(read.problems.join('\n'))
    const [current] = read.value.goals[0]?.items[0]?.candidates ?? []
    if (!current) throw new Error('no candidate in the packet')
    const candidates = ['goals', 0, 'items', 0, 'candidates']
    const other = { ...current, source_id: 'another-source', sha256: 'b'.repeat(64) }
    for (const twice of [
      [current, { ...other, state: 'previous' as const }],
      [current, other],
      [current, { ...current }],
    ]) {
      const same = readBoardView(edited(board, candidates, twice))
      assert.equal(same.ok, false)
      if (!same.ok) assert.deepEqual(same.problems, ['$.goals[0].items[0].candidates: each version its own id'])
    }
    // Distinct versions, an earlier one or two both current (F-009's ambiguity), are read as given.
    const earlier = { ...other, version_id: 'fixture-review-source-v0', state: 'previous' as const }
    assert.equal(readBoardView(edited(board, candidates, [current, earlier])).ok, true)
    assert.equal(
      readBoardView(edited(board, candidates, [current, { ...other, version_id: 'fixture-review-source-v2' }])).ok,
      true,
    )
  })

  it('refuses two goals with one id, each placed as its own; distinct goals are read as given (Codex F-043)', () => {
    const board = example('board-review-ready.json')
    const read = readBoardView(board)
    if (!read.ok) throw new Error(read.problems.join('\n'))
    const [first] = read.value.goals
    if (!first?.current_plan) throw new Error('no plan in force in the packet')
    const twin = {
      ...first,
      current_plan: { ...first.current_plan, plan_id: 'another-plan' },
      proposed_plans: [],
      items: [],
      decisions: [],
    }
    const same = readBoardView(edited(board, ['goals', 1], twin))
    assert.equal(same.ok, false)
    if (!same.ok) assert.deepEqual(same.problems, ['$.goals[1]: another goal has this id'])
    const placed = {
      ...twin,
      goal_id: 'fixture-goal-2',
      current_plan: { ...twin.current_plan, goal_id: 'fixture-goal-2' },
    }
    assert.equal(readBoardView(edited(board, ['goals', 1], placed)).ok, true)
  })

  it('refuses a plan in force only proposed, or a proposal accepted; one superseded or withdrawn reads in either (Codex F-047)', () => {
    const board = example('board-review-ready.json')
    const read = readBoardView(board)
    if (!read.ok) throw new Error(read.problems.join('\n'))
    const current = read.value.goals[0]?.current_plan
    if (!current) throw new Error('no plan in force in the packet')
    const inForce = readBoardView(edited(board, ['goals', 0, 'current_plan', 'state'], 'proposed'))
    assert.equal(inForce.ok, false)
    if (!inForce.ok) {
      assert.deepEqual(inForce.problems, ["$.goals[0].current_plan.state: the plan in force isn't one only proposed"])
    }
    const next = { ...current, revision: current.revision + 1 }
    const proposal = readBoardView(edited(board, ['goals', 0, 'proposed_plans'], [next]))
    assert.equal(proposal.ok, false)
    if (!proposal.ok) {
      assert.deepEqual(proposal.problems, ["$.goals[0].proposed_plans[0].state: a proposal isn't a plan accepted"])
    }
    // History, superseded or withdrawn, stays readable in either slot.
    for (const state of ['superseded', 'withdrawn'] as const) {
      assert.equal(readBoardView(edited(board, ['goals', 0, 'current_plan', 'state'], state)).ok, true)
      assert.equal(readBoardView(edited(board, ['goals', 0, 'proposed_plans'], [{ ...next, state }])).ok, true)
    }
  })

  it('refuses a date-time without its offset, or one the calendar doesn’t have (GitHub review on PR #76)', () => {
    const board = example('board-review-ready.json')
    for (const at of ['2026-10-03T15:00', '2026-10-03T15:00:00', '2026-02-30T15:00:00Z']) {
      const read = readBoardView(edited(board, ['observed_at'], at))
      assert.equal(read.ok, false, at)
      if (!read.ok) assert.match(read.problems.join('\n'), /observed_at: an RFC 3339 date-time with its offset/, at)
    }
  })
})
