import type pg from 'pg'
import type { ProjectCreate, ProjectCreated } from '@sophia/contracts'
import { onlyRow } from './rows.ts'

/**
 * Create a project with the creator as admin through sophia.create_project(title, key)
 * (db/migrations/0006). The same actor + key + title returns the original receipt; the same key
 * with another title raises idempotency_conflict. Call inside withActor(..., "write").
 */
export async function createProject(
  c: pg.PoolClient,
  idempotencyKey: string,
  body: ProjectCreate,
): Promise<ProjectCreated> {
  const { rows } = await c.query<{ receipt: ProjectCreated }>(`SELECT sophia.create_project($1, $2) AS receipt`, [
    body.title,
    idempotencyKey,
  ])
  return onlyRow(rows, 'create_project').receipt
}
