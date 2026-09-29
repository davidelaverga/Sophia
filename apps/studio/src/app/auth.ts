// Who is using the Studio. Supabase Auth when configured (magic link, PKCE, auto-refreshed access
// token); otherwise the dev-only identities written by scripts/dev-stack.ts.
import { createClient, type AuthError, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { OTHER_BROWSER_NOTICE, readAuthCallback, withoutAuthParams } from './auth-callback.ts'
import { devIdentities, loadIdentity, saveIdentity, type Identity } from './dev-identity.ts'
import { passkeysWorkOn } from './passkey-domain.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Read before the client starts: its own PKCE exchange rewrites the address when it succeeds.
const callback = readAuthCallback(window.location.href)

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: 'pkce',
          // The client only exchanges ?code= itself; invitation tokens in the fragment are handled below.
          detectSessionInUrl: () => false,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null

export type AuthMode = 'supabase' | 'dev' | 'none'
export const authMode: AuthMode = supabase ? 'supabase' : devIdentities.length > 0 ? 'dev' : 'none'

export type AuthState =
  { status: 'loading' } | { status: 'signed_out'; notice?: string } | { status: 'signed_in'; identity: Identity }

/** An anonymous session is a guest's (a knock at a room's door), never an account: its role says so. */
const fromSession = (s: Session | null): AuthState =>
  s
    ? {
        status: 'signed_in',
        identity: { name: s.user.email ?? s.user.id, role: s.user.is_anonymous ? 'guest' : '', token: s.access_token },
      }
    : { status: 'signed_out' }

/**
 * The session after an Auth redirect, with a notice when the redirect could not sign in: an expired
 * link, or a magic link opened in a browser other than the one that asked for it.
 */
async function sessionAfterRedirect(client: SupabaseClient): Promise<AuthState> {
  let notice: string | null = callback.kind === 'error' ? callback.message : null
  if (callback.kind === 'tokens') {
    const { error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    })
    if (error) notice = error.message
  }
  const { data } = await client.auth.getSession() // waits for the client's own ?code= exchange
  if (callback.kind === 'code' && !data.session) notice = OTHER_BROWSER_NOTICE
  if (callback.kind !== 'none') window.history.replaceState(null, '', withoutAuthParams(window.location.href))
  if (data.session) return fromSession(data.session)
  return notice ? { status: 'signed_out', notice } : { status: 'signed_out' }
}

/** Current session now and on every change (including TOKEN_REFRESHED). Returns the unsubscribe. */
function subscribeToSession(client: SupabaseClient, onState: (state: AuthState) => void): () => void {
  let alive = true
  void sessionAfterRedirect(client).then((state) => {
    if (alive) onState(state)
  })
  const { data } = client.auth.onAuthStateChange((_event, session) => onState(fromSession(session)))
  return () => {
    alive = false
    data.subscription.unsubscribe()
  }
}

export function useAuth(): { state: AuthState; chooseDev: (i: Identity | null) => void; signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>(() => {
    if (authMode === 'supabase') return { status: 'loading' }
    const dev = loadIdentity()
    return dev ? { status: 'signed_in', identity: dev } : { status: 'signed_out' }
  })

  useEffect(() => (supabase ? subscribeToSession(supabase, setState) : undefined), [])

  return {
    state,
    chooseDev: (i) => {
      saveIdentity(i)
      setState(i ? { status: 'signed_in', identity: i } : { status: 'signed_out' })
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut()
      else saveIdentity(null)
      setState({ status: 'signed_out' })
    },
  }
}

/** Anyone can sign up: the first link creates the account. A server with sign-ups closed says so plainly. */
function signInError(error: AuthError, email: string): Error {
  const closed = error.code === 'otp_disabled' || /signups not allowed/i.test(error.message)
  return closed ? new Error(`New accounts are closed on this server, so ${email} can’t sign up yet.`) : error
}

/** Magic link to the current page; locally the email lands in Mailpit. A new email gets an account. */
export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      shouldCreateUser: true,
    },
  })
  if (error) throw signInError(error, email)
}

/** Supabase provider ids ("azure" is Microsoft), in the order the sign-in row shows them. */
export type OAuthProvider = 'google' | 'github' | 'azure'
const KNOWN_PROVIDERS: readonly OAuthProvider[] = ['google', 'github', 'azure']

/**
 * The account providers this build offers (VITE_AUTH_PROVIDERS="google,github,azure"). A provider appears only
 * once it is enabled in Supabase Auth, so no button leads to "provider is not enabled".
 */
const OFFERED = (import.meta.env.VITE_AUTH_PROVIDERS ?? '').split(',').map((s) => s.trim())
export const oauthProviders: readonly OAuthProvider[] = KNOWN_PROVIDERS.filter((p) => OFFERED.includes(p))

/**
 * Providers on their way (VITE_AUTH_PROVIDERS_SOON="azure"): shown greyed in the row, with a tip saying so, so
 * the row keeps its shape while an app is being set up. A provider already offered is never "soon".
 */
const SOON = (import.meta.env.VITE_AUTH_PROVIDERS_SOON ?? '').split(',').map((s) => s.trim())
export const upcomingProviders: readonly OAuthProvider[] = KNOWN_PROVIDERS.filter(
  (p) => SOON.includes(p) && !OFFERED.includes(p),
)

/**
 * Passkeys are bound to one domain, Supabase Auth's Relying Party ID (VITE_PASSKEY_RP_ID="sophia-ei.com"). The
 * same build is served on other hosts too (the vercel.app address), where a passkey can't work, so passkeys are
 * offered only on that domain and its subdomains, and only when "passkey" is in VITE_AUTH_PROVIDERS.
 */
export const passkeysOffered =
  OFFERED.includes('passkey') && passkeysWorkOn(window.location.hostname, import.meta.env.VITE_PASSKEY_RP_ID)

/** The browser closed the passkey prompt: the person cancelled or timed out, which needs no message. */
const cancelled = (error: Error) => error.name === 'NotAllowedError' || error.name === 'AbortError'

export type PasskeyOutcome = 'signed_in' | 'dismissed' | 'expired'

/**
 * Sign in with a passkey saved for this site: the browser's picker, or its autofill list when `autofill` is set
 * (the email field carries autocomplete="username webauthn"). An autofill offer can outlive its challenge
 * (5 minutes): "expired" then asks the caller to offer again.
 */
export async function signInWithPasskey(autofill?: { signal: AbortSignal }): Promise<PasskeyOutcome> {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  const { error } = await supabase.auth.signInWithPasskey(
    autofill ? { options: { mediation: 'conditional', signal: autofill.signal } } : undefined,
  )
  if (!error) return 'signed_in'
  if (cancelled(error) || autofill?.signal.aborted) return 'dismissed'
  if ('code' in error && error.code === 'webauthn_challenge_expired') return 'expired'
  throw new Error('That passkey didn’t work here. Sign in another way, then add a passkey from your account.')
}

/** Whether this browser can offer passkeys in the email field's autofill list. */
export async function passkeyAutofillAvailable(): Promise<boolean> {
  if (!passkeysOffered || typeof PublicKeyCredential === 'undefined') return false
  // Older browsers have passkeys but not this probe.
  if (!('isConditionalMediationAvailable' in PublicKeyCredential)) return false
  return PublicKeyCredential.isConditionalMediationAvailable()
}

export type SavedPasskey = { id: string; name: string; createdAt: string; lastUsedAt: string | null }

function auth(): SupabaseClient['auth'] {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  return supabase.auth
}

/** The passkeys on the signed-in account, newest first. */
export async function listPasskeys(): Promise<SavedPasskey[]> {
  const { data, error } = await auth().passkey.list()
  if (error) throw error
  return data
    .map((p) => ({
      id: p.id,
      name: p.friendly_name ?? 'Passkey',
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at ?? null,
    }))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Save a passkey for this account on this device (or a phone, a security key). False when dismissed. */
export async function addPasskey(): Promise<boolean> {
  const { error } = await auth().registerPasskey()
  if (!error) return true
  if (cancelled(error)) return false
  throw error
}

export async function removePasskey(id: string): Promise<void> {
  const { error } = await auth().passkey.delete({ passkeyId: id })
  if (error) throw error
}

/** Leaves for the provider and comes back here with ?code=, which the client exchanges (PKCE). */
export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      // Microsoft sends no email unless asked; Supabase needs it to create the account.
      ...(provider === 'azure' ? { scopes: 'email' } : {}),
    },
  })
  if (error) throw error
}

/**
 * A token to knock with: the signed-in person's own, else a guest's. A guest is a Supabase anonymous sign-in
 * (the project must allow anonymous sign-ins) or, locally, the dev guest. The API lets a guest only knock,
 * wait and join the call they were admitted to.
 */
export async function guestAccessToken(current: Identity | null): Promise<string> {
  if (current) return current.token
  if (authMode === 'dev') {
    const guest = devIdentities.find((i) => i.role === 'guest')
    if (!guest) throw new Error('No dev guest identity: restart the dev stack')
    return guest.token
  }
  if (!supabase) throw new Error('Sign-in is not configured')
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw new Error('Guest access is not turned on for this Sophia yet')
  if (!data.session) throw new Error('Could not start a guest session')
  return data.session.access_token
}

/** The session's token now: Supabase refreshes it in the background, so a long wait never ends on an expired one. */
export async function currentToken(fallback: string): Promise<string> {
  if (!supabase) return fallback
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? fallback
}

/** A guest leaving the call leaves no session behind on a shared device. */
export async function endGuestSession(): Promise<void> {
  if (supabase) await supabase.auth.signOut()
}

/** An invited member may not have an account yet: this sign-in may create it. They type the emailed code. */
export async function sendInvitedSignIn(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/join`, shouldCreateUser: true },
  })
  if (error) throw error
}

/** The code in the sign-in email: works on any device, unlike the link, which needs this browser. */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) throw new Error('That code didn’t work, or it has expired. Check it, or ask for a new email.')
}
