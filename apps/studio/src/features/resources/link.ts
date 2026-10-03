// A sheet has its own address, to share "look at this": the page's address with `#resource-<id>` for a resource's
// sheet, `#task-<id>` for a task's on the plan's board (LFE-07.1). Opening a sheet puts it there, closing takes it
// away, and an address that names one opens its sheet. Only the fragment changes: the project's route (path) stays the
// router's.

export const RESOURCE = '#resource-'
export const TASK = '#task-'

export const linkHash = (id: string, prefix = RESOURCE) => `${prefix}${encodeURIComponent(id)}`

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
