// A person's own display name (db/migrations/0062, contract amendment A32): read and set by its owner only, through
// sophia.my_profile and sophia.set_my_profile; the actor is the transaction's, never a request field.
import type pg from 'pg'
import type { Profile, ProfileUpdate } from '@sophia/contracts'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

/**
 * A name kept before 0062 as it may be shown: invitations kept the inviter's token name, an email when the account had
 * no other, so an address reads null (0062's kept_name, for the rows its readers don't reach).
 */
export const shownName = (kept: string | null): string | null => (kept && !kept.includes('@') ? kept : null)

interface ProfileRow {
  displayName: string | null
  chosen: boolean
  revision: number
}

const toProfile = (r: ProfileRow): Profile => ({
  displayName: r.displayName,
  chosen: r.chosen,
  revision: safeInt(r.revision, 'profile.revision'),
})

/** The caller's own profile. Call inside withActor(..., "write") after nameActor, so a provider's name has seeded it. */
export async function readMyProfile(c: pg.PoolClient): Promise<Profile> {
  const { rows } = await c.query<{ profile: ProfileRow }>('SELECT sophia.my_profile() AS profile')
  return toProfile(onlyRow(rows, 'my_profile').profile)
}

/**
 * Set the caller's own display name (A32): compare-and-set on its revision, idempotent per actor and key. A stale
 * revision is 40001 (409), a reused key with another edit 23505 (409), a blank name or an address 22023 (422). Call
 * inside withActor(..., "write").
 */
export async function setMyProfile(c: pg.PoolClient, key: string, body: ProfileUpdate): Promise<Profile> {
  const { rows } = await c.query<{ profile: ProfileRow }>('SELECT sophia.set_my_profile($1, $2, $3) AS profile', [
    body.displayName,
    body.expectedRevision,
    key,
  ])
  return toProfile(onlyRow(rows, 'set_my_profile').profile)
}
