// What needs the calling person (contract amendment A15, docs/plans/needs-api.md): one read across their projects and
// their personal space, through the generated validator. Called only under the vision flag until the service answers
// it; the fixture pages answer it. `needsOf` turns the wire's needs into Home's (needs-you.ts); `whereOf` says where
// each lives, so a press goes there and never guesses.
import type { Need as WireNeed, NeedList } from '@sophia/contracts'
import { parseNeedList } from '@sophia/contracts/validate'
import type { View } from '../app/route.ts'
import type { Need } from '../features/personal/needs-you.ts'
import { callApi } from './client.ts'

export const listNeeds = (token: string, signal?: AbortSignal): Promise<NeedList> =>
  callApi('/api/v1/me/needs', { token, method: 'GET', ...(signal ? { signal } : {}) }, parseNeedList)

/** The wire's needs as Home shows them: the project by its title, the rest as they are. */
export const needsOf = (list: Pick<NeedList, 'needs'>): Need[] =>
  list.needs.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    project: n.projectTitle,
    expiresAt: n.expiresAt,
    detail: n.detail,
  }))

/** The view a need lives in, by its kind: a decision or a permission in Tasks, a review in Knowledge, a guest at the room. */
const VIEW_OF: Readonly<Record<WireNeed['kind'], View>> = {
  decision: 'work',
  permission: 'work',
  review: 'knowledge',
  guest: 'studio',
  reply: 'work',
}

export type Where = { place: 'personal' } | { projectId: string; view: View }

/** Where a need lives: the personal space for Sophia's reply (or anything without a project), else its project's view. */
export function whereOf(need: Pick<WireNeed, 'kind' | 'projectId'>): Where {
  if (need.kind === 'reply' || need.projectId === null) return { place: 'personal' }
  return { projectId: need.projectId, view: VIEW_OF[need.kind] }
}
