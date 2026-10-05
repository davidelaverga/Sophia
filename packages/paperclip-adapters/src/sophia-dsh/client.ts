/**
 * Sophia's coordination routes (/v1/coordination/*, amendment A13) as the adapter calls them: its own capability, on
 * a fixed origin the operator configured in the Paperclip service's environment (never an agent's config). An answer
 * Sophia gave is returned; a refusal is a SophiaRefusal with its code; no answer is a SophiaUnreachable, which the
 * adapter never reads as a decision.
 * @module @sophia/paperclip-adapters/sophia-dsh/client
 */
import type {
  CoordinationObservation,
  CoordinationPermit,
  CoordinationPermitRequest,
  CoordinationRunRequest,
  CoordinationStart,
} from '@sophia/contracts'

export interface SophiaClient {
  permit(request: CoordinationPermitRequest): Promise<CoordinationPermit>
  start(request: CoordinationRunRequest): Promise<CoordinationStart>
  observe(request: CoordinationRunRequest): Promise<CoordinationObservation>
  cancel(request: CoordinationRunRequest): Promise<CoordinationObservation>
}

/** Sophia answered with a refusal (4xx): nothing was started. */
export class SophiaRefusal extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** No usable answer: Sophia may or may not have acted. */
export class SophiaUnreachable extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
type Fields = Readonly<Record<string, unknown>>
const fields = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : null

const PERMIT_DECISIONS: ReadonlySet<unknown> = new Set(['start', 'attach', 'deny'])
const PHASES: ReadonlySet<unknown> = new Set([
  'queued',
  'running',
  'holding',
  'held',
  'stopping',
  'stopped',
  'result_ready',
  'blocked',
  'failed',
  'withdrawn',
  'unknown',
])

export function isPermit(value: unknown): value is CoordinationPermit {
  const f = fields(value)
  return (
    f !== null &&
    PERMIT_DECISIONS.has(f.decision) &&
    (f.decision === 'deny' || (typeof f.workId === 'string' && UUID.test(f.workId)))
  )
}

export function isStart(value: unknown): value is CoordinationStart {
  const f = fields(value)
  return (
    f !== null &&
    typeof f.workId === 'string' &&
    (f.denied === true || (typeof f.attemptId === 'string' && UUID.test(f.attemptId)))
  )
}

export function isObservation(value: unknown): value is CoordinationObservation {
  const f = fields(value)
  return f !== null && PHASES.has(f.phase) && typeof f.workId === 'string' && 'usage' in f && 'result' in f
}

export interface HttpSophiaOptions {
  /** Sophia's API origin, e.g. https://api.sophia.internal (SOPHIA_COORDINATION_URL). */
  readonly origin: string
  /** The adapter's capability (SOPHIA_COORDINATION_TOKEN); only its hash is stored by Sophia. */
  readonly token: string
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
}

export function httpSophiaClient(options: HttpSophiaOptions): SophiaClient {
  const base = options.origin.replace(/\/+$/, '')
  async function post<T>(path: string, body: unknown, accept: (value: unknown) => value is T): Promise<T> {
    let res: Response
    try {
      res = await (options.fetch ?? fetch)(`${base}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      })
    } catch (err: unknown) {
      throw new SophiaUnreachable(`Sophia did not answer: ${err instanceof Error ? err.message : String(err)}`)
    }
    const value: unknown = await res.json().catch(() => null)
    if (res.ok && accept(value)) return value
    const error = fields(value)
    if (res.status >= 400 && res.status < 500 && typeof error?.code === 'string') {
      throw new SophiaRefusal(res.status, error.code, typeof error.message === 'string' ? error.message : error.code)
    }
    throw new SophiaUnreachable(`Sophia answered ${String(res.status)} without a usable body`)
  }
  return {
    permit: (request) => post('/v1/coordination/permit', request, isPermit),
    start: (request) => post('/v1/coordination/start', request, isStart),
    observe: (request) => post('/v1/coordination/observe', request, isObservation),
    cancel: (request) => post('/v1/coordination/cancel', request, isObservation),
  }
}
