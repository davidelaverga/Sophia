// The plan page's scenarios (`case=`, fixtures/work.tsx): each the first goal's view changed one way, to show one of
// WBC-01's acceptance cases on the real board. Simulated, like the rest of the page: every fact is written here.
import type { BoardDecision, GoalView, ItemView, PlanItem } from '../src/features/work/planning/board-view.ts'
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

/**
 * Codex F-009: complete by its policy, with evidence, and a review passed for retry-v2; but retry-v2 and retry-v3 both
 * claim to be current, so the review can't be matched to the version it holds now.
 */
const twoCurrent: Change = (g, viewer) =>
  update(g, 'work-1', () => ({
    lifecycle: 'complete',
    waiting_on: [],
    completion: { policy_ref: 'fixture-policy-work-1', status: 'satisfied', evidence_refs: ['fixture-check-v2'] },
    candidates: [version('retry', 'retry-v3', 'current', 60, 'd'), version('retry', 'retry-v2', 'current', 120, 'c')],
    review: { state: 'passed', candidate_version_ref: 'retry-v2', evidence_refs: ['fixture-check-v2'] },
    available_actions: [...commands(viewer, true), ask],
  }))

/**
 * Codex F-020: three tasks complete by their policy, with evidence, each with a check bound to the version it holds
 * now that hasn't passed: pending (the retry), found changes needed (the report pane), inconclusive (the release note).
 */
const unpassed: Change = (g) => {
  const checked =
    (
      workId: string,
      [source, id, hash]: [string, string, string],
      state: ItemView['review']['state'],
    ): ((g: GoalView) => GoalView) =>
    (into) =>
      update(into, workId, () => ({
        lifecycle: 'complete',
        waiting_on: [],
        completion: { policy_ref: `fixture-policy-${workId}`, status: 'satisfied', evidence_refs: [`fixture-${id}`] },
        candidates: [version(source, id, 'current', 60, hash)],
        review: { state, candidate_version_ref: id, evidence_refs: state === 'pending' ? [] : [`fixture-check-${id}`] },
      }))
  return [
    checked('work-1', ['retry', 'retry-v1', 'a'], 'pending'),
    checked('work-2', ['review-pane', 'pane-v1', 'b'], 'changes_required'),
    checked('work-3', ['release-note', 'note-v1', 'c'], 'inconclusive'),
  ].reduce((into, change) => change(into), g)
}

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

/** A choice already made, for one plan at one revision, about one of its tasks. */
const madeFor = (
  [planId, revision]: [string, number],
  [id, workId, question, chosen, decider]: [string, string, string, string, string],
): BoardDecision => ({
  decision_id: id,
  revision: 1,
  work_id: workId,
  plan_id: planId,
  plan_revision: revision,
  candidate_version_ref: null,
  question,
  decider_id: decider,
  choices: [
    { key: 'yes', label: chosen },
    { key: 'no', label: 'Not yet' },
  ],
  expires_at: '2026-10-03T20:00:00Z',
  state: 'accepted',
  selected_choice: 'yes',
  choice_receipt_id: `fixture-choice-${id}`,
  plan_reaction: 'recorded',
})

/**
 * Codex F-013: as `replan`, with a choice already made for each replacement, neither in force: one for the same plan's
 * r3, one for plan-1-alt r4. The plan in force (r2) keeps only its own history.
 */
const replanDecided: Change = (g, viewer) => {
  const r = replan(g, viewer)
  const made = [
    madeFor(['plan-1', 3], ['d-r3', 'work-6', 'Retry renders on a second host?', 'Use the second host', 'davide']),
    madeFor(
      ['plan-1-alt', 4],
      ['d-alt', 'work-7', 'Retry from the report pane only?', 'Use the alternative route', 'luis'],
    ),
  ]
  return { ...r, decisions: [...r.decisions, ...made] }
}

/**
 * Codex F-015: as `replan-decided`, but neither replacement has taken its choice in yet: r3's is pending, plan-1-alt
 * r4's unknown. The plan in force (r2) isn't the one updating.
 */
const replanUpdating: Change = (g, viewer) => {
  const r = replanDecided(g, viewer)
  const reaction: Record<string, BoardDecision['plan_reaction']> = { 'd-r3': 'pending', 'd-alt': 'unknown' }
  return {
    ...r,
    decisions: r.decisions.map((d) => ({ ...d, plan_reaction: reaction[d.decision_id] ?? d.plan_reaction })),
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

/**
 * Codex F-027: two tasks whose ids hold the separator the page's keys once joined with: `x|y`, done by assignment
 * `z`, and `x`, by assignment `y|z`, at the same generation, attempt and session. Neither's draft nor command is the
 * other's.
 */
const pipes: Change = (g, viewer) => {
  const by = (assignment_id: string) => ({
    ...claude('pipes', 'builder', 1),
    assignment_id,
    attempt_id: 'attempt-pipes',
    native_session_id: 'session-pipes',
  })
  const task = (id: string, purpose: string, assignment_id: string): [PlanItem, ItemView] => [
    planned(id, purpose, { assignee_id: assignment_id }),
    projection(id, {
      lifecycle: 'running',
      assignment: by(assignment_id),
      activity: observation('Working through the export.', 30, by(assignment_id)),
      available_actions: commands(viewer, true),
    }),
  ]
  return added(g, [task('x|y', 'Check the x|y export', 'z'), task('x', 'Check the x export', 'y|z')])
}

/**
 * Codex F-029: Davide's decisions bound to plans other than the one shown. plan-1-alt r4 keeps work-2's id for a new
 * task, and one decision is bound to it; another is bound to plan-1 r9, a revision held nowhere. Each names its task
 * from its own plan, or says which plan it is bound to; never from the plan shown. d1 is bound to the plan shown.
 */
const rebound: Change = (g) => {
  const current = g.current_plan
  const d1 = g.decisions.find((d) => d.decision_id === 'd1')
  if (!current || !d1) return g
  const items = current.items.map((i) =>
    i.id === 'work-2' ? { ...i, purpose: 'Rebuild the report pane from its sources' } : i,
  )
  const bound = (id: string, planId: string, revision: number, workId: string): BoardDecision => ({
    ...d1,
    decision_id: id,
    revision: 1,
    work_id: workId,
    plan_id: planId,
    plan_revision: revision,
    question: `Go ahead with ${workId}?`,
  })
  return {
    ...g,
    proposed_plans: [{ ...current, plan_id: 'plan-1-alt', revision: 4, state: 'proposed', decision_ref: null, items }],
    decisions: [...g.decisions, bound('d-alt', 'plan-1-alt', 4, 'work-2'), bound('d-r9', 'plan-1', 9, 'work-1')],
  }
}

/** Codex F-028: a decision two of whose choices share a key, with different words: the view is refused. */
const sameKey: Change = (g) => ({
  ...g,
  decisions: g.decisions.map((d) =>
    d.decision_id === 'd1'
      ? {
          ...d,
          choices: [
            { key: 'same', label: 'Ship it now' },
            { key: 'same', label: 'Wait for the review' },
          ],
        }
      : d,
  ),
})

/** Codex F-032: d1 said accepted, naming none of its choices: the view is refused, never said as a choice made. */
const unchosen: Change = (g) => ({
  ...g,
  decisions: g.decisions.map((d) =>
    d.decision_id === 'd1' ? { ...d, state: 'accepted', selected_choice: null, plan_reaction: 'pending' } : d,
  ),
})

/** Codex F-035: d1 twice, at the same revision, the second about another task: the view is refused. */
const twiceAsked: Change = (g) => {
  const d1 = g.decisions.find((d) => d.decision_id === 'd1')
  return d1 ? { ...g, decisions: [...g.decisions, { ...d1, work_id: 'work-2', question: 'Hold the report pane?' }] } : g
}

/** Codex F-036: d1 still proposed, yet naming a choice: the view is refused. */
const chosenEarly: Change = (g) => ({
  ...g,
  decisions: g.decisions.map((d) => (d.decision_id === 'd1' ? { ...d, selected_choice: 'ship' } : d)),
})

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
  'two-current': twoCurrent,
  'replan-decided': replanDecided,
  'replan-updating': replanUpdating,
  unpassed,
  pipes,
  rebound,
  'same-key': sameKey,
  unchosen,
  'twice-asked': twiceAsked,
  'chosen-early': chosenEarly,
}

/** The first goal's view in a scenario; as it is without one. */
export const inCase = (c: Case | null, g: GoalView, viewer: Viewer): GoalView => (c ? CHANGES[c](g, viewer) : g)
