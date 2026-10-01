// What a check of the personal padlock (reauth.ts) comes to, from what the Auth service answered. Pure, so every case
// is unit-tested. Only the signed-in person opens it; a passkey prompt the person closed waits; everything else says
// why in words they can act on, and nothing that isn't another account is ever called one.

/** Open, wait (the passkey prompt was closed), another account, or why not. */
export type Checked = 'confirmed' | 'dismissed' | 'other_account' | { failed: string }

export const CHECK_WORDS = {
  network: 'Couldn’t confirm it’s you. Check your connection and try again.',
  notConfirmed: 'Couldn’t confirm it’s you. Try again.',
  passkey: 'That passkey didn’t work here. Try another way.',
  expired: 'That took too long. Use your passkey again.',
  code: 'That code didn’t work, or it has expired.',
  tooMany: 'Too many tries. Wait a minute and try again.',
  storage: 'This browser keeps nothing for this page, so that sign-in can’t be checked here. Try another way.',
} as const

/** What the Studio reads of an error: its name (the browser's, for a passkey prompt), its code and its status. */
export interface CheckError {
  name?: string | undefined
  code?: string | undefined
  /** 0 when the request never got an answer (lost, or given up after its time). */
  status?: number | undefined
}

/** The prompt was closed: by the person, or by the sheet going away (its signal). */
const closed = (e: CheckError) =>
  e.name === 'NotAllowedError' || e.name === 'AbortError' || e.code === 'ERROR_CEREMONY_ABORTED'

/** No answer came back, or the Auth service couldn't give one (auth-js retries those). */
const unanswered = (e: CheckError) => e.name === 'AuthRetryableFetchError' || e.status === 0

function refused(kind: 'passkey' | 'code', e: CheckError): Checked {
  if (kind === 'passkey' && closed(e)) return 'dismissed'
  if (unanswered(e)) return { failed: CHECK_WORDS.network }
  if (e.status === 429 || e.code === 'over_request_rate_limit') return { failed: CHECK_WORDS.tooMany }
  if (kind === 'code') return { failed: CHECK_WORDS.code }
  return { failed: e.code === 'webauthn_challenge_expired' ? CHECK_WORDS.expired : CHECK_WORDS.passkey }
}

/**
 * A check's outcome: `user` is the account the sign-in itself returned, `me` the signed-in person (the app's own
 * token, read without the network).
 */
export function checked(
  kind: 'passkey' | 'code',
  answer: { user: string | null; error: CheckError | null },
  me: string | null,
): Checked {
  if (answer.error) return refused(kind, answer.error)
  if (!answer.user || !me) return { failed: CHECK_WORDS.notConfirmed }
  return answer.user === me ? 'confirmed' : 'other_account'
}
