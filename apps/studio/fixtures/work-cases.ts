// The plan page's scenarios (`case=`, fixtures/work.tsx): each the first goal's view changed one way, to show one of
// WBC-01's acceptance cases on the real board. Simulated, like the rest of the page: every fact is written here.
import type { GoalView, ItemView, PlanItem } from '../src/features/work/planning/board-view.ts'
import { fixtureParts, type Case, type Viewer } from './work-data.ts'

const { planned, projection, version, observation, claude, sophia, commands, action, ask, openResult } = fixtureParts

type Change = (g: GoalView, viewer: Viewer) => GoalView

/** One item's projection changed. */
const update = (g: GoalView, workId: string, change: (v: ItemView) => Partial<ItemView>): GoalView => ({
  ...g,
  items: g.items.map((v) => (v.work_id === workId ? { ...v, ...change(v) } : v)),
})

/** Items added to the plan in force, each with its projection. */
const added = (g: GoalView, entries: [PlanItem, ItemView][]): GoalView =>
  g.current_plan
    ? {
        ...g,
        current_plan: { ...g.current_plan, items: [...g.current_plan.items, ...entries.map(([i]) => i)] },
        items: [...g.items, ...entries.map(([, v]) => v)],
      }
    : g

const reviewer = claude('claude-reviewer', 'reviewer', 1)

/** UI-04: the review found defects. The review itself is complete; the retry needs changes. */
const defects: Change = (g, viewer) =>
  update(
    update(g, 'work-1', () => ({
      lifecycle: 'changes_required',
      waiting_on: [],
      candidates: [version('retry', 'retry-v1', 'current', 900, 'a')],
      review: {
        state: 'changes_required',
        candidate_version_ref: 'retry-v1',
        evidence_refs: ['fixture-review-findings'],
      },
      available_actions: [...commands(viewer, true), openResult, ask],
    })),
    'work-1-review',
    () => ({
      lifecycle: 'complete',
      assignment: reviewer,
      candidates: [version('review-findings', 'findings-v1', 'current', 300, 'b')],
      completion: {
        policy_ref: 'fixture-structural-review',
        status: 'satisfied',
        evidence_refs: ['fixture-review-findings'],
      },
      available_actions: [openResult, ask],
    }),
  )

/** UI-05: a check passed for retry-v1; the current candidate is retry-v2, unchecked. */
const stalePass: Change = (g, viewer) =>
  update(g, 'work-1', () => ({
    lifecycle: 'ready_for_review',
    waiting_on: [],
    candidates: [version('retry', 'retry-v2', 'current', 120, 'c'), version('retry', 'retry-v1', 'previous', 900, 'a')],
    review: { state: 'passed', candidate_version_ref: 'retry-v1', evidence_refs: ['fixture-check-v1'] },
    available_actions: [
      ...commands(viewer, true),
      openResult,
      action('review_candidate', 'allowed', 'You can review it.'),
      ask,
    ],
  }))

/** UI-06: stopped, cancelled and failed work under Closed work; the failure's repair still active. */
const closed: Change = (g) =>
  added(
    update(
      update(g, 'work-2', () => ({
        lifecycle: 'stopped',
        closed_reason: 'By Davide: the pane’s spec changed.',
        available_actions: [ask],
      })),
      'work-4',
      () => ({ lifecycle: 'cancelled', closed_reason: 'Measuring waits for the new renderer.' }),
    ),
    [
      [
        planned('work-5', 'Render the large-report sample', { assignee_id: 'assignment-claude-reviewer' }),
        projection('work-5', {
          lifecycle: 'failed',
          closed_reason: 'The renderer crashed on a 40 MB report.',
          available_actions: [ask],
        }),
      ],
      [
        planned('work-5-repair', 'Repair the large-report render', { assignee_id: 'assignment-claude-reviewer' }),
        projection('work-5-repair', { lifecycle: 'running', assignment: reviewer, available_actions: [ask] }),
      ],
    ],
  )

/** UI-16: Sophia's own source reviewer: itself, with no subscription behind it. */
const native: Change = (g, viewer) => {
  const within = 'Within the project’s mandate for Sophia’s reviewer.'
  const controls =
    viewer === 'mara'
      ? [
          action('hold', 'denied', 'Viewers ask and read; they don’t retask.'),
          action('stop', 'denied', 'Viewers ask and read; they don’t retask.'),
        ]
      : [
          action('hold', 'allowed', 'Holds at its next safe point; resumes from its saved state.', within),
          action('stop', 'allowed', 'Stops this review.', within),
        ]
  return added(g, [
    [
      planned('work-sources', 'Review the export’s sources', {
        assignee_id: sophia.assignment_id,
        recipe_ref: 'sophia-source-review-v1',
      }),
      projection('work-sources', {
        lifecycle: 'ready_for_review',
        assignment: sophia,
        activity: observation('Submitted the review findings.', 40, sophia),
        candidates: [version('source-review', 'source-review-v1', 'current', 40, 'd')],
        review: { state: 'pending', candidate_version_ref: 'source-review-v1', evidence_refs: [] },
        available_actions: [
          ...controls,
          openResult,
          action('ask_sophia', 'unavailable', 'The task’s conversation isn’t connected in this slice.'),
        ],
      }),
    ],
  ])
}

/** UI-02: the same session's next attempt, at a new generation: the last report is the earlier attempt's. */
const attempts: Change = (g) =>
  update(g, 'work-1', (v) => ({
    assignment: { ...claude('claude-worker', 'worker', 4), assignment_id: 'assignment-claude-worker' },
    activity: v.activity,
  }))

/** UI-03: a replacement proposed beside the plan in force. */
const replan: Change = (g) => {
  const current = g.current_plan
  if (!current) return g
  const items = [
    ...current.items
      .filter((i) => i.id !== 'work-4')
      .map((i) => (i.id === 'work-3' ? { ...i, blocked_by: ['work-1', 'work-2'] } : i)),
    planned('work-6', 'Retry renders on a second host', { assignee_kind: 'unassigned', assignee_id: null }),
  ]
  // A second replacement beside it (PR #76 review, P2): the review pane's work dropped instead.
  const other = [...current.items.filter((i) => i.id !== 'work-2'), planned('work-7', 'Retry from the report pane', {})]
  return {
    ...g,
    proposed_plans: [
      { ...current, revision: 3, state: 'proposed', decision_ref: null, items },
      { ...current, plan_id: 'plan-1-alt', revision: 4, state: 'proposed', decision_ref: null, items: other },
    ],
  }
}

/** UI-14: Davide's choice is recorded; the lead hasn't taken it into the plan yet. */
const reacting: Change = (g) => ({
  ...g,
  decisions: g.decisions.map((d) =>
    d.decision_id === 'd1'
      ? {
          ...d,
          state: 'accepted',
          selected_choice: 'ship',
          choice_receipt_id: 'fixture-choice-d1',
          plan_reaction: 'pending',
        }
      : d,
  ),
})

/** UI-01: a loop of parents and a loop of blockers. */
const cycle: Change = (g) =>
  added(g, [
    [
      planned('loop-a', 'Loop A', { parent_id: 'loop-b', assignee_kind: 'unassigned', assignee_id: null }),
      projection('loop-a'),
    ],
    [
      planned('loop-b', 'Loop B', { parent_id: 'loop-a', assignee_kind: 'unassigned', assignee_id: null }),
      projection('loop-b'),
    ],
    [
      planned('wait-a', 'Wait A', { blocked_by: ['wait-b'], assignee_kind: 'unassigned', assignee_id: null }),
      projection('wait-a'),
    ],
    [
      planned('wait-b', 'Wait B', { blocked_by: ['wait-a'], assignee_kind: 'unassigned', assignee_id: null }),
      projection('wait-b'),
    ],
  ])

/** UI-01: an item whose parent isn't in the plan. */
const orphan: Change = (g) =>
  added(g, [
    [
      planned('stray', 'Check the stray export', { parent_id: 'gone', assignee_kind: 'unassigned', assignee_id: null }),
      projection('stray'),
    ],
  ])

/** UI-01: three levels: the retry, its review, and the review's notes. */
const deep: Change = (g) =>
  added(g, [
    [
      planned('work-1-review-notes', 'Note what the review found', {
        parent_id: 'work-1-review',
        assignee_kind: 'human',
        assignee_id: 'luis',
      }),
      projection('work-1-review-notes'),
    ],
  ])

/** UI-17: a healthy long tool call whose last report is 9 minutes old; another task's connection lost. */
const oldReport: Change = (g) =>
  update(
    update(g, 'work-2', (v) => ({
      activity: v.activity
        ? { ...v.activity, observed_at: new Date(Date.parse(v.activity.observed_at) - 534_000).toISOString() }
        : null,
    })),
    'work-1',
    (v) => ({ activity: v.activity ? { ...v.activity, connection: 'offline' } : null }),
  )

/** UI-18: v2 of the retry failed its revision; v1 stays usable while the next attempt runs. */
const revisionFailed: Change = (g, viewer) =>
  update(g, 'work-1', (v) => ({
    lifecycle: 'running',
    waiting_on: [],
    activity: v.assignment ? observation('Retrying the render after v2 failed its checks', 30, v.assignment) : null,
    candidates: [
      version('retry', 'retry-v2', 'withdrawn', 200, 'c'),
      version('retry', 'retry-v1', 'previous', 900, 'a'),
    ],
    available_actions: [...commands(viewer, true), openResult, ask],
  }))

/** UI-07: work on Luis's resource waits on Davide's decision and on Luis's own native permission. */
const luisResource: Change = (g, viewer) => {
  const luisWorker = {
    ...claude('luis-worker', 'worker', 1),
    executor: {
      kind: 'owner_native' as const,
      display_name: 'Luis’s Claude Code',
      role: 'worker',
      owner_id: 'luis',
      resource_id: 'luis-claude',
    },
  }
  const within = viewer === 'davide' ? 'Within Luis’s contribution to this project.' : null
  const controls =
    viewer === 'mara' ? commands('mara', true) : [action('guidance', 'allowed', 'Delivered to its session.', within)]
  return added(g, [
    [
      planned('work-config', 'Write the export’s retry config', { assignee_id: luisWorker.assignment_id }),
      projection('work-config', {
        lifecycle: 'waiting',
        assignment: luisWorker,
        waiting_on: [
          {
            kind: 'product_decision',
            reference_id: 'd3',
            respondent_id: 'davide',
            detail: 'Choose the retry limit before it writes the config.',
            state: 'pending',
          },
          {
            kind: 'native_permission',
            reference_id: 'action-2',
            respondent_id: 'luis',
            detail: 'Allow editing config/export.json',
            state: 'pending',
          },
        ],
        activity: observation('Asked to edit config/export.json', 15, luisWorker),
        available_actions: [...controls, ask],
      }),
    ],
  ])
}

/** Review P2: work observed for the goal that its plan in force doesn't hold, said rather than hidden. */
const outside: Change = (g) => ({
  ...g,
  items: [
    ...g.items,
    projection('work-old', {
      lifecycle: 'running',
      assignment: { ...claude('claude-reviewer', 'reviewer', 2), assignment_id: 'assignment-work-old' },
    }),
  ],
})

/**
 * Codex F-002: a task whose state is unknown, and one running with no assignment observed. Both stay Active, said not
 * observed, and offer nothing to send, though the view allows Stop; reading and asking stay.
 */
const unobserved: Change = (g) =>
  update(
    update(g, 'work-2', () => ({ lifecycle: 'unknown' })),
    'work-1',
    () => ({ lifecycle: 'running', assignment: null, waiting_on: [] }),
  )

const CHANGES: Readonly<Record<Case, Change>> = {
  defects,
  'stale-pass': stalePass,
  closed,
  native,
  attempts,
  replan,
  reacting,
  cycle,
  orphan,
  deep,
  'old-report': oldReport,
  'revision-failed': revisionFailed,
  'luis-resource': luisResource,
  outside,
  unobserved,
}

/** The first goal's view in a scenario; as it is without one. */
export const inCase = (c: Case | null, g: GoalView, viewer: Viewer): GoalView => (c ? CHANGES[c](g, viewer) : g)
