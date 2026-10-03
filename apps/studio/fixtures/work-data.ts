// Labelled fixture data for the plan checks (e2e/work.spec.ts): one goal, the lead's plan for it as
// `sophia.work.plan.v1` with the Studio's proposed fields (src/features/work/planning/plan.ts), and the resources whose
// sessions run its work (fixtures/resources-data.ts). Simulated: no lead, tool or host was read, and the page says so.
import type { Goal } from '@sophia/contracts'
import type { WorkPlan } from '../src/features/work/planning/plan.ts'
import { PROJECT } from './data.ts'
import { NOW } from './resources-data.ts'

const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

export const goal: Goal = {
  id: '00000000-0000-4000-8000-0000000000b1',
  projectId: PROJECT,
  title: 'Reports export to PDF reliably',
  revision: 3,
  authorityEpoch: 1,
  status: 'running',
  outcome: 'A report exports to PDF on the first try, or says plainly why it couldn’t.',
  criteria: [
    { id: 'c1', description: 'A failed render is retried, then reported', required: true, verification: 'test' },
    { id: 'c2', description: 'The report pane shows the export’s state', required: false, verification: 'review' },
  ],
  stateRevision: 7,
}

const items: WorkPlan['items'] = [
  {
    id: 'work-0a',
    purpose: 'Reproduce the failed render',
    parent_id: null,
    blocked_by: [],
    assignee_kind: 'human',
    assignee_id: 'luis',
    activation: { kind: 'immediate', producer_work_id: null },
    outcome: { state: 'checked', at: inHours(-6) },
  },
  {
    id: 'work-0b',
    purpose: 'Write the retry’s failing test',
    parent_id: null,
    blocked_by: [],
    assignee_kind: 'human',
    assignee_id: 'luis',
    activation: { kind: 'immediate', producer_work_id: null },
    outcome: { state: 'finished', at: inHours(-1) },
  },
  {
    id: 'work-1',
    purpose: 'Implement the PDF retry',
    parent_id: null,
    blocked_by: [],
    assignee_kind: 'assignment',
    assignee_id: 'assignment-claude-worker',
    activation: { kind: 'immediate', producer_work_id: null },
  },
  {
    id: 'work-1-review',
    purpose: 'Review the retry’s candidate',
    parent_id: 'work-1',
    blocked_by: [],
    assignee_kind: 'assignment',
    assignee_id: 'assignment-claude-reviewer',
    activation: { kind: 'candidate_ready', producer_work_id: 'work-1' },
  },
  {
    id: 'work-2',
    purpose: 'Review the report pane',
    parent_id: null,
    blocked_by: [],
    assignee_kind: 'assignment',
    assignee_id: 'assignment-codex-reviewer',
    activation: { kind: 'immediate', producer_work_id: null },
  },
  {
    id: 'work-3',
    purpose: 'Write the export’s release note',
    parent_id: null,
    blocked_by: ['work-1'],
    assignee_kind: 'human',
    assignee_id: 'luis',
    activation: { kind: 'dependencies_satisfied', producer_work_id: null },
  },
  {
    id: 'work-4',
    purpose: 'Measure render time on large reports',
    parent_id: null,
    blocked_by: [],
    assignee_kind: 'unassigned',
    assignee_id: null,
    activation: { kind: 'immediate', producer_work_id: null },
  },
]

const assumptions: WorkPlan['assumptions'] = [
  { id: 'a1', text: 'Reports stay under 20 MB.' },
  { id: 'a2', text: 'The PDF renderer keeps running on its current host.' },
]

const decisions: WorkPlan['decisions'] = [
  {
    decision_id: 'd1',
    question: 'Ship the retry before the report pane’s review is done?',
    decider_id: 'davide',
    state: 'proposed',
    choices: [
      { key: 'ship', label: 'Ship it now' },
      { key: 'wait', label: 'Wait for the review' },
    ],
    selected_choice: null,
    expires_at: inHours(2),
  },
  {
    decision_id: 'd2',
    question: 'How many times may a failed render be retried?',
    decider_id: 'luis',
    state: 'accepted',
    choices: [
      { key: '2', label: 'Twice' },
      { key: '3', label: 'Three times' },
    ],
    selected_choice: '3',
    expires_at: inHours(-20),
  },
]

/** The lead's plan for it: `state` as the page asks (`proposed=1`, `superseded=1`), else accepted. */
export const plan = (state: WorkPlan['state']): WorkPlan => ({
  plan_id: 'plan-1',
  revision: 2,
  mission_revision: 3,
  state,
  goal_id: goal.id,
  next_checkpoint: { label: 'A retry candidate passes its review', item_id: 'work-1-review' },
  items,
  assumptions,
  decisions,
})

/** `two=1`: a second goal in the same project, with its own plan, proposed and smaller. */
export const secondGoal: Goal = {
  id: '00000000-0000-4000-8000-0000000000b2',
  projectId: PROJECT,
  title: 'The report pane says what an export is doing',
  revision: 1,
  authorityEpoch: 1,
  status: 'ready',
  outcome: 'Whoever exports a report sees it start, wait and finish, without asking anyone.',
  criteria: [
    { id: 'c1', description: 'Each state of an export is shown once', required: true, verification: 'review' },
  ],
  stateRevision: 1,
}

export const secondPlan: WorkPlan = {
  plan_id: 'plan-2',
  revision: 1,
  mission_revision: 3,
  state: 'proposed',
  goal_id: secondGoal.id,
  next_checkpoint: { label: 'The pane’s states agreed with Luis', item_id: null },
  items: [
    {
      id: 'pane-states',
      purpose: 'Draw the export’s states in the pane',
      parent_id: null,
      blocked_by: [],
      assignee_kind: 'human',
      assignee_id: 'luis',
      activation: { kind: 'immediate', producer_work_id: null },
    },
    {
      id: 'pane-copy',
      purpose: 'Word each state',
      parent_id: null,
      blocked_by: ['pane-states'],
      assignee_kind: 'unassigned',
      assignee_id: null,
      activation: { kind: 'dependencies_satisfied', producer_work_id: null },
    },
  ],
  assumptions: [],
  decisions: [],
}

/** `goals=6`: four more goals beside the first two, each with a small plan, to see the goals' rail scroll. */
const MORE = [
  ['Exports keep the report’s fonts', 'Fonts embedded or substituted, and said which'],
  ['Large reports stay under a minute', 'Render time measured and kept'],
  ['Every export can be shared by link', 'A link that opens the exact export'],
  ['Failed exports explain themselves', 'A reason a person can act on'],
] as const

export const moreGoals: Goal[] = MORE.map(([title, outcome], i) => ({
  id: `00000000-0000-4000-8000-0000000000c${String(i)}`,
  projectId: PROJECT,
  title,
  revision: 1,
  authorityEpoch: 1,
  status: i === 1 ? 'running' : 'ready',
  outcome,
  criteria: [],
  stateRevision: 1,
}))

export const morePlans: WorkPlan[] = moreGoals.map((g, i) => ({
  plan_id: `plan-more-${String(i)}`,
  revision: 1,
  mission_revision: 3,
  state: 'accepted',
  goal_id: g.id,
  next_checkpoint: { label: `${g.title}: a first candidate`, item_id: null },
  items: [
    {
      id: `more-${String(i)}-a`,
      purpose: `Draft: ${g.outcome}`,
      parent_id: null,
      blocked_by: [],
      assignee_kind: i % 2 === 0 ? 'human' : 'unassigned',
      assignee_id: i % 2 === 0 ? 'luis' : null,
      activation: { kind: 'immediate', producer_work_id: null },
    },
  ],
  assumptions: [],
  decisions: [],
}))

/** `many=1`: eight more tasks on the first plan, after the retry or free to take, to see a lane fill and fold. */
export const manyTasks = (p: WorkPlan): WorkPlan => ({
  ...p,
  items: [
    ...p.items,
    ...[
      'Cover the retry in the export tests',
      'Log each retry with its cause',
      'Show a retry in the report pane',
      'Cap retries per report',
      'Document the retry for support',
      'Alert when retries pile up',
      'Measure retries per day',
      'Remove the old export path',
    ].map((purpose, i) => ({
      id: `many-${String(i)}`,
      purpose,
      parent_id: null,
      blocked_by: i % 3 === 2 ? [] : ['work-1'],
      assignee_kind: i % 3 === 2 ? ('unassigned' as const) : ('human' as const),
      assignee_id: i % 3 === 2 ? null : 'luis',
      activation: { kind: 'dependencies_satisfied' as const, producer_work_id: null },
    })),
  ],
})
