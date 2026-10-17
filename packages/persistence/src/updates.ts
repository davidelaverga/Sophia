// What changed in a project since a member last looked (contract amendment A34, docs/plans/project-updates.md): read and
// marked through sophia.project_updates and sophia.mark_project_seen; the member is the transaction's actor.
import type pg from 'pg'
import type { ProjectUpdates } from '@sophia/contracts'
import { onlyRow } from './rows.ts'

const iso = (value: string) => new Date(value).toISOString()

/** readProjectUpdates (A34): the window after the member's mark, as current records. Inside withActor(..., "read"). */
export async function readProjectUpdates(c: pg.PoolClient, projectId: string): Promise<ProjectUpdates> {
  const { rows } = await c.query<{ updates: ProjectUpdates }>('SELECT sophia.project_updates($1) AS updates', [
    projectId,
  ])
  const u = onlyRow(rows, 'project_updates').updates
  return {
    ...u,
    decided: u.decided.map((d) => ({ ...d, at: d.at === null ? null : iso(d.at) })),
    noted: u.noted.map((n) => ({ ...n, at: iso(n.at) })),
  }
}

/**
 * markProjectSeen (A34): the member has seen the project up to `sequence`, forward only, never past the newest event.
 * Inside withActor(..., "write").
 */
export async function markProjectSeen(c: pg.PoolClient, projectId: string, sequence: string): Promise<void> {
  await c.query('SELECT sophia.mark_project_seen($1, $2::bigint)', [projectId, sequence])
}
