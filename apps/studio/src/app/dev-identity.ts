// Dev-only identities written by scripts/dev-stack.ts into .env.development.local (gitignored).
// Each browser tab keeps its own identity, so two tabs can act as the two founders.
// Real sign-in with Supabase Auth replaces this; production builds never contain these tokens.

export interface Identity {
  name: string
  role: string
  token: string
}

const KEY = 'sophia.dev.identity'

const isIdentity = (v: unknown): v is Identity =>
  typeof v === 'object' &&
  v !== null &&
  'name' in v &&
  typeof v.name === 'string' &&
  'role' in v &&
  typeof v.role === 'string' &&
  'token' in v &&
  typeof v.token === 'string'

export const devIdentities: Identity[] = (() => {
  if (!import.meta.env.DEV) return []
  try {
    const parsed: unknown = JSON.parse(import.meta.env.VITE_DEV_IDENTITIES ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isIdentity) : []
  } catch {
    return []
  }
})()

export const devProjectId: string | undefined = import.meta.env.DEV ? import.meta.env.VITE_DEV_PROJECT_ID : undefined

export function loadIdentity(): Identity | null {
  try {
    const name = sessionStorage.getItem(KEY)
    return devIdentities.find((i) => i.name === name) ?? null
  } catch {
    return null
  }
}

export function saveIdentity(identity: Identity | null): void {
  try {
    if (identity) sessionStorage.setItem(KEY, identity.name)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: identity lasts for this page only */
  }
}
