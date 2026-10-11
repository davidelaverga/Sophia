// What needs the calling person (contract amendment A15, docs/plans/needs-api.md): one read across their projects and
// their personal space, through the generated validator. Called only under the vision flag until the service answers
// it; the fixture pages answer it. `needsOf` turns the wire's needs into Home's (needs-you.ts); `whereOf` says where
// each lives, so a press goes there and never guesses.
import type { Need as WireNeed, NeedList } from '@sophia/contracts'
import { parseNeedList } from '@sophia/contracts/validate'
import type { View } from '../app/route.ts'
import type { ReportLink } from '../features/artifacts/report-link.ts'
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

/** The record a need names, when the Studio has an address for it: a task in Tasks' fragment, a report's version in the viewer. */
export interface NeedAt {
  taskId?: string
  report?: ReportLink
}

export type Where = { place: 'personal' } | { projectId: string; view: View; at: NeedAt }

/**
 * The address a ref gives (Codex on #245): a work item is named in Tasks' fragment (`#task-`), a version opens in the
 * viewer when its report is known. A decision and a lobby entry have no address of their own yet: their view.
 */
export function atOf(ref: WireNeed['ref']): NeedAt {
  if (ref.kind === 'work_item') return { taskId: ref.id }
  if (ref.kind === 'artifact_version' && ref.artifactId) {
    return { report: { artifactId: ref.artifactId, versionId: ref.id, size: 'side', format: 'markdown' } }
  }
  return {}
}

/** Where a need lives: the personal space for Sophia's reply (or anything without a project), else its project's view, at the record its ref names. */
export function whereOf(need: Pick<WireNeed, 'kind' | 'projectId' | 'ref'>): Where {
  if (need.kind === 'reply' || need.projectId === null) return { place: 'personal' }
  return { projectId: need.projectId, view: VIEW_OF[need.kind], at: atOf(need.ref) }
}

/**
 * The service's clock against this one (A15's `readAt` is its clock; expiries compare on it): the milliseconds to add to
 * the browser's now. An unreadable `readAt` adds nothing.
 */
export function clockSkew(readAt: string, receivedAt: number): number {
  const at = Date.parse(readAt)
  return Number.isNaN(at) ? 0 : at - receivedAt
}
