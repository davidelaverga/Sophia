// What a Supabase Auth redirect left in the address bar. Pure, so every case is unit-tested.
//  - An invitation (sent from the dashboard) returns tokens in the fragment: the implicit flow. The
//    PKCE client ignores those, so the Studio sets the session from them itself.
//  - A magic link returns ?code=, which only the browser that asked for it can exchange.
//  - A failed or expired link returns error parameters.
//
// Anyone can write an address, and anyone can send a link. So the words a failed link carries are never shown
// (the page would say whatever the link's author wrote), and a link's session is never used without a word: it
// never replaces another account, and with nobody signed in the person is asked first (a link is followed, not
// chosen).

export type AuthCallback =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code' }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

/** A sign-in link that failed in a way the Studio does not name. */
export const LINK_FAILED = 'That sign-in link didn’t work. Ask for a new one below.'

/** The Auth service didn't say in time whose a sign-in link is: nothing was signed in, and the link may still work. */
export const LINK_UNCHECKED =
  'That sign-in link couldn’t be checked in time. Open it again, or ask for a new one below.'

const DID_NOT_FINISH = 'Signing in with that account didn’t finish. Try again.'

/** Supabase Auth's error codes, in the Studio's words. A Map: a code from the address is never an object's key. */
const LINK_ERRORS = new Map<string, string>([
  ['otp_expired', 'That sign-in link has expired or was already used. Ask for a new one below.'],
  ['signup_disabled', 'New accounts are closed on this server.'],
  ['user_banned', 'This account can’t sign in here. Ask whoever runs this Sophia.'],
  [
    'provider_email_needs_verification',
    'That account’s email isn’t verified with its provider yet. Verify it there, or sign in with your email.',
  ],
  ['bad_oauth_state', DID_NOT_FINISH],
  ['bad_oauth_callback', DID_NOT_FINISH],
  ['flow_state_expired', DID_NOT_FINISH],
])

export function readAuthCallback(href: string): AuthCallback {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const read = (key: string) => hash.get(key) ?? url.searchParams.get(key)
  if (read('error') ?? read('error_code') ?? read('error_description')) {
    return { kind: 'error', message: LINK_ERRORS.get(read('error_code') ?? '') ?? LINK_FAILED }
  }
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken }
  if (url.searchParams.has('code')) return { kind: 'code' }
  return { kind: 'none' }
}

/** The same address without auth parameters, so a reload or a copied link carries no credentials. */
export function withoutAuthParams(href: string): string {
  const url = new URL(href)
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key)
  url.hash = ''
  return `${url.pathname}${url.search}`
}

/** A text claim of a token's payload, read without verifying it; null when the token or the claim isn't one. */
function tokenClaim(accessToken: string, name: string): string | null {
  const payload = accessToken.split('.')[1]
  if (!payload) return null
  try {
    const bytes = Uint8Array.from(atob(payload.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const value: unknown = typeof claims === 'object' && claims !== null ? Reflect.get(claims, name) : null
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * The account a token was issued to: the `sub` of its payload. Enough to tell whether a link would sign in as someone
 * else; Supabase verifies the token itself when the session is set.
 */
export const tokenSubject = (accessToken: string) => tokenClaim(accessToken, 'sub')

/**
 * Whose things on this device are (the padlock, the draft): the account signed in, its token's subject, which an email
 * change keeps; its name only where the token carries none.
 */
export const accountOf = (identity: { name: string; token: string }) => tokenSubject(identity.token) ?? identity.name

/** The sign-in a token belongs to (its `session_id`): every sign-in starts a new one, and a refresh keeps it. */
export const tokenSession = (accessToken: string) => tokenClaim(accessToken, 'session_id')

/** A check with a provider under way (the padlock, reauth.ts): the account and sign-in that left for it, and when. */
export interface ProviderCheck {
  user: string
  session: string
  at: number
}

/** How long a provider check may take before its return opens nothing. */
const CHECK_FOR_MS = 10 * 60_000

const isProviderCheck = (v: unknown): v is ProviderCheck =>
  typeof v === 'object' &&
  v !== null &&
  'user' in v &&
  typeof v.user === 'string' &&
  'session' in v &&
  typeof v.session === 'string' &&
  'at' in v &&
  typeof v.at === 'number'

/**
 * Whether the account a provider sent back is another than the one that left from this tab to unlock (`check`): its
 * session is never adopted. With no check pending, or nobody back, nothing is refused.
 */
export function otherAccountBack(check: unknown, user: string | null): boolean {
  return isProviderCheck(check) && check.user !== '' && user !== null && user !== check.user
}

/**
 * Whether a check with a provider passed: the account that left for it came back from a new sign-in there, in time.
 * Coming back with Back or Cancel keeps the sign-in it left with, and another account opens nothing.
 */
export function providerCheckPassed(
  check: unknown,
  back: { user: string | null; session: string | null },
  now: number,
): boolean {
  if (!isProviderCheck(check) || check.user === '' || check.session === '') return false
  return now - check.at <= CHECK_FOR_MS && back.user === check.user && !!back.session && back.session !== check.session
}

/**
 * What to do with a link's session, by whose it is (`incoming`) and who is signed in here (`here`):
 * - 'ask': nobody is, so the person is asked first, by the account's address (a link is followed, not chosen);
 * - 'keep': the same account already is, so nothing changes;
 * - 'refuse': another account is, and a link never replaces it.
 * A guest's session (an anonymous knock at a room's door) is no account, so `here` is null for it; a token whose
 * account cannot be read is never the one signed in here.
 */
export type LinkDecision = 'ask' | 'keep' | 'refuse'

export function linkDecision(here: string | null, incoming: string | null): LinkDecision {
  if (here === null) return 'ask'
  return here === incoming ? 'keep' : 'refuse'
}

export const OTHER_ACCOUNT_NOTICE =
  'That sign-in link is for a different account, so you are still signed in as before. To use the other account, sign out first, then open the link again.'

export const UNLOCK_OTHER_ACCOUNT_NOTICE =
  'That sign-in was a different account than the one whose personal space was locked, so nobody is signed in here now. Sign in again.'

export const OTHER_BROWSER_NOTICE =
  'That sign-in link was opened in a different browser than the one that asked for it. Type the code from the email in that browser, or ask for a new link here.'
