import type pg from 'pg'
import type {
  ProjectArchived,
  ProjectCreate,
  ProjectCreated,
  ProjectLeft,
  ProjectRenamed,
  ProjectRenameRequest,
} from '@sophia/contracts'
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

/**
 * Archive a project or bring it back (A30): an admin only, idempotent per actor and key; asking for the state it has
 * changes nothing. Call inside withActor(..., "write").
 */
export async function setProjectArchived(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  archived: boolean,
): Promise<ProjectArchived> {
  const { rows } = await c.query<{ receipt: ProjectArchived }>(
    `SELECT sophia.set_project_archived($1, $2, $3) AS receipt`,
    [projectId, archived, idempotencyKey],
  )
  return onlyRow(rows, 'set_project_archived').receipt
}

/** Rename a project (A21): an admin only, idempotent per actor and key. Call inside withActor(..., "write"). */
export async function renameProject(
  c: pg.PoolClient,
  projectId: string,
  idempotencyKey: string,
  body: ProjectRenameRequest,
): Promise<ProjectRenamed> {
  const { rows } = await c.query<{ receipt: ProjectRenamed }>(`SELECT sophia.rename_project($1, $2, $3) AS receipt`, [
    projectId,
    body.title,
    idempotencyKey,
  ])
  return onlyRow(rows, 'rename_project').receipt
}

/** Leave a project (A22): any member but its only admin, idempotent per actor and key. Call inside withActor(..., "write"). */
export async function leaveProject(c: pg.PoolClient, projectId: string, idempotencyKey: string): Promise<ProjectLeft> {
  const { rows } = await c.query<{ receipt: ProjectLeft }>(`SELECT sophia.leave_project($1, $2) AS receipt`, [
    projectId,
    idempotencyKey,
  ])
  return onlyRow(rows, 'leave_project').receipt
}
