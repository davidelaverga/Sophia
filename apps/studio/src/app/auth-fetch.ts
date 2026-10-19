// The fetch the App's Supabase Auth client goes through (auth.ts), apart from it so it can be checked without the page:
// each refresh the Auth service refuses is noted (refresh-refusal.ts).
import { watchRefusals } from './refresh-refusal.ts'

/** How long one request of the App's Auth client may take: as long as a read of the API. */
export const AUTH_REQUEST_MS = 30_000

/** What the Auth service said when it last refused this tab's refresh, noted as the client fetches. */
export const refusals = watchRefusals((input, init) => fetch(input, init))
