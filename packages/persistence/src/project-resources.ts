// Project native resources (contract amendment A51, migration 0097; docs/plans/project-native-resources.md). One read
// of the member-safe catalog through sophia.project_native_resources, which checks the caller's current membership
// itself and builds the owner-only part for the owner alone. It writes, locks, grants and sends nothing: a page is an
// observation within the caller's current authority, never a grant, readiness or a stable multi-page snapshot.
import type pg from 'pg'
import type { ProjectNativeResourcePage } from '@sophia/contracts'
import { classifyDbError } from './errors.ts'
import { onlyRow } from './rows.ts'

/**
 * One page of the project's native resources after `after` (a resource id, or null for the first page), or null when
 * the caller is not a current member or there is no such project: the two are not told apart. Call inside
 * withActor(..., 'read'), so the page is one read-only snapshot.
 */
export async function readProjectNativeResources(
  c: pg.PoolClient,
  projectId: string,
  after: string | null,
): Promise<ProjectNativeResourcePage | null> {
  try {
    const { rows } = await c.query<{ page: ProjectNativeResourcePage | null }>(
      'SELECT sophia.project_native_resources($1, $2) AS page',
      [projectId, after],
    )
    return onlyRow(rows, 'project_native_resources').page
  } catch (err) {
    throw classifyDbError(err)
  }
}
