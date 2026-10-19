// What the Auth service said when it refused this tab's refresh (docs/plans/signed-out-elsewhere.md). supabase-js
// removes the session for any refusal once its access token has expired (2.117.1, `_callRefreshToken`) and says only
// SIGNED_OUT, the word another tab's Sign out brings too. The refusal's code, read off the response before supabase-js
// gets it, tells the sign-in whether the session was signed out elsewhere or ended for another cause.

/** The code in a refusal's body: `code` with API 2024-01-01, which supabase-js asks for, else `error_code`. */
export function refusalCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  if ('code' in body && typeof body.code === 'string') return body.code
  if ('error_code' in body && typeof body.error_code === 'string') return body.error_code
  return ''
}

const addressOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/** A refresh: the token grant with a refresh token, as supabase-js asks for one (`_refreshAccessToken`). */
function isRefresh(input: RequestInfo | URL): boolean {
  try {
    const address = new URL(addressOf(input))
    return address.pathname.endsWith('/auth/v1/token') && address.searchParams.get('grant_type') === 'refresh_token'
  } catch {
    return false // no address of the Auth service's
  }
}

/** A refusal that can end the session: a 4xx. A 5xx keeps it, as a network failure does (`NETWORK_ERROR_CODES`). */
const refuses = (response: Response) => response.status >= 400 && response.status < 500

/** Its code, read from a copy, so supabase-js reads the answer itself as it came. */
async function codeOf(response: Response): Promise<string> {
  try {
    return refusalCode(await response.clone().json())
  } catch {
    return '' // a body that isn't JSON names no cause
  }
}

/**
 * The fetch the app's Auth client goes through: each refresh the Auth service refused is noted, its code, before the
 * response is handed on, so the note is there when supabase-js removes the session and says so. `take` returns the
 * last note once.
 */
export function watchRefusals(base: typeof fetch): { fetch: typeof fetch; take: () => string | null } {
  let refused: string | null = null
  return {
    fetch: async (input, init) => {
      const response = await base(input, init)
      if (refuses(response) && isRefresh(input)) refused = await codeOf(response)
      return response
    },
    take: () => {
      const said = refused
      refused = null
      return said
    },
  }
}
