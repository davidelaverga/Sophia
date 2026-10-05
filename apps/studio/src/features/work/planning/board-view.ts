// The work board as the Studio reads it (WBC-01): the proposed `sophia.work.board.v1` view and its plans as
// `sophia.work.plan.v2`, field for field as the workboard connection packet proposes them
// (docs/missions/2026-10-03-workboard-connection/contracts). Receipts are resources/receipts.ts.
//
// A plan is a planning decision: its revision changes only when a plan is accepted or proposed. The view joins it to
// what is observed now (an item's assignment, what it waits on, its candidates, its review and completion, and what
// this viewer may do), so activity changes the view, never the plan. Nothing here is fetched: a page hands a view in,
// and `readBoardView` accepts it or says why not; it never repairs one. It checks the shape and the schema's
// conditional rules; references between records are plan.ts's. Not an endpoint: WBC-02 promotes the agreed shapes
// and replaces this reader with the validator `@sophia/contracts` generates.
import {
  exactly,
  instant,
  list,
  oneOf,
  orNull,
  problemsOf,
  record,
  text,
  whole,
  type Check,
} from '../../../api/shape.ts'

export type Activation = {
  kind: 'immediate' | 'dependencies_satisfied' | 'candidate_ready'
  /** The work whose candidate this item reviews; a string whenever `kind` is `candidate_ready`. */
  producer_work_id: string | null
}

/** One obligation in a plan. Its `id` is the Sophia work id: one identity, not a parallel task id. */
export interface PlanItem {
  id: string
  purpose: string
  deliverable_ref: string
  criteria_ref: string
  /** Grouping: the item this one belongs under. Not a blocker. */
  parent_id: string | null
  /** The items that must be complete first. */
  blocked_by: string[]
  assignee_kind: 'assignment' | 'human' | 'unassigned'
  assignee_id: string | null
  source_scope_ref: string
  review_policy_ref: string
  recipe_ref: string
  activation: Activation
}

export interface Assumption {
  id: string
  text: string
  status: 'unresolved' | 'supported' | 'contradicted'
  evidence_refs: string[]
}

/** A plan, as accepted or proposed for one goal at one goal revision. */
export interface WorkPlan {
  schema_version: 'sophia.work.plan.v2'
  plan_id: string
  project_id: string
  goal_id: string
  goal_revision: number
  /** The goal's definition of success this plan was made for. */
  criteria_ref: string
  revision: number
  mission_revision: number
  source_manifest_ref: string
  state: 'proposed' | 'accepted' | 'superseded' | 'withdrawn'
  /** The decision that accepted it; a string whenever it is accepted. */
  decision_ref: string | null
  assumptions: Assumption[]
  items: PlanItem[]
}

export type ExecutorKind = 'sophia_native' | 'owner_native' | 'human'

export interface Executor {
  kind: ExecutorKind
  /** "Sophia", "Davide’s Claude Code", "Luis". */
  display_name: string
  /** "Source reviewer", "worker". */
  role: string
  /** Whose account or hands: null for Sophia's own workers, which no person's subscription runs. */
  owner_id: string | null
  resource_id: string | null
}

/** The admitted responsibility for an item now: who, which assignment, which control generation, which attempt. */
export interface Assignment {
  assignment_id: string
  generation: number
  attempt_id: string | null
  native_session_id: string | null
  executor: Executor
  observation_state: 'observed' | 'unknown' | 'offline'
}

export type WaitKind = 'product_decision' | 'native_permission' | 'dependency' | 'capacity' | 'connection' | 'external'

/** One thing an item waits on, and who answers it (null when no person does: capacity, a connection). */
export interface Wait {
  kind: WaitKind
  reference_id: string
  respondent_id: string | null
  detail: string
  state: 'pending' | 'resolved' | 'expired' | 'unknown'
}

/** An exact version of a result: what Open result reads, by its bytes' hash. */
export interface Candidate {
  source_id: string
  version_id: string
  sha256: string
  media_type: string
  created_at: string
  state: 'current' | 'previous' | 'withdrawn'
}

export type ActionKind = 'guidance' | 'hold' | 'resume' | 'stop' | 'ask_sophia' | 'open_result' | 'review_candidate'

/** What this viewer may do to the item now, as the service decided it; the Studio only shows it. */
export interface ItemAction {
  kind: ActionKind
  availability: 'allowed' | 'denied' | 'unavailable'
  reason: string
  /** The mandate it acts within, said to the viewer ("within Davide’s contribution"); null when none applies. */
  boundary: string | null
}

/** What the attempt last reported, bound to that attempt and generation. */
export interface Activity {
  observation_id: string
  attempt_id: string
  assignment_generation: number
  said: string
  observed_at: string
  connection: 'online' | 'offline' | 'unknown'
}

export type Lifecycle =
  | 'planned'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'held'
  | 'ready_for_review'
  | 'changes_required'
  | 'complete'
  | 'stopped'
  | 'cancelled'
  | 'failed'
  | 'superseded'
  | 'unknown'

export interface Review {
  state: 'not_requested' | 'pending' | 'passed' | 'changes_required' | 'inconclusive'
  /** The candidate version this review is of: it says nothing of any other. */
  candidate_version_ref: string | null
  evidence_refs: string[]
}

export interface Completion {
  /** The item's own declared policy for being complete. */
  policy_ref: string
  status: 'not_evaluated' | 'satisfied' | 'not_satisfied'
  evidence_refs: string[]
}

/** One item as observed now. */
export interface ItemView {
  work_id: string
  lifecycle: Lifecycle
  assignment: Assignment | null
  waiting_on: Wait[]
  activity: Activity | null
  candidates: Candidate[]
  review: Review
  completion: Completion
  closed_reason: string | null
  available_actions: ItemAction[]
}

/** A decision reserved for someone, bound to the work, plan and candidate it is about. */
export interface BoardDecision {
  decision_id: string
  /** Its own revision: an answer names it, so one given to an older revision is refused as stale. */
  revision: number
  work_id: string
  plan_id: string
  plan_revision: number
  candidate_version_ref: string | null
  question: string
  decider_id: string
  choices: { key: string; label: string }[]
  expires_at: string
  state: 'proposed' | 'accepted' | 'declined' | 'expired' | 'superseded'
  selected_choice: string | null
  choice_receipt_id: string | null
  /** Whether the plan has taken the choice in yet: the person's choice and the lead's reaction are two states. */
  plan_reaction: 'not_needed' | 'pending' | 'recorded' | 'unknown'
}

export interface GoalView {
  goal_id: string
  /** The plan in force; null while none is accepted. */
  current_plan: WorkPlan | null
  /** Replacements proposed and not accepted yet: compared beside the current plan, never operated. */
  proposed_plans: WorkPlan[]
  next_checkpoint: { label: string; item_id: string | null } | null
  items: ItemView[]
  decisions: BoardDecision[]
}

export interface BoardView {
  schema_version: 'sophia.work.board.v1'
  project_id: string
  /** The snapshot and replay boundary the view was read at; not wall-clock order. */
  snapshot_cursor: string
  observed_at: string
  /** `unavailable` is not proof a goal has no work; `partial` names what is missing elsewhere. */
  coverage: 'complete' | 'partial' | 'unavailable'
  goals: GoalView[]
}

// The shapes, as the packet's schemas give them.

const id = text(160)
const ids = (max: number, unique = false) => list(id, max, { unique })

const activation = record({
  kind: oneOf(['immediate', 'dependencies_satisfied', 'candidate_ready']),
  producer_work_id: orNull(id),
})

const planItem = record({
  id,
  purpose: text(500),
  deliverable_ref: id,
  criteria_ref: id,
  parent_id: orNull(id),
  blocked_by: ids(30, true),
  assignee_kind: oneOf(['assignment', 'human', 'unassigned']),
  assignee_id: orNull(id),
  source_scope_ref: id,
  review_policy_ref: id,
  recipe_ref: id,
  activation,
})

const plan = record({
  schema_version: exactly('sophia.work.plan.v2'),
  plan_id: id,
  project_id: id,
  goal_id: id,
  goal_revision: whole(1),
  criteria_ref: id,
  revision: whole(1),
  mission_revision: whole(0),
  source_manifest_ref: id,
  state: oneOf(['proposed', 'accepted', 'superseded', 'withdrawn']),
  decision_ref: orNull(id),
  assumptions: list(
    record({
      id,
      text: text(700),
      status: oneOf(['unresolved', 'supported', 'contradicted']),
      evidence_refs: ids(100),
    }),
    20,
  ),
  items: list(planItem, 30, { min: 1 }),
})

const assignment = record({
  assignment_id: id,
  generation: whole(1),
  attempt_id: orNull(id),
  native_session_id: orNull(id),
  executor: record({
    kind: oneOf(['sophia_native', 'owner_native', 'human']),
    display_name: text(200),
    role: text(120),
    owner_id: orNull(id),
    resource_id: orNull(id),
  }),
  observation_state: oneOf(['observed', 'unknown', 'offline']),
})

const LIFECYCLES: readonly Lifecycle[] = [
  'planned',
  'queued',
  'running',
  'waiting',
  'held',
  'ready_for_review',
  'changes_required',
  'complete',
  'stopped',
  'cancelled',
  'failed',
  'superseded',
  'unknown',
]

const itemView = record({
  work_id: id,
  lifecycle: oneOf(LIFECYCLES),
  assignment: orNull(assignment),
  waiting_on: list(
    record({
      kind: oneOf(['product_decision', 'native_permission', 'dependency', 'capacity', 'connection', 'external']),
      reference_id: id,
      respondent_id: orNull(id),
      detail: text(700),
      state: oneOf(['pending', 'resolved', 'expired', 'unknown']),
    }),
    15,
  ),
  activity: orNull(
    record({
      observation_id: id,
      attempt_id: id,
      assignment_generation: whole(1),
      said: text(700),
      observed_at: instant,
      connection: oneOf(['online', 'offline', 'unknown']),
    }),
  ),
  candidates: list(
    record({
      source_id: id,
      version_id: id,
      sha256: text(64, { ok: (s) => /^[a-f0-9]{64}$/.test(s), says: 'a lowercase sha256' }),
      media_type: text(100),
      created_at: instant,
      state: oneOf(['current', 'previous', 'withdrawn']),
    }),
    10,
  ),
  review: record({
    state: oneOf(['not_requested', 'pending', 'passed', 'changes_required', 'inconclusive']),
    candidate_version_ref: orNull(id),
    evidence_refs: ids(100),
  }),
  completion: record({
    policy_ref: id,
    status: oneOf(['not_evaluated', 'satisfied', 'not_satisfied']),
    evidence_refs: ids(100),
  }),
  closed_reason: orNull(text(700)),
  available_actions: list(
    record({
      kind: oneOf(['guidance', 'hold', 'resume', 'stop', 'ask_sophia', 'open_result', 'review_candidate']),
      availability: oneOf(['allowed', 'denied', 'unavailable']),
      reason: text(700),
      boundary: orNull(text(200)),
    }),
    7,
  ),
})

const decision = record({
  decision_id: id,
  revision: whole(1),
  work_id: id,
  plan_id: id,
  plan_revision: whole(1),
  candidate_version_ref: orNull(id),
  question: text(1200),
  decider_id: id,
  choices: list(record({ key: text(100), label: text(300) }), 10, { min: 2 }),
  expires_at: instant,
  state: oneOf(['proposed', 'accepted', 'declined', 'expired', 'superseded']),
  selected_choice: orNull(text(100)),
  choice_receipt_id: orNull(id),
  plan_reaction: oneOf(['not_needed', 'pending', 'recorded', 'unknown']),
})

const board: Check = record({
  schema_version: exactly('sophia.work.board.v1'),
  project_id: id,
  snapshot_cursor: id,
  observed_at: instant,
  coverage: oneOf(['complete', 'partial', 'unavailable']),
  goals: list(
    record({
      goal_id: id,
      current_plan: orNull(plan),
      proposed_plans: list(plan, 3),
      next_checkpoint: orNull(record({ label: text(500), item_id: orNull(id) })),
      items: list(itemView, 30),
      decisions: list(decision, 30),
    }),
    30,
  ),
})

// The schemas' conditional rules, read once the shape holds.

function planRules(p: WorkPlan, at: string): string[] {
  const problems =
    p.state === 'accepted' && p.decision_ref === null ? [`${at}.decision_ref: an accepted plan names its decision`] : []
  p.items.forEach((item, i) => {
    if (item.activation.kind === 'candidate_ready' && item.activation.producer_work_id === null) {
      problems.push(`${at}.items[${String(i)}].activation: a candidate trigger names its producer`)
    }
  })
  return problems
}

/** A plan names the project and goal it is in: one naming another is someone else's, never shown as this one. */
const placed = (p: WorkPlan, project: string, goal: string, at: string): string[] => [
  ...(p.project_id === project ? [] : [`${at}.project_id: the view's project, ${project}`]),
  ...(p.goal_id === goal ? [] : [`${at}.goal_id: its goal, ${goal}`]),
]

/**
 * A decision's own rules. Each choice has its own key: two with one key would send the same answer under different
 * words (Codex F-028). Accepted, it names one of its own choices: none, or a key it doesn't have, would be said as a
 * choice no one made (Codex F-032). Proposed, not yet decided, it names none (Codex F-036).
 */
function decisionRules(d: BoardDecision, at: string): string[] {
  const keys = d.choices.map((c) => c.key)
  const named = d.selected_choice !== null && keys.includes(d.selected_choice)
  return [
    ...(new Set(keys).size === keys.length ? [] : [`${at}.choices: each choice its own key`]),
    ...(d.state !== 'accepted' || named
      ? []
      : [`${at}.selected_choice: an accepted decision names one of its choices`]),
    ...(d.state === 'proposed' && d.selected_choice !== null
      ? [`${at}.selected_choice: a decision not yet decided names none`]
      : []),
  ]
}

function goalRules(goal: GoalView, at: string, project: string): string[] {
  const plans = [goal.current_plan, ...goal.proposed_plans].flatMap((p, i) => {
    const where = i === 0 ? `${at}.current_plan` : `${at}.proposed_plans[${String(i - 1)}]`
    return p ? [...planRules(p, where), ...placed(p, project, goal.goal_id, where)] : []
  })
  const items = goal.items.flatMap((item, i) =>
    item.lifecycle === 'complete' &&
    (item.completion.status !== 'satisfied' || item.completion.evidence_refs.length === 0)
      ? [`${at}.items[${String(i)}]: complete only with its policy satisfied, with evidence`]
      : [],
  )
  const choices = goal.decisions.flatMap((d, i) => decisionRules(d, `${at}.decisions[${String(i)}]`))
  return [...plans, ...items, ...choices]
}

/**
 * Each decision once on the board: its id at its revision names one decision, in any goal (Codex F-035). Another with
 * the same pair would share its answer and its place; the view is refused rather than either dropped. The same id at
 * another revision is another decision.
 */
function decisionsOnce(goals: readonly GoalView[]): string[] {
  const named = new Set<string>()
  return goals.flatMap((g, i) =>
    g.decisions.flatMap((d, j) => {
      const pair = JSON.stringify([d.decision_id, d.revision])
      if (!named.has(pair)) {
        named.add(pair)
        return []
      }
      return [`$.goals[${String(i)}].decisions[${String(j)}]: another decision has this id at this revision`]
    }),
  )
}

export type Read<T> = { ok: true; value: T } | { ok: false; problems: string[] }

const isBoard = (value: unknown, problems: readonly string[]): value is BoardView => problems.length === 0

/** A board view, accepted as given, or refused with every reason found. A refused view is never shown as true. */
export function readBoardView(value: unknown): Read<BoardView> {
  const problems = problemsOf(board, value)
  if (!isBoard(value, problems)) return { ok: false, problems }
  const rules = [
    ...value.goals.flatMap((g, i) => goalRules(g, `$.goals[${String(i)}]`, value.project_id)),
    ...decisionsOnce(value.goals),
  ]
  return rules.length > 0 ? { ok: false, problems: rules } : { ok: true, value }
}
