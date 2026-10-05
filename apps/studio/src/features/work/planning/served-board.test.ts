import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { projectBoard, type BoardFacts, type WorkFact } from '@sophia/coordination'
import { readBoardView } from './board-view.ts'
import { boardOf, laneOf } from './plan.ts'

// WBC-02 G5: the board Sophia serves (its projection, as the API sends it after checking it against A12) is read by the
// Studio's own reader, unchanged, in each state a source review passes through, and lands in the lanes the board shows.
const P = '00000000-0000-4000-8000-0000000000aa'
const GOAL = '00000000-0000-4000-8000-000000000010'
const PLAN = '00000000-0000-4000-8000-000000000020'
const WORK = '00000000-0000-4000-8000-000000000030'
const ASG = '00000000-0000-4000-8000-000000000040'
const DEC = '00000000-0000-4000-8000-000000000050'
const ATT = '00000000-0000-4000-8000-000000000060'
const SRC = '00000000-0000-4000-8000-000000000070'
const VIEWER = '00000000-0000-4000-8000-0000000000bb'
const CRITERIA = `criteria:${GOAL}@2:0123456789abcdef`

const definition = {
  schema_version: 'sophia.work.plan.v2',
  plan_id: PLAN,
  project_id: P,
  goal_id: GOAL,
  goal_revision: 2,
  criteria_ref: CRITERIA,
  revision: 1,
  mission_revision: 1,
  source_manifest_ref: SRC,
  assumptions: [
    { id: 'selected-sources-only', text: 'Only the selected sources.', status: 'unresolved', evidence_refs: [] },
  ],
  items: [
    {
      id: WORK,
      purpose: 'Review the selected sources',
      deliverable_ref: 'deliverable:source-review-report-v1',
      criteria_ref: CRITERIA,
      parent_id: null,
      blocked_by: [],
      assignee_kind: 'assignment',
      assignee_id: ASG,
      source_scope_ref: SRC,
      review_policy_ref: 'policy:source-review-structural-v1',
      recipe_ref: 'sophia-source-review-v1',
      activation: { kind: 'immediate', producer_work_id: null },
    },
  ],
} as const

const result = {
  id: '00000000-0000-4000-8000-000000000080',
  sourceId: '00000000-0000-4000-8000-000000000090',
  sha256: 'a'.repeat(64),
  createdAt: '2026-10-05T11:40:00.000Z',
}

const work = (over: Partial<WorkFact>): WorkFact => ({
  workId: WORK,
  planId: PLAN,
  closedReason: null,
  goal: { status: 'running', stateRevision: 3 },
  assignment: { id: ASG, generation: 1 },
  commission: { state: 'created', reason: null },
  attempt: { id: ATT, nativeSessionId: `sophia-${ATT}`, bindingState: 'running', jobState: 'running', jobReason: null },
  results: [],
  deliveryUnknown: false,
  updatedAt: '2026-10-05T11:30:00.000Z',
  ...over,
})

function served(accepted: boolean, items: readonly WorkFact[]) {
  const facts: BoardFacts = {
    projectId: P,
    cursor: '42',
    now: '2026-10-05T12:00:00.000Z',
    viewer: { id: VIEWER, canEdit: true },
    plans: [
      { definition, state: accepted ? 'accepted' : 'proposed', decisionId: DEC, createdAt: '2026-10-05T11:00:00.000Z' },
    ],
    decisions: [
      {
        id: DEC,
        revision: 1,
        planId: PLAN,
        planRevision: 1,
        workId: WORK,
        question: 'Start this source review?',
        deciderId: VIEWER,
        choices: [
          { key: 'accept', label: 'Start the review' },
          { key: 'decline', label: 'Not now' },
        ],
        expiresAt: '2026-10-06T11:00:00.000Z',
        state: accepted ? 'accepted' : 'proposed',
        selectedChoice: accepted ? 'accept' : null,
        choiceReceiptId: accepted ? 'receipt:abc:1' : null,
      },
    ],
    work: [...items],
  }
  const read = readBoardView(JSON.parse(JSON.stringify(projectBoard(facts))))
  assert.ok(read.ok, read.ok ? '' : read.problems.join('; '))
  const goal = read.value.goals[0]
  assert.ok(goal)
  return { goal, board: boardOf(goal, { resources: [], people: {}, viewerId: VIEWER, project: P }) }
}

describe('the board Sophia serves, as the Studio reads it', () => {
  it('shows a proposal for its decider to take, and operates nothing yet', () => {
    const { goal, board } = served(false, [])
    assert.deepEqual([goal.current_plan, goal.proposed_plans.length, goal.decisions[0]?.state], [null, 1, 'proposed'])
    assert.equal(board?.operable ?? false, false)
  })

  it('places a running review in Active, with Hold and Stop as the board allows them', () => {
    const { goal, board } = served(true, [work({})])
    const row = board?.rows[0]
    assert.ok(row)
    assert.equal(laneOf(row), 'active')
    const allowed = goal.items[0]?.available_actions.filter((a) => a.availability === 'allowed').map((a) => a.kind)
    assert.deepEqual(allowed?.toSorted(), ['hold', 'stop'])
  })

  it('places a published review in Complete, with its one current version to open', () => {
    const { goal, board } = served(true, [
      work({ goal: { status: 'completed', stateRevision: 5 }, results: [{ ...result, state: 'current' }] }),
    ])
    const row = board?.rows[0]
    assert.ok(row)
    assert.equal(laneOf(row), 'complete')
    assert.deepEqual(
      goal.items[0]?.candidates.map((c) => c.state),
      ['current'],
    )
  })

  it('keeps a withdrawn result out of Complete and says why it closed', () => {
    const { goal, board } = served(true, [
      work({
        goal: { status: 'completed', stateRevision: 6 },
        results: [{ ...result, state: 'withdrawn' }],
        closedReason: 'An input of this review was withdrawn',
      }),
    ])
    const row = board?.rows[0]
    assert.ok(row)
    assert.equal(laneOf(row), 'closed')
    assert.match(goal.items[0]?.closed_reason ?? '', /withdrawn/)
  })
})
