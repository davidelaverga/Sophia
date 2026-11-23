// What a view keeps in the address's query beside the route (docs/plans/focus-kept.md, «Addresses»): the room's open
// panel (`?panel=`) and the Invite sheet's tab (`?invite=`), as the Studio's lens is (`?lens=`, studio-lens-address.md).
// Written with no history entry, so a reload or a pasted link shows the same; read once, when the view opens.

/** The value `key` names in a query, when it is one of `allowed`; null otherwise (absent, or not one we know). */
export function paramIn<T extends string>(search: string, key: string, allowed: readonly T[]): T | null {
  const value = new URLSearchParams(search).get(key)
  return allowed.find((a) => a === value) ?? null
}

/** The query with `key` set to `value`, or without it for null; the rest kept in its order. */
export function withParam(search: string, key: string, value: string | null): string {
  const params = new URLSearchParams(search)
  if (value === null) params.delete(key)
  else params.set(key, value)
  const next = params.toString()
  return next ? `?${next}` : ''
}

/** Writes `key` into the address on screen, no history entry, path and fragment kept; nothing when it already says so. */
export function showParam(key: string, value: string | null): void {
  const { pathname, search, hash } = window.location
  const next = withParam(search, key, value)
  if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
}
