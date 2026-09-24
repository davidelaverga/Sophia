// Who is using the Studio. Supabase Auth when configured (magic link, PKCE, auto-refreshed access
// token); otherwise the dev-only identities written by scripts/dev-stack.ts.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { devIdentities, loadIdentity, saveIdentity, type Identity } from './dev-identity.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      })
    : null

export type AuthMode = 'supabase' | 'dev' | 'none'
export const authMode: AuthMode = supabase ? 'supabase' : devIdentities.length > 0 ? 'dev' : 'none'

export type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; identity: Identity }

const fromSession = (s: Session | null): AuthState =>
  s
    ? { status: 'signed_in', identity: { name: s.user.email ?? s.user.id, role: '', token: s.access_token } }
    : { status: 'signed_out' }

/** Current session now and on every change (including TOKEN_REFRESHED). Returns the unsubscribe. */
function subscribeToSession(client: SupabaseClient, onState: (state: AuthState) => void): () => void {
  let alive = true
  void client.auth.getSession().then(({ data }) => {
    if (alive) onState(fromSession(data.session))
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
  if (error) throw error
}
