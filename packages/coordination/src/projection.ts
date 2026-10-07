/**
 * The work board (sophia.work.board.v1) as one viewer may see it, projected from Sophia's own records (WBC-02 G5).
 * Pure and deterministic: the same facts give the same view, whatever order events arrived in; the snapshot cursor
 * is the project event cursor the facts were read at. It never schedules, and it never fills a future field with a
 * guess:
 *
 * - complete only when the review's policy is satisfied with evidence (a stored result); a review with adverse
 *   findings completes the review, never what it reviewed;
 * - a lost or unclear observation is unknown, never unassigned, never complete, and makes coverage partial;
 * - Held only once the native work settled; a requested Hold or Stop is said as requested;
 * - every action is allowed, denied or unavailable for this viewer, with its reason; guidance, Ask and review of a
 *   review stay unavailable in this slice.
 * @module @sophia/coordination/projection
 */
import type {
  WorkAction,
  WorkActivity,
  WorkAssignment,
  WorkBoardView,
  WorkCandidate,
  WorkDecision,
  WorkGoalView,
  WorkItemView,
  WorkPlanDefinition,
  WorkWait,
} from '@sophia/contracts'

/** A plan's stored state; the board shows only the accepted (current) and live proposed ones. */
export type PlanState = 'proposed' | 'accepted' | 'declined' | 'expired' | 'superseded' | 'withdrawn'
export type Lifecycle = WorkItemView['lifecycle']
export type GoalStatus = 'ready' | 'running' | 'holding' | 'held' | 'stopping' | 'stopped' | 'checking' | 'completed'
export type CommissionState = 'pending' | 'created' | 'outcome_unknown' | 'failed' | 'superseded'

/** A plan as stored: its immutable definition (the plan without its live state), its state and its decision. */
export interface PlanFact {
  readonly definition: Omit<WorkPlanDefinition, 'state' | 'decision_ref'>
  readonly state: PlanState
  readonly decisionId: string
  readonly createdAt: string
}

export interface DecisionFact {
  readonly id: string
  readonly revision: number
  readonly planId: string
  readonly planRevision: number
  readonly workId: string
  readonly question: string
  readonly deciderId: string
  readonly choices: ReadonlyArray<{ readonly key: string; readonly label: string }>
  readonly expiresAt: string
  readonly state: 'proposed' | 'accepted' | 'declined' | 'expired' | 'superseded'
  readonly selectedChoice: string | null
  readonly choiceReceiptId: string | null
}

export interface AttemptFact {
  readonly id: string
  readonly nativeSessionId: string | null
  readonly bindingState: 'created' | 'launching' | 'running' | 'idle' | 'stopping' | 'settled' | 'lost'
  readonly jobState: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'outcome_unknown'
  readonly jobReason: string | null
}

export interface ResultFact {
  readonly id: string
  readonly sourceId: string
  readonly sha256: string
  readonly state: 'current' | 'withdrawn'
  readonly createdAt: string
}

/** One admitted work item and everything live about it. */
export interface WorkFact {
  readonly workId: string
  readonly planId: string
  readonly closedReason: string | null
  readonly goal: { readonly status: GoalStatus; readonly stateRevision: number }
  readonly assignment: { readonly id: string; readonly generation: number } | null
  readonly commission: { readonly state: CommissionState; readonly reason: string | null }
  readonly attempt: AttemptFact | null
  readonly results: readonly ResultFact[]
  /** A delivery to Paperclip whose outcome is not known yet (it is being reconciled). */
  readonly deliveryUnknown: boolean
  /**
   * The latest control Paperclip definitely refused (its operation and the plugin's code), sent again until it is
   * taken or a later control supersedes it; null when none is refused (Codex on #107).
   */
  readonly controlRefused: { readonly op: string; readonly code: string | null } | null
  /**
   * Why a run of the work was turned away for a reason that passes without any control (source review disabled, no
   * runtime carrying the reviewer, spending closed): Sophia wakes the reviewer again once it has. Null when nothing is
   * owed (Codex on #107).
   */
  readonly wakeOwed: 'not_enrolled' | 'runtime_unavailable' | 'spend_closed' | null
  /** When anything about the work last changed. */
  readonly updatedAt: string
}

export interface BoardFacts {
  readonly projectId: string
  readonly cursor: string
  readonly now: string
  readonly viewer: { readonly id: string; readonly canEdit: boolean }
  readonly plans: readonly PlanFact[]
  readonly decisions: readonly DecisionFact[]
  readonly work: readonly WorkFact[]
}

export const REVIEW_POLICY = 'policy:source-review-structural-v1'
const EXECUTOR = {
  kind: 'sophia_native',
  display_name: 'Sophia',
  role: 'Source reviewer',
  owner_id: null,
  resource_id: null,
} as const
const MANDATE = "Shared task control within the project's mandate."
const VIEWER_ONLY = 'Read-only members can inspect this work, not retask it.'
const MAX_PROPOSED = 3

const isExpired = (d: DecisionFact, now: string): boolean =>
  d.state === 'proposed' && Date.parse(d.expiresAt) <= Date.parse(now)

/** The newest result still served, if any. */
export function currentResult(work: WorkFact): ResultFact | null {
  const current = work.results.filter((r) => r.state === 'current')
  return current.reduce<ResultFact | null>(
    (best, r) => (best === null || r.createdAt > best.createdAt ? r : best),
    null,
  )
}

/** What the work's records say it is now; see the module header for the rules. */
export function lifecycleOf(work: WorkFact): Lifecycle {
  if (work.commission.state === 'failed') return 'failed'
  if (currentResult(work) !== null && work.goal.status === 'completed') return 'complete'
  if (work.results.some((r) => r.state === 'withdrawn')) return 'cancelled'
  if (work.goal.status === 'stopped') return 'stopped'
  if (work.goal.status === 'held') return 'held'
  if (work.closedReason !== null) return work.commission.state === 'superseded' ? 'stopped' : 'failed'
  return attemptLifecycle(work.attempt)
}

const JOB_LIFECYCLE: Readonly<Record<AttemptFact['jobState'], Lifecycle>> = {
  pending: 'queued',
  running: 'running',
  succeeded: 'running',
  outcome_unknown: 'unknown',
  failed: 'failed',
  cancelled: 'failed',
}

const attemptLifecycle = (attempt: AttemptFact | null): Lifecycle =>
  attempt === null ? 'queued' : JOB_LIFECYCLE[attempt.jobState]

const CLOSED: ReadonlySet<Lifecycle> = new Set(['stopped', 'cancelled', 'failed', 'superseded'])

function closedReason(work: WorkFact, lifecycle: Lifecycle): string | null {
  if (!CLOSED.has(lifecycle)) return null
  if (lifecycle === 'cancelled') return 'Its result was withdrawn with an input.'
  if (lifecycle === 'stopped') return work.closedReason ?? 'Stopped. Completed work is kept.'
  if (work.commission.state === 'failed')
    return work.closedReason ?? `Paperclip refused the commission: ${work.commission.reason ?? 'no reason given'}`
  return work.closedReason ?? work.attempt?.jobReason ?? 'The review ended without a result.'
}

function observationState(work: WorkFact): WorkAssignment['observation_state'] {
  if (work.attempt?.bindingState === 'lost') return 'offline'
  if (work.commission.state === 'outcome_unknown' || work.attempt?.jobState === 'outcome_unknown') return 'unknown'
  return 'observed'
}

function assignmentOf(work: WorkFact): WorkAssignment | null {
  if (work.assignment === null) return null
  return {
    assignment_id: work.assignment.id,
    generation: work.assignment.generation,
    attempt_id: work.attempt?.id ?? null,
    native_session_id: work.attempt?.nativeSessionId ?? null,
    executor: { ...EXECUTOR },
    observation_state: observationState(work),
  }
}

const CONTROL_SAID: Readonly<Record<string, string>> = {
  hold: 'Hold',
  resume: 'Resume',
  stop: 'Stop',
  complete: 'completion',
  fail: 'failure',
}
const REFUSAL_CODE = /^[a-z][a-z0-9_]{0,63}$/

const OWED: Readonly<
  Record<
    NonNullable<WorkFact['wakeOwed']>,
    { readonly kind: WorkWait['kind']; readonly why: string; readonly until: string }
  >
> = {
  not_enrolled: {
    kind: 'product_decision',
    why: 'source review is not enabled for this project',
    until: 'it is enabled again',
  },
  runtime_unavailable: {
    kind: 'connection',
    why: 'no Sophia runtime carries the source reviewer',
    until: 'one does',
  },
  spend_closed: { kind: 'capacity', why: 'spending is closed for this project', until: 'it is open again' },
}
const STARTABLE: ReadonlySet<GoalStatus> = new Set<GoalStatus>(['ready', 'running'])

function waitsOf(work: WorkFact): WorkWait[] {
  return [commissionWait(work), owedWait(work), refusedWait(work)].filter((w): w is WorkWait => w !== null)
}

function commissionWait(work: WorkFact): WorkWait | null {
  if (work.attempt !== null || work.closedReason !== null) return null
  if (work.commission.state !== 'pending' && work.commission.state !== 'outcome_unknown') return null
  const unknown = work.commission.state === 'outcome_unknown'
  return {
    kind: 'external',
    reference_id: `commission:${work.workId}`,
    respondent_id: null,
    detail: unknown
      ? 'Checking whether Paperclip took the commission.'
      : 'Waiting for Paperclip to take the commission.',
    state: unknown ? 'unknown' : 'pending',
  }
}

// A run turned away for a reason that passes: nothing in Paperclip asks again, so Sophia wakes the reviewer once the
// reason is gone (Codex on #107). Shown while the work could still start.
function owedWait(work: WorkFact): WorkWait | null {
  if (work.wakeOwed === null || work.attempt !== null || work.closedReason !== null) return null
  if (!STARTABLE.has(work.goal.status)) return null
  const owed = OWED[work.wakeOwed]
  return {
    kind: owed.kind,
    reference_id: `wake:${work.workId}`,
    respondent_id: null,
    detail: `Paperclip's run could not start the review: ${owed.why}. Sophia wakes the reviewer again once ${owed.until}.`,
    state: 'pending',
  }
}

// A control Paperclip refused changed nothing there: its issue does not show it yet, and Sophia sends it again until
// Paperclip takes it (Codex on #107). Sophia's own state of the work is as the rest of the item says. The code is
// Paperclip's answer, shown only when it is a plain code.
function refusedWait(work: WorkFact): WorkWait | null {
  if (work.controlRefused === null) return null
  const what = CONTROL_SAID[work.controlRefused.op] ?? 'control'
  const { code } = work.controlRefused
  const named = code !== null && REFUSAL_CODE.test(code) ? ` (${code})` : ''
  return {
    kind: 'external',
    reference_id: `control:${work.workId}`,
    respondent_id: null,
    detail: `Paperclip refused the ${what}${named}; its issue does not show it yet. Sophia sends it again until Paperclip takes it.`,
    state: 'pending',
  }
}

const SAID: Partial<Readonly<Record<Lifecycle, string>>> = {
  held: 'Held. Work and remaining allowance are retained.',
  complete: 'Published the review.',
  queued: 'Waiting for the runtime to start the review.',
  unknown: "The runtime's state is not confirmed yet.",
  running: 'Reviewing the selected sources.',
}

function said(work: WorkFact, lifecycle: Lifecycle): string {
  if (work.goal.status === 'holding') return 'Hold requested; waiting for the runtime to settle.'
  if (work.goal.status === 'stopping') return 'Stop requested; waiting for the runtime to confirm.'
  return SAID[lifecycle] ?? closedReason(work, lifecycle) ?? 'The review ended.'
}

function activityOf(work: WorkFact, lifecycle: Lifecycle): WorkActivity | null {
  const attempt = work.attempt
  if (attempt === null || work.assignment === null) return null
  const online =
    attempt.bindingState === 'running' || attempt.bindingState === 'idle' || attempt.bindingState === 'launching'
  return {
    observation_id: `work:${work.workId}:${work.goal.stateRevision}`,
    attempt_id: attempt.id,
    assignment_generation: work.assignment.generation,
    said: said(work, lifecycle),
    observed_at: work.updatedAt,
    connection: attempt.bindingState === 'lost' ? 'offline' : online ? 'online' : 'unknown',
  }
}

function candidatesOf(work: WorkFact): WorkCandidate[] {
  const current = currentResult(work)
  return work.results
    .toSorted((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1))
    .map((r) => ({
      source_id: r.sourceId,
      version_id: r.sourceId,
      sha256: r.sha256,
      media_type: 'text/markdown',
      created_at: r.createdAt,
      state: r.state === 'withdrawn' ? 'withdrawn' : r.id === current?.id ? 'current' : 'previous',
    }))
}

function completionOf(work: WorkFact, lifecycle: Lifecycle): WorkItemView['completion'] {
  const current = currentResult(work)
  if (lifecycle === 'complete' && current !== null) {
    return {
      policy_ref: REVIEW_POLICY,
      status: 'satisfied',
      evidence_refs: [`result:${current.id}`, `source:${current.sourceId}`],
    }
  }
  return {
    policy_ref: REVIEW_POLICY,
    status: CLOSED.has(lifecycle) ? 'not_satisfied' : 'not_evaluated',
    evidence_refs: [],
  }
}

const action = (
  kind: WorkAction['kind'],
  availability: WorkAction['availability'],
  reason: string,
  boundary: string | null = null,
): WorkAction => ({
  kind,
  availability,
  reason,
  boundary,
})

/** A shared control: allowed when the work's state permits it and the viewer can edit; otherwise why not. */
function control(
  kind: 'hold' | 'resume' | 'stop',
  permitted: boolean,
  unavailable: string,
  canEdit: boolean,
): WorkAction {
  if (!permitted) return action(kind, 'unavailable', unavailable)
  return canEdit ? action(kind, 'allowed', MANDATE, MANDATE) : action(kind, 'denied', VIEWER_ONLY)
}

function actionsOf(work: WorkFact, lifecycle: Lifecycle, canEdit: boolean): WorkAction[] {
  const status = work.goal.status
  const active = !CLOSED.has(lifecycle) && lifecycle !== 'complete'
  const result = currentResult(work)
  return [
    result !== null
      ? action('open_result', 'allowed', 'A readable result exists.')
      : action(
          'open_result',
          'unavailable',
          lifecycle === 'cancelled' ? 'The result was withdrawn with an input.' : 'No readable result yet.',
        ),
    control(
      'hold',
      active && (status === 'ready' || status === 'running' || status === 'checking'),
      holdBlocked(status, lifecycle),
      canEdit,
    ),
    control('resume', status === 'held' && work.closedReason === null, 'Only held work resumes.', canEdit),
    control(
      'stop',
      active && status !== 'stopping',
      status === 'stopping' ? 'Stop requested; waiting for the runtime to confirm.' : 'The work has ended.',
      canEdit,
    ),
    action('guidance', 'unavailable', 'Guidance to a running review is not connected in this slice.'),
    action('ask_sophia', 'unavailable', 'Contextual conversation is not connected in this slice.'),
    action('review_candidate', 'unavailable', 'Independent review of a review is not part of this slice.'),
  ]
}

function holdBlocked(status: GoalStatus, lifecycle: Lifecycle): string {
  if (status === 'holding') return 'Hold requested; waiting for the runtime to settle.'
  if (status === 'held') return 'The work is held.'
  if (status === 'stopping') return 'Stop requested; waiting for the runtime to confirm.'
  return lifecycle === 'complete' ? 'The review is complete.' : 'The work has ended.'
}

/** One work item's view. */
export function itemView(work: WorkFact, canEdit: boolean): WorkItemView {
  const lifecycle = lifecycleOf(work)
  return {
    work_id: work.workId,
    lifecycle,
    assignment: assignmentOf(work),
    waiting_on: waitsOf(work),
    activity: activityOf(work, lifecycle),
    candidates: candidatesOf(work),
    review: { state: 'not_requested', candidate_version_ref: null, evidence_refs: [] },
    completion: completionOf(work, lifecycle),
    closed_reason: closedReason(work, lifecycle),
    available_actions: actionsOf(work, lifecycle, canEdit),
  }
}

/** A shown plan (accepted or a live proposal) as the board's plan definition. */
function planOf(plan: PlanFact): WorkPlanDefinition {
  const accepted = plan.state === 'accepted'
  return {
    ...plan.definition,
    state: accepted ? 'accepted' : 'proposed',
    decision_ref: accepted ? plan.decisionId : null,
  }
}

function decisionOf(d: DecisionFact, now: string): WorkDecision {
  const state = isExpired(d, now) ? 'expired' : d.state
  return {
    decision_id: d.id,
    revision: d.revision,
    work_id: d.workId,
    plan_id: d.planId,
    plan_revision: d.planRevision,
    candidate_version_ref: null,
    question: d.question,
    decider_id: d.deciderId,
    choices: d.choices.map((c) => ({ key: c.key, label: c.label })),
    expires_at: d.expiresAt,
    state,
    selected_choice: d.selectedChoice,
    choice_receipt_id: d.choiceReceiptId,
    plan_reaction: state === 'accepted' ? 'recorded' : 'not_needed',
  }
}

const newestFirst = (a: PlanFact, b: PlanFact) => (a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0)

function checkpointOf(item: WorkItemView | undefined): WorkGoalView['next_checkpoint'] {
  if (item === undefined) return null
  if (item.lifecycle === 'complete') return { label: 'Read the source review', item_id: item.work_id }
  if (CLOSED.has(item.lifecycle)) return null
  return { label: 'Source review under way', item_id: item.work_id }
}

function goalView(goalId: string, plans: readonly PlanFact[], facts: BoardFacts): WorkGoalView | null {
  const decisionsByPlan = new Map(facts.decisions.map((d) => [d.planId, d]))
  const live = (p: PlanFact) => {
    const d = decisionsByPlan.get(p.definition.plan_id)
    return p.state === 'proposed' && d !== undefined && !isExpired(d, facts.now)
  }
  const sorted = plans.toSorted(newestFirst)
  const current = sorted.find((p) => p.state === 'accepted') ?? null
  const proposed = sorted.filter(live).slice(0, MAX_PROPOSED)
  if (current === null && proposed.length === 0) return null
  const shown = [...(current ? [current] : []), ...proposed]
  const workIds = new Set((current?.definition.items ?? []).map((i) => i.id))
  const items = facts.work.filter((w) => workIds.has(w.workId)).map((w) => itemView(w, facts.viewer.canEdit))
  return {
    goal_id: goalId,
    current_plan: current ? planOf(current) : null,
    proposed_plans: proposed.map(planOf),
    next_checkpoint: checkpointOf(items[0]),
    items,
    decisions: shown.flatMap((p) => {
      const d = decisionsByPlan.get(p.definition.plan_id)
      return d ? [decisionOf(d, facts.now)] : []
    }),
  }
}

/** The whole board for the viewer the facts were read for. */
export function projectBoard(facts: BoardFacts): WorkBoardView {
  const byGoal = new Map<string, PlanFact[]>()
  const order = facts.plans.toSorted((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  for (const plan of order) byGoal.set(plan.definition.goal_id, [...(byGoal.get(plan.definition.goal_id) ?? []), plan])
  const goals = [...byGoal].flatMap(([goalId, plans]) => {
    const view = goalView(goalId, plans, facts)
    return view ? [view] : []
  })
  const unknown = goals.some((g) =>
    g.items.some(
      (i) => i.lifecycle === 'unknown' || (i.assignment !== null && i.assignment.observation_state !== 'observed'),
    ),
  )
  const unsettled = facts.work.some((w) => w.deliveryUnknown)
  return {
    schema_version: 'sophia.work.board.v1',
    project_id: facts.projectId,
    snapshot_cursor: facts.cursor,
    observed_at: facts.now,
    coverage: unknown || unsettled ? 'partial' : 'complete',
    goals: goals.slice(0, 30),
  }
}
