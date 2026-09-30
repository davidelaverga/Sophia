// Why a sign-in email could not be sent, in words a person can act on. Pure, so every case is unit-tested. The
// text comes from Supabase Auth's own reply (a trusted source), never from the address bar.

/** What the Studio reads of an Auth error: its code, its sentence and whether the request got anywhere. */
export interface AuthFailure {
  code?: string | undefined
  message: string
  /** 0 (or none) when the request never reached the Auth service. */
  status?: number | undefined
}

const CLOSED = (email: string) => `New accounts are closed on this server, so ${email} can’t sign up yet.`

/** Supabase says how long to wait between two emails to one address ("… after 41 seconds."). */
const waitSeconds = (message: string) => /after (\d+) seconds?/.exec(message)?.[1]

/**
 * The sentence for a sign-in email that was not sent. A limit says how long to wait, or that the last email still
 * works; anything unknown keeps the Auth service's own sentence, which says more than a generic one.
 */
export function sendFailure(error: AuthFailure, email: string): string {
  if (error.code === 'otp_disabled' || error.code === 'signup_disabled') return CLOSED(email)
  if (/signups not allowed/i.test(error.message)) return CLOSED(email)
  if (error.code === 'over_email_send_rate_limit') {
    const seconds = waitSeconds(error.message)
    return seconds
      ? `An email was just sent. You can ask for another in ${seconds} seconds.`
      : 'Too many emails were sent in the last hour. The newest one still works; or try again later.'
  }
  if (error.code === 'over_request_rate_limit') return 'Too many tries. Wait a minute and try again.'
  if (!error.status) return 'Couldn’t reach the sign-in service. Check your connection and try again.'
  return error.message
}
