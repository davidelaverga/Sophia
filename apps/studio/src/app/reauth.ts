// Confirming it's the same person before their personal space opens again (the padlock, direction C). With Supabase Auth
// the checks are real: the passkey, the provider they signed in with, or a code sent to their email. Each must come
// back as the SAME account; a different one is refused (the side stays shut), and signing in as someone else never
// opens this person's side, because a lock and a space belong to one account. Locally, dev identities have nothing to
// check, and the dialog says so.
import { authMode, listPasskeys, oauthProviders, passkeysOffered, supabase, type OAuthProvider } from './auth.ts'

export interface UnlockWays {
  /** Dev identities: nothing is checked. */
  dev: boolean
  passkey: boolean
  providers: OAuthProvider[]
  /** Where a code can be sent, or null when the account has no email. */
  email: string | null
}

export type Confirmed = 'confirmed' | 'dismissed' | 'other_account'

const DEV_WAYS: UnlockWays = { dev: true, passkey: true, providers: ['google'], email: null }

const isProvider = (value: unknown): value is OAuthProvider =>
  typeof value === 'string' && oauthProviders.some((p) => p === value)

async function currentUser() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}

async function hasPasskey(): Promise<boolean> {
  if (!passkeysOffered) return false
  try {
    return (await listPasskeys()).length > 0
  } catch {
    return false
  }
}

/** The ways this account can confirm it's them here. */
export async function unlockWays(): Promise<UnlockWays> {
  if (authMode !== 'supabase') return DEV_WAYS
  const user = await currentUser()
  const signedWith: unknown = user?.app_metadata.providers
  return {
    dev: false,
    passkey: await hasPasskey(),
    providers: Array.isArray(signedWith) ? signedWith.filter(isProvider) : [],
    email: user?.email ?? null,
  }
}

/** The same account as before the check, or not. */
async function sameAccount(before: string | null): Promise<Confirmed> {
  const after = (await currentUser())?.id ?? null
  return before && after === before ? 'confirmed' : 'other_account'
}

export async function unlockWithPasskey(): Promise<Confirmed> {
  if (!supabase) return 'confirmed'
  const before = (await currentUser())?.id ?? null
  const { error } = await supabase.auth.signInWithPasskey()
  if (error) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') return 'dismissed'
    throw new Error('That passkey didn’t work here. Try another way.')
  }
  return sameAccount(before)
}

/** A code by email to an account that already exists: it never creates one. */
export async function sendUnlockCode(email: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (error) throw new Error('The code couldn’t be sent. Wait a minute, then try again.')
}

export async function unlockWithCode(email: string, code: string): Promise<Confirmed> {
  if (!supabase) return 'confirmed'
  const before = (await currentUser())?.id ?? null
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) throw new Error('That code didn’t work, or it has expired.')
  return sameAccount(before)
}

const PENDING = 'sophia.personal.unlock'
const PENDING_FOR_MS = 10 * 60_000

/** Leaves for the provider; on return, `unlockAfterRedirect` opens the side if the same account came back. */
export async function unlockWithProvider(provider: OAuthProvider): Promise<void> {
  if (!supabase) return
  const user = await currentUser()
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ user: user?.id ?? '', at: Date.now() }))
  } catch {
    // storage unavailable: the person unlocks again after coming back
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/personal`, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
  })
  if (error) throw new Error('That sign-in didn’t start. Try another way.')
}

const isPending = (v: unknown): v is { user: string; at: number } =>
  typeof v === 'object' &&
  v !== null &&
  'user' in v &&
  typeof v.user === 'string' &&
  'at' in v &&
  typeof v.at === 'number'

/** After a provider's redirect: true once, when the same account came back within ten minutes. */
export async function unlockAfterRedirect(): Promise<boolean> {
  let pending: unknown = null
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null')
    sessionStorage.removeItem(PENDING)
  } catch {
    return false
  }
  if (!isPending(pending) || Date.now() - pending.at > PENDING_FOR_MS) return false
  return (await currentUser())?.id === pending.user
}
