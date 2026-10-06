import { DomainError, type ErrorCode } from '@sophia/domain'

interface Rule {
  sqlstate: string
  /** Narrows by the message the sophia.* functions raise; omitted means any message. */
  when?: (message: string) => boolean
  code: ErrorCode
  /** Replaces the database message when it could reveal more than the caller may know. */
  publicMessage?: string
}

/**
 * The limits research and design run into (55000): the messages name only which limit stopped the call, so they are
 * kept.
 */
const LIMITS: readonly string[] = [
  'Research allowance exhausted',
  'Research grant exhausted',
  'Research source policy limit reached',
  'A partial-result call is already in flight',
  // 0029: an unreconciled overrun stops the allowance; a finalizing task takes no ordinary call, and only so many.
  'Research allowance overrun',
  'Research is finalizing',
  'Research finalize step has used its calls',
  // 0030: at most three renders per research task.
  'Research render limit reached',
  // SDD-01 (0039, 0040): a design's renders, revisions, repairs and work record are bounded.
  'Design render limit reached',
  'Design revision limit reached',
  'Design repair limit reached',
  'The work record is full',
  // 0041: a report's page is designed (and edited) at most sixteen times.
  'Design edit limit reached',
]

/** SQLSTATEs raised by the sophia.* functions (db/migrations), most specific rule first. */
const RULES: readonly Rule[] = [
  // Runtime capability checks (0012): the capability is unknown, or it is used against another unit or project.
  // Render runner capability checks (0030): an unknown or revoked runner is refused like an unknown runtime.
  {
    sqlstate: '28000',
    when: (m) => m.startsWith('Render runner'),
    code: 'runtime_capability_required',
    publicMessage: 'Render runner capability not recognized',
  },
  { sqlstate: '28000', code: 'runtime_capability_required', publicMessage: 'Runtime capability not recognized' },
  {
    sqlstate: '42501',
    when: (m) =>
      m.startsWith('Runtime ') ||
      m.startsWith('Receipt names') ||
      m.startsWith('Observation names') ||
      m.startsWith('Research operation names') ||
      m.startsWith('Design operation names') ||
      m.startsWith('A media-bridge call') ||
      m.startsWith('The speaker is not bound') ||
      m.startsWith('Announcement names'),
    code: 'forbidden',
  },
  { sqlstate: '55000', when: (m) => m.startsWith('No native runtime'), code: 'native_capability_unavailable' },
  // Research (0024, 0025): the gate, a ready runtime that carries the specialist, and the allowance's limits. The
  // messages name only which limit stopped the call, so they are kept.
  { sqlstate: '55000', when: (m) => m.startsWith('No research runtime'), code: 'native_capability_unavailable' },
  // SDD-01 (0040): HTML needs a ready designer and a capture renderer asking for work; nothing is admitted without them.
  { sqlstate: '55000', when: (m) => m.startsWith('HTML design is unavailable'), code: 'html_unavailable' },
  // 0032: a rendition needs a render runner that is asking for work.
  { sqlstate: '55000', when: (m) => m.startsWith('No PDF renderer'), code: 'native_capability_unavailable' },
  { sqlstate: '55000', when: (m) => m === 'Research gate closed', code: 'research_gate_closed' },
  { sqlstate: '55000', when: (m) => LIMITS.some((p) => m.startsWith(p)), code: 'research_limit_reached' },
  // The mission ledger (0018): the note policy's refusals say what would allow the write, so their words are kept.
  {
    sqlstate: '42501',
    when: (m) => m.startsWith('Note capture is off') || m.startsWith('Consent to keep'),
    code: 'note_policy_denied',
  },
  { sqlstate: '42501', when: (m) => m.startsWith('Source not released'), code: 'source_ineligible' },
  // Room access refusals that say what to do (0010): the caller already holds the link, so naming why is safe.
  {
    sqlstate: '42501',
    when: (m) => m.startsWith('Only a project admin') || m.startsWith('This invitation is for'),
    code: 'forbidden',
  },
  { sqlstate: '42501', code: 'forbidden', publicMessage: 'Not permitted' },
  // Before the other "Stale" refusals: a retry of a personal write the person has since erased (0021, personal_prior).
  {
    sqlstate: '40001',
    when: (m) => m.startsWith('Stale request: what it wrote has since been erased'),
    code: 'request_erased',
  },
  // The personal space's limits (0021): each refusal has its own code.
  { sqlstate: '54000', when: (m) => m.startsWith('Notes are full'), code: 'notes_full' },
  { sqlstate: '54000', when: (m) => m.startsWith('Carried notes are full'), code: 'carried_full' },
  // Compare-and-set losers: a newer revision, epoch or stable head won.
  { sqlstate: '40001', when: (m) => m.startsWith('Stale') || m === 'Stable head changed', code: 'stale_revision' },
  { sqlstate: '40001', when: (m) => m.startsWith('Confirmation required'), code: 'confirmation_required' },
  { sqlstate: '40001', code: 'invalid_state' },
  { sqlstate: '23505', when: (m) => m.startsWith('Idempotency key reused'), code: 'idempotency_conflict' },
  { sqlstate: '23505', code: 'invalid_state' },
  { sqlstate: '22023', when: (m) => m.endsWith('not found'), code: 'not_found' },
  { sqlstate: '22023', code: 'invalid_request' },
  // Text the database can't hold (a NUL character): the caller's input, never an outage.
  { sqlstate: '22021', code: 'invalid_request', publicMessage: 'Text contains a character that cannot be kept' },
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
