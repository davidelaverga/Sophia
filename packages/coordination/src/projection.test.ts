import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseWorkBoardView } from '@sophia/contracts/validate'
import {
  lifecycleOf,
  projectBoard,
  type BoardFacts,
  type DecisionFact,
  type PlanFact,
  type WorkFact,
} from './projection.ts'

const P = '00000000-0000-4000-8000-0000000000aa'
const GOAL = '00000000-0000-4000-8000-000000000010'
const PLAN = '00000000-0000-4000-8000-000000000020'
const WORK = '00000000-0000-4000-8000-000000000030'
const ASG = '00000000-0000-4000-8000-000000000040'
const DEC = '00000000-0000-4000-8000-000000000050'
const ATT = '00000000-0000-4000-8000-000000000060'
const SRC = '00000000-0000-4000-8000-000000000070'
const NOW = '2026-10-05T12:00:00.000Z'

const plan = (over: Partial<PlanFact> = {}, id = PLAN, work = WORK): PlanFact => ({
  definition: {
    schema_version: 'sophia.work.plan.v2',
    plan_id: id,
    project_id: P,
    goal_id: GOAL,
    goal_revision: 2,
    criteria_ref: `criteria:${GOAL}@2:0123456789abcdef`,
    revision: 1,
    mission_revision: 1,
    source_manifest_ref: SRC,
    assumptions: [
      { id: 'selected-sources-only', text: 'Only the selected sources.', status: 'unresolved', evidence_refs: [] },
    ],
    items: [
      {
        id: work,
        purpose: 'Review the selected sources',
        deliverable_ref: 'deliverable:source-review-report-v1',
        criteria_ref: `criteria:${GOAL}@2:0123456789abcdef`,
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
  },
  state: 'accepted',
  decisionId: DEC,
  createdAt: '2026-10-05T11:00:00.000Z',
  ...over,
})

const decision = (over: Partial<DecisionFact> = {}): DecisionFact => ({
  id: DEC,
  revision: 1,
  planId: PLAN,
  planRevision: 1,
  workId: WORK,
  question: 'Start this source review?',
  deciderId: 'viewer-a',
  choices: [
    { key: 'accept', label: 'Start the review' },
    { key: 'decline', label: 'Not now' },
  ],
  expiresAt: '2026-10-06T11:00:00.000Z',
  state: 'accepted',
  selectedChoice: 'accept',
  choiceReceiptId: 'receipt:abc:1',
  ...over,
})

const work = (over: Partial<WorkFact> = {}): WorkFact => ({
  workId: WORK,
  planId: PLAN,
  closedReason: null,
  goal: { status: 'running', stateRevision: 3 },
  assignment: { id: ASG, generation: 1 },
  commission: { state: 'created', reason: null },
  attempt: { id: ATT, nativeSessionId: `sophia-${ATT}`, bindingState: 'running', jobState: 'running', jobReason: null },
  results: [],
  deliveryUnknown: false,
  controlRefused: null,
  updatedAt: '2026-10-05T11:30:00.000Z',
  ...over,
})

const facts = (over: Partial<BoardFacts> = {}): BoardFacts => ({
  projectId: P,
  cursor: '42',
  now: NOW,
  viewer: { id: 'viewer-a', canEdit: true },
  plans: [plan()],
  decisions: [decision()],
  work: [work()],
  ...over,
})

const result = {
  id: '00000000-0000-4000-8000-000000000080',
  sourceId: '00000000-0000-4000-8000-000000000090',
  sha256: 'a'.repeat(64),
  state: 'current' as const,
  createdAt: '2026-10-05T11:40:00.000Z',
}
const only = (view: ReturnType<typeof projectBoard>) => {
  const item = view.goals[0]?.items[0]
  assert.ok(item)
  return item
}
const availability = (view: ReturnType<typeof projectBoard>, kind: string) =>
  only(view).available_actions.find((a) => a.kind === kind)?.availability

describe('the work board projection', () => {
  it('projects a running review that the generated contract validator accepts', () => {
    const view = projectBoard(facts())
    assert.equal(parseWorkBoardView(view), view)
    assert.equal(view.snapshot_cursor, '42')
    assert.equal(view.coverage, 'complete')
    assert.equal(only(view).lifecycle, 'running')
    assert.equal(view.goals[0]?.current_plan?.decision_ref, DEC)
    assert.deepEqual(only(view).assignment?.executor, {
      kind: 'sophia_native',
      display_name: 'Sophia',
      role: 'Source reviewer',
      owner_id: null,
      resource_id: null,
    })
  })

  it('is complete only with a stored result: satisfied with evidence, and openable', () => {
    const view = projectBoard(
      facts({ work: [work({ goal: { status: 'completed', stateRevision: 5 }, results: [result] })] }),
    )
    parseWorkBoardView(view)
    assert.equal(only(view).lifecycle, 'complete')
    assert.equal(only(view).completion.status, 'satisfied')
    assert.deepEqual(only(view).completion.evidence_refs, [`result:${result.id}`, `source:${result.sourceId}`])
    assert.equal(only(view).candidates[0]?.state, 'current')
    assert.equal(availability(view, 'open_result'), 'allowed')
    assert.equal(availability(view, 'stop'), 'unavailable')
  })

  it('never says complete for a completed goal without a result, and withdraws a withdrawn one', () => {
    assert.notEqual(lifecycleOf(work({ goal: { status: 'completed', stateRevision: 5 } })), 'complete')
    const view = projectBoard(
      facts({
        work: [
          work({
            goal: { status: 'completed', stateRevision: 6 },
            results: [{ ...result, state: 'withdrawn' }],
            closedReason: 'An input of this review was withdrawn',
          }),
        ],
      }),
    )
    parseWorkBoardView(view)
    assert.equal(only(view).lifecycle, 'cancelled')
    assert.equal(only(view).candidates[0]?.state, 'withdrawn')
    assert.equal(availability(view, 'open_result'), 'unavailable')
  })

  it('says a requested Hold as requested, and Held only once settled', () => {
    const holding = projectBoard(facts({ work: [work({ goal: { status: 'holding', stateRevision: 4 } })] }))
    assert.equal(only(holding).lifecycle, 'running')
    assert.match(only(holding).activity?.said ?? '', /Hold requested/)
    assert.equal(availability(holding, 'hold'), 'unavailable')
    assert.equal(availability(holding, 'resume'), 'unavailable')
    const held = projectBoard(
      facts({
        work: [
          work({
            goal: { status: 'held', stateRevision: 5 },
            attempt: {
              id: ATT,
              nativeSessionId: `sophia-${ATT}`,
              bindingState: 'idle',
              jobState: 'running',
              jobReason: null,
            },
          }),
        ],
      }),
    )
    assert.equal(only(held).lifecycle, 'held')
    assert.equal(availability(held, 'resume'), 'allowed')
  })

  it('denies shared controls to a read-only viewer and keeps guidance, Ask and review unavailable', () => {
    const view = projectBoard(facts({ viewer: { id: 'viewer-v', canEdit: false } }))
    assert.equal(availability(view, 'hold'), 'denied')
    assert.equal(availability(view, 'stop'), 'denied')
    for (const kind of ['guidance', 'ask_sophia', 'review_candidate'])
      assert.equal(availability(view, kind), 'unavailable')
  })

  it('shows an unknown observation as unknown, never unassigned, with partial coverage', () => {
    const view = projectBoard(
      facts({
        work: [
          work({
            attempt: {
              id: ATT,
              nativeSessionId: null,
              bindingState: 'launching',
              jobState: 'outcome_unknown',
              jobReason: null,
            },
          }),
        ],
      }),
    )
    parseWorkBoardView(view)
    assert.equal(only(view).lifecycle, 'unknown')
    assert.equal(only(view).assignment?.observation_state, 'unknown')
    assert.equal(view.coverage, 'partial')
    const lost = projectBoard(
      facts({ work: [work({ attempt: null, commission: { state: 'outcome_unknown', reason: null } })] }),
    )
    assert.equal(only(lost).lifecycle, 'queued')
    assert.equal(only(lost).waiting_on[0]?.state, 'unknown')
    assert.equal(lost.coverage, 'partial')
  })

  it('shows a control Paperclip refused as a wait on Paperclip, beside the work as Sophia holds it (Codex on #107)', () => {
    const view = projectBoard(
      facts({
        work: [
          work({ goal: { status: 'held', stateRevision: 4 }, controlRefused: { op: 'hold', code: 'not_mapped' } }),
        ],
      }),
    )
    assert.equal(parseWorkBoardView(view), view)
    assert.equal(only(view).lifecycle, 'held', "Sophia's own state of the work")
    assert.deepEqual(only(view).waiting_on, [
      {
        kind: 'external',
        reference_id: `control:${WORK}`,
        respondent_id: null,
        detail:
          'Paperclip refused the Hold (not_mapped); its issue does not show it yet. Sophia sends it again until Paperclip takes it.',
        state: 'pending',
      },
    ])
    const commissioning = projectBoard(
      facts({
        work: [
          work({
            attempt: null,
            commission: { state: 'pending', reason: null },
            controlRefused: { op: 'stop', code: '<b>not a code</b>'.repeat(60) },
          }),
        ],
      }),
    )
    parseWorkBoardView(commissioning)
    assert.deepEqual(
      only(commissioning).waiting_on.map((w) => w.reference_id),
      [`commission:${WORK}`, `control:${WORK}`],
      'each wait once, by its own reference',
    )
    assert.equal(
      only(commissioning).waiting_on[1]?.detail,
      'Paperclip refused the Stop; its issue does not show it yet. Sophia sends it again until Paperclip takes it.',
      "Paperclip's answer is shown only when it is a plain code",
    )
    assert.equal(only(projectBoard(facts())).waiting_on.length, 0, 'none refused: no wait')
  })

  it("closes failed work with its reason and a refused commission with Paperclip's", () => {
    const blocked = projectBoard(
      facts({
        work: [
          work({
            closedReason: 'blocked: source S2 is empty',
            attempt: {
              id: ATT,
              nativeSessionId: `sophia-${ATT}`,
              bindingState: 'running',
              jobState: 'failed',
              jobReason: 'blocked: source S2 is empty',
            },
          }),
        ],
      }),
    )
    parseWorkBoardView(blocked)
    assert.equal(only(blocked).lifecycle, 'failed')
    assert.equal(only(blocked).closed_reason, 'blocked: source S2 is empty')
    assert.equal(only(blocked).completion.status, 'not_satisfied')
    const refused = projectBoard(
      facts({ work: [work({ attempt: null, commission: { state: 'failed', reason: 'not mapped' } })] }),
    )
    assert.match(only(refused).closed_reason ?? '', /not mapped/)
  })

  it('shows a proposed plan beside the accepted one, drops an expired proposal, and marks its decision expired', () => {
    const PLAN2 = '00000000-0000-4000-8000-000000000021'
    const DEC2 = '00000000-0000-4000-8000-000000000051'
    const proposed = plan(
      { state: 'proposed', decisionId: DEC2, createdAt: '2026-10-05T11:50:00.000Z' },
      PLAN2,
      '00000000-0000-4000-8000-000000000031',
    )
    const pending = decision({
      id: DEC2,
      planId: PLAN2,
      state: 'proposed',
      selectedChoice: null,
      choiceReceiptId: null,
      workId: '00000000-0000-4000-8000-000000000031',
    })
    const view = projectBoard(facts({ plans: [plan(), proposed], decisions: [decision(), pending] }))
    parseWorkBoardView(view)
    assert.equal(view.goals[0]?.proposed_plans.length, 1)
    assert.equal(view.goals[0]?.proposed_plans[0]?.decision_ref, null)
    assert.equal(view.goals[0]?.decisions.find((d) => d.decision_id === DEC2)?.state, 'proposed')
    const late = projectBoard(
      facts({ now: '2026-10-07T00:00:00.000Z', plans: [plan(), proposed], decisions: [decision(), pending] }),
    )
    assert.equal(late.goals[0]?.proposed_plans.length, 0)
  })

  it('omits a goal whose only plan was declined', () => {
    const view = projectBoard(
      facts({
        plans: [plan({ state: 'declined' })],
        decisions: [decision({ state: 'declined', selectedChoice: 'decline' })],
        work: [],
      }),
    )
    assert.deepEqual(view.goals, [])
  })

  it('is deterministic whatever order its facts arrive in', () => {
    const PLAN2 = '00000000-0000-4000-8000-000000000022'
    const other = plan(
      { state: 'proposed', decisionId: '00000000-0000-4000-8000-000000000052', createdAt: '2026-10-05T11:55:00.000Z' },
      PLAN2,
      '00000000-0000-4000-8000-000000000032',
    )
    const d2 = decision({
      id: '00000000-0000-4000-8000-000000000052',
      planId: PLAN2,
      state: 'proposed',
      selectedChoice: null,
      choiceReceiptId: null,
    })
    const a = projectBoard(facts({ plans: [plan(), other], decisions: [decision(), d2] }))
    const b = projectBoard(facts({ plans: [other, plan()], decisions: [d2, decision()] }))
    assert.deepEqual(a, b)
  })
})
