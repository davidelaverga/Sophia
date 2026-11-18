// One configured original journal. This metadata lookup neither admits work nor substitutes a newer host.
import type pg from 'pg'
import type { OwnerHostRunner } from './owner-host-enrollment.ts'
export interface OriginalOwnerHostRoute extends OwnerHostRunner {
  state: 'active' | 'retired'
  newWorkQualified: boolean
}
export async function originalOwnerHostRoute(
  pool: pg.Pool,
  ownerId: string,
  environmentRef: string,
  journalId: string,
  target?: { projectId: string; outboxId: string },
): Promise<OriginalOwnerHostRoute | null> {
  try {
    const { rows } = await pool.query<{ r: OriginalOwnerHostRoute | null }>(
      'SELECT sophia.owner_host_original_route($1,$2,$3,$4) AS r',
      [ownerId, environmentRef, journalId, target ? JSON.stringify(target) : null],
    )
    if (!rows[0]) throw new Error()
    return rows[0].r
  } catch {
    throw new Error('Owner host route unavailable')
  }
}
