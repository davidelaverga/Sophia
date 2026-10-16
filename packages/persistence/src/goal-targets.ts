// A goal's owner and target date, kept beside it (db/migrations/0054, contract amendment A25), and a project's members
// with the names the room keeps. Reads run under the member's RLS; the write goes through sophia.set_goal_target.
import type pg from 'pg'
import type { GoalTarget, GoalTargetRequest, GoalTargetSet, ProjectMember } from '@sophia/contracts'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

interface TargetRow {
  goal_id: string
  owner_id: string | null
  target_date: string | null
  revision: string
}

/** Whether the caller may read the project at all (RLS): a non-member and an unknown project look the same. */
async function readable(c: pg.PoolClient, projectId: string): Promise<boolean> {
  const { rows } = await c.query(`SELECT 1 FROM sophia.projects WHERE id = $1`, [projectId])
  return rows.length > 0
}

/** The project's goals' targets; null for a non-member. Call inside withActor(..., "read"). */
export async function readGoalTargets(c: pg.PoolClient, projectId: string): Promise<GoalTarget[] | null> {
  if (!(await readable(c, projectId))) return null
  const { rows } = await c.query<TargetRow>(
    `SELECT goal_id, owner_id, to_char(target_date, 'YYYY-MM-DD') AS target_date, revision
       FROM sophia.goal_targets WHERE project_id = $1 ORDER BY goal_id`,
    [projectId],
  )
  return rows.map((r) => ({
    goalId: r.goal_id,
    ownerId: r.owner_id,
    targetDate: r.target_date,
    revision: safeInt(r.revision, 'goalTarget.revision'),
  }))
}

/** Set a goal's owner and date (A25): editors and admins, compare-and-set. Call inside withActor(..., "write"). */
export async function setGoalTarget(
  c: pg.PoolClient,
  projectId: string,
  goalId: string,
  body: GoalTargetRequest,
): Promise<GoalTargetSet> {
  const { rows } = await c.query<{ receipt: GoalTargetSet }>(
    `SELECT sophia.set_goal_target($1, $2, $3, $4::date, $5) AS receipt`,
    [projectId, goalId, body.ownerId, body.targetDate, body.expectedRevision],
  )
  return onlyRow(rows, 'set_goal_target').receipt
}

/** The project's active members, with the names the room keeps; null for a non-member. Inside withActor("read"). */
export async function readProjectMembers(c: pg.PoolClient, projectId: string): Promise<ProjectMember[] | null> {
  if (!(await readable(c, projectId))) return null
  const { rows } = await c.query<{ actor_id: string; role: ProjectMember['role']; name: string | null }>(
    `SELECT actor_id, role, name FROM sophia.project_members_named($1)`,
    [projectId],
  )
  return rows.map((r) => ({ actorId: r.actor_id, role: r.role, name: r.name }))
}
