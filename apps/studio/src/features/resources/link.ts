// A sheet has its own address, to share "look at this": the page's address with `#resource-<id>` for a resource's
// sheet, `#task-<id>` for a task's on the plan's board (LFE-07.1). Opening a sheet puts it there, closing takes it
// away, and an address that names one opens its sheet. Only the fragment changes: the project's route (path) stays the
// router's.

export const RESOURCE = '#resource-'
export const TASK = '#task-'
/** A decision on the board, by its own id: the board scrolls to its choice and gives it the focus (needs-api.md). */
export const DECISION = '#decision-'
/** A goal in Tasks: the address chooses it, so its plan is the one on the board (docs/plans/goals-progress.md). */
export const GOAL = '#goal-'
/** A conversation in Conversations: the address opens it, and opening one puts it there (conversation-address.md). */
export const CONVERSATION = '#conversation-'
/** A native request on a resource, by its id: its resource's sheet opens and the request takes the focus (needs-api.md). */
export const REQUEST = '#request-'
/** A message in the room's chat, by its id: the chat opens on it (a mention, from Home's «needs you», A37). */
export const MESSAGE = '#message-'

export const linkHash = (id: string, prefix = RESOURCE) => `${prefix}${encodeURIComponent(id)}`

/**
 * A request named with its resource, when known: two resources may hold the same request id (A13 bounds it only by
 * length), so the address carries both, `<resource>/<request>`, each part encoded (Codex on #245). A bare request id
 * (an older link) still reads.
 */
export const requestAddress = (resourceId: string | null, requestId: string) =>
  // A bare id leads with the separator (an empty resource), so a slash inside it is never read as one (Codex on #245).
  `${resourceId === null ? '' : encodeURIComponent(resourceId)}/${encodeURIComponent(requestId)}`

/** The resource and the request a request address names (`requestAddress`); the resource null for a bare id. */
export function requestOf(address: string): { resourceId: string | null; requestId: string } {
  const at = address.indexOf('/')
  if (at < 0) return { resourceId: null, requestId: address }
  try {
    const resource = decodeURIComponent(address.slice(0, at))
    return {
      resourceId: resource === '' ? null : resource,
      requestId: decodeURIComponent(address.slice(at + 1)),
    }
  } catch {
    return { resourceId: null, requestId: address }
  }
}

/**
 * What an address's fragment names under `prefix`, or null. It is kept as it is until what it names is read: a fragment
 * is checked against the resources or tasks when they arrive, not when the view opens before them.
 */
export function linkedId(hash: string, prefix = RESOURCE): string | null {
  if (!hash.startsWith(prefix)) return null
  try {
    return decodeURIComponent(hash.slice(prefix.length)) || null
  } catch {
    return null
  }
}

/** Puts the open sheet in the address, or takes it away, without a new history entry. */
export function showInAddress(id: string | null, prefix = RESOURCE): void {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}${id ? linkHash(id, prefix) : ''}`)
}
