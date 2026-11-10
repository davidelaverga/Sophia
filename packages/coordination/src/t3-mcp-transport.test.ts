// The loopback T3 MCP transport against a FAKE Streamable HTTP server on 127.0.0.1, backed by FakeT3. Synthetic only:
// it proves this client's protocol handling and bounds, never that a T3 install, a sign-in or a provider works.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newSecret } from './owner-host-channel.ts'
import { FakeT3 } from './runner-fake-t3.ts'
import { RunnerGateway } from './runner-gateway.ts'
import { RunnerJournal } from './runner-journal.ts'
import { digestOf, type RunnerEnvelope } from './runner-port.ts'
import { loopbackRefusal, MCP_PROTOCOL_VERSION, T3McpTransport, toolReply } from './t3-mcp-transport.ts'
import { launchCommandId, readCall, type T3Call } from './t3-port-mapping.ts'

const NS = 'client:auth-session-1'
const ENV = 'env-owner-1'
const TOKEN = `t3-${newSecret()}`

type Mode =
  | 'normal'
  | 'sse'
  | 'expire_once'
  | 'expire_always'
  | 'unauthorized'
  | 'forbidden_init'
  | 'redirect'
  | 'huge'
  | 'slow'
  | 'rpc_error'
  | 'echo_auth'
  | 'status_500'

/** A fake T3 MCP endpoint: sessions in memory, a new session id per initialize, tools served by FakeT3. */
class FakeMcp {
  readonly t3 = new FakeT3(NS)
  readonly requests: { method: string; headers: IncomingMessage['headers']; body: Record<string, unknown> }[] = []
  readonly sessions = new Set<string>()
  mode: Mode = 'normal'
  private seq = 0
  private expired = false
  server!: Server
  url = ''

  async start() {
    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/mcp`
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(Buffer.from(c as Uint8Array))
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
    this.requests.push({ method: String(body.method), headers: req.headers, body })
    if (this.mode === 'redirect') return res.writeHead(307, { location: 'http://example.test/mcp' }).end()
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end()
    if (body.method === 'initialize') return this.initialize(res, body)
    if (!this.sessions.has(String(req.headers['mcp-session-id'] ?? ''))) return res.writeHead(404).end()
    if (body.method === 'notifications/initialized') return res.writeHead(202).end()
    if (this.fault(req, res, body)) return res
    return this.tool(res, body)
  }

  private initialize(res: ServerResponse, body: Record<string, unknown>) {
    if (this.mode === 'forbidden_init') return res.writeHead(403).end()
    const session = `mcp-session-${(this.seq += 1)}`
    this.sessions.add(session)
    const result = { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
    return this.json(res, { jsonrpc: '2.0', id: body.id, result }, { 'mcp-session-id': session })
  }

  /** A scripted fault for a tool call, or false to serve it. */
  private fault(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): boolean {
    const status = { unauthorized: 401, status_500: 500 } as Partial<Record<Mode, number>>
    const code = status[this.mode]
    if (code !== undefined) return Boolean(res.writeHead(code).end())
    if (this.mode === 'expire_always' || (this.mode === 'expire_once' && !this.expired)) {
      this.expired = true
      this.sessions.clear()
      return Boolean(res.writeHead(404).end())
    }
    if (this.mode === 'slow') return Boolean(setTimeout(() => res.writeHead(200).end('{}'), 2000))
    if (this.mode === 'huge')
      return Boolean(res.writeHead(200, { 'content-type': 'application/json' }).end('x'.repeat(4096)))
    if (this.mode === 'rpc_error')
      return Boolean(this.json(res, { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'bad params' } }))
    if (this.mode !== 'echo_auth') return false
    const text = JSON.stringify({ code: 'orchestration_error', message: `saw ${req.headers.authorization ?? ''}` })
    const result = { isError: true, content: [{ type: 'text', text }] }
    return Boolean(this.json(res, { jsonrpc: '2.0', id: body.id, result }))
  }

  private async tool(res: ServerResponse, body: Record<string, unknown>) {
    const params = body.params as { name: T3Call['tool']; arguments: Record<string, unknown> }
    const reply = await this.t3.call({ tool: params.name, args: params.arguments })
    if (reply.kind === 'transport_error') return res.socket?.destroy()
    const text = JSON.stringify(reply.kind === 'ok' ? reply.body : { code: reply.code, message: reply.message })
    const result =
      reply.kind === 'ok' ? { content: [{ type: 'text', text }] } : { isError: true, content: [{ type: 'text', text }] }
    return this.json(res, { jsonrpc: '2.0', id: body.id, result })
  }

  private json(res: ServerResponse, message: unknown, headers: Record<string, string> = {}) {
    const sse = this.mode === 'sse'
    res.writeHead(200, { 'content-type': sse ? 'text/event-stream' : 'application/json', ...headers })
    return res.end(sse ? `event: message\ndata: ${JSON.stringify(message)}\n\n` : JSON.stringify(message))
  }
}

const mcp = new FakeMcp()
const root = mkdtempSync(join(tmpdir(), 'sophia-t3-mcp-'))
before(() => mcp.start())
after(async () => {
  await new Promise((resolve) => mcp.server.close(resolve))
  rmSync(root, { recursive: true, force: true })
})

const transport = (over: Partial<ConstructorParameters<typeof T3McpTransport>[0]> = {}) =>
  new T3McpTransport({ url: mcp.url, environmentId: ENV, namespace: NS, bearer: () => TOKEN, timeoutMs: 1000, ...over })
const read = (threadId = 'nope') => readCall(ENV, threadId)
const fresh = () => {
  mcp.requests.length = 0
  mcp.mode = 'normal'
}

const env = (over: Partial<RunnerEnvelope> = {}): RunnerEnvelope => ({
  v: 1,
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: '00000000-0000-4000-8000-0000000000b1',
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: '00000000-0000-4000-8000-0000000000d1',
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  environmentRef: ENV,
  nativeProjectRef: 'project-sophia',
  profileId: 'read-only-v1',
  profileRevision: 1,
  accountKey: 'claude:acct-1',
  authorityEpoch: 1,
  message: 'Report the Ask admission boundary.',
  title: 'Read-only qualification',
  targetOperationId: null,
  nativeThreadId: null,
  ...over,
})

describe('the loopback rule', () => {
  it('admits only loopback http(s) URLs without credentials, query or fragment', () => {
    for (const ok of [
      'http://127.0.0.1:3773/mcp',
      'http://[::1]:3773/mcp',
      'http://localhost:3773/mcp',
      'https://127.0.0.1/mcp',
    ])
      assert.equal(loopbackRefusal(ok), null, ok)
    for (const bad of [
      'http://10.0.0.1/mcp',
      'http://127.0.0.2/mcp',
      'http://localhost.example.test/mcp',
      'http://user:pw@127.0.0.1/mcp',
      'http://127.0.0.1/mcp?token=x',
      'file:///tmp/mcp',
      'ws://127.0.0.1/mcp',
      'not a url',
    ])
      assert.notEqual(loopbackRefusal(bad), null, bad)
  })
  it('refuses to build a transport for another host, an MCP-session namespace or a bad environment', () => {
    assert.throws(() => transport({ url: 'https://t3.example.test/mcp' }), /loopback/)
    assert.throws(() => transport({ namespace: 'mcp-session-1' }), /declared client namespace/)
    assert.throws(() => transport({ environmentId: '../x' }), /environment/)
  })
})

describe('the T3 MCP transport', () => {
  it('initializes, sends initialized, then calls with the session and protocol headers and the bearer', async () => {
    fresh()
    const t = transport()
    const r = await t.call(read())
    assert.deepEqual(r, { kind: 'failure', code: 'thread_not_found', message: 'fake thread_not_found' })
    assert.deepEqual(
      mcp.requests.map((q) => q.method),
      ['initialize', 'notifications/initialized', 'tools/call'],
    )
    const init = mcp.requests[0]
    assert.ok(init)
    assert.equal((init.body.params as { protocolVersion: string }).protocolVersion, '2025-06-18')
    assert.equal(init?.headers.accept, 'application/json, text/event-stream')
    const call = mcp.requests[2]
    assert.match(String(call?.headers['mcp-session-id']), /^mcp-session-\d+$/)
    assert.equal(call?.headers['mcp-protocol-version'], '2025-06-18')
    await t.call(read())
    assert.equal(mcp.requests.length, 4, 'the session is reused')
  })

  it('reads a single server-sent event', async () => {
    fresh()
    mcp.mode = 'sse'
    assert.equal((await transport().call(read())).kind, 'failure')
  })

  it('keeps the declared namespace whatever MCP session it gets', async () => {
    fresh()
    const t = transport()
    await t.call(read())
    mcp.mode = 'expire_once'
    await t.call(read())
    assert.equal(t.namespace(), NS)
    const sessions = new Set(
      mcp.requests.filter((q) => q.method === 'tools/call').map((q) => q.headers['mcp-session-id']),
    )
    assert.equal(sessions.size, 2, 'a renewed MCP session changes nothing about the namespace')
  })

  it('renews a lost session once; a second loss is no certain answer', async () => {
    fresh()
    mcp.mode = 'expire_once'
    assert.equal((await transport().call(read())).kind, 'failure')
    fresh()
    mcp.mode = 'expire_always'
    assert.equal((await transport().call(read())).kind, 'transport_error')
    assert.equal(mcp.requests.filter((q) => q.method === 'initialize').length, 2)
  })

  it('maps a 401 or 403 to capability_denied, before dispatch', async () => {
    fresh()
    mcp.mode = 'unauthorized'
    assert.deepEqual(await transport().call(read()), {
      kind: 'failure',
      code: 'capability_denied',
      message: 'T3 refused the credential',
    })
    fresh()
    mcp.mode = 'forbidden_init'
    assert.equal((await transport().call(read())).kind, 'failure')
    assert.ok(!mcp.requests.some((q) => q.method === 'tools/call'))
    fresh()
    assert.equal((await transport({ bearer: () => `t3-${newSecret()}` }).call(read())).kind, 'failure')
  })

  it('keeps a redirect, a timeout, an oversized body, a 500, a reset and a JSON-RPC error uncertain', async () => {
    for (const mode of ['redirect', 'slow', 'huge', 'status_500', 'rpc_error'] as const) {
      fresh()
      mcp.mode = mode
      const r = await transport({ maxResponseBytes: 1024, timeoutMs: 300 }).call(read())
      assert.equal(r.kind, 'transport_error', mode)
    }
    fresh()
    mcp.t3.inject('t3_thread_read', { kind: 'lose_before_effect' })
    assert.equal((await transport().call(read())).kind, 'transport_error')
  })

  it("calls only the backend's tools, only for its environment, before any request", async () => {
    fresh()
    const t = transport()
    assert.equal(
      (await t.call({ tool: 't3_shell_exec' as T3Call['tool'], args: { environmentId: ENV } })).kind,
      'failure',
    )
    assert.equal((await t.call(readCall('env-other', 'x'))).kind, 'failure')
    assert.equal(mcp.requests.length, 0)
  })

  it('never leaks the bearer: an unreadable token sends nothing, and an echoed one is redacted', async () => {
    fresh()
    const r = await transport({
      bearer: () => {
        throw new Error(`cannot read ${TOKEN}`)
      },
    }).call(read())
    assert.equal(r.kind, 'transport_error')
    assert.ok(!JSON.stringify(r).includes(TOKEN))
    assert.equal(mcp.requests.length, 0)
    assert.equal((await transport({ bearer: () => 'short' }).call(read())).kind, 'transport_error')
    fresh()
    mcp.mode = 'echo_auth'
    const echoed = await transport().call(read())
    assert.equal(echoed.kind, 'failure')
    assert.ok(!JSON.stringify(echoed).includes(TOKEN.slice(3)))
  })

  it('decodes tool results strictly', () => {
    assert.deepEqual(
      toolReply({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: '{"a":1}' }] } }, 3),
      { kind: 'ok', body: { a: 1 } },
    )
    assert.equal(toolReply({ jsonrpc: '2.0', id: 4, result: { content: [] } }, 3).kind, 'transport_error')
    assert.equal(
      toolReply({ jsonrpc: '2.0', id: 3, result: { isError: true, content: [{ type: 'text', text: 'oops' }] } }, 3)
        .kind,
      'transport_error',
    )
    assert.equal(
      toolReply({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'not json' }] } }, 3).kind,
      'transport_error',
    )
  })

  it('carries the real gateway: one launch, identities derived under the declared namespace', async () => {
    fresh()
    const t = transport()
    const gateway = new RunnerGateway({
      journal: new RunnerJournal(join(root, 'journal.jsonl')),
      transport: t,
      profile: {
        ownerId: env().ownerId,
        environmentRef: ENV,
        adapterPin: env().adapterPin,
        nativeProjectRefs: new Set(['project-sophia']),
        accountKey: 'claude:acct-1',
        profileId: 'read-only-v1',
        profileRevision: 1,
        operations: new Set(['create', 'input', 'stop'] as const),
      },
    })
    try {
      const e = env()
      mcp.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
      const lost = await gateway.send(e, digestOf(e), gateway.journalId)
      assert.equal(lost.kind, 'unknown')
      const again = await gateway.reconcile({ envelope: e, digest: digestOf(e), journalId: gateway.journalId })
      assert.equal(again.kind, 'received')
      assert.equal(
        again.kind === 'received' ? again.identity.threadId : '',
        launchCommandId(NS, `sophia:${e.operationId}`),
      )
      assert.equal(mcp.t3.effects.launches, 1)
      assert.equal(mcp.t3.count('t3_thread_launch'), 1)
    } finally {
      gateway.close()
    }
  })
})

// r5 (HOST-S1A-R4-F03): the bearer actually read for a request never leaves the transport, whatever its accepted length,
// prefix or the punctuation around it, and whichever reads of a rotating reader it was. Injected fetch only: no network.
const NO_NETWORK = 'http://127.0.0.1:9/mcp'
const jsonResponse = (message: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(message), { status: 200, headers: { 'content-type': 'application/json', ...extra } })

/** An in-memory MCP endpoint: initialize, initialized, then one tool failure built from the bearer it was sent. */
function fakeFetch(failure: (bearer: string) => { code: string; message: string }) {
  const seen: string[] = []
  const fn: typeof fetch = (_url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const bearer = (headers.authorization ?? '').replace(/^Bearer /, '')
    seen.push(bearer)
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { id?: number; method: string }
    if (body.method === 'initialize')
      return Promise.resolve(
        jsonResponse(
          { jsonrpc: '2.0', id: body.id, result: { protocolVersion: MCP_PROTOCOL_VERSION } },
          { 'mcp-session-id': 'mcp-session-x' },
        ),
      )
    if (body.method === 'notifications/initialized') return Promise.resolve(new Response(null, { status: 202 }))
    const text = JSON.stringify(failure(bearer))
    return Promise.resolve(
      jsonResponse({ jsonrpc: '2.0', id: body.id, result: { isError: true, content: [{ type: 'text', text }] } }),
    )
  }
  return { fn, seen }
}

describe('the bearer never escapes a decoded failure (r5, HOST-S1A-R4-F03)', () => {
  const SHORT16 = 'abcdEFGH1234-_.~'
  const SHORT21 = 'tok:21-chars_Synthetic'.slice(0, 21)
  const echoes: [string, (b: string) => { code: string; message: string }][] = [
    ['unprefixed, space separated', (b) => ({ code: 'orchestration_error', message: `invalid ${b}` })],
    ['Bearer prefixed', (b) => ({ code: 'orchestration_error', message: `rejected Bearer ${b} here` })],
    ['adjacent punctuation', (b) => ({ code: 'orchestration_error', message: `token=(${b}); retry,${b},` })],
    ['in the code', (b) => ({ code: `bad_${b}`, message: 'see code' })],
    ['at the truncation boundary', (b) => ({ code: 'orchestration_error', message: `${'word '.repeat(98)}${b}` })],
  ]
  for (const value of [SHORT16, SHORT21, 'SyntheticBearerAbcd', `t3-${newSecret()}`]) {
    for (const [how, failure] of echoes) {
      it(`masks a ${value.length}-character bearer echoed ${how}, and keeps the rest of the diagnostic`, async () => {
        const f = fakeFetch(failure)
        const t = new T3McpTransport({
          url: NO_NETWORK,
          environmentId: ENV,
          namespace: NS,
          bearer: () => value,
          fetch: f.fn,
        })
        const r = await t.call(read())
        assert.equal(r.kind, 'failure')
        assert.ok(
          f.seen.every((b) => b === value),
          'the request did carry it',
        )
        const out = JSON.stringify(r)
        assert.ok(!out.includes(value), `${how}: ${out}`)
        for (let n = 8; n < value.length; n++) assert.ok(!out.includes(value.slice(0, n) + '"'), 'no cut-off prefix')
        if (r.kind === 'failure' && how !== 'in the code') assert.equal(r.code, 'orchestration_error', 'the code stays')
        if (r.kind === 'failure' && how === 'unprefixed, space separated') assert.match(r.message, /^invalid /)
      })
    }
  }

  it('masks every value a rotating reader returned for this transport, in code, message and reason', async () => {
    const values = ['rotated-one-AAAA', 'rotated-two-BBBBBBB', `t3-${newSecret()}`]
    let i = 0
    const reader = () => values[Math.min(i++, values.length - 1)] ?? ''
    const f = fakeFetch(() => ({ code: `c ${values[0]}`, message: values.join(' / ') }))
    const t = new T3McpTransport({ url: NO_NETWORK, environmentId: ENV, namespace: NS, bearer: reader, fetch: f.fn })
    const r = await t.call(read())
    assert.ok(new Set(f.seen).size >= 3, 'each request read the reader afresh')
    const out = JSON.stringify(r)
    for (const v of values) assert.ok(!out.includes(v), `${v} escaped: ${out}`)
  })

  it('keeps it out of a transport reason too (a fetch failure naming it at the truncation boundary)', async () => {
    const value = 'shortbearer-0123'
    const fn: typeof fetch = () => {
      const err = new Error('x')
      err.name = `${'word '.repeat(56)}${value}`
      return Promise.reject(err)
    }
    const t = new T3McpTransport({ url: NO_NETWORK, environmentId: ENV, namespace: NS, bearer: () => value, fetch: fn })
    const r = await t.call(read())
    assert.equal(r.kind, 'transport_error')
    const out = JSON.stringify(r)
    for (let n = 8; n <= value.length; n++) assert.ok(!out.includes(value.slice(0, n)), `a prefix escaped: ${out}`)
    assert.ok(r.kind === 'transport_error' && r.reason.length <= 300)
  })
})

// r6 (HOST-S1A-R5-F01): every returned diagnostic, including an error NAME from a fetch rejection or a failing response
// stream. A bearer that is a plain alphabetic identifier is still a bearer. Injected fetch only: no network.
const ALPHA16 = 'SyntheticBearerA'
const ALPHA20 = 'SyntheticBearerAbcde'
const PUNCT = 'tok:21-chars_Synthetic'
const named = (name: string) => {
  const err = new Error('synthetic failure')
  err.name = name
  return err
}
/** An MCP endpoint that starts a session, then fails the tool call by `how`, with an error named by `name(bearer)`. */
function failingFetch(how: 'fetch' | 'stream', name: (bearer: string) => string | Error) {
  const seen: string[] = []
  const fn: typeof fetch = (_url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    const bearer = (headers.authorization ?? '').replace(/^Bearer /, '')
    seen.push(bearer)
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { id?: number; method: string }
    if (body.method === 'initialize')
      return Promise.resolve(
        jsonResponse(
          { jsonrpc: '2.0', id: body.id, result: { protocolVersion: MCP_PROTOCOL_VERSION } },
          { 'mcp-session-id': 'mcp-session-y' },
        ),
      )
    if (body.method === 'notifications/initialized') return Promise.resolve(new Response(null, { status: 202 }))
    const made = name(bearer)
    const err = made instanceof Error ? made : named(made)
    if (how === 'fetch') return Promise.reject(err)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(err)
      },
    })
    return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } }))
  }
  return { fn, seen }
}
const escapes = (out: string, value: string) => {
  for (let n = 8; n <= value.length; n++) if (out.includes(value.slice(0, n))) return value.slice(0, n)
  return null
}

describe('no read bearer in any returned diagnostic, error names included (r6, HOST-S1A-R5-F01)', () => {
  for (const how of ['fetch', 'stream'] as const) {
    for (const value of [ALPHA16, ALPHA20, PUNCT, `t3-${newSecret()}`]) {
      it(`keeps a ${value.length}-character bearer named by a ${how} failure out of the reason`, async () => {
        const f = failingFetch(how, (bearer) => bearer)
        const t = new T3McpTransport({
          url: NO_NETWORK,
          environmentId: ENV,
          namespace: NS,
          bearer: () => value,
          fetch: f.fn,
        })
        const r = await t.call(read())
        assert.equal(r.kind, 'transport_error', 'no certain answer: unknown, not refused')
        assert.ok(f.seen.includes(value), 'the request did carry it')
        assert.equal(escapes(JSON.stringify(r), value), null, JSON.stringify(r))
        assert.equal(
          r.kind === 'transport_error' ? r.reason : '',
          how === 'fetch' ? 'no answer: error' : 'the response was cut off: error',
        )
      })
    }
    it(`keeps every rotated read value out of a ${how} failure's reason`, async () => {
      const values = ['RotatedBearerOneAA', 'rotated-two:BBBBBBB', 'RotatedBearerThreeC']
      let i = 0
      const f = failingFetch(how, () => values[0] ?? '')
      const t = new T3McpTransport({
        url: NO_NETWORK,
        environmentId: ENV,
        namespace: NS,
        bearer: () => values[Math.min(i++, values.length - 1)] ?? '',
        fetch: f.fn,
      })
      const r = await t.call(read())
      assert.deepEqual(f.seen, values, 'each request read the reader afresh')
      for (const v of values) assert.equal(escapes(JSON.stringify(r), v), null, `${v}: ${JSON.stringify(r)}`)
    })
    it(`keeps a useful runtime error name from a ${how} failure`, async () => {
      for (const name of ['TimeoutError', 'TypeError', 'AbortError']) {
        const f = failingFetch(how, () => name)
        const t = new T3McpTransport({
          url: NO_NETWORK,
          environmentId: ENV,
          namespace: NS,
          bearer: () => ALPHA20,
          fetch: f.fn,
        })
        const r = await t.call(read())
        assert.equal(
          r.kind === 'transport_error' ? r.reason : '',
          `${how === 'fetch' ? 'no answer' : 'the response was cut off'}: ${name}`,
        )
      }
    })
  }

  it('names only a fixed set of runtime errors, each shorter than any bearer the transport accepts', async () => {
    const mod: Record<string, unknown> = await import('./t3-mcp-transport.ts')
    const names = mod.DIAGNOSTIC_ERROR_NAMES
    assert.ok(names instanceof Set && names.size > 0, 'a fixed allowlist')
    for (const n of names as Set<unknown>)
      assert.ok(typeof n === 'string' && n.length < 16, `${String(n)} could equal a bearer`)
    const short = new T3McpTransport({
      url: NO_NETWORK,
      environmentId: ENV,
      namespace: NS,
      bearer: () => 'a'.repeat(15),
    })
    assert.equal((await short.call(read())).kind, 'transport_error', 'a 15-character value is not accepted as a bearer')
  })

  for (const how of ['fetch', 'stream'] as const) {
    it(`persists no bearer through the real gateway and its fsynced journal after a ${how} failure`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sophia-r6-journal-'))
      const file = join(dir, 'journal.jsonl')
      const value = ALPHA20
      const f = failingFetch(how, (bearer) => bearer)
      const gateway = new RunnerGateway({
        journal: new RunnerJournal(file),
        transport: new T3McpTransport({
          url: NO_NETWORK,
          environmentId: ENV,
          namespace: NS,
          bearer: () => value,
          fetch: f.fn,
        }),
        profile: {
          ownerId: env().ownerId,
          environmentRef: ENV,
          adapterPin: env().adapterPin,
          nativeProjectRefs: new Set(['project-sophia']),
          accountKey: 'claude:acct-1',
          profileId: 'read-only-v1',
          profileRevision: 1,
          operations: new Set(['create', 'input', 'stop'] as const),
        },
      })
      try {
        const e = env()
        const answer = await gateway.send(e, digestOf(e), gateway.journalId)
        assert.equal(answer.kind, 'unknown', 'a possible send stays unknown, with its identity, for reconciliation')
        assert.ok(f.seen.includes(value), 'the synthetic bearer was read and sent')
        assert.equal(escapes(JSON.stringify(answer), value), null, `returned: ${JSON.stringify(answer)}`)
        const bytes = readFileSync(file, 'utf8')
        assert.ok(bytes.length > 0, 'the journal was written')
        assert.equal(escapes(bytes, value), null, 'the journal on disk holds no bearer')
      } finally {
        gateway.close()
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})

// r7 (HOST-S1A-R6-F01): the returned name is the one snapshot that was validated. An error's `name` may be an accessor
// that answers differently on each read, or throws; the transport reads it once. Injected fetch only: no network.
/** An Error whose `name` answers `first` on its first read and `later` afterwards (counting every read). */
function changingName(first: string, later: string) {
  const err = new Error('synthetic failure')
  const reads = { n: 0 }
  Object.defineProperty(err, 'name', {
    configurable: true,
    get() {
      reads.n += 1
      return reads.n === 1 ? first : later
    },
  })
  return { err, reads }
}
function throwingName() {
  const err = new Error('synthetic failure')
  Object.defineProperty(err, 'name', {
    configurable: true,
    get() {
      throw new Error(`a getter that throws (${ALPHA20})`)
    },
  })
  return err
}
const reasonFor = (how: 'fetch' | 'stream', name: string) =>
  `${how === 'fetch' ? 'no answer' : 'the response was cut off'}: ${name}`

describe('one validated snapshot of an error name, never a second read (r7, HOST-S1A-R6-F01)', () => {
  for (const how of ['fetch', 'stream'] as const) {
    it(`returns no bearer from a ${how} error whose name reads Error first and the bearer next`, async () => {
      const made: { reads: { n: number } }[] = []
      const f = failingFetch(how, (bearer) => {
        const c = changingName('Error', bearer)
        made.push(c)
        return c.err
      })
      const t = new T3McpTransport({
        url: NO_NETWORK,
        environmentId: ENV,
        namespace: NS,
        bearer: () => ALPHA20,
        fetch: f.fn,
      })
      const r = await t.call(read())
      assert.equal(escapes(JSON.stringify(r), ALPHA20), null, JSON.stringify(r))
      assert.equal(r.kind === 'transport_error' ? r.reason : '', reasonFor(how, 'Error'), 'the validated snapshot')
      assert.ok(
        made.every((c) => c.reads.n <= 1),
        'the name was read at most once',
      )
    })
    it(`returns no disallowed name from a ${how} error whose name reads TypeError first and something else next`, async () => {
      const f = failingFetch(how, () => changingName('TypeError', 'ArbitraryInputName').err)
      const t = new T3McpTransport({
        url: NO_NETWORK,
        environmentId: ENV,
        namespace: NS,
        bearer: () => ALPHA20,
        fetch: f.fn,
      })
      const r = await t.call(read())
      assert.equal(r.kind === 'transport_error' ? r.reason : '', reasonFor(how, 'TypeError'))
    })
    it(`falls back to a fixed name when a ${how} error's name getter throws`, async () => {
      const f = failingFetch(how, () => throwingName())
      const t = new T3McpTransport({
        url: NO_NETWORK,
        environmentId: ENV,
        namespace: NS,
        bearer: () => ALPHA20,
        fetch: f.fn,
      })
      const r = await t.call(read())
      assert.equal(r.kind, 'transport_error', 'still no certain answer')
      assert.equal(r.kind === 'transport_error' ? r.reason : '', reasonFor(how, 'error'))
      assert.equal(escapes(JSON.stringify(r), ALPHA20), null)
    })
    it(`keeps stable names as before on a ${how} failure: allowed kept, arbitrary replaced`, async () => {
      for (const [name, expected] of [
        ['TimeoutError', 'TimeoutError'],
        ['ArbitraryInputName', 'error'],
      ] as const) {
        const f = failingFetch(how, () => name)
        const t = new T3McpTransport({
          url: NO_NETWORK,
          environmentId: ENV,
          namespace: NS,
          bearer: () => ALPHA20,
          fetch: f.fn,
        })
        const r = await t.call(read())
        assert.equal(r.kind === 'transport_error' ? r.reason : '', reasonFor(how, expected))
      }
    })
    it(`persists no bearer through the real gateway and fsynced journal for a changing ${how} error name`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sophia-r7-journal-'))
      const file = join(dir, 'journal.jsonl')
      const f = failingFetch(how, (bearer) => changingName('Error', bearer).err)
      const gateway = new RunnerGateway({
        journal: new RunnerJournal(file),
        transport: new T3McpTransport({
          url: NO_NETWORK,
          environmentId: ENV,
          namespace: NS,
          bearer: () => ALPHA20,
          fetch: f.fn,
        }),
        profile: {
          ownerId: env().ownerId,
          environmentRef: ENV,
          adapterPin: env().adapterPin,
          nativeProjectRefs: new Set(['project-sophia']),
          accountKey: 'claude:acct-1',
          profileId: 'read-only-v1',
          profileRevision: 1,
          operations: new Set(['create', 'input', 'stop'] as const),
        },
      })
      try {
        const e = env()
        const answer = await gateway.send(e, digestOf(e), gateway.journalId)
        assert.equal(answer.kind, 'unknown', 'a possible send stays unknown for reconciliation')
        assert.ok(f.seen.includes(ALPHA20), 'the synthetic bearer was read and sent')
        assert.equal(escapes(JSON.stringify(answer), ALPHA20), null, `returned: ${JSON.stringify(answer)}`)
        const bytes = readFileSync(file, 'utf8')
        assert.ok(bytes.length > 0, 'the journal was written')
        assert.equal(escapes(bytes, ALPHA20), null, 'the journal on disk holds no bearer')
      } finally {
        gateway.close()
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
