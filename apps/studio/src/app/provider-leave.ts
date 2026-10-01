// Leaving for a provider to open the personal space's padlock (reauth.ts): which sign-in leaves is noted (this tab
// only), then the provider's sign-in starts. The Auth client is given, so the leaving can be checked on its own.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OAuthProvider } from './auth.ts'
import { otherAccountBack, tokenSession, type ProviderCheck } from './auth-callback.ts'
import { orLate } from './deadline.ts'
import { CHECK_WORDS } from './unlock-check.ts'

/** Where this tab notes which sign-in left for the provider. */
export const PENDING = 'sophia.personal.unlock'

/** The check this tab left for a provider with, while it is pending (null: none, or storage unavailable). */
export function pendingUnlock(): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING) ?? 'null')
  } catch {
    return null
  }
}

/**
 * Back from the provider as another account than the one that left to unlock (otherAccountBack): that session ends
 * here (scope local), the check goes with it, and true is said, so nobody is signed in. Anything else is left as it is.
 */
export async function refuseOtherAccount(
  auth: Pick<SupabaseClient['auth'], 'signOut'>,
  user: string | null,
): Promise<boolean> {
  if (!otherAccountBack(pendingUnlock(), user)) return false
  try {
    sessionStorage.removeItem(PENDING)
  } catch {
    // storage unavailable: nothing was kept
  }
  await auth.signOut({ scope: 'local' })
  return true
}

/** What leaving for a provider needs of the app's Auth client. */
export type ProviderAuth = Pick<SupabaseClient['auth'], 'getSession' | 'getUser' | 'signInWithOAuth'>

/** Who is signed in now, as the Auth service says, and which sign-in that is (the token's session_id). */
export async function signedInNow(
  auth: ProviderAuth | undefined,
): Promise<{ user: string | null; session: string | null }> {
  if (!auth) return { user: null, session: null }
  const token = (await auth.getSession()).data.session?.access_token // after the client's ?code= exchange
  if (!token) return { user: null, session: null }
  const { data, error } = await auth.getUser(token)
  if (error) throw error
  return { user: data.user.id, session: tokenSession(token) }
}

/**
 * Leaves for `provider`, noting which sign-in left; on return, `unlockAfterRedirect` opens the side if the same account
 * signed in again there. Its sheet gone meanwhile (`signal`), nothing is noted and nothing starts: the page stays. The
 * read of who is signed in has `ms`; a failed or late read says so in the Studio's words.
 */
export async function leaveFor(
  provider: OAuthProvider,
  signal: AbortSignal,
  auth: ProviderAuth | undefined,
  ms: number,
): Promise<void> {
  if (!auth) return
  const left = await orLate(signedInNow(auth), ms).catch(() => 'late' as const)
  if (signal.aborted) return
  if (left === 'late') throw new Error(CHECK_WORDS.network)
  const pending: ProviderCheck = { user: left.user ?? '', session: left.session ?? '', at: Date.now() }
  try {
    sessionStorage.setItem(PENDING, JSON.stringify(pending))
  } catch {
    // Not noted, its return couldn't tell another account from the one that left (refuseOtherAccount): it stays.
    throw new Error(CHECK_WORDS.storage)
  }
  const { error } = await auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/personal`, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
  })
  if (error) throw new Error('That sign-in didn’t start. Try another way.')
}
