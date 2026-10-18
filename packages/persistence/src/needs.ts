// What needs the calling person (contract amendment A15, docs/plans/needs-served.md): read and marked through
// sophia.list_needs and sophia.mark_reply_seen; the actor is the transaction's, never a request field.
import type pg from 'pg'
import type { NeedList } from '@sophia/contracts'
import { onlyRow } from './rows.ts'

const iso = (value: string) => new Date(value).toISOString()

/**
 * listNeeds (A15): the person's own needs and the service's clock; with `mentions` (A37's opt-in), their pending
 * mentions among them. Call inside withActor(..., "read").
 */
export async function readNeeds(
  c: pg.PoolClient,
  { mentions = false }: { mentions?: boolean } = {},
): Promise<NeedList> {
  const { rows } = await c.query<{ list: NeedList }>(
    mentions ? 'SELECT sophia.list_needs(true) AS list' : 'SELECT sophia.list_needs() AS list',
  )
  const list = onlyRow(rows, 'list_needs').list
  return {
    readAt: iso(list.readAt),
    needs: list.needs.map((n) => ({ ...n, at: iso(n.at), expiresAt: n.expiresAt === null ? null : iso(n.expiresAt) })),
  }
}

/**
 * markNeedSeen for a reply (A15): the person's seen mark moves forward to the turn named, never back. False when the
 * turn is not one of Sophia's in the person's own space. Call inside withActor(..., "write").
 */
export async function markReplySeen(c: pg.PoolClient, turnId: string): Promise<boolean> {
  const { rows } = await c.query<{ marked: boolean }>('SELECT sophia.mark_reply_seen($1) AS marked', [turnId])
  return onlyRow(rows, 'mark_reply_seen').marked
}

/**
 * markNeedSeen for a mention (A37): the person has looked at the message on that revision, for that occurrence of being
 * asked; a seen for another revision or occurrence changes nothing. False when they are not an active member or are not
 * mentioned. Call inside withActor(..., "write").
 */
export async function markMentionSeen(
  c: pg.PoolClient,
  projectId: string,
  contributionId: string,
  at: { revision: string; occurrence: string },
): Promise<boolean> {
  const { rows } = await c.query<{ marked: boolean }>(
    'SELECT sophia.mark_mention_seen($1, $2, $3::bigint, $4::bigint) AS marked',
    [projectId, contributionId, at.revision, at.occurrence],
  )
  return onlyRow(rows, 'mark_mention_seen').marked
}
