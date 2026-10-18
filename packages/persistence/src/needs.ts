// What needs the calling person (contract amendment A15, docs/plans/needs-served.md): read and marked through
// sophia.list_needs and sophia.mark_reply_seen; the actor is the transaction's, never a request field.
import type pg from 'pg'
import type { NeedList } from '@sophia/contracts'
import { onlyRow } from './rows.ts'

const iso = (value: string) => new Date(value).toISOString()

/** listNeeds (A15): the person's own needs and the service's clock. Call inside withActor(..., "read"). */
export async function readNeeds(c: pg.PoolClient): Promise<NeedList> {
  const { rows } = await c.query<{ list: NeedList }>('SELECT sophia.list_needs() AS list')
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
