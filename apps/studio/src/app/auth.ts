// Who is using the Studio. Supabase Auth when configured (magic link, PKCE, auto-refreshed access
// token); otherwise the dev-only identities written by scripts/dev-stack.ts.
import { createClient, type AuthError, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { OTHER_BROWSER_NOTICE, readAuthCallback, withoutAuthParams } from './auth-callback.ts'
import { devIdentities, loadIdentity, saveIdentity, type Identity } from './dev-identity.ts'

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

const fromSession = (s: Session | null): AuthState =>
  s
    ? { status: 'signed_in', identity: { name: s.user.email ?? s.user.id, role: '', token: s.access_token } }
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

/** Sophia is invite-only: an email without an account learns how to get in, not Supabase's wording. */
function signInError(error: AuthError, email: string): Error {
  const noAccount = error.code === 'otp_disabled' || /signups not allowed/i.test(error.message)
  return noAccount
    ? new Error(
        `There’s no Sophia account for ${email}. Ask a project admin to invite you, then use the link in that email.`,
      )
    : error
}

/** Magic link to the current page; locally the email lands in Mailpit. New accounts only in dev. */
export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase Auth is not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      shouldCreateUser: import.meta.env.DEV,
    },
  })
  if (error) throw signInError(error, email)
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
