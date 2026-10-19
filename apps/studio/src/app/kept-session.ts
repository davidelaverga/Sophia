// The session supabase-js keeps on this device for an account, read from storage alone, without its client: as the page
// loads, before the client starts (signed-in-load.ts, auth.ts), and once the client has checked it (auth.ts).

/** Supabase's own key for a session it keeps (`sb-<project>-auth-token`). */
const KEPT_SESSION = /^sb-.+-auth-token$/

/** A kept session that is an account's, as supabase-js keeps it: not a guest's left from a room's door. */
function anAccounts(kept: string | null): boolean {
  try {
    const session: unknown = JSON.parse(kept ?? 'null')
    if (typeof session !== 'object' || session === null) return false
    const user: unknown = 'user' in session ? session.user : null
    return !(typeof user === 'object' && user !== null && 'is_anonymous' in user && user.is_anonymous === true)
  } catch {
    return false
  }
}

type Store = Pick<Storage, 'length' | 'key' | 'getItem'>

/** Whether this browser keeps a session for an account. Storage is reached inside the guard: refused, none is known. */
export function accountSessionKept(given?: Store): boolean {
  try {
    const store = given ?? localStorage
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i) ?? ''
      if (KEPT_SESSION.test(key) && anAccounts(store.getItem(key))) return true
    }
  } catch {
    // Storage refused: nothing is known kept.
  }
  return false
}
