// Every check starts with the keys' tip seen (docs/plans/keys-tip.md): it shows once per browser, so the checks that
// are not about it see the page as before. e2e/keys-tip.spec.ts starts with an empty store.

/** A browser that has had the tip, on these origins: the configs' `use.storageState`. */
export const tipSeenAt = (...origins: string[]) => ({
  cookies: [],
  origins: origins.map((origin) => ({ origin, localStorage: [{ name: 'sophia.keys-tip', value: 'seen' }] })),
})
