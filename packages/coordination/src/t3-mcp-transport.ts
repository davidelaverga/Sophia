/**
 * A T3Transport over T3 Code's MCP endpoint on the owner's own machine (INC01-CC-003 S1a;
 * docs/plans/owner-host-transport.md "T3 transport"). Streamable HTTP, protocol 2025-06-18, as T3's own peer client
 * speaks it at the pin (apps/server/src/peer/PeerMcpClient.ts): POST JSON-RPC with `accept: application/json,
 * text/event-stream` and a bearer; `initialize`, then `notifications/initialized` with the `mcp-session-id` it returned;
 * then `tools/call` with that session and `mcp-protocol-version`. A JSON body or a single server-sent event is read.
 *
 * Bounds: a loopback URL only (127.0.0.1, ::1, localhost) with no credentials in it; redirects are an error; every
 * request has a timeout; a response body over the byte bound is no answer. Only T3_TOOLS can be called, and only for
 * the bound environment. The bearer is read through an injected reader for each request: it never leaves this module.
 * Every value it actually read (the last few, so a rotation is covered) is masked out of a decoded failure's code and
 * message before anything is truncated, whatever the value's length, prefix or surrounding punctuation (r5,
 * HOST-S1A-R4-F03); every other reason it produces is a fixed text, an HTTP status or one of DIAGNOSTIC_ERROR_NAMES,
 * never a name taken from the error itself (r6, HOST-S1A-R5-F01), and that name is the one snapshot read and
 * validated, never read again (r7, HOST-S1A-R6-F01). The general redaction of bearer-shaped and long
 * opaque text applies as well.
 *
 * Answers: a 404 on a call renews the MCP session once (the request was not processed). A 401 or 403 is T3 refusing the
 * credential before dispatch (`capability_denied`). A tool's isError result decodes to T3's typed failure. Anything
 * else (a timeout, a reset, another status, a JSON-RPC error, a malformed body) is no certain answer: a
 * transport_error, which the gateway keeps unknown.
 *
 * The namespace is DECLARED, not observed: T3 derives an outside agent's identities under `client:<auth session id>`
 * (McpOAuth.ts), and that id belongs to the OAuth sign-in, not to the HTTP or MCP session. It comes from the host's
 * configuration, is bound at hello and never changes; it is proven only when a launch receipt's thread id equals
 * launchCommandId(namespace, key) (a mismatch is already unknown in classifyReply).
 * @module @sophia/coordination/t3-mcp-transport
 */
import { redact } from './owner-host-channel.ts'
import { T3_TOOLS, type T3Call, type T3Reply, type T3Transport } from './t3-port-mapping.ts'

export const MCP_PROTOCOL_VERSION = '2025-06-18'
const NAMESPACE = /^client:[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost'])
/** A bearer is one header token: printable, no spaces, bounded. */
const BEARER = /^[\x21-\x7e]{16,4096}$/
/** How many of the bearer values last read are remembered, in memory only, to be masked out of what is returned. */
const READ_VALUES_KEPT = 8
const MASK = '[redacted]'

/** Text with every occurrence of each value masked. Longest first, so no value is left half masked by a shorter one. */
function maskValues(text: string, values: readonly string[]): string {
  let out = text
  for (const v of [...values].toSorted((a, b) => b.length - a.length)) if (v.length > 0) out = out.split(v).join(MASK)
  return out
}

export interface T3McpOptions {
  /** T3's MCP endpoint on this machine, e.g. http://127.0.0.1:3773/mcp. Loopback only. */
  readonly url: string
  /** The T3 environment this host is bound to: every call must name it. */
  readonly environmentId: string
  /** The declared, persistent request namespace T3 gives this host's sign-in. */
  readonly namespace: string
  /** Reads the bearer from the host's token file. Called per request; its value is never logged or returned. */
  readonly bearer: () => string
  readonly timeoutMs?: number
  readonly maxResponseBytes?: number
  readonly fetch?: typeof fetch
}

/** Why a URL is not a loopback MCP endpoint, or null. */
export function loopbackRefusal(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'not a URL'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'not an http(s) URL'
  if (!LOOPBACK.has(url.hostname)) return 'not a loopback host'
  if (url.username !== '' || url.password !== '') return 'a URL may not carry credentials'
  if (url.search !== '' || url.hash !== '') return 'a URL may not carry a query or fragment'
  return null
}

/** A reply decided early: thrown out of a request and returned as the call's answer. */
class Reply extends Error {
  readonly reply: T3Reply
  constructor(reply: T3Reply) {
    super('reply')
    this.reply = reply
  }
}

/**
 * The only error names a returned diagnostic may carry (r6, HOST-S1A-R5-F01): a fixed set of runtime names. Any other
 * name is just `error`. A bounded identifier SHAPE is no safety, since a bearer can be a plain alphabetic word; every
 * name here is shorter than the shortest bearer this transport accepts, so none can equal one.
 */
export const DIAGNOSTIC_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AbortError',
  'TimeoutError',
  'TypeError',
  'SyntaxError',
  'RangeError',
  'NetworkError',
  'Error',
])
/**
 * The error's name as a diagnostic: read ONCE (an accessor may answer differently on each read, or throw), validated
 * as a string in DIAGNOSTIC_ERROR_NAMES, and only that validated snapshot returned (r7, HOST-S1A-R6-F01).
 */
function errorName(err: unknown): string {
  if (!(err instanceof Error)) return 'error'
  let name: unknown
  try {
    name = err.name
  } catch {
    return 'error'
  }
  return typeof name === 'string' && DIAGNOSTIC_ERROR_NAMES.has(name) ? name : 'error'
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const transportError = (reason: string): T3Reply => ({ kind: 'transport_error', reason: redact(reason) })
const denied: T3Reply = { kind: 'failure', code: 'capability_denied', message: 'T3 refused the credential' }

/** The JSON of an MCP response body: plain JSON, or a single server-sent event's data lines. */
export function responseJson(contentType: string | null, text: string): unknown {
  const body = contentType?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    : text
  return JSON.parse(body)
}

/** A decoded tool result's text: T3's success body, or its typed failure, with `secrets` masked before truncation. */
function decodedReply(decoded: unknown, isError: boolean, secrets: readonly string[]): T3Reply {
  if (!isError) return { kind: 'ok', body: decoded }
  if (isRecord(decoded) && typeof decoded.code === 'string' && typeof decoded.message === 'string')
    return {
      kind: 'failure',
      code: maskValues(decoded.code, secrets).slice(0, 100),
      message: redact(maskValues(decoded.message, secrets), 500),
    }
  return transportError('a tool failure without a code')
}

/**
 * A tool result: T3's success body (JSON in its text) or its typed failure; anything else is no answer. `secrets` (the
 * bearer values the transport read) are masked out of a failure before it is truncated.
 */
export function toolReply(message: unknown, id: number, secrets: readonly string[] = []): T3Reply {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || message.id !== id) return transportError('not this response')
  if ('error' in message) return transportError('a JSON-RPC error; an effect is not ruled out')
  const result = message.result
  if (!isRecord(result) || !Array.isArray(result.content)) return transportError('a response without a tool result')
  const isError = result.isError === true
  const text = result.content
    .map((part: unknown) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
    .join('')
  try {
    return decodedReply(JSON.parse(text), isError, secrets)
  } catch {
    return transportError(isError ? 'an undecodable tool failure' : 'an undecodable tool result')
  }
}

export class T3McpTransport implements T3Transport {
  private readonly o: T3McpOptions
  private readonly url: string
  private readonly timeoutMs: number
  private readonly maxBytes: number
  private readonly fetchFn: typeof fetch
  private session: string | null = null
  private nextId = 1
  /** The bearer values last read (in memory only): never logged, only masked out of what this transport returns. */
  private readValues: string[] = []

  constructor(options: T3McpOptions) {
    const refusal = loopbackRefusal(options.url)
    if (refusal) throw new Error(`the T3 MCP URL is refused: ${refusal}`)
    if (!NAMESPACE.test(options.namespace)) throw new Error('the T3 namespace is not a declared client namespace')
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(options.environmentId))
      throw new Error('the T3 environment is not a reference')
    this.o = options
    this.url = new URL(options.url).toString()
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? 30_000, 100), 120_000)
    this.maxBytes = Math.min(Math.max(options.maxResponseBytes ?? 1_048_576, 1024), 8_388_608)
    this.fetchFn = options.fetch ?? fetch
  }

  namespace(): string {
    return this.o.namespace
  }

  private token(): string {
    let token: string
    try {
      token = this.o.bearer().trim()
    } catch {
      throw new Reply(transportError('the bearer could not be read'))
    }
    if (!BEARER.test(token)) throw new Reply(transportError('the bearer is not a token'))
    if (!this.readValues.includes(token)) this.readValues = [token, ...this.readValues].slice(0, READ_VALUES_KEPT)
    return token
  }

  /** One POST, bounded in time and bytes, never following a redirect. */
  private async post(
    body: unknown,
    session: string | null,
  ): Promise<{ status: number; type: string | null; session: string | null; text: string }> {
    const headers: Record<string, string> = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: `Bearer ${this.token()}`,
    }
    if (session !== null) {
      headers['mcp-session-id'] = session
      headers['mcp-protocol-version'] = MCP_PROTOCOL_VERSION
    }
    let response: Response
    try {
      response = await this.fetchFn(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      throw new Reply(transportError(`no answer: ${errorName(err)}`))
    }
    const text = await this.read(response)
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      session: response.headers.get('mcp-session-id'),
      text,
    }
  }

  private async read(response: Response): Promise<string> {
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > this.maxBytes) {
      await response.body?.cancel().catch(() => undefined)
      throw new Reply(transportError('the response is over its bound'))
    }
    if (!response.body) return ''
    const chunks: Buffer[] = []
    let total = 0
    try {
      for await (const chunk of response.body as AsyncIterable<unknown>) {
        if (!(chunk instanceof Uint8Array)) throw new Reply(transportError('the response is not bytes'))
        const bytes = Buffer.from(chunk)
        total += bytes.byteLength
        if (total > this.maxBytes) throw new Reply(transportError('the response is over its bound'))
        chunks.push(bytes)
      }
    } catch (err) {
      if (err instanceof Reply) throw err
      throw new Reply(transportError(`the response was cut off: ${errorName(err)}`))
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  /** initialize: the session T3 started, from a 200 with a session id and a result for this request. */
  private async initialize(): Promise<string> {
    const id = this.nextId++
    const init = await this.post(
      {
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'sophia-owner-host', version: '1' },
        },
      },
      null,
    )
    if (init.status === 401 || init.status === 403) throw new Reply(denied)
    if (init.status !== 200 || init.session === null || init.session.length > 200)
      throw new Reply(transportError(`T3 did not start an MCP session (HTTP ${init.status})`))
    let message: unknown
    try {
      message = responseJson(init.type, init.text)
    } catch {
      throw new Reply(transportError('an undecodable initialize response'))
    }
    if (!isRecord(message) || message.id !== id || !isRecord(message.result))
      throw new Reply(transportError('an initialize response without a result'))
    return init.session
  }

  /** initialize, then notifications/initialized. A 401 or 403 is T3 refusing the credential; nothing was called. */
  private async open(): Promise<string> {
    const session = await this.initialize()
    const done = await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session)
    if (done.status === 401 || done.status === 403) throw new Reply(denied)
    if (done.status !== 202 && done.status !== 200)
      throw new Reply(transportError(`T3 did not accept the initialized notification (HTTP ${done.status})`))
    this.session = session
    return session
  }

  private async callOnce(session: string, call: T3Call, id: number) {
    return this.post(
      { jsonrpc: '2.0', id, method: 'tools/call', params: { name: call.tool, arguments: call.args } },
      session,
    )
  }

  async call(call: T3Call): Promise<T3Reply> {
    // Only the backend's tools, only for this host's environment: a refusal here is before any request.
    if (!(T3_TOOLS as readonly string[]).includes(call.tool))
      return { kind: 'failure', code: 'invalid_request', message: 'not a tool this host may call' }
    if (call.args.environmentId !== this.o.environmentId)
      return { kind: 'failure', code: 'invalid_request', message: 'not the environment this host is bound to' }
    try {
      const id = this.nextId++
      let response = await this.callOnce(this.session ?? (await this.open()), call, id)
      if (response.status === 404) {
        // The session is gone (T3 restarted): the request was not processed. Renew once.
        this.session = null
        response = await this.callOnce(await this.open(), call, id)
      }
      if (response.status === 401 || response.status === 403) return denied
      if (response.status !== 200) return transportError(`T3 answered HTTP ${response.status}`)
      let message: unknown
      try {
        message = responseJson(response.type, response.text)
      } catch {
        return transportError('an undecodable response')
      }
      return toolReply(message, id, this.readValues)
    } catch (err) {
      if (err instanceof Reply) return err.reply
      return transportError('the call failed')
    }
  }
}
