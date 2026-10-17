// The idempotency keys of member removals (A29): one per member while a removal of them is unsettled, so a retry after
// an unknown outcome is the same removal; retired once the server confirms it, so a later removal of the same person
// (they rejoined) is a new one and not answered with the old receipt (Codex on #385).

export interface RemovalKeys {
  /** The key for removing this member now: the unsettled one, else a new one. */
  keyFor: (actorId: string) => string
  /** The removal of this member was confirmed: its key is retired. */
  confirmed: (actorId: string) => void
}

export function removalKeys(newKey: () => string = () => crypto.randomUUID()): RemovalKeys {
  const keys = new Map<string, string>()
  return {
    keyFor: (actorId) => {
      const key = keys.get(actorId) ?? newKey()
      keys.set(actorId, key)
      return key
    },
    confirmed: (actorId) => {
      keys.delete(actorId)
    },
  }
}
