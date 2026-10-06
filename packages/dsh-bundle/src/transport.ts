/**
 * Outbound, authenticated transport from the bridge to the Sophia service.
 *
 * The bridge only ever connects out: it long-polls the service's runtime
 * outbox and posts receipts and durable observations back. No listening
 * socket is opened inside the runtime. The service side is the API's
 * `/v1/runtime/*` (amendment A04); tests may still run the same protocol
 * against the labelled fixture (tests/support/fixture-service.mjs).
 *
 *   POST {base}/v1/runtime/hello          -> RuntimeHelloReply
 *   GET  {base}/v1/runtime/commands?after=<cursor>&waitMs=<ms> -> RuntimeCommandBatch
 *   POST {base}/v1/runtime/receipts       <- RuntimeReceiptBatch
 *   POST {base}/v1/runtime/observations   <- RuntimeObservationBatch
 *   POST {base}/v1/runtime/ready          <- RuntimeReady
 *   POST {base}/v1/runtime/research/{context,reserve,settle,capture,draft,submit,render,render-result}  (SMC-M03, A11)
 *   POST {base}/v1/runtime/design/{context,record,source,patch,render,render-result,capture,reserve,settle,submit}  (SDD-01, A12)
 *   POST {base}/v1/runtime/review/{context,capture,submit}  (SDD-01, A12)
 *   POST {base}/v1/runtime/source-review/{context,reserve,settle,submit}  (WBC-02, A13)
 *
 * Every reply is validated against the contract before the bridge reads it,
 * and every body is validated before it is sent: a reply that breaks the
 * contract is a transport failure, never a cast. Each command in a batch is
 * validated on its own by `parseCommand`, so one malformed command earns a
 * rejected receipt and does not block the queue.
 *
 * Every request carries `Authorization: Bearer <token>` plus the runtime unit
 * and bridge instance headers. The token is bound server-side to the runtime
 * unit, project, lease and epoch; the bridge never chooses its own authority.
 * @module @sophia/dsh-bundle/transport
 */

import { describeFailure } from './protocol.js'
import { wire } from './runtime-wire.generated.js'
import type { WireValidator } from './runtime-wire.generated.js'
import type {
  DesignCaptureReply,
  DesignDeliveryAck,
  DesignDeliveryReceipt,
  DesignCaptureRequest,
  DesignContextReply,
  DesignContextRequest,
  DesignPatchRequest,
  DesignRecord,
  DesignRecordRequest,
  DesignRender,
  DesignRenderRequest,
  DesignRenderResultRequest,
  DesignSourceReply,
  DesignSubmission,
  DesignSubmitRequest,
  DesignWriteRequest,
  ResearchCapture,
  ResearchCaptureRequest,
  ResearchContextReply,
  ResearchContextRequest,
  ResearchDraft,
  ResearchDraftRequest,
  ResearchRender,
  ResearchRenderRequest,
  ResearchRenderResultRequest,
  ResearchReservation,
  ResearchReserveRequest,
  ResearchSettleRequest,
  ResearchSettlement,
  ResearchSubmission,
  ResearchSubmitRequest,
  ReviewContextReply,
  ReviewSubmission,
  ReviewSubmitRequest,
  SourceReviewContextReply,
  SourceReviewContextRequest,
  SourceReviewSubmission,
  SourceReviewSubmitRequest,
  RuntimeCommandBatch,
  RuntimeHello,
  RuntimeHelloReply,
  RuntimeObservation,
  RuntimeReady,
  RuntimeReceipt,
  RuntimeServiceBinding,
} from './runtime-wire-types.generated.js'

/** A binding the service expects this runtime to own after (re)connect. */
export type ServiceBinding = RuntimeServiceBinding

/** The service's answer to `hello`. */
export type HelloReply = RuntimeHelloReply

/** One durable native fact, keyed by `(runtimeUnitId, nativeSessionId, nativeSeq)`. */
export type Observation = RuntimeObservation

/** A binding reconciliation could not restore; its commands are refused until a Resume succeeds. */
export type UnrecoveredBinding = RuntimeReady['unrecovered'][number]

/** Where and how to reach the service; resolved from environment references. */
export interface TransportOptions {
  readonly baseUrl: string
  readonly token: string
  readonly runtimeUnitId: string
  readonly bridgeInstanceId: string
}

/**
 * Transport failures carry the HTTP status when the service answered, and the contract error code when its body was
 * a contract Error (`research_limit_reached`, `invalid_state`, …). The service's message is never kept: it is not
 * the bridge's to repeat to a model.
 */
export class TransportError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message)
  }
}

/** The contract error code of a failed reply's body, if it carries one. */
async function errorCodeOf(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined
    return typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : undefined
  } catch {
    return undefined
  }
}

/** `value` as `T`, or a TransportError naming the contract failure. */
function checked<T>(what: string, validator: WireValidator<T>, value: unknown): T {
  if (!validator(value)) throw new TransportError(`${what} does not match the runtime contract: ${describeFailure(validator)}`)
  return value
}

/** Minimal JSON-over-HTTPS client for the runtime channel. */
export class ServiceTransport {
  constructor(private readonly options: TransportOptions) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.options.token}`,
      'content-type': 'application/json',
      'x-sophia-runtime-unit': this.options.runtimeUnitId,
      'x-sophia-bridge-instance': this.options.bridgeInstanceId,
      'x-sophia-bridge-protocol': '1',
    }
  }

  /** One call; resolves to the parsed JSON reply, or undefined for 204. */
  private async request(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(new URL(path, this.options.baseUrl), {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      const code = await errorCodeOf(response)
      throw new TransportError(`${method} ${path} answered ${response.status}${code ? ` ${code}` : ''}`, response.status, code)
    }
    if (response.status === 204) return undefined
    try {
      return await response.json()
    } catch {
      throw new TransportError(`${method} ${path} answered a body that is not JSON`, response.status)
    }
  }

  async hello(body: RuntimeHello): Promise<HelloReply> {
    checked('hello request', wire.RuntimeHello, body)
    return checked('hello reply', wire.RuntimeHelloReply, await this.request('POST', '/v1/runtime/hello', body))
  }

  async poll(after: number, waitMs: number, signal: AbortSignal): Promise<RuntimeCommandBatch> {
    const reply = await this.request('GET', `/v1/runtime/commands?after=${after}&waitMs=${waitMs}`, undefined, signal)
    return checked('command batch', wire.RuntimeCommandBatch, reply)
  }

  async receipts(receipts: readonly RuntimeReceipt[]): Promise<void> {
    for (const receipt of receipts) checked('receipt', wire.RuntimeReceipt, receipt)
    await this.request('POST', '/v1/runtime/receipts', { receipts })
  }

  async observations(observations: readonly Observation[]): Promise<void> {
    for (const observation of observations) checked('observation', wire.RuntimeObservation, observation)
    await this.request('POST', '/v1/runtime/observations', { observations })
  }

  async ready(state: 'ready' | 'not_ready', reason: string | null, unrecovered: readonly UnrecoveredBinding[] = []): Promise<void> {
    const body = checked('ready report', wire.RuntimeReady, { state, reason, unrecovered })
    await this.request('POST', '/v1/runtime/ready', body)
  }

  // The research tools' operations (SMC-M03 S4, A11): each request and reply checked against the contract.

  async researchContext(body: ResearchContextRequest, signal?: AbortSignal): Promise<ResearchContextReply> {
    checked('research context request', wire.ResearchContextRequest, body)
    return checked('research context', wire.ResearchContextReply, await this.request('POST', '/v1/runtime/research/context', body, signal))
  }

  /** Never takes a signal: a reservation the service made comes back to be settled, never orphaned by a cancel. */
  async researchReserve(body: ResearchReserveRequest): Promise<ResearchReservation> {
    checked('reservation request', wire.ResearchReserveRequest, body)
    return checked('reservation', wire.ResearchReservation, await this.request('POST', '/v1/runtime/research/reserve', body))
  }

  /** Never takes a signal: a call that was paid for is accounted even when its tool is cancelled. */
  async researchSettle(body: ResearchSettleRequest): Promise<ResearchSettlement> {
    checked('settlement request', wire.ResearchSettleRequest, body)
    return checked('settlement', wire.ResearchSettlement, await this.request('POST', '/v1/runtime/research/settle', body))
  }

  async researchCapture(body: ResearchCaptureRequest, signal?: AbortSignal): Promise<ResearchCapture> {
    checked('capture request', wire.ResearchCaptureRequest, body)
    return checked('capture', wire.ResearchCapture, await this.request('POST', '/v1/runtime/research/capture', body, signal))
  }

  async researchDraft(body: ResearchDraftRequest, signal?: AbortSignal): Promise<ResearchDraft> {
    checked('draft request', wire.ResearchDraftRequest, body)
    return checked('draft', wire.ResearchDraft, await this.request('POST', '/v1/runtime/research/draft', body, signal))
  }

  /** Never takes a signal: ending a task is one transaction that must come back with its outcome. */
  async researchSubmit(body: ResearchSubmitRequest): Promise<ResearchSubmission> {
    checked('submit request', wire.ResearchSubmitRequest, body)
    return checked('submission', wire.ResearchSubmission, await this.request('POST', '/v1/runtime/research/submit', body))
  }

  /** Print the current draft as the task's PDF and queue it (S5b); the service prints, the request carries no markup. */
  async researchRender(body: ResearchRenderRequest, signal?: AbortSignal): Promise<ResearchRender> {
    checked('render request', wire.ResearchRenderRequest, body)
    return checked('render', wire.ResearchRender, await this.request('POST', '/v1/runtime/research/render', body, signal))
  }

  async researchRenderResult(body: ResearchRenderResultRequest, signal?: AbortSignal): Promise<ResearchRender> {
    checked('render result request', wire.ResearchRenderResultRequest, body)
    return checked('render', wire.ResearchRender, await this.request('POST', '/v1/runtime/research/render-result', body, signal))
  }

  // The design and review tools' operations (SDD-01, A12): each request and reply checked against the contract.

  async designContext(body: DesignContextRequest, signal?: AbortSignal): Promise<DesignContextReply> {
    checked('design context request', wire.DesignContextRequest, body)
    return checked('design context', wire.DesignContextReply, await this.request('POST', '/v1/runtime/design/context', body, signal))
  }

  async designRecord(body: DesignRecordRequest, signal?: AbortSignal): Promise<DesignRecord> {
    checked('work record request', wire.DesignRecordRequest, body)
    return checked('work record', wire.DesignRecord, await this.request('POST', '/v1/runtime/design/record', body, signal))
  }

  async designSource(body: DesignWriteRequest, signal?: AbortSignal): Promise<DesignSourceReply> {
    checked('source request', wire.DesignWriteRequest, body)
    return checked('source', wire.DesignSourceReply, await this.request('POST', '/v1/runtime/design/source', body, signal))
  }

  async designPatch(body: DesignPatchRequest, signal?: AbortSignal): Promise<DesignSourceReply> {
    checked('patch request', wire.DesignPatchRequest, body)
    return checked('source', wire.DesignSourceReply, await this.request('POST', '/v1/runtime/design/patch', body, signal))
  }

  async designRender(body: DesignRenderRequest, signal?: AbortSignal): Promise<DesignRender> {
    checked('design render request', wire.DesignRenderRequest, body)
    return checked('design render', wire.DesignRender, await this.request('POST', '/v1/runtime/design/render', body, signal))
  }

  async designRenderResult(body: DesignRenderResultRequest, signal?: AbortSignal): Promise<DesignRender> {
    checked('design render result request', wire.DesignRenderResultRequest, body)
    return checked('design render', wire.DesignRender, await this.request('POST', '/v1/runtime/design/render-result', body, signal))
  }

  /** The captures the designer (or, by `role`, the reviewer) inspects: their pixels, checked by the service. */
  async designCapture(role: 'design' | 'review', body: DesignCaptureRequest, signal?: AbortSignal): Promise<DesignCaptureReply> {
    checked('capture request', wire.DesignCaptureRequest, body)
    return checked('captures', wire.DesignCaptureReply, await this.request('POST', `/v1/runtime/${role}/capture`, body, signal))
  }

  /**
   * The model was handed each capture of a delivery, unchanged, as a stored image: they now count as seen. The design
   * tools send it only for a look whose receipt a submit named, and send the same body again until it is answered; the
   * service answers a replay the same and counts nothing twice.
   */
  async designDelivered(role: 'design' | 'review', body: DesignDeliveryAck, signal?: AbortSignal): Promise<DesignDeliveryReceipt> {
    checked('delivery acknowledgement', wire.DesignDeliveryAck, body)
    return checked('delivery', wire.DesignDeliveryReceipt, await this.request('POST', `/v1/runtime/${role}/delivered`, body, signal))
  }

  /** A model call of the designer or the reviewer, reserved against the research lineage's allowance. */
  async designReserve(body: ResearchReserveRequest): Promise<ResearchReservation> {
    checked('reservation request', wire.ResearchReserveRequest, body)
    return checked('reservation', wire.ResearchReservation, await this.request('POST', '/v1/runtime/design/reserve', body))
  }

  async designSettle(body: ResearchSettleRequest): Promise<ResearchSettlement> {
    checked('settlement request', wire.ResearchSettleRequest, body)
    return checked('settlement', wire.ResearchSettlement, await this.request('POST', '/v1/runtime/design/settle', body))
  }

  /** `signal` bounds the wait for an answer; the design tools then send the same call (same key) again, never a new one. */
  async designSubmit(body: DesignSubmitRequest, signal?: AbortSignal): Promise<DesignSubmission> {
    checked('design submit request', wire.DesignSubmitRequest, body)
    return checked('design submission', wire.DesignSubmission, await this.request('POST', '/v1/runtime/design/submit', body, signal))
  }

  async reviewContext(body: DesignContextRequest, signal?: AbortSignal): Promise<ReviewContextReply> {
    checked('review context request', wire.DesignContextRequest, body)
    return checked('review context', wire.ReviewContextReply, await this.request('POST', '/v1/runtime/review/context', body, signal))
  }

  /** `signal` bounds the wait for an answer, as designSubmit's. */
  async reviewSubmit(body: ReviewSubmitRequest, signal?: AbortSignal): Promise<ReviewSubmission> {
    checked('review submit request', wire.ReviewSubmitRequest, body)
    return checked('review submission', wire.ReviewSubmission, await this.request('POST', '/v1/runtime/review/submit', body, signal))
  }

  // The source reviewer's operations (WBC-02, A13): the same checks; its model calls reserve and settle through the
  // shared research accounting under the review's own allowance.

  async sourceReviewContext(body: SourceReviewContextRequest, signal?: AbortSignal): Promise<SourceReviewContextReply> {
    checked('review context request', wire.SourceReviewContextRequest, body)
    return checked('review context', wire.SourceReviewContextReply, await this.request('POST', '/v1/runtime/source-review/context', body, signal))
  }

  /** Never takes a signal, as researchReserve. */
  async sourceReviewReserve(body: ResearchReserveRequest): Promise<ResearchReservation> {
    checked('review reservation request', wire.ResearchReserveRequest, body)
    return checked('review reservation', wire.ResearchReservation, await this.request('POST', '/v1/runtime/source-review/reserve', body))
  }

  /** Never takes a signal, as researchSettle. */
  async sourceReviewSettle(body: ResearchSettleRequest): Promise<ResearchSettlement> {
    checked('review settlement request', wire.ResearchSettleRequest, body)
    return checked('review settlement', wire.ResearchSettlement, await this.request('POST', '/v1/runtime/source-review/settle', body))
  }

  /** Never takes a signal: publishing a review is one transaction that must come back with its outcome. */
  async sourceReviewSubmit(body: SourceReviewSubmitRequest): Promise<SourceReviewSubmission> {
    checked('review submit request', wire.SourceReviewSubmitRequest, body)
    return checked('review submission', wire.SourceReviewSubmission, await this.request('POST', '/v1/runtime/source-review/submit', body))
  }
}
