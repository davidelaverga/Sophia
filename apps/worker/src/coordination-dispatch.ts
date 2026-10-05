// The coordination deliverer (WBC-02, db/migrations/0038): moves a work item's commission and its mirrored controls
// from Sophia's coordination outbox to the Paperclip plugin, each under a signed envelope. It is a transport step:
// it never decides, retries an effect blind or schedules work. Each pass
//   1. marks deliveries whose lease ran out outcome_unknown (they may have reached the plugin),
//   2. claims due deliveries (a work item's commission before its controls, one unsettled delivery per item at a time),
//   3. sends each and records what the plugin answered: delivered, a definite refusal, or unknown. A commission whose
//      outcome is unknown is never sent again as is: it is reconciled by its key first (lookup), and created again only
//      when the lookup proves no issue holds the key. A control is idempotent at the plugin by its delivery key.
import { randomUUID, type KeyObject } from 'node:crypto'
import type pg from 'pg'
import {
  isCommissionReply,
  isControlReply,
  isLookupReply,
  isPluginRefusal,
  PLUGIN_ID,
  ROUTES,
  signEnvelope,
  type CommissionReply,
  type CommissionRequest,
  type ControlOp,
  type ControlReply,
  type ControlRequest,
  type EnvelopeOp,
  type LookupReply,
  type LookupRequest,
} from '@sophia/coordination'
import {
  claimCoordinationOutbox,
  expireCoordinationLeases,
  recordCoordinationDelivery,
  type CoordinationDelivery,
  type DeliveryOutcome,
} from '@sophia/persistence'

/** What the plugin answered: its reply, a definite refusal (nothing was created or changed), or nothing certain. */
export type PluginAnswer<T> =
  | { readonly kind: 'ok'; readonly body: T }
  | { readonly kind: 'refused'; readonly status: number; readonly code: string; readonly message: string }
  | { readonly kind: 'unknown'; readonly reason: string }

/** The plugin's three routes. The HTTP implementation is httpPaperclipClient; tests give an in-memory one. */
export interface PaperclipClient {
  commission(request: CommissionRequest): Promise<PluginAnswer<CommissionReply>>
  lookup(request: LookupRequest): Promise<PluginAnswer<LookupReply>>
  control(issueId: string, request: ControlRequest): Promise<PluginAnswer<ControlReply>>
}

export interface CoordinationOptions {
  readonly workerId: string
  readonly client: PaperclipClient
  readonly signingKey: KeyObject
  readonly batchSize?: number
  readonly leaseSeconds?: number
  /** Seconds since the epoch; tests fix it. */
  readonly now?: () => number
  readonly log?: (line: string) => void
}

export interface CoordinationPass {
  readonly expired: number
  readonly delivered: number
  readonly outcomes: ReadonlyArray<{ readonly id: string; readonly op: string; readonly outcome: DeliveryOutcome }>
  /** Deliveries whose lease was lost before their outcome was recorded (they are reconciled on a later pass). */
  readonly lost: number
}

const ENVELOPE_SECONDS = 120

function sign(delivery: CoordinationDelivery, op: EnvelopeOp, body: unknown, options: CoordinationOptions) {
  const now = options.now?.() ?? Math.floor(Date.now() / 1000)
  return signEnvelope(
    {
      op,
      companyId: delivery.commission.companyId,
      paperclipProjectId: delivery.commission.paperclipProjectId,
      sophiaProjectId: delivery.projectId,
      workId: delivery.workId,
      commissionKey: delivery.commission.key,
      deliveryKey: delivery.deliveryKey,
      initiator: delivery.initiator,
      nonce: randomUUID(),
      iat: now,
      exp: now + ENVELOPE_SECONDS,
    },
    body,
    options.signingKey,
  )
}

/** The outcome to record, and the result and reason to keep with it. */
interface Recorded {
  readonly outcome: DeliveryOutcome
  readonly result: Readonly<Record<string, unknown>> | null
  readonly reason: string | null
}

function settled<T extends object>(answer: PluginAnswer<T>, delivered: (body: T) => Recorded): Recorded {
  if (answer.kind === 'ok') return delivered(answer.body)
  if (answer.kind === 'refused') {
    return {
      outcome: 'rejected',
      result: { status: answer.status, code: answer.code },
      reason: `${answer.code}: ${answer.message}`,
    }
  }
  return { outcome: 'unknown', result: null, reason: answer.reason }
}

async function commission(delivery: CoordinationDelivery, options: CoordinationOptions): Promise<Recorded> {
  const c = delivery.commission
  if (delivery.reconcile) {
    // Never create again on an unknown outcome: find the issue the key may already hold, or prove there is none.
    const lookup = { key: c.key, sophiaProjectId: delivery.projectId, workId: delivery.workId }
    const answer = await options.client.lookup({
      companyId: c.companyId,
      envelope: sign(delivery, 'lookup', lookup, options),
      lookup,
    })
    return settled(answer, (body) =>
      body.outcome === 'found'
        ? {
            outcome: 'delivered',
            result: { issueId: body.issueId, status: body.status, reconciled: true },
            reason: null,
          }
        : { outcome: 'absent', result: null, reason: 'no issue holds the commission key; it is sent again' },
    )
  }
  const payload = {
    key: c.key,
    sophiaProjectId: delivery.projectId,
    paperclipProjectId: c.paperclipProjectId,
    workId: delivery.workId,
    title: c.title,
    description: c.description,
    initialStatus: c.initialStatus,
    wake: c.wake,
  }
  const answer = await options.client.commission({
    companyId: c.companyId,
    envelope: sign(delivery, 'commission', payload, options),
    commission: payload,
  })
  return settled(answer, (body) => ({
    outcome: 'delivered',
    result: { issueId: body.issueId, status: body.status, outcome: body.outcome, wakeQueued: body.wakeQueued },
    reason: null,
  }))
}

async function control(delivery: CoordinationDelivery, op: ControlOp, options: CoordinationOptions): Promise<Recorded> {
  const issueId = delivery.commission.issueId
  if (issueId === null) return { outcome: 'unknown', result: null, reason: 'the commission has no issue yet' }
  const payload = {
    op,
    key: delivery.deliveryKey,
    commissionKey: delivery.commission.key,
    sophiaProjectId: delivery.projectId,
    workId: delivery.workId,
  }
  const answer = await options.client.control(issueId, {
    envelope: sign(delivery, op, payload, options),
    control: payload,
  })
  return settled(answer, (body) => ({
    outcome: 'delivered',
    result: { issueId: body.issueId, status: body.status, outcome: body.outcome },
    reason: null,
  }))
}

/** Send one claimed delivery and record its outcome. A thrown error is an unknown outcome, never a success. */
async function deliver(
  pool: pg.Pool,
  delivery: CoordinationDelivery,
  options: CoordinationOptions,
): Promise<DeliveryOutcome> {
  let recorded: Recorded
  try {
    recorded =
      delivery.op === 'commission' ? await commission(delivery, options) : await control(delivery, delivery.op, options)
  } catch (err: unknown) {
    recorded = {
      outcome: 'unknown',
      result: null,
      reason: err instanceof Error ? err.message.slice(0, 400) : 'delivery failed',
    }
  }
  await recordCoordinationDelivery(pool, delivery, recorded.outcome, recorded.result, recorded.reason)
  return recorded.outcome
}

/** One pass. Safe to run from several workers at once: claims skip locked rows. */
export async function coordinateOnce(pool: pg.Pool, options: CoordinationOptions): Promise<CoordinationPass> {
  const expired = await expireCoordinationLeases(pool)
  const claimed = await claimCoordinationOutbox(
    pool,
    options.workerId,
    options.batchSize ?? 10,
    options.leaseSeconds ?? 60,
  )
  const outcomes: Array<{ id: string; op: string; outcome: DeliveryOutcome }> = []
  let lost = 0
  for (const delivery of claimed) {
    try {
      const outcome = await deliver(pool, delivery, options)
      outcomes.push({ id: delivery.id, op: delivery.op, outcome })
      options.log?.(`coordination ${delivery.op} ${delivery.deliveryKey}: ${outcome}`)
    } catch (err: unknown) {
      // The lease was lost meanwhile: the row is reconciled on a later pass, never recorded twice here.
      lost += 1
      options.log?.(`coordination ${delivery.id} did not record: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { expired, delivered: outcomes.filter((o) => o.outcome === 'delivered').length, outcomes, lost }
}

/** Run passes until stopped, every `idleMs`, and again at once after a pass that moved something. */
export class CoordinationDispatcher {
  private stopped = false
  private loop: Promise<void> | null = null
  private wake: (() => void) | null = null
  private readonly pool: pg.Pool
  private readonly options: CoordinationOptions & { readonly idleMs?: number }

  constructor(pool: pg.Pool, options: CoordinationOptions & { readonly idleMs?: number }) {
    this.pool = pool
    this.options = options
  }

  start(): void {
    this.loop ??= this.run()
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      try {
        const pass = await coordinateOnce(this.pool, this.options)
        if (pass.outcomes.length > 0 || pass.expired > 0) continue
      } catch (err: unknown) {
        this.options.log?.(`coordination pass failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, this.options.idleMs ?? 3000)
        function done() {
          clearTimeout(timer)
          resolve()
        }
        this.wake = done
      })
      this.wake = null
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.wake?.()
    await this.loop
  }
}

export interface HttpClientOptions {
  /** The Paperclip service's fixed private origin, e.g. http://paperclip.internal:3100. */
  readonly origin: string
  /** The integration board principal's API key (backend-only; never in Studio). */
  readonly token: string
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
}

/** Status codes that prove nothing reached the plugin's worker or changed: the host or the plugin refused. */
const definite = (status: number) => status >= 400 && status < 500 && status !== 404 && status !== 408 && status !== 429

/** The plugin's routes over HTTP. No answer, a timeout or a 5xx is unknown; a 4xx refusal is definite. */
export function httpPaperclipClient(options: HttpClientOptions): PaperclipClient {
  const base = `${options.origin.replace(/\/+$/, '')}/api/plugins/${PLUGIN_ID}/api`
  const send = async <T>(
    path: string,
    body: unknown,
    accept: (value: unknown) => value is T,
  ): Promise<PluginAnswer<T>> => {
    let res: Response
    try {
      res = await (options.fetch ?? fetch)(`${base}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      })
    } catch (err: unknown) {
      return {
        kind: 'unknown',
        reason: `no answer from Paperclip: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
    const text = await res.text().catch(() => '')
    let value: unknown = null
    try {
      value = text ? JSON.parse(text) : null
    } catch {
      value = null
    }
    if (res.ok)
      return accept(value)
        ? { kind: 'ok', body: value }
        : { kind: 'unknown', reason: `Paperclip answered ${String(res.status)} with an unexpected body` }
    if (!definite(res.status)) return { kind: 'unknown', reason: `Paperclip answered ${String(res.status)}` }
    const refusal = isPluginRefusal(value)
      ? value.error
      : { code: `http_${String(res.status)}`, message: text.slice(0, 300) || res.statusText }
    return { kind: 'refused', status: res.status, code: refusal.code, message: refusal.message }
  }
  return {
    commission: (request) => send(ROUTES.commission, request, isCommissionReply),
    lookup: (request) => send(ROUTES.lookup, request, isLookupReply),
    control: (issueId, request) => send(ROUTES.control(issueId), request, isControlReply),
  }
}
