// Confirming it's the same person before their personal space opens again (the padlock, direction C). With Supabase
// Auth the checks are real: the passkey, the provider they signed in with, or a code sent to their email, and each must
// come back as the signed-in person; anyone else is refused and the side stays shut.
//
// A passkey or a code is checked on a client of its own (checkClient), never the app's: it stores nothing and
// refreshes nothing, so the app's session and the other tabs hear nothing of it, and the session the check got is ended
// as soon as it answered (scope local: that one only). Only the network is bounded, each request on its own; the
// passkey prompt is the person's, and the browser ends it at its own timeout. A provider's check crosses a page load on
// the app's own client, so it must come back as a NEW sign-in of the same account: returning with Back proves nothing.
// Locally, dev identities have nothing to check, and the sheet says so.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { providerCheckPassed, tokenSession, type ProviderCheck } from './auth-callback.ts'
import { sendFailure } from './auth-words.ts'
import { authProject, listPasskeys, oauthProviders, passkeysOffered, supabase, type OAuthProvider } from './auth.ts'
import { orLate } from './deadline.ts'
import { checked, CHECK_WORDS, type CheckError, type Checked } from './unlock-check.ts'

export interface UnlockWays {
  /** Dev identities: nothing is checked. */
  dev: boolean
  passkey: boolean
  providers: OAuthProvider[]
  /** Where a code can be sent, or null when the account has no email. */
  email: string | null
}

const DEV_WAYS: UnlockWays = { dev: true, passkey: true, providers: ['google'], email: null }

/** Whether a passkey is offered before the account's ways have loaded: locally, and where passkeys work on this site. */
export const passkeyAtFirst = !supabase || passkeysOffered

const isProvider = (value: unknown): value is OAuthProvider =>
  typeof value === 'string' && oauthProviders.some((p) => p === value)

/** The ways this account can confirm it's them here. A read that failed throws: "no passkey" is never a guess. */
export async function unlockWays(): Promise<UnlockWays> {
  if (!supabase) return DEV_WAYS
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const signedWith: unknown = data.user.app_metadata.providers
  return {
    dev: false,
    passkey: passkeysOffered && (await listPasskeys()).length > 0,
    providers: Array.isArray(signedWith) ? signedWith.filter(isProvider) : [],
    email: data.user.email ?? null,
  }
}

/** How long one request of a check may take: a lost connection says so instead of leaving the sheet waiting. */
const REQUEST_MS = 20_000

/**
 * fetch with an end for each request: its own controller, aborted after REQUEST_MS or with the caller's signal, which is
 * followed by hand (AbortSignal.any isn't in Safari 16.4, which the build targets).
 */
const boundedFetch: typeof fetch = (input, init) => {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), REQUEST_MS)
  const caller = init?.signal
  const follow = () => stop.abort()
  if (caller?.aborted) stop.abort()
  else caller?.addEventListener('abort', follow, { once: true })
  return fetch(input, { ...init, signal: stop.signal }).finally(() => {
    clearTimeout(timer)
    caller?.removeEventListener('abort', follow)
  })
}

let checker: SupabaseClient | null = null

/** The checks' own client, made once: nothing stored or refreshed, the address bar left alone, every request bounded. */
function checkClient(): SupabaseClient | null {
  if (!authProject) return null
  checker ??= createClient(authProject.url, authProject.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sophia.personal.unlock.check',
    },
    global: { fetch: boundedFetch },
  })
  return checker
}

/** One check at a time: each starts once the one before has ended the session it got. */
let ended: Promise<unknown> = Promise.resolve()

interface Answer {
  data: { user: { id: string } | null } | null
  error: (CheckError & { name: string }) | null
}

function check(kind: 'passkey' | 'code', me: string | null, verify: (auth: SupabaseClient['auth']) => Promise<Answer>) {
  const client = checkClient()
  if (!client) return Promise.resolve<Checked>('confirmed')
  const run = ended.then(async (): Promise<Checked> => {
    try {
      const { data, error } = await verify(client.auth)
      return checked(kind, { user: data?.user?.id ?? null, error }, me)
    } catch {
      return { failed: CHECK_WORDS.notConfirmed }
    }
  })
  const end = () => client.auth.signOut({ scope: 'local' })
  ended = run.then(end, end).catch(() => undefined)
  return run
}

/**
 * The passkey, on the checks' own client. `me` is the signed-in person (the app's token); `signal` closes the prompt
 * when the sheet goes away.
 */
export const unlockWithPasskey = (me: string | null, signal: AbortSignal): Promise<Checked> =>
  check('passkey', me, (auth) => auth.signInWithPasskey({ options: { signal } }))

export const unlockWithCode = (me: string | null, email: string, code: string): Promise<Checked> =>
  check('code', me, (auth) => auth.verifyOtp({ email, token: code, type: 'email' }))

/** A code by email to an account that already exists (it never creates one), sent from the checks' own client. */
export async function sendUnlockCode(email: string): Promise<void> {
  const client = checkClient()
  if (!client) return
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (error) throw new Error(sendFailure(error, email))
}

const PENDING = 'sophia.personal.unlock'

/** Who is signed in now, as the Auth service says, and which sign-in that is (the token's session_id). */
async function signedInNow(): Promise<{ user: string | null; session: string | null }> {
  if (!supabase) return { user: null, session: null }
  const token = (await supabase.auth.getSession()).data.session?.access_token // after the client's ?code= exchange
  if (!token) return { user: null, session: null }
  const { data, error } = await supabase.auth.getUser(token)
  if (error) throw error
  return { user: data.user.id, session: tokenSession(token) }
}

/**
 * Leaves for the provider, noting which sign-in left (this tab only); on return, `unlockAfterRedirect` opens the side
 * if the same account signed in again there.
 */
export async function unlockWithProvider(provider: OAuthProvider): Promise<void> {
  if (!supabase) return
  // Which sign-in leaves, within the checks' deadline; a failed or late read says so in the Studio's words.
  const left = await orLate(signedInNow(), REQUEST_MS).catch(() => 'late' as const)
  if (left === 'late') throw new Error(CHECK_WORDS.network)
  const pending: ProviderCheck = { user: left.user ?? '', session: left.session ?? '', at: Date.now() }
  try {
    sessionStorage.setItem(PENDING, JSON.stringify(pending))
  } catch {
    // storage unavailable: the person unlocks again after coming back
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/personal`, ...(provider === 'azure' ? { scopes: 'email' } : {}) },
  })
  if (error) throw new Error('That sign-in didn’t start. Try another way.')
}

/**
 * After a provider's redirect: "passed" once, when the check passed (providerCheckPassed); "failed" when it didn't
 * (Back, another account); "none" when nothing was pending. A read that failed throws.
 */
export async function unlockAfterRedirect(): Promise<'passed' | 'failed' | 'none'> {
  let pending: unknown = null
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null')
    sessionStorage.removeItem(PENDING)
  } catch {
    return 'none'
  }
  if (pending === null) return 'none'
  return providerCheckPassed(pending, await signedInNow(), Date.now()) ? 'passed' : 'failed'
}
