// What needs the calling person (contract amendment A15, docs/plans/needs-api.md): one read across their projects and
// their personal space, through the generated validator. Called only under the vision flag until the service answers
// it; the fixture pages answer it. `needsOf` turns the wire's needs into Home's (needs-you.ts); `whereOf` says where
// each lives, so a press goes there and never guesses.
import type { Need as WireNeed, NeedList } from '@sophia/contracts'
import { parseNeedList } from '@sophia/contracts/validate'
import type { View } from '../app/route.ts'
import type { Need } from '../features/personal/needs-you.ts'
import { MENTIONS } from '../app/mentions.ts'
import { callApi } from './client.ts'

/** With the mentions flag, the person's mentions too (A37's mentions=1); without, only A15's kinds. */
export const listNeeds = (token: string, signal?: AbortSignal): Promise<NeedList> =>
  callApi(
    MENTIONS ? '/api/v1/me/needs?mentions=1' : '/api/v1/me/needs',
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseNeedList,
  )

/**
 * The person has seen a need (A15, `markNeedSeen`): for a reply it advances their last seen personal turn, so the reply
 * leaves the list; for any other kind the service answers 204 and changes nothing. A 204 is the whole answer.
 */
export const markNeedSeen = (token: string, id: string): Promise<void> =>
  callApi(`/api/v1/me/needs/${encodeURIComponent(id)}/seen`, { token, method: 'POST' }, () => undefined)

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

/** The view a need lives in, by its kind: a decision in Tasks, a permission in Resources (its request, where the owner answers it in the tool), a guest at the room (a reply lives in the personal space). */
const VIEW_OF: Readonly<Record<WireNeed['kind'], View>> = {
  decision: 'work',
  permission: 'resources',
  guest: 'studio',
  reply: 'work',
  // A37: the room's chat, where the message stands.
  mention: 'studio',
}

/**
 * The record a need names, when the Studio has an address for it: a decision's own choice; a native request on its
 * resource (and the task that holds its wait, for the record); a task in Tasks' fragment.
 */
export interface NeedAt {
  /** A message in the room's chat (a mention, A37): the chat opens on it. */
  messageId?: string
  taskId?: string
  decisionId?: string
  requestId?: string
  resourceId?: string
}

export type Where = { place: 'personal' } | { projectId: string; view: View; at: NeedAt }

/**
 * The address a ref gives (Codex on #245): a decision by its own id (`#decision-`): its choice stands on the board, not
 * in the sheet, so the board scrolls to it and gives it the focus. A wait by its request (`#request-`, A13's
 * reference): the request stands in its resource's sheet, where the owner is told how to answer it in the tool and
 * given the tool's own link; the task's sheet only names it. The resource and the task come along for the record. A
 * lobby entry and a personal turn have no address of their own.
 */
export function atOf(ref: WireNeed['ref']): NeedAt {
  if (ref.kind === 'work_decision') return { decisionId: ref.id }
  // A mention (A37): its message, which the room's chat opens on; it is seen once shown there (useMentionsSeen).
  if (ref.kind === 'contribution') return { messageId: ref.id }
  if (ref.kind === 'work_wait')
    return {
      requestId: ref.id,
      ...(ref.resourceId ? { resourceId: ref.resourceId } : {}),
      ...(ref.within ? { taskId: ref.within } : {}),
    }
  return {}
}

/**
 * Where a need opens while the Resources view has nothing served (SignedIn supplies no resources yet, SCM-01/02): a
 * permission goes to the task that holds its wait, whose sheet names it, never to a view that only says it is coming
 * (Codex on #245). Every other need opens where it lives.
 */
export function withoutResources(view: View, at: NeedAt): { view: View; at: NeedAt } {
  if (view !== 'resources') return { view, at }
  return { view: 'work', at: at.taskId ? { taskId: at.taskId } : {} }
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
