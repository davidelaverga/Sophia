/**
 * The vocabulary Sophia's source adapters share (SMC-M03 S3): one typed error with a closed code, so the research
 * tools (S4) route on the code and never on a provider's message text. A provider's own HTTP status, when it answered,
 * travels with the error; nothing claims to be the origin's status.
 * @module @sophia/dsh-bundle/source-errors
 */

export type SourceErrorCode =
  /** No usable key: refused before any network I/O. */
  | 'missing_key'
  /** The provider refused the request as malformed (400). */
  | 'bad_request'
  /** The key was refused (401). */
  | 'invalid_key'
  /** The provider refused the caller (403). */
  | 'forbidden'
  /** The account's plan limit is reached (Tavily 432). */
  | 'plan_limit'
  /** The pay-as-you-go limit is reached (Tavily 433). */
  | 'payg_limit'
  /** Too many requests (429). */
  | 'rate_limited'
  /** The provider failed or could not be reached (5xx, network). */
  | 'upstream_unavailable'
  /** The local deadline passed. */
  | 'timeout'
  /** The caller cancelled. */
  | 'cancelled'
  /** The provider answered with a shape this adapter does not accept. */
  | 'malformed_response'
  /** The read target is not eligible (eligibility check). */
  | 'ineligible'
  /** A source kind the pilot does not read (PDF and other binaries). */
  | 'unsupported'

export class SourceError extends Error {
  readonly code: SourceErrorCode
  /** The provider's own HTTP status when it answered; never the origin's. */
  readonly providerHttpStatus: number | null

  constructor(code: SourceErrorCode, message: string, providerHttpStatus: number | null = null) {
    super(message)
    this.name = 'SourceError'
    this.code = code
    this.providerHttpStatus = providerHttpStatus
  }
}

/** A provider HTTP status mapped to the shared codes. 432 and 433 are Tavily's plan and pay-as-you-go limits. */
export function codeForStatus(status: number): SourceErrorCode {
  if (status === 400) return 'bad_request'
  if (status === 401) return 'invalid_key'
  if (status === 403) return 'forbidden'
  if (status === 432) return 'plan_limit'
  if (status === 433) return 'payg_limit'
  if (status === 429) return 'rate_limited'
  return 'upstream_unavailable'
}

/**
 * One provider request under a local deadline and the caller's signal. A timeout and a cancellation are told apart;
 * any other network failure is `upstream_unavailable`. The response is returned unread.
 */
export async function requestWithDeadline(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
  try {
    return await doFetch(url, { ...init, signal: combined })
  } catch (error) {
    if (signal?.aborted) throw new SourceError('cancelled', 'the caller cancelled the request')
    if (deadline.aborted) throw new SourceError('timeout', `no answer within ${timeoutMs} ms`)
    throw new SourceError('upstream_unavailable', `the provider could not be reached: ${error instanceof Error ? error.name : 'error'}`)
  }
}

/** Read a JSON body, or fail as `malformed_response`; the body text never reaches the message. */
export async function jsonBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    throw new SourceError('malformed_response', 'the provider answered with a body that is not JSON', response.status)
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
