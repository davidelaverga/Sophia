// The fetch the App's Supabase Auth client goes through (auth.ts), apart from it so it can be checked without the page:
// each refresh the Auth service refuses is noted (refresh-refusal.ts).
import { READ_TIMEOUT_MS } from '../api/timeouts.ts'
import { boundedFetch } from './bounded-fetch.ts'
import { watchRefusals } from './refresh-refusal.ts'

/**
 * How long one request of the App's Auth client may take: as long as a read of the API. A request cut at it is a
 * network failure to supabase-js, which keeps the session and tries the refresh again.
 */
export const AUTH_REQUEST_MS = READ_TIMEOUT_MS

/** What the Auth service said when it last refused this tab's refresh, noted as the client fetches. */
export const refusals = watchRefusals(boundedFetch(AUTH_REQUEST_MS))
