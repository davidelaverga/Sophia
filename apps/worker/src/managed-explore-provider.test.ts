import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { createManagedExploreProvider, ManagedExploreProviderError } from './managed-explore-provider.ts'

const BASE_PATH = '/v1/agents/sessions'
const PATH = '/workspace/outputs/index.html'
const KEY = 'offline-placeholder'
const FOUNDER_ACTION = 'Create a vessel acknowledgement prototype.'
const REVISION_ACTION = 'Require an explanation before assigning.'
const FIRST = Buffer.from('<!doctype html>\r\n<button>Acknowledge</button>\r\n')
const SECOND = Buffer.from('<!doctype html>\r\n<label>Explain <input required></label>\r\n')

function session(id = 'sess_one') {
  return {
    id,
    created_at: 1,
    agent: { model: 'fixture-model', ignored_server_detail: 'ignored' },
    status: 'idle',
    environment: { id: 'env_one', type: 'openai_hosted', network: { access: 'disabled' } },
    metadata: { sophia_operation_id: 'op_create' },
    spend_control: { limit: 100, consumed: null },
  }
}

function turn(id: string, status = 'completed', subagentId: string | null = null) {
  return {
    id,
    session_id: 'sess_one',
    created_at: 2,
    started_at: 3,
    completed_at: status === 'completed' ? 4 : null,
    status,
    subagent_id: subagentId,
    usage: null,
  }
}

function page(data: unknown[], lastId?: string) {
  return { data, has_more: lastId !== undefined, last_id: lastId ?? null }
}

function artifact(id: string, turnId: string, bytes: Buffer, path = PATH) {
  return {
    id,
    path,
    session_id: 'sess_one',
    environment_id: 'env_one',
    turn_id: turnId,
    size_bytes: bytes.length,
  }
}

function json(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

function providerError(code: string, disposition: string, requestId?: string) {
  return (error: unknown) =>
    error instanceof ManagedExploreProviderError &&
    error.code === code &&
    error.disposition === disposition &&
    (requestId === undefined || error.requestId === requestId)
}

async function requestBody(request: IncomingMessage): Promise<string> {
  request.setEncoding('utf8')
  const parts: string[] = []
  for await (const part of request) {
    if (typeof part !== 'string') throw new Error('Expected UTF-8 from fixture client')
    parts.push(part)
  }
  return parts.join('')
}

async function loopback(
  t: TestContext,
  route: (request: IncomingMessage, response: ServerResponse, url: URL) => unknown,
) {
  const issues: unknown[] = []
  const server = createServer((request, response) => {
    response.setHeader('x-request-id', 'req_loopback')
    void Promise.resolve()
      .then(() => {
        assert.equal(request.headers.authorization, `Bearer ${KEY}`)
        assert.equal(request.headers['openai-beta'], 'agents=v1')
        return route(request, response, new URL(request.url ?? '/', 'http://127.0.0.1'))
      })
      .catch((error: unknown) => {
        issues.push(error)
        response.destroy()
      })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.close()
    server.closeAllConnections()
    assert.deepEqual(issues, [])
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return createManagedExploreProvider({ apiKey: KEY, baseUrl: `http://127.0.0.1:${address.port}/v1`, timeoutMs: 1200 })
}

test(
  'loopback preserves one input per key, recovers root state after SSE disconnect and retains exact revisions',
  {
    timeout: 5000,
  },
  async (t) => {
    const submissions = new Map<string, string>()
    const attempts: string[] = []
    let stream: ServerResponse | undefined
    let creates = 0
    const events = async (request: IncomingMessage, response: ServerResponse, url: URL) => {
      if (url.searchParams.get('stream') === 'true') {
        assert.equal(request.headers.accept, 'text/event-stream')
        stream = response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        stream.write(': open\n\n')
        return
      }
      if (request.method === 'POST') {
        const key = request.headers['idempotency-key']
        assert.ok(typeof key === 'string')
        const body = await requestBody(request)
        attempts.push(key)
        const existing = submissions.get(key)
        if (existing !== undefined) {
          assert.equal(body, existing)
          response.writeHead(202).end()
          return
        }
        submissions.set(key, body)
        if (key === 'message-one') {
          assert.ok(stream)
          stream.end(
            `data: ${JSON.stringify({ type: 'agent.session.turn.completed', turn: turn('turn_child', 'completed', 'agent_child') })}\n\n`,
          )
          // The event arrived, then the input HTTP connection was lost before its acknowledgment.
          response.destroy()
          return
        }
        response.writeHead(202).end()
      }
    }
    const turns = (response: ServerResponse, url: URL, subpath: string) => {
      if (subpath === '/turns') {
        const after = url.searchParams.get('after')
        if (after === 'turn_one') {
          return json(response, page([turn('turn_child', 'completed', 'agent_child'), turn('turn_two')]))
        }
        return json(response, page([turn('turn_child', 'completed', 'agent_child'), turn('turn_one')]))
      }
      if (subpath === '/turns/turn_one') return json(response, turn('turn_one'))
      if (subpath === '/turns/turn_two') return json(response, turn('turn_two'))
      if (subpath === '/turns/turn_three') return json(response, turn('turn_three', 'cancelled'))
      if (subpath === '/turns/turn_one/items') {
        const output = { type: 'output_text', text: 'Try acknowledging the vessel.' }
        return json(
          response,
          page([
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              phase: 'final_answer',
              turn_id: 'turn_one',
              content: [output],
            },
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              phase: 'commentary',
              turn_id: 'turn_one',
              content: [output],
            },
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              phase: 'final_answer',
              turn_id: 'turn_child',
              content: [output],
            },
          ]),
        )
      }
      throw new Error('Unexpected turn route')
    }
    const artifacts = (request: IncomingMessage, response: ServerResponse, url: URL, subpath: string) => {
      if (subpath === '/artifacts') {
        const entries = [artifact('art_child', 'turn_child', FIRST), artifact('art_first', 'turn_one', FIRST)]
        if (url.searchParams.get('after') === 'art_first')
          return json(response, page([artifact('art_second', 'turn_two', SECOND)]))
        return json(response, page(entries, submissions.has('message-two') ? 'art_first' : undefined))
      }
      if (subpath === '/artifacts/art_first/content' || subpath === '/artifacts/art_second/content') {
        assert.equal(request.headers.accept, 'application/octet-stream')
        const bytes = subpath.includes('second') ? SECOND : FIRST
        return response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(bytes)
      }
      throw new Error('Unexpected artifact route')
    }
    const client = await loopback(t, async (request, response, url) => {
      const path = url.pathname
      const subpath = path.slice(`${BASE_PATH}/sess_one`.length)
      if (path === BASE_PATH && request.method === 'POST') {
        creates += 1
        const body: unknown = JSON.parse(await requestBody(request))
        assert.deepEqual(body, {
          agent: { model: 'fixture-model', instructions: 'Fictional fleet workflow only.' },
          environment: { type: 'openai_hosted', container_size: 'small', network: { access: 'disabled' } },
          metadata: { sophia_operation_id: 'op_create' },
          spend_control: { limit: 100 },
          stream: false,
        })
        return json(response, session(), 201)
      }
      if (path === BASE_PATH) {
        assert.equal(url.searchParams.get('metadata[sophia_operation_id]'), 'op_create')
        return json(response, page([session()]))
      }
      if (path === '/v1/agents/environments/env_one') {
        return json(response, { id: 'env_one', type: 'openai_hosted', status: 'ready' })
      }
      if (subpath === '') return json(response, session())
      if (subpath === '/events') return events(request, response, url)
      if (subpath.startsWith('/turns')) return turns(response, url, subpath)
      if (subpath.startsWith('/artifacts')) return artifacts(request, response, url, subpath)
      throw new Error(`Unexpected fixture route ${request.method} ${url.pathname}`)
    })

    const created = await client.createSession({
      operationId: 'op_create',
      model: 'fixture-model',
      instructions: 'Fictional fleet workflow only.',
      sessionLimitCents: 100,
    })
    assert.equal(created.requestId, 'req_loopback')
    assert.deepEqual(created.value.spendControl, { limitCents: 100, consumedCents: null })
    assert.equal(creates, 1)
    assert.deepEqual((await client.findSessionByOperation('op_create')).value, created.value)
    assert.deepEqual((await client.readSession('sess_one')).value, created.value)
    assert.equal((await client.readEnvironment('env_one')).value.status, 'ready')

    const open = Promise.withResolvers<void>()
    const sse = client.observeEvents('sess_one', open.resolve)
    await Promise.race([open.promise, sse.then(() => assert.fail('SSE closed before submission'))])
    const submission = { sessionId: 'sess_one', idempotencyKey: 'message-one', text: FOUNDER_ACTION }
    await assert.rejects(client.submitText(submission), providerError('delivery_unknown', 'retry_same_key'))
    assert.equal((await sse).value, 'disconnected')
    assert.equal((await client.submitText(submission)).value, 'accepted')
    assert.deepEqual(
      (await client.listRootTurns('sess_one')).value.map(({ id }) => id),
      ['turn_one'],
    )
    assert.equal((await client.readRootTurn('sess_one', 'turn_one')).value.usage, null)
    assert.equal((await client.readTurnText('sess_one', 'turn_one')).value, 'Try acknowledging the vessel.')
    const first = (await client.downloadPrototype('sess_one', 'turn_one', 'env_one')).value
    assert.deepEqual(first.bytes, FIRST)
    assert.equal(first.sha256, createHash('sha256').update(FIRST).digest('hex'))

    assert.equal(
      (await client.submitText({ ...submission, text: REVISION_ACTION, idempotencyKey: 'message-two' })).value,
      'accepted',
    )
    assert.deepEqual(
      (await client.listRootTurns('sess_one', 'turn_one')).value.map(({ id }) => id),
      ['turn_two'],
    )
    const second = (await client.downloadPrototype('sess_one', 'turn_two', 'env_one')).value
    assert.deepEqual(second.bytes, SECOND)
    assert.notEqual(first.sha256, second.sha256)
    assert.deepEqual((await client.downloadPrototype('sess_one', 'turn_one', 'env_one')).value, first)

    assert.equal((await client.cancel({ sessionId: 'sess_one', idempotencyKey: 'cancel-three' })).value, 'accepted')
    assert.equal((await client.readRootTurn('sess_one', 'turn_three')).value.status, 'cancelled')
    await assert.rejects(
      client.downloadPrototype('sess_one', 'turn_three', 'env_one'),
      providerError('turn_not_completed', 'terminal'),
    )
    assert.deepEqual(attempts, ['message-one', 'message-one', 'message-two', 'cancel-three'])
    assert.deepEqual(
      [...submissions.values()].map((body): unknown => JSON.parse(body)),
      [
        ...[FOUNDER_ACTION, REVISION_ACTION].map((text) => ({
          events: [
            { type: 'agent.session.input.message', input: [{ role: 'user', content: [{ type: 'input_text', text }] }] },
          ],
        })),
        { events: [{ type: 'agent.session.input.cancel' }] },
      ],
    )
  },
)

function wireJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_fixture' },
  })
}

function mockFetch(handler: (url: URL, init?: RequestInit) => Response): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
    return Promise.resolve(handler(url, init))
  }
}

function turnFixture(fetchArtifact: (pathname: string) => Response) {
  return createManagedExploreProvider({
    apiKey: KEY,
    fetch: mockFetch(({ pathname }) => {
      if (pathname.endsWith('/turns/turn_one')) return wireJson(turn('turn_one'))
      return fetchArtifact(pathname)
    }),
  })
}

test('artifact identity and exact decoded bytes gate the output', async (t) => {
  const correct = artifact('art_one', 'turn_one', FIRST)
  const cases = [
    { name: 'stale turn', rows: [artifact('art_one', 'turn_old', FIRST)], code: 'artifact_missing' },
    { name: 'wrong session', rows: [{ ...correct, session_id: 'sess_other' }], code: 'artifact_missing' },
    { name: 'wrong environment', rows: [{ ...correct, environment_id: 'env_other' }], code: 'artifact_missing' },
    { name: 'wrong path', rows: [{ ...correct, path: `${PATH}.bak` }], code: 'artifact_invalid' },
    { name: 'duplicate output', rows: [correct, { ...correct, id: 'art_duplicate' }], code: 'artifact_invalid' },
    {
      name: 'additional file',
      rows: [correct, { ...correct, id: 'art_extra', path: '/workspace/outputs/other.js' }],
      code: 'artifact_invalid',
    },
    { name: 'oversized metadata', rows: [{ ...correct, size_bytes: 2_097_153 }], code: 'artifact_invalid' },
    { name: 'missing output', rows: [], code: 'artifact_missing' },
    { name: 'too few bytes', rows: [correct], bytes: FIRST.subarray(0, -1), code: 'artifact_invalid' },
    { name: 'too many bytes', rows: [correct], bytes: Buffer.concat([FIRST, FIRST]), code: 'artifact_invalid' },
    { name: 'malformed UTF-8', rows: [correct], bytes: Buffer.alloc(FIRST.length, 0xff), code: 'artifact_invalid' },
    { name: 'plain text claim', rows: [correct], bytes: Buffer.alloc(FIRST.length, 0x61), code: 'artifact_invalid' },
    { name: 'wrong wire format', rows: [correct], bytes: FIRST, contentType: 'text/html', code: 'artifact_invalid' },
  ]
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let downloads = 0
      const client = turnFixture((pathname) => {
        if (pathname.endsWith('/artifacts')) return wireJson(page(scenario.rows))
        assert.ok(pathname.endsWith('/art_one/content'))
        assert.ok(scenario.bytes)
        downloads += 1
        return new Response(Uint8Array.from(scenario.bytes), {
          headers: { 'content-type': scenario.contentType ?? 'application/octet-stream' },
        })
      })
      const disposition = scenario.code === 'artifact_missing' ? 'retry_read' : 'terminal'
      await assert.rejects(
        client.downloadPrototype('sess_one', 'turn_one', 'env_one'),
        providerError(scenario.code, disposition),
      )
      assert.equal(downloads, scenario.bytes ? 1 : 0)
    })
  }
})

test('create ambiguity is reconciled by exact metadata and never retries transparently', async () => {
  let creates = 0
  let matches: unknown[] = []
  const client = createManagedExploreProvider({
    apiKey: KEY,
    fetch: mockFetch((url, init) => {
      if (init?.method === 'POST') {
        creates += 1
        return wireJson({ error: { code: 'internal_error' } }, 503)
      }
      assert.equal(url.searchParams.get('metadata[sophia_operation_id]'), 'op_create')
      return wireJson(page(matches))
    }),
  })
  const input = {
    operationId: 'op_create',
    model: 'fixture-model',
    instructions: 'Fictional fleet workflow only.',
    sessionLimitCents: 100,
  }
  await assert.rejects(client.createSession(input), providerError('delivery_unknown', 'reconcile', 'req_fixture'))
  assert.equal(creates, 1)
  assert.equal((await client.findSessionByOperation('op_create')).value, null)

  matches = [session()]
  assert.equal((await client.findSessionByOperation('op_create')).value?.id, 'sess_one')
  matches.push(session('sess_two'))
  await assert.rejects(client.findSessionByOperation('op_create'), providerError('ambiguous_session', 'reconcile'))
  assert.equal(creates, 1)
})

test('a child turn, wrong session and unsettled root cannot authorize saved output', async (t) => {
  const cases = [
    { row: turn('turn_one', 'completed', 'agent_child'), code: 'invalid_response' },
    { row: { ...turn('turn_one'), session_id: 'sess_other' }, code: 'invalid_response' },
    { row: turn('turn_one', 'in_progress'), code: 'turn_not_completed' },
  ]
  for (const { row, code } of cases) {
    await t.test(`${code} ${row.session_id} ${row.subagent_id ?? row.status}`, async () => {
      let calls = 0
      const client = createManagedExploreProvider({
        apiKey: KEY,
        fetch: mockFetch(() => {
          calls += 1
          return wireJson(row)
        }),
      })
      await assert.rejects(
        client.downloadPrototype('sess_one', 'turn_one', 'env_one'),
        providerError(code, 'retry_read'),
      )
      assert.equal(calls, 1)
    })
  }
})

test('terminal provider failures, transient reads and ambiguous writes have distinct dispositions', async (t) => {
  const cases = [
    [401, 'invalid_api_key', 'authorization', 'terminal'],
    [404, 'model_not_found', 'model_unavailable', 'terminal'],
    [429, 'credit_balance_exhausted', 'credit_exhausted', 'terminal'],
    [429, 'session_budget_exceeded', 'budget_exceeded', 'terminal'],
    [429, 'rate_limit_exceeded', 'delivery_unknown', 'retry_same_key'],
    [400, 'invalid_request_error', 'declined', 'terminal'],
    [409, 'conflict', 'conflict', 'reconcile'],
    [409, 'invalid_request', 'conflict', 'reconcile'],
    [409, 'credit_balance_exhausted', 'conflict', 'reconcile'],
    [200, '', 'invalid_response', 'reconcile'],
  ] as const
  for (const [status, remote, code, disposition] of cases) {
    await t.test(`${status} ${remote}`, async () => {
      const client = createManagedExploreProvider({
        apiKey: KEY,
        fetch: mockFetch(() =>
          wireJson({ error: { code: remote, message: 'Never include this text in the receipt' } }, status),
        ),
      })
      await assert.rejects(
        client.submitText({ sessionId: 'sess_one', idempotencyKey: 'key', text: 'text' }),
        (error: unknown) => {
          assert.ok(providerError(code, disposition, 'req_fixture')(error))
          assert.ok(error instanceof ManagedExploreProviderError)
          assert.equal(error.message, `Managed Explore provider: ${code}`)
          return true
        },
      )
    })
  }

  const failed = createManagedExploreProvider({
    apiKey: KEY,
    fetch: mockFetch(() =>
      wireJson({
        ...turn('turn_one', 'failed'),
        error: { code: 'credit_balance_exhausted', message: 'Never include this text in the receipt' },
      }),
    ),
  })
  assert.equal((await failed.readRootTurn('sess_one', 'turn_one')).value.failure, 'credit_exhausted')
  const transient = createManagedExploreProvider({ apiKey: KEY, fetch: mockFetch(() => wireJson({}, 503)) })
  await assert.rejects(transient.readSession('sess_one'), providerError('transient', 'retry_read', 'req_fixture'))
})

test('request deadline bounds a stalled body with a transport that ignores abort', { timeout: 1000 }, async () => {
  let cancelled = false
  const stalled = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true
    },
  })
  const client = createManagedExploreProvider({
    apiKey: KEY,
    timeoutMs: 20,
    fetch: mockFetch(() => new Response(stalled, { headers: { 'x-request-id': 'req_stalled' } })),
  })
  await assert.rejects(
    client.createSession({
      operationId: 'op_create',
      model: 'fixture-model',
      instructions: 'Fictional fleet workflow only.',
      sessionLimitCents: 100,
    }),
    providerError('delivery_unknown', 'reconcile', 'req_stalled'),
  )
  assert.equal(cancelled, true)
})

test('native fetch follows no redirects carrying the project credential', { timeout: 5000 }, async (t) => {
  let targetCalls = 0
  const client = await loopback(t, (request, response, url) => {
    if (url.pathname.endsWith('/redirect-target')) {
      targetCalls += 1
      return json(response, session())
    }
    assert.equal(request.method, 'GET')
    response.writeHead(307, { location: '/redirect-target' }).end()
  })
  await assert.rejects(client.readSession('sess_one'), providerError('invalid_response', 'retry_read'))
  assert.equal(targetCalls, 0)
})

test('create verifies the observed model, network policy and owner-approved bound', async () => {
  const input = {
    operationId: 'op_create',
    model: 'fixture-model',
    instructions: 'Fictional fleet workflow only.',
    sessionLimitCents: 100,
  }
  let calls = 0
  let current = session()
  const client = createManagedExploreProvider({
    apiKey: KEY,
    fetch: mockFetch(() => {
      calls += 1
      return wireJson(current, 201)
    }),
  })
  assert.throws(
    () => client.createSession({ ...input, sessionLimitCents: 0 }),
    providerError('invalid_input', 'terminal'),
  )
  assert.equal(calls, 0)

  current = { ...session(), spend_control: { limit: 1, consumed: null } }
  await assert.rejects(client.createSession(input), providerError('invalid_response', 'reconcile', 'req_fixture'))
  current = { ...session(), environment: { ...session().environment, network: { access: 'enabled' } } }
  await assert.rejects(client.createSession(input), providerError('invalid_response', 'reconcile', 'req_fixture'))
  current = { ...session(), agent: { ...session().agent, model: 'unexpected-model' } }
  await assert.rejects(client.createSession(input), providerError('invalid_response', 'reconcile', 'req_fixture'))
  assert.equal(calls, 3)
})

test('root input identity hashes one exact saved user message and ignores unrelated items', async () => {
  const text = 'Exact fictional UTF-8 input.\r\n'
  const item = {
    type: 'message',
    role: 'user',
    status: 'completed',
    phase: null,
    turn_id: 'turn_one',
    content: [{ type: 'input_text', text }],
  }
  let items = [{ ...item, turn_id: 'turn_old' }, item]
  const client = createManagedExploreProvider({
    apiKey: KEY,
    fetch: mockFetch(({ pathname }) => {
      assert.equal(pathname, `${BASE_PATH}/sess_one/turns/turn_one/items`)
      return wireJson(page(items))
    }),
  })
  assert.equal(
    (await client.readTurnInputDigest('sess_one', 'turn_one')).value,
    createHash('sha256').update(text).digest('hex'),
  )
  items = [item, item]
  assert.equal((await client.readTurnInputDigest('sess_one', 'turn_one')).value, null)
  items = [{ ...item, content: [{ type: 'input_image', text }] }]
  assert.equal((await client.readTurnInputDigest('sess_one', 'turn_one')).value, null)
})
