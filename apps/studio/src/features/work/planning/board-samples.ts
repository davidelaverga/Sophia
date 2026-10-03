// Builders for the planning modules' unit tests: a plan item, a plan, an observation and a goal's view, each a small
// valid `sophia.work.board.v1` piece that a test changes only where it matters. Test-only: no page imports it.
import type { Assignment, GoalView, ItemView, PlanItem, WorkPlan } from './board-view.ts'

export const item = (id: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id,
  purpose: `Do ${id}`,
  deliverable_ref: `deliverable-${id}`,
  criteria_ref: `criteria-${id}`,
  parent_id: null,
  blocked_by: [],
  assignee_kind: 'assignment',
  assignee_id: `assignment-${id}`,
  source_scope_ref: 'manifest-1',
  review_policy_ref: 'policy-1',
  recipe_ref: 'recipe-1',
  activation: { kind: 'immediate', producer_work_id: null },
  ...over,
})

export const plan = (items: PlanItem[], over: Partial<WorkPlan> = {}): WorkPlan => ({
  schema_version: 'sophia.work.plan.v2',
  plan_id: 'plan-1',
  project_id: 'project-1',
  goal_id: 'goal-1',
  goal_revision: 3,
  criteria_ref: 'criteria-goal-1',
  revision: 2,
  mission_revision: 3,
  source_manifest_ref: 'manifest-1',
  state: 'accepted',
  decision_ref: 'decision-accept-1',
  assumptions: [],
  items,
  ...over,
})

/** Davide's Claude Code holding `id`'s assignment, at generation 3, attempt 3. */
export const assignment = (id: string, over: Partial<Assignment> = {}): Assignment => ({
  assignment_id: `assignment-${id}`,
  generation: 3,
  attempt_id: `attempt-${id}-3`,
  native_session_id: `s-${id}`,
  executor: {
    kind: 'owner_native',
    display_name: 'Davide’s Claude Code',
    role: 'worker',
    owner_id: 'davide',
    resource_id: `res-${id}`,
  },
  observation_state: 'observed',
  ...over,
})

export const view = (workId: string, over: Partial<ItemView> = {}): ItemView => ({
  work_id: workId,
  lifecycle: 'planned',
  assignment: null,
  waiting_on: [],
  activity: null,
  candidates: [],
  review: { state: 'not_requested', candidate_version_ref: null, evidence_refs: [] },
  completion: { policy_ref: `policy-${workId}`, status: 'not_evaluated', evidence_refs: [] },
  closed_reason: null,
  available_actions: [],
  ...over,
})

/** A goal with `current` in force, each item observed as `views` says (an item missing from it isn't observed). */
export const goal = (current: WorkPlan | null, views: ItemView[], over: Partial<GoalView> = {}): GoalView => ({
  goal_id: 'goal-1',
  current_plan: current,
  proposed_plans: [],
  next_checkpoint: null,
  items: views,
  decisions: [],
  ...over,
})
