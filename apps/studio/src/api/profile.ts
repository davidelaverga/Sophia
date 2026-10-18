// The signed-in person's own display name (A32, docs/plans/profile-editor.md): read, and set compare-and-set on its
// revision, idempotent per key. The account is the token's; nothing in a request says whose profile it is.
import type { Profile, ProfileUpdate } from '@sophia/contracts'
import { parseProfile } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

/** getMyProfile: the name, whether the person chose it, and its revision (0 before any edit). */
export const getMyProfile = (token: string, signal?: AbortSignal): Promise<Profile> =>
  callApi('/api/v1/me/profile', { token, method: 'GET', ...(signal ? { signal } : {}) }, parseProfile)

/**
 * updateMyProfile: one key per edit. After no reply the same key and body go again, so a lost reply is never a second
 * edit; a stale revision answers 409 `stale_revision`, a name the API refuses 422.
 */
export const updateMyProfile = (token: string, key: string, body: ProfileUpdate): Promise<Profile> =>
  callApi('/api/v1/me/profile', { token, method: 'PUT', key, body }, parseProfile)
