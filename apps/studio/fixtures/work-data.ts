// Labelled fixture data for the plan checks (e2e/work.spec.ts), written as the proposed `sophia.work.board.v1` view
// (src/features/work/planning/board-view.ts): each goal's plan as `sophia.work.plan.v2` and each item's projection,
// with its exact assignment, generation, attempt, waits, candidates, review, completion and what each viewer may do.
// Every fact is written here by hand, per viewer; nothing is derived from a session's work id, an account's owner or a
// role. Simulated: no lead, tool, host or service was read, and the page says so.
//
// The v1 plan this page showed before WBC-01 was converted once, by hand, into these v2 definitions (its documented
// conversion is in docs/progress/WBC-01.md): `outcome: checked` became a completion satisfied with evidence,
// `outcome: finished` became ready for review, and each session's work became an explicit assignment.
import type { Goal } from '@sophia/contracts'
import type {
  Assignment,
  BoardDecision,
  GoalView,
  ItemAction,
  ItemView,
  PlanItem,
  WorkPlan,
} from '../src/features/work/planning/board-view.ts'
import { PROJECT } from './data.ts'
import { NOW, people as owners } from './resources-data.ts'

const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()
const before = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

/** Who can look: Davide and Luis build; Mara reads (a project viewer). */
export type Viewer = 'davide' | 'luis' | 'mara'
export const people = { ...owners, mara: { id: 'mara', name: 'Mara', avatarUrl: null } }

/** Every scenario the page can show (`case=`), each the main plan changed in one way. */
export const CASES = [
  'defects',
  'stale-pass',
  'closed',
  'native',
  'attempts',
  'replan',
  'reacting',
  'cycle',
  'orphan',
  'deep',
  'old-report',
  'revision-failed',
  'luis-resource',
  'outside',
  'unobserved',
  'two-current',
  'replan-decided',
] as const
export type Case = (typeof CASES)[number]

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

/** A plan item with its references, as the lead's plan carries them. */
const planned = (id: string, purpose: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id,
  purpose,
  deliverable_ref: `fixture-deliverable-${id}`,
  criteria_ref: `fixture-criteria-${id}`,
  parent_id: null,
  blocked_by: [],
  assignee_kind: 'assignment',
  assignee_id: `assignment-${id}`,
  source_scope_ref: 'fixture-manifest-1',
  review_policy_ref: 'fixture-review-policy',
  recipe_ref: 'fixture-recipe-build',
  activation: { kind: 'immediate', producer_work_id: null },
  ...over,
})

const byHand = (who: 'luis' | 'davide') => ({ assignee_kind: 'human' as const, assignee_id: who })

const items: PlanItem[] = [
  planned('work-0a', 'Reproduce the failed render', byHand('luis')),
  planned('work-0b', 'Write the retry’s failing test', byHand('luis')),
  planned('work-1', 'Implement the PDF retry', { assignee_id: 'assignment-claude-worker' }),
  planned('work-1-review', 'Review the retry’s candidate', {
    parent_id: 'work-1',
    assignee_id: 'assignment-claude-reviewer',
    activation: { kind: 'candidate_ready', producer_work_id: 'work-1' },
  }),
  planned('work-2', 'Review the report pane', { assignee_id: 'assignment-codex-reviewer' }),
  planned('work-3', 'Write the export’s release note', {
    ...byHand('luis'),
    blocked_by: ['work-1'],
    activation: { kind: 'dependencies_satisfied', producer_work_id: null },
  }),
  planned('work-4', 'Measure render time on large reports', { assignee_kind: 'unassigned', assignee_id: null }),
]

/** The lead's plan for the first goal, accepted at revision 2. */
export const plan: WorkPlan = {
  schema_version: 'sophia.work.plan.v2',
  plan_id: 'plan-1',
  project_id: PROJECT,
  goal_id: goal.id,
  goal_revision: goal.revision,
  criteria_ref: 'fixture-goal-criteria-3',
  revision: 2,
  mission_revision: 3,
  source_manifest_ref: 'fixture-manifest-1',
  state: 'accepted',
  decision_ref: 'fixture-plan-acceptance-2',
  assumptions: [
    { id: 'a1', text: 'Reports stay under 20 MB.', status: 'unresolved', evidence_refs: [] },
    {
      id: 'a2',
      text: 'The PDF renderer keeps running on its current host.',
      status: 'supported',
      evidence_refs: ['fixture-host-check'],
    },
  ],
  items,
}

// Executors and assignments, exactly as the service would admit them.

const claude = (session: string, role: string, generation: number): Assignment => ({
  assignment_id: `assignment-${session}`,
  generation,
  attempt_id: `attempt-${session}-${String(generation)}`,
  native_session_id: session,
  executor: {
    kind: 'owner_native',
    display_name: 'Davide’s Claude Code',
    role,
    owner_id: 'davide',
    resource_id: 'davide-claude',
  },
  observation_state: 'observed',
})

const codex: Assignment = {
  assignment_id: 'assignment-codex-reviewer',
  generation: 1,
  attempt_id: 'attempt-codex-reviewer-1',
  native_session_id: 'codex-reviewer',
  executor: {
    kind: 'owner_native',
    display_name: 'Davide’s Codex',
    role: 'reviewer',
    owner_id: 'davide',
    resource_id: 'davide-codex',
  },
  observation_state: 'observed',
}

const luisByHand = (id: string, role = 'author'): Assignment => ({
  assignment_id: `assignment-luis-${id}`,
  generation: 1,
  attempt_id: null,
  native_session_id: null,
  executor: { kind: 'human', display_name: 'Luis', role, owner_id: 'luis', resource_id: null },
  observation_state: 'observed',
})

const sophia: Assignment = {
  assignment_id: 'assignment-sophia-sources',
  generation: 1,
  attempt_id: 'attempt-sophia-sources-1',
  native_session_id: null,
  executor: {
    kind: 'sophia_native',
    display_name: 'Sophia',
    role: 'Source reviewer',
    owner_id: null,
    resource_id: null,
  },
  observation_state: 'observed',
}

// What each viewer may do, as the service would decide it. The browser never derives these.

const action = (
  kind: ItemAction['kind'],
  availability: ItemAction['availability'],
  reason: string,
  boundary: string | null = null,
): ItemAction => ({
  kind,
  availability,
  reason,
  boundary,
})

const HOLD_SAYS =
  'Holds at its next safe point: its session stops there and resumes from where it was. Not a native pause.'
const MANDATE = 'Within Davide’s contribution to this project.'
const READ_ONLY = 'Viewers ask and read; they don’t retask.'

/** The commands on a session's work: its owner and a builder within his mandate may; a viewer reads. */
function commands(viewer: Viewer, guidance: boolean): ItemAction[] {
  if (viewer === 'mara')
    return [
      action('guidance', 'denied', READ_ONLY),
      action('hold', 'denied', READ_ONLY),
      action('stop', 'denied', READ_ONLY),
    ]
  const within = viewer === 'luis' ? MANDATE : null
  const guide = guidance
    ? action('guidance', 'allowed', 'Delivered to its session.', within)
    : action('guidance', 'unavailable', 'Codex’s route doesn’t take guidance yet.')
  return [
    guide,
    action('hold', 'allowed', HOLD_SAYS, within),
    action('stop', 'allowed', 'Stops this task; completed work is kept.', within),
  ]
}

const ask = action('ask_sophia', 'allowed', 'Asked in the project’s conversation.')
const openResult = action('open_result', 'allowed', 'A readable result exists.')

const observation = (said: string, ago: number, a: Assignment): NonNullable<ItemView['activity']> => ({
  observation_id: `obs-${a.assignment_id}-${String(ago)}`,
  attempt_id: a.attempt_id ?? 'none',
  assignment_generation: a.generation,
  said,
  observed_at: before(ago),
  connection: 'online',
})

/** A projection with nothing observed yet, changed where `over` says. */
export const projection = (workId: string, over: Partial<ItemView> = {}): ItemView => ({
  work_id: workId,
  lifecycle: 'planned',
  assignment: null,
  waiting_on: [],
  activity: null,
  candidates: [],
  review: { state: 'not_requested', candidate_version_ref: null, evidence_refs: [] },
  completion: { policy_ref: `fixture-policy-${workId}`, status: 'not_evaluated', evidence_refs: [] },
  closed_reason: null,
  available_actions: [],
  ...over,
})

const version = (
  source: string,
  id: string,
  state: 'current' | 'previous' | 'withdrawn',
  ago: number,
  hash: string,
) => ({
  source_id: source,
  version_id: id,
  sha256: hash.repeat(64).slice(0, 64),
  media_type: 'text/markdown',
  created_at: before(ago),
  state,
})

/** The first goal's items as observed now, by the viewer looking. */
export function views(viewer: Viewer): ItemView[] {
  const worker = claude('claude-worker', 'worker', 3)
  return [
    projection('work-0a', {
      lifecycle: 'complete',
      assignment: luisByHand('0a'),
      completion: { policy_ref: 'fixture-policy-work-0a', status: 'satisfied', evidence_refs: ['fixture-check-0a'] },
      available_actions: [ask],
    }),
    projection('work-0b', { lifecycle: 'ready_for_review', assignment: luisByHand('0b'), available_actions: [ask] }),
    projection('work-1', {
      lifecycle: 'waiting',
      assignment: worker,
      waiting_on: [
        {
          kind: 'native_permission',
          reference_id: 'action-1',
          respondent_id: 'davide',
          detail: 'Run a shell command: pnpm --filter @sophia/report test',
          state: 'pending',
        },
      ],
      activity: observation('Asked to run pnpm --filter @sophia/report test', 22, worker),
      available_actions: [...commands(viewer, true), ask],
    }),
    projection('work-1-review', { available_actions: [ask] }),
    projection('work-2', {
      lifecycle: 'running',
      assignment: codex,
      activity: observation('Reading ReportPane.tsx', 6, codex),
      available_actions: [...commands(viewer, false), ask],
    }),
    projection('work-3', { assignment: luisByHand('3'), available_actions: [ask] }),
    projection('work-4', { available_actions: [ask] }),
  ]
}

const decisions: BoardDecision[] = [
  {
    decision_id: 'd1',
    // Its own revision, apart from the plan's (2): an answer names this one.
    revision: 4,
    work_id: 'work-1',
    plan_id: 'plan-1',
    plan_revision: 2,
    candidate_version_ref: null,
    question: 'Ship the retry before the report pane’s review is done?',
    decider_id: 'davide',
    choices: [
      { key: 'ship', label: 'Ship it now' },
      { key: 'wait', label: 'Wait for the review' },
    ],
    expires_at: inHours(2),
    state: 'proposed',
    selected_choice: null,
    choice_receipt_id: null,
    plan_reaction: 'not_needed',
  },
  {
    decision_id: 'd2',
    revision: 1,
    work_id: 'work-1',
    plan_id: 'plan-1',
    plan_revision: 1,
    candidate_version_ref: null,
    question: 'How many times may a failed render be retried?',
    decider_id: 'luis',
    choices: [
      { key: '2', label: 'Twice' },
      { key: '3', label: 'Three times' },
    ],
    expires_at: inHours(-20),
    state: 'accepted',
    selected_choice: '3',
    choice_receipt_id: 'fixture-choice-d2',
    plan_reaction: 'recorded',
  },
]

/** The first goal's view: the accepted plan, its next checkpoint, its items as observed, its decisions. */
export const firstGoal = (viewer: Viewer): GoalView => ({
  goal_id: goal.id,
  current_plan: plan,
  proposed_plans: [],
  next_checkpoint: { label: 'A retry candidate passes its review', item_id: 'work-1-review' },
  items: views(viewer),
  decisions,
})

/** `unplanned=1`: a goal the lead hasn't planned yet: it keeps its row, its review, Hold and Stop. */
export const unplannedGoal: Goal = {
  id: '00000000-0000-4000-8000-0000000000c1',
  projectId: PROJECT,
  title: 'Exports keep their fonts',
  revision: 1,
  authorityEpoch: 1,
  status: 'running',
  outcome: 'An exported PDF uses the report’s own fonts.',
  criteria: [],
  stateRevision: 1,
}

/** `two=1`: a second goal in the same project, with a plan proposed and not accepted yet: read, never operated. */
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

export const secondView: GoalView = {
  goal_id: secondGoal.id,
  current_plan: null,
  proposed_plans: [
    {
      ...plan,
      plan_id: 'plan-2',
      goal_id: secondGoal.id,
      goal_revision: 1,
      criteria_ref: 'fixture-goal-criteria-b2',
      revision: 1,
      state: 'proposed',
      decision_ref: null,
      assumptions: [],
      items: [
        planned('pane-states', 'Draw the export’s states in the pane', byHand('luis')),
        planned('pane-copy', 'Word each state', {
          assignee_kind: 'unassigned',
          assignee_id: null,
          blocked_by: ['pane-states'],
          activation: { kind: 'dependencies_satisfied', producer_work_id: null },
        }),
      ],
    },
  ],
  next_checkpoint: { label: 'The pane’s states agreed with Luis', item_id: null },
  items: [],
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

export const moreViews: GoalView[] = moreGoals.map((g, i) => {
  const id = `more-${String(i)}-a`
  const human = i % 2 === 0
  return {
    goal_id: g.id,
    current_plan: {
      ...plan,
      plan_id: `plan-more-${String(i)}`,
      goal_id: g.id,
      goal_revision: 1,
      revision: 1,
      assumptions: [],
      items: [
        planned(id, `Draft: ${g.outcome}`, human ? byHand('luis') : { assignee_kind: 'unassigned', assignee_id: null }),
      ],
    },
    proposed_plans: [],
    next_checkpoint: { label: `${g.title}: a first candidate`, item_id: null },
    items: [projection(id, human ? { assignment: luisByHand(id) } : {})],
    decisions: [],
  }
})

const MANY = [
  'Cover the retry in the export tests',
  'Log each retry with its cause',
  'Show a retry in the report pane',
  'Cap retries per report',
  'Document the retry for support',
  'Alert when retries pile up',
  'Measure retries per day',
  'Remove the old export path',
]

/** `many=1`: eight more tasks on the first plan, after the retry or unassigned, to see a lane fill and fold. */
export function manyTasks(g: GoalView): GoalView {
  const extra = MANY.map((purpose, i) =>
    planned(`many-${String(i)}`, purpose, {
      ...(i % 3 === 2 ? { assignee_kind: 'unassigned' as const, assignee_id: null } : byHand('luis')),
      blocked_by: i % 3 === 2 ? [] : ['work-1'],
      activation: { kind: 'dependencies_satisfied', producer_work_id: null },
    }),
  )
  const current = g.current_plan
  if (!current) return g
  return {
    ...g,
    current_plan: { ...current, items: [...current.items, ...extra] },
    items: [
      ...g.items,
      ...extra.map((i) => projection(i.id, i.assignee_kind === 'human' ? { assignment: luisByHand(i.id) } : {})),
    ],
  }
}

export const fixtureParts = {
  planned,
  projection,
  version,
  observation,
  claude,
  sophia,
  luisByHand,
  commands,
  action,
  ask,
  openResult,
}
