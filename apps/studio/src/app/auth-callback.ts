// What a Supabase Auth redirect left in the address bar. Pure, so every case is unit-tested.
//  - An invitation (sent from the dashboard) returns tokens in the fragment: the implicit flow. The
//    PKCE client ignores those, so the Studio sets the session from them itself.
//  - A magic link returns ?code=, which only the browser that asked for it can exchange.
//  - A failed or expired link returns error parameters.

export type AuthCallback =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code' }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

export function readAuthCallback(href: string): AuthCallback {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const error = hash.get('error_description') ?? url.searchParams.get('error_description')
  if (error) return { kind: 'error', message: error.replaceAll('+', ' ') }
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

export const OTHER_BROWSER_NOTICE =
  'That sign-in link was opened in a different browser than the one that asked for it. Enter the code from the email instead, or ask for a new link here.'
