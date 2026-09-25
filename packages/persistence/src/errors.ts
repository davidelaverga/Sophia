import { DomainError, type ErrorCode } from '@sophia/domain'

interface Rule {
  sqlstate: string
  /** Narrows by the message the sophia.* functions raise; omitted means any message. */
  when?: (message: string) => boolean
  code: ErrorCode
  /** Replaces the database message when it could reveal more than the caller may know. */
  publicMessage?: string
}

/** SQLSTATEs raised by the sophia.* functions (db/migrations), most specific rule first. */
const RULES: readonly Rule[] = [
  { sqlstate: '42501', when: (m) => m.startsWith('Source not released'), code: 'source_ineligible' },
  // Room access refusals that say what to do (0010): the caller already holds the link, so naming why is safe.
  {
    sqlstate: '42501',
    when: (m) => m.startsWith('Only a project admin') || m.startsWith('This invitation is for'),
    code: 'forbidden',
  },
  { sqlstate: '42501', code: 'forbidden', publicMessage: 'Not permitted' },
  // Compare-and-set losers: a newer revision, epoch or stable head won.
  { sqlstate: '40001', when: (m) => m.startsWith('Stale') || m === 'Stable head changed', code: 'stale_revision' },
  { sqlstate: '40001', code: 'invalid_state' },
  { sqlstate: '23505', when: (m) => m.startsWith('Idempotency key reused'), code: 'idempotency_conflict' },
  { sqlstate: '23505', code: 'invalid_state' },
  { sqlstate: '22023', when: (m) => m.endsWith('not found'), code: 'not_found' },
  { sqlstate: '22023', code: 'invalid_request' },
]

/** Connection-level failures: the database is unreachable or refusing new sessions. */
const isUnavailable = (sqlstate: string) => sqlstate.startsWith('08') || sqlstate === '57P01' || sqlstate === '53300'

/** The SQLSTATE and message of a driver error; empty strings for anything else. */
export function pgError(err: unknown): { code: string; message: string } {
  if (typeof err !== 'object' || err === null) return { code: '', message: '' }
  return {
    code: 'code' in err && typeof err.code === 'string' ? err.code : '',
    message: 'message' in err && typeof err.message === 'string' ? err.message : '',
  }
}

/** Map a PostgreSQL error to a domain error. Unknown failures never leak their message. */
export function classifyDbError(err: unknown): DomainError {
  const { code, message } = pgError(err)
  const rule = RULES.find((r) => r.sqlstate === code && (r.when?.(message) ?? true))
  if (rule) return new DomainError(rule.code, rule.publicMessage ?? message, { cause: err })
  return new DomainError('unavailable', isUnavailable(code) ? 'Database unavailable' : 'Unexpected database error', {
    cause: err,
  })
}
