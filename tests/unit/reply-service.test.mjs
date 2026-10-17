// CON-01 B2 service executor (FND-B2-CON-SERVICE): one counted in-process call per reply, against a scripted LLM
// runtime and transport. The real wire validators, ReplyDelivery and ReplySettlements run; nothing leaves the process.
// The joined API/PostgreSQL crossing and the real adapter's single HTTP request are tests/integration's.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  REPLY_TAIL_MS,
  ReplyServiceExecutor,
  SERVICE_ROLE,
  SERVICE_ROLE_DIGEST,
  SERVICE_SYSTEM,
  reservationOf,
  serviceSettings,
  usedOf,
} from '../../packages/dsh-bundle/dist/reply-service.js'
import { ServiceTransport, TransportError } from '../../packages/dsh-bundle/dist/transport.js'
import { createServer } from 'node:http'

const DIGEST = 'a'.repeat(64)
const ROUTE = 'conversation-service-luna-high-v1'
const PRICES = { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 }
const SETTINGS = {
  mode: 'service',
  routeId: ROUTE,
  route: { provider: 'openai-conversation', model: 'gpt-6-luna', reasoningEffort: 'high', maxTokens: 4096 },
  prices: PRICES,
  executorArtifactDigest: DIGEST,
  retry: { requestWaitMs: 200, retryWaitMs: 5, maxAttempts: 2 },
  deadlineMs: 2_000,
}
const OWNER = { projectId: '00000000-0000-4000-8000-000000000001', runtimeUnitId: 'unit-1', leaseId: '00000000-0000-4000-8000-0000000000aa' }
const TUPLE = { execution: 'service', routeId: ROUTE, executorArtifactDigest: DIGEST }
const CONTEXT = 'PRIVATE-CONTEXT-CANARY: the project question and its notes'
const ANSWER = 'PRIVATE-ANSWER-CANARY: here is the answer'
let ids = 0
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`

function createCommand({ execution = TUPLE, route = ROUTE, projectId = OWNER.projectId, unit = 'calls_tokens', attemptId = uuid() } = {}) {
  return {
    schema: 'sophia.runtime-command.v1',
    commandId: uuid(),
    binding: { projectId, attemptId, resourceId: 'res-1', authorityEpoch: 1, runtimeUnitId: OWNER.runtimeUnitId, conversationReplyId: uuid() },
    kind: 'create',
    expectedNativeSessionId: null,
    contextPacketId: null,
    payload: {
      role: 'sophia-conversation-v1',
      route,
      text: CONTEXT,
      conversation: { credentialRef: 'cred-ref', ownerResourceRef: 'owner-ref', unit, ...(execution ? { execution } : {}) },
    },
  }
}
const follow = (create, kind) => ({ ...create, commandId: uuid(), kind, payload: {} })

/** The scripted server side: records every call in order, answers from `script`. */
function scriptedTransport(script = {}) {
  const calls = []
  const reservations = new Map()
  const transport = {
    calls,
    async conversationClaim(body) {
      calls.push(['claim', body])
      if (script.claim) return script.claim(body)
      return { result: 'first' }
    },
    async conversationGo(body) {
      calls.push(['go', body])
      if (script.go) return script.go(body)
      return { result: 'go' }
    },
    async conversationReserve(body) {
      calls.push(['reserve', body])
      if (script.reserve) return script.reserve(body)
      const answer = {
        replyId: script.replyId, ordinal: body.ordinal, state: 'reserved', lineageId: uuid(), grantRevision: 1, unit: body.call.unit,
        amount: { calls: 1, tokens: body.call.tokens, priceMicros: body.call.priceMicros }, used: null,
      }
      reservations.set(body.ordinal, answer)
      return answer
    },
    async conversationSettle(body) {
      calls.push(['settle', body])
      if (script.settle) return script.settle(body)
      return { ...reservations.get(body.ordinal), state: 'settled', used: body.used }
    },
    async observations(values) {
      for (const value of values) calls.push(['observation', value])
      if (script.observations) return script.observations(values)
    },
    async receipts(values) {
      if (script.receipts) return script.receipts(values)
      for (const value of values) calls.push(['receipt', value])
    },
  }
  return transport
}

/** A scripted dsh LLM runtime: prepareCall resolves the config, stream replays chunks (or waits for abort). */
function scriptedLlm(script = {}) {
  const prepared = []
  const streamed = []
  return {
    prepared,
    streamed,
    async prepareCall(config) {
      prepared.push(structuredClone(config))
      if (script.prepare) return script.prepare(config)
      return {
        config: { ...config, ...(script.resolved ?? {}) },
        stream(options) {
          streamed.push(options)
          return (script.stream ?? completeStream)(options)
        },
      }
    },
  }
}
const USAGE = { inputTokens: 120, outputTokens: 30, cacheReadTokens: 10 }
async function* completeStream() {
  yield { type: 'reasoning-delta', index: 0, text: 'PRIVATE-REASONING-CANARY' }
  yield { type: 'text-delta', index: 1, text: ANSWER.slice(0, 10) }
  yield { type: 'text-delta', index: 1, text: ANSWER.slice(10) }
  yield { type: 'usage', usage: USAGE }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
const hanging = (options) =>
  (async function* () {
    await new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }))
    throw new Error('aborted')
  })()

function scene(script = {}, settings = SETTINGS) {
  const command = createCommand(script.command)
  const transport = scriptedTransport({ replyId: command.binding.conversationReplyId, ...script.transport })
  const llm = scriptedLlm(script.llm)
  const lines = []
  const retained = []
  const executor = new ReplyServiceExecutor(OWNER, settings, llm, transport, (line) => lines.push(line), (r) => retained.push(r))
  return { command, transport, llm, lines, retained, executor }
}

async function until(predicate, what) {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return
    await sleep(5)
  }
  assert.fail(`timed out waiting for ${what}`)
}
const kinds = (transport) => transport.calls.map(([kind, value]) =>
  kind === 'observation' ? `obs:${value.type}` : kind === 'receipt' ? `receipt:${value.stage}${value.reason ? `:${value.reason}` : ''}` : kind)
const receipts = (transport) => transport.calls.filter(([kind]) => kind === 'receipt').map(([, value]) => value)
const noPrivate = (lines) => {
  const text = JSON.stringify(lines)
  for (const canary of ['PRIVATE-CONTEXT-CANARY', 'PRIVATE-ANSWER-CANARY', 'PRIVATE-REASONING-CANARY']) assert.ok(!text.includes(canary), canary)
}

describe('ReplyServiceExecutor (CON-01 B2)', () => {
  test('a complete reply: claim, go, delivered, reserve before the one call, settle, then the answer and its turn end', async () => {
    const { command, transport, llm, lines, executor } = scene()
    assert.deepEqual(executor.execute(command), [])
    await until(() => kinds(transport).includes('obs:turn/end'), 'turn end')
    assert.deepEqual(kinds(transport), [
      'claim', 'go', 'receipt:delivered', 'obs:turn/start', 'obs:user/message', 'reserve', 'settle', 'obs:assistant/message', 'obs:turn/end',
    ])
    // The one call: public prepareCall/stream with the pinned route, no session id, no tools, the fixed instruction.
    assert.deepEqual(llm.prepared, [{ provider: 'openai-conversation', model: 'gpt-6-luna', maxTokens: 4096, reasoningEffort: 'high' }])
    assert.equal(llm.streamed.length, 1)
    const [options] = llm.streamed
    assert.equal(options.sessionId, undefined)
    assert.equal(options.purpose, undefined)
    assert.deepEqual(options.tools, [])
    assert.equal(options.system, SERVICE_SYSTEM)
    assert.deepEqual(options.messages, [{ role: 'user', content: [{ type: 'text', text: CONTEXT }] }])
    assert.ok(options.signal instanceof AbortSignal)
    const reserve = transport.calls.find(([kind]) => kind === 'reserve')[1]
    assert.deepEqual(reserve.call, { routeId: ROUTE, credentialRef: 'cred-ref', ownerResourceRef: 'owner-ref', unit: 'calls_tokens',
      ...reservationOf(CONTEXT, 'calls_tokens', SETTINGS) })
    const settle = transport.calls.find(([kind]) => kind === 'settle')[1]
    assert.deepEqual(settle.used, { calls: 1, tokens: 160, priceMicros: 0 })
    const answer = transport.calls.find(([kind, v]) => kind === 'observation' && v.type === 'assistant/message')[1]
    assert.deepEqual(answer.data, {
      text: ANSWER, oversize: false, invalidText: false, length: ANSWER.length, provider: 'openai-conversation', model: 'gpt-6-luna',
      inputTokens: 120, outputTokens: 30, cacheReadTokens: 10, interrupted: false, ordinal: 1,
    })
    const end = transport.calls.find(([kind, v]) => kind === 'observation' && v.type === 'turn/end')[1]
    assert.deepEqual(end.data, { reason: { kind: 'completed' } })
    assert.equal(end.nativeSessionId, `sophia-${command.binding.attemptId}`)
    assert.ok(!JSON.stringify(transport.calls).includes('PRIVATE-REASONING-CANARY'), 'reasoning never leaves')
    noPrivate(lines)
    // The same command again is not executed twice.
    executor.execute(command)
    await sleep(20)
    assert.equal(llm.streamed.length, 1)
  })

  test('the role advertised names the fixed instruction, the route and this executor (A40)', () => {
    const { executor } = scene()
    assert.deepEqual(executor.role(), { id: SERVICE_ROLE, route: ROUTE, presetDigest: SERVICE_ROLE_DIGEST, executor: TUPLE })
    assert.match(SERVICE_ROLE_DIGEST, /^sha256:[0-9a-f]{64}$/)
  })

  for (const [name, command] of [
    ['no pinned tuple (native or unpinned grant)', { execution: null }],
    ['another artifact digest', { execution: { ...TUPLE, executorArtifactDigest: 'b'.repeat(64) } }],
    ['another route in the tuple', { execution: { ...TUPLE, routeId: 'other-route-v1' } }],
    ['another route on the command', { route: 'other-route-v1', execution: { ...TUPLE, routeId: 'other-route-v1' } }],
    ['another project', { projectId: '00000000-0000-4000-8000-0000000000ff' }],
  ]) {
    test(`wrong scope, zero dispatch: ${name}`, async () => {
      const { command: create, transport, llm, executor } = scene({ command })
      executor.execute(create)
      await until(() => receipts(transport).length === 1, 'refusal')
      assert.equal(receipts(transport)[0].stage, 'rejected')
      assert.deepEqual(kinds(transport).filter((k) => !k.startsWith('receipt')), [], 'no claim, go, observation or reservation')
      assert.equal(llm.prepared.length, 0)
    })
  }

  test('a claim refused or lost, or a go refused, makes no call', async () => {
    for (const [transport, stage] of [
      [{ claim: () => ({ result: 'refused', code: 'already_claimed' }) }, 'outcome_unknown'],
      [{ claim: () => { throw new Error('lost') } }, 'outcome_unknown'],
      [{ go: () => ({ result: 'refused', code: 'not_pending' }) }, 'rejected'],
      [{ go: () => { throw new Error('lost') } }, 'rejected'],
    ]) {
      const s = scene({ transport })
      s.executor.execute(s.command)
      await until(() => receipts(s.transport).length === 1, 'refusal')
      assert.equal(receipts(s.transport)[0].stage, stage)
      assert.equal(s.llm.prepared.length, 0)
      assert.ok(!kinds(s.transport).includes('reserve'))
    }
  })

  test('a refused reservation ends the turn with no call', async () => {
    const s = scene({ transport: { reserve: () => { throw Object.assign(new Error('refused'), { status: 409 }) } } })
    s.executor.execute(s.command)
    await until(() => receipts(s.transport).some((r) => r.stage === 'failed'), 'failed receipt')
    assert.equal(s.llm.streamed.length, 0)
    assert.ok(!kinds(s.transport).includes('settle'))
  })

  test('a resolved call that is not exactly the pinned route is refused before anything is reserved', async () => {
    const s = scene({ llm: { resolved: { maxTokens: 16000 } } })
    s.executor.execute(s.command)
    await until(() => receipts(s.transport).some((r) => r.stage === 'failed'), 'failed receipt')
    assert.equal(receipts(s.transport).at(-1).reason, 'call_unprepared')
    assert.ok(!kinds(s.transport).includes('reserve'))
    assert.equal(s.llm.streamed.length, 0)
  })

  for (const [name, stream, reason] of [
    ['a provider error with no usage', async function* () { throw new Error('HTTP 503') }, 'call_failed'],
    ['a provider error that still reports usage (a refused 429 reports zeros)', async function* () {
      yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
      yield { type: 'finish', reason: { kind: 'error', failure: { kind: 'rate-limit' } } }
    }, 'call_failed'],
    ['a stream that ends without usage', async function* () {
      yield { type: 'text-delta', index: 0, text: ANSWER }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }, 'usage_unknown'],
    ['two differing usage reports', async function* () {
      yield { type: 'text-delta', index: 0, text: ANSWER }
      yield { type: 'usage', usage: USAGE }
      yield { type: 'usage', usage: { ...USAGE, outputTokens: 99 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }, 'usage_unknown'],
  ]) {
    test(`honest uncertainty: ${name} is a failed receipt, no settlement and no answer`, async () => {
      const s = scene({ llm: { stream } })
      s.executor.execute(s.command)
      await until(() => receipts(s.transport).some((r) => r.stage === 'failed'), 'failed receipt')
      const failed = receipts(s.transport).at(-1)
      assert.equal(failed.reason, reason)
      assert.equal(failed.nativeSessionId, `sophia-${s.command.binding.attemptId}`)
      assert.ok(!kinds(s.transport).includes('settle'))
      assert.ok(!kinds(s.transport).includes('obs:assistant/message'))
      assert.ok(!kinds(s.transport).includes('obs:turn/end'))
      noPrivate(s.lines)
    })
  }

  test('an unconfirmed settlement publishes nothing', async () => {
    const s = scene({ transport: { settle: () => { throw new Error('lost') } } })
    s.executor.execute(s.command)
    await until(() => receipts(s.transport).some((r) => r.stage === 'failed'), 'failed receipt')
    assert.equal(receipts(s.transport).at(-1).reason, 'settle_unconfirmed')
    assert.ok(!kinds(s.transport).includes('obs:assistant/message'))
    assert.ok(!kinds(s.transport).includes('obs:turn/end'))
  })

  test('settled but not an answer: a tool call is blocked, max tokens is max-tokens, an empty text an error', async () => {
    for (const [stream, kind] of [
      [async function* () {
        yield { type: 'tool-call-delta', index: 0, id: 't', name: 'x', argumentsDelta: '{}' }
        yield { type: 'usage', usage: USAGE }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
      }, 'blocked'],
      [async function* () {
        yield { type: 'text-delta', index: 0, text: 'partial' }
        yield { type: 'usage', usage: USAGE }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
      }, 'max-tokens'],
      [async function* () {
        yield { type: 'usage', usage: USAGE }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }, 'error'],
    ]) {
      const s = scene({ llm: { stream } })
      s.executor.execute(s.command)
      await until(() => kinds(s.transport).includes('obs:turn/end'), 'turn end')
      assert.ok(kinds(s.transport).includes('settle'))
      assert.ok(!kinds(s.transport).includes('obs:assistant/message'))
      const end = s.transport.calls.find(([k, v]) => k === 'observation' && v.type === 'turn/end')[1]
      assert.deepEqual(end.data, { reason: { kind } })
    }
  })

  test('Stop aborts the call in flight, drains it, then answers checked; nothing more is observed', async () => {
    const s = scene({ llm: { stream: hanging } })
    s.executor.execute(s.command)
    await until(() => s.llm.streamed.length === 1, 'call started')
    s.executor.execute(follow(s.command, 'stop'))
    await until(() => receipts(s.transport).some((r) => r.stage === 'checked'), 'stop checked')
    assert.ok(s.llm.streamed[0].signal.aborted)
    assert.deepEqual(receipts(s.transport).map((r) => r.stage), ['delivered', 'checked'])
    assert.ok(!kinds(s.transport).includes('obs:assistant/message'))
    assert.ok(!kinds(s.transport).includes('obs:turn/end'))
    assert.ok(!kinds(s.transport).includes('settle'), 'an abort is not settlement')
  })

  test('Stop before claim: no claim and no call', async () => {
    let release
    const s = scene({ transport: { claim: () => new Promise((resolve) => (release = resolve)) } })
    s.executor.execute(s.command)
    await until(() => release !== undefined, 'claim sent')
    s.executor.execute(follow(s.command, 'stop'))
    release({ result: 'first' })
    await until(() => receipts(s.transport).some((r) => r.stage === 'checked'), 'stop checked')
    assert.equal(s.llm.prepared.length, 0)
  })

  test('the executor deadline aborts the call independently of Stop', async () => {
    const s = scene({ llm: { stream: hanging } }, { ...SETTINGS, deadlineMs: 50 })
    s.executor.execute(s.command)
    await until(() => receipts(s.transport).some((r) => r.stage === 'failed'), 'deadline')
    assert.equal(receipts(s.transport).at(-1).reason, 'call_deadline')
    assert.ok(s.llm.streamed[0].signal.aborted)
  })

  test('retire: checked with this executor named, after the call drained; never for an attempt not its own', async () => {
    const s = scene()
    s.executor.execute(s.command)
    await until(() => kinds(s.transport).includes('obs:turn/end'), 'turn end')
    s.executor.execute(follow(s.command, 'retire'))
    await until(() => receipts(s.transport).some((r) => r.stage === 'checked'), 'retire checked')
    assert.deepEqual(receipts(s.transport).at(-1).executor, TUPLE)
    const foreign = follow(createCommand(), 'retire')
    for (const kind of ['retire', 'stop', 'inspect']) s.executor.execute({ ...foreign, commandId: uuid(), kind })
    await sleep(30)
    assert.equal(receipts(s.transport).filter((r) => r.attemptId === foreign.binding.attemptId).length, 0, 'no answer: the obligation stays')
  })

  test('restart: only the exact tuple is adopted; an adopted attempt is retired, never dispatched again', async () => {
    const s = scene()
    const adopted = createCommand()
    for (const provenance of [undefined, { execution: 'native' }, { ...TUPLE, executorArtifactDigest: 'c'.repeat(64) }, { ...TUPLE, extra: 1 }]) {
      assert.equal(s.executor.adopt({ attemptId: uuid(), provenance }), false)
    }
    assert.equal(s.executor.adopt({ attemptId: adopted.binding.attemptId, provenance: { ...TUPLE } }), true)
    s.executor.execute(adopted)
    await until(() => receipts(s.transport).length === 1, 'refusal')
    assert.deepEqual(receipts(s.transport).map((r) => [r.stage, r.reason]), [['outcome_unknown', 'reply_recovery_required']])
    assert.ok(!kinds(s.transport).includes('claim'))
    s.executor.execute(follow(adopted, 'stop'))
    s.executor.execute(follow(adopted, 'retire'))
    await until(() => receipts(s.transport).length === 3, 'stop and retire')
    assert.deepEqual(receipts(s.transport).slice(1).map((r) => [r.stage, r.executor ?? null]), [['checked', null], ['checked', TUPLE]])
    assert.equal(s.llm.prepared.length, 0)
  })
})

describe('bounded requests and retained receipts (#393 review)', () => {
  test('a claim or go that never answers is bounded by the request wait: no call, a receipt says so', async () => {
    for (const [transport, stage, reason] of [
      [{ claim: () => new Promise(() => {}) }, 'outcome_unknown', 'claim_unconfirmed'],
      [{ go: () => new Promise(() => {}) }, 'rejected', 'go_unconfirmed'],
    ]) {
      const s = scene({ transport: { ...transport } })
      // A transport that honours the signal, as ServiceTransport's fetch does.
      const hang = transport.claim ? 'conversationClaim' : 'conversationGo'
      s.transport[hang] = (_body, signal) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
      const began = Date.now()
      s.executor.execute(s.command)
      await until(() => receipts(s.transport).some((r) => r.stage === stage), `${stage} receipt`)
      assert.ok(Date.now() - began < 2_000, 'within the request wait, not forever')
      assert.equal(receipts(s.transport).at(-1).reason, reason)
      assert.equal(s.llm.prepared.length, 0)
    }
  })

  test('receipts the service cannot take are retained, never dropped; an unconfirmed delivered becomes a terminal failed', async () => {
    const s = scene({ transport: { receipts: () => Promise.reject(new Error('connection reset')) } })
    s.executor.execute(s.command)
    await until(() => s.retained.length === 2, 'the retained receipts')
    const [delivered, failed] = s.retained
    assert.deepEqual([delivered.commandId, delivered.stage, delivered.reason], [s.command.commandId, 'delivered', null], 'kept with its exact identity')
    assert.deepEqual([failed.commandId, failed.stage, failed.reason, failed.nativeSessionId], [s.command.commandId, 'failed', 'delivery_unconfirmed', `sophia-${s.command.binding.attemptId}`])
    assert.equal(s.llm.prepared.length, 0, 'no call after an unconfirmed delivered')
    assert.ok(!kinds(s.transport).includes('observation'))
    // A refused or a terminal receipt is kept as itself.
    const r = scene({ command: { execution: null }, transport: { receipts: () => Promise.reject(new Error('timeout')) } })
    r.executor.execute(r.command)
    await until(() => r.retained.length === 1, 'the retained rejection')
    assert.deepEqual([r.retained[0].stage, r.retained[0].reason], ['rejected', 'reply_executor_mismatch'])
  })

  test('a receipt the service refused (4xx) is not retained: it would block every receipt behind it', async () => {
    const s = scene({ command: { execution: null }, transport: { receipts: () => Promise.reject(new TransportError('refused', 409, 'invalid_state')) } })
    s.executor.execute(s.command)
    await until(() => s.lines.some((l) => l.startsWith('reply_service_receipt_refused')), 'the refusal log')
    await sleep(30)
    assert.deepEqual(s.retained, [])
  })
})

/**
 * A real local service over HTTP (the bridge's own ServiceTransport, not a scripted object): each named endpoint either
 * answers, or sends its headers and part of a body and then never finishes, the way a stalled server does.
 */
async function stallingService(stall) {
  const seen = []
  const open = new Set()
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const name = req.url.split('?')[0].split('/').at(-1)
    const body = raw ? JSON.parse(raw) : null
    seen.push([name, body])
    if (stall.has(name)) {
      open.add(res)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{"result":')
      return
    }
    const answers = { claim: { result: 'first' }, go: { result: 'go' } }
    if (name === 'receipts' || name === 'observations') return res.writeHead(204).end()
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answers[name] ?? {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const transport = new ServiceTransport({
    baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'local-only', runtimeUnitId: OWNER.runtimeUnitId, bridgeInstanceId: OWNER.leaseId,
  })
  return {
    transport,
    seen,
    close: () => new Promise((resolve) => { for (const res of open) res.destroy(); server.closeAllConnections?.(); server.close(resolve) }),
  }
}

describe('stalled HTTP responses are bounded (R-B2-02, real ServiceTransport)', () => {
  const FAST = { ...SETTINGS, retry: { requestWaitMs: 150, retryWaitMs: 5, maxAttempts: 2 } }
  for (const [endpoint, stage, reason] of [['claim', 'outcome_unknown', 'claim_unconfirmed'], ['go', 'rejected', 'go_unconfirmed']]) {
    test(`a ${endpoint} whose body never completes ends within the request wait, with no call`, async (t) => {
      const service = await stallingService(new Set([endpoint]))
      t.after(service.close)
      const llm = scriptedLlm()
      const executor = new ReplyServiceExecutor(OWNER, FAST, llm, service.transport, () => {}, () => {})
      const command = createCommand()
      const began = Date.now()
      executor.execute(command)
      await until(() => service.seen.some(([n, b]) => n === 'receipts' && b.receipts[0].stage === stage), `${stage} receipt`)
      assert.ok(Date.now() - began < 1_500)
      assert.equal(service.seen.find(([n]) => n === 'receipts')[1].receipts[0].reason, reason)
      assert.equal(llm.prepared.length, 0)
    })
  }

  test('a receipt endpoint that stalls is bounded; Stop and retire still drain, and every receipt is retained', async (t) => {
    const service = await stallingService(new Set(['receipts']))
    t.after(service.close)
    const llm = scriptedLlm()
    const retained = []
    const executor = new ReplyServiceExecutor(OWNER, FAST, llm, service.transport, () => {}, (r) => retained.push(r))
    const command = createCommand()
    executor.execute(command)
    await until(() => retained.length === 2, 'delivered and its terminal failed retained')
    assert.deepEqual(retained.map((r) => r.stage), ['delivered', 'failed'])
    const began = Date.now()
    executor.execute(follow(command, 'stop'))
    executor.execute(follow(command, 'retire'))
    await until(() => retained.length === 4, 'stop and retire retained')
    assert.ok(Date.now() - began < 1_500, 'Stop and retire drained within bounds')
    assert.deepEqual(retained.slice(2).map((r) => [r.stage, r.executor ?? null]), [['checked', null], ['checked', TUPLE]])
    assert.equal(llm.prepared.length, 0, 'no call after an unconfirmed delivered')
  })

  test('after dispose (a superseded lease), nothing more is retained and the call is aborted', async () => {
    const s = scene({ llm: { stream: hanging } })
    s.executor.execute(s.command)
    await until(() => s.llm.streamed.length === 1, 'call in flight')
    s.executor.dispose()
    await until(() => s.llm.streamed[0].signal.aborted, 'the abort')
    await sleep(30)
    assert.deepEqual(s.retained, [])
    assert.ok(!kinds(s.transport).includes('settle'), 'an abort is not settlement')
  })
})

describe('service settings and accounting', () => {
  test('missing prices, digest, route or bounds make the mode unavailable', () => {
    assert.throws(() => serviceSettings({ ...SETTINGS, prices: undefined }), /reply_service_settings_invalid/)
    assert.throws(() => serviceSettings({ ...SETTINGS, prices: { ...PRICES, output: undefined } }), /reply_service_settings_invalid/)
    assert.throws(() => serviceSettings({ ...SETTINGS, executorArtifactDigest: 'not-a-digest' }), /reply_service_settings_invalid/)
    assert.throws(() => serviceSettings({ ...SETTINGS, routeId: 'Default' }), /reply_service_settings_invalid/)
    assert.throws(() => serviceSettings({ ...SETTINGS, deadlineMs: 400_000 }), /reply_service_settings_invalid/)
    assert.throws(() => new ReplyServiceExecutor(OWNER, { ...SETTINGS, prices: undefined }, scriptedLlm(), scriptedTransport()))
  })

  test('the reservation bounds the call; usage settles exactly, and unknown counts settle nothing', () => {
    const bytes = Buffer.byteLength(SERVICE_SYSTEM) + Buffer.byteLength(CONTEXT) + 64
    assert.deepEqual(reservationOf(CONTEXT, 'calls_tokens', SETTINGS), { tokens: bytes + 4096, priceMicros: 0 })
    assert.deepEqual(reservationOf(CONTEXT, 'usd', SETTINGS), { tokens: 0, priceMicros: Math.ceil(bytes * 0.125 + 4096 * 0.5) })
    assert.deepEqual(usedOf(USAGE, 'usd', PRICES), { calls: 1, tokens: 160, priceMicros: Math.ceil(120 * 0.1 + 30 * 0.5 + 10 * 0.01), usage: USAGE })
    assert.equal(usedOf(null, 'usd', PRICES), null)
    assert.equal(usedOf({ inputTokens: 1.5, outputTokens: 1 }, 'usd', PRICES), null)
    assert.equal(usedOf({ inputTokens: 1, outputTokens: 1, cacheReadTokens: -1 }, 'usd', PRICES), null)
  })

  test('a usd reply reserves and settles in price micros', async () => {
    const s = scene({ command: { unit: 'usd' } })
    s.executor.execute(s.command)
    await until(() => kinds(s.transport).includes('obs:turn/end'), 'turn end')
    const settle = s.transport.calls.find(([kind]) => kind === 'settle')[1]
    assert.deepEqual(settle.used, { calls: 1, tokens: 0, priceMicros: Math.ceil(120 * 0.1 + 30 * 0.5 + 10 * 0.01) })
  })
})

/**
 * #393 discussion 4302482622: one finite plan per reply on one clock. A virtual clock (the ReplyStopClock seam) runs
 * the production bounds (each request 10 s, 3 attempts, the call 120 s; the reply's deadline the call plus
 * REPLY_TAIL_MS). Scripted stages advance the clock and nothing waits for real. A slow opening is scripted as slow
 * preparation, which no per-request timer bounds; the opening's own observations are bounded by their requests.
 */
function virtualClock() {
  let now = 1_000
  const timers = []
  return {
    now: () => now,
    after(ms, callback) {
      const timer = { at: now + Math.max(0, ms), callback, done: false }
      timers.push(timer)
      return () => {
        timer.done = true
      }
    },
    advance(ms) {
      now += ms
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (!timer.done && timer.at <= now) {
          timer.done = true
          timer.callback()
        }
      }
    },
  }
}
const PRODUCTION = { ...SETTINGS, retry: { requestWaitMs: 10_000, retryWaitMs: 1_000, maxAttempts: 3 }, deadlineMs: 120_000 }

function slowScene({ prepare = 0, reserve = 0, call = 0, settle = 0, settleFails = false, usage = true } = {}) {
  const clock = virtualClock()
  const command = createCommand()
  const transport = scriptedTransport({
    replyId: command.binding.conversationReplyId,
    reserve: (body) => {
      clock.advance(reserve)
      return {
        replyId: command.binding.conversationReplyId, ordinal: body.ordinal, state: 'reserved', lineageId: uuid(), grantRevision: 1,
        unit: body.call.unit, amount: { calls: 1, tokens: body.call.tokens, priceMicros: body.call.priceMicros }, used: null,
      }
    },
    settle: (body) => {
      clock.advance(settle)
      if (settleFails) throw new Error('settle not confirmed')
      return { replyId: command.binding.conversationReplyId, ordinal: body.ordinal, state: 'settled', lineageId: uuid(), grantRevision: 1,
        unit: 'calls_tokens', amount: { calls: 1, tokens: body.used.tokens, priceMicros: 0 }, used: body.used }
    },
  })
  const llm = scriptedLlm({
    prepare: (config) => {
      clock.advance(prepare)
      return {
        config,
        stream(options) {
          llm.streamed.push(options)
          return (async function* () {
            clock.advance(call)
            if (options.signal.aborted) throw new Error('aborted')
            yield { type: 'text-delta', index: 0, text: ANSWER }
            if (usage) yield { type: 'usage', usage: USAGE }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      }
    },
  })
  const executor = new ReplyServiceExecutor(OWNER, PRODUCTION, llm, transport, () => {}, () => {}, clock)
  return { command, transport, llm, executor, clock }
}
const ended = (transport) => kinds(transport).some((k) => k === 'obs:turn/end' || k.startsWith('receipt:failed'))
const count = (transport, kind) => transport.calls.filter(([k]) => k === kind).length

describe('one finite call, settlement and delivery plan (#393 discussion 4302482622)', () => {
  test('a slow opening and a call that fits what remains: settled and published once, inside the one deadline', async () => {
    const s = slowScene({ prepare: 42_000, call: 70_000 })
    s.executor.execute(s.command)
    await until(() => ended(s.transport), 'the end')
    assert.deepEqual(kinds(s.transport), [
      'claim', 'go', 'receipt:delivered', 'obs:turn/start', 'obs:user/message', 'reserve', 'settle', 'obs:assistant/message', 'obs:turn/end',
    ])
    assert.equal(s.llm.streamed.length, 1)
  })

  test('the witness: 42 s before the call, then a call that would end past the deadline, is cut where the tail begins', async () => {
    // Unbounded by what remained, this call settled at 161 s of a 150 s deadline and its answer failed (BEFORE log).
    const s = slowScene({ prepare: 42_000, call: 119_000 })
    s.executor.execute(s.command)
    await until(() => ended(s.transport), 'the end')
    const k = kinds(s.transport)
    assert.deepEqual(k.slice(-1), ['receipt:failed:call_deadline'])
    assert.ok(!k.includes('settle'), 'aborted: its usage is not evidence; the reservation stays counted (uncertain)')
    assert.ok(!k.includes('obs:assistant/message'), 'no answer')
    assert.equal(s.llm.streamed.length, 1, 'one call, no retry')
    assert.equal(count(s.transport, 'reserve'), 1, 'one reservation')
    assert.equal(s.llm.streamed[0].signal.aborted, true, 'its signal ended at 42 s + 78 s = 120 s, the tail\'s start')
  })

  test('no budget left before the call: nothing reserved, nothing called', async () => {
    const s = slowScene({ prepare: 125_000 })
    s.executor.execute(s.command)
    await until(() => ended(s.transport), 'the end')
    assert.deepEqual(kinds(s.transport).slice(-1), ['receipt:failed:call_deadline'])
    assert.equal(count(s.transport, 'reserve'), 0)
    assert.equal(s.llm.streamed.length, 0, 'zero provider calls')
  })

  test('no budget left after a slow reservation: no call; the reservation stays counted', async () => {
    const s = slowScene({ prepare: 112_000, reserve: 9_000 })
    s.executor.execute(s.command)
    await until(() => ended(s.transport), 'the end')
    const k = kinds(s.transport)
    assert.deepEqual(k.slice(-2), ['reserve', 'receipt:failed:call_deadline'])
    assert.ok(!k.includes('settle'), 'no synthetic zero, no release')
    assert.equal(s.llm.streamed.length, 0, 'zero provider calls')
  })

  test('the tail is the deadline\'s: a settlement that uses part of it still leaves the answer room', async () => {
    const s = slowScene({ prepare: 42_000, call: 77_999, settle: 9_000 })
    s.executor.execute(s.command)
    await until(() => ended(s.transport), 'the end')
    assert.deepEqual(kinds(s.transport).slice(-3), ['settle', 'obs:assistant/message', 'obs:turn/end'])
  })

  test('a settlement never runs past the reply\'s deadline: unconfirmed by then, it fails, and no answer follows', async () => {
    // Each settle attempt takes its full 10 s and fails; three of them and their backoffs would end at 32 s of a 30 s tail.
    const s = slowScene({ call: 119_999, settle: 10_000, settleFails: true })
    s.executor.execute(s.command)
    // Virtual time passes while the settlement backs off between attempts (nothing else would advance it).
    const pump = setInterval(() => s.clock.advance(250), 1)
    try {
      await until(() => ended(s.transport), 'the end')
    } finally {
      clearInterval(pump)
    }
    assert.ok(count(s.transport, 'settle') <= 3, 'at most its bounded attempts')
    const k = kinds(s.transport)
    assert.deepEqual(k.slice(-1), ['receipt:failed:settle_unconfirmed'])
    assert.ok(!k.includes('obs:assistant/message'))
    assert.equal(s.llm.streamed.length, 1)
  })

  test('unknown usage from a call that fits is still never settled as zero', async () => {
    const s = slowScene({ prepare: 42_000, call: 10_000, usage: false })
    s.executor.execute(s.command)
    await until(() => ended(s.transport), 'the end')
    const k = kinds(s.transport)
    assert.deepEqual(k.slice(-1), ['receipt:failed:usage_unknown'])
    assert.ok(!k.includes('settle'))
  })
})
