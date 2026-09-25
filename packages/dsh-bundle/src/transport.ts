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

/** Transport failures carry the HTTP status when the service answered. */
export class TransportError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
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
      throw new TransportError(`${method} ${path} answered ${response.status}`, response.status)
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
}
