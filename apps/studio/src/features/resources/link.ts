// A resource's sheet has its own address, to share "look at this": the page's address with `#resource-<id>`. Opening
// a sheet puts it there, closing takes it away, and an address that names a resource opens its sheet. Only the
// fragment changes: the project's route (path) stays the router's.

const PREFIX = '#resource-'

export const linkHash = (id: string) => `${PREFIX}${encodeURIComponent(id)}`

/** The resource an address's fragment names, when it is one of these; null otherwise. */
export function linkedResource(hash: string, ids: readonly string[]): string | null {
  if (!hash.startsWith(PREFIX)) return null
  try {
    const id = decodeURIComponent(hash.slice(PREFIX.length))
    return ids.includes(id) ? id : null
  } catch {
    return null
  }
}

/** Puts the open sheet in the address, or takes it away, without a new history entry. */
export function showInAddress(id: string | null): void {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}${id ? linkHash(id) : ''}`)
}
