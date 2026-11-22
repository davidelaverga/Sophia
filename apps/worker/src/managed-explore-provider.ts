// OpenAI Managed Agents beta wire adapter for Explore. The dispatcher owns
// admission, immutable submission keys, durable identity, and settlement.
import { createHash } from 'node:crypto'

const OPENAI_BASE = 'https://api.openai.com/v1'
const SESSIONS = '/agents/sessions'
const OPERATION_TAG = 'sophia_operation_id'
const PROTOTYPE_PATH = '/workspace/outputs/index.html'
const MAX_PROTOTYPE_BYTES = 2 * 1024 * 1024
const MAX_JSON_BYTES = 4 * 1024 * 1024
const MAX_OUTPUT_TEXT_BYTES = 256 * 1024
const MAX_PAGES = 20

const SESSION_STATES = ['idle', 'in_progress', 'requires_action', 'failed', 'budget_reached'] as const
const TURN_STATES = ['queued', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled'] as const
const ENVIRONMENT_STATES = [
  'pending',
  'provisioning',
  'ready',
  'connected',
  'disconnected',
  'suspended',
  'expired',
  'failed',
] as const

type ObjectValue = Record<string, unknown>
type Disposition = 'terminal' | 'retry_read' | 'retry_same_key' | 'reconcile'
type Failure =
  | 'authorization'
  | 'model_unavailable'
  | 'credit_exhausted'
  | 'budget_exceeded'
  | 'billing_unavailable'
  | 'declined'
  | 'not_found'
  | 'conflict'
  | 'transient'
  | 'delivery_unknown'
  | 'invalid_response'
  | 'ambiguous_session'
  | 'turn_not_completed'
  | 'artifact_missing'
  | 'artifact_invalid'
  | 'invalid_input'

export class ManagedExploreProviderError extends Error {
  readonly code: Failure
  readonly disposition: Disposition
  readonly requestId: string | null
  readonly status: number | null

  constructor(code: Failure, disposition: Disposition, response?: Response | string | null) {
    super(`Managed Explore provider: ${code}`)
    this.name = 'ManagedExploreProviderError'
    this.code = code
    this.disposition = disposition
    const wireResponse = response instanceof Response ? response : undefined
    this.requestId = typeof response === 'string' ? response : headerRequestId(wireResponse)
    this.status = wireResponse?.status ?? null
  }
}

interface ProviderResult<T> {
  value: T
  requestId: string | null
}

export interface ManagedExploreSession {
  id: string
  operationId: string | null
  model: string
  environmentId: string
  status: (typeof SESSION_STATES)[number]
  createdAt: number
  spendControl: { limitCents: number | null; consumedCents: number | null } | null
}

export interface ManagedExploreRootTurn {
  id: string
  sessionId: string
  status: (typeof TURN_STATES)[number]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null
  failure: Failure | 'provider_failed' | null
}

export interface ManagedExplorePrototype {
  artifactId: string
  sessionId: string
  turnId: string
  environmentId: string
  path: typeof PROTOTYPE_PATH
  mimeType: 'text/html; charset=utf-8'
  byteLength: number
  sha256: string
  bytes: Buffer
}

interface CreateSession {
  operationId: string
  model: string
  instructions: string
  sessionLimitCents: number
}

interface KeyedEvent {
  sessionId: string
  idempotencyKey: string
}

interface Options {
  apiKey: string
  fetch?: typeof fetch
  /** Override for a local fixture. Trusted code may inject fetch for tests. */
  baseUrl?: string
  timeoutMs?: number
}

type RequestMode = 'read' | 'create' | 'event'
interface WireRequest {
  path: string
  mode: RequestMode
  accept?: string
  body?: object
  key?: string
  signal?: AbortSignal
}

function isRecord(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): ObjectValue | undefined {
  return isRecord(value) ? value : undefined
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function state<T extends string>(value: unknown, states: readonly T[]): T | undefined {
  return states.find((candidate) => candidate === value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value)
}

function pathId(value: string): string {
  if (!isId(value)) throw new ManagedExploreProviderError('invalid_input', 'terminal')
  return value
}

function headerRequestId(response?: Response): string | null {
  const id = response?.headers.get('x-request-id')
  return isId(id) ? id : null
}

function receipt<T>(value: T, response?: Response): ProviderResult<T> {
  return { value, requestId: headerRequestId(response) }
}

function invalidResponse(mode: RequestMode, response: Response): ManagedExploreProviderError {
  const disposition = mode === 'read' ? 'retry_read' : 'reconcile'
  return new ManagedExploreProviderError('invalid_response', disposition, response)
}

function transportFailure(mode: RequestMode, response?: Response): ManagedExploreProviderError {
  if (mode === 'read') return new ManagedExploreProviderError('transient', 'retry_read', response)
  const disposition = mode === 'event' ? 'retry_same_key' : 'reconcile'
  return new ManagedExploreProviderError('delivery_unknown', disposition, response)
}

const BILLING_CODES = new Map<string, Failure>([
  ['credit_balance_exhausted', 'credit_exhausted'],
  ['session_budget_exceeded', 'budget_exceeded'],
  ['api_key_spend_limit_exceeded', 'budget_exceeded'],
  ['project_spend_limit_exceeded', 'budget_exceeded'],
  ['organization_spend_limit_exceeded', 'budget_exceeded'],
  ['organization_usage_limit_exceeded', 'budget_exceeded'],
  ['billing_not_active', 'billing_unavailable'],
  ['insufficient_quota', 'billing_unavailable'],
  ['usage_limit_exceeded', 'billing_unavailable'],
])

function providerFailure(code: unknown): Failure | undefined {
  if (typeof code !== 'string') return undefined
  const billing = BILLING_CODES.get(code)
  if (billing) return billing
  if (code === 'model_not_found' || code === 'model_not_available') return 'model_unavailable'
  if (code === 'authentication_error' || code === 'permission_denied') return 'authorization'
  if (code === 'resource_not_found') return 'not_found'
  if (code === 'cyber_policy' || code === 'misalignment_policy_violation' || code === 'invalid_request')
    return 'declined'
  return undefined
}

async function classifyHttp(response: Response, mode: RequestMode, signal: AbortSignal) {
  if (response.status >= 500 || response.status === 408) return transportFailure(mode, response)
  // A mutation conflict leaves delivery unresolved regardless of its error body.
  if (response.status === 409) {
    return new ManagedExploreProviderError('conflict', mode === 'read' ? 'terminal' : 'reconcile', response)
  }
  const payload = await jsonBody(response, signal, 16 * 1024)
  const known = providerFailure(record(record(payload)?.error)?.code)
  if (known) return new ManagedExploreProviderError(known, 'terminal', response)
  return classifyStatus(response, mode)
}

function classifyStatus(response: Response, mode: RequestMode): ManagedExploreProviderError {
  if (response.status === 429) return transportFailure(mode, response)
  if (response.status === 401 || response.status === 403) {
    return new ManagedExploreProviderError('authorization', 'terminal', response)
  }
  if (response.status === 404) return new ManagedExploreProviderError('not_found', 'terminal', response)
  if (response.status >= 400 && response.status < 500) {
    return new ManagedExploreProviderError('declined', 'terminal', response)
  }
  return invalidResponse(mode, response)
}

function stopBody(response: Response): void {
  // Cleanup cannot change the result or block the worker.
  void response.body?.cancel().catch(() => undefined)
}

async function readBytes(response: Response, limit: number, signal: AbortSignal): Promise<Buffer | undefined> {
  const reader = response.body?.getReader()
  if (!reader) return undefined
  const chunks: Uint8Array[] = []
  let length = 0
  const cancel = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) return Buffer.concat(chunks, length)
      const value: unknown = chunk.value
      if (!(value instanceof Uint8Array)) return undefined
      length += value.byteLength
      if (length > limit) return undefined
      if (value.byteLength) chunks.push(value)
    }
  } finally {
    // Body reads can end early on a size violation.
    signal.removeEventListener('abort', cancel)
    cancel()
    reader.releaseLock()
  }
}

async function jsonBody(response: Response, signal: AbortSignal, limit = MAX_JSON_BYTES): Promise<unknown> {
  try {
    const bytes = await readBytes(response, limit, signal)
    if (bytes) return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    // An invalid error body must not expose raw provider content.
    signal.throwIfAborted()
  }
  return undefined
}

function sessionValue(value: unknown): ManagedExploreSession | undefined {
  const row = record(value)
  const environmentId = hostedEnvironmentId(row?.environment)
  const model = sessionModel(row?.agent)
  const status = state(row?.status, SESSION_STATES)
  if (!isId(row?.id) || !status || !integer(row.created_at) || !model || !environmentId) {
    return undefined
  }
  const tag = record(row.metadata)?.[OPERATION_TAG]
  return {
    id: row.id,
    operationId: isId(tag) ? tag : null,
    model,
    environmentId,
    status,
    createdAt: row.created_at,
    spendControl: sessionSpendControl(row.spend_control),
  }
}

function sessionModel(value: unknown): string | undefined {
  const model = record(value)?.model
  return typeof model === 'string' && model ? model : undefined
}

function hostedEnvironmentId(value: unknown): string | undefined {
  const environment = record(value)
  if (
    isId(environment?.id) &&
    environment.type === 'openai_hosted' &&
    record(environment.network)?.access === 'disabled'
  )
    return environment.id
  return undefined
}

function sessionSpendControl(value: unknown): ManagedExploreSession['spendControl'] {
  const spend = record(value)
  if (!spend) return null
  return {
    limitCents: integer(spend.limit) ? spend.limit : null,
    consumedCents: integer(spend.consumed) ? spend.consumed : null,
  }
}

function tokenUsage(value: unknown): ManagedExploreRootTurn['usage'] {
  const usage = record(value)
  if (!integer(usage?.input_tokens) || !integer(usage.output_tokens) || !integer(usage.total_tokens)) return null
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens }
}

function timestamp(value: unknown): number | null {
  return integer(value) ? value : null
}

function rootValue(value: unknown, sessionId: string): ManagedExploreRootTurn | undefined {
  const row = record(value)
  const status = state(row?.status, TURN_STATES)
  if (
    row?.subagent_id !== null ||
    row.session_id !== sessionId ||
    !isId(row.id) ||
    !status ||
    !integer(row.created_at)
  ) {
    return undefined
  }
  return {
    id: row.id,
    sessionId,
    status,
    createdAt: row.created_at,
    startedAt: timestamp(row.started_at),
    completedAt: timestamp(row.completed_at),
    usage: tokenUsage(row.usage),
    failure: status === 'failed' ? (providerFailure(record(row.error)?.code) ?? 'provider_failed') : null,
  }
}

function finalTextParts(value: unknown, turnId: string): string[] {
  const item = record(value)
  if (
    item?.type !== 'message' ||
    item.role !== 'assistant' ||
    item.status !== 'completed' ||
    item.phase !== 'final_answer' ||
    item.turn_id !== turnId ||
    !Array.isArray(item.content)
  )
    return []
  return item.content.flatMap((part: unknown) => {
    const output = record(part)
    return output?.type === 'output_text' && typeof output.text === 'string' ? [output.text] : []
  })
}

function contentType(response: Response): string | undefined {
  return response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
}

function readPrototype(response: Response, signal: AbortSignal, length: number): Promise<Buffer> {
  return readBytes(response, length, signal).then((bytes) => {
    if (contentType(response) !== 'application/octet-stream' || bytes?.length !== length) {
      throw new ManagedExploreProviderError('artifact_invalid', 'terminal', response)
    }
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (!/<(?:!doctype\s+html\b|[a-z][a-z\d-]*(?=[\s/>]))/i.test(text) || text.includes('\0'))
        throw new Error('Invalid UTF-8 HTML payload')
    } catch {
      throw new ManagedExploreProviderError('artifact_invalid', 'terminal', response)
    }
    return bytes
  })
}

function providerBase(input: string | undefined): string {
  if (input === undefined) return OPENAI_BASE
  const url = URL.parse(input)
  if (!url) throw new ManagedExploreProviderError('invalid_input', 'terminal')
  if (url.href === OPENAI_BASE || url.href === `${OPENAI_BASE}/`) return OPENAI_BASE
  if (!['127.0.0.1', '[::1]'].includes(url.hostname) || !['https:', 'http:'].includes(url.protocol)) {
    throw new ManagedExploreProviderError('invalid_input', 'terminal')
  }
  if (url.username || url.password || url.search || url.hash || !['/v1', '/v1/'].includes(url.pathname)) {
    throw new ManagedExploreProviderError('invalid_input', 'terminal')
  }
  return `${url.origin}/v1`
}

function sessionPath(sessionId: string): string {
  return `${SESSIONS}/${pathId(sessionId)}`
}

function turnPath(sessionId: string, turnId: string): string {
  return `${sessionPath(sessionId)}/turns/${pathId(turnId)}`
}

export function createManagedExploreProvider(options: Options): ManagedExploreProvider {
  return new ManagedExploreProvider(options)
}

export class ManagedExploreProvider {
  readonly #fetch: typeof fetch
  readonly #apiKey: string
  readonly #base: string
  readonly #timeoutMs: number

  constructor(options: Options) {
    const timeoutMs = options.timeoutMs ?? 15_000
    if (!/^[\x21-\x7e]+$/.test(options.apiKey) || !integer(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
      throw new ManagedExploreProviderError('invalid_input', 'terminal')
    }
    this.#apiKey = options.apiKey
    this.#base = providerBase(options.baseUrl)
    this.#fetch = options.fetch ?? fetch
    this.#timeoutMs = timeoutMs
  }

  #raw(request: WireRequest, signal: AbortSignal): Promise<Response> {
    const headers = new Headers({
      Authorization: `Bearer ${this.#apiKey}`,
      'OpenAI-Beta': 'agents=v1',
      Accept: request.accept ?? 'application/json',
    })
    const init: RequestInit = { method: request.mode === 'read' ? 'GET' : 'POST', headers, redirect: 'manual', signal }
    if (request.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      init.body = JSON.stringify(request.body)
    }
    if (request.key !== undefined) headers.set('Idempotency-Key', request.key)
    return this.#fetch(`${this.#base}${request.path}`, init)
  }

  async #request<T>(request: WireRequest, consume: (response: Response, signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController()
    const signal = request.signal ? AbortSignal.any([controller.signal, request.signal]) : controller.signal
    let response: Response | undefined
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    let abort: (() => void) | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      abort = () => reject(transportFailure(request.mode, response))
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    })
    const exchange = async () => {
      signal.throwIfAborted()
      response = await this.#raw(request, signal)
      if (signal.aborted) {
        stopBody(response)
        signal.throwIfAborted()
      }
      if (!response.ok) throw await classifyHttp(response, request.mode, signal)
      return receipt(await consume(response, signal), response)
    }
    try {
      return await Promise.race([deadline, exchange()])
    } catch (error: unknown) {
      if (error instanceof ManagedExploreProviderError) throw error
      throw transportFailure(request.mode, response)
    } finally {
      clearTimeout(timer)
      if (abort) signal.removeEventListener('abort', abort)
      if (response) stopBody(response)
    }
  }

  #json<T>(request: WireRequest, parse: (value: unknown) => T | undefined): Promise<ProviderResult<T>> {
    return this.#request(request, async (response, signal) => {
      const value = parse(await jsonBody(response, signal))
      if (value === undefined) throw invalidResponse(request.mode, response)
      return value
    })
  }

  async #list<T>(
    path: string,
    query: URLSearchParams,
    parse: (items: unknown[]) => T[] | undefined,
  ): Promise<ProviderResult<T[]>> {
    const values: T[] = []
    const cursors = new Set(query.getAll('after'))
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.#json({ path: `${path}?${query.toString()}`, mode: 'read' }, (value) => {
        const row = record(value)
        if (!Array.isArray(row?.data) || typeof row.has_more !== 'boolean') return undefined
        const items = parse(row.data)
        if (!items) return undefined
        if (!row.has_more) return { items, next: null }
        if (!isId(row.last_id) || cursors.has(row.last_id)) return undefined
        return { items, next: row.last_id }
      })
      values.push(...result.value.items)
      if (!result.value.next) return { value: values, requestId: result.requestId }
      cursors.add(result.value.next)
      query.set('after', result.value.next)
    }
    throw new ManagedExploreProviderError('invalid_response', 'retry_read')
  }

  createSession(input: CreateSession): Promise<ProviderResult<ManagedExploreSession>> {
    const { operationId, model, instructions, sessionLimitCents } = input
    if (!isId(operationId) || !model.trim() || !instructions.trim()) {
      throw new ManagedExploreProviderError('invalid_input', 'terminal')
    }
    if (!integer(sessionLimitCents) || sessionLimitCents < 1 || sessionLimitCents >= 2 ** 52) {
      throw new ManagedExploreProviderError('invalid_input', 'terminal')
    }
    const body = {
      agent: { model, instructions },
      environment: { type: 'openai_hosted', container_size: 'small', network: { access: 'disabled' } },
      stream: false,
      metadata: { [OPERATION_TAG]: operationId },
      spend_control: { limit: sessionLimitCents },
    }
    return this.#json({ path: SESSIONS, mode: 'create', body }, (value) => {
      const session = sessionValue(value)
      if (session?.operationId !== operationId || session.model !== model) return undefined
      if (session.spendControl?.limitCents !== sessionLimitCents) return undefined
      return session
    })
  }

  async findSessionByOperation(operationId: string): Promise<ProviderResult<ManagedExploreSession | null>> {
    pathId(operationId)
    const query = new URLSearchParams({ [`metadata[${OPERATION_TAG}]`]: operationId, limit: '20' })
    const { value, requestId } = await this.#list(SESSIONS, query, (rows) => {
      const sessions = rows.map(sessionValue)
      return sessions.every((session) => session?.operationId === operationId) ? sessions : undefined
    })
    if (value.length > 1) throw new ManagedExploreProviderError('ambiguous_session', 'reconcile', requestId)
    // A filtered list may lag creation. Empty results convey no retry permission.
    return { value: value[0] ?? null, requestId }
  }

  readSession(sessionId: string): Promise<ProviderResult<ManagedExploreSession>> {
    return this.#json({ path: sessionPath(sessionId), mode: 'read' }, (value) => {
      const session = sessionValue(value)
      return session?.id === sessionId ? session : undefined
    })
  }

  readEnvironment(environmentId: string) {
    return this.#json({ path: `/agents/environments/${pathId(environmentId)}`, mode: 'read' }, (value) => {
      const row = record(value)
      const status = state(row?.status, ENVIRONMENT_STATES)
      return row?.id === environmentId && row.type === 'openai_hosted' && status
        ? { id: environmentId, status }
        : undefined
    })
  }

  #submit(input: KeyedEvent, event: object) {
    if (!/^[A-Za-z0-9._:-]{1,256}$/.test(input.idempotencyKey)) {
      throw new ManagedExploreProviderError('invalid_input', 'terminal')
    }
    return this.#request(
      {
        path: `${sessionPath(input.sessionId)}/events`,
        mode: 'event',
        body: { events: [event] },
        key: input.idempotencyKey,
      },
      (response) => {
        if (response.status !== 202) throw invalidResponse('event', response)
        return Promise.resolve('accepted' as const)
      },
    )
  }

  submitText(input: KeyedEvent & { text: string }) {
    if (!input.text.trim() || !input.text.isWellFormed() || Buffer.byteLength(input.text) > 1024 * 1024) {
      throw new ManagedExploreProviderError('invalid_input', 'terminal')
    }
    return this.#submit(input, {
      type: 'agent.session.input.message',
      input: [{ role: 'user', content: [{ type: 'input_text', text: input.text }] }],
    })
  }

  // Cancellation addresses the active turn. Its caller must fence newer input until settlement.
  cancel(input: KeyedEvent) {
    return this.#submit(input, { type: 'agent.session.input.cancel' })
  }

  // Optional bounded progress connection. A caller can submit after onOpen and
  // recover with saved state on EOF, timeout, or caller abort.
  observeEvents(sessionId: string, onOpen: () => void, signal?: AbortSignal) {
    return this.#request(
      {
        path: `${sessionPath(sessionId)}/events?stream=true`,
        mode: 'read',
        accept: 'text/event-stream',
        ...(signal ? { signal } : {}),
      },
      async (response, streamSignal) => {
        if (contentType(response) !== 'text/event-stream') throw invalidResponse('read', response)
        onOpen()
        const reader = response.body?.getReader()
        if (!reader) throw invalidResponse('read', response)
        const cancel = () => {
          void reader.cancel().catch(() => undefined)
        }
        streamSignal.addEventListener('abort', cancel, { once: true })
        let observedBytes = 0
        try {
          for (;;) {
            streamSignal.throwIfAborted()
            const chunk = await reader.read()
            streamSignal.throwIfAborted()
            if (chunk.done) return 'disconnected' as const
            const bytes: unknown = chunk.value
            if (!(bytes instanceof Uint8Array)) throw invalidResponse('read', response)
            observedBytes += bytes.byteLength
            if (observedBytes > MAX_JSON_BYTES) return 'disconnected' as const
          }
        } finally {
          streamSignal.removeEventListener('abort', cancel)
          cancel()
          reader.releaseLock()
        }
      },
    )
  }

  listRootTurns(sessionId: string, afterTurnId?: string): Promise<ProviderResult<ManagedExploreRootTurn[]>> {
    const query = new URLSearchParams({ limit: '20', order: 'asc' })
    if (afterTurnId) query.set('after', pathId(afterTurnId))
    return this.#list(`${sessionPath(sessionId)}/turns`, query, (rows) => {
      const roots: ManagedExploreRootTurn[] = []
      for (const value of rows) {
        const row = record(value)
        if (row?.session_id === sessionId && isId(row.subagent_id)) continue
        const root = rootValue(value, sessionId)
        if (!root || root.id === afterTurnId) return undefined
        roots.push(root)
      }
      return roots
    })
  }

  readRootTurn(sessionId: string, turnId: string): Promise<ProviderResult<ManagedExploreRootTurn>> {
    return this.#json({ path: turnPath(sessionId, turnId), mode: 'read' }, (value) => {
      const root = rootValue(value, sessionId)
      return root?.id === turnId ? root : undefined
    })
  }

  async #assertCompleted(sessionId: string, turnId: string) {
    const root = await this.readRootTurn(sessionId, turnId)
    if (root.value.status !== 'completed') {
      const disposition =
        root.value.status === 'cancelled' || root.value.status === 'failed' ? 'terminal' : 'retry_read'
      throw new ManagedExploreProviderError('turn_not_completed', disposition, root.requestId)
    }
  }

  async readTurnText(sessionId: string, turnId: string): Promise<ProviderResult<string | null>> {
    await this.#assertCompleted(sessionId, turnId)
    const query = new URLSearchParams({ order: 'asc', limit: '20' })
    const { value, requestId } = await this.#list(`${turnPath(sessionId, turnId)}/items`, query, (items) =>
      items.flatMap((item) => finalTextParts(item, turnId)),
    )
    const text = value.join('')
    if (Buffer.byteLength(text) > MAX_OUTPUT_TEXT_BYTES) {
      throw new ManagedExploreProviderError('invalid_response', 'terminal', requestId)
    }
    return { value: text || null, requestId }
  }

  async downloadPrototype(
    sessionId: string,
    turnId: string,
    environmentId: string,
  ): Promise<ProviderResult<ManagedExplorePrototype>> {
    await this.#assertCompleted(sessionId, turnId)
    const path = `${sessionPath(sessionId)}/artifacts`
    const query = new URLSearchParams({ environment_id: pathId(environmentId), limit: '20' })
    const { value, requestId } = await this.#list(path, query, (rows) =>
      rows
        .map(record)
        .filter(
          (row) => row?.session_id === sessionId && row.turn_id === turnId && row.environment_id === environmentId,
        ),
    )
    if (!value.length) throw new ManagedExploreProviderError('artifact_missing', 'retry_read', requestId)
    const artifact = value[0]
    const length = artifact?.size_bytes
    if (
      value.length !== 1 ||
      artifact?.path !== PROTOTYPE_PATH ||
      !isId(artifact.id) ||
      !integer(length) ||
      length < 1 ||
      length > MAX_PROTOTYPE_BYTES
    ) {
      throw new ManagedExploreProviderError('artifact_invalid', 'terminal', requestId)
    }
    const artifactId = artifact.id
    return this.#request(
      { path: `${path}/${artifactId}/content`, mode: 'read', accept: 'application/octet-stream' },
      async (response, signal) => {
        const bytes = await readPrototype(response, signal, length)
        return {
          artifactId,
          sessionId,
          turnId,
          environmentId,
          path: PROTOTYPE_PATH,
          mimeType: 'text/html; charset=utf-8' as const,
          byteLength: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes,
        }
      },
    )
  }
}
