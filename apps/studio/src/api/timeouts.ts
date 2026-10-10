// How long a call waits, apart from the client that calls (client.ts): the sign-in reads it, and never the validators
// the client brings (docs/plans/signed-in-later.md).

/**
 * How long a call waits for its whole reply. A read is short: whoever needs it asks again. A write is long: it may
 * be the call that wakes an idle server, and one slow answer is better than a failure to retry by hand.
 */
export const READ_TIMEOUT_MS = 30_000
export const WRITE_TIMEOUT_MS = 90_000
