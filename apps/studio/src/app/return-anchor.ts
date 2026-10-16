// A link's place through a sign-in (docs/plans/anchor-through-sign-in.md). Stub: nothing is kept yet.

export const RETURN_ANCHOR_KEY = 'sophia.return-anchor'
export const RETURN_ANCHOR_MS = 30 * 60_000

interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export function keepAnchor(_store: Store, _at: { pathname: string; hash: string }, _now: number): void {}

export const takeAnchor = (_store: Store, _path: string, _now: number): string | null => null
