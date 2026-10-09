/**
 * Canonical JSON: object keys sorted at every depth, no whitespace, `undefined` members dropped as JSON.stringify
 * drops them. Two parties that hold the same value produce the same bytes, so a digest of it binds the value, not
 * its spelling. Only JSON values are accepted; a function, symbol or non-finite number is refused.
 * @module @sophia/coordination/canonical
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sorted(value))
}

function sorted(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON holds finite numbers only')
    return value
  }
  if (Array.isArray(value)) return value.map((item: unknown) => (item === undefined ? null : sorted(item)))
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined)
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries.map(([k, v]) => [k, sorted(v)]))
  }
  throw new TypeError(`Canonical JSON cannot hold a ${typeof value}`)
}
