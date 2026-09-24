/**
 * Outbound, authenticated transport from the bridge to the Sophia service.
 *
 * The bridge only ever connects out: it long-polls the service's runtime
 * outbox and posts receipts and durable observations back. No listening
 * socket is opened inside the runtime. Until S1-02 ships the real endpoint,
 * tests run the same wire protocol against a labelled fixture service
 * (tests/support/fixture-service.mjs).
 *
 *   POST {base}/v1/runtime/hello          -> { projectId, leaseId, authorityEpoch, bindings, cursor }
 *   GET  {base}/v1/runtime/commands?after=<cursor>&waitMs=<ms> -> { commands: [{ seq, command }], cursor }
 *   POST {base}/v1/runtime/receipts       <- { receipts: RuntimeReceipt[] }
 *   POST {base}/v1/runtime/observations   <- { observations: Observation[] }
 *   POST {base}/v1/runtime/ready          <- { state, reason, unrecovered: [{ attemptId, reason }] }
 *
 * Every request carries `Authorization: Bearer <token>` plus the runtime unit
 * and bridge instance headers. The token is bound server-side to the runtime
 * unit, project, lease and epoch; the bridge never chooses its own authority.
 * @module @sophia/dsh-bundle/transport
 */

import type { RuntimeReceipt } from './protocol.js'

/** A binding the service expects this runtime to own after (re)connect. */
export interface ServiceBinding {
  readonly attemptId: string
  readonly nativeSessionId: string
  readonly authorityEpoch: number
  readonly state: 'active' | 'held' | 'stopped'
}

/** The service's answer to `hello`. */
export interface HelloReply {
  readonly projectId: string
  readonly leaseId: string
  readonly authorityEpoch: number
  readonly bindings: readonly ServiceBinding[]
  readonly cursor: number
}

/** One durable native fact, keyed by `(runtimeUnitId, nativeSessionId, nativeSeq)`. */
export interface Observation {
  readonly runtimeUnitId: string
  readonly attemptId: string
  readonly nativeSessionId: string
  readonly nativeSeq: number
  readonly type: string
  readonly durable: true
  readonly data: unknown
}

/** A binding reconciliation could not restore; its commands are refused until a Resume succeeds. */
export interface UnrecoveredBinding {
  readonly attemptId: string
  readonly reason: string
}

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

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(new URL(path, this.options.baseUrl), {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      throw new TransportError(`${method} ${path} answered ${response.status}`, response.status)
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  }

  hello(body: { bundle: string; protocolVersion: number; dshVersion: string }): Promise<HelloReply> {
    return this.request('POST', '/v1/runtime/hello', body)
  }

  poll(after: number, waitMs: number, signal: AbortSignal): Promise<{ commands: { seq: number; command: unknown }[]; cursor: number }> {
    return this.request('GET', `/v1/runtime/commands?after=${after}&waitMs=${waitMs}`, undefined, signal)
  }

  receipts(receipts: readonly RuntimeReceipt[]): Promise<void> {
    return this.request('POST', '/v1/runtime/receipts', { receipts })
  }

  observations(observations: readonly Observation[]): Promise<void> {
    return this.request('POST', '/v1/runtime/observations', { observations })
  }

  ready(state: 'ready' | 'not_ready', reason: string | null, unrecovered: readonly UnrecoveredBinding[] = []): Promise<void> {
    return this.request('POST', '/v1/runtime/ready', { state, reason, unrecovered })
  }
}
