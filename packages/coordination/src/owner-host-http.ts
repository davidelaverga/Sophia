// Fixed-origin bounded HostChannel transport. Errors carry only a finite outcome; no body, code or credential echo.
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs'
import {
  isSecret,
  helloRefusal,
  checkExchangeRequest,
  type HostChannel,
  type HostHello,
  type HelloResult,
  type Delivered,
  type GoResult,
  type AnswerResult,
} from './owner-host-channel.ts'
import type { RunnerAnswer, RunObservation, RunnerCollection } from './runner-port.ts'

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const MAX = 65_536
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]) =>
  Object.keys(v).toSorted().join(',') === expected.toSorted().join(',')
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const text = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max
export class OwnerHostHttpError extends Error {
  readonly outcome: 'unknown' | 'refused' | 'conflict'
  constructor(outcome: 'unknown' | 'refused' | 'conflict' = 'unknown') {
    super(`Owner host request ${outcome}`)
    this.name = 'OwnerHostHttpError'
    this.outcome = outcome
  }
}

/** Owner-only regular file, bounded through its open descriptor; never follows a symlink or prints a path/value. */
export function readOwnerSecret(file: string): string {
  let fd: number | undefined
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    const s = fstatSync(fd)
    if (
      !s.isFile() ||
      (s.mode & 0o077) !== 0 ||
      typeof process.getuid !== 'function' ||
      s.uid !== process.getuid() ||
      s.size > 4097
    )
      throw new Error()
    const value = readFileSync(fd, 'utf8').trim()
    if (!/^[\x21-\x7e]{16,4096}$/.test(value)) throw new Error()
    return value
  } catch {
    throw new OwnerHostHttpError('refused')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function ownerHostOrigin(raw: string, loopbackTest = false): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new OwnerHostHttpError('refused')
  }
  if (raw !== url.origin && raw !== url.origin + '/') throw new OwnerHostHttpError('refused')
  const loopback = new Set(['127.0.0.1', '[::1]', 'localhost']).has(url.hostname)
  // Exact origin spelling above excludes userinfo, paths, queries and fragments, including empty delimiters.
  if (url.protocol !== 'https:' && !(loopbackTest && loopback && url.protocol === 'http:'))
    throw new OwnerHostHttpError('refused')
  return url.origin
}

export interface OwnerHostHttpOptions {
  origin: string
  capabilityFile: string
  /** Explicit local fixture mode only; never permits HTTP outside loopback. */
  loopbackTest?: boolean
  timeoutMs?: number
  fetch?: typeof fetch
}
export type HostRedemption =
  | { result: 'bound'; hostId: string; ownerId: string; connectionId: string; replayed: boolean }
  | { result: 'refused'; reason: string }

async function readBounded(response: Response): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  let count = 0
  const reader = response.body?.getReader()
  if (!reader) throw new OwnerHostHttpError()
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      const value: unknown = chunk.value
      if (!(value instanceof Uint8Array)) throw new OwnerHostHttpError()
      count += value.byteLength
      if (count > MAX) throw new OwnerHostHttpError()
      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => undefined)
    throw new OwnerHostHttpError()
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

async function responseJson(response: Response, capability: string): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel()
    throw new OwnerHostHttpError(
      response.status === 409 ? 'conflict' : [401, 403, 422].includes(response.status) ? 'refused' : 'unknown',
    )
  }
  const bytes = await readBounded(response)
  let raw: string
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new OwnerHostHttpError()
  }
  if (raw.includes(capability)) throw new OwnerHostHttpError()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (JSON.stringify(parsed).includes(capability)) throw new OwnerHostHttpError()
    return parsed
  } catch {
    throw new OwnerHostHttpError()
  }
}

function redemption(v: unknown): HostRedemption {
  if (!record(v)) throw new OwnerHostHttpError()

  if (
    v.result === 'bound' &&
    keys(v, ['result', 'hostId', 'ownerId', 'connectionId', 'replayed']) &&
    id(v.hostId) &&
    id(v.ownerId) &&
    id(v.connectionId) &&
    typeof v.replayed === 'boolean'
  )
    return {
      result: 'bound',
      hostId: v.hostId,
      ownerId: v.ownerId,
      connectionId: v.connectionId,
      replayed: v.replayed,
    }
  // Refusal reason is deliberately fixed, not an echo from a server.
  if (v.result === 'refused' && keys(v, ['result', 'reason']) && text(v.reason))
    return { result: 'refused', reason: 'Pairing refused' }
  throw new OwnerHostHttpError()
}

const hostState = (v: unknown): v is string => typeof v === 'string' && ['active', 'retired', 'bound'].includes(v)
function helloResult(v: unknown): HelloResult {
  if (!record(v)) throw new OwnerHostHttpError()

  if (
    v.result === 'ok' &&
    keys(v, ['result', 'hostId', 'state', 'first']) &&
    id(v.hostId) &&
    hostState(v.state) &&
    typeof v.first === 'boolean'
  )
    return { result: 'ok', hostId: v.hostId, state: v.state, first: v.first }
  const fields = [
    'journalId',
    'environmentRef',
    'adapterPin',
    'profileId',
    'profileRevision',
    'accountKey',
    't3Namespace',
  ]
  if (
    v.result === 'conflict' &&
    keys(v, ['result', 'hostId', 'changed']) &&
    id(v.hostId) &&
    Array.isArray(v.changed) &&
    v.changed.every((item): item is string => typeof item === 'string' && fields.includes(item))
  )
    return { result: 'conflict', hostId: v.hostId, changed: v.changed }
  throw new OwnerHostHttpError()
}

function goResult(v: unknown): GoResult {
  if (!record(v)) throw new OwnerHostHttpError()

  if (
    v.result === 'go' &&
    keys(v, 'payload' in v ? ['result', 'payload'] : ['result']) &&
    (!('payload' in v) || text(v.payload, MAX))
  )
    return typeof v.payload === 'string' ? { result: 'go', payload: v.payload } : { result: 'go' }
  if (
    v.result === 'denied' &&
    keys(v, ['result', 'reason', 'grantedBefore']) &&
    text(v.reason) &&
    typeof v.grantedBefore === 'boolean'
  )
    return { result: 'denied', reason: 'GO denied', grantedBefore: v.grantedBefore }
  throw new OwnerHostHttpError()
}

export class HttpHostChannel implements HostChannel {
  private readonly origin: string
  private readonly o: OwnerHostHttpOptions
  constructor(options: OwnerHostHttpOptions) {
    this.origin = ownerHostOrigin(options.origin, options.loopbackTest === true)
    this.o = options
    if (
      options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 10_000)
    )
      throw new OwnerHostHttpError('refused')
  }
  private async request(
    path: string,
    makeBody: (capability: string) => unknown,
    authenticated = true,
  ): Promise<unknown> {
    const capability = readOwnerSecret(this.o.capabilityFile)
    if (!isSecret(capability)) throw new OwnerHostHttpError('refused')
    const body = JSON.stringify(makeBody(capability))
    if (Buffer.byteLength(body, 'utf8') > MAX) throw new OwnerHostHttpError('refused')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.o.timeoutMs ?? 10_000)
    try {
      const response = await (this.o.fetch ?? fetch)(this.origin + path, {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(authenticated ? { authorization: `Bearer ${capability}` } : {}),
        },
        body,
      })
      return await responseJson(response, capability)
    } catch (err) {
      if (err instanceof OwnerHostHttpError) throw err
      throw new OwnerHostHttpError()
    } finally {
      clearTimeout(timer)
    }
  }
  async redeem(code: string): Promise<HostRedemption> {
    if (!isSecret(code)) throw new OwnerHostHttpError('refused')
    const v = await this.request('/api/v1/owner-host/redeem', (capability: string) => ({ code, capability }), false)
    return redemption(v)
  }
  async hello(hello: HostHello): Promise<HelloResult> {
    if (helloRefusal(hello)) throw new OwnerHostHttpError('refused')
    const v = await this.request('/api/v1/owner-host/hello', () => hello)
    return helloResult(v)
  }
  async poll(limit: number, redeliverSeconds: number): Promise<Delivered[]> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 5 ||
      !Number.isSafeInteger(redeliverSeconds) ||
      redeliverSeconds < 1 ||
      redeliverSeconds > 60
    )
      throw new OwnerHostHttpError('refused')
    const v = await this.request('/api/v1/owner-host/poll', () => ({ limit, redeliverSeconds }))
    if (!Array.isArray(v) || v.length > limit) throw new OwnerHostHttpError()
    return v.map((item: unknown) => {
      if (
        !record(item) ||
        !keys(item, ['exchangeId', 'kind', 'request', 'deadlineAt']) ||
        !id(item.exchangeId) ||
        !text(item.deadlineAt, 100) ||
        !Number.isFinite(Date.parse(item.deadlineAt))
      )
        throw new OwnerHostHttpError()
      const checked = checkExchangeRequest(item.request)
      if (!checked.ok || checked.request.kind !== item.kind) throw new OwnerHostHttpError()
      return {
        exchangeId: item.exchangeId,
        kind: checked.request.kind,
        request: checked.request,
        deadlineAt: item.deadlineAt,
      }
    })
  }
  async go(exchangeId: string): Promise<GoResult> {
    if (!id(exchangeId)) throw new OwnerHostHttpError('refused')
    const v = await this.request(`/api/v1/owner-host/exchanges/${exchangeId}/go`, () => ({}))
    return goResult(v)
  }
  async answer(exchangeId: string, answer: RunnerAnswer | RunObservation | RunnerCollection): Promise<AnswerResult> {
    if (!id(exchangeId)) throw new OwnerHostHttpError('refused')
    const v = await this.request(`/api/v1/owner-host/exchanges/${exchangeId}/answer`, () => answer)
    if (record(v) && keys(v, ['result']) && (v.result === 'ok' || v.result === 'conflict')) return { result: v.result }
    throw new OwnerHostHttpError()
  }
}
