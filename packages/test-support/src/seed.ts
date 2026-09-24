import { randomUUID } from 'node:crypto'
import pg from 'pg'

export interface SeededProject {
  projectId: string
  goalId: string
  sourceId: string
}

/**
 * Synthetic project with members and one ready goal, written through the migration owner because
 * membership invitation handlers do not exist yet (db README: "remaining product handlers").
 * Dev/test only; never a substitute for the product path.
 */
export async function seedProject(
  ownerUrl: string,
  opts: { title?: string; admin: string; editors?: string[]; viewers?: string[]; goalStatus?: string },
): Promise<SeededProject> {
  const c = new pg.Client({ connectionString: ownerUrl })
  await c.connect()
  const projectId = randomUUID()
  const goalId = randomUUID()
  const sourceId = randomUUID()
  try {
    await c.query('BEGIN')
    await c.query(`INSERT INTO sophia.projects(id, title, created_by) VALUES ($1, $2, $3)`, [
      projectId,
      opts.title ?? 'Synthetic project',
      opts.admin,
    ])
    const members: Array<[string, string]> = [
      [opts.admin, 'admin'],
      ...(opts.editors ?? []).map((a): [string, string] => [a, 'editor']),
      ...(opts.viewers ?? []).map((a): [string, string] => [a, 'viewer']),
    ]
    for (const [actor, role] of members) {
      await c.query(`INSERT INTO sophia.project_members(project_id, actor_id, role) VALUES ($1, $2, $3)`, [
        projectId,
        actor,
        role,
      ])
    }
    await c.query(
      `INSERT INTO sophia.project_revisions(project_id, revision, frame, accepted_by) VALUES ($1, 1, '{}', $2)`,
      [projectId, opts.admin],
    )
    await c.query(
      `INSERT INTO sophia.goals(project_id, id, title, outcome, criteria, mission_revision, status)
       VALUES ($1, $2, 'Admit and replay a command', 'Both members see the same admitted command', $3, 1, $4)`,
      [
        projectId,
        goalId,
        JSON.stringify([{ id: 'c1', description: 'Replay converges', required: true, verification: 'e2e' }]),
        opts.goalStatus ?? 'running',
      ],
    )
    await c.query(
      `INSERT INTO sophia.source_objects(project_id, id, owner_id, scope, sha256, mime, storage_key, byte_length, eligible, state)
       VALUES ($1, $2, $3, 'project', $4, 'text/markdown', $5, 42, true, 'ready')`,
      [projectId, sourceId, opts.admin, 'a'.repeat(64), `synthetic/${projectId}/brief.md`],
    )
    await c.query('COMMIT')
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    await c.end()
  }
  return { projectId, goalId, sourceId }
}
