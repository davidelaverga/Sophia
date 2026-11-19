// Every check starts with the keys' tip and the typing tip seen (docs/plans/keys-tip.md, type-anywhere-tip.md): each
// shows once per browser, so the checks that are not about them see the page as before. e2e/keys-tip.spec.ts starts
// with an empty store, e2e/type-tip.spec.ts with only the keys' tip seen.

/** A browser that has had the tips, on these origins: the configs' `use.storageState`. */
export const tipSeenAt = (...origins: string[]) => ({
  cookies: [],
  origins: origins.map((origin) => ({
    origin,
    localStorage: [
      { name: 'sophia.keys-tip', value: 'seen' },
      { name: 'sophia.type-tip', value: 'seen' },
    ],
  })),
})
