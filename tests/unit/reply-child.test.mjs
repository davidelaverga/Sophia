// CON Step3 wire boundaries. Process/relay lifecycle cases join this file when that source is assembled.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wire } from '../../packages/dsh-bundle/src/runtime-wire.generated.ts'
import { openapi } from '../../packages/contracts/src/index.ts'
import { ServiceTransport, TransportError } from '../../packages/dsh-bundle/dist/transport.js'
import { Duplex, Writable } from 'node:stream'
import { ChildProcess, spawn } from 'node:child_process'
import { setImmediate as tick } from 'node:timers/promises'
import { ReplyRelay, ReplyRecoveryReader, recoverReplyJournal, verifyReplyJournal, ReplyChildStop, ReplySettlements, ReplyChild, ReplyAdmission, ReplyDelivery, ReplyChildren, replyHomeVerification, replyOwnedLauncher, parseReplyObservation, reduceReplyObservation } from '../../packages/dsh-bundle/dist/reply-child.js'

const goalBinding = { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'a', resourceId: 'r', authorityEpoch: 1, runtimeUnitId: 'u' }
const { goalId: _goal, goalRevision: _revision, ...common } = goalBinding
const replyBinding = { ...common, conversationReplyId: '00000000-0000-0000-0000-000000000001' }
const command = (binding, kind = 'create') => ({
  schema: 'sophia.runtime-command.v1', commandId: 'cmd-1', binding, kind,
  expectedNativeSessionId: null, contextPacketId: null, payload: kind === 'create' && 'conversationReplyId' in binding ? {
    role: 'sophia-conversation-v1', route: 'route-test', text: 'synthetic',
    conversation: { credentialRef: 'synthetic-credential-ref', ownerResourceRef: 'synthetic-owner-resource-ref', unit: 'calls_tokens' },
  } : {},
})

test('conversation transport validates both directions and carries bounded-call cancellation', async () => {
  const transport = new ServiceTransport({ baseUrl: 'https://synthetic.invalid', token: 'synthetic-only', runtimeUnitId: 'u', bridgeInstanceId: '00000000-0000-0000-0000-000000000005' })
  const body = { attemptId: '00000000-0000-0000-0000-000000000006', commandId: '00000000-0000-0000-0000-000000000001', authorityEpoch: 1, leaseId: '00000000-0000-0000-0000-000000000005' }
  const controller = new AbortController()
  const requests = []
  const originalFetch = globalThis.fetch
  let response = { result: 'first' }
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return Response.json(response) }
  try {
    assert.deepEqual(await transport.conversationClaim(body, controller.signal), response)
    response = { result: 'go' }
    assert.deepEqual(await transport.conversationGo(body, controller.signal), response)
    response = { replyId: '00000000-0000-0000-0000-000000000003', ordinal: 1, state: 'reserved', lineageId: '00000000-0000-0000-0000-000000000004', grantRevision: 1, unit: 'calls_tokens', amount: { calls: 1, tokens: 10, priceMicros: 0 }, used: null }
    const reserve = { ...body, ordinal: 1, call: { routeId: 'synthetic', credentialRef: 'synthetic-ref', ownerResourceRef: 'synthetic-owner', unit: 'calls_tokens', tokens: 10, priceMicros: 0 } }
    assert.deepEqual(await transport.conversationReserve(reserve, controller.signal), response)
    response = { ...response, state: 'settled', used: { calls: 1, tokens: 5, priceMicros: 0 } }
    assert.deepEqual(await transport.conversationSettle({ ...body, ordinal: 1, used: response.used }, controller.signal), response)
    // An invalid acknowledgement must fail before a caller can interpret cleanup predicates.
    response = { predicates: {} }
    await assert.rejects(transport.conversationAcknowledged({ ...body, keys: { observations: [], usage: [], ordinals: [], hasTurnEnd: false } }, controller.signal), /runtime contract/)
    assert.deepEqual(requests.map(r => r.url.pathname), ['claim', 'go', 'reserve', 'settle', 'acknowledged'].map(p => `/v1/runtime/conversation/${p}`))
    for (const { options } of requests) {
      assert.equal(options.signal, controller.signal)
      assert.equal(options.headers['x-sophia-bridge-instance'], body.leaseId)
      assert.equal(options.headers.authorization, 'Bearer synthetic-only')
    }
    const calls = requests.length
    await assert.rejects(transport.conversationClaim({ ...body, authorityEpoch: -1 }), /runtime contract/)
    assert.equal(requests.length, calls, 'invalid request never leaves')
    globalThis.fetch = async (_url, options) => { assert.equal(options.signal, controller.signal); throw new DOMException('synthetic abort', 'AbortError') }
    controller.abort()
    await assert.rejects(transport.observations([], controller.signal), { name: 'AbortError' })
  } finally { globalThis.fetch = originalFetch }
})

test('CON reply wire accepts exactly one complete owner and preserves the original goal branch', () => {
  assert.equal(wire.RuntimeCommand(command(goalBinding)), true)
  assert.equal(wire.RuntimeCommand(command(replyBinding)), true, 'actual reply binding must not need a hidden goal')
  for (const binding of [common, { ...goalBinding, ...replyBinding }, { ...replyBinding, goalId: null },
    { ...replyBinding, goalRevision: 1 }, { ...replyBinding, conversationReplyId: 'not-a-uuid' }]) {
    assert.equal(wire.RuntimeCommand(command(binding)), false, JSON.stringify(binding))
  }
  for (const key of ['projectId', 'attemptId', 'resourceId', 'authorityEpoch', 'runtimeUnitId']) {
    const missing = { ...replyBinding }; delete missing[key]
    assert.equal(wire.RuntimeCommand(command(missing)), false, key)
  }
})

test('CON reply wire represents retire without changing existing command and role/route shapes', () => {
  assert.equal(wire.RuntimeCommand(command(replyBinding, 'retire')), true)
  for (const kind of ['create', 'resume', 'input', 'steer', 'hold', 'stop', 'inspect']) {
    assert.equal(wire.RuntimeCommand({ ...command(goalBinding, kind), payload: { role: 'sophia-research-md-v1', route: 'research-sol-medium-v1' } }), true)
  }
  assert.equal(wire.RuntimeCommand(command(replyBinding, 'purge')), false)
})

test('CON create requires a closed trusted reserve snapshot that goal and control commands reject', () => {
  const valid = command(replyBinding)
  assert.equal(wire.RuntimeCommand(valid), true)
  for (const key of ['credentialRef', 'ownerResourceRef', 'unit']) {
    const missing = structuredClone(valid); delete missing.payload.conversation[key]
    assert.equal(wire.RuntimeCommand(missing), false, key)
  }
  for (const payload of [{}, { ...valid.payload, conversation: undefined },
    { ...valid.payload, role: 'sophia-research-md-v1' },
    { ...valid.payload, conversation: { ...valid.payload.conversation, actorId: 'forged' } },
    { ...valid.payload, conversation: { ...valid.payload.conversation, unit: 'invented' } }]) {
    assert.equal(wire.RuntimeCommand({ ...valid, payload }), false)
  }
  for (const binding of [goalBinding, replyBinding]) {
    for (const kind of ['stop', 'inspect', 'retire']) assert.equal(wire.RuntimeCommand({ ...command(binding, kind), payload: valid.payload }), false)
  }
  assert.equal(wire.RuntimeCommand({ ...valid, binding: goalBinding }), false)
})

test('CON reply wire carries complete 500-goal plus two-reply hello and failed-recovery reports, with original batch caps', () => {
  const bindings = Array.from({ length: 503 }, (_, i) => ({ attemptId: `a-${i}`, nativeSessionId: `sophia-a-${i}`, authorityEpoch: 1, state: 'active', ...(i < 500 ? {} : { conversationReplyId: '00000000-0000-0000-0000-000000000001', create: null }) }))
  const unrecovered = bindings.map(b => ({ attemptId: b.attemptId, reason: 'synthetic-recovery-failure' }))
  for (const n of [500, 501, 502]) {
    assert.equal(wire.RuntimeHelloReply({ projectId: 'p', leaseId: 'lease', authorityEpoch: 1, bindings: bindings.slice(0, n), cursor: 0 }), true, `hello ${n}`)
    assert.equal(wire.RuntimeReady({ state: 'ready', reason: null, unrecovered: unrecovered.slice(0, n) }), true, `ready ${n}`)
  }
  assert.equal(wire.RuntimeHelloReply({ projectId: 'p', leaseId: 'lease', authorityEpoch: 1, bindings, cursor: 0 }), false)
  assert.equal(wire.RuntimeReady({ state: 'ready', reason: null, unrecovered }), false)
  assert.equal(openapi.components.schemas.RuntimeObservationBatch.properties.observations.maxItems, 500)
  assert.equal(openapi.components.schemas.RuntimeReceiptBatch.properties.receipts.maxItems, 500)
})


test('CON recovery metadata is exclusive and closed, with the original create epoch independent from cancellation', () => {
  const goal = { attemptId: 'a1', nativeSessionId: 'sophia-a1', authorityEpoch: 2, state: 'stopped' }
  const reply = { ...goal, conversationReplyId: '00000000-0000-0000-0000-000000000001' }
  const hello = binding => ({ projectId: 'p', leaseId: 'l', authorityEpoch: 1, bindings: [binding], cursor: 0 })
  assert.equal(wire.RuntimeHelloReply(hello(goal)), true)
  for (const create of [null, { state: 'current', commandId: '00000000-0000-0000-0000-000000000002', authorityEpoch: 1 },
    { state: 'unresolved', reason: 'different_runtime' }, { state: 'unresolved', reason: 'correlation_invalid' }]) {
    assert.equal(wire.RuntimeHelloReply(hello({ ...reply, create })), true)
  }
  for (const binding of [reply, { ...goal, create: null }, { ...reply, create: {} },
    { ...reply, create: { state: 'current', commandId: 'not-a-uuid', authorityEpoch: 1 } },
    { ...reply, create: { state: 'unresolved', reason: 'invented' } },
    { ...reply, create: null, actorId: 'forged' }]) {
    assert.equal(wire.RuntimeHelloReply(hello(binding)), false)
  }
})

const relayIdentity = { runtimeUnitId: 'unit', attemptId: 'attempt', nativeSessionId: 'sophia-attempt' }
const answer = (seq, text = 'private-answer', extra = {}) => ({ ...relayIdentity, nativeSeq: seq, durable: true, type: 'assistant/message', data: { text, length: [...text].length, oversize: false, invalidText: false, interrupted: false, provider: 'synthetic', model: 'model', inputTokens: 1, outputTokens: 2, ordinal: 1, ...extra } })
const obs = observation => ({ t: 'obs', observation })
const until = async predicate => { for (let n = 0; n < 200 && !predicate(); n++) await tick(); assert.ok(predicate(), 'bounded event-loop condition reached') }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
class ReplyPipe extends Duplex {
  written = []
  _read() {}
  _write(chunk, _encoding, done) { this.written.push(JSON.parse(chunk.toString())); done() }
  receive(value) { this.push(Buffer.from(JSON.stringify(value) + '\n')) }
}
async function relayFixture(t, overrides = {}) {
  const pipe = new ReplyPipe()
  t.after(() => pipe.destroy())
  const seen = [], fences = [], reserves = [], settles = []
  let ready = false
  const relay = new ReplyRelay(pipe, relayIdentity, {
    observe: async observation => { seen.push(observation) },
    reserve: async line => { reserves.push(line); return { allowed: true } },
    settle: async line => { settles.push(line); return 'settled' },
    status: s => { ready = s === 'ready' }, fenced: code => { fences.push(code) }, ...overrides,
  })
  pipe.receive({ t: 'status', s: 'ready' })
  await until(() => ready)
  await relay.go()
  return { pipe, relay, seen, fences, reserves, settles }
}
async function reserveFirst(pipe) {
  pipe.receive({ t: 'reserve', n: 1, tokens: 100, priceMicros: 0 })
  await until(() => pipe.written.some(x => x.t === 'reserved' && x.n === 1))
}

test('reply relay validates identity and closed projection before accepting even fenced content', () => {
  assert.deepEqual(parseReplyObservation(answer(1), relayIdentity), answer(1))
  for (const bad of [
    { ...answer(1), attemptId: 'other' }, { ...answer(1), nativeSessionId: 'sophia-other' },
    { ...answer(1), runtimeUnitId: 'other' }, { ...answer(1), durable: false },
    answer(1, 'private', { length: 1 }), answer(1, '\u0000'), answer(1, '\ud800'),
    answer(1, 'private', { ordinal: 3 }), answer(1, 'private', { injected: 'canary' }),
    { ...answer(1), type: 'system/message' }, { ...answer(1), data: { scrubbed: true, ordinal: 1, textLength: 2 } },
  ]) assert.throws(() => parseReplyObservation(bad, relayIdentity), { message: 'relay_invalid' })
})

test('reply relay rejects reserve before go and bounds a newline-free oversized line', async t => {
  const pipe = new ReplyPipe(); t.after(() => pipe.destroy())
  let reserveCalls = 0
  const fences = []
  const relay = new ReplyRelay(pipe, relayIdentity, { observe: async () => {}, reserve: async () => { reserveCalls++; return { allowed: true } }, settle: async () => 'settled', status: () => {}, fenced: code => fences.push(code) })
  pipe.receive({ t: 'reserve', n: 1, tokens: 1, priceMicros: 0 })
  await until(() => fences.length === 1)
  assert.equal(reserveCalls, 0); assert.equal(relay.state, 'fenced')
  const second = await relayFixture(t)
  second.pipe.push(Buffer.alloc(2 * 1024 * 1024, 32))
  await until(() => second.fences.length === 1)
  assert.equal(second.fences[0], 'relay_invalid')
  assert.equal(second.relay.inspect().lineBytes, 0)
  assert.equal(second.relay.inspect().items, 0)
  assert.ok(second.pipe.readableLength >= 1024 * 1024, 'reader stopped at the incremental bound')
})

test('reply relay retains at most64 queued items plus one held and holds reserve behind delivery', async t => {
  const release = deferred(); const delivered = []; let reserveCalls = 0
  const f = await relayFixture(t, { observe: async item => { await release.promise; delivered.push(item) }, reserve: async () => { reserveCalls++; return { allowed: true } } })
  await reserveFirst(f.pipe)
  for (let seq = 0; seq < 70; seq++) f.pipe.receive(obs(answer(seq)))
  f.pipe.receive({ t: 'reserve', n: 2, tokens: 100, priceMicros: 0 })
  await until(() => f.relay.inspect().held)
  assert.equal(f.relay.inspect().items, 64)
  assert.ok(f.relay.inspect().bytes <= 4 * 1024 * 1024)
  assert.equal(reserveCalls, 1)
  release.resolve()
  await until(() => reserveCalls === 2)
  assert.equal(delivered.length, 70)
  assert.deepEqual(delivered.map(x => x.nativeSeq), Array.from({ length: 70 }, (_, i) => i))
  assert.equal(f.relay.inspect().held, false)
})

test('reply relay respects the byte cap before the item cap with worst-case storable text', async t => {
  const release = deferred()
  const f = await relayFixture(t, { observe: async () => release.promise })
  await reserveFirst(f.pipe)
  for (let seq = 0; seq < 64; seq++) f.pipe.receive(obs(answer(seq, '\u0001'.repeat(16000))))
  await until(() => f.relay.inspect().held)
  assert.ok(f.relay.inspect().items < 64)
  assert.ok(f.relay.inspect().bytes <= 4 * 1024 * 1024)
  release.resolve()
  await until(() => f.relay.inspect().items === 0 && !f.relay.inspect().held)
})

test('reply fence aborts a live upload and all resends and tail deliveries contain usage without text', async t => {
  const sent = []; let started = false
  const f = await relayFixture(t, { observe: async (item, signal) => {
    sent.push(item)
    if (sent.length === 1) { started = true; await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic-abort')), { once: true })) }
  } })
  await reserveFirst(f.pipe)
  f.pipe.receive(obs(answer(1)))
  f.pipe.receive(obs(answer(2, 'queued-canary')))
  await until(() => started)
  f.relay.fence()
  f.pipe.receive(obs(answer(3, 'late-canary')))
  await until(() => sent.length === 4)
  for (const item of sent.slice(1)) {
    assert.deepEqual(Object.keys(item.data).sort(), ['inputTokens', 'model', 'ordinal', 'outputTokens', 'provider', 'scrubbed', 'textLength'].sort())
    assert.equal(item.data.scrubbed, true); assert.equal(item.data.ordinal, 1)
    assert.equal(JSON.stringify(item).includes('canary'), false)
  }
  assert.equal(sent[0].nativeSeq, sent[1].nativeSeq, 'lost live upload retries the same key')
})

test('reply normal completion reads the tail and waits for exit and API acknowledgement before closed', async t => {
  const release = deferred(); const sent = []
  const f = await relayFixture(t, { observe: async item => { sent.push(item); if (item.type === 'turn/end') await release.promise } })
  await reserveFirst(f.pipe)
  f.pipe.receive(obs(answer(1)))
  f.pipe.receive(obs({ ...relayIdentity, nativeSeq: 2, durable: true, type: 'turn/end', data: { reason: { kind: 'completed' } } }))
  f.pipe.push(null)
  await until(() => f.relay.inspect().eof)
  assert.equal(sent.length, 1, 'turn/end cannot publish before exit classification')
  assert.equal(f.relay.state, 'live')
  f.relay.exited(true)
  await until(() => sent.length === 2)
  assert.equal(f.relay.state, 'draining')
  assert.equal(sent[0].data.text, 'private-answer')
  release.resolve()
  await until(() => f.relay.state === 'closed')
  assert.equal(f.relay.inspect().pipeClosed, true)
  assert.equal(f.fences.length, 0)
})

test('reply EOF without complete turn fences queued content and never treats exit0 as completion', async t => {
  const release = deferred(); const sent = []
  const f = await relayFixture(t, { observe: async item => { await release.promise; sent.push(item) } })
  await reserveFirst(f.pipe)
  f.pipe.receive(obs(answer(1)))
  f.relay.exited(true)
  f.pipe.push(null)
  await until(() => f.relay.inspect().eof)
  assert.equal(f.relay.state, 'fenced')
  assert.deepEqual(f.fences, ['child_exited'])
  release.resolve()
  await until(() => f.relay.state === 'closed')
  // The already in-flight item is covered by server-side fencing; queued resends are reduced.
  assert.equal(sent.length, 1)
})

test('reply two settlements run concurrently and neither permits closed while its peer is pending', async t => {
  const one = deferred(), two = deferred(), calls = []
  const f = await relayFixture(t, { settle: async line => { calls.push(line.n); await (line.n === 1 ? one.promise : two.promise); return 'settled' } })
  await reserveFirst(f.pipe)
  f.pipe.receive({ t: 'reserve', n: 2, tokens: 100, priceMicros: 0 })
  await until(() => f.pipe.written.some(x => x.t === 'reserved' && x.n === 2))
  const settle = n => ({ t: 'settle', n, outcome: 'settled', used: { calls: 1, tokens: 3, priceMicros: 0 }, usage: { inputTokens: 1, outputTokens: 2 } })
  f.pipe.receive(settle(1)); f.pipe.receive(settle(2))
  f.relay.fence(); f.relay.exited(true); f.pipe.push(null)
  await until(() => calls.length === 2)
  one.resolve()
  await until(() => f.relay.inspect().pendingSettles === 1)
  assert.notEqual(f.relay.state, 'closed')
  two.resolve()
  await until(() => f.relay.state === 'closed')
})

test('a settlement after turn/end is answered before a child waiting for it closes its pipe', async t => {
  let settled = false
  const f = await relayFixture(t, { settle: async () => { settled = true; return 'settled' } })
  await reserveFirst(f.pipe)
  f.pipe.receive(obs(answer(1)))
  f.pipe.receive(obs({ ...relayIdentity, nativeSeq: 2, durable: true, type: 'turn/end', data: { reason: { kind: 'completed' } } }))
  f.pipe.receive({ t: 'settle', n: 1, outcome: 'settled', used: { calls: 1, tokens: 3, priceMicros: 0 }, usage: { inputTokens: 1, outputTokens: 2 } })
  await until(() => settled && f.pipe.written.some(x => x.t === 'settled'))
  assert.equal(f.seen.some(x => x.type === 'turn/end'), false, 'publication still waits for exit classification')
  f.relay.exited(true); f.pipe.push(null)
  await until(() => f.relay.state === 'closed')
})

test('API settlement success survives the child closing the response pipe while it was pending', async t => {
  const release = deferred(); let started = false
  const f = await relayFixture(t, { settle: async () => { started = true; await release.promise; return 'settled' } })
  await reserveFirst(f.pipe)
  f.pipe.receive({ t: 'settle', n: 1, outcome: 'settled', used: { calls: 1, tokens: 3, priceMicros: 0 }, usage: { inputTokens: 1, outputTokens: 2 } })
  await until(() => started)
  f.relay.fence(); f.relay.exited(true); f.pipe.push(null); f.pipe.end()
  await until(() => f.relay.inspect().eof && f.pipe.writableEnded)
  release.resolve()
  await until(() => f.relay.state === 'closed')
  assert.equal(f.relay.inspect().settleFailed, false)
})

const recoveryScope = { identity: relayIdentity, createEpoch: 3,
  control: { attemptId: 'attempt', nonce: 'abcdef', route: { provider: 'synthetic', model: 'model', reasoningEffort: null }, maxTokens: 100 } }
const recoveryStart = { t: 'start', attemptId: 'attempt', sessionId: 'sophia-attempt', epoch: 3,
  nonce: 'abcdef', route: recoveryScope.control.route, maxTokens: 100, prompt: 'private synthetic prompt' }
const journalBytes = frames => Buffer.from(frames.map(frame => JSON.stringify(frame) + '\n').join(''))
const readyRecord = { t: 'status', s: 'ready' }
const reserveRecord = { t: 'reserve', n: 1, tokens: 100, priceMicros: 0 }
const settleRecord = { t: 'settle', n: 1, outcome: 'settled', used: { calls: 1, tokens: 3, priceMicros: 0 }, usage: { inputTokens: 1, outputTokens: 2 } }
const recoveryFrames = [recoveryStart, readyRecord, reserveRecord, { t: 'reserved', n: 1 },
  settleRecord, { t: 'settled', n: 1 }, obs(answer(3)), obs({ ...relayIdentity, nativeSeq: 4, durable: true, type: 'turn/end', data: { reason: { kind: 'completed' } } })]

test('recovery reads bounded split journal records and emits only reduced projections', () => {
  for (const width of [1, 7, 4096]) {
    const seen = [], reader = new ReplyRecoveryReader(recoveryScope, value => seen.push(value))
    const bytes = journalBytes(recoveryFrames)
    for (let i = 0; i < bytes.length; i += width) reader.feed(bytes.subarray(i, i + width))
    const result = reader.end()
    assert.equal(result.hasTurnEnd, true)
    assert.equal(result.calls.length, 1)
    assert.deepEqual(result.calls[0], { reserve: reserveRecord, admission: 'reserved', settlement: settleRecord, acknowledgement: 'settled' })
    assert.equal(seen.length, 2)
    assert.equal(seen[0].nativeSeq, 3)
    assert.equal(seen[0].data.scrubbed, true)
    assert.equal(seen[0].data.textLength, 14)
    assert.doesNotMatch(JSON.stringify({ result, seen }), /private|prompt|nonce|abcdef/)
    assert.throws(() => reader.feed(Buffer.from('\n')), /reply_recovery_invalid/)
  }
})

test('recovery binds original create identity, scope and epoch and rejects untrusted start metadata', () => {
  for (const patch of [{ epoch: 4 }, { epoch: 0 }, { nonce: 'fedcba' }, { attemptId: 'foreign' },
    { sessionId: 'foreign' }, { maxTokens: 101 }, { route: { ...recoveryStart.route, model: 'other' } },
    { prompt: '' }, { hidden: true }]) {
    const reader = new ReplyRecoveryReader(recoveryScope, () => assert.fail('no observation'))
    assert.throws(() => reader.feed(journalBytes([{ ...recoveryStart, ...patch }])), /reply_recovery_invalid/)
    assert.throws(() => reader.end(), /reply_recovery_invalid/)
  }
  assert.throws(() => new ReplyRecoveryReader({ ...recoveryScope, identity: { ...relayIdentity, attemptId: 'wrong' } }, () => {}), /reply_recovery_invalid/)
})

test('recovery leaves crash prefixes pending and never manufactures accounting acknowledgements', () => {
  for (const [tail, admission, acknowledgement] of [
    [[], 'pending', 'pending'], [[{ t: 'reserved', n: 1 }], 'reserved', 'pending'],
    [[{ t: 'refused', n: 1, code: 'no_grant' }], 'refused', 'pending'],
    [[{ t: 'reserved', n: 1 }, { t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null }], 'reserved', 'pending'],
    [[{ t: 'reserved', n: 1 }, settleRecord, { t: 'settle_unknown', n: 1 }], 'reserved', 'settle_unknown'],
  ]) {
    const reader = new ReplyRecoveryReader(recoveryScope, () => {})
    reader.feed(journalBytes([recoveryStart, readyRecord, reserveRecord, ...tail]))
    const result = reader.end()
    assert.equal(result.hasTurnEnd, false)
    assert.equal(result.calls[0].admission, admission)
    assert.equal(result.calls[0].acknowledgement, acknowledgement)
  }
})

test('recovery rejects contradictory or out-of-order accounting and foreign observations', () => {
  const prefix = [recoveryStart, readyRecord, reserveRecord, { t: 'reserved', n: 1 }]
  const cases = [
    [recoveryStart, obs(answer(1))], [recoveryStart, readyRecord, obs(answer(1))],
    [...prefix, { t: 'reserved', n: 1 }], [...prefix, { ...reserveRecord, n: 2 }],
    [...prefix, { t: 'settled', n: 1 }], [...prefix, settleRecord, settleRecord],
    [...prefix, { t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null }, { t: 'settled', n: 1 }],
    [...prefix, { ...settleRecord, n: 2 }], [...prefix, { ...settleRecord, used: { calls: 1, tokens: 4, priceMicros: 0 } }],
    [...prefix, obs({ ...answer(1), attemptId: 'other' })], [...prefix, obs(answer(1)), obs(answer(1))],
    [...prefix, readyRecord], [...prefix, { t: 'go' }], [...prefix, { t: 'reserved', n: 1, extra: true }],
  ]
  for (const frames of cases) {
    const reader = new ReplyRecoveryReader(recoveryScope, () => {})
    assert.throws(() => reader.feed(journalBytes(frames)), /reply_recovery_invalid/)
    assert.throws(() => reader.end(), /reply_recovery_invalid/)
  }
})

test('recovery accepts two settled sequential calls, rejects a third, preserves late usage', () => {
  const frames = [...recoveryFrames.slice(0, 6), { ...reserveRecord, n: 2 }, { t: 'reserved', n: 2 },
    { ...settleRecord, n: 2 }, { t: 'settled', n: 2 }, recoveryFrames[7], obs(answer(5, 'late', { ordinal: 2 }))]
  const seen = [], reader = new ReplyRecoveryReader(recoveryScope, value => seen.push(value))
  reader.feed(journalBytes(frames))
  assert.equal(reader.end().calls.length, 2)
  assert.equal(seen.at(-1).data.ordinal, 2)
  const invalidReader = new ReplyRecoveryReader(recoveryScope, () => {})
  assert.throws(() => invalidReader.feed(journalBytes([...frames, { ...reserveRecord, n: 3 }])), /reply_recovery_invalid/)
})

test('recovery fails closed on empty/torn/invalid UTF8/oversized journals and observer failure', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('{'), Buffer.from([0xff, 10]),
    Buffer.alloc(2 * 1024 * 1024, 32), Buffer.concat([journalBytes([recoveryStart]), Buffer.alloc(1024 * 1024, 32)]),
    Buffer.concat([journalBytes(recoveryFrames), Buffer.from('{')])]) {
    const reader = new ReplyRecoveryReader(recoveryScope, () => {})
    assert.throws(() => { reader.feed(bytes); reader.end() }, /reply_recovery_invalid/)
    assert.throws(() => reader.end(), /reply_recovery_invalid/)
  }
  const reader = new ReplyRecoveryReader(recoveryScope, () => { throw new Error('private consumer detail') })
  assert.throws(() => reader.feed(journalBytes(recoveryFrames)), /^Error: reply_recovery_invalid$/)
})

const recoveryBinding = { attemptId: 'attempt', commandId: '00000000-0000-0000-0000-000000000001', authorityEpoch: 3, leaseId: '00000000-0000-0000-0000-000000000002' }
// The API requires UUID attempt IDs; the reader separately supports the native identifier grammar.
const apiAttempt = '00000000-0000-0000-0000-000000000006'
const apiIdentity = { ...relayIdentity, attemptId: apiAttempt, nativeSessionId: `sophia-${apiAttempt}` }

async function deliverySettled(promise) {
  const sentinel = Symbol('unsettled')
  const value = await Promise.race([promise, tick().then(() => sentinel)])
  assert.notEqual(value, sentinel, 'bounded delivery must settle before the sentinel')
  return value
}

function deliveryFixture(unit = 'calls_tokens') {
  const clock = stopClock(), bodies = [], observations = []
  const create = { ...command({ ...replyBinding, attemptId: apiAttempt, runtimeUnitId: 'unit' }), commandId: recoveryBinding.commandId }
  create.payload.conversation.unit = unit
  const policy = { deadlineAt: 100, requestWaitMs: 20, retryWaitMs: 2, maxAttempts: 3 }
  const receipt = body => ({ replyId: replyBinding.conversationReplyId, ordinal: body.ordinal, state: 'reserved',
    lineageId: '00000000-0000-0000-0000-000000000004', grantRevision: 1, unit: body.call.unit,
    amount: { calls: 1, tokens: body.call.tokens, priceMicros: body.call.priceMicros }, used: null })
  const operations = {
    observations: async values => { observations.push(...structuredClone(values)) },
    conversationReserve: async body => { bodies.push(structuredClone(body)); return receipt(body) },
  }
  const delivery = new ReplyDelivery(create, recoveryBinding.leaseId, policy, operations, clock)
  return { create, policy, operations, clock, receipt, delivery, bodies, observations }
}

test('parent delivery snapshots trusted create refs and original unit, rejecting caller identity and foreign observations', async () => {
  for (const unit of ['calls_tokens', 'usd']) {
    const f = deliveryFixture(unit)
    f.create.payload.conversation.credentialRef = 'changed-later'
    f.create.payload.conversation.unit = unit === 'usd' ? 'calls_tokens' : 'usd'
    f.create.binding.authorityEpoch = 99
    const line = { t: 'reserve', n: 1, tokens: 10, priceMicros: 7 }
    const signal = new AbortController().signal
    assert.deepEqual(await f.delivery.reserve(line, signal), { allowed: true })
    assert.deepEqual(f.bodies[0], { attemptId: apiAttempt, commandId: recoveryBinding.commandId,
      authorityEpoch: 1, leaseId: recoveryBinding.leaseId, ordinal: 1,
      call: { routeId: 'route-test', credentialRef: 'synthetic-credential-ref', ownerResourceRef: 'synthetic-owner-resource-ref', unit,
        tokens: unit === 'calls_tokens' ? 10 : 0, priceMicros: unit === 'usd' ? 7 : 0 } })
    assert.throws(() => f.delivery.reserve({ ...line, credentialRef: 'forged' }, signal), /relay_invalid/)
    assert.throws(() => f.delivery.reserve({ ...line, n: 3 }, signal), /reply_delivery_invalid/)
    await assert.rejects(f.delivery.observe(answer(1), signal), /relay_invalid/)
    assert.equal(f.observations.length, 0)
    assert.equal(f.clock.pending(), 0)
  }
})

test('parent delivery joins duplicate reserves and retries one immutable body after a lost answer', async () => {
  const f = deliveryFixture(), signal = new AbortController().signal, line = { t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }
  let calls = 0
  f.operations.conversationReserve = async body => {
    f.bodies.push(structuredClone(body))
    if (++calls === 1) throw new Error('synthetic lost response after commit')
    return f.receipt(body)
  }
  const first = f.delivery.reserve(line, signal)
  assert.equal(f.delivery.reserve({ ...line }, signal), first)
  assert.throws(() => f.delivery.reserve({ ...line, tokens: 11 }, signal), /reply_delivery_conflict/)
  await tick(); f.clock.advance(2); await tick()
  assert.deepEqual(await deliverySettled(first), { allowed: true })
  assert.equal(calls, 2)
  assert.deepEqual(f.bodies[0], f.bodies[1])
  assert.equal(f.delivery.reserve(line, signal), first)
  assert.equal(f.clock.pending(), 0)
})

test('parent delivery cached permission cannot authorize after a deadline or caller abort', async () => {
  const f = deliveryFixture(), line = { t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }
  assert.equal((await f.delivery.reserve(line, new AbortController().signal)).allowed, true)
  const cancelled = new AbortController(); cancelled.abort()
  assert.equal((await f.delivery.reserve(line, cancelled.signal)).allowed, false)
  f.clock.advance(100)
  assert.equal((await f.delivery.reserve(line, new AbortController().signal)).allowed, false)
  assert.equal(f.bodies.length, 1)
})

test('parent delivery rejects wrong, settled or enlarged reservation receipts without retrying them', async () => {
  for (const mutate of [r => { r.replyId = apiAttempt }, r => { r.ordinal = 2 }, r => { r.unit = 'usd' },
    r => { r.state = 'settled'; r.used = { calls: 1, tokens: 1, priceMicros: 0 } },
    r => { r.amount.calls = 2 }, r => { r.amount.tokens++ }, r => { r.extra = true }]) {
    const f = deliveryFixture(); let calls = 0
    f.operations.conversationReserve = async body => { calls++; const receipt = f.receipt(body); mutate(receipt); return receipt }
    assert.equal((await f.delivery.reserve({ t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }, new AbortController().signal)).allowed, false)
    assert.equal(calls, 1)
    assert.equal(f.clock.pending(), 0)
  }
})

test('parent delivery times out ignored aborts and preserves the original deadline and cached uncertainty', async () => {
  const f = deliveryFixture(), controller = new AbortController(), signals = []
  f.operations.conversationReserve = async (_body, signal) => { signals.push(signal); return new Promise(() => {}) }
  const line = { t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }
  const first = f.delivery.reserve(line, controller.signal)
  for (let i = 0; i < 3; i++) { await tick(); f.clock.advance(20); await tick(); f.clock.advance(2) }
  assert.equal((await deliverySettled(first)).allowed, false)
  assert.equal(signals.length, 3)
  assert.ok(signals.every(s => s.aborted))
  f.clock.advance(100)
  assert.equal((await f.delivery.reserve(line, new AbortController().signal)).allowed, false)
  assert.equal((await f.delivery.reserve({ ...line, n: 2 }, new AbortController().signal)).allowed, false)
  assert.equal(signals.length, 3)
  assert.equal(f.clock.pending(), 0)
})

test('parent delivery aborts a pending reserve and never accepts its late response', async () => {
  const f = deliveryFixture(), controller = new AbortController(); let release, seen
  f.operations.conversationReserve = async body => { seen = body; return new Promise(resolve => { release = resolve }) }
  const result = f.delivery.reserve({ t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }, controller.signal)
  await tick(); controller.abort(); await tick(); release(f.receipt(seen))
  assert.equal((await deliverySettled(result)).allowed, false)
  assert.equal(f.clock.pending(), 0)
})

test('parent delivery accepts only closed reduced accounting while the child parser remains full-only', async () => {
  const f = deliveryFixture(), signal = new AbortController().signal
  const values = [answer(1), { ...relayIdentity, nativeSeq: 2, durable: true, type: 'compaction/summary', data: { compactionId: 'c', provider: null, model: null, inputTokens: null, outputTokens: 2, ordinal: 1 } },
    { ...relayIdentity, nativeSeq: 3, durable: true, type: 'user/message', data: { id: 'u', length: 9 } },
    { ...relayIdentity, nativeSeq: 4, durable: true, type: 'turn/start', data: {} },
    { ...relayIdentity, nativeSeq: 5, durable: true, type: 'turn/end', data: { reason: { kind: 'completed' } } }]
  for (const value of values) {
    const reduced = reduceReplyObservation({ ...value, ...apiIdentity })
    assert.throws(() => parseReplyObservation(reduced, apiIdentity), /relay_invalid/)
    await f.delivery.observe(reduced, signal)
  }
  assert.equal(f.observations.length, 5)
  const good = reduceReplyObservation({ ...answer(6), ...apiIdentity })
  for (const data of [{ ...good.data, text: 'must not return' }, { ...good.data, scrubbed: false },
    { ...good.data, compactionId: 'hidden' }, { ...good.data, ordinal: 3 }, { ...good.data, textLength: null },
    { ...good.data, inputTokens: -1 }, { ...good.data, model: 'x'.repeat(201) }]) {
    await assert.rejects(f.delivery.observe({ ...good, data }, signal), /relay_invalid/)
  }
  assert.equal(f.observations.length, 5)
})

test('parent delivery duplicate caller abort cannot inherit another caller permission', async () => {
  const f = deliveryFixture(), controller = new AbortController(), line = { t: 'reserve', n: 1, tokens: 10, priceMicros: 0 }
  let release, seen
  f.operations.conversationReserve = async body => { seen = body; return new Promise(resolve => { release = resolve }) }
  const first = f.delivery.reserve(line, new AbortController().signal)
  const second = f.delivery.reserve(line, controller.signal)
  await tick(); controller.abort(); release(f.receipt(seen))
  assert.equal((await deliverySettled(first)).allowed, true)
  assert.equal((await deliverySettled(second)).allowed, false)
  assert.equal(f.clock.pending(), 0)
})

test('parent delivery bounds observation retries and refuses permanent API denial', async () => {
  const f = deliveryFixture(), signal = new AbortController().signal
  let calls = 0
  f.operations.observations = async values => { f.observations.push(...structuredClone(values)); if (++calls < 2) throw new Error('lost') }
  const value = { ...answer(1), ...apiIdentity }
  const pending = f.delivery.observe(value, signal)
  value.data.text = 'later mutation'
  await tick(); f.clock.advance(2); await deliverySettled(pending)
  assert.equal(calls, 2)
  assert.deepEqual(f.observations[0], f.observations[1])
  assert.equal(f.observations[0].data.text, 'private-answer')
  f.operations.observations = async () => { calls++; throw new TransportError('synthetic denied', 403, 'forbidden') }
  await assert.rejects(f.delivery.observe({ ...answer(2), ...apiIdentity }, signal), /reply_delivery_refused/)
  assert.equal(calls, 3)
  assert.equal(f.clock.pending(), 0)
})
const apiScope = { ...recoveryScope, identity: apiIdentity, control: { ...recoveryScope.control, attemptId: apiAttempt } }
const apiFrames = frames => frames.map(frame => frame.t === 'start' ? { ...frame, attemptId: apiAttempt, sessionId: apiIdentity.nativeSessionId } :
  frame.t === 'obs' ? { ...frame, observation: { ...frame.observation, ...apiIdentity } } : frame)
const recoveryOptions = { scope: apiScope, binding: { ...recoveryBinding, attemptId: apiAttempt }, replyId: '00000000-0000-0000-0000-000000000003', unit: 'calls_tokens', timeoutMs: 1000, maxObservations: 64 }
function recoveryFixture(frames = recoveryFrames, extra = {}) {
  const bytes = journalBytes(apiFrames(frames)), observations = new Set(), usage = new Set(), seen = [], settlements = [], acks = []
  let offset = 0, states = (extra.states ?? [{ ordinal: 1, state: 'settled' }]).map(row => ({
    unit: extra.unit ?? 'calls_tokens', used: row.state === 'settled' ? { calls: 1, tokens: 10, priceMicros: 0 } : null, ...row }))
  const answer = request => {
    acks.push(structuredClone(request))
    const keys = request.keys
    return { predicates: {
      observations: { met: keys.observations.every(key => observations.has(key)), keys: [...keys.observations] },
      usage: { met: keys.usage.every(key => usage.has(key.providerCallId)), keys: [...keys.usage] },
      reservations: { met: states.every(row => row.state === 'settled' || row.state === 'released' || (row.state === 'uncertain' && usage.size > 0)), states: structuredClone(states) },
      terminalState: { met: true, replyId: recoveryOptions.replyId, state: 'outcome_unknown' },
      terminalWriter: { met: true, key: { kind: 'hello', attemptId: apiAttempt, leaseId: recoveryOptions.binding.leaseId, leaseEpoch: 4 } },
      createAnswered: { met: true, commandId: recoveryBinding.commandId, stage: 'outcome_unknown' },
      capture: { met: true, outcome: 'none', key: null },
      payloadScrubbed: { met: true, commandId: recoveryBinding.commandId },
    } }
  }
  const operations = {
    read: async () => { if (offset === bytes.length) return null; const part = bytes.subarray(offset, offset + 67); offset += part.length; return part },
    acknowledged: async request => answer(request),
    observe: async observation => {
      seen.push(observation)
      observations.add(`${observation.runtimeUnitId}:${observation.nativeSessionId}:${observation.nativeSeq}`)
      if (observation.data.ordinal) usage.add(`${observation.nativeSessionId}#${observation.nativeSeq}`)
    },
    settle: async request => {
      settlements.push(request)
      states = states.map(row => row.ordinal === request.ordinal ? { ...row, state: 'settled', used: request.used } : row)
      return { replyId: recoveryOptions.replyId, ordinal: request.ordinal, state: 'settled', lineageId: '00000000-0000-0000-0000-000000000004', grantRevision: 1,
        unit: extra.unit ?? 'calls_tokens', amount: { calls: 1, tokens: 100, priceMicros: 0 }, used: request.used }
    },
  }
  return { operations, seen, settlements, acks, observations, usage, answer, bytes }
}

test('parent recovery uses explicit ACK verdicts and all keys together, never the echoed keys as proof', async () => {
  const fixture = recoveryFixture(recoveryFrames, { states: [{ ordinal: 1, state: 'uncertain' }] })
  const result = await recoverReplyJournal(recoveryOptions, fixture.operations)
  assert.equal(result.journalComplete, true)
  assert.equal(result.databaseBarrier, true)
  assert.equal(fixture.seen.length, 2, 'echoed missing keys still cause reduced delivery')
  assert.equal(fixture.settlements.length, 0, 'uncertain accounting never replays settlement')
  assert.ok(fixture.seen.every(value => value.data.scrubbed === true))
  assert.doesNotMatch(JSON.stringify(fixture.seen), /private-answer|prompt/)
  assert.equal(fixture.acks.at(-1).keys.observations.length, 2)
  assert.equal(fixture.acks.at(-1).keys.usage.length, 1)
  assert.deepEqual(fixture.acks.at(-1).keys.ordinals, [1])
})

test('parent recovery compares usage-key fields independently of JSON object property order', async () => {
  const frames = [...recoveryFrames.slice(0, -1), obs(answer(4)),
    obs({ ...relayIdentity, nativeSeq: 5, durable: true, type: 'turn/end', data: { reason: { kind: 'completed' } } })]
  const f = recoveryFixture(frames, { states: [{ ordinal: 1, state: 'uncertain' }] })
  f.operations.acknowledged = async request => {
    const result = f.answer(request)
    result.predicates.usage.keys = request.keys.usage.map(key => ({ ordinal: key.ordinal, providerCallId: key.providerCallId }))
    return result
  }
  assert.equal((await recoverReplyJournal(recoveryOptions, f.operations)).databaseBarrier, true)
  for (const change of [keys => keys.slice(1), keys => [...keys, keys[0]],
    keys => keys.map(key => ({ ...key, ordinal: 2 })),
    keys => keys.map(key => ({ ...key, providerCallId: `${key.providerCallId}-other` })), keys => [...keys].reverse()]) {
    const g = recoveryFixture(frames, { states: [{ ordinal: 1, state: 'uncertain' }] })
    g.operations.acknowledged = async request => {
      const result = g.answer(request)
      if (request.keys.usage.length === 2) result.predicates.usage.keys = change(result.predicates.usage.keys)
      return result
    }
    await assert.rejects(recoverReplyJournal(recoveryOptions, g.operations), /reply_recovery_ack_invalid/)
  }
})

test('parent recovery skips already durable observations and retains every failed final predicate', async () => {
  const fixture = recoveryFixture(recoveryFrames, { states: [{ ordinal: 1, state: 'uncertain' }] })
  fixture.observations.add(`unit:${apiIdentity.nativeSessionId}:3`)
  fixture.observations.add(`unit:${apiIdentity.nativeSessionId}:4`)
  fixture.usage.add(`${apiIdentity.nativeSessionId}#3`)
  assert.equal((await recoverReplyJournal(recoveryOptions, fixture.operations)).databaseBarrier, true)
  assert.equal(fixture.seen.length, 0)
  for (const name of ['observations', 'usage', 'reservations', 'terminalWriter', 'createAnswered', 'capture', 'payloadScrubbed']) {
    const f = recoveryFixture(recoveryFrames, { states: [{ ordinal: 1, state: 'uncertain' }] })
    f.operations.acknowledged = async request => { const answer = f.answer(request); answer.predicates[name].met = false; return answer }
    assert.equal((await recoverReplyJournal(recoveryOptions, f.operations)).databaseBarrier, false, name)
  }
})

test('parent recovery settles only a terminal still-reserved known outcome after complete EOF, with original unit', async () => {
  const frames = recoveryFrames.filter(frame => frame.t !== 'settled')
  for (const unit of ['calls_tokens', 'usd']) {
    const f = recoveryFixture(frames.map(frame => frame.t === 'settle' ? { ...frame, used: { ...frame.used, priceMicros: 7 } } : frame), { states: [{ ordinal: 1, state: 'reserved' }], unit })
    let eof = false
    const read = f.operations.read, settle = f.operations.settle
    f.operations.read = async signal => { const bytes = await read(signal); eof ||= bytes === null; return bytes }
    f.operations.settle = async (request, signal) => { assert.equal(eof, true); return settle(request, signal) }
    assert.equal((await recoverReplyJournal({ ...recoveryOptions, unit }, f.operations)).databaseBarrier, true)
    assert.equal(f.settlements.length, 1)
    assert.deepEqual(f.settlements[0], { ...recoveryOptions.binding, ordinal: 1,
      used: { calls: 1, tokens: unit === 'calls_tokens' ? 3 : 0, priceMicros: unit === 'usd' ? 7 : 0 } })
  }
})

test('parent recovery never settles uncertain or unproven settled amounts and retains missing usage', async () => {
  const frames = recoveryFrames.filter(frame => frame.t !== 'settled')
  for (const state of ['uncertain', 'settled', 'released']) {
    const f = recoveryFixture(frames, { states: [{ ordinal: 1, state }] })
    const result = await recoverReplyJournal(recoveryOptions, f.operations)
    assert.equal(f.settlements.length, 0)
    assert.equal(result.databaseBarrier, state === 'uncertain')
    assert.equal(result.accountingVerified, state === 'uncertain')
  }
  const f = recoveryFixture(frames.filter(frame => frame.t !== 'obs'), { states: [{ ordinal: 1, state: 'uncertain' }] })
  assert.equal((await recoverReplyJournal(recoveryOptions, f.operations)).databaseBarrier, false)
  assert.equal(f.settlements.length, 0)
})

test('parent recovery proves existing settled amounts with original unit and never settles them again', async () => {
  for (const unit of ['calls_tokens', 'usd']) {
    const frames = recoveryFrames.map(frame => frame.t === 'settle' ? { ...frame, used: { ...frame.used, priceMicros: 7 } } : frame)
    const used = { calls: 1, tokens: unit === 'calls_tokens' ? 3 : 0, priceMicros: unit === 'usd' ? 7 : 0 }
    const f = recoveryFixture(frames, { unit, states: [{ ordinal: 1, state: 'settled', used }] })
    const result = await recoverReplyJournal({ ...recoveryOptions, unit }, f.operations)
    assert.equal(result.accountingVerified, true)
    assert.equal(result.databaseBarrier, true)
    assert.equal(f.settlements.length, 0)
    for (const field of ['tokens', 'priceMicros']) {
      const g = recoveryFixture(frames, { unit, states: [{ ordinal: 1, state: 'settled', used: { ...used, [field]: used[field] + 1 } }] })
      assert.equal((await recoverReplyJournal({ ...recoveryOptions, unit }, g.operations)).databaseBarrier, false)
      assert.equal(g.settlements.length, 0)
    }
  }
})

test('parent recovery rechecks settled amounts at the final barrier and rejects missing amount evidence', async () => {
  for (const initial of ['reserved', 'settled']) {
    const f = recoveryFixture(recoveryFrames, { states: [{ ordinal: 1, state: initial, used: initial === 'settled' ? { calls: 1, tokens: 3, priceMicros: 0 } : null }] })
    let full = 0
    f.operations.acknowledged = async request => {
      const result = f.answer(request)
      if (request.keys.ordinals.length && ++full === 2) result.predicates.reservations.states[0].used.tokens = 4
      return result
    }
    assert.equal((await recoverReplyJournal(recoveryOptions, f.operations)).databaseBarrier, false)
  }
  const missing = recoveryFixture()
  missing.operations.acknowledged = async request => {
    const result = missing.answer(request)
    delete result.predicates.reservations.states[0].used
    return result
  }
  await assert.rejects(recoverReplyJournal(recoveryOptions, missing.operations), /reply_recovery_ack_invalid/)
  assert.equal(missing.settlements.length, 0)
})

test('parent recovery handles never-admitted crash prefix without inventing a reservation', async () => {
  const f = recoveryFixture([recoveryStart, readyRecord, reserveRecord], { states: [] })
  const result = await recoverReplyJournal(recoveryOptions, f.operations)
  assert.equal(result.databaseBarrier, true)
  assert.deepEqual(f.acks.at(-1).keys.ordinals, [])
  assert.equal(f.settlements.length, 0)
  const hidden = recoveryFixture(recoveryFrames, { states: [{ ordinal: 1, state: 'settled' }, { ordinal: 2, state: 'settled' }] })
  assert.equal((await recoverReplyJournal(recoveryOptions, hidden.operations)).databaseBarrier, false)
})

test('parent recovery rejects wrong ACK identity, running request and malformed settlement receipts', async () => {
  for (const mutate of [
    p => { p.terminalState.replyId = '00000000-0000-0000-0000-000000000099' },
    p => { p.createAnswered.commandId = '00000000-0000-0000-0000-000000000099' },
    p => { p.payloadScrubbed.commandId = '00000000-0000-0000-0000-000000000099' },
    p => { p.observations.keys = ['wrong'] }, p => { p.terminalState.state = 'running' },
    p => { p.reservations.states.push({ ordinal: 1, state: 'settled' }) },
  ]) {
    const f = recoveryFixture()
    f.operations.acknowledged = async request => { const a = f.answer(request); mutate(a.predicates); return a }
    await assert.rejects(recoverReplyJournal(recoveryOptions, f.operations), /reply_recovery_(ack_invalid|not_terminal)/)
    assert.equal(f.seen.length + f.settlements.length, 0)
  }
  const f = recoveryFixture(recoveryFrames.filter(frame => frame.t !== 'settled'), { states: [{ ordinal: 1, state: 'reserved' }] })
  const settle = f.operations.settle
  f.operations.settle = async (body, signal) => ({ ...await settle(body, signal), used: { ...body.used, tokens: 4 } })
  await assert.rejects(recoverReplyJournal(recoveryOptions, f.operations), /reply_recovery_settle_unconfirmed/)
})

test('parent recovery never settles torn journal and enforces key/read/overall deadline bounds', async () => {
  const f = recoveryFixture(recoveryFrames.filter(frame => frame.t !== 'settled'), { states: [{ ordinal: 1, state: 'reserved' }] })
  let read = false
  f.operations.read = async () => { if (read) return null; read = true; return Buffer.concat([f.bytes, Buffer.from('{')]) }
  await assert.rejects(recoverReplyJournal(recoveryOptions, f.operations), /reply_recovery_invalid/)
  assert.equal(f.settlements.length, 0)
  await assert.rejects(recoverReplyJournal({ ...recoveryOptions, maxObservations: 1 }, recoveryFixture().operations), /reply_recovery_bound/)
  for (const bytes of [new Uint8Array(0), new Uint8Array(65_537)]) {
    const fixture = recoveryFixture(); fixture.operations.read = async () => bytes
    await assert.rejects(recoverReplyJournal(recoveryOptions, fixture.operations), /reply_recovery_invalid/)
  }
  const held = recoveryFixture()
  let observedSignal
  held.operations.read = signal => { observedSignal = signal; return new Promise(() => {}) }
  const result = await Promise.race([recoverReplyJournal({ ...recoveryOptions, timeoutMs: 20 }, held.operations).then(() => 'unexpected', e => e.message),
    new Promise(resolve => { const timer = setTimeout(() => resolve('sentinel'), 1000); timer.unref() })])
  assert.equal(result, 'reply_recovery_unconfirmed')
  assert.equal(observedSignal.aborted, true)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(recoverReplyJournal({ ...recoveryOptions, signal: controller.signal }, recoveryFixture().operations), /reply_recovery_unconfirmed/)
})

test('parent recovery rejects mismatched stored amounts even with a journaled settled answer', async () => {
  const f = recoveryFixture()
  const result = await recoverReplyJournal(recoveryOptions, f.operations)
  assert.equal(result.accountingVerified, false)
  assert.equal(result.databaseBarrier, false)
  assert.equal(f.settlements.length, 0, 'no effectful query of already settled amounts')
})

function stopClock() {
  let time = 0
  const tasks = new Set()
  return {
    now: () => time,
    after(ms, callback) { const task = { at: time + ms, callback }; tasks.add(task); return () => tasks.delete(task) },
    advance(ms) {
      const until = time + ms
      for (;;) { const task = [...tasks].filter(t => t.at <= until).sort((a,b) => a.at-b.at)[0]; if (!task) break; time = task.at; tasks.delete(task); task.callback() }
      time = until
    },
    pending: () => tasks.size,
  }
}
const stopBounds = { deadlineMs: 100, graceMs: 2, killMs: 5, exitWaitMs: 7, settleWaitMs: 11 }
function stopFixture(t, override = {}) {
  const clock = stopClock(), launcher = new ChildProcess(), lines = [], stops = [], exits = []
  Object.defineProperty(launcher, 'kill', { value: () => assert.fail('numeric process signal forbidden') })
  const control = new Writable({ write(chunk, _encoding, done) { lines.push({ at: clock.now(), value: chunk.toString() }); done() } })
  launcher.stdin = control
  const relay = { stop: async () => { stops.push(clock.now()) }, exited: (clean) => exits.push(clean), ...override }
  const child = new ReplyChildStop(launcher, relay, { nonce: 'abcdef', startedAt: 0 }, stopBounds, clock)
  t.after(() => { child.dispose(); control.destroy() })
  return { clock, launcher, child, lines, stops, exits, control }
}

test('reply Stop has one t0 and absolute TERM/KILL/cutoff despite an indefinitely blocked fd3 write', async t => {
  const f = stopFixture(t, { stop: () => new Promise(() => {}) })
  f.clock.advance(1)
  const first = f.child.stop()
  assert.equal(f.child.stop(), first)
  f.clock.advance(2)
  assert.deepEqual(f.lines, [{ at: 3, value: 'TERM\n' }])
  f.clock.advance(3)
  assert.deepEqual(f.lines.at(-1), { at: 6, value: 'KILL\n' })
  f.clock.advance(7)
  const result = await first
  assert.equal(result.settledExit, false)
  assert.equal(result.stopStartedAt, 1)
  assert.equal(result.settlementDeadline, 24)
  assert.equal(f.clock.pending(), 0)
  f.clock.advance(50)
  const replay = await f.child.stop()
  assert.deepEqual(replay, result)
  assert.equal(f.lines.length, 2)
})

test('reply launcher exit classes are scoped evidence; close, home_exists, unsettled and signals are not proof', async t => {
  for (const [code, signal, settled] of [[0,null,true],[69,null,true],[72,null,true],[73,null,true],[75,null,true],[76,null,true],[77,null,true],
    [70,null,false],[71,null,false],[74,null,false],[78,null,false],[null,'SIGKILL',false]]) {
    const f = stopFixture(t)
    const stopped = f.child.stop()
    f.launcher.emit('close', code, signal)
    assert.equal(f.child.inspect().exit, null, 'close is not the exit event')
    f.clock.advance(1)
    f.launcher.emit('exit', code, signal)
    const result = await stopped
    assert.equal(result.settledExit, settled, `${code}/${signal}`)
    assert.equal(result.nonce, 'abcdef')
    assert.equal(result.settlementDeadline, 12)
    assert.deepEqual(f.exits, [code === 0 && signal === null])
    assert.equal(f.clock.pending(), 0)
  }
})

test('reply late exit improves a replay but never resets the original settlement deadline', async t => {
  const f = stopFixture(t)
  const first = f.child.stop()
  f.clock.advance(12)
  assert.equal((await first).settledExit, false)
  f.clock.advance(50)
  f.launcher.emit('exit', 0, null)
  const later = await f.child.stop()
  assert.equal(later.settledExit, true)
  assert.equal(later.stopStartedAt, 0)
  assert.equal(later.settlementDeadline, 23)
  assert.equal(later.exit.observedAt, 62)
  assert.equal(f.stops.length, 1)
})

test('reply runtime deadline starts at spawn and post-exit Stop fences the unread relay tail', async t => {
  const f = stopFixture(t)
  f.clock.advance(100)
  assert.deepEqual(f.stops, [100])
  f.clock.advance(12)
  assert.equal((await f.child.stop()).settlementDeadline, 123)
  const g = stopFixture(t)
  g.clock.advance(4)
  g.launcher.emit('exit', 0, null)
  assert.equal(g.child.inspect().settlementDeadline, 15)
  g.clock.advance(3)
  await g.child.stop()
  await g.child.stop()
  assert.deepEqual(g.stops, [7], 'queued content is fenced even after a clean launcher exit')
  assert.equal(g.child.inspect().settlementDeadline, 15)
  assert.equal(g.lines.length, 0)
})

test('reply disposal and spawn/control errors never claim settlement or use numeric signals', async t => {
  const f = stopFixture(t)
  f.launcher.emit('error', new Error('synthetic spawn error'))
  assert.deepEqual(f.stops, [0])
  f.control.emit('error', new Error('synthetic pipe error'))
  const pending = f.child.stop()
  f.child.dispose()
  assert.equal((await pending).settledExit, false)
  assert.deepEqual(f.lines, [{ at: 0, value: 'TERM\n' }])
  assert.equal(f.clock.pending(), 0)
  f.launcher.emit('exit', 0, null)
  f.control.emit('error', new Error('late synthetic error'))
  assert.equal((await f.child.stop()).settledExit, false)
})

test('reply stop bounds reject missing, nonfinite and reversed intervals', () => {
  for (const patch of [{ graceMs: 6 }, { killMs: -1 }, { exitWaitMs: undefined }, { settleWaitMs: Infinity }, { deadlineMs: 0 }]) {
    assert.throws(() => new ReplyChildStop(new ChildProcess(), { stop: async () => {}, exited: () => {} },
      { nonce: 'abcdef', startedAt: 0 }, { ...stopBounds, ...patch }, stopClock()), /reply_stop_bounds_invalid/)
  }
})

test('reply stop operates an actual owned synthetic launcher solely through its control pipe', async t => {
  // No dsh/provider/home: this Node fixture only implements the launcher's pipe/exit surface.
  const launcher = spawn(process.execPath, ['-e', "process.stdin.on('data', b => { if (b.toString().includes('KILL')) process.exit(0) }); process.stdin.on('end',()=>process.exit(0)); setTimeout(()=>process.exit(2),2000)"], { stdio: ['pipe','ignore','ignore'] })
  Object.defineProperty(launcher, 'kill', { value: () => assert.fail('numeric signal forbidden') })
  const stops = []
  const child = new ReplyChildStop(launcher, { stop: async () => { stops.push(true) }, exited: () => {} },
    { nonce: 'abcdef', startedAt: performance.now() }, { deadlineMs: 1000, graceMs: 10, killMs: 20, exitWaitMs: 1000, settleWaitMs: 100 })
  t.after(() => { child.dispose(); launcher.stdin?.end() })
  const result = await Promise.race([child.stop(), new Promise(resolve => { const timer = setTimeout(() => resolve('sentinel'), 3000); timer.unref() })])
  assert.notEqual(result, 'sentinel')
  assert.equal(result.exit?.code, 0)
  assert.equal(result.settledExit, true)
  assert.equal(stops.length, 1)
})

test('reply exit callback failure is contained for live and already-exited launchers without claiming relay closure', async t => {
  const f = stopFixture(t, { exited: () => { throw new Error('synthetic private relay failure') } })
  const pending = f.child.stop()
  f.clock.advance(1)
  assert.doesNotThrow(() => f.launcher.emit('exit', 0, null))
  const result = await pending
  assert.equal(result.settledExit, true, 'launcher exit remains independently observed')
  assert.equal(result.relayExitFailed, true, 'relay completion remains unproven')
  assert.equal(result.settlementDeadline, 12)
  assert.equal(f.clock.pending(), 0)
  assert.doesNotMatch(JSON.stringify(result), /private|failure/)
  const launcher = new ChildProcess(), clock = stopClock()
  launcher.exitCode = 0
  let child
  assert.doesNotThrow(() => { child = new ReplyChildStop(launcher, { stop: async () => {}, exited: () => { throw new Error('synthetic private constructor failure') } },
    { nonce: 'abcdef', startedAt: 0 }, stopBounds, clock) })
  t.after(() => child?.dispose())
  assert.equal(child.inspect().relayExitFailed, true)
  assert.equal(child.inspect().settledExit, true)
  assert.equal(clock.pending(), 0)
})

const settlementPolicy = { deadlineAt: 50, requestWaitMs: 10, retryWaitMs: 2, maxAttempts: 3 }
const settleReceipt = (body, unit = 'calls_tokens') => ({ replyId: recoveryOptions.replyId, ordinal: body.ordinal, state: 'settled',
  lineageId: '00000000-0000-0000-0000-000000000004', grantRevision: 1, unit, amount: { calls: 1, tokens: 100, priceMicros: 0 }, used: body.used })
function settlementFixture(t, operation, overrides = {}) {
  const clock = stopClock(), calls = []
  const ledger = new ReplySettlements(recoveryOptions.binding, { replyId: recoveryOptions.replyId, unit: overrides.unit ?? 'calls_tokens' },
    { ...settlementPolicy, ...overrides.policy }, async (body, signal) => { calls.push({ body, signal, at: clock.now() }); return operation(body, signal) }, clock)
  t.after(() => ledger.dispose())
  return { ledger, clock, calls }
}

test('reply settlement close retains unanswered dispatch until the shared deadline, even after retry exhaustion', async t => {
  const f = settlementFixture(t, body => body.ordinal === 1 ? new Promise(() => {}) : settleReceipt(body),
    { policy: { maxAttempts: 1 } })
  const first = f.ledger.settle(settleRecord)
  assert.equal(await f.ledger.settle({ ...settleRecord, n: 2 }), 'settled')
  f.clock.advance(10)
  assert.equal(await first, 'settle_unknown')
  const closed = f.ledger.close()
  assert.equal(await Promise.race([closed.then(() => 'closed'), tick().then(() => 'waiting')]), 'waiting')
  f.clock.advance(39)
  assert.equal(await Promise.race([closed.then(() => 'closed'), tick().then(() => 'waiting')]), 'waiting')
  f.clock.advance(1)
  assert.deepEqual(await closed, { unconfirmed: [1] })
  assert.equal(f.calls.length, 2, 'no extra dispatch while the barrier waits')
  assert.equal(f.clock.pending(), 0)
})

test('reply settlement close follows a shortened deadline and cancellation cannot authorize a receipt', async t => {
  const f = settlementFixture(t, () => new Promise(() => {}), { policy: { maxAttempts: 1 } })
  const first = f.ledger.settle(settleRecord)
  await tick(); f.clock.advance(10); await first
  const closed = f.ledger.close()
  await tick(); f.ledger.tighten(15); f.ledger.tighten(60)
  f.clock.advance(5)
  assert.deepEqual(await closed, { unconfirmed: [1] })
  assert.equal(f.clock.pending(), 0)
  const g = settlementFixture(t, () => new Promise(() => {}), { policy: { maxAttempts: 1 } })
  const pending = g.ledger.settle(settleRecord)
  await tick(); g.clock.advance(10); await pending
  const denied = assert.rejects(g.ledger.close(), /reply_settlement_disposed/)
  await tick(); g.ledger.dispose(); await denied
  assert.equal(g.clock.pending(), 0)
})

test('reply settlement lost-response retry retains one immutable body and duplicate delivery joins', async t => {
  let attempts = 0
  const f = settlementFixture(t, async body => { if (++attempts === 1) throw new TypeError('synthetic lost response'); return settleReceipt(body) })
  const first = f.ledger.settle(settleRecord)
  assert.equal(f.ledger.settle(structuredClone(settleRecord)), first)
  await tick()
  assert.equal(f.calls.length, 1)
  f.clock.advance(2)
  assert.equal(await first, 'settled')
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[0].body, f.calls[1].body)
  assert.equal(Object.isFrozen(f.calls[0].body), true)
  assert.equal(Object.isFrozen(f.calls[0].body.used), true)
  assert.deepEqual(await f.ledger.close(), { unconfirmed: [] })
  assert.equal(f.clock.pending(), 0)
})

test('reply settlement closes admission and waits both ordinals in parallel on one shared deadline', async t => {
  const f = settlementFixture(t, () => new Promise(() => {}), { policy: { requestWaitMs: 100, deadlineAt: 50 } })
  const first = f.ledger.settle(settleRecord), second = f.ledger.settle({ ...settleRecord, n: 2 })
  await tick()
  assert.equal(f.calls.length, 2)
  const closed = f.ledger.close()
  assert.equal(f.ledger.close(), closed)
  f.clock.advance(49)
  let completed = false; void closed.then(() => { completed = true })
  await tick(); assert.equal(completed, false)
  f.clock.advance(1)
  assert.deepEqual(await Promise.all([first, second]), ['settle_unknown', 'settle_unknown'])
  assert.deepEqual(await closed, { unconfirmed: [1, 2] })
  assert.ok(f.calls.every(call => call.signal.aborted))
  assert.equal(f.calls.length, 2)
  assert.equal(f.clock.pending(), 0)
})

test('reply settlement deadline can tighten but never extend, and late answers stay unknown', async t => {
  const held = deferred()
  const f = settlementFixture(t, body => held.promise.then(() => settleReceipt(body)), { policy: { requestWaitMs: 100 } })
  const result = f.ledger.settle(settleRecord)
  await tick()
  f.ledger.tighten(8)
  f.ledger.tighten(80)
  f.clock.advance(8)
  assert.equal(await result, 'settle_unknown')
  held.resolve()
  await tick()
  assert.equal(await f.ledger.settle(settleRecord), 'settle_unknown')
  assert.equal(await f.ledger.settle({ ...settleRecord, n: 2 }), 'settle_unknown')
  assert.equal(f.calls.length, 1)
  assert.deepEqual(await f.ledger.close(), { unconfirmed: [1, 2] })
})

test('reply settlement uncertain usage has no API call and conflicting ordinal bodies cannot overwrite', async t => {
  const f = settlementFixture(t, body => settleReceipt(body))
  const unknown = { t: 'settle', n: 1, outcome: 'uncertain', used: null, usage: null }
  assert.equal(await f.ledger.settle(unknown), 'settle_unknown')
  assert.throws(() => f.ledger.settle(settleRecord), /reply_settlement_conflict/)
  assert.equal(f.calls.length, 0)
  f.clock.advance(50)
  assert.deepEqual(await f.ledger.close(), { unconfirmed: [1] })
  const g = settlementFixture(t, body => settleReceipt(body))
  assert.equal(await g.ledger.settle(settleRecord), 'settled')
  assert.throws(() => g.ledger.settle({ ...settleRecord, used: { ...settleRecord.used, tokens: 4 }, usage: { inputTokens: 2, outputTokens: 2 } }), /reply_settlement_conflict/)
  assert.equal(g.calls.length, 1)
})

test('reply settlement permanent denial or malformed receipt never retries or promotes success', async t => {
  for (const operation of [
    () => { throw new TransportError('synthetic private denial', 403, 'forbidden') },
    body => ({ ...settleReceipt(body), ordinal: 2 }),
    body => ({ ...settleReceipt(body), used: { ...body.used, tokens: 4 } }),
    body => ({ ...settleReceipt(body), unit: 'usd' }),
    body => ({ ...settleReceipt(body), state: 'uncertain' }),
  ]) {
    const f = settlementFixture(t, operation)
    assert.equal(await f.ledger.settle(settleRecord), 'settle_unknown')
    assert.equal(f.calls.length, 1)
    f.clock.advance(50)
    assert.deepEqual(await f.ledger.close(), { unconfirmed: [1] })
  }
})

test('reply settlement per-request timeout and max attempts are finite without changing the shared clock', async t => {
  const f = settlementFixture(t, () => new Promise(() => {}), { policy: { maxAttempts: 2 } })
  const result = f.ledger.settle(settleRecord)
  await tick()
  f.clock.advance(10); await tick()
  assert.equal(f.calls[0].signal.aborted, true)
  f.clock.advance(2); await tick()
  assert.equal(f.calls.length, 2)
  f.clock.advance(10)
  assert.equal(await result, 'settle_unknown')
  f.clock.advance(100); await tick()
  assert.equal(f.calls.length, 2)
  assert.deepEqual(await f.ledger.close(), { unconfirmed: [1] })
})

test('reply settlement disposal aborts pending calls and original unit determines API amounts', async t => {
  const f = settlementFixture(t, () => new Promise(() => {}))
  const pending = f.ledger.settle(settleRecord)
  await tick(); f.ledger.dispose()
  assert.equal(await pending, 'settle_unknown')
  assert.equal(f.calls[0].signal.aborted, true)
  assert.equal(f.clock.pending(), 0)
  const g = settlementFixture(t, body => settleReceipt(body, 'usd'), { unit: 'usd' })
  assert.equal(await g.ledger.settle({ ...settleRecord, used: { ...settleRecord.used, priceMicros: 7 } }), 'settled')
  assert.deepEqual(g.calls[0].body.used, { calls: 1, tokens: 0, priceMicros: 7 })
  await g.ledger.close()
  assert.equal(await g.ledger.settle({ ...settleRecord, n: 2 }), 'settle_unknown')
  assert.equal(g.calls.length, 1)
})

async function childFixture(t, overrides = {}) {
  const clock = stopClock(), launcher = new ChildProcess(), pipe = new ReplyPipe()
  const controls = [], settlements = [], observations = [], fences = []
  launcher.stdin = new Writable({ write(chunk, _encoding, done) { controls.push(chunk.toString()); done() } })
  Object.defineProperty(launcher, 'kill', { value: () => assert.fail('numeric signal forbidden') })
  const identity = { ...relayIdentity, attemptId: apiAttempt, nativeSessionId: `sophia-${apiAttempt}` }
  let ready = false
  const child = new (overrides.ChildClass ?? ReplyChild)({ launcher, stream: pipe, identity, spawn: { nonce: overrides.nonce ?? 'abcdef', startedAt: 0 },
    binding: recoveryOptions.binding, target: overrides.target ?? { replyId: recoveryOptions.replyId, unit: 'calls_tokens' }, bounds: stopBounds,
    settlement: { requestWaitMs: 100, retryWaitMs: 2, maxAttempts: 1 } }, {
    observe: async observation => { observations.push(observation); await overrides.observe?.(observation) }, reserve: async () => ({ allowed: true }),
    settle: async (body, signal) => { settlements.push({ body, signal }); return overrides.settle ? overrides.settle(body, signal) : settleReceipt(body) },
    status: status => { ready = status === 'ready'; overrides.status?.(status, launcher) }, fenced: code => { fences.push(code) },
  }, clock)
  t.after(() => { child.dispose(); launcher.stdin.destroy(); pipe.destroy() })
  if (!overrides.noReady) { pipe.receive({ t: 'status', s: 'ready' }); await until(() => ready) }
  if (!overrides.noGo) await child.go()
  return { child, launcher, pipe, clock, controls, settlements, observations, fences, identity }
}

test('reply child composes Stop, late parsed settlement and EOF before its receipt barrier', async t => {
  const f = await childFixture(t)
  await reserveFirst(f.pipe)
  const barrier = f.child.stopForReceipt()
  f.clock.advance(1); f.launcher.emit('exit', 0, null)
  await tick()
  assert.equal(await Promise.race([barrier.then(() => 'closed'), tick().then(() => 'waiting')]), 'waiting')
  assert.equal(f.settlements.length, 0)
  f.pipe.receive(settleRecord); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(10)
  const result = await barrier
  assert.deepEqual(result.settlements, { unconfirmed: [] })
  assert.equal(result.process.settlementDeadline, 12)
  assert.equal(result.process.settledExit, true)
  assert.equal(f.settlements.length, 1)
  assert.equal(f.pipe.written.filter(line => line.t === 'stop').length, 1)
  assert.equal(f.clock.pending(), 0)
})

test('reply admission joins concurrent and reentrant delivery and releases exactly once after API go', async t => {
  const f = await childFixture(t, { noGo: true }), calls = []
  let admission, reentrant
  const binding = { ...recoveryOptions.binding }
  admission = new ReplyAdmission(binding, 100, {
    claim: async body => { calls.push(['claim', body]); reentrant = admission.run(); return { result: 'first' } },
    spawn: body => { calls.push(['spawn', body]); return f.child },
    prepare: async () => { calls.push(['prepare']) },
    authorize: async body => { calls.push(['go', body]); return { result: 'go' } },
  }, f.clock)
  binding.authorityEpoch = 999
  const first = admission.run()
  assert.equal(admission.run(), first)
  assert.equal(await first, 'released')
  assert.equal(reentrant, first)
  assert.equal(await admission.run(), 'released')
  assert.deepEqual(calls.map(c => c[0]), ['claim', 'spawn', 'prepare', 'go'])
  for (const [, body] of calls.filter(c => c[1])) assert.deepEqual(body, recoveryOptions.binding)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 1)
  assert.equal(admission.settlement(), null)
})

test('reply admission lost or refused claim never spawns, and late claim cannot resurrect it', async t => {
  for (const refusal of [true, false]) {
    const f = await childFixture(t, { noGo: true }), calls = []
    let answer, signal
    const admission = new ReplyAdmission(recoveryOptions.binding, 7, {
      claim: (_body, s) => { signal = s; calls.push('claim'); return refusal ? Promise.resolve({ result: 'refused', code: 'already_claimed' }) : new Promise(resolve => { answer = resolve }) },
      spawn: () => assert.fail('no spawn'), prepare: async () => assert.fail('no prepare'), authorize: async () => assert.fail('no go'),
    }, f.clock)
    const pending = admission.run(); await tick()
    if (!refusal) f.clock.advance(7)
    assert.equal(await pending, refusal ? 'refused' : 'unresolved')
    if (!refusal) { assert.equal(signal.aborted, true); answer({ result: 'first' }); await tick() }
    assert.equal(await admission.run(), refusal ? 'refused' : 'unresolved')
    assert.deepEqual(calls, ['claim'])
    assert.equal(admission.settlement(), null)
  }
})

test('reply admission Stop during API go blocks late permission and retains separate cleanup evidence', async t => {
  const f = await childFixture(t, { noGo: true })
  let answer, called = false, signal
  const admission = new ReplyAdmission(recoveryOptions.binding, 100, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child, prepare: async () => {},
    authorize: (_body, s) => { called = true; signal = s; return new Promise(resolve => { answer = resolve }) },
  }, f.clock)
  const pending = admission.run(); await until(() => called)
  admission.stop(); admission.stop()
  assert.equal(await pending, 'stopped')
  assert.equal(signal.aborted, true)
  answer({ result: 'go' }); await tick()
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  assert.equal(f.pipe.written.filter(line => line.t === 'stop').length, 1)
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof); f.clock.advance(10)
  const cleanup = await admission.settlement()
  assert.equal(cleanup.result, 'observed')
  assert.equal(cleanup.evidence.process.settledExit, true)
})

test('reply admission one overall deadline includes preparation and authorization; no hidden retry', async t => {
  const f = await childFixture(t, { noGo: true })
  let prepared, authorize = 0
  const admission = new ReplyAdmission(recoveryOptions.binding, 7, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child,
    prepare: () => new Promise(resolve => { prepared = resolve }),
    authorize: async () => { authorize++; return new Promise(() => {}) },
  }, f.clock)
  const pending = admission.run(); await until(() => prepared)
  f.clock.advance(6); prepared(); await until(() => authorize === 1)
  f.clock.advance(1)
  assert.equal(await pending, 'unresolved')
  assert.equal(await admission.run(), 'unresolved')
  assert.equal(authorize, 1)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  assert.equal(f.pipe.written.filter(line => line.t === 'stop').length, 1)
})

test('reply admission malformed API replies and an unready child never produce a release', async t => {
  for (const stage of ['claim', 'go', 'ready']) {
    const f = await childFixture(t, { noGo: true, noReady: stage === 'ready' })
    let spawns = 0
    const admission = new ReplyAdmission(recoveryOptions.binding, 20, {
      claim: async () => stage === 'claim' ? { result: 'first', extra: 'private-canary' } : { result: 'first' },
      spawn: () => { spawns++; return f.child }, prepare: async () => {},
      authorize: async () => stage === 'go' ? { result: 'go', extra: 'private-canary' } : { result: 'go' },
    }, f.clock)
    assert.equal(await admission.run(), 'unresolved')
    assert.equal(spawns, stage === 'claim' ? 0 : 1)
    assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  }
})

test('reply admission refuses a child owned by any different create field and stops that owned launcher', async t => {
  for (const replacement of [
    { attemptId: '00000000-0000-0000-0000-000000000007' },
    { commandId: '00000000-0000-0000-0000-000000000008' },
    { authorityEpoch: recoveryOptions.binding.authorityEpoch + 1 },
    { leaseId: '00000000-0000-0000-0000-000000000009' },
  ]) {
    const f = await childFixture(t, { noGo: true })
    let prepared = 0, authorized = 0
    const admission = new ReplyAdmission({ ...recoveryOptions.binding, ...replacement }, 20, {
      claim: async () => ({ result: 'first' }), spawn: () => f.child,
      prepare: async () => { prepared++ },
      authorize: async () => { authorized++; return { result: 'go' } },
    }, f.clock)
    assert.equal(await admission.run(), 'unresolved')
    assert.equal(prepared, 0)
    assert.equal(authorized, 0)
    assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
    assert.equal(f.pipe.written.filter(line => line.t === 'stop').length, 1)
    assert.notEqual(admission.settlement(), null)
  }
})

test('reply preparation sends one validated start and admission waits for parsed ready before API go', async t => {
  const f = await childFixture(t, { noGo: true, noReady: true })
  const start = apiFrames([recoveryStart])[0]
  let authorizations = 0
  const admission = new ReplyAdmission(recoveryOptions.binding, 50, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child,
    prepare: (child, signal) => child.prepare(start, apiScope.control, signal),
    authorize: async () => { authorizations++; return { result: 'go' } },
  }, f.clock)
  const pending = admission.run()
  await until(() => f.pipe.written.length === 1)
  assert.deepEqual(f.pipe.written, [start])
  assert.equal(authorizations, 0)
  assert.equal(await Promise.race([pending.then(() => 'released'), tick().then(() => 'waiting')]), 'waiting')
  f.pipe.receive(readyRecord)
  assert.equal(await pending, 'released')
  assert.equal(authorizations, 1)
  assert.deepEqual(f.pipe.written.map(line => line.t), ['start', 'go'])
  await assert.rejects(f.child.prepare(start, apiScope.control, new AbortController().signal), /reply_prepare_invalid/)
  assert.deepEqual(f.pipe.written.map(line => line.t), ['start', 'go'])
})

test('reply preparation refuses mismatched or malformed start packets before writing private content', async t => {
  const start = apiFrames([recoveryStart])[0]
  for (const patch of [{ epoch: 4 }, { nonce: 'abcde0' }, { attemptId: 'other' }, { sessionId: 'other' },
    { prompt: '' }, { prompt: 'x'.repeat(200001) }, { prompt: '\u0000' }, { maxTokens: 101 },
    { route: { ...start.route, model: 'other' } }, { extra: 'private-canary' }]) {
    const f = await childFixture(t, { noGo: true, noReady: true })
    await assert.rejects(f.child.prepare({ ...start, ...patch }, apiScope.control, new AbortController().signal), /reply_prepare_invalid/)
    assert.equal(f.pipe.written.length, 0)
  }
})

test('reply preparation bounds absent ready, Stop and failed setup without allowing late ready to dispatch', async t => {
  for (const mode of ['timeout', 'abort', 'failed', 'exit', 'dispose']) {
    const f = await childFixture(t, { noGo: true, noReady: true }), controller = new AbortController()
    const pending = f.child.prepare(apiFrames([recoveryStart])[0], apiScope.control, controller.signal)
    const rejected = assert.rejects(pending, /reply_prepare_unconfirmed/)
    if (mode === 'timeout') f.clock.advance(100)
    if (mode === 'abort') controller.abort()
    if (mode === 'failed') f.pipe.receive({ t: 'status', s: 'failed', code: 'containment_unavailable' })
    if (mode === 'exit') f.launcher.emit('exit', 0, null)
    if (mode === 'dispose') f.child.dispose()
    await rejected
    if (!f.pipe.destroyed) f.pipe.receive(readyRecord)
    await tick()
    await assert.rejects(f.child.go())
    assert.equal(f.pipe.written.filter(line => line.t === 'start').length, 1)
    assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  }
})

test('reply preparation needs both write completion and ready; cancellation settles a hung start write', async t => {
  const f = await childFixture(t, { noGo: true, noReady: true }), controller = new AbortController()
  let finishWrite
  f.pipe._write = (_chunk, _encoding, done) => { finishWrite = done }
  const pending = f.child.prepare(apiFrames([recoveryStart])[0], apiScope.control, controller.signal)
  f.pipe.receive(readyRecord); await tick()
  assert.equal(await Promise.race([pending.then(() => 'ready'), tick().then(() => 'waiting')]), 'waiting')
  const rejected = assert.rejects(pending, /reply_prepare_unconfirmed/)
  controller.abort(); await rejected
  finishWrite(); await tick()
  await assert.rejects(f.child.go())
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
})

test('reply ready callback exit or failure cannot pass preparation and call API go', async t => {
  for (const mode of ['exit', 'throw']) {
    const f = await childFixture(t, { noGo: true, noReady: true, status: (_status, launcher) => {
      if (mode === 'exit') launcher.emit('exit', 0, null)
      else throw new Error('synthetic status failure')
    } })
    let authorizations = 0
    const admission = new ReplyAdmission(recoveryOptions.binding, 50, {
      claim: async () => ({ result: 'first' }), spawn: () => f.child,
      prepare: (child, signal) => child.prepare(apiFrames([recoveryStart])[0], apiScope.control, signal),
      authorize: async () => { authorizations++; return { result: 'go' } },
    }, f.clock)
    const pending = admission.run(); await until(() => f.pipe.written.some(line => line.t === 'start'))
    f.pipe.receive(readyRecord)
    assert.equal(await pending, 'unresolved')
    assert.equal(authorizations, 0)
    assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  }
})

test('reply child observed exit while API go is pending cannot release the child', async t => {
  const f = await childFixture(t, { noGo: true })
  let release
  const admission = new ReplyAdmission(recoveryOptions.binding, 50, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child, prepare: async () => {},
    authorize: () => new Promise(resolve => { release = resolve }),
  }, f.clock)
  const pending = admission.run(); await until(() => release)
  f.launcher.emit('exit', 0, null); release({ result: 'go' })
  assert.equal(await pending, 'unresolved')
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
})

test('reply child waits two settlements under the observed exit deadline, preserving unknown usage', async t => {
  const f = await childFixture(t, { settle: body => body.ordinal === 1 ? settleReceipt(body) : new Promise(() => {}) })
  await reserveFirst(f.pipe)
  f.pipe.receive({ t: 'reserve', n: 2, tokens: 100, priceMicros: 0 })
  await until(() => f.pipe.written.some(line => line.t === 'reserved' && line.n === 2))
  f.pipe.receive(settleRecord); f.pipe.receive({ ...settleRecord, n: 2 })
  await until(() => f.settlements.length === 2)
  const barrier = f.child.stopForReceipt()
  f.clock.advance(1); f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(10); await tick()
  assert.equal(await Promise.race([barrier.then(() => 'closed'), tick().then(() => 'waiting')]), 'waiting')
  f.clock.advance(1)
  const result = await barrier
  assert.deepEqual(result.settlements, { unconfirmed: [2] })
  assert.equal(f.settlements.length, 2)
  assert.equal(f.settlements[1].signal.aborted, true)
  assert.equal(result.process.settlementDeadline, 12)
  assert.equal(f.clock.pending(), 0)
})

test('reply child pipe closure is not process exit; replay improves evidence without resetting the clock', async t => {
  const f = await childFixture(t)
  const barrier = f.child.stopForReceipt()
  f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(12); await tick()
  const first = await barrier
  assert.equal(first.process.exit, null)
  assert.equal(first.process.settledExit, false)
  assert.equal(first.process.settlementDeadline, 23)
  assert.deepEqual(f.controls, ['TERM\n', 'KILL\n'])
  f.clock.advance(3); f.launcher.emit('exit', 0, null)
  const replay = await f.child.stopForReceipt()
  assert.equal(replay.process.settledExit, true)
  assert.equal(replay.process.settlementDeadline, 23)
  assert.equal(replay.process.stopStartedAt, 0)
  assert.deepEqual(f.controls, ['TERM\n', 'KILL\n'])
})

test('reply child unread invalid tail consumes the shared bound and never claims relay closure', async t => {
  const f = await childFixture(t)
  f.pipe.receive({ t: 'unexpected', content: 'private-canary' })
  await until(() => f.fences.length === 1)
  f.clock.advance(1); f.launcher.emit('exit', 0, null)
  const barrier = f.child.stopForReceipt()
  await tick(); f.clock.advance(10); await tick()
  assert.equal(await Promise.race([barrier.then(() => 'closed'), tick().then(() => 'waiting')]), 'waiting')
  f.clock.advance(1)
  const result = await barrier
  assert.equal(result.relay.invalidLine, true)
  assert.equal(result.relay.eof, false)
  assert.notEqual(result.relay.state, 'closed')
  assert.doesNotMatch(JSON.stringify(result), /private-canary/)
  assert.equal(f.settlements.length, 0)
  assert.equal(f.clock.pending(), 0)
})

test('reply child disposal rejects the pending receipt barrier and further go', async t => {
  const f = await childFixture(t)
  const denied = assert.rejects(f.child.stopForReceipt(), /reply_child_disposed/)
  f.clock.advance(1); f.launcher.emit('exit', 0, null); await tick()
  f.child.dispose(); await denied
  await assert.rejects(f.child.go(), /reply_child_disposed/)
  await assert.rejects(f.child.stopForReceipt(), /reply_child_disposed/)
  assert.equal(f.pipe.destroyed, true)
  assert.equal(f.clock.pending(), 0)
})

test('reply child rejected stop configuration attaches no listeners, starts no timers and leaves the launcher untouched', async t => {
  for (const override of [ { bounds: { ...stopBounds, graceMs: 6, killMs: 5 } },
    { spawn: { nonce: 'invalid', startedAt: 0 } }, { bounds: { ...stopBounds, exitWaitMs: 0 } } ]) {
    const clock = stopClock(), launcher = new ChildProcess(), pipe = new ReplyPipe(), writes = []
    launcher.stdin = new Writable({ write(chunk, _encoding, done) { writes.push(chunk.toString()); done() } })
    t.after(() => { pipe.destroy(); launcher.stdin.destroy() })
    const callerListener = () => {}
    pipe.on('error', callerListener); launcher.on('exit', callerListener)
    const counts = () => ({ pipe: ['readable', 'end', 'close', 'error'].map(name => pipe.listenerCount(name)),
      launcher: ['exit', 'error'].map(name => launcher.listenerCount(name)), control: launcher.stdin.listenerCount('error') })
    const before = counts()
    assert.throws(() => new ReplyChild({ launcher, stream: pipe,
      identity: { ...relayIdentity, attemptId: apiAttempt, nativeSessionId: `sophia-${apiAttempt}` },
      binding: recoveryOptions.binding, target: { replyId: recoveryOptions.replyId, unit: 'calls_tokens' },
      spawn: { nonce: 'abcdef', startedAt: 0 }, bounds: stopBounds,
      settlement: { requestWaitMs: 100, retryWaitMs: 2, maxAttempts: 1 }, ...override }, {
      observe: async () => assert.fail('no API'), reserve: async () => assert.fail('no API'),
      settle: async () => assert.fail('no API'), status: () => assert.fail('no status'), fenced: () => assert.fail('no fence'),
    }, clock), /reply_stop_bounds_invalid/)
    assert.deepEqual(counts(), before)
    assert.equal(clock.pending(), 0)
    pipe.push(Buffer.from('malformed-late-frame\n')); await tick()
    assert.deepEqual(writes, [])
    assert.equal(pipe.destroyed, false, 'failed constructor must not dispose caller-owned stream')
  }
})


function registryCommand(n = 0) {
  const { create } = deliveryFixture()
  create.binding.attemptId = `00000000-0000-0000-0000-${String(100 + n).padStart(12, '0')}`
  create.commandId = `00000000-0000-0000-0000-${String(200 + n).padStart(12, '0')}`
  return create
}
function registryControl(create, kind = 'stop', epoch = create.binding.authorityEpoch) {
  return { ...create, kind, commandId: kind === 'inspect' ? '00000000-0000-0000-0000-000000000301' : kind === 'retire' ? '00000000-0000-0000-0000-000000000302' : '00000000-0000-0000-0000-000000000300',
    binding: { ...create.binding, authorityEpoch: epoch }, payload: {} }
}
function registryOwner() {
  return { projectId: 'p', resourceId: 'r', runtimeUnitId: 'unit', leaseId: recoveryBinding.leaseId }
}
function registryAdmission(binding, claim, clock = stopClock()) {
  return new ReplyAdmission(binding, 20, { claim, spawn: () => assert.fail('no spawn'),
    prepare: async () => assert.fail('no prepare'), authorize: async () => assert.fail('no go') }, clock)
}

test('reply registry reserves two slots before callbacks and joins concurrent and reentrant duplicate creates', async () => {
  const calls = [], create = registryCommand()
  let reentered, registry
  registry = new ReplyChildren(registryOwner(), (snapshot, binding) => {
    reentered = registry.createReply(snapshot)
    return registryAdmission(binding, async body => { calls.push(body); return { result: 'refused', code: 'already_claimed' } })
  })
  const first = registry.createReply(create)
  assert.equal(registry.createReply(structuredClone(create)), first)
  const second = registry.createReply(registryCommand(1))
  assert.equal(await registry.createReply(registryCommand(2)), 'runtime_busy')
  assert.equal(await first, 'refused')
  assert.equal(await second, 'refused')
  assert.equal(reentered, second)
  assert.equal(calls.length, 2)
  assert.equal(await registry.createReply(registryCommand(2)), 'runtime_busy', 'refusal is not retirement')
  assert.equal(registry.createReply(create), first)
  registry.dispose()
})

test('reply registry rejects changed create identity and body, but object key order is not identity', async () => {
  let calls = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, async () => {
    calls++; return { result: 'refused', code: 'already_claimed' }
  }))
  const create = registryCommand(), first = registry.createReply(create)
  const reordered = Object.fromEntries(Object.entries(create).reverse())
  reordered.payload = Object.fromEntries(Object.entries(create.payload).reverse())
  assert.equal(registry.createReply(reordered), first)
  for (const changed of [
    { ...create, commandId: '00000000-0000-0000-0000-000000000400' },
    { ...create, binding: { ...create.binding, authorityEpoch: 2 } },
    { ...create, binding: { ...create.binding, conversationReplyId: '00000000-0000-0000-0000-000000000401' } },
    { ...create, payload: { ...create.payload, text: 'changed' } },
    { ...create, payload: { ...create.payload, conversation: { ...create.payload.conversation, unit: 'usd' } } },
  ]) assert.throws(() => registry.createReply(changed), /reply_registry_conflict/)
  assert.equal(await first, 'refused'); assert.equal(calls, 1); registry.dispose()
})

test('reply registry denies foreign owners and invalid commands before any factory or slot', async () => {
  let factories = 0
  const registry = new ReplyChildren(registryOwner(), () => { factories++; assert.fail('no factory') })
  const create = registryCommand()
  for (const field of ['projectId', 'resourceId', 'runtimeUnitId']) {
    assert.throws(() => registry.createReply({ ...create, binding: { ...create.binding, [field]: 'foreign' } }), /invalid/)
  }
  for (const invalid of [command(goalBinding), { ...create, actorId: 'actor' }, { ...create, commandId: 'bad' },
    { ...create, expectedNativeSessionId: 'foreign' }, { ...create, binding: { ...create.binding, attemptId: 'bad' } }]) {
    assert.throws(() => registry.createReply(invalid), /invalid/)
  }
  assert.equal(factories, 0)
  assert.equal(registry.inspectReply(registryControl(create, 'inspect')), null)
  registry.dispose()
})

test('reply registry snapshots owner and create before asynchronous admission', async () => {
  const owner = registryOwner(), create = registryCommand(), original = structuredClone(create)
  let observed
  const registry = new ReplyChildren(owner, (snapshot, binding) => {
    observed = snapshot
    return registryAdmission(binding, async () => ({ result: 'refused', code: 'already_claimed' }))
  })
  const pending = registry.createReply(create)
  owner.leaseId = 'changed'; owner.projectId = 'foreign'
  create.payload.text = 'changed'; create.binding.authorityEpoch = 8
  assert.equal(await pending, 'refused')
  assert.deepEqual(observed, original)
  assert.equal(registry.createReply(original), pending)
  registry.dispose()
})

test('reply registry Stop before factory prevents claims and retains the slot and original outcome', async () => {
  let factories = 0
  const registry = new ReplyChildren(registryOwner(), () => { factories++; assert.fail('no factory') })
  const create = registryCommand(), pending = registry.createReply(create)
  assert.equal(registry.stopReply(registryControl(create, 'stop', 2)), null)
  assert.equal(await pending, 'stopped')
  assert.equal(registry.createReply(create), pending)
  assert.equal(factories, 0)
  assert.throws(() => registry.stopReply(registryControl(create, 'stop', 1)), /conflict/, 'same Stop id cannot change epoch')
  assert.deepEqual(registry.inspectReply(registryControl(create, 'inspect', 2)), {
    state: 'stopped', authorityEpoch: 2, cleanup: 'not_started',
  })
  registry.dispose()
})

test('reply registry Stop during claim refuses a late first result without another claim', async () => {
  let answer, signal, claims = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, (_body, s) => {
    claims++; signal = s; return new Promise(resolve => { answer = resolve })
  }))
  const create = registryCommand(), pending = registry.createReply(create)
  await until(() => answer)
  registry.stopReply(registryControl(create))
  assert.equal(await deliverySettled(pending), 'stopped')
  assert.equal(signal.aborted, true)
  answer({ result: 'first' }); await tick()
  assert.equal(registry.createReply(create), pending); assert.equal(claims, 1)
  registry.dispose()
})

test('reply registry refuses mismatched factory admissions before claims and retains unknown ownership', async () => {
  for (const field of ['attemptId', 'commandId', 'authorityEpoch', 'leaseId']) {
    let claims = 0
    const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission({ ...binding,
      [field]: field === 'authorityEpoch' ? 9 : '00000000-0000-0000-0000-000000000777' }, async () => {
      claims++; assert.fail('foreign claim')
    }))
    const create = registryCommand()
    assert.equal(await registry.createReply(create), 'unresolved')
    assert.equal(claims, 0)
    assert.equal(registry.inspectReply(registryControl(create, 'inspect')).state, 'unresolved')
    registry.dispose()
  }
})

test('reply registry factory failure never discards an uncertain slot', async () => {
  const registry = new ReplyChildren(registryOwner(), () => { throw new Error('synthetic') })
  assert.equal(await registry.createReply(registryCommand()), 'unresolved')
  assert.equal(await registry.createReply(registryCommand(1)), 'unresolved')
  assert.equal(await registry.createReply(registryCommand(2)), 'runtime_busy')
  registry.dispose()
})

test('reply registry dispose fences queued and pending admissions without cleanup claims', async () => {
  let claims = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, async () => {
    claims++; return { result: 'refused', code: 'already_claimed' }
  }))
  const create = registryCommand(), pending = registry.createReply(create)
  registry.dispose(); registry.dispose()
  assert.equal(await pending, 'stopped'); assert.equal(claims, 0)
  assert.equal(registry.createReply(create), pending)
  assert.throws(() => registry.createReply(registryCommand(1)), /disposed/)
  assert.equal(registry.inspectReply(registryControl(create, 'inspect')).state, 'stopped')
  assert.equal(await new ReplyChildren(registryOwner(), null).createReply(create), 'containment_unavailable')
})

function registryChildCommand() {
  const { create } = deliveryFixture()
  create.binding.authorityEpoch = recoveryOptions.binding.authorityEpoch
  create.binding.conversationReplyId = recoveryOptions.replyId
  return create
}

test('reply registry adopts and stops a matching already-active factory admission before rejecting it', async t => {
  const f = await childFixture(t, { noGo: true })
  let answer, signal, spawns = 0
  const admission = new ReplyAdmission(recoveryOptions.binding, 100, {
    claim: (_body, s) => { signal = s; return new Promise(resolve => { answer = resolve }) },
    spawn: () => { spawns++; return f.child }, prepare: async () => {}, authorize: async () => ({ result: 'go' }),
  }, f.clock)
  t.after(() => admission.stop())
  const active = admission.run(); await until(() => answer)
  const registry = new ReplyChildren(registryOwner(), () => admission)
  assert.equal(await registry.createReply(registryChildCommand()), 'unresolved')
  registry.dispose()
  assert.equal(signal.aborted, true, 'matching handle must remain owned on invalid factory state')
  assert.equal(await deliverySettled(active), 'stopped')
  answer({ result: 'first' }); await tick()
  assert.equal(spawns, 0)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
})

test('reply registry owner boundaries match canonical wire grammar including 160-character units', async () => {
  const owner = { ...registryOwner(), projectId: 'p'.repeat(64), resourceId: 'r'.repeat(64), runtimeUnitId: 'u'.repeat(160) }
  const create = registryCommand()
  Object.assign(create.binding, { projectId: owner.projectId, resourceId: owner.resourceId, runtimeUnitId: owner.runtimeUnitId })
  assert.equal(wire.RuntimeCommand(create), true)
  assert.equal(await new ReplyChildren(owner, null).createReply(create), 'containment_unavailable')
  for (const bad of [{ projectId: 'p'.repeat(65) }, { resourceId: 'r'.repeat(65) }, { runtimeUnitId: 'u'.repeat(161) },
    { projectId: 'a.b' }, { resourceId: '_r' }, { runtimeUnitId: '/u' }, { projectId: '' }]) {
    assert.throws(() => new ReplyChildren({ ...owner, ...bad }, null), /reply_registry_invalid/)
  }
})

test('reply registry released create retains its historical result while Stop joins actual child cleanup', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  let claims = 0, spawns = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => new ReplyAdmission(binding, 100, {
    claim: async () => { claims++; return { result: 'first' } }, spawn: () => { spawns++; return f.child },
    prepare: async () => {}, authorize: async () => ({ result: 'go' }),
  }, f.clock))
  t.after(() => registry.dispose())
  const pending = registry.createReply(create)
  assert.equal(await pending, 'released')
  const stopping = registry.stopReply(registryControl(create, 'stop', 4))
  assert.ok(stopping)
  assert.equal(registry.stopReply(registryControl(create, 'stop', 4)), stopping)
  assert.equal(registry.createReply(create), pending)
  assert.equal(await pending, 'released', 'old delivery result is not current Stop evidence')
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(20)
  const evidence = await deliverySettled(stopping)
  assert.equal(evidence.result, 'observed')
  assert.equal(evidence.evidence.process.settledExit, true)
  assert.equal(registry.inspectReply(registryControl(create, 'inspect', 4)).state, 'stopped')
  assert.equal(claims, 1); assert.equal(spawns, 1)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 1)
  assert.equal(f.pipe.written.filter(line => line.t === 'stop').length, 1)
  assert.throws(() => registry.stopReply({ ...registryControl(create), binding: { ...create.binding,
    conversationReplyId: '00000000-0000-0000-0000-000000000999' } }), /conflict/)
})

test('reply registry dispose aborts an in-flight claim and cannot enable a late answer', async () => {
  let answer, signal
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, (_body, s) => {
    signal = s; return new Promise(resolve => { answer = resolve })
  }))
  const pending = registry.createReply(registryCommand())
  await until(() => answer)
  registry.dispose()
  assert.equal(signal.aborted, true)
  assert.equal(await deliverySettled(pending), 'stopped')
  answer({ result: 'first' }); await tick()
  assert.throws(() => registry.createReply(registryCommand(1)), /disposed/)
})

async function endReceiptChild(f, code = 0) {
  f.launcher.emit('exit', code, null)
  f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(10)
  await tick()
}
function receiptAdmission(f, overrides = {}) {
  return new ReplyAdmission(recoveryOptions.binding, 20, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child,
    prepare: async () => {}, authorize: async () => ({ result: 'go' }), ...overrides,
  }, f.clock)
}

test('create receipts distinguish pre-claim cancellation, claim refusal and uncertain claim', async () => {
  const before = registryAdmission(recoveryOptions.binding, async () => assert.fail('no claim'))
  before.stop()
  assert.equal((await before.createReceipt()).stage, 'rejected')
  assert.equal((await before.createReceipt()).reason, 'cancelled_before_claim')
  for (const code of ['stale_epoch', 'not_pending', 'already_claimed']) {
    const admission = registryAdmission(recoveryOptions.binding, async () => ({ result: 'refused', code }))
    const receipt = await admission.createReceipt()
    assert.equal(receipt.stage, 'outcome_unknown'); assert.equal(receipt.reason, code)
    assert.equal(receipt.nativeSessionId, null)
    assert.equal(receipt.commandId, recoveryOptions.binding.commandId)
    assert.equal(receipt.attemptId, recoveryOptions.binding.attemptId)
    assert.equal(wire.RuntimeReceipt(receipt), true)
  }
  const clock = stopClock()
  const lost = registryAdmission(recoveryOptions.binding, () => new Promise(() => {}), clock)
  const receipt = lost.createReceipt(); await tick(); clock.advance(20)
  assert.equal((await deliverySettled(receipt)).stage, 'outcome_unknown')
  assert.equal((await receipt).reason, 'claim_unconfirmed')
})

test('delivered create receipt is immutable, correlated and historical across later Stop', async t => {
  const f = await childFixture(t, { noGo: true }), admission = receiptAdmission(f)
  const pending = admission.createReceipt()
  assert.equal(admission.createReceipt(), pending)
  const receipt = await pending
  assert.equal(receipt.stage, 'delivered'); assert.equal(receipt.reason, null)
  assert.equal(receipt.nativeSessionId, `sophia-${apiAttempt}`)
  assert.throws(() => { receipt.stage = 'checked' }, TypeError)
  assert.throws(() => { receipt.evidenceRefs.push('untrusted') }, TypeError)
  admission.stop()
  assert.equal(admission.state, 'stopped')
  assert.equal(await admission.createReceipt(), receipt)
  await endReceiptChild(f)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 1)
})

test('refused API go and failed preparation wait for cleanup before rejected receipt, without raw errors', async t => {
  for (const mode of ['stale_epoch', 'not_pending', 'lease_mismatch', 'prepare']) {
    const f = await childFixture(t, { noGo: true })
    const admission = receiptAdmission(f, mode === 'prepare' ? { prepare: async () => { throw new Error('PRIVATE_CANARY') } } :
      { authorize: async () => ({ result: 'refused', code: mode }) })
    await admission.run()
    const pending = admission.createReceipt()
    assert.equal(await Promise.race([pending.then(() => 'early'), tick().then(() => 'waiting')]), 'waiting')
    await endReceiptChild(f)
    const receipt = await deliverySettled(pending)
    assert.equal(receipt.stage, 'rejected')
    assert.equal(receipt.reason, mode === 'prepare' ? 'setup_unconfirmed' : mode)
    assert.equal(JSON.stringify(receipt).includes('PRIVATE_CANARY'), false)
    assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  }
})

test('lost API go response is rejected after the same cleanup and a late answer never writes child go', async t => {
  const f = await childFixture(t, { noGo: true })
  let answer
  const admission = receiptAdmission(f, { authorize: () => new Promise(resolve => { answer = resolve }) })
  const running = admission.run(); await until(() => answer)
  f.clock.advance(20)
  assert.equal(await deliverySettled(running), 'unresolved')
  const pending = admission.createReceipt()
  await endReceiptChild(f)
  const receipt = await deliverySettled(pending)
  assert.equal(receipt.stage, 'rejected'); assert.equal(receipt.reason, 'go_unconfirmed')
  answer({ result: 'go' }); await tick()
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
})

test('possibly written child go produces outcome_unknown, never a safe pre-call rejection', async t => {
  const f = await childFixture(t, { noGo: true }), go = f.child.go.bind(f.child)
  f.child.go = async () => { await go(); throw new Error('PRIVATE_WRITE_CANARY') }
  const admission = receiptAdmission(f)
  assert.equal(await admission.run(), 'unresolved')
  const pending = admission.createReceipt()
  await endReceiptChild(f)
  const receipt = await deliverySettled(pending)
  assert.equal(receipt.stage, 'outcome_unknown'); assert.equal(receipt.reason, 'go_write_unconfirmed')
  assert.equal(JSON.stringify(receipt).includes('PRIVATE_WRITE_CANARY'), false)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 1)
})

test('occupied-home launcher exit and failed cleanup never become successful cleanup or safe rejection', async t => {
  for (const mode of ['occupied', 'cleanup_failed']) {
    const f = await childFixture(t, { noGo: true })
    const admission = receiptAdmission(f, { prepare: async () => { throw new Error('setup') } })
    await admission.run()
    const pending = admission.createReceipt()
    if (mode === 'occupied') await endReceiptChild(f, 71)
    else f.child.dispose()
    const receipt = await deliverySettled(pending)
    assert.equal(receipt.stage, 'outcome_unknown')
    assert.equal(receipt.reason, mode === 'occupied' ? 'home_exists' : 'cleanup_unconfirmed')
  }
})

test('terminal create receipt waits for an actually pending settle after possible dispatch', async t => {
  let settleAnswer
  const f = await childFixture(t, { noGo: true, settle: body => new Promise(resolve => {
    settleAnswer = () => resolve(settleReceipt(body))
  }) })
  const go = f.child.go.bind(f.child)
  f.child.go = async () => {
    await go(); await reserveFirst(f.pipe); f.pipe.receive(settleRecord)
    await until(() => settleAnswer)
    throw new Error('synthetic lost go completion')
  }
  const admission = receiptAdmission(f)
  await admission.run()
  const pending = admission.createReceipt()
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(1)
  assert.equal(await Promise.race([pending.then(() => 'early'), tick().then(() => 'waiting')]), 'waiting')
  settleAnswer(); await tick(); f.clock.advance(9)
  const receipt = await deliverySettled(pending)
  assert.equal(receipt.stage, 'outcome_unknown')
  assert.equal(f.settlements.length, 1)
  assert.equal(f.clock.pending(), 0)
})

test('pre-go receipt stays unknown without an observed launcher exit, including a later occupied-home exit', async t => {
  const f = await childFixture(t, { noGo: true })
  const admission = receiptAdmission(f, { prepare: async () => { throw new Error('synthetic setup failure') } })
  await admission.run()
  const pending = admission.createReceipt(); await tick()
  f.clock.advance(stopBounds.killMs + stopBounds.exitWaitMs + stopBounds.settleWaitMs)
  const receipt = await deliverySettled(pending)
  assert.equal(f.child.inspect().process.exit, null)
  assert.equal(receipt.stage, 'outcome_unknown')
  assert.equal(receipt.reason, 'process_unconfirmed')
  f.launcher.emit('exit', 71, null); f.pipe.push(null); await tick()
  assert.equal(await admission.createReceipt(), receipt)
  assert.equal(receipt.stage, 'outcome_unknown')
})

test('observed pre-go unsettled exit proves no new call but never claims physical cleanup', async t => {
  for (const code of [74, null]) {
    const f = await childFixture(t, { noGo: true })
    const admission = receiptAdmission(f, { prepare: async () => { throw new Error('synthetic setup failure') } })
    await admission.run()
    const pending = admission.createReceipt()
    f.launcher.emit('exit', code, code === null ? 'SIGTERM' : null); f.pipe.push(null)
    await until(() => f.child.inspect().relay.eof)
    f.clock.advance(10)
    const receipt = await deliverySettled(pending)
    assert.equal(receipt.stage, 'rejected')
    assert.equal(f.child.inspect().process.settledExit, false)
    assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  }
})

test('registry create receipts join admission and concurrent reentrant receipt requests', async () => {
  let registry, reentered, claims = 0
  const create = registryCommand()
  registry = new ReplyChildren(registryOwner(), (snapshot, binding) => {
    reentered = registry.createReceipt(snapshot)
    return registryAdmission(binding, async () => { claims++; return { result: 'refused', code: 'already_claimed' } })
  })
  const pending = registry.createReceipt(create)
  assert.equal(registry.createReceipt(structuredClone(create)), pending)
  const receipt = await pending
  assert.equal(reentered, pending)
  assert.equal(await registry.createReceipt(create), receipt)
  assert.equal(receipt.stage, 'outcome_unknown'); assert.equal(receipt.reason, 'already_claimed')
  assert.equal(receipt.commandId, create.commandId); assert.equal(receipt.attemptId, create.binding.attemptId)
  assert.equal(wire.RuntimeReceipt(receipt), true)
  assert.equal(Object.isFrozen(receipt), true); assert.equal(Object.isFrozen(receipt.evidenceRefs), true)
  assert.equal(claims, 1); registry.dispose()
})

test('registry receipt lookup validates current owner and exact original body before cached evidence', async () => {
  let claims = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, async () => {
    claims++; return { result: 'refused', code: 'already_claimed' }
  }))
  const create = registryCommand(), receipt = await registry.createReceipt(create)
  for (const field of ['projectId', 'resourceId', 'runtimeUnitId']) {
    assert.throws(() => registry.createReceipt({ ...create, binding: { ...create.binding, [field]: 'foreign' } }), /invalid/)
  }
  for (const changed of [{ ...create, commandId: '00000000-0000-0000-0000-000000000999' },
    { ...create, payload: { ...create.payload, text: 'PRIVATE_CHANGED_PROMPT' } },
    { ...create, binding: { ...create.binding, authorityEpoch: 2 } }]) {
    assert.throws(() => registry.createReceipt(changed), /conflict/)
  }
  assert.equal(await registry.createReceipt(create), receipt)
  assert.equal(claims, 1); registry.dispose()
})

test('registry receipt no-capacity and disabled results reject without factory or prompt exposure', async () => {
  const disabled = new ReplyChildren(registryOwner(), null), create = registryCommand()
  const denial = await disabled.createReceipt(create)
  assert.equal(denial.stage, 'rejected'); assert.equal(denial.reason, 'containment_unavailable')
  assert.equal(denial.nativeSessionId, null)
  let claims = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, async () => {
    claims++; return { result: 'refused', code: 'already_claimed' }
  }))
  await Promise.all([registry.createReply(create), registry.createReply(registryCommand(1))])
  const third = registryCommand(2), original = structuredClone(third)
  third.payload.text = 'PRIVATE_CAPACITY_PROMPT'
  const pending = registry.createReceipt(third)
  third.commandId = 'changed'; third.binding.attemptId = 'changed'
  const receipt = await pending
  assert.equal(receipt.stage, 'rejected'); assert.equal(receipt.reason, 'runtime_busy')
  assert.equal(receipt.commandId, original.commandId); assert.equal(receipt.attemptId, original.binding.attemptId)
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE_CAPACITY_PROMPT/)
  assert.equal(claims, 2); registry.dispose(); disabled.dispose()
})

test('registry Stop or dispose before factory yields one cancelled create receipt without a claim', async () => {
  for (const mode of ['stop', 'dispose']) {
    let factories = 0
    const registry = new ReplyChildren(registryOwner(), () => { factories++; assert.fail('no factory') })
    const create = registryCommand(), pending = registry.createReceipt(create)
    if (mode === 'stop') registry.stopReply(registryControl(create, 'stop', 2))
    else registry.dispose()
    const receipt = await pending
    assert.equal(receipt.stage, 'rejected'); assert.equal(receipt.reason, 'cancelled_before_claim')
    assert.equal(receipt.nativeSessionId, null); assert.equal(factories, 0)
    assert.equal(registry.createReceipt(create), pending)
    registry.dispose()
  }
})

test('registry factory ownership uncertainty cannot become a rejection after Stop', async () => {
  for (const mode of ['throw', 'foreign']) {
    let registry, calls = 0
    const create = registryCommand()
    registry = new ReplyChildren(registryOwner(), (_command, binding) => {
      registry.stopReply(registryControl(create, 'stop', 2))
      if (mode === 'throw') throw new Error('PRIVATE_FACTORY_ERROR')
      return registryAdmission({ ...binding, commandId: '00000000-0000-0000-0000-000000000888' }, async () => {
        calls++; assert.fail('foreign claim')
      })
    })
    const receipt = await registry.createReceipt(create)
    assert.equal(receipt.stage, 'outcome_unknown'); assert.equal(receipt.reason, 'factory_unconfirmed')
    assert.equal(receipt.commandId, create.commandId); assert.equal(calls, 0)
    assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE_FACTORY_ERROR/)
    registry.dispose()
  }
})

test('registry released receipt stays historical after Stop and joins the owned admission', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  let claims = 0, spawns = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => new ReplyAdmission(binding, 100, {
    claim: async () => { claims++; return { result: 'first' } }, spawn: () => { spawns++; return f.child },
    prepare: async () => {}, authorize: async () => ({ result: 'go' }),
  }, f.clock))
  t.after(() => registry.dispose())
  const admission = registry.createReply(create), pending = registry.createReceipt(create)
  assert.equal(await admission, 'released')
  const stopping = registry.stopReply(registryControl(create, 'stop', 4))
  const receipt = await pending
  assert.equal(receipt.stage, 'delivered'); assert.equal(receipt.reason, null)
  assert.equal(receipt.nativeSessionId, `sophia-${create.binding.attemptId}`)
  assert.equal(registry.createReceipt(create), pending)
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(10); await deliverySettled(stopping)
  assert.equal(await pending, receipt); assert.equal(claims, 1); assert.equal(spawns, 1)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 1)
})

test('registry invalid active factory waits owned cleanup and returns unknown rather than delivered', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  const admission = receiptAdmission(f)
  assert.equal(await admission.run(), 'released')
  const registry = new ReplyChildren(registryOwner(), () => admission)
  t.after(() => registry.dispose())
  const pending = registry.createReceipt(create)
  await until(() => f.child.inspect().process.stopStartedAt !== null)
  assert.equal(await Promise.race([pending.then(() => 'early'), tick().then(() => 'waiting')]), 'waiting')
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(10)
  const receipt = await deliverySettled(pending)
  assert.equal(receipt.stage, 'outcome_unknown'); assert.equal(receipt.reason, 'factory_unconfirmed')
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 1)
})

test('registry two pending receipt requests retain their own correlation under reversed replies', async () => {
  const completions = new Map(), signals = new Map(), clock = stopClock()
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding, (body, signal) => {
    signals.set(body.attemptId, signal)
    return new Promise(resolve => completions.set(body.attemptId, resolve))
  }, clock))
  const first = registryCommand(), second = registryCommand(1)
  second.binding.conversationReplyId = '00000000-0000-0000-0000-000000000555'
  const a = registry.createReceipt(first), b = registry.createReceipt(second)
  await until(() => completions.size === 2)
  completions.get(second.binding.attemptId)({ result: 'refused', code: 'reply_not_pending' })
  const answered = await deliverySettled(b)
  assert.equal(answered.commandId, second.commandId); assert.equal(answered.attemptId, second.binding.attemptId)
  assert.equal(await Promise.race([a.then(() => 'early'), tick().then(() => 'waiting')]), 'waiting')
  registry.stopReply(registryControl(first, 'stop', 2))
  const cancelled = await deliverySettled(a)
  assert.equal(cancelled.commandId, first.commandId); assert.equal(cancelled.attemptId, first.binding.attemptId)
  assert.equal(cancelled.stage, 'outcome_unknown'); assert.equal(cancelled.reason, 'claim_unconfirmed')
  assert.equal(signals.get(first.binding.attemptId).aborted, true)
  completions.get(first.binding.attemptId)({ result: 'first' }); await tick()
  assert.equal(await registry.createReceipt(first), cancelled)
  assert.equal(await registry.createReceipt(second), answered)
  registry.dispose(); assert.equal(clock.pending(), 0)
})
test('registry disposal reaches a released child without claiming settled cleanup', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f))
  t.after(() => registry.dispose())
  const receipt = await registry.createReceipt(create)
  assert.equal(receipt.stage, 'delivered')
  registry.dispose(); registry.dispose()
  assert.equal(f.pipe.destroyed, true, 'owned relay must be closed on disposal')
  assert.equal(f.launcher.stdin.writableEnded, true)
  assert.deepEqual(f.controls, ['TERM\n'])
  assert.equal(f.clock.pending(), 0)
  assert.equal(f.child.inspect().process.settledExit, false)
  assert.equal(await registry.createReceipt(create), receipt, 'historical delivery is not cleanup')
  const cleanup = registry.stopReply(registryControl(create))
  assert.deepEqual(await deliverySettled(cleanup), { result: 'unresolved' })
})

test('registry disposal during spawn disposes the subsequently returned owned child', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  let registry
  registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f, {
    spawn: () => { registry.dispose(); return f.child },
    prepare: async () => assert.fail('no preparation after disposal'),
  }))
  t.after(() => registry.dispose())
  const receipt = await deliverySettled(registry.createReceipt(create))
  assert.equal(receipt.stage, 'outcome_unknown')
  assert.equal(f.pipe.destroyed, true)
  assert.equal(f.launcher.stdin.writableEnded, true)
  assert.equal(f.pipe.written.filter(line => line.t === 'go').length, 0)
  assert.equal(f.clock.pending(), 0)
})

test('registry disposal during adoption disposes a matching active handle but never a foreign one', async t => {
  for (const foreign of [false, true]) {
    const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
    const admission = receiptAdmission(f)
    assert.equal(await admission.run(), 'released')
    if (foreign) create.binding.attemptId = '00000000-0000-0000-0000-000000000999'
    let registry
    registry = new ReplyChildren(registryOwner(), () => { registry.dispose(); return admission })
    t.after(() => registry.dispose())
    const receipt = await deliverySettled(registry.createReceipt(create))
    assert.equal(receipt.stage, 'outcome_unknown')
    assert.equal(f.pipe.destroyed, !foreign)
    assert.equal(f.launcher.stdin.writableEnded, !foreign)
    if (!foreign) assert.equal(f.clock.pending(), 0)
  }
})

async function receiptDeliveryFixture(operation, overrides = {}) {
  const { ReplyReceiptDelivery } = await import('../../packages/dsh-bundle/dist/reply-child.js')
  const registry = new ReplyChildren(registryOwner(), null), create = registryChildCommand()
  const receipt = structuredClone(await registry.createReceipt(create))
  const clock = stopClock(), policy = { deadlineAt: 30, requestWaitMs: 10, retryWaitMs: 2, maxAttempts: 3, ...overrides }
  const delivery = new ReplyReceiptDelivery(recoveryOptions.binding, receipt, policy, operation, clock)
  return { delivery, clock, receipt, policy, registry, create, ReplyReceiptDelivery }
}

test('receipt delivery snapshots correlated body and joins concurrent/reentrant sends', async () => {
  let reentrant, f, calls = 0, posted
  f = await receiptDeliveryFixture(async receipts => { calls++; reentrant = f.delivery.send(); posted = receipts })
  const pending = f.delivery.send()
  assert.equal(f.delivery.send(), pending)
  f.receipt.reason = 'mutated'; f.receipt.evidenceRefs.push('mutated'); f.policy.maxAttempts = 99
  assert.equal(await pending, 'acknowledged'); assert.equal(reentrant, pending)
  assert.equal(posted[0].reason, 'containment_unavailable'); assert.deepEqual(posted[0].evidenceRefs, [])
  assert.ok(Object.isFrozen(posted)); assert.ok(Object.isFrozen(posted[0])); assert.ok(Object.isFrozen(posted[0].evidenceRefs))
  assert.equal(calls, 1); assert.equal(f.delivery.inspect().acknowledged, true); assert.equal(f.clock.pending(), 0)
  f.delivery.dispose(); f.registry.dispose()
})

test('receipt delivery rejects wrong command/attempt/session and malformed policy before transport', async () => {
  const f = await receiptDeliveryFixture(async () => assert.fail('no transport'))
  for (const receipt of [{ ...f.receipt, commandId: '00000000-0000-0000-0000-000000000999' },
    { ...f.receipt, attemptId: 'foreign' }, { ...f.receipt, nativeSessionId: 'sophia-foreign' },
    { ...f.receipt, extra: true }]) {
    assert.throws(() => new f.ReplyReceiptDelivery(recoveryOptions.binding, receipt, f.policy, async () => {}), /invalid/)
  }
  for (const policy of [{ ...f.policy, maxAttempts: 0 }, { ...f.policy, requestWaitMs: 0 }, { ...f.policy, deadlineAt: Infinity }]) {
    assert.throws(() => new f.ReplyReceiptDelivery(recoveryOptions.binding, f.receipt, policy, async () => {}), /invalid/)
  }
  f.delivery.dispose(); f.registry.dispose()
})

test('receipt delivery retries settled lost replies with one body and finite original allowance', async () => {
  const bodies = []
  const f = await receiptDeliveryFixture(async receipts => { bodies.push(receipts[0]); throw new TypeError('synthetic lost reply') })
  const pending = f.delivery.send(); await tick(); f.clock.advance(2); await tick(); f.clock.advance(2)
  assert.equal(await deliverySettled(pending), 'unconfirmed')
  assert.equal(bodies.length, 3); assert.ok(bodies.every(body => body === bodies[0]))
  f.clock.advance(100); assert.equal(await f.delivery.send(), 'unconfirmed'); assert.equal(bodies.length, 3)
  assert.equal(f.clock.pending(), 0); f.delivery.dispose(); f.registry.dispose()
})

test('receipt timeout keeps unsignalled POST in flight and records a late ACK without rewriting the waiter', async () => {
  let resolve, calls = 0
  const f = await receiptDeliveryFixture(() => { calls++; return new Promise(r => { resolve = r }) })
  const pending = f.delivery.send(); await tick(); f.clock.advance(10)
  assert.equal(await deliverySettled(pending), 'unconfirmed')
  assert.equal(f.delivery.inspect().inFlight, true); assert.equal(f.delivery.inspect().acknowledged, false)
  f.clock.advance(100); assert.equal(await f.delivery.send(), 'unconfirmed'); assert.equal(calls, 1)
  resolve(); await tick()
  assert.equal(f.delivery.inspect().inFlight, false); assert.equal(f.delivery.inspect().acknowledged, true)
  assert.equal(await f.delivery.send(), 'unconfirmed', 'late ACK does not rewrite the timed-out result')
  assert.equal(f.clock.pending(), 0); f.delivery.dispose(); f.registry.dispose()
})

test('late receipt rejection after waiter timeout cannot start a second send', async () => {
  let reject, calls = 0
  const f = await receiptDeliveryFixture(() => { calls++; return new Promise((_r, fail) => { reject = fail }) })
  const pending = f.delivery.send(); await tick(); f.clock.advance(10)
  assert.equal(await deliverySettled(pending), 'unconfirmed')
  reject(new TypeError('synthetic lost response')); await tick(); f.clock.advance(2); await tick()
  assert.equal(calls, 1); assert.equal(f.delivery.inspect().inFlight, false)
  assert.equal(f.delivery.inspect().acknowledged, false); assert.equal(f.clock.pending(), 0)
  f.delivery.dispose(); f.registry.dispose()
})

test('receipt permanent refusal and disposal never retry or imply acknowledgement', async () => {
  for (const mode of ['refused', 'dispose', 'before', 'backoff']) {
    let calls = 0, resolve
    const f = await receiptDeliveryFixture(() => {
      calls++
      if (mode === 'refused') throw new TransportError('synthetic refusal', 409, 'invalid_state')
      if (mode === 'backoff') throw new TypeError('synthetic lost response')
      return new Promise(r => { resolve = r })
    })
    if (mode === 'before') f.delivery.dispose()
    const pending = f.delivery.send(); await tick()
    if (mode === 'dispose' || mode === 'backoff') f.delivery.dispose()
    assert.equal(await deliverySettled(pending), 'unconfirmed')
    assert.equal(calls, mode === 'before' ? 0 : 1); assert.equal(f.delivery.inspect().acknowledged, false)
    assert.equal(f.clock.pending(), 0)
    if (resolve) { resolve(); await tick(); assert.equal(f.delivery.inspect().disposed, true) }
    f.delivery.dispose(); f.registry.dispose()
  }
})

test('receipt deadline cannot restart with a second waiter or expired admission', async () => {
  let calls = 0
  const f = await receiptDeliveryFixture(async () => { calls++; throw new TypeError('synthetic') }, { deadlineAt: 1 })
  const pending = f.delivery.send(); await tick(); f.clock.advance(1)
  assert.equal(await deliverySettled(pending), 'unconfirmed'); assert.equal(calls, 1)
  assert.equal(await f.delivery.send(), 'unconfirmed'); assert.equal(calls, 1)
  const g = await receiptDeliveryFixture(async () => assert.fail('expired dispatch'))
  g.clock.advance(30); assert.equal(await g.delivery.send(), 'unconfirmed')
  f.delivery.dispose(); g.delivery.dispose(); f.registry.dispose(); g.registry.dispose()
})

test('two receipt deliveries retain separate correlation and late acknowledgements', async () => {
  let first, second
  const a = await receiptDeliveryFixture(() => new Promise(r => { first = r }))
  const b = new a.ReplyReceiptDelivery({ ...recoveryOptions.binding, commandId: '00000000-0000-0000-0000-000000000999' },
    { ...a.receipt, commandId: '00000000-0000-0000-0000-000000000999', stage: 'outcome_unknown' }, a.policy,
    () => new Promise(r => { second = r }), a.clock)
  const p = a.delivery.send(), q = b.send(); await tick()
  second(); assert.equal(await q, 'acknowledged'); assert.equal(a.delivery.inspect().acknowledged, false)
  a.clock.advance(10); assert.equal(await p, 'unconfirmed'); first(); await tick()
  assert.equal(a.delivery.inspect().acknowledged, true); assert.equal(b.inspect().acknowledged, true)
  a.delivery.dispose(); b.dispose(); a.registry.dispose(); assert.equal(a.clock.pending(), 0)
})

test('registry receipt crosses real HTTP with a lost response and one retained command-stage record', async t => {
  const { createServer } = await import('node:http')
  const records = new Map(), requests = [], headers = []
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body); headers.push(req.headers)
    for (const receipt of body.receipts) {
      const key = `${receipt.commandId}:${receipt.stage}`
      if (!records.has(key)) records.set(key, receipt)
    }
    if (requests.length === 1) req.socket.destroy() // Recorded, but its response was lost.
    else { res.writeHead(204); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const transport = new ServiceTransport({ baseUrl: `http://127.0.0.1:${server.address().port}`,
    token: 'synthetic-only', runtimeUnitId: 'unit', bridgeInstanceId: recoveryOptions.binding.leaseId })
  const f = await receiptDeliveryFixture(async () => assert.fail('fixture transport unused'))
  const delivery = new f.ReplyReceiptDelivery(recoveryOptions.binding, f.receipt,
    { deadlineAt: performance.now() + 3000, requestWaitMs: 1000, retryWaitMs: 1, maxAttempts: 2 },
    body => transport.receipts(body))
  t.after(() => { delivery.dispose(); f.delivery.dispose(); f.registry.dispose() })
  let timer
  try {
    const result = await Promise.race([delivery.send(), new Promise(resolve => { timer = setTimeout(() => resolve('sentinel'), 4000) })])
    assert.equal(result, 'acknowledged', 'actual transport must settle before the sentinel')
    assert.equal(records.size, 1); assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1])
    assert.ok(headers.every(h => h['x-sophia-bridge-instance'] === recoveryOptions.binding.leaseId))
    assert.equal(delivery.inspect().attempts, 2); assert.equal(delivery.inspect().inFlight, false)
  } finally { clearTimeout(timer) }
})

function registryDelivery(receipts, overrides = {}) {
  return { waitMs: 30, requestWaitMs: 10, retryWaitMs: 2, maxAttempts: 3, receipts, ...overrides }
}

test('registry executes one retained create delivery and returns before its slow HTTP acknowledgement', async t => {
  const clock = stopClock(), posted = [], create = registryChildCommand()
  let resolve, reentrant, registry
  const options = registryDelivery(values => { posted.push(values); reentrant = registry.executeCreate(create); return new Promise(r => { resolve = r }) })
  registry = new ReplyChildren(registryOwner(), null, options, clock)
  t.after(() => registry.dispose())
  const pending = registry.executeCreate(create)
  assert.equal(registry.executeCreate(structuredClone(create)), pending)
  options.receipts = async () => assert.fail('mutated options cannot redirect delivery')
  await deliverySettled(pending); await tick()
  assert.equal(reentrant, pending); assert.equal(posted.length, 1)
  assert.equal(registry.deliveryStatus(registryControl(create, 'inspect'))[0].acknowledgement.inFlight, true)
  clock.advance(10); await tick(); assert.equal(posted.length, 1)
  resolve(); await tick()
  const status = registry.deliveryStatus(registryControl(create, 'inspect'))[0]
  assert.equal(status.acknowledgement.acknowledged, true)
  assert.equal(registry.executeCreate(create), pending); assert.equal(posted.length, 1)
  assert.equal(clock.pending(), 0)
})

test('registry delivery reserves child admission before a same-turn Stop can arrive', async t => {
  const clock = stopClock(), posted = [], create = registryChildCommand()
  let factories = 0
  const registry = new ReplyChildren(registryOwner(), () => { factories++; assert.fail('Stop fenced queued factory') },
    registryDelivery(async receipts => { posted.push(receipts[0]) }), clock)
  t.after(() => registry.dispose())
  const pending = registry.executeCreate(create)
  registry.stopReply(registryControl(create, 'stop', 4))
  await deliverySettled(pending); await tick()
  assert.equal(factories, 0); assert.equal(posted.length, 1)
  assert.equal(posted[0].stage, 'rejected'); assert.equal(posted[0].reason, 'cancelled_before_claim')
  assert.equal(clock.pending(), 0)
})

test('registry slow receipt never delays a released child Stop or converts it to cleanup proof', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  let acknowledge, posts = 0
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f), registryDelivery(() => {
    posts++; return new Promise(resolve => { acknowledge = resolve })
  }), f.clock)
  t.after(() => registry.dispose())
  await deliverySettled(registry.executeCreate(create)); await tick()
  assert.equal(posts, 1); assert.equal(f.pipe.written.filter(x => x.t === 'go').length, 1)
  const stopping = registry.stopReply(registryControl(create, 'stop', 4))
  assert.equal(f.pipe.written.filter(x => x.t === 'stop').length, 1)
  await endReceiptChild(f)
  assert.equal((await deliverySettled(stopping)).result, 'observed')
  assert.equal(registry.deliveryStatus(registryControl(create, 'inspect', 4))[0].acknowledgement.acknowledged, false)
  acknowledge(); await tick()
  assert.equal(registry.deliveryStatus(registryControl(create, 'inspect', 4))[0].acknowledgement.acknowledged, true)
})

test('registry delivery rejects changed identity or owner before another effect and snapshots its command', async t => {
  const clock = stopClock(), posted = [], create = registryChildCommand(), original = structuredClone(create)
  const registry = new ReplyChildren(registryOwner(), null, registryDelivery(async values => { posted.push(values[0]) }), clock)
  t.after(() => registry.dispose())
  const pending = registry.executeCreate(create)
  create.commandId = '00000000-0000-0000-0000-000000000999'; create.payload.text = 'mutated'
  await pending; await tick()
  assert.equal(posted[0].commandId, original.commandId)
  const changed = [create, { ...original, binding: { ...original.binding, attemptId: apiAttempt.replace(/6$/, '9') } },
    { ...original, payload: { ...original.payload, text: 'different' } }]
  for (const value of changed) assert.throws(() => registry.executeCreate(value), /conflict/)
  for (const key of ['projectId', 'resourceId', 'runtimeUnitId']) {
    assert.throws(() => registry.executeCreate({ ...original, binding: { ...original.binding, [key]: 'foreign' } }), /invalid/)
  }
  assert.throws(() => registry.deliveryStatus({ ...registryControl(original, 'inspect'), binding: {
    ...original.binding, conversationReplyId: '00000000-0000-0000-0000-000000000999' } }), /conflict/)
  assert.equal(posted.length, 1)
})

test('registry retains disabled and capacity denials and refuses retention overflow before effects', async t => {
  const clock = stopClock(), posted = []
  let factories = 0
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => {
    factories++; return registryAdmission(binding, async () => ({ result: 'refused', code: 'already_claimed' }), clock)
  }, registryDelivery(async values => { posted.push(values[0]) }), clock)
  t.after(() => registry.dispose())
  const promises = []
  for (let n = 0; n < 64; n++) promises.push(registry.executeCreate(registryCommand(n)))
  assert.throws(() => registry.executeCreate(registryCommand(64)), /delivery_capacity/)
  await Promise.all(promises); await tick()
  assert.equal(factories, 2); assert.equal(posted.length, 64)
  assert.equal(posted.filter(x => x.reason === 'runtime_busy').length, 62)
  assert.throws(() => registry.executeCreate(registryCommand(64)), /delivery_capacity/, 'ACK cannot evict an unretired record')
  assert.equal(registry.executeCreate(registryCommand(2)), promises[2]); assert.equal(posted.length, 64)
  assert.equal(clock.pending(), 0)
})

test('registry concurrent asks retain distinct pending delivery before any reentrant claim', async t => {
  const clock = stopClock(), releases = [], posted = [], inputs = [registryCommand(0), registryCommand(1)]
  let registry, reentrant
  registry = new ReplyChildren(registryOwner(), (command, binding) => registryAdmission(binding, () => {
    reentrant = registry.executeCreate(command)
    return new Promise(resolve => { releases.push(resolve) })
  }, clock), registryDelivery(async values => { posted.push(values[0]) }), clock)
  t.after(() => registry.dispose())
  const pending = inputs.map(input => registry.executeCreate(input)); await tick()
  assert.equal(releases.length, 2); assert.equal(reentrant, pending[1])
  for (const input of inputs) assert.equal(registry.deliveryStatus(registryControl(input, 'inspect'))[0].enqueued, false)
  releases[1]({ result: 'refused', code: 'already_claimed' }); await pending[1]; await tick()
  assert.equal(posted.length, 1); assert.equal(posted[0].commandId, inputs[1].commandId)
  releases[0]({ result: 'refused', code: 'already_claimed' }); await pending[0]; await tick()
  assert.equal(posted.length, 2); assert.equal(posted[1].commandId, inputs[0].commandId)
  assert.equal(clock.pending(), 0)
})

test('registry disposal before admission publishes no receipt and disposes retained waiters after dispatch', async t => {
  for (const before of [true, false]) {
    const clock = stopClock(), create = registryChildCommand()
    let posts = 0, resolve
    const registry = new ReplyChildren(registryOwner(), null, registryDelivery(() => {
      posts++; return new Promise(r => { resolve = r })
    }), clock)
    t.after(() => registry.dispose())
    const pending = registry.executeCreate(create)
    if (!before) { await pending; await tick() }
    registry.dispose(); await pending; await tick()
    assert.equal(posts, before ? 0 : 1)
    const status = registry.deliveryStatus(registryControl(create, 'inspect'))[0]
    assert.equal(status.disposed, true)
    if (!before) {
      assert.equal(status.acknowledgement.disposed, true)
      assert.equal(status.acknowledgement.inFlight, true)
      resolve(); await tick()
    }
    assert.equal(registry.executeCreate(create), pending)
    assert.throws(() => registry.executeCreate(registryCommand(1)), /delivery_unavailable/)
    assert.equal(clock.pending(), 0)
  }
})

test('registry delivery configuration must be finite and present before admission', () => {
  const create = registryChildCommand()
  const registry = new ReplyChildren(registryOwner(), () => assert.fail('no factory'))
  assert.throws(() => registry.executeCreate(create), /delivery_unavailable/)
  for (const override of [{ waitMs: 0 }, { requestWaitMs: 0 }, { maxAttempts: 9 }, { waitMs: Infinity }]) {
    assert.throws(() => new ReplyChildren(registryOwner(), null, registryDelivery(async () => {}, override)), /delivery_invalid/)
  }
  registry.dispose()
})


test('registry controls share the immutable create command namespace before fencing', async t => {
  const create = registryCommand(), clock = stopClock()
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding,
    async () => ({ result: 'refused', code: 'already_claimed' }), clock))
  t.after(() => registry.dispose())
  await registry.createReply(create)
  for (const kind of ['stop', 'inspect']) {
    assert.throws(() => registry[kind === 'stop' ? 'stopReply' : 'inspectReply']({
      ...registryControl(create, kind), commandId: create.commandId }), /conflict/)
  }
  const stop = registryControl(create, 'stop', 4)
  registry.stopReply(stop)
  assert.throws(() => registry.stopReply({ ...stop, binding: { ...stop.binding, authorityEpoch: 5 } }), /conflict/)
  assert.throws(() => registry.inspectReply({ ...stop, kind: 'inspect' }), /conflict/)
  assert.throws(() => registry.createReply({ ...registryCommand(1), commandId: stop.commandId }), /conflict/)
  assert.equal(registry.stopReply(structuredClone(stop)), null)
  assert.equal(registry.inspectReply(registryControl(create, 'inspect', 4)).authorityEpoch, 4)
})

test('registry inspection fences stale epochs without consuming Stop capacity', async t => {
  const create = registryCommand(), clock = stopClock()
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding,
    async () => ({ result: 'refused', code: 'already_claimed' }), clock))
  t.after(() => registry.dispose())
  await registry.createReply(create)
  const inspect = registryControl(create, 'inspect', 4)
  assert.equal(registry.inspectReply(inspect).authorityEpoch, 4)
  const stale = { ...inspect, commandId: '00000000-0000-0000-0000-000000000999', binding: { ...inspect.binding, authorityEpoch: 3 } }
  assert.throws(() => registry.inspectReply(stale), /stale_epoch/)
  assert.throws(() => registry.stopReply({ ...stale, kind: 'stop' }), /stale_epoch/)
  for (let i = 1; i < 64; i++) registry.inspectReply({ ...inspect,
    commandId: `00000000-0000-0000-0000-${String(1000 + i).padStart(12, '0')}` })
  assert.throws(() => registry.inspectReply({ ...inspect, commandId: '00000000-0000-0000-0000-000000009999' }), /control_capacity/)
  assert.equal(registry.stopReply(registryControl(create, 'stop', 4)), null)
  assert.equal(registry.inspectReply(inspect).state, 'stopped')
})

test('registry checks delivery-only create identities and unknown controls claim no ownership', async t => {
  const create = registryCommand(), registry = new ReplyChildren(registryOwner(), null, registryDelivery(async () => {}))
  t.after(() => registry.dispose())
  await registry.executeCreate(create)
  assert.throws(() => registry.stopReply({ ...registryControl(create), commandId: create.commandId }), /conflict/)
  const unknown = registryControl(create)
  assert.equal(registry.stopReply(unknown), null)
  assert.equal(registry.inspectReply(registryControl(create, 'inspect')), null)
  assert.equal(registry.deliveryStatus(registryControl(create, 'inspect')).length, 1)
})

function stopVerification(check, overrides = {}) {
  return { repliesDir: '/synthetic/replies', currentRoot: '/synthetic/replies/gen-current', waitMs: 10, check, ...overrides }
}
function checkResult(scope, state = 'absent', changes = {}) {
  return { code: 0, signal: null, stdout: JSON.stringify({ attemptId: scope.attemptId, root: scope.currentRoot,
    state, reason: null, ...changes }) + '\n' }
}
async function stopProofFixture(t, check, overrides = {}) {
  const clock = stopClock(), create = registryCommand()
  const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding,
    async () => ({ result: 'refused', code: 'already_claimed' }), clock), null, clock, stopVerification(check, overrides))
  t.after(() => registry.dispose())
  const admission = registry.createReply(create)
  registry.stopReply(registryControl(create, 'stop', 2)) // Proven local preclaim cancellation, not refused/lost-claim ownership.
  await admission
  return { registry, clock, create, stop: registryControl(create, 'stop', 2) }
}

test('Stop proof parses fresh exact-root checker output and never caches a checked answer', async t => {
  const scopes = []
  const f = await stopProofFixture(t, async scope => { scopes.push(scope); return checkResult(scope) })
  const first = await f.registry.stopReceipt(f.stop)
  assert.equal(first.stage, 'checked'); assert.equal(first.commandId, f.stop.commandId)
  assert.equal(first.attemptId, f.create.binding.attemptId); assert.equal(first.nativeSessionId, null)
  assert.equal((await f.registry.stopReceipt(structuredClone(f.stop))).stage, 'checked')
  assert.equal(scopes.length, 2); assert.ok(scopes.every(Object.isFrozen))
  assert.deepEqual(scopes[0], { ...registryOwner(), repliesDir: '/synthetic/replies', currentRoot: '/synthetic/replies/gen-current', attemptId: f.create.binding.attemptId })
  assert.equal(f.clock.pending(), 0)
})

test('Stop proof refuses invalid, incomplete, foreign, contradictory and unsuccessful check reports', async t => {
  const mutations = [
    (r, s) => ({ ...r, code: 74 }), (r, s) => ({ ...r, signal: 'SIGKILL' }),
    (r, s) => ({ ...r, extra: true }), (r, s) => ({ ...r, stdout: r.stdout.trimEnd() }),
    (r, s) => ({ ...r, stdout: '' }), (r, s) => ({ ...r, stdout: '{\n' }),
    (r, s) => checkResult(s, 'unresolved'), (r, s) => checkResult(s, 'unsettled'), (r, s) => checkResult(s, 'stopped'),
    (r, s) => checkResult(s, 'gone', { attemptId: apiAttempt }),
    (r, s) => checkResult(s, 'gone', { root: '/foreign/gen-current' }),
    (r, s) => checkResult(s, 'gone', { root: '/synthetic/replies/gen-a/../gen-current' }),
    (r, s) => checkResult(s, 'gone', { extra: true }),
    (r, s) => ({ ...r, stdout: r.stdout + r.stdout }),
    (r, s) => checkResult(s, 'absent', { root: '/synthetic/replies/sealed-old' }),
    (r, s) => ({ ...r, stdout: checkResult(s, 'gone').stdout + checkResult(s, 'empty', { root: '/synthetic/replies/sealed-old' }).stdout }),
    (r, s) => ({ ...r, stdout: 'x'.repeat(65_537) + '\n' }),
  ]
  for (const mutate of mutations) {
    const f = await stopProofFixture(t, async scope => mutate(checkResult(scope), scope))
    assert.equal((await f.registry.stopReceipt(f.stop)).stage, 'outcome_unknown')
    assert.equal(f.clock.pending(), 0)
  }
})

test('Stop proof timeout retains checker I/O without overlapping replay or accepting its late result', async t => {
  let release, scope, signal, calls = 0
  const f = await stopProofFixture(t, async (input, cancel) => { calls++; scope = input; signal = cancel;
    if (calls > 1) return checkResult(input)
    return new Promise(resolve => { release = resolve })
  })
  const first = f.registry.stopReceipt(f.stop); await tick()
  f.clock.advance(10)
  assert.equal((await first).stage, 'outcome_unknown'); assert.equal(signal.aborted, true)
  assert.equal((await f.registry.stopReceipt(f.stop)).stage, 'outcome_unknown'); assert.equal(calls, 1)
  release(checkResult(scope)); await tick()
  assert.equal((await f.registry.stopReceipt(f.stop)).stage, 'checked'); assert.equal(calls, 2)
  assert.equal(f.clock.pending(), 0)
})

test('Stop proof rejects disposal and epoch supersession while the checker is pending', async t => {
  for (const dispose of [true, false]) {
    let release, scope
    const f = await stopProofFixture(t, async input => { scope = input; return new Promise(resolve => { release = resolve }) })
    const pending = f.registry.stopReceipt(f.stop); await tick()
    const rejected = assert.rejects(pending, dispose ? /disposed/ : /stale_epoch/)
    if (dispose) f.registry.dispose()
    else f.registry.inspectReply(registryControl(f.create, 'inspect', 3))
    release(checkResult(scope)); await rejected
    assert.equal(f.clock.pending(), 0)
  }
})

test('Stop proof never upgrades an unreaped child, and replay rereads its later actual exit', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand(), scopes = []
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f), null, f.clock,
    stopVerification(async scope => { scopes.push(scope); return checkResult(scope) }))
  t.after(() => registry.dispose())
  await registry.createReply(create)
  const stop = registryControl(create, 'stop', 4), first = registry.stopReceipt(stop)
  await tick(); f.clock.advance(stopBounds.killMs + stopBounds.exitWaitMs + stopBounds.settleWaitMs); await tick()
  assert.equal((await first).stage, 'outcome_unknown')
  const deadline = f.child.inspect().process.settlementDeadline, controls = [...f.controls]
  await endReceiptChild(f)
  const next = await registry.stopReceipt(stop)
  assert.equal(next.stage, 'checked'); assert.equal(next.nativeSessionId, `sophia-${create.binding.attemptId}`)
  assert.equal(scopes.length, 2); assert.equal(f.child.inspect().process.settlementDeadline, deadline)
  assert.deepEqual(f.controls, controls)
})

test('Stop receipt waits original accounting barrier before check and rechecks spawn fence afterwards', async t => {
  const f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  let checks = 0
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f), null, f.clock,
    stopVerification(async scope => { checks++; return checkResult(scope, 'gone') }))
  t.after(() => registry.dispose())
  await registry.createReply(create)
  const pending = registry.stopReceipt(registryControl(create, 'stop', 4)); await tick()
  assert.equal(checks, 0)
  await endReceiptChild(f)
  assert.equal((await pending).stage, 'checked'); assert.equal(checks, 1)
})

test('Stop proof refuses unknown recovery ownership and unavailable or invalid verifier configuration', async t => {
  const registry = new ReplyChildren(registryOwner(), null)
  t.after(() => registry.dispose())
  await assert.rejects(registry.stopReceipt(registryControl(registryCommand())), /recovery_required/)
  for (const override of [{ repliesDir: 'relative' }, { currentRoot: '/foreign/gen-current' }, { currentRoot: '/synthetic/replies/sealed-old' }, { waitMs: 0 }]) {
    assert.throws(() => new ReplyChildren(registryOwner(), null, null, stopClock(), stopVerification(async () => {}, override)), /verification_invalid/)
  }
  const f = await stopProofFixture(t, async () => { throw new Error('synthetic check failure') })
  assert.equal((await f.registry.stopReceipt(f.stop)).stage, 'outcome_unknown')
})


test('Stop candidate refuses an unresolved original accounting barrier before its deadline', async t => {
  let release, checks = 0
  t.after(() => release?.())
  const f = await childFixture(t, { noGo: true, settle: async body => new Promise(resolve => { release = () => resolve(settleReceipt(body)) }) })
  const create = registryChildCommand()
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f), null, f.clock,
    stopVerification(async scope => { checks++; return checkResult(scope, 'gone') }))
  t.after(() => registry.dispose())
  await registry.createReply(create)
  await reserveFirst(f.pipe); f.pipe.receive(settleRecord); await until(() => release)
  const pending = registry.stopReceipt(registryControl(create, 'stop', 4))
  const rejected = assert.rejects(pending, /settlement_unconfirmed/)
  await tick(); f.launcher.emit('exit', 0, null); await tick()
  const deadline = f.child.inspect().process.settlementDeadline
  assert.ok(f.clock.now() < deadline)
  f.child.dispose()
  await rejected
  assert.equal(checks, 0, 'failed accounting cannot be replaced by a successful physical report')
  release(); await tick()
  await assert.rejects(registry.stopReceipt(registryControl(create, 'stop', 4)), /settlement_unconfirmed/)
})

test('Stop candidate requires accounting recovery after refused or lost claims without an owned child', async t => {
  for (const lost of [false, true]) {
    const clock = stopClock(), create = registryCommand()
    let checks = 0
    const registry = new ReplyChildren(registryOwner(), (_command, binding) => registryAdmission(binding,
      async () => { if (lost) throw new Error('synthetic lost claim'); return { result: 'refused', code: 'already_claimed' } }, clock),
      null, clock, stopVerification(async scope => { checks++; return checkResult(scope) }))
    t.after(() => registry.dispose())
    await registry.createReply(create)
    await assert.rejects(registry.stopReceipt(registryControl(create, 'stop', 2)), /recovery_required/)
    assert.equal(checks, 0)
  }
})

function stopDeliveryFixture(t, check, receipts, delivery = {}) {
  const clock = stopClock(), create = registryCommand(), stop = registryControl(create, 'stop', 2)
  const registry = new ReplyChildren(registryOwner(), () => assert.fail('queued Stop must fence factory'),
    registryDelivery(receipts, delivery), clock, stopVerification(check))
  t.after(() => registry.dispose())
  const admission = registry.createReply(create)
  return { registry, clock, create, stop, admission, inspect: registryControl(create, 'inspect', 2) }
}

test('Stop delivery joins active checks, retains before reentrant POST and reevaluates later without resending', async t => {
  let release, input, posts = 0, checks = 0, reentrant
  const f = stopDeliveryFixture(t, async scope => { checks++; input = scope;
    if (checks === 1) return new Promise(resolve => { release = resolve })
    return checkResult(scope)
  }, async () => { posts++; reentrant = f.registry.executeStop(f.stop) })
  const first = f.registry.executeStop(f.stop)
  assert.equal(f.registry.executeStop(structuredClone(f.stop)), first)
  await tick(); release(checkResult(input))
  assert.equal(await first, 'retained'); await tick()
  assert.equal(reentrant, first); assert.equal(posts, 1); assert.equal(checks, 1)
  assert.equal(await f.registry.executeStop(f.stop), 'retained'); await tick()
  assert.equal(checks, 2); assert.equal(posts, 1)
  const status = f.registry.stopDeliveryStatus(f.inspect)[0]
  assert.equal(status.lastStage, 'checked'); assert.equal(status.evaluating, false)
  assert.equal(status.stages[0].acknowledgement.acknowledged, true)
  assert.equal(f.clock.pending(), 0)
})

test('Stop delivery retains unknown and checked separately while a prior HTTP acknowledgement is unresolved', async t => {
  let checks = 0, release
  const posted = []
  const f = stopDeliveryFixture(t, async scope => checkResult(scope, ++checks === 1 ? 'unresolved' : 'gone'), async values => {
    posted.push(values[0]); if (values[0].stage === 'outcome_unknown') return new Promise(resolve => { release = resolve })
  })
  assert.equal(await f.registry.executeStop(f.stop), 'retained'); await tick()
  f.clock.advance(10); await tick()
  assert.equal(await f.registry.executeStop(f.stop), 'retained'); await tick()
  const status = f.registry.stopDeliveryStatus(f.inspect)[0]
  assert.deepEqual(posted.map(x => x.stage), ['outcome_unknown', 'checked'])
  assert.equal(status.stages[0].acknowledgement.acknowledged, false)
  assert.equal(status.stages[0].acknowledgement.inFlight, true)
  assert.equal(status.stages[1].acknowledgement.acknowledged, true)
  assert.equal(await f.registry.executeStop(f.stop), 'retained'); assert.equal(posted.length, 2)
  release(); await tick()
  assert.equal(f.registry.stopDeliveryStatus(f.inspect)[0].stages[0].acknowledgement.acknowledged, true)
})

test('Stop delivery never resets an exhausted same-stage sender on fresh proof replay', async t => {
  let checks = 0, posts = 0
  const f = stopDeliveryFixture(t, async scope => { checks++; return checkResult(scope) },
    async () => { posts++; throw new TypeError('synthetic lost response') }, { maxAttempts: 1 })
  await f.registry.executeStop(f.stop); await tick()
  assert.equal(posts, 1)
  f.clock.advance(100)
  await f.registry.executeStop(f.stop); await tick()
  assert.equal(checks, 2); assert.equal(posts, 1)
  const status = f.registry.stopDeliveryStatus(f.inspect)[0]
  assert.equal(status.stages[0].acknowledgement.acknowledged, false)
  assert.equal(status.stages[0].acknowledgement.attempts, 1)
  assert.equal(f.clock.pending(), 0)
})

test('Stop delivery emits no terminal fallback when its original accounting barrier fails', async t => {
  let release, checks = 0, posts = 0
  t.after(() => release?.())
  const f = await childFixture(t, { noGo: true, settle: async body => new Promise(resolve => { release = () => resolve(settleReceipt(body)) }) })
  const create = registryChildCommand(), stop = registryControl(create, 'stop', 4)
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f), registryDelivery(async () => { posts++ }), f.clock,
    stopVerification(async scope => { checks++; return checkResult(scope) }))
  t.after(() => registry.dispose())
  await registry.createReply(create)
  await reserveFirst(f.pipe); f.pipe.receive(settleRecord); await until(() => release)
  const pending = registry.executeStop(stop); await tick()
  f.launcher.emit('exit', 0, null); await tick(); f.child.dispose()
  assert.equal(await pending, 'unresolved')
  assert.equal(await registry.executeStop(stop), 'unresolved')
  assert.equal(checks, 0); assert.equal(posts, 0)
  const status = registry.stopDeliveryStatus(registryControl(create, 'inspect', 4))[0]
  assert.equal(status.unresolved, true); assert.equal(status.lastStage, null); assert.equal(status.stages.length, 0)
  release(); await tick()
})

test('Stop delivery missing transport still fences admission and unknown ownership posts nothing', async t => {
  const create = registryCommand(), stop = registryControl(create, 'stop', 2)
  let calls = 0
  const registry = new ReplyChildren(registryOwner(), () => { calls++; assert.fail('no factory') })
  t.after(() => registry.dispose())
  const admission = registry.createReply(create)
  assert.equal(await registry.executeStop(stop), 'unresolved'); assert.equal(await admission, 'stopped')
  assert.equal(calls, 0)
  assert.throws(() => registry.executeStop(registryControl(registryCommand(1), 'stop', 2)), /conflict/)
  assert.equal(await registry.executeStop({ ...registryControl(registryCommand(1), 'stop', 2),
    commandId: '00000000-0000-0000-0000-000000000999' }), 'unresolved')
  assert.equal(registry.stopDeliveryStatus(registryControl(create, 'inspect', 2))[0].stages.length, 0)
  assert.throws(() => registry.executeStop({ ...stop, binding: { ...stop.binding, authorityEpoch: 3 } }), /conflict/)
})

test('Stop delivery disposal suppresses pending checks while retaining an earlier in-flight ACK fact', async t => {
  let releaseCheck, input, posts = 0
  const f = stopDeliveryFixture(t, async scope => { input = scope; return new Promise(resolve => { releaseCheck = resolve }) }, async () => { posts++ })
  const pending = f.registry.executeStop(f.stop); await tick(); f.registry.dispose()
  assert.equal(await pending, 'unresolved'); releaseCheck(checkResult(input)); await tick(); assert.equal(posts, 0)
  let releasePost
  const g = stopDeliveryFixture(t, async scope => checkResult(scope), async () => new Promise(resolve => { releasePost = resolve }))
  await g.registry.executeStop(g.stop); await tick(); g.registry.dispose()
  assert.equal(await g.registry.executeStop(g.stop), 'unresolved')
  releasePost(); await tick()
  const status = g.registry.stopDeliveryStatus(g.inspect)[0]
  assert.equal(status.disposed, true); assert.equal(status.stages[0].acknowledgement.acknowledged, true)
  assert.equal(f.clock.pending(), 0); assert.equal(g.clock.pending(), 0)
})

async function completedChild(f) {
  f.pipe.receive(obs({ ...answer(1, 'complete synthetic answer'), ...f.identity }))
  f.pipe.receive(obs({ ...f.identity, nativeSeq: 2, durable: true, type: 'turn/end', data: { reason: { kind: 'completed' } } }))
  await tick()
  f.launcher.emit('exit', 0, null)
  f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
}

test('child terminal completion passively settles without fencing a blocked full answer capture', async t => {
  const held = deferred()
  const f = await childFixture(t, { observe: item => item.type === 'turn/end' ? held.promise : undefined })
  await reserveFirst(f.pipe)
  const pending = f.child.terminal()
  assert.equal(f.child.terminal(), pending)
  await completedChild(f)
  const result = await deliverySettled(pending)
  assert.equal(result.outcome, 'completed')
  assert.deepEqual(result.evidence.settlements, { unconfirmed: [] })
  assert.equal(f.pipe.written.some(line => line.t === 'stop'), false)
  assert.deepEqual(f.controls, [])
  assert.equal(f.observations[0].data.text, 'complete synthetic answer')
  assert.equal(f.observations.some(item => item.type === 'turn/end'), true)
  assert.notEqual(f.child.inspect().relay.state, 'closed')
  held.resolve()
  await until(() => f.observations.some(item => item.type === 'turn/end'))
  f.clock.advance(500)
  assert.equal((await f.child.terminal()).outcome, 'completed')
  assert.equal(f.pipe.written.some(line => line.t === 'stop'), false)
})

test('child terminal completion holds unsettled usage to the original exit-derived deadline', async t => {
  const f = await childFixture(t, { settle: () => new Promise(() => {}) })
  await reserveFirst(f.pipe)
  f.pipe.receive(settleRecord)
  await until(() => f.settlements.length === 1)
  const pending = f.child.terminal()
  await completedChild(f)
  assert.equal(await Promise.race([pending.then(() => 'done'), tick().then(() => 'waiting')]), 'waiting')
  f.clock.advance(11)
  const result = await deliverySettled(pending)
  assert.equal(result.outcome, 'completed')
  assert.deepEqual(result.evidence.settlements, { unconfirmed: [1] })
  assert.equal(result.evidence.process.settlementDeadline, 11)
  assert.equal(f.pipe.written.some(line => line.t === 'stop'), false)
})

test('child terminal deadline latches timeout before later clean exit and never resets on replay', async t => {
  const f = await childFixture(t)
  f.clock.advance(100)
  await tick()
  const pending = f.child.terminal()
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(10)
  const result = await deliverySettled(pending)
  assert.equal(result.outcome, 'timeout')
  assert.equal(result.evidence.process.stopStartedAt, 100)
  assert.equal(result.evidence.process.settlementDeadline, 111)
  assert.equal(f.child.terminal(), pending)
})

test('child terminal exit with held fd3 is bounded without manufacturing EOF', async t => {
  const f = await childFixture(t)
  const pending = f.child.terminal()
  f.launcher.emit('exit', 0, null)
  f.clock.advance(10); await tick()
  assert.equal(await Promise.race([pending.then(() => 'done'), tick().then(() => 'waiting')]), 'waiting')
  f.clock.advance(1)
  const result = await deliverySettled(pending)
  assert.equal(result.outcome, 'timeout')
  assert.equal(result.evidence.relay.eof, false)
  assert.equal(result.evidence.process.settlementDeadline, 11)
  assert.equal(f.clock.pending(), 0)
})

test('child terminal malformed output retains its first cause and original settlement barrier', async t => {
  const f = await childFixture(t)
  f.pipe.receive({ t: 'unexpected', content: 'private-terminal-canary' })
  await until(() => f.fences.length === 1)
  const pending = f.child.terminal()
  f.launcher.emit('exit', 0, null)
  await tick(); f.clock.advance(11)
  const result = await deliverySettled(pending)
  assert.equal(result.outcome, 'relay_invalid')
  assert.doesNotMatch(JSON.stringify(result), /private-terminal-canary/)
  assert.equal(result.evidence.relay.eof, false)
})

test('child terminal unfinished EOF and launcher errors preserve child_exited', async t => {
  for (const error of [false, true]) {
    const f = await childFixture(t)
    const pending = f.child.terminal()
    if (error) f.launcher.emit('error', new Error('synthetic failure'))
    f.launcher.emit('exit', 0, null); f.pipe.push(null)
    await until(() => f.child.inspect().relay.eof)
    f.clock.advance(11)
    assert.equal((await deliverySettled(pending)).outcome, 'child_exited')
  }
})

test('child terminal explicit Stop and disposal do not manufacture autonomous failure', async t => {
  const f = await childFixture(t)
  const terminal = f.child.terminal(), stopped = f.child.stopForReceipt()
  assert.equal((await deliverySettled(terminal)).outcome, 'stopped')
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  f.clock.advance(11); await deliverySettled(stopped)
  assert.equal((await f.child.terminal()).outcome, 'stopped')
  const disposed = await childFixture(t)
  const rejected = assert.rejects(disposed.child.terminal(), /reply_child_disposed/)
  disposed.child.dispose(); await rejected
  assert.equal(disposed.clock.pending(), 0)
})

test('child terminal disposal during a failed settlement barrier stays unresolved', async t => {
  const f = await childFixture(t, { settle: () => new Promise(() => {}) })
  await reserveFirst(f.pipe)
  f.pipe.receive(settleRecord); await until(() => f.settlements.length === 1)
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  const rejected = assert.rejects(f.child.terminal(), /reply_(child|settlement)_disposed/)
  await tick(); f.child.dispose(); await rejected
})

test('child terminal late launcher, control and fd3 errors preserve completed capture', async t => {
  for (const target of ['launcher', 'control', 'fd3']) {
    const held = deferred()
    const f = await childFixture(t, { observe: item => item.type === 'turn/end' ? held.promise : undefined })
    await reserveFirst(f.pipe)
    const terminal = f.child.terminal()
    await completedChild(f)
    assert.equal((await deliverySettled(terminal)).outcome, 'completed')
    await until(() => f.observations.some(item => item.type === 'turn/end'))
    const emitter = target === 'launcher' ? f.launcher : target === 'control' ? f.launcher.stdin : f.pipe
    emitter.emit('error', new Error('late synthetic diagnostic'))
    await tick()
    assert.equal(f.child.inspect().relay.state, 'draining', target)
    assert.equal(f.pipe.written.some(line => line.t === 'stop'), false, target)
    assert.equal(f.observations[0].data.text, 'complete synthetic answer')
    held.resolve()
    await until(() => f.child.inspect().relay.state === 'closed')
  }
})

test('child terminal fd3 error before completed classification still fences an intact answer', async t => {
  const f = await childFixture(t)
  await reserveFirst(f.pipe)
  f.pipe.receive(obs({ ...answer(1), ...f.identity }))
  await until(() => f.observations.length === 1)
  f.pipe.emit('error', new Error('synthetic incomplete tail'))
  await until(() => f.fences.length === 1)
  const terminal = f.child.terminal()
  f.launcher.emit('exit', 0, null)
  await tick(); f.clock.advance(11)
  assert.equal((await deliverySettled(terminal)).outcome, 'relay_invalid')
  assert.equal(f.pipe.written.some(line => line.t === 'stop'), true)
})

async function terminalExit(f) {
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  await tick()
}

async function terminalRegistry(t, operation, overrides = {}) {
  const f = await childFixture(t, { noGo: true, ...overrides.child }), create = registryChildCommand()
  const admission = receiptAdmission(f), posts = []
  const registry = new ReplyChildren(registryOwner(), () => admission, registryDelivery(async values => {
    posts.push(values[0]); await operation?.(values)
  }, overrides.delivery), f.clock, overrides.verification ?? null)
  t.after(() => registry.dispose())
  const execution = registry.executeCreate(create)
  await deliverySettled(execution); await until(() => posts.length === 1)
  const status = () => registry.deliveryStatus(registryControl(create, 'inspect'))[0]
  return { ...f, create, admission, registry, posts, execution, status }
}

test('terminal receipt delivery waits actual delivered ACK and retains both immutable stages on replay', async t => {
  const delivered = deferred(), failed = deferred()
  const f = await terminalRegistry(t, values => values[0].stage === 'delivered' ? delivered.promise : failed.promise)
  await terminalExit(f)
  await until(() => f.status().terminal.acknowledgement !== null)
  assert.deepEqual(f.posts.map(item => item.stage), ['delivered'])
  assert.equal(f.status().acknowledgement.acknowledged, false)
  assert.equal(f.status().terminal.acknowledgement.attempts, 0)
  delivered.resolve()
  await until(() => f.posts.length === 2)
  assert.deepEqual(f.posts.map(item => item.stage), ['delivered', 'failed'])
  assert.equal(f.posts[1].reason, 'child_exited')
  assert.equal(f.posts[1].commandId, f.create.commandId)
  assert.equal(f.posts[1].attemptId, f.create.binding.attemptId)
  assert.equal(f.posts[1].nativeSessionId, `sophia-${f.create.binding.attemptId}`)
  assert.equal(f.status().acknowledgement.acknowledged, true)
  assert.equal(f.status().terminal.acknowledgement.acknowledged, false)
  assert.equal(f.registry.executeCreate(f.create), f.execution)
  failed.resolve(); await until(() => f.status().terminal.acknowledgement.acknowledged)
  const candidate = await f.admission.terminalReceipt()
  assert.equal(await f.admission.terminalReceipt(), candidate)
  await tick(); assert.equal(f.posts.length, 2)
})

test('terminal completed capture and explicit Stop never post an autonomous failed stage', async t => {
  const completed = await terminalRegistry(t)
  await reserveFirst(completed.pipe); await completedChild(completed)
  await until(() => completed.status().terminal.state === 'no_failure')
  assert.deepEqual(completed.posts.map(item => item.stage), ['delivered'])
  assert.equal(await completed.admission.terminalReceipt(), null)
  const stopped = await terminalRegistry(t)
  const cleanup = stopped.registry.stopReply(registryControl(stopped.create, 'stop', 4))
  await terminalExit(stopped); stopped.clock.advance(10); await deliverySettled(cleanup)
  assert.deepEqual(stopped.posts.map(item => item.stage), ['delivered'])
  assert.equal(await stopped.admission.terminalReceipt(), null)
})

test('terminal failure waits accounting and disposal never replaces it with a generic failure', async t => {
  const f = await terminalRegistry(t, undefined, { child: { settle: () => new Promise(() => {}) } })
  await reserveFirst(f.pipe); f.pipe.receive(settleRecord)
  await until(() => f.settlements.length === 1)
  f.launcher.emit('exit', 0, null); f.pipe.push(null)
  await until(() => f.child.inspect().relay.eof)
  await tick(); assert.deepEqual(f.posts.map(item => item.stage), ['delivered'])
  f.child.dispose()
  await until(() => f.status().terminal.state === 'unresolved')
  assert.equal(f.status().terminal.acknowledgement, null)
  assert.equal(f.posts.length, 1)
})

test('terminal Stop, disposal and newer epoch suppress a failed sender waiting for delivered ACK', async t => {
  for (const mode of ['stop', 'dispose', 'epoch']) {
    const held = deferred(), f = await terminalRegistry(t, () => held.promise)
    await terminalExit(f)
    await until(() => f.status().terminal.acknowledgement !== null)
    if (mode === 'stop') f.registry.stopReply(registryControl(f.create, 'stop', 4))
    else if (mode === 'dispose') f.registry.dispose()
    else f.registry.inspectReply({ ...registryControl(f.create, 'inspect', 4), commandId: '00000000-0000-0000-0000-000000000303' })
    held.resolve(); await tick(); await tick()
    assert.equal(f.posts.length, 1, mode)
    assert.equal(f.status().acknowledgement.acknowledged, true, 'late historical ACK is retained')
    assert.equal(f.status().terminal.acknowledgement.attempts, 0, mode)
    assert.equal(f.status().terminal.acknowledgement.disposed, true, mode)
  }
})

test('terminal lost delivered ACK does not reset its failed sender budget after a late acknowledgement', async t => {
  const held = deferred(), f = await terminalRegistry(t, () => held.promise)
  await terminalExit(f)
  await until(() => f.status().terminal.acknowledgement !== null)
  f.clock.advance(30); await until(() => f.status().terminal.state === 'unresolved')
  held.resolve(); await tick()
  assert.equal(f.status().acknowledgement.acknowledged, true)
  assert.equal(f.registry.executeCreate(f.create), f.execution)
  f.clock.advance(100); await tick()
  assert.equal(f.posts.length, 1)
  assert.equal(f.status().terminal.acknowledgement.attempts, 0)
  assert.equal(f.status().terminal.state, 'unresolved')
})

test('terminal failed delivery retries one immutable body and retains late ACK after Stop', async t => {
  const held = deferred(); let failures = 0
  const f = await terminalRegistry(t, values => {
    if (values[0].stage !== 'failed') return
    if (++failures === 1) throw new Error('synthetic response loss')
    return held.promise
  })
  await terminalExit(f); await until(() => failures === 1); await tick()
  f.clock.advance(2); await until(() => failures === 2)
  assert.equal(f.posts[1], f.posts[2])
  f.registry.stopReply(registryControl(f.create, 'stop', 4))
  held.resolve(); await tick(); await tick()
  assert.equal(f.status().terminal.acknowledgement.acknowledged, true)
  assert.equal(f.status().terminal.acknowledgement.disposed, true)
  assert.equal(f.status().terminal.state, 'cancelled')
  f.clock.advance(100); await tick(); assert.equal(failures, 2)
})

test('terminal autonomous timeout posts its fixed reason only after the original exit-tail bound', async t => {
  const f = await terminalRegistry(t)
  f.launcher.emit('exit', 0, null)
  f.clock.advance(10); await tick()
  assert.equal(f.posts.length, 1)
  f.clock.advance(1); await until(() => f.posts.length === 2)
  assert.equal(f.posts[1].stage, 'failed')
  assert.equal(f.posts[1].reason, 'timeout')
  assert.equal(f.child.inspect().relay.eof, false)
  assert.equal(f.child.inspect().process.settlementDeadline, 11)
})

test('terminal Stop cancels a retry delay without losing the original failed attempt record', async t => {
  let failures = 0
  const f = await terminalRegistry(t, values => {
    if (values[0].stage === 'failed') { failures++; throw new Error('synthetic lost reply') }
  })
  await terminalExit(f); await until(() => failures === 1); await tick()
  const before = f.status().terminal.acknowledgement
  f.registry.stopReply(registryControl(f.create, 'stop', 4))
  f.clock.advance(100); await tick()
  assert.equal(failures, 1)
  assert.equal(f.status().terminal.acknowledgement.attempts, before.attempts)
  assert.equal(f.status().terminal.acknowledgement.acknowledged, false)
  assert.equal(f.status().terminal.state, 'cancelled')
})

async function receiptProof(f, waitMs = 20, signal) {
  return f.registry.awaitReceiptAcknowledgements(registryControl(f.create, 'inspect', f.epoch ?? 3), waitMs, signal)
}

async function stoppedReceiptRegistry(t, check, operation) {
  const clock = stopClock(), create = registryChildCommand(), stop = registryControl(create, 'stop', 4)
  const registry = new ReplyChildren(registryOwner(), () => assert.fail('Stop before claim'), registryDelivery(operation), clock,
    stopVerification(check))
  t.after(() => registry.dispose())
  const primary = registry.executeCreate(create), stopping = registry.executeStop(stop)
  await deliverySettled(primary); await deliverySettled(stopping); await tick()
  return { registry, clock, create, stop, epoch: 4 }
}

test('receipt barrier waits both delivered and failed positive ACKs without starting another POST', async t => {
  const failed = deferred(), f = await terminalRegistry(t, values => values[0].stage === 'failed' ? failed.promise : undefined)
  await terminalExit(f); await until(() => f.posts.length === 2)
  const waiting = receiptProof(f)
  assert.equal(await Promise.race([waiting.then(() => 'done'), tick().then(() => 'waiting')]), 'waiting')
  failed.resolve(); await tick(); f.clock.advance(10)
  const proof = await deliverySettled(waiting)
  assert.deepEqual(proof, { result: 'acknowledged', count: 2 })
  assert.equal(f.registry.receiptAcknowledgementsCurrent(registryControl(f.create, 'inspect'), proof), true)
  assert.equal(f.posts.length, 2)
  assert.equal(f.registry.receiptAcknowledgementsCurrent(registryControl(f.create, 'inspect'), structuredClone(proof)), false)
})

test('receipt barrier keeps earlier unknown Stop ACK even when a newer checked stage is acknowledged', async t => {
  let checks = 0
  const unknown = deferred(), posts = []
  const f = await stoppedReceiptRegistry(t, async scope => checkResult(scope, ++checks === 1 ? 'unresolved' : 'gone'), async values => {
    posts.push(values[0]); if (values[0].stage === 'outcome_unknown') await unknown.promise
  })
  assert.equal(await f.registry.executeStop(f.stop), 'retained'); await tick()
  const waiting = receiptProof(f)
  assert.equal(await Promise.race([waiting.then(() => 'done'), tick().then(() => 'waiting')]), 'waiting')
  const before = posts.length
  f.clock.advance(10); await tick()
  unknown.resolve(); await tick(); f.clock.advance(1)
  // The observer's next tick is at its deadline; use a fresh bounded observation of the factual late ACK.
  const proof = await receiptProof(f)
  assert.deepEqual(proof, { result: 'acknowledged', count: 3 })
  assert.equal(posts.length, before)
  f.clock.advance(9); assert.equal((await deliverySettled(waiting)).result, 'unconfirmed')
})

test('receipt barrier token is invalid during and after a fresh Stop evaluation, even with the same stage sender', async t => {
  const held = deferred(); let checks = 0
  const f = await stoppedReceiptRegistry(t, async scope => {
    if (++checks === 2) await held.promise
    return checkResult(scope)
  }, async () => {})
  const inspect = registryControl(f.create, 'inspect', 4), proof = await receiptProof(f)
  assert.equal(f.registry.receiptAcknowledgementsCurrent(inspect, proof), true)
  const recheck = f.registry.executeStop(f.stop); await tick()
  assert.equal(f.registry.receiptAcknowledgementsCurrent(inspect, proof), false)
  held.resolve(); await deliverySettled(recheck)
  assert.equal(f.registry.receiptAcknowledgementsCurrent(inspect, proof), false)
  const fresh = await receiptProof(f)
  assert.equal(f.registry.receiptAcknowledgementsCurrent(inspect, fresh), true)
  f.registry.dispose()
  assert.equal(f.registry.receiptAcknowledgementsCurrent(inspect, fresh), false)
})

test('receipt barrier excludes only a Stop-cancelled terminal candidate that provably never attempted transport', async t => {
  const held = deferred(), f = await terminalRegistry(t, values => values[0].stage === 'delivered' ? held.promise : undefined)
  await terminalExit(f); await until(() => f.status().terminal.acknowledgement !== null)
  f.registry.stopReply(registryControl(f.create, 'stop', 4)); f.epoch = 4
  held.resolve(); await tick(); await tick()
  const proof = await receiptProof(f)
  assert.deepEqual(proof, { result: 'acknowledged', count: 1 }, 'cancelled candidate is excluded, never called acknowledged')
  assert.equal(f.status().terminal.acknowledgement.attempts, 0)
  assert.equal(f.status().terminal.acknowledgement.acknowledged, false)
  assert.equal(f.posts.length, 1)
})

test('receipt barrier cannot exclude attempted terminal HTTP even after Stop; late ACK is required', async t => {
  const held = deferred(), f = await terminalRegistry(t, values => values[0].stage === 'failed' ? held.promise : undefined)
  await terminalExit(f); await until(() => f.posts.length === 2)
  f.registry.stopReply(registryControl(f.create, 'stop', 4)); f.epoch = 4
  const waiting = receiptProof(f)
  f.clock.advance(20)
  assert.deepEqual(await deliverySettled(waiting), { result: 'unconfirmed', count: 0 })
  assert.equal(f.posts.length, 2)
  held.resolve(); await tick()
  const proof = await receiptProof(f)
  assert.deepEqual(proof, { result: 'acknowledged', count: 2 })
  assert.equal(f.posts.length, 2)
})

test('receipt barrier remains pending while terminal watcher can queue a future failure', async t => {
  const f = await terminalRegistry(t)
  const waiting = receiptProof(f)
  f.clock.advance(20)
  assert.equal((await deliverySettled(waiting)).result, 'unconfirmed')
  assert.equal(f.posts.length, 1)
  await terminalExit(f); await until(() => f.status().terminal.acknowledgement?.acknowledged)
  assert.equal((await receiptProof(f)).result, 'acknowledged')
})

test('receipt barrier is bounded, cancellable and scoped; unknown owner and disposed registry prove nothing', async t => {
  const f = await terminalRegistry(t, () => new Promise(() => {})), controller = new AbortController()
  const inspect = registryControl(f.create, 'inspect')
  const cancelled = receiptProof(f, 20, controller.signal)
  controller.abort(); assert.equal((await deliverySettled(cancelled)).result, 'unconfirmed')
  const disposed = receiptProof(f)
  f.registry.dispose(); assert.equal((await deliverySettled(disposed)).result, 'unconfirmed')
  assert.equal(f.clock.pending(), 0)
  for (const ms of [0, -1, Infinity, 120001]) await assert.rejects(f.registry.awaitReceiptAcknowledgements(inspect, ms), /wait_invalid/)
  for (const key of ['projectId', 'resourceId', 'runtimeUnitId']) await assert.rejects(f.registry.awaitReceiptAcknowledgements({
    ...inspect, binding: { ...inspect.binding, [key]: 'foreign' },
  }, 1), /invalid/)
  const clock = stopClock(), other = new ReplyChildren(registryOwner(), null, registryDelivery(async () => {}), clock)
  const missing = other.awaitReceiptAcknowledgements(inspect, 5)
  clock.advance(5)
  assert.equal((await deliverySettled(missing)).result, 'unconfirmed')
  other.dispose()
})

test('receipt barrier proof cannot cross registries or authority epochs with otherwise identical receipts', async t => {
  const a = await terminalRegistry(t), b = await terminalRegistry(t)
  for (const f of [a, b]) { await terminalExit(f); await until(() => f.status().terminal.acknowledgement?.acknowledged) }
  const proof = await receiptProof(a), inspect = registryControl(a.create, 'inspect')
  assert.equal(b.registry.receiptAcknowledgementsCurrent(inspect, proof), false)
  assert.equal(a.registry.receiptAcknowledgementsCurrent({ ...inspect, binding: { ...inspect.binding, authorityEpoch: 4 } }, proof), false)
  a.registry.inspectReply({ ...registryControl(a.create, 'inspect', 4), commandId: '00000000-0000-0000-0000-000000000333' })
  assert.equal(a.registry.receiptAcknowledgementsCurrent(inspect, proof), false)
})

test('receipt barrier never excludes an unposted cancelled terminal candidate without the registry Stop fence', async t => {
  const held = deferred(), f = await terminalRegistry(t, () => held.promise)
  await terminalExit(f); await until(() => f.status().terminal.acknowledgement !== null)
  f.registry.inspectReply({ ...registryControl(f.create, 'inspect', 4), commandId: '00000000-0000-0000-0000-000000000333' })
  held.resolve(); await tick(); await tick(); f.epoch = 4
  assert.equal(f.status().terminal.acknowledgement.disposed, true)
  assert.equal(f.status().terminal.acknowledgement.attempts, 0)
  const waiting = receiptProof(f)
  f.clock.advance(20)
  assert.equal((await deliverySettled(waiting)).result, 'unconfirmed')
  assert.equal(f.posts.length, 1)
})

function journalVerificationFixture(states = [{ ordinal: 1, state: 'settled', used: { calls: 1, tokens: 3, priceMicros: 0 } }]) {
  const f = recoveryFixture(recoveryFrames, { states })
  f.observations.add(`unit:${apiIdentity.nativeSessionId}:3`)
  f.observations.add(`unit:${apiIdentity.nativeSessionId}:4`)
  f.usage.add(`${apiIdentity.nativeSessionId}#3`)
  return f
}

test('journal preflight verifies complete inventory with only read and ACK capabilities and no replay', async () => {
  const f = journalVerificationFixture()
  let eof = false
  const read = f.operations.read
  const result = await verifyReplyJournal(recoveryOptions, {
    read: async signal => { const bytes = await read(signal); eof ||= bytes === null; return bytes },
    acknowledged: async body => {
      if (body.keys.observations.length) assert.equal(eof, true)
      return f.answer(body)
    },
  })
  assert.equal(result.journalComplete, true)
  assert.equal(result.accountingVerified, true)
  assert.equal(result.databaseBarrier, true)
  assert.equal(f.acks.length, 2, 'initial terminal scope check then one complete inventory check')
  assert.equal(f.acks[1].keys.observations.length, 2)
  assert.equal(f.acks[1].keys.usage.length, 1)
  assert.deepEqual(f.acks[1].keys.ordinals, [1])
  assert.equal(f.acks[1].keys.hasTurnEnd, true)
  assert.doesNotMatch(JSON.stringify(result), /private-answer|private synthetic prompt/)
})

test('journal preflight missing evidence stays false without replaying observation or settlement', async () => {
  for (const missing of ['observation', 'usage', 'reserved']) {
    const f = journalVerificationFixture(missing === 'reserved' ? [{ ordinal: 1, state: 'reserved' }] : undefined)
    if (missing === 'observation') f.observations.clear()
    if (missing === 'usage') f.usage.clear()
    const result = await verifyReplyJournal(recoveryOptions, f.operations)
    assert.equal(result.databaseBarrier, false, missing)
    assert.equal(f.seen.length, 0)
    assert.equal(f.settlements.length, 0)
    assert.equal(f.acks.length, 2)
  }
})

test('journal preflight requires every API predicate and rejects wrong reply, command and key evidence', async () => {
  for (const name of ['observations', 'usage', 'reservations', 'terminalWriter', 'createAnswered', 'capture', 'payloadScrubbed']) {
    const f = journalVerificationFixture()
    f.operations.acknowledged = async body => { const a = f.answer(body); a.predicates[name].met = false; return a }
    assert.equal((await verifyReplyJournal(recoveryOptions, f.operations)).databaseBarrier, false, name)
  }
  for (const change of [a => { a.predicates.terminalState.met = false },
    a => { a.predicates.terminalState.replyId = recoveryBinding.leaseId },
    a => { a.predicates.createAnswered.commandId = recoveryBinding.leaseId },
    a => { a.predicates.observations.keys.push('foreign') }]) {
    const f = journalVerificationFixture()
    f.operations.acknowledged = async body => { const a = f.answer(body); change(a); return a }
    await assert.rejects(verifyReplyJournal(recoveryOptions, f.operations), /reply_recovery_(ack_invalid|not_terminal)/)
  }
})

test('journal preflight rejects conflicting accounting and never trusts met alone', async () => {
  for (const states of [[], [{ ordinal: 1, state: 'settled', used: { calls: 1, tokens: 99, priceMicros: 0 } }],
    [{ ordinal: 2, state: 'settled', used: { calls: 1, tokens: 3, priceMicros: 0 } }], [{ ordinal: 1, state: 'released' }]]) {
    const f = journalVerificationFixture(states)
    assert.equal((await verifyReplyJournal(recoveryOptions, f.operations)).databaseBarrier, false)
  }
  const f = journalVerificationFixture([{ ordinal: 1, state: 'uncertain' }])
  assert.equal((await verifyReplyJournal(recoveryOptions, f.operations)).databaseBarrier, true)
  assert.equal(f.settlements.length, 0, 'recorded usage does not release uncertainty')
})

test('journal preflight torn tail, observation bound and denial never return a valid prefix', async () => {
  for (const mode of ['torn', 'bound', 'denied']) {
    const f = journalVerificationFixture()
    if (mode === 'torn') {
      let returned = false
      f.operations.read = async () => { if (returned) return null; returned = true; return Buffer.concat([f.bytes, Buffer.from('{')]) }
    }
    if (mode === 'denied') f.operations.acknowledged = async () => { throw new Error('private denial') }
    await assert.rejects(verifyReplyJournal({ ...recoveryOptions, maxObservations: mode === 'bound' ? 1 : 64 }, f.operations), /reply_recovery_(invalid|bound|unconfirmed)/)
    assert.equal(f.acks.length <= 1, true)
    assert.equal(f.seen.length + f.settlements.length, 0)
  }
})

test('journal preflight timeout and cancellation abort observation without retry or late proof', async () => {
  for (const mode of ['timeout', 'cancel']) {
    const f = journalVerificationFixture(), controller = new AbortController()
    let resolveRead, readSignal
    f.operations.read = signal => { readSignal = signal; return new Promise(resolve => { resolveRead = resolve }) }
    const pending = verifyReplyJournal({ ...recoveryOptions, timeoutMs: mode === 'timeout' ? 10 : 1000, signal: controller.signal }, f.operations)
    await tick(); assert.ok(readSignal)
    if (mode === 'cancel') controller.abort()
    await assert.rejects(pending, /reply_recovery_unconfirmed/)
    assert.equal(readSignal.aborted, true)
    resolveRead(f.bytes); await tick()
    assert.equal(f.acks.length, 1)
    assert.equal(f.seen.length + f.settlements.length, 0)
  }
})

class JournalMethodOperations {
  #fixture
  constructor(fixture) { this.#fixture = fixture }
  read(signal) { return this.#fixture.operations.read(signal) }
  acknowledged(body, signal) { return this.#fixture.operations.acknowledged(body, signal) }
  observe(value, signal) { return this.#fixture.operations.observe(value, signal) }
  settle(body, signal) { return this.#fixture.operations.settle(body, signal) }
}

test('journal methods preserve private receiver for read-only read and ACK', async () => {
  const f = journalVerificationFixture()
  let result
  await assert.doesNotReject(async () => { result = await verifyReplyJournal(recoveryOptions, new JournalMethodOperations(f)) })
  assert.equal(result.databaseBarrier, true)
  assert.equal(f.seen.length + f.settlements.length, 0)
})

test('journal methods preserve private receiver for recovered observations', async () => {
  const f = recoveryFixture(recoveryFrames, { states: [{ ordinal: 1, state: 'uncertain' }] })
  let result
  await assert.doesNotReject(async () => { result = await recoverReplyJournal(recoveryOptions, new JournalMethodOperations(f)) })
  assert.equal(result.databaseBarrier, true)
  assert.equal(f.seen.length, 2)
  assert.equal(f.settlements.length, 0)
})

test('journal methods preserve private receiver for original settlement replay', async () => {
  const f = journalVerificationFixture([{ ordinal: 1, state: 'reserved' }])
  let result
  await assert.doesNotReject(async () => { result = await recoverReplyJournal(recoveryOptions, new JournalMethodOperations(f)) })
  assert.equal(result.databaseBarrier, true)
  assert.equal(f.settlements.length, 1)
  assert.equal(f.settlements[0].used.tokens, 3)
  assert.equal(f.seen.length, 0)
})

async function ownedJournalFixture(t, receiptOperation, childTarget) {
  const f = await childFixture(t, { noGo: true, noReady: true, target: childTarget }), create = registryChildCommand()
  const scope = structuredClone(apiScope)
  const admission = new ReplyAdmission(recoveryOptions.binding, 50, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child,
    prepare: (child, signal) => child.prepare(apiFrames([recoveryStart])[0], scope.control, signal),
    authorize: async () => ({ result: 'go' }),
  }, f.clock)
  const registry = new ReplyChildren(registryOwner(), () => admission, registryDelivery(receiptOperation ?? (async () => {})), f.clock)
  t.after(() => registry.dispose())
  const started = registry.executeCreate(create)
  await until(() => f.pipe.written.some(line => line.t === 'start'))
  f.pipe.receive(readyRecord); await deliverySettled(started)
  await terminalExit(f)
  await until(() => f.child.inspect().relay.state === 'closed')
  await tick(); await tick()
  const journal = () => recoveryFixture([recoveryStart, readyRecord], { states: [] })
  const options = { ...structuredClone(recoveryOptions), timeoutMs: 20 }
  const inspect = registryControl(create, 'inspect')
  return { ...f, create, registry, options, inspect, journal, scope, admission }
}

test('owned preflight binds actual prepared scope and original unit before any journal operation', async t => {
  const f = await ownedJournalFixture(t)
  f.scope.control.route.model = 'caller mutation after preparation'
  f.create.payload.conversation.unit = 'usd'
  const result = await f.registry.preflightJournal(f.inspect, f.options, f.journal().operations)
  assert.equal(result.databaseBarrier, true)
  for (const change of [o => { o.unit = 'usd' }, o => { o.replyId = recoveryBinding.leaseId },
    o => { o.binding.commandId = recoveryBinding.leaseId }, o => { o.binding.leaseId = recoveryBinding.commandId },
    o => { o.scope.control.nonce = 'feed' }, o => { o.scope.control.route.model = 'wrong' },
    o => { o.scope.control.maxTokens++ }, o => { o.scope.identity.runtimeUnitId = 'wrong' },
    o => { o.scope.createEpoch++ }]) {
    const options = structuredClone(f.options), j = f.journal(); change(options)
    assert.throws(() => f.registry.preflightJournal(f.inspect, options, j.operations), /scope_invalid/)
    assert.equal(j.acks.length, 0)
  }
})

test('owned preflight refuses factories with no actual prepared start and an unclosed relay', async t => {
  const unprepared = await terminalRegistry(t)
  await terminalExit(unprepared); await tick()
  assert.throws(() => unprepared.registry.preflightJournal(registryControl(unprepared.create, 'inspect'), recoveryOptions,
    journalVerificationFixture().operations), /scope_invalid/)
  const f = await childFixture(t, { noGo: true, noReady: true })
  const preparing = f.child.prepare(apiFrames([recoveryStart])[0], apiScope.control, new AbortController().signal)
  f.pipe.receive(readyRecord); await preparing
  assert.equal(f.child.matchesJournalScope(apiScope, { replyId: recoveryOptions.replyId, unit: 'calls_tokens' }), false, 'prepared but live relay is insufficient')
})

test('owned preflight waits original receipt ACKs and retains one deadline across journal work', async t => {
  const held = deferred(), f = await ownedJournalFixture(t, () => held.promise), j = f.journal()
  const read = deferred(); j.operations.read = () => read.promise
  const pending = f.registry.preflightJournal(f.inspect, f.options, j.operations)
  const rejected = assert.rejects(pending, /reply_(preflight|recovery)_unconfirmed/)
  await tick(); assert.equal(j.acks.length, 0)
  f.clock.advance(5); held.resolve(); await tick(); await tick(); f.clock.advance(5)
  await until(() => j.acks.length === 1)
  f.clock.advance(10); await rejected
  assert.equal(j.acks.length, 1)
  read.resolve(null); await tick()
})

test('owned preflight exact reentry joins while changed options, methods or descriptor conflict', async t => {
  const f = await ownedJournalFixture(t), j = f.journal(), read = deferred()
  j.operations.read = () => read.promise
  const acknowledged = j.operations.acknowledged
  let joined
  j.operations.acknowledged = body => {
    joined = f.registry.preflightJournal(f.inspect, f.options, j.operations)
    return acknowledged(body)
  }
  const pending = f.registry.preflightJournal(f.inspect, f.options, j.operations)
  const rejected = assert.rejects(pending, /reply_(preflight|recovery)_unconfirmed/)
  await until(() => joined !== undefined)
  assert.equal(joined, pending)
  assert.throws(() => f.registry.preflightJournal(f.inspect, { ...f.options, timeoutMs: 19 }, j.operations), /busy/)
  assert.throws(() => f.registry.preflightJournal(f.inspect, f.options, { ...j.operations }), /busy/)
  const previous = j.operations.read
  j.operations.read = async () => null
  assert.throws(() => f.registry.preflightJournal(f.inspect, f.options, j.operations), /busy/)
  j.operations.read = previous
  f.clock.advance(20); await rejected; read.resolve(null); await tick()
})

test('owned preflight cancelled I/O retains slot until actual settlement and cannot return late proof', async t => {
  for (const mode of ['stop', 'epoch', 'dispose', 'timeout']) {
    const f = await ownedJournalFixture(t), j = f.journal(), held = deferred()
    let signal
    j.operations.read = s => { signal = s; return held.promise }
    const pending = f.registry.preflightJournal(f.inspect, f.options, j.operations)
    const rejected = assert.rejects(pending, /reply_(preflight|recovery)_unconfirmed/)
    await until(() => signal !== undefined)
    if (mode === 'stop') f.registry.stopReply(registryControl(f.create, 'stop', 3))
    if (mode === 'epoch') f.registry.inspectReply({ ...registryControl(f.create, 'inspect', 4), commandId: '00000000-0000-0000-0000-000000000333' })
    if (mode === 'dispose') f.registry.dispose()
    if (mode === 'timeout') f.clock.advance(20)
    await rejected; assert.equal(signal.aborted, true)
    assert.throws(() => f.registry.preflightJournal(f.inspect, f.options, f.journal().operations), /busy|scope_invalid/)
    held.resolve(j.bytes); await tick(); await tick()
    assert.equal(j.acks.length, 1, 'no final ACK after late read')
    if (mode === 'timeout') assert.equal((await f.registry.preflightJournal(f.inspect, f.options, f.journal().operations)).databaseBarrier, true)
  }
})

test('owned preflight final API wait rechecks receipt proof after fresh Stop evaluation', async t => {
  const f = await ownedJournalFixture(t), j = f.journal(), held = deferred()
  j.operations.acknowledged = async body => {
    const answer = j.answer(body)
    if (j.acks.length === 2) { await held.promise }
    return answer
  }
  const pending = f.registry.preflightJournal(f.inspect, f.options, j.operations)
  const rejected = assert.rejects(pending, /reply_(preflight|recovery)_unconfirmed/)
  await until(() => j.acks.length === 2)
  const stopping = f.registry.executeStop(registryControl(f.create, 'stop', 3))
  await rejected
  held.resolve(); await tick(); await stopping
  assert.equal(j.acks.length, 2)
})

test('owned preflight refuses expiry even when deadline timer dispatch is delayed', async t => {
  const f = await ownedJournalFixture(t), j = f.journal()
  const now = f.clock.now; let delayed = 0
  f.clock.now = () => now() + delayed
  j.operations.acknowledged = async body => {
    const answer = j.answer(body)
    if (j.acks.length === 2) delayed = 30 // Clock elapsed, but scheduled callbacks have not been dispatched.
    return answer
  }
  await assert.rejects(f.registry.preflightJournal(f.inspect, f.options, j.operations), /reply_(preflight|recovery)_unconfirmed/)
  assert.equal(j.acks.length, 2)
  assert.equal(f.clock.pending(), 0)
})

test('owned preflight refuses a child target differing from original reply or unit', async t => {
  for (const target of [{ replyId: recoveryBinding.leaseId, unit: 'calls_tokens' },
    { replyId: recoveryOptions.replyId, unit: 'usd' }]) {
    const f = await ownedJournalFixture(t, undefined, target), j = f.journal()
    assert.throws(() => f.registry.preflightJournal(f.inspect, f.options, j.operations), /scope_invalid/)
    assert.equal(j.acks.length, 0)
  }
})


async function checkerSettled(promise) {
  let timer
  try {
    const value = await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve('checker-sentinel'), 5000) })])
    assert.notEqual(value, 'checker-sentinel', 'owned checker must actually close before sentinel')
    return value
  } finally { clearTimeout(timer) }
}
async function checkerFixture(t, body = '', options = {}) {
  const fs = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { join } = await import('node:path')
  const base = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'con01-checker-')))
  const launcher = join(base, 'checker.py'), release = join(base, 'release'), started = join(base, 'started')
  const repliesDir = join(base, 'replies'), currentRoot = join(repliesDir, 'gen-current')
  await fs.mkdir(currentRoot, { recursive: true, mode: 0o700 })
  const prefix = `import sys,os,json,time,pathlib\nbase=pathlib.Path(__file__).parent\nwith (base/'started').open('a') as f: f.write('start\\n')\nassert sys.argv[1:4] == ['check','--replies',${JSON.stringify(repliesDir)}]\nassert 'CON01_CHECKER_AMBIENT_CANARY' not in os.environ\nassert os.environ['SOPHIA_REPLY_ROOT']==${JSON.stringify(currentRoot)}\nrow={'attemptId':sys.argv[5],'root':os.environ['SOPHIA_REPLY_ROOT'],'state':'absent','reason':'home_absent'}\n`
  await fs.writeFile(launcher, prefix + (body || "print(json.dumps(row))\n"))
  const verification = replyHomeVerification({ python: '/usr/bin/python3', launcher, repliesDir, currentRoot, waitMs: 1000, ...options })
  const pending = []
  const tracked = { ...verification, check: (scope, signal) => {
    const operation = verification.check(scope, signal); pending.push(operation); return operation
  } }
  const scope = { ...registryOwner(), attemptId: registryCommand().binding.attemptId, repliesDir, currentRoot }
  const starts = async () => { try { return (await fs.readFile(started, 'utf8')).trim().split('\n').length } catch { return 0 } }
  const waitStarted = async () => {
    const deadline = performance.now() + 3000
    while (await starts() === 0 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(await starts() > 0, 'owned checker started before deadline')
  }
  t.after(async () => { await fs.writeFile(release, 'release'); await checkerSettled(Promise.allSettled(pending)); await fs.rm(base, { recursive: true, force: true }) })
  return { fs, base, launcher, release, verification: tracked, scope, starts, waitStarted, pending }
}
const heldChecker = "deadline=time.monotonic()+3\nwhile not (base/'release').exists() and time.monotonic()<deadline: time.sleep(.005)\nprint(json.dumps(row))\n"

function checkerRegistry(t, verification, options = {}) {
  const clock = stopClock(), create = registryCommand(), posts = []
  const registry = new ReplyChildren(registryOwner(), () => assert.fail('preclaim Stop must fence factory'),
    registryDelivery(async values => { posts.push(...values); await options.receipts?.(values) }), clock, verification)
  t.after(() => registry.dispose())
  registry.createReply(create)
  const stop = registryControl(create, 'stop', 2)
  registry.stopReply(stop)
  return { registry, clock, create, stop, posts }
}

test('concrete checker crosses registry Stop and original receipt acknowledgement through actual HTTP', async t => {
  const previousCanary = process.env.CON01_CHECKER_AMBIENT_CANARY
  process.env.CON01_CHECKER_AMBIENT_CANARY = 'synthetic-do-not-inherit'
  t.after(() => { if (previousCanary === undefined) delete process.env.CON01_CHECKER_AMBIENT_CANARY; else process.env.CON01_CHECKER_AMBIENT_CANARY = previousCanary })
  const { createServer } = await import('node:http'), records = []
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    records.push(JSON.parse(Buffer.concat(chunks).toString())); res.writeHead(204); res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const transport = new ServiceTransport({ baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'synthetic-only',
    runtimeUnitId: 'unit', bridgeInstanceId: recoveryBinding.leaseId })
  const f = await checkerFixture(t), r = checkerRegistry(t, f.verification, { receipts: values => transport.receipts(values) })
  assert.equal(await checkerSettled(r.registry.executeStop(r.stop)), 'retained')
  const deadline = performance.now() + 3000
  while (!r.registry.stopDeliveryStatus(registryControl(r.create, 'inspect', 2))[0]?.stages[0]?.acknowledgement.acknowledged && performance.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  const status = r.registry.stopDeliveryStatus(registryControl(r.create, 'inspect', 2))[0]
  assert.equal(status.stages[0].acknowledgement.acknowledged, true)
  assert.equal(records.length, 1); assert.equal(records[0].receipts[0].stage, 'checked')
  assert.equal(records[0].receipts[0].commandId, r.stop.commandId)
  assert.equal(await f.starts(), 1)
})

test('concrete checker does not run ahead of original child accounting settlement', async t => {
  const checker = await checkerFixture(t), f = await childFixture(t, { noGo: true }), create = registryChildCommand()
  const registry = new ReplyChildren(registryOwner(), () => receiptAdmission(f), null, f.clock, checker.verification)
  t.after(() => registry.dispose()); await registry.createReply(create)
  const pending = registry.stopReceipt(registryControl(create, 'stop', 4)); await tick()
  assert.equal(await checker.starts(), 0)
  await endReceiptChild(f)
  assert.equal((await checkerSettled(pending)).stage, 'checked'); assert.equal(await checker.starts(), 1)
})

test('concrete checker timeout retains running process, refuses replacement and never promotes late zero', async t => {
  const f = await checkerFixture(t, heldChecker), r = checkerRegistry(t, f.verification)
  const first = r.registry.stopReceipt(r.stop)
  await f.waitStarted(); r.clock.advance(1000)
  assert.equal((await first).stage, 'outcome_unknown')
  assert.equal((await r.registry.stopReceipt(r.stop)).stage, 'outcome_unknown')
  assert.equal(await f.starts(), 1)
  await f.fs.writeFile(f.release, 'release')
  assert.deepEqual(await checkerSettled(f.pending[0]), { code: 74, signal: null, stdout: '' })
  await tick()
  assert.equal((await checkerSettled(r.registry.stopReceipt(r.stop))).stage, 'checked')
  assert.equal(await f.starts(), 2)
})

test('concrete checker invalid/truncated/overflow/nonzero reports cannot produce checked receipts', async t => {
  for (const body of ["row['attemptId']='wrong'\nprint(json.dumps(row))\n", "print(json.dumps(row),end='')\n",
    "print(json.dumps(row))\nprint(json.dumps(row))\n", "print('x'*65537)\n", "sys.stderr.write('x'*8193)\nprint(json.dumps(row))\n",
    "print(json.dumps(row))\nsys.exit(1)\n", "sys.stdout.buffer.write(b'\\xff\\n')\n"]) {
    const f = await checkerFixture(t, body), r = checkerRegistry(t, f.verification)
    assert.equal((await checkerSettled(r.registry.stopReceipt(r.stop))).stage, 'outcome_unknown')
  }
})

test('concrete checker validates scope before spawning and preserves absent executable failure', async t => {
  const f = await checkerFixture(t), signal = new AbortController().signal
  for (const changed of [{ currentRoot: '/foreign/gen-current' }, { repliesDir: '/foreign' }, { attemptId: 'bad' }]) {
    await assert.rejects(f.verification.check({ ...f.scope, ...changed }, signal), /scope_unavailable/)
  }
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(f.verification.check(f.scope, cancelled.signal), /scope_unavailable/)
  assert.equal(await f.starts(), 0)
  const absent = replyHomeVerification({ python: '/nonexistent/con01-python', launcher: f.launcher,
    repliesDir: f.scope.repliesDir, currentRoot: f.scope.currentRoot, waitMs: 1000 })
  assert.deepEqual(await checkerSettled(absent.check(f.scope, signal)), { code: 74, signal: null, stdout: '' })
})

test('concrete checker bounds concurrency and owns a checker after direct abort until close', async t => {
  const f = await checkerFixture(t, heldChecker), first = new AbortController(), second = new AbortController()
  const one = f.verification.check(f.scope, first.signal)
  const other = { ...f.scope, attemptId: registryCommand(1).binding.attemptId }
  const two = f.verification.check(other, second.signal)
  await f.waitStarted(); first.abort()
  await assert.rejects(f.verification.check(f.scope, new AbortController().signal), /scope_unavailable/)
  await assert.rejects(f.verification.check({ ...f.scope, attemptId: registryCommand(2).binding.attemptId }, new AbortController().signal), /scope_unavailable/)
  await f.fs.writeFile(f.release, 'release')
  assert.equal((await checkerSettled(one)).code, 74); assert.equal((await checkerSettled(two)).code, 0)
})


test('actual portable Python checker refusal never becomes registry settlement proof', async t => {
  const f = await checkerFixture(t)
  const { fileURLToPath } = await import('node:url')
  const actual = replyHomeVerification({ python: '/usr/bin/python3', launcher: fileURLToPath(new URL('../../apps/execution-host/reply/reply-launch.py', import.meta.url)),
    repliesDir: f.scope.repliesDir, currentRoot: f.scope.currentRoot, waitMs: 1000 })
  // No .admit was provisioned. Even on Linux this owned fixture is not an admitted generation.
  const result = await checkerSettled(actual.check(f.scope, new AbortController().signal))
  assert.equal(result.code, 74); assert.equal(result.stdout, '')
})


test('concrete checker snapshots attempt identity before deferred spawn and releases the original slots', async t => {
  const f = await checkerFixture(t), mutable = { ...f.scope }, signal = new AbortController().signal
  const first = f.verification.check(mutable, signal)
  mutable.attemptId = registryCommand(1).binding.attemptId
  const second = f.verification.check(mutable, signal)
  const [a, b] = await checkerSettled(Promise.all([first, second]))
  assert.equal(JSON.parse(a.stdout).attemptId, f.scope.attemptId)
  assert.equal(JSON.parse(b.stdout).attemptId, mutable.attemptId)
  const again = await checkerSettled(f.verification.check(f.scope, signal))
  assert.equal(JSON.parse(again.stdout).attemptId, f.scope.attemptId)
  assert.equal(await f.starts(), 3)
})


async function controllerBridgeFixture(t, extra = {}) {
  const { ControlBridge } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
  const { createServer } = await import('node:http')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const requests = [], scratch = await mkdtemp(join(tmpdir(), 'con-controller-'))
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw || '{}'); requests.push({ path: req.url, body, lease: req.headers['x-sophia-bridge-instance'] })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/runtime/hello') {
      if (extra.hello) await extra.hello()
      res.end(JSON.stringify({ projectId: 'p', leaseId: 'deliberately-not-instance', authorityEpoch: 9,
        bindings: extra.bindings ?? [], cursor: 0 }))
    } else if (req.url === '/v1/runtime/conversation/claim') {
      res.end(JSON.stringify(await (extra.claim?.(body, req) ?? { result: 'refused', code: 'not_pending' })))
    } else if (req.url === '/v1/runtime/conversation/go') {
      res.end(JSON.stringify(await (extra.go?.(body) ?? { result: 'go' })))
    } else if (req.url === '/v1/runtime/conversation/acknowledged') {
      res.end(JSON.stringify(await extra.acknowledged?.(body)))
    } else {
      if (req.url === '/v1/runtime/receipts' && await extra.receipts?.(body) === 'drop') { res.destroy(); return }
      res.statusCode = 204; res.end()
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const logs = [], settings = {
    routeId: 'route-test', route: { provider: 'synthetic', model: 'synthetic', reasoningEffort: null }, maxTokens: 10,
    admissionWaitMs: 1000, bounds: { deadlineMs: 1000, graceMs: 2, killMs: 5, exitWaitMs: 10, settleWaitMs: 10 },
    retry: { requestWaitMs: 100, retryWaitMs: 2, maxAttempts: 2 }, receiptWaitMs: 200, verification: null,
    launch: extra.launch ?? (() => assert.fail('no launcher expected')),
  }
  if (extra.settings) Object.assign(settings, extra.settings)
  const ctx = { on: () => () => {}, tools: { guard: () => () => {} } }
  const bridge = new ControlBridge(ctx, { protocolVersion: 1, bundle: 'synthetic', dshVersion: 'synthetic',
    runtimeUnitId: 'unit', service: { baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'synthetic' },
    workspace: scratch, journalDir: scratch, pollWaitMs: 10, settleTimeoutMs: 10, routes: {}, roleRoutes: {}, research: null,
    replies: extra.disabled ? null : settings, log: line => logs.push(line) })
  bridge.advertisedRoles = async () => [] // No provider/model lookup in this local fixture.
  bridge.pollLoop = async () => {} // Test dispatch explicitly, no background operational polling.
  const dispose = bridge.start()
  t.after(async () => { await dispose(); server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(scratch, { recursive: true, force: true }) })
  return { bridge, requests, logs, dispose, settings }
}

async function controllerReady(f) { await until(() => f.bridge.readiness.state === 'ready') }

test('actual bridge dispatch installs trusted controller and Stop fences held claim without waiting', async t => {
  let release
  const f = await controllerBridgeFixture(t, { claim: () => new Promise(r => { release = r }) })
  await controllerReady(f)
  const create = registryCommand(), stop = registryControl(create, 'stop', 2)
  f.bridge.dispatch(create); await until(() => release)
  f.bridge.dispatch(stop)
  await until(() => f.bridge.replies.inspect().pending === 0)
  const claims = f.requests.filter(r => r.path.endsWith('/claim'))
  assert.equal(claims.length, 1)
  assert.equal(claims[0].body.leaseId, claims[0].lease)
  assert.notEqual(claims[0].body.leaseId, 'deliberately-not-instance')
  assert.equal(claims[0].body.commandId, create.commandId)
  assert.equal(claims[0].body.authorityEpoch, create.binding.authorityEpoch)
  release({ result: 'first' }); await tick()
  assert.equal(f.requests.filter(r => r.path.endsWith('/go')).length, 0)
  assert.equal(f.bridge.attempts.size, 0); assert.equal(f.bridge.bySession.size, 0)
  assert.equal(f.bridge.replies.inspect().launches, 0)
})

test('controller rejects foreign project/unit/resource and preserves one original resource latch', async t => {
  const f = await controllerBridgeFixture(t); await controllerReady(f)
  const create = registryCommand()
  for (const binding of [{ ...create.binding, projectId: 'foreign' }, { ...create.binding, runtimeUnitId: 'foreign' }]) {
    assert.equal((await f.bridge.execute({ ...create, binding }))[0].stage, 'rejected')
  }
  assert.equal(f.requests.filter(r => r.path.endsWith('/claim')).length, 0)
  f.bridge.dispatch(create); await until(() => f.requests.some(r => r.path.endsWith('/claim')))
  const other = registryCommand(1); other.binding.resourceId = 'foreign'
  assert.equal((await f.bridge.execute(other))[0].reason, 'reply_owner_mismatch')
  await until(() => f.bridge.replies.inspect().pending === 0)
  assert.equal(f.requests.filter(r => r.path.endsWith('/claim')).length, 1)
})

test('disabled controller refuses before claim and shutdown racing hello adopts no controller', async t => {
  const disabled = await controllerBridgeFixture(t, { disabled: true }); await controllerReady(disabled)
  assert.equal((await disabled.bridge.execute(registryCommand()))[0].reason, 'containment_unavailable')
  assert.equal(disabled.requests.filter(r => r.path.endsWith('/claim')).length, 0)
  let release
  const late = await controllerBridgeFixture(t, { hello: () => new Promise(r => { release = r }) })
  await until(() => release); await late.dispose(); release(); await tick(); await tick()
  assert.equal(late.bridge.replies, null)
})

function controllerOwnedLauncher() {
  const launcher = new ChildProcess(), frames = [], controls = []
  launcher.stdin = new Writable({ write(data, _encoding, done) { controls.push(data.toString()); done() } })
  const stream = new Duplex({ read() {}, write(data, _encoding, done) {
    for (const line of data.toString().trim().split('\n')) frames.push(JSON.parse(line))
    done()
  } })
  return { launcher, stream, frames, controls,
    ready: () => stream.push(JSON.stringify({ t: 'status', s: 'ready' }) + '\n') }
}

test('concrete controller owns start scope and gates go on parsed readiness over fd3 fixture', async t => {
  const owned = controllerOwnedLauncher(); let launchScope
  const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: scope => {
    launchScope = scope; return owned
  } })
  await controllerReady(f); const create = registryCommand()
  f.bridge.dispatch(create); await until(() => owned.frames.some(row => row.t === 'start'))
  const start = owned.frames[0]
  assert.equal(start.attemptId, create.binding.attemptId)
  assert.equal(start.epoch, create.binding.authorityEpoch)
  assert.equal(start.prompt, create.payload.text)
  assert.equal(start.sessionId, `sophia-${create.binding.attemptId}`)
  assert.equal(start.nonce, launchScope.nonce); assert.match(start.nonce, /^[a-f0-9]{64}$/)
  assert.deepEqual(start.route, f.settings.route); assert.equal(start.maxTokens, 10)
  assert.equal(Object.isFrozen(launchScope), true)
  assert.equal(f.requests.filter(row => row.path.endsWith('/go')).length, 0)
  owned.ready(); await until(() => owned.frames.some(row => row.t === 'go'))
  const claim = f.requests.find(row => row.path.endsWith('/claim'))
  const go = f.requests.find(row => row.path.endsWith('/go'))
  assert.deepEqual(go.body, claim.body)
  await until(() => f.requests.some(row => row.path.endsWith('/receipts')))
  assert.equal(f.bridge.attempts.size, 0)
  await f.dispose(); assert.equal(owned.stream.destroyed, true)
  assert.ok(owned.controls.some(line => line.includes('TERM')))
})

test('Stop while readiness is held fences the owned child and never authorizes a late ready', async t => {
  const owned = controllerOwnedLauncher()
  const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: () => owned })
  await controllerReady(f); const create = registryCommand()
  f.bridge.dispatch(create); await until(() => owned.frames.some(row => row.t === 'start'))
  f.bridge.dispatch(registryControl(create, 'stop', 2))
  await until(() => owned.frames.some(row => row.t === 'stop'))
  owned.ready(); await tick(); await tick()
  assert.equal(f.requests.filter(row => row.path.endsWith('/go')).length, 0)
  assert.equal(owned.frames.filter(row => row.t === 'go').length, 0)
  await f.dispose()
})

test('unrecovered CON hello stays reported and blocks fresh capacity without using hello lease', async t => {
  const old = registryCommand()
  const f = await controllerBridgeFixture(t, { bindings: [{ attemptId: old.binding.attemptId,
    nativeSessionId: `sophia-${old.binding.attemptId}`, authorityEpoch: 2, state: 'stopped',
    conversationReplyId: old.binding.conversationReplyId, create: null }] })
  await controllerReady(f)
  const ready = f.requests.find(row => row.path.endsWith('/ready'))
  assert.equal(ready.body.unrecovered.length, 1)
  assert.equal(ready.body.unrecovered[0].attemptId, old.binding.attemptId)
  const answer = await f.bridge.execute(registryCommand(1))
  assert.equal(answer[0].stage, 'outcome_unknown')
  assert.equal(answer[0].reason, 'reply_recovery_required')
  assert.deepEqual(await f.bridge.execute(registryControl(old, 'stop', 2)), [])
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 0)
})


test('controller releases original prompt on refused, released, stopped and disposed admissions', async t => {
  for (const mode of ['refused', 'released', 'stopped', 'disposed', 'timeout']) {
    const owned = controllerOwnedLauncher(); let release
    const f = await controllerBridgeFixture(t, { claim: mode === 'refused' ? undefined : mode === 'released' ?
      async () => ({ result: 'first' }) : () => new Promise(r => { release = r }), launch: () => owned,
      settings: mode === 'timeout' ? { admissionWaitMs: 20 } : {} })
    await controllerReady(f); const create = registryCommand()
    create.payload.text = 'PRIVATE_SYNTHETIC_PROMPT_RELEASE_CANARY'
    f.bridge.dispatch(create)
    await until(() => f.bridge.replies.registry?.entries.get(create.binding.attemptId)?.admission)
    const admission = f.bridge.replies.registry.entries.get(create.binding.attemptId).admission
    if (mode === 'released') {
      await until(() => owned.frames.some(row => row.t === 'start')); owned.ready()
      await until(() => admission.state === 'released')
    } else if (mode === 'refused') await until(() => admission.state === 'refused')
    else {
      await until(() => release)
      if (mode === 'stopped') f.bridge.dispatch(registryControl(create, 'stop', 2))
      else if (mode === 'disposed') await f.dispose()
      if (mode === 'timeout') assert.equal(await checkerSettled(admission.run()), 'unresolved')
      else await until(() => admission.state === 'stopped')
    }
    let retained
    await admission.operations.prepare({ prepare: async start => { retained = start.prompt } }, new AbortController().signal)
    assert.equal(retained, undefined, mode)
    assert.equal(create.payload.text, 'PRIVATE_SYNTHETIC_PROMPT_RELEASE_CANARY', 'caller-owned source untouched')
    release?.({ result: 'first' })
    await f.dispose()
  }
})

test('invalid optional reply settings disable only replies and preserve service readiness', async t => {
  const f = await controllerBridgeFixture(t, { settings: { maxTokens: 0 } }); await controllerReady(f)
  assert.ok(f.requests.some(row => row.path.endsWith('/ready')))
  assert.ok(f.logs.includes('reply_controller_configuration_invalid'))
  assert.equal((await f.bridge.execute(registryCommand()))[0].reason, 'containment_unavailable')
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 0)
})


test('controller snapshots adopted handles so later wrapper mutation cannot close foreign resources', async t => {
  const first = controllerOwnedLauncher(), foreign = controllerOwnedLauncher()
  t.after(() => { foreign.launcher.stdin.end(); foreign.stream.destroy() })
  const wrapper = { launcher: first.launcher, stream: first.stream }
  const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: () => wrapper })
  await controllerReady(f); f.bridge.dispatch(registryCommand())
  await until(() => first.frames.some(row => row.t === 'start'))
  wrapper.launcher = foreign.launcher; wrapper.stream = foreign.stream
  await f.dispose()
  assert.equal(first.launcher.stdin.writableEnded, true); assert.equal(first.stream.destroyed, true)
  assert.equal(foreign.launcher.stdin.writableEnded, false); assert.equal(foreign.stream.destroyed, false)
})

test('controller retains and immediately fences partial launch acquisitions without breaking disposal', async t => {
  for (const missing of ['stream', 'launcher']) {
    const first = controllerOwnedLauncher()
    t.after(() => { first.launcher.stdin.end(); first.stream.destroy() })
    const wrapper = { launcher: first.launcher, stream: first.stream, [missing]: null }
    const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: () => wrapper })
    await controllerReady(f); f.bridge.dispatch(registryCommand())
    await until(() => f.bridge.replies.inspect().launches === 1)
    await until(() => f.bridge.replies.inspect().pending === 0)
    assert.equal(first.launcher.stdin.writableEnded, missing === 'stream')
    assert.equal(first.stream.destroyed, missing === 'launcher')
    await assert.doesNotReject(f.dispose())
    assert.equal(f.requests.filter(row => row.path.endsWith('/go')).length, 0)
  }
})

test('one acquired cleanup failure does not skip another resource or escape bridge disposal', async t => {
  const first = controllerOwnedLauncher(), end = first.launcher.stdin.end.bind(first.launcher.stdin)
  t.after(() => { first.launcher.stdin.end = end; end(); first.stream.destroy() })
  const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: () => first })
  await controllerReady(f); f.bridge.dispatch(registryCommand())
  await until(() => first.frames.some(row => row.t === 'start'))
  first.launcher.stdin.end = () => { throw new Error('PRIVATE_SYNTHETIC_CLOSE_FAILURE') }
  await assert.doesNotReject(f.dispose())
  assert.equal(first.stream.destroyed, true)
  assert.ok(f.bridge.replies.inspect().failures.includes('reply_control_close_unconfirmed'))
  assert.doesNotMatch(JSON.stringify(f.bridge.replies.inspect()), /PRIVATE_SYNTHETIC_CLOSE_FAILURE/)
})


test('accessor handback cannot hide a valid acquired launcher behind a throwing stream getter', async t => {
  const owned = controllerOwnedLauncher(); let getterCalls = 0
  t.after(() => { owned.launcher.stdin.end(); owned.stream.destroy() })
  const wrapper = { launcher: owned.launcher, get stream() { getterCalls++; throw new Error('synthetic getter') } }
  const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: () => wrapper })
  await controllerReady(f); f.bridge.dispatch(registryCommand())
  await until(() => f.bridge.replies.inspect().launches === 1)
  assert.equal(getterCalls, 0); assert.equal(owned.launcher.stdin.writableEnded, true)
  await assert.doesNotReject(f.dispose())
})


test('throwing prototype classification cannot strand the other acquired handle', async t => {
  for (const missing of ['launcher', 'stream']) {
    const owned = controllerOwnedLauncher()
    t.after(() => { owned.launcher.stdin.end(); owned.stream.destroy() })
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('synthetic prototype failure') } })
    const wrapper = { launcher: owned.launcher, stream: owned.stream, [missing]: hostile }
    const f = await controllerBridgeFixture(t, { claim: async () => ({ result: 'first' }), launch: () => wrapper })
    await controllerReady(f); f.bridge.dispatch(registryCommand())
    await until(() => f.bridge.replies.inspect().launches === 1)
    assert.equal(owned.launcher.stdin.writableEnded, missing === 'stream')
    assert.equal(owned.stream.destroyed, missing === 'launcher')
    await assert.doesNotReject(f.dispose())
  }
})

const ownedLauncherScript = String.raw`import json, os, select, sys, time
args = dict(zip(sys.argv[2::2], sys.argv[3::2]))
record = os.path.join(args['--template'], 'record.json')
mode = os.path.basename(sys.argv[0]).split('.')[0]
state = {'argv': sys.argv[1:], 'env': dict(os.environ), 'cwd': os.getcwd(), 'pid': os.getpid(), 'isolated': sys.flags.isolated, 'bytecode': sys.dont_write_bytecode, 'frames': [], 'controls': []}
def save():
    temp = record + '.tmp'
    with open(temp, 'w') as f: json.dump(state, f)
    os.replace(temp, record)
save()
if mode == 'refuse': sys.exit(69)
relay = os.fdopen(3, 'r+b', buffering=0)
buffers = {0: b'', 3: b''}
deadline = time.monotonic() + 4
try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([0, 3], [], [], .05)
        for fd in ready:
            data = os.read(fd, 65536)
            if not data:
                state['eof'] = fd
                save()
                sys.exit(74)
            buffers[fd] += data
            while b'\n' in buffers[fd]:
                line, buffers[fd] = buffers[fd].split(b'\n', 1)
                if fd == 0:
                    state['controls'].append(line.decode())
                    save()
                    sys.exit(74)
                frame = json.loads(line)
                state['frames'].append(frame)
                save()
                if frame['t'] == 'go' and mode == 'settled': sys.exit(0)
                if frame['t'] == 'start' and mode != 'held':
                    relay.write(b'{"t":"status","s":"ready"}\n')
finally:
    save()
sys.exit(74)
`

async function realLauncherFixture(t, mode = 'normal') {
  const fs = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { join } = await import('node:path')
  const dir = await fs.mkdtemp(join(tmpdir(), 'con-owned-launch-')), children = []
  const launcherPath = join(dir, `${mode}.py`), record = join(dir, 'record.json')
  await fs.writeFile(launcherPath, ownedLauncherScript)
  const options = { python: '/usr/bin/python3', launcher: launcherPath, root: join(dir, 'gen-fixture'),
    node: process.execPath, entry: '/synthetic/runtime/entry.js', runtimeDir: '/synthetic/runtime', template: dir,
    templateDigest: 'sophia-reply-tree-v1:sha256:' + 'a'.repeat(64), profileName: 'synthetic', runtimeUnitId: 'unit' }
  if (mode === 'missing') options.python = '/nonexistent/con-synthetic-python'
  if (mode === 'actual') {
    const { fileURLToPath } = await import('node:url')
    options.launcher = fileURLToPath(new URL('../../apps/execution-host/reply/reply-launch.py', import.meta.url))
  }
  const launch = replyOwnedLauncher(options)
  t.after(async () => {
    for (const item of children) { item.owned.launcher.stdin?.end(); item.owned.stream?.destroy() }
    await checkerSettled(Promise.all(children.map(item => item.closed)))
    await fs.rm(dir, { recursive: true, force: true })
  })
  return { options, children, read: async () => { try { return JSON.parse(await fs.readFile(record, 'utf8')) } catch { return null } },
    launch: scope => {
      const owned = launch(scope)
      const closed = new Promise(resolve => owned.launcher.once('close', (code, signal) => resolve({ code, signal })))
      children.push({ owned, closed }); return owned
    } }
}
async function processCondition(read, predicate) {
  return checkerSettled((async () => {
    const { setTimeout: delay } = await import('node:timers/promises')
    const end = Date.now() + 4500
    while (Date.now() < end) { const value = await read(); if (predicate(value)) return value; await delay(5) }
    assert.fail('owned process condition did not settle')
  })())
}

test('owned launcher crosses real Python fd3 and controller start ready go with fixed isolated argv', async t => {
  const proc = await realLauncherFixture(t)
  // Mutation after factory creation cannot redirect execution or inject environment.
  proc.options.root = '/foreign/gen-other'; proc.options.launcher = '/foreign/launcher.py'
  const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: proc.launch,
    settings: { bounds: { deadlineMs: 3000, graceMs: 10, killMs: 20, exitWaitMs: 50, settleWaitMs: 50 } } })
  await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
  const observed = await processCondition(proc.read, value => value?.frames.some(frame => frame.t === 'go'))
  const args = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [observed.argv[1 + i * 2], observed.argv[2 + i * 2]]))
  assert.equal(observed.argv.length, 23); assert.equal(observed.argv[0], 'run')
  assert.equal(args['--parent'], String(process.pid)); assert.equal(args['--attempt'], create.binding.attemptId)
  assert.equal(args['--unit'], 'unit'); assert.match(args['--root'], /\/gen-fixture$/)
  assert.equal(observed.cwd, '/'); assert.equal(observed.env.PATH, '/usr/bin:/bin')
  assert.equal(observed.env.LANG, 'C.UTF-8')
  // Apple's /usr/bin/python3 shim adds SDK search paths before executing Python; none is inherited authority.
  const generated = process.platform === 'darwin' ? ['CPATH', 'LIBRARY_PATH', 'MANPATH', 'SDKROOT', '__CF_USER_TEXT_ENCODING'] : []
  assert.deepEqual(Object.keys(observed.env).filter(key => !['LC_CTYPE', ...generated].includes(key)).sort(), ['LANG', 'PATH'])
  assert.equal(observed.isolated, 1); assert.equal(observed.bytecode, true)
  assert.equal(observed.env.HOME, undefined); assert.equal(observed.env.SOPHIA_SERVICE_TOKEN, undefined)
  const start = observed.frames[0]
  assert.equal(start.prompt, create.payload.text); assert.equal(start.nonce, args['--nonce'])
  assert.equal(start.epoch, create.binding.authorityEpoch); assert.deepEqual(start.route, f.settings.route)
  assert.equal(start.maxTokens, 10)
  assert.equal(proc.children[0].owned.launcher.stdout, null); assert.equal(proc.children[0].owned.launcher.stderr, null)
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 1)
  assert.equal(f.requests.filter(row => row.path.endsWith('/go')).length, 1)
  await f.dispose()
  assert.deepEqual(await checkerSettled(proc.children[0].closed), { code: 74, signal: null })
})

test('owned process Stop during held readiness closes without go or numeric signals', async t => {
  const proc = await realLauncherFixture(t, 'held')
  const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: proc.launch })
  await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
  await processCondition(proc.read, value => value?.frames.some(frame => frame.t === 'start'))
  proc.children[0].owned.launcher.kill = () => assert.fail('numeric signal forbidden')
  f.bridge.dispatch(registryControl(create, 'stop', 2))
  const closed = await checkerSettled(proc.children[0].closed)
  assert.equal(closed.signal, null); assert.equal(closed.code, 74)
  assert.equal(f.requests.filter(row => row.path.endsWith('/go')).length, 0)
  assert.equal((await proc.read()).frames.some(frame => frame.t === 'go'), false)
})

test('owned launcher refusal and failed exec never authorize go or claim physical settlement', async t => {
  for (const mode of ['refuse', 'missing', 'actual']) {
    const proc = await realLauncherFixture(t, mode)
    const launch = proc.launch
    const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch })
    await controllerReady(f); f.bridge.dispatch(registryCommand())
    await processCondition(async () => f.requests, rows => rows.some(row => row.path.endsWith('/receipts')))
    assert.equal(f.requests.filter(row => row.path.endsWith('/go')).length, 0)
    assert.equal(JSON.stringify(f.requests.filter(row => row.path.endsWith('/receipts'))).includes('"checked"'), false)
    await f.dispose()
    const closed = await checkerSettled(proc.children[0].closed)
    assert.equal(closed.signal, null)
    if (mode === 'actual') assert.equal(closed.code, 69, 'actual run remains disabled')
  }
})

test('owned launcher rejects malformed fixed configuration and execution identities before spawn', () => {
  const options = { python: '/usr/bin/python3', launcher: '/synthetic/launcher.py', root: '/replies/gen-one', node: '/bin/node',
    entry: '/runtime/entry.js', runtimeDir: '/runtime', template: '/template',
    templateDigest: 'sophia-reply-tree-v1:sha256:' + 'a'.repeat(64), profileName: 'synthetic', runtimeUnitId: 'unit' }
  for (const change of [{ python: 'python3' }, { launcher: '/a/../launcher' }, { root: '/replies/sealed-one' },
    { root: '/replies/gen-' }, { node: '/' }, { entry: '/runtime-other/entry' }, { runtimeDir: '/runtime/' },
    { template: '/template\0' }, { templateDigest: 'bad' }, { profileName: '--other' }, { runtimeUnitId: 'bad unit' }, { profileName: undefined }, { runtimeUnitId: undefined }]) {
    assert.throws(() => replyOwnedLauncher({ ...options, ...change }), /options_invalid/)
  }
  const launch = replyOwnedLauncher(options)
  for (const scope of [{ attemptId: '../../escape', nonce: 'a'.repeat(64) }, { attemptId: registryCommand().binding.attemptId, nonce: 'wrong' }]) {
    assert.throws(() => launch(scope), /scope_invalid/)
  }
})


test('owned launcher rejects coercible identity values without invoking conversion hooks', () => {
  const launch = replyOwnedLauncher({ python: '/nonexistent/con-no-spawn', launcher: '/synthetic/launcher.py',
    root: '/replies/gen-one', node: '/bin/node', entry: '/runtime/entry.js', runtimeDir: '/runtime', template: '/template',
    templateDigest: 'sophia-reply-tree-v1:sha256:' + 'a'.repeat(64), profileName: 'synthetic', runtimeUnitId: 'unit' })
  let conversions = 0
  const attemptId = registryCommand().binding.attemptId, nonce = 'a'.repeat(64)
  for (const field of ['attemptId', 'nonce']) {
    const valid = { attemptId, nonce }
    for (const invalid of [undefined, null, 42, Symbol('invalid'), [valid[field]], new String(valid[field]),
      { toString() { conversions++; return valid[field] } }]) {
      assert.throws(() => launch({ ...valid, [field]: invalid }), /scope_invalid/)
    }
  }
  assert.equal(conversions, 0)
})


function absentAck(create, request) {
  return { predicates: {
    observations: { met: true, keys: request.keys.observations }, usage: { met: true, keys: request.keys.usage },
    reservations: { met: true, states: [] }, terminalState: { met: true, replyId: create.binding.conversationReplyId, state: 'outcome_unknown' },
    terminalWriter: { met: true, key: { kind: 'receipt', commandId: create.commandId, stage: 'outcome_unknown' } },
    createAnswered: { met: true, commandId: create.commandId, stage: 'outcome_unknown' },
    capture: { met: true, outcome: 'none', key: null }, payloadScrubbed: { met: true, commandId: create.commandId },
  } }
}
function absentReports(scope, state = 'absent') {
  return { code: 0, signal: null, stdout: JSON.stringify({ attemptId: scope.attemptId, root: scope.currentRoot,
    state, reason: state === 'absent' ? 'home_absent' : 'home_empty' }) + '\n' }
}
async function absentRetireFixture(t, extra = {}) {
  const create = registryCommand(), checks = [], acks = []
  const f = await controllerBridgeFixture(t, { ...extra, acknowledged: async body => {
    acks.push(structuredClone(body)); return extra.acknowledged ? extra.acknowledged(body, create) : absentAck(create, body)
  }, settings: { receiptWaitMs: 500, verification: { repliesDir: '/replies', currentRoot: '/replies/gen-one', waitMs: 300,
    check: async scope => { checks.push(scope); return extra.check ? extra.check(scope) : absentReports(scope) } }, ...extra.settings } })
  await controllerReady(f)
  f.bridge.dispatch(create)
  await processCondition(async () => f.bridge.replies.inspect(), value => value.pending === 0)
  return { ...f, create, retire: registryControl(create, 'retire', 3), checks, acks }
}
async function retireFinished(f) {
  await processCondition(async () => f.bridge.replies.inspect(), value => value.pending === 0)
}

test('controller retires known never-launched absent home and frees exactly one slot with replay guards', async t => {
  const f = await absentRetireFixture(t), second = registryCommand(1), denied = registryCommand(2), next = registryCommand(3)
  f.bridge.dispatch(second); await retireFinished(f)
  f.bridge.dispatch(denied); await retireFinished(f)
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 2)
  assert.equal(f.bridge.replies.registry.entries.size, 2)
  f.bridge.dispatch(f.retire); await retireFinished(f)
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  await processCondition(async () => f.requests, rows => rows.some(row => row.path.endsWith('/receipts') && JSON.stringify(row.body).includes('home_absent')))
  assert.equal(f.checks.length, 2); assert.equal(f.acks.length, 1)
  assert.equal(f.acks[0].commandId, f.create.commandId)
  assert.equal(f.acks[0].authorityEpoch, f.create.binding.authorityEpoch)
  assert.deepEqual(f.acks[0].keys, { observations: [], usage: [], ordinals: [], hasTurnEnd: false })
  assert.equal(f.acks[0].leaseId, f.requests.find(row => row.path.endsWith('/claim')).lease)
  const requests = f.requests.length
  f.bridge.dispatch(f.retire); f.bridge.dispatch(f.create); f.bridge.dispatch(denied); await retireFinished(f)
  assert.equal(f.requests.length, requests)
  f.bridge.dispatch(next); await retireFinished(f)
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 3)
  assert.equal(f.bridge.replies.registry.entries.size, 2)
  assert.equal(f.bridge.attempts.size, 0)
})

test('absent retirement withholds slot for every missing predicate and nonempty reservation inventory', async t => {
  const predicates = Object.keys(absentAck(registryCommand(), { keys: { observations: [], usage: [] } }).predicates)
  for (const field of [...predicates, 'reservation-row', 'wrong-create', 'wrong-reply']) {
    const f = await absentRetireFixture(t, { acknowledged: (body, create) => {
      const answer = absentAck(create, body)
      if (field === 'reservation-row') answer.predicates.reservations.states = [{ ordinal: 1, state: 'uncertain', used: null }]
      else if (field === 'wrong-create') answer.predicates.createAnswered.commandId = registryCommand(1).commandId
      else if (field === 'wrong-reply') answer.predicates.terminalState.replyId = '00000000-0000-0000-0000-000000000999'
      else answer.predicates[field].met = false
      return answer
    } })
    f.bridge.dispatch(f.retire); await retireFinished(f)
    assert.equal(f.bridge.replies.registry.entries.size, 1, field)
    assert.equal(f.requests.some(row => row.path.endsWith('/receipts') && JSON.stringify(row.body).includes('home_absent')), false, field)
  }
})

test('absent retirement requires both complete absence checks and never-entered launch evidence', async t => {
  for (const mode of ['empty', 'gone', 'missing-root', 'late-empty', 'launch-throw']) {
    let checks = 0
    const f = await absentRetireFixture(t, { ...(mode === 'launch-throw' ? { claim: () => ({ result: 'first' }), launch: () => { throw new Error('owned acquisition uncertain') } } : {}),
      check: scope => { checks++; return mode === 'missing-root' ? { code: 0, signal: null, stdout: '' } :
        absentReports(scope, mode === 'late-empty' && checks === 1 ? 'absent' : mode === 'late-empty' ? 'empty' : mode === 'launch-throw' ? 'absent' : mode) } })
    f.bridge.dispatch(f.retire); await retireFinished(f)
    assert.equal(f.bridge.replies.registry.entries.size, 1, mode)
    assert.equal(f.requests.some(row => row.path.endsWith('/receipts') && JSON.stringify(row.body).includes('home_absent')), false, mode)
    if (mode === 'launch-throw') assert.equal(checks, 0)
  }
})

test('retirement waits for original receipt ACK and late Stop prevents slot release', async t => {
  let release
  const f = await absentRetireFixture(t, { receipts: () => new Promise(resolve => { release = resolve }) })
  await processCondition(async () => Boolean(release), Boolean)
  f.bridge.dispatch(f.retire)
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(f.acks.length, 0); assert.equal(f.checks.length, 0)
  f.bridge.dispatch(registryControl(f.create, 'stop', 4)); release()
  await retireFinished(f)
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  assert.equal(f.acks.length, 0)
})

test('late API acknowledgement after retirement timeout cannot authorize slot pruning', async t => {
  let release
  const f = await absentRetireFixture(t, { acknowledged: (body, create) => new Promise(resolve => { release = () => resolve(absentAck(create, body)) }),
    settings: { receiptWaitMs: 40 } })
  f.bridge.dispatch(f.retire)
  await processCondition(async () => Boolean(release), Boolean)
  await new Promise(resolve => setTimeout(resolve, 60))
  f.bridge.dispatch(f.retire)
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  release(); await retireFinished(f)
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  assert.equal(f.requests.some(row => row.path.endsWith('/receipts') && JSON.stringify(row.body).includes('home_absent')), false)
})


test('all public create entrypoints replay original retired admission without another claim or slot', async t => {
  const f = await absentRetireFixture(t), registry = f.bridge.replies.registry
  const originalResult = registry.createReply(f.create), originalReceipt = registry.createReceipt(f.create)
  const result = await originalResult, receipt = await originalReceipt
  f.bridge.dispatch(f.retire); await retireFinished(f)
  assert.equal(registry.entries.size, 0)
  const claims = f.requests.filter(row => row.path.endsWith('/claim')).length
  for (const entrypoint of ['createReply', 'createReceipt', 'executeCreate']) {
    const replay = registry[entrypoint](f.create)
    if (entrypoint === 'createReply') { assert.equal(replay, originalResult); assert.equal(await replay, result) }
    else if (entrypoint === 'createReceipt') { assert.equal(replay, originalReceipt); assert.deepEqual(await replay, receipt) }
    else await replay
    assert.equal(registry.entries.size, 0)
    assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, claims)
    const changed = structuredClone(f.create); changed.payload.text += '-changed'
    assert.throws(() => registry[entrypoint](changed), /conflict/)
    const anotherCommand = { ...f.create, commandId: registryCommand(5).commandId }
    assert.throws(() => registry[entrypoint](anotherCommand), /conflict/)
  }
})

function inspectRows(f, id) {
  return f.requests.filter(row => row.path.endsWith('/receipts')).flatMap(row => row.body.receipts)
    .filter(row => row.commandId === id)
}

test('controller inspect snapshots content-free state once and replays without new work', async t => {
  const f = await absentRetireFixture(t), inspect = registryControl(f.create, 'inspect')
  f.bridge.dispatch(inspect); await retireFinished(f)
  await processCondition(async () => inspectRows(f, inspect.commandId), rows => rows.length === 1)
  const receipt = inspectRows(f, inspect.commandId)[0], summary = JSON.parse(receipt.reason)
  assert.equal(receipt.stage, 'checked'); assert.equal(receipt.nativeSessionId, null)
  assert.deepEqual(summary, { state: 'refused', authorityEpoch: 1, stopped: false,
    local: { state: 'refused', launchEntered: false, spawnFenced: false, child: null } })
  const before = f.requests.length
  f.bridge.dispatch(inspect); await retireFinished(f)
  assert.equal(f.requests.length, before)
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 1)
  assert.equal(f.checks.length + f.acks.length, 0)
  assert.equal(f.bridge.attempts.size, 0)
  assert.equal(JSON.stringify(summary).includes(f.create.payload.text), false)
  assert.throws(() => f.bridge.replies.registry.executeInspect({ ...inspect, binding: { ...inspect.binding, authorityEpoch: 2 } }), /conflict/)
})

test('held inspect acknowledgement blocks retirement; release permits one immutable retire', async t => {
  let release
  const f = await absentRetireFixture(t, { receipts: body => body.receipts.some(row => row.commandId.endsWith('301')) ?
    new Promise(resolve => { release = resolve }) : undefined })
  const inspect = registryControl(f.create, 'inspect')
  f.bridge.dispatch(inspect)
  await processCondition(async () => release, value => typeof value === 'function')
  f.bridge.dispatch(f.retire); await tick(); await tick()
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  assert.equal(f.checks.length + f.acks.length, 0)
  release(); await retireFinished(f)
  assert.equal(f.bridge.replies.registry.entries.size, 0)
  assert.equal(f.acks.length, 1)
  const before = f.requests.length
  f.bridge.dispatch(inspect); f.bridge.dispatch(f.retire); await retireFinished(f)
  assert.equal(f.requests.length, before)
})

test('new inspect sender invalidates an existing retirement proof even at the same epoch', async t => {
  let releaseCheck, releaseInspect
  const f = await absentRetireFixture(t, { check: scope => new Promise(resolve => { releaseCheck = () => resolve(absentReports(scope)) }),
    receipts: body => body.receipts.some(row => row.commandId.endsWith('301')) ? new Promise(resolve => { releaseInspect = resolve }) : undefined })
  f.bridge.dispatch(f.retire)
  await processCondition(async () => releaseCheck, value => typeof value === 'function')
  f.bridge.dispatch(registryControl(f.create, 'inspect', 3))
  await processCondition(async () => releaseInspect, value => typeof value === 'function')
  releaseCheck(); await retireFinished(f)
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  assert.equal(f.acks.length, 0)
  releaseInspect()
})

test('inspect refuses unknown, stale, foreign and disposed commands without consuming Stop capacity', async t => {
  const f = await absentRetireFixture(t), registry = f.bridge.replies.registry
  const inspect = registryControl(f.create, 'inspect', 2)
  assert.equal(await registry.executeInspect(registryControl(registryCommand(1), 'inspect')), 'unresolved')
  assert.equal(await registry.executeInspect(inspect), 'retained')
  assert.throws(() => registry.executeInspect({ ...inspect, commandId: '00000000-0000-0000-0000-000000000700',
    binding: { ...inspect.binding, authorityEpoch: 1 } }), /stale_epoch/)
  for (const field of ['projectId', 'resourceId', 'runtimeUnitId', 'conversationReplyId']) {
    assert.throws(() => registry.executeInspect({ ...inspect, binding: { ...inspect.binding, [field]: field === 'conversationReplyId' ? '00000000-0000-0000-0000-000000000999' : 'foreign' } }), /invalid|conflict/)
  }
  for (let i = 1; i < 64; i++) await registry.executeInspect({ ...inspect, commandId: `00000000-0000-0000-0000-${String(1000 + i).padStart(12, '0')}` })
  assert.throws(() => registry.executeInspect({ ...inspect, commandId: '00000000-0000-0000-0000-000000009999' }), /capacity/)
  registry.stopReply(registryControl(f.create, 'stop', 3))
  assert.equal(registry.entries.get(f.create.binding.attemptId).stopped, true)
  registry.dispose()
  assert.equal(await registry.executeInspect({ ...inspect, commandId: '00000000-0000-0000-0000-000000009998' }), 'unresolved')
})

test('child inspection shows local gate/relay/ordinal states without nonce or content', async t => {
  let release
  const f = await childFixture(t, { settle: body => new Promise(resolve => { release = () => resolve(settleReceipt(body)) }) })
  await reserveFirst(f.pipe)
  f.pipe.receive(settleRecord)
  await processCondition(async () => release, value => typeof value === 'function')
  const status = f.child.status()
  assert.equal(status.readiness, 'ready'); assert.equal(status.relay.go, true)
  assert.deepEqual(status.relay.ordinals, { reserved: [1], settling: [1] })
  assert.deepEqual(status.settlements.ordinals, [{ ordinal: 1, state: 'pending' }])
  assert.deepEqual(Object.keys(status.process).sort(), ['exit', 'relayExitFailed', 'settledExit'])
  release()
  await processCondition(async () => f.child.status().settlements.ordinals, rows => rows[0]?.state === 'settled')
  status.relay.ordinals.reserved.length = 0
  assert.deepEqual(f.child.status().relay.ordinals.reserved, [1])
})

test('lost inspect response retries one immutable snapshot and replay cannot reset its sender', async t => {
  let count = 0
  const f = await absentRetireFixture(t, { receipts: body => {
    if (body.receipts.some(row => row.commandId.endsWith('301')) && ++count === 1) return 'drop'
  } })
  const inspect = registryControl(f.create, 'inspect')
  f.bridge.dispatch(inspect)
  await processCondition(async () => inspectRows(f, inspect.commandId), rows => rows.length === 2)
  const rows = inspectRows(f, inspect.commandId)
  assert.deepEqual(rows[0], rows[1])
  assert.equal(f.bridge.replies.registry.entries.size, 1)
  f.bridge.replies.registry.stopReply(registryControl(f.create, 'stop', 2))
  f.bridge.dispatch(inspect); await retireFinished(f)
  assert.equal(inspectRows(f, inspect.commandId).length, 2)
  assert.equal(JSON.parse(rows[0].reason).stopped, false, 'retained historical snapshot is not rewritten by later Stop')
  assert.equal(f.requests.filter(row => row.path.endsWith('/claim')).length, 1)
})


function controllerChild(f, create) {
  return f.bridge.replies.registry?.entries.get(create.binding.attemptId)?.admission?.child
}

test('live retirement retains private concrete launch provenance after prepared settled exit', async t => {
  const proc = await realLauncherFixture(t, 'settled'), originalRoot = proc.options.root
  proc.options.root = '/changed/gen-no'
  const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: proc.launch })
  await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
  await processCondition(proc.read, value => value?.frames.some(frame => frame.t === 'go'))
  const child = controllerChild(f, create)
  await checkerSettled(proc.children[0].closed)
  const proof = await processCondition(async () => child.liveRetirementScope(), value => value !== null)
  assert.equal(proof.root, originalRoot); assert.equal(proof.pid, proc.children[0].owned.launcher.pid)
  assert.equal(proof.scope.control.nonce, proof.nonce); assert.equal(proof.scope.identity.attemptId, create.binding.attemptId)
  assert.equal(proof.binding.commandId, create.commandId); assert.equal(proof.target.unit, create.payload.conversation.unit)
  proof.scope.control.nonce = 'changed'
  assert.notEqual(child.liveRetirementScope().scope.control.nonce, 'changed', 'returned scope is a detached snapshot')
  assert.equal(JSON.stringify(child.status()).includes(originalRoot), false, 'no private path in inspect status')
  child.dispose(); assert.equal(child.liveRetirementScope(), null)
})

test('copied acquisition fields cannot forge live retirement provenance', async t => {
  const proc = await realLauncherFixture(t, 'settled')
  const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: scope => ({ ...proc.launch(scope),
    root: proc.options.root, nonce: scope.nonce, runtimeUnitId: 'unit' }) })
  await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
  await processCondition(proc.read, value => value?.frames.some(frame => frame.t === 'go'))
  await checkerSettled(proc.children[0].closed)
  assert.equal(controllerChild(f, create).liveRetirementScope(), null)
})

test('concrete launch provenance rejects altered attempt nonce and unit before preparation', async t => {
  for (const field of ['attemptId', 'nonce']) {
    const proc = await realLauncherFixture(t)
    const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: scope => proc.launch({ ...scope,
      [field]: field === 'nonce' ? 'b'.repeat(64) : '00000000-0000-0000-0000-000000000999' }) })
    await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
    await processCondition(async () => proc.children, values => values.length === 1)
    await checkerSettled(proc.children[0].closed)
    assert.equal(controllerChild(f, create), null)
    assert.equal(f.requests.some(row => row.path.endsWith('/go')), false)
    assert.equal((await proc.read()).frames.length, 0)
  }
  const proc = await realLauncherFixture(t)
  const foreign = replyOwnedLauncher({ ...proc.options, runtimeUnitId: 'foreign' })
  const launch = scope => { const owned = foreign(scope); const closed = new Promise(resolve => owned.launcher.once('close', resolve));
    proc.children.push({ owned, closed }); return owned }
  const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch })
  await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
  await processCondition(async () => proc.children, values => values.length === 1); await checkerSettled(proc.children[0].closed)
  assert.equal(controllerChild(f, create), null); assert.equal(f.requests.some(row => row.path.endsWith('/go')), false)
})

test('owned unsettled exit and live child never expose live retirement scope', async t => {
  const proc = await realLauncherFixture(t)
  const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: proc.launch })
  await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
  await processCondition(proc.read, value => value?.frames.some(frame => frame.t === 'go'))
  const child = controllerChild(f, create); assert.equal(child.liveRetirementScope(), null)
  f.bridge.dispatch(registryControl(create, 'stop', 2)); await checkerSettled(proc.children[0].closed)
  assert.equal(child.liveRetirementScope(), null)
})


test('concrete launcher snapshots attempt and nonce once for both argv and private provenance', async t => {
  for (const field of ['attemptId', 'nonce']) {
    const proc = await realLauncherFixture(t)
    let reads = 0
    const f = await controllerBridgeFixture(t, { claim: () => ({ result: 'first' }), launch: scope => {
      const supplied = { ...scope }
      Object.defineProperty(supplied, field, { get: () => ++reads === 1 ?
        (field === 'nonce' ? 'b'.repeat(64) : '00000000-0000-0000-0000-000000000999') : scope[field] })
      return proc.launch(supplied)
    } })
    await controllerReady(f); const create = registryCommand(); f.bridge.dispatch(create)
    await processCondition(async () => proc.children, values => values.length === 1)
    await checkerSettled(proc.children[0].closed)
    assert.equal(reads, 1, field)
    assert.equal(controllerChild(f, create), null, field)
    assert.equal(f.requests.some(row => row.path.endsWith('/go')), false, field)
    assert.equal((await proc.read()).frames.length, 0, field)
  }
})


function noRetirementEffects() {
  return { repliesDir: '/replies', currentRoot: '/replies/gen-one', waitMs: 100,
    check: async () => assert.fail('unsupported launched retirement must not check/delete') }
}

test('unsupported launched retirement preserves completed answer delivery and terminal outcome', async t => {
  const held = deferred()
  const f = await terminalRegistry(t, undefined, {
    child: { observe: item => item.type === 'turn/end' ? held.promise : undefined },
    delivery: { acknowledged: async () => assert.fail('unsupported retirement ACK') },
    verification: noRetirementEffects(),
  })
  await reserveFirst(f.pipe); await completedChild(f)
  await until(() => f.status().terminal.state === 'no_failure')
  const before = f.child.inspect().relay.state
  assert.notEqual(before, 'closed')
  const retire = registryControl(f.create, 'retire', 3)
  for (let replay = 0; replay < 2; replay++) {
    assert.equal(await deliverySettled(f.registry.executeRetire(retire)), 'unresolved')
    assert.equal(f.admission.state, 'released')
    assert.equal(f.child.inspect().relay.state, before)
    assert.equal(f.status().terminal.state, 'no_failure')
    assert.equal(f.registry.entries.size, 1)
  }
  assert.equal(f.pipe.written.some(frame => frame.t === 'stop'), false)
  assert.deepEqual(f.controls, [])
  held.resolve(); await until(() => f.child.inspect().relay.state === 'closed')
  assert.equal(f.observations[0].data.text, 'complete synthetic answer')
  assert.deepEqual(f.posts.map(item => item.stage), ['delivered'])
})

test('unsupported launched retirement keeps live admission until an explicit Stop', async t => {
  const f = await terminalRegistry(t, undefined, {
    delivery: { acknowledged: async () => assert.fail('unsupported retirement ACK') },
    verification: noRetirementEffects(),
  })
  assert.equal(await deliverySettled(f.registry.executeRetire(registryControl(f.create, 'retire', 3))), 'unresolved')
  assert.equal(f.admission.state, 'released')
  assert.equal(f.pipe.written.some(frame => frame.t === 'stop'), false)
  assert.equal(f.registry.entries.size, 1)
  const cleanup = f.registry.stopReply(registryControl(f.create, 'stop', 4))
  assert.equal(f.admission.state, 'stopped')
  await terminalExit(f); f.clock.advance(10); await deliverySettled(cleanup)
  assert.equal(f.registry.entries.size, 1)
})

// This private compiled fixture models fd anchors with owned paths on Darwin; it is L1, not Linux proof.
async function liveHomeModule(t, anchored = true) {
  const fs = await import('node:fs/promises'), { tmpdir } = await import('node:os')
  const { join } = await import('node:path'), { pathToFileURL } = await import('node:url')
  const scratch = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'con-live-home-')))
  const original = new URL('../../packages/dsh-bundle/dist/reply-child.js', import.meta.url)
  let source = await fs.readFile(original, 'utf8')
  source = source.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, original).href}'`)
  source += '\nexport { ReplyLiveHome, verifyReplyLiveLease };\n'
  if (anchored) {
    assert.equal(source.split("process.platform !== 'linux'").length, 2)
    source = source.replace("process.platform !== 'linux'", 'false')
    const anchor = 'return `/proc/self/fd/${fd}/${name}`;'
    assert.equal(source.split(anchor).length, 2)
    source = source.replace(anchor, "return '/__h87_fd/' + fd + '/' + name;")
    source = source.replace('open as openReplyFile', 'open as originalOpenReplyFile')
    source = source.replace('unlink as unlinkReplyPath', 'unlink as originalUnlinkReplyPath')
    source = source.replace('lstat as statReplyPath', 'lstat as originalStatReplyPath').replace('opendir as openReplyDirectory', 'opendir as originalOpenReplyDirectory').replace('rmdir as removeReplyDirectory', 'rmdir as originalRemoveReplyDirectory')
    source += `
const fixturePaths = new Map();
function fixtureResolve(path) {
  const parts = path.split('/');
  return resolve(parts[1] === '__h87_fd' ? fixturePaths.get(Number(parts[2])) + '/' + parts.slice(3).join('/') : path);
}
function fixtureStats(info, path) { if (fixture.foreignDevice && (path === fixture.foreignDevice || path.startsWith(fixture.foreignDevice + '/'))) info.dev += 1n; return info; }
async function statReplyPath(path, options) { const actual = fixtureResolve(path); return fixtureStats(await originalStatReplyPath(actual, options), actual); }
async function openReplyDirectory(path, options) { return originalOpenReplyDirectory(fixtureResolve(path), options); }
async function removeReplyDirectory(path) { return originalRemoveReplyDirectory(fixtureResolve(path)); }

export const fixture = { remap(from, to) { for (const [fd, path] of fixturePaths) { if (path === from || path.startsWith(from + '/')) fixturePaths.set(fd, to + path.slice(from.length)); } }, handles: new Set(), beforeRead: null, beforeStat: null, afterOpen: null, beforeClose: null, beforeUnlink: null, afterUnlink: null, beforeSync: null,
  brand(child, root, nonce, pid) {
    Object.defineProperty(child.launcher, 'pid', { value: pid, configurable: true });
    childLaunchProvenance.set(child, { root, nonce, pid, runtimeUnitId: 'unit', attemptId: child.binding.attemptId,
      launcher: child.launcher, stream: child.stream });
  }
};
async function unlinkReplyPath(path) {
  await fixture.beforeUnlink?.(path); await originalUnlinkReplyPath(fixtureResolve(path)); await fixture.afterUnlink?.(path);
}
async function openReplyFile(path, flags) {
  const actual = fixtureResolve(path); const handle = await originalOpenReplyFile(actual, flags);
  fixturePaths.set(handle.fd, actual); fixture.handles.add(handle);
  const read = handle.read.bind(handle), close = handle.close.bind(handle), stat = handle.stat.bind(handle), sync = handle.sync.bind(handle);
  handle.sync = async () => { await fixture.beforeSync?.(fixturePaths.get(handle.fd)); return sync(); };
  handle.read = async (...args) => { await fixture.beforeRead?.(fixturePaths.get(handle.fd)); return read(...args); };
  handle.stat = async (...args) => { await fixture.beforeStat?.(fixturePaths.get(handle.fd)); return fixtureStats(await stat(...args), fixturePaths.get(handle.fd)); };
  handle.close = async () => { const fd = handle.fd; await fixture.beforeClose?.(fixturePaths.get(handle.fd)); await close(); fixturePaths.delete(fd); fixture.handles.delete(handle); };
  await fixture.afterOpen?.(fixturePaths.get(handle.fd));
  return handle;
}
`
  }
  const file = join(scratch, 'reader.mjs'); await fs.writeFile(file, source)
  const module = await import(pathToFileURL(file).href)
  t.after(async () => {
    if (module.fixture) {
      module.fixture.beforeClose = null; module.fixture.beforeStat = null; module.fixture.beforeRead = null
      const remaining = module.fixture.handles.size
      for (const handle of [...module.fixture.handles]) await handle.close()
      await fs.rm(scratch, { recursive: true, force: true })
      assert.equal(remaining, 0, 'reader must settle all owned descriptor closes before fixture cleanup')
    } else await fs.rm(scratch, { recursive: true, force: true })
  })
  const openHome = async (scope, checkpoint) => {
    const reader = module.ReplyLiveHome.create(scope, checkpoint)
    try { await reader.open(); return reader } catch (error) { await reader.close(); throw error }
  }
  return { fs, join, scratch, ...module, openHome }
}
function liveLeaseRows(scope) {
  const identity = { pid: scope.pid, startTime: '42', bootId: '00000000-0000-0000-0000-000000000001',
    executable: '/synthetic/python3', nonce: scope.nonce }
  return [{ version: 1, kind: 'launcher', identity }, { version: 1, kind: 'fork', nonce: scope.nonce },
    { version: 1, kind: 'child', identity: { ...identity, pid: scope.pid + 1, executable: '/synthetic/node' } }]
}
function encodeLiveLease(rows) {
  return Buffer.from(rows.map(row => JSON.stringify(row).replace(/[^\x00-\x7e]/g, character =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'))).join('\n') + '\n')
}
async function liveHomeFixture(t) {
  const f = await liveHomeModule(t), root = f.join(f.scratch, 'gen-one')
  const scope = { root, pid: 1234, nonce: 'a'.repeat(64), scope: recoveryOptions.scope,
    binding: recoveryOptions.binding, target: { replyId: 'synthetic', unit: 'calls_tokens' } }
  const home = f.join(root, scope.binding.attemptId), dsh = f.join(home, 'dsh-home')
  await f.fs.mkdir(dsh, { recursive: true, mode: 0o700 })
  for (const path of [root, home, dsh]) await f.fs.chmod(path, 0o700)
  const lease = f.join(home, 'lease.json'), journal = f.join(dsh, 'sophia-reply.jsonl')
  await f.fs.writeFile(lease, encodeLiveLease(liveLeaseRows(scope)), { mode: 0o600 })
  const text = Buffer.alloc(70_000, 97); await f.fs.writeFile(journal, text, { mode: 0o600 })
  return { ...f, scope, root, home, dsh, lease, journal, text }
}

test('live-home lease parser correlates whole writer records and refuses malformed or ambiguous records', async t => {
  const f = await liveHomeModule(t, false), scope = { pid: 1234, nonce: 'a'.repeat(64) }
  f.verifyReplyLiveLease(encodeLiveLease(liveLeaseRows(scope)), scope)
  const unicode = liveLeaseRows(scope); unicode[0].identity.executable = '/synthetic/è😀\x7f'
  f.verifyReplyLiveLease(encodeLiveLease(unicode), scope)
  const changes = [rows => { rows[0].identity.pid++ }, rows => { rows[0].identity.nonce = 'b'.repeat(64) },
    rows => { rows[1].nonce = 'b'.repeat(64) }, rows => { rows[2].identity.nonce = 'b'.repeat(64) },
    rows => { rows[2].identity.pid = scope.pid }, rows => { rows[2].identity.bootId = 'bad' },
    rows => { rows[0].identity.startTime = '18446744073709551616' }, rows => { rows[0].identity.executable = '/a/../b' },
    rows => { rows[0].identity.extra = true }, rows => { rows[1].extra = true }, rows => { rows[2].version = 2 },
    rows => { rows[2].identity.pid = false }, rows => { rows.pop() }]
  for (const change of changes) {
    const rows = liveLeaseRows(scope); change(rows)
    assert.throws(() => f.verifyReplyLiveLease(encodeLiveLease(rows), scope), /reply_live_home_unconfirmed/)
  }
  const bytes = encodeLiveLease(liveLeaseRows(scope))
  for (const invalid of [Buffer.alloc(0), Buffer.alloc(65_537), bytes.subarray(0, -1),
    Buffer.from(bytes.toString().replace('"version":1', '"version":0,"version":1')),
    Buffer.from(bytes.toString().replace('"version":1', '"version": 1')), Buffer.from([255, 10])]) {
    assert.throws(() => f.verifyReplyLiveLease(invalid, scope), /reply_live_home_unconfirmed/)
  }
})

test('live-home reader retains actual descriptors with bounded reads and idempotent close in anchor model', async t => {
  const f = await liveHomeFixture(t), reader = await f.openHome(f.scope, () => {})
  assert.ok(f.fixture.handles.size > 5)
  const first = await reader.read(), second = await reader.read()
  assert.equal(first.length, 65_536); assert.equal(second.length, 4464)
  assert.deepEqual(Buffer.concat([first, second]), f.text)
  assert.equal(await reader.read(), null)
  await reader.verify(); const closing = reader.close(); assert.equal(reader.close(), closing); await closing
  assert.equal(f.fixture.handles.size, 0)
  await assert.rejects(reader.read(), /unavailable/)
})

test('live-home reader refuses file substitutions, symlinks, unsafe metadata and mismatched lease before reading', async t => {
  for (const mode of ['lease-link', 'journal-link', 'dsh-link', 'home-link', 'root-link', 'hardlink', 'mode', 'nonce', 'empty', 'directory']) {
    const f = await liveHomeFixture(t)
    if (mode.endsWith('-link')) {
      const path = { 'lease-link': f.lease, 'journal-link': f.journal, 'dsh-link': f.dsh, 'home-link': f.home, 'root-link': f.root }[mode]
      await f.fs.rename(path, path + '-original'); await f.fs.symlink(path + '-original', path)
    } else if (mode === 'hardlink') await f.fs.link(f.lease, f.lease + '-copy')
    else if (mode === 'mode') await f.fs.chmod(f.journal, 0o644)
    else if (mode === 'nonce') await f.fs.writeFile(f.lease, encodeLiveLease(liveLeaseRows({ ...f.scope, nonce: 'b'.repeat(64) })))
    else if (mode === 'empty') await f.fs.truncate(f.lease, 0)
    else { await f.fs.unlink(f.journal); await f.fs.mkdir(f.journal, { mode: 0o700 }) }
    await assert.rejects(f.openHome(f.scope, () => {}), /reply_live_home_unconfirmed/, mode)
    assert.equal(f.fixture.handles.size, 0, mode)
  }
})

test('live-home reader rejects renamed roots and changed journal or lease after descriptor acquisition', async t => {
  for (const mode of ['rename', 'home', 'lease', 'journal', 'growth', 'mode']) {
    const f = await liveHomeFixture(t), reader = await f.openHome(f.scope, () => {})
    if (mode === 'rename' || mode === 'home') {
      const path = mode === 'rename' ? f.root : f.home
      await f.fs.rename(path, path + '-old'); await f.fs.mkdir(path, { mode: 0o700 })
    } else if (mode === 'growth') await f.fs.appendFile(f.journal, 'late')
    else if (mode === 'mode') await f.fs.chmod(f.lease, 0o640)
    else { const path = mode === 'lease' ? f.lease : f.journal; const data = await f.fs.readFile(path)
      await f.fs.rename(path, path + '-old'); await f.fs.writeFile(path, data, { mode: 0o600 }) }
    await assert.rejects(reader.read(), /reply_live_home_unconfirmed/, mode)
    await reader.close(); assert.equal(f.fixture.handles.size, 0)
  }
})

test('live-home reader keeps ownership through pending I/O and close prevents subsequent reads', async t => {
  const f = await liveHomeFixture(t), reader = await f.openHome(f.scope, () => {})
  const held = deferred(); let entered = false
  f.fixture.beforeRead = path => { if (path.endsWith('sophia-reply.jsonl')) { entered = true; return held.promise } }
  const reading = reader.read(); await until(() => entered)
  await assert.rejects(reader.read(), /unavailable/)
  const closing = reader.close()
  assert.equal(await Promise.race([closing.then(() => 'closed'), tick().then(() => 'waiting')]), 'waiting')
  assert.ok(f.fixture.handles.size > 0)
  held.resolve(); await assert.rejects(reading, /reply_live_home_unconfirmed/); await closing
  assert.equal(f.fixture.handles.size, 0)
})

test('live-home reader cancellation during acquisition closes the just-opened descriptor', async t => {
  const f = await liveHomeFixture(t); let cancelled = false
  f.fixture.afterOpen = path => { if (path.endsWith('lease.json')) cancelled = true }
  await assert.rejects(f.openHome(f.scope, () => { if (cancelled) throw new Error('cancelled') }), /reply_live_home_unconfirmed/)
  assert.equal(f.fixture.handles.size, 0)
})

test('live-home production reader refuses this unsupported host without opening a path', async t => {
  if (process.platform === 'linux') return
  const f = await liveHomeModule(t, false)
  await assert.rejects(f.openHome({ root: '/replies/gen-one', binding: registryCommand().binding }, () => assert.fail('unsupported platform')), /reply_live_home_unconfirmed/)
})

test('live-home reader failed identity remains latched after a renamed root is restored', async t => {
  const f = await liveHomeFixture(t), reader = await f.openHome(f.scope, () => {})
  await f.fs.rename(f.root, f.root + '-old'); await f.fs.mkdir(f.root, { mode: 0o700 })
  await assert.rejects(reader.verify(), /reply_live_home_unconfirmed/)
  await f.fs.rmdir(f.root); await f.fs.rename(f.root + '-old', f.root)
  await assert.rejects(reader.verify(), /reply_live_home_unconfirmed/)
  await reader.close(); assert.equal(f.fixture.handles.size, 0)
})

test('live-home reader failed stat still closes acquired descriptor and close failure stays unresolved', async t => {
  const f = await liveHomeFixture(t)
  f.fixture.beforeStat = path => { if (path.endsWith('lease.json')) throw new Error('synthetic stat failure') }
  await assert.rejects(f.openHome(f.scope, () => {}), /reply_live_home_unconfirmed/)
  assert.equal(f.fixture.handles.size, 0)
  f.fixture.beforeStat = null
  const reader = await f.openHome(f.scope, () => {})
  f.fixture.beforeClose = path => { if (path.endsWith('lease.json')) throw new Error('synthetic close failure') }
  const closing = reader.close(); await assert.rejects(closing, /reply_live_home_unconfirmed/)
  assert.equal(reader.close(), closing)
  assert.equal(f.fixture.handles.size, 1)
  assert.equal(reader.handles.length, 1, 'unresolved handle ownership retained')
  f.fixture.beforeClose = null
  for (const handle of [...f.fixture.handles]) await handle.close()
})

test('live-home reader discards a chunk changed during read and refuses future work', async t => {
  const f = await liveHomeFixture(t), reader = await f.openHome(f.scope, () => {})
  f.fixture.beforeRead = async path => { if (path.endsWith('sophia-reply.jsonl')) await f.fs.appendFile(path, 'late') }
  await assert.rejects(reader.read(), /reply_live_home_unconfirmed/)
  f.fixture.beforeRead = null
  await assert.rejects(reader.read(), /reply_live_home_unconfirmed/)
  await reader.close(); assert.equal(f.fixture.handles.size, 0)
})

test('live-home acquisition owner survives failed acquisition plus uncertain close', async t => {
  const f = await liveHomeFixture(t), reader = f.ReplyLiveHome.create(f.scope, () => {})
  f.fixture.beforeStat = path => { if (path.endsWith('lease.json')) throw new Error('synthetic failed acquisition') }
  f.fixture.beforeClose = path => { if (path.endsWith('lease.json')) throw new Error('synthetic failed close') }
  await assert.rejects(reader.open(), /reply_live_home_unconfirmed/)
  await assert.rejects(reader.close(), /reply_live_home_unconfirmed/)
  assert.equal(reader.handles.length, 1)
  assert.equal(f.fixture.handles.size, 1)
  f.fixture.beforeClose = null
  for (const handle of [...f.fixture.handles]) await handle.close()
})

test('live-home reader refuses verify before acquisition and reopening an existing reader', async t => {
  const f = await liveHomeFixture(t), unopened = f.ReplyLiveHome.create(f.scope, () => {})
  await assert.rejects(unopened.verify(), /reply_live_home_unconfirmed/)
  await unopened.close()
  const reader = await f.openHome(f.scope, () => {})
  await assert.rejects(reader.open(), /unavailable/)
  await reader.close(); assert.equal(f.fixture.handles.size, 0)
})

test('live-home parser accepts bytes from actual pinned Python lease writers', async t => {
  const f = await liveHomeModule(t, false), { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const launcher = fileURLToPath(new URL('../../apps/execution-host/reply/reply-launch.py', import.meta.url))
  const script = `import importlib.util,sys
spec=importlib.util.spec_from_file_location('con_source',sys.argv[1]); module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
first=module.ProcessIdentity(1234,'42','00000000-0000-0000-0000-000000000001','/synthetic/è😀\x7f','a'*64)
second=module.ProcessIdentity(1235,'43',first.boot_id,'/synthetic/node',first.nonce)
sys.stdout.buffer.write(module._launcher_records(first)+module._child_record_line(second))
`
  const bytes = execFileSync('/usr/bin/python3', ['-c', script, launcher], { timeout: 3000, maxBuffer: 65_536, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
  f.verifyReplyLiveLease(bytes, { pid: 1234, nonce: 'a'.repeat(64) })
})

test('live-home private metadata rejects special permission bits on every owned node type', async t => {
  for (const name of ['root', 'home', 'dsh', 'lease', 'journal']) {
    for (const special of [0o1000, 0o2000, 0o4000]) {
      const f = await liveHomeFixture(t), path = f[name]
      const mode = (['lease', 'journal'].includes(name) ? 0o600 : 0o700) | special
      await f.fs.chmod(path, mode)
      assert.equal((await f.fs.stat(path)).mode & 0o7777, mode, 'actual fixture mode applied')
      await assert.rejects(f.openHome(f.scope, () => {}), /reply_live_home_unconfirmed/, `${name}:${mode.toString(8)}`)
      assert.equal(f.fixture.handles.size, 0)
    }
  }
})

async function readWholeHome(reader) { while (await reader.read() !== null) {} }

test('live-home removal unlinks contained files and symlinks without touching outside targets', async t => {
  const f = await liveHomeFixture(t), outside = f.join(f.scratch, 'outside')
  await f.fs.mkdir(outside); await f.fs.writeFile(f.join(outside, 'canary'), 'untouched')
  await f.fs.symlink(outside, f.join(f.home, 'outside-link'))
  await f.fs.mkdir(f.join(f.dsh, 'cache')); await f.fs.writeFile(f.join(f.dsh, 'cache', 'synthetic'), 'private')
  const reader = await f.openHome(f.scope, () => {})
  await readWholeHome(reader); await reader.remove(); await reader.close()
  await assert.rejects(f.fs.lstat(f.home), { code: 'ENOENT' })
  assert.equal(await f.fs.readFile(f.join(outside, 'canary'), 'utf8'), 'untouched')
  assert.equal(f.fixture.handles.size, 0)
})

test('live-home inventory refuses hardlinks and excess depth before deleting any content', async t => {
  for (const mode of ['hardlink', 'depth', 'directories']) {
    const f = await liveHomeFixture(t)
    if (mode === 'hardlink') {
      const outside = f.join(f.scratch, 'outside'); await f.fs.writeFile(outside, 'untouched')
      await f.fs.link(outside, f.join(f.home, 'hardlink'))
    } else if (mode === 'depth') await f.fs.mkdir(f.join(f.home, ...Array(33).fill('level')), { recursive: true })
    else for (let n = 0; n < 64; n++) await f.fs.mkdir(f.join(f.home, `dir${n}`))
    const reader = await f.openHome(f.scope, () => {}); await readWholeHome(reader)
    await assert.rejects(reader.remove(), /reply_live_home_unconfirmed/); await reader.close()
    assert.deepEqual(await f.fs.readFile(f.journal), f.text)
    assert.deepEqual(await f.fs.readFile(f.lease), encodeLiveLease(liveLeaseRows(f.scope)))
  }
})

// Private fixture-only provenance injection composes lifecycle/ACK/removal on Darwin. Not Linux containment proof.
async function liveRetireFixture(t, overrides = {}) {
  const h = await liveHomeFixture(t), nonce = h.scope.nonce
  const f = await childFixture(t, { noGo: true, noReady: true, ChildClass: h.ReplyChild, nonce })
  const scope = structuredClone(apiScope); scope.control.nonce = nonce
  const start = { ...apiFrames([recoveryStart])[0], nonce }, create = registryChildCommand(), posts = []
  const admission = new h.ReplyAdmission(recoveryOptions.binding, 50, {
    claim: async () => ({ result: 'first' }), spawn: () => f.child,
    prepare: (child, signal) => child.prepare(start, scope.control, signal), authorize: async () => ({ result: 'go' }),
  }, f.clock)
  const journal = recoveryFixture([recoveryStart, readyRecord], { states: [] })
  const acknowledged = async (body, signal) => {
    const answer = journal.answer(body)
    return overrides.acknowledged ? overrides.acknowledged(body, answer, signal) : answer
  }
  const registry = new h.ReplyChildren(registryOwner(), () => admission, registryDelivery(async values => {
    posts.push(values[0]); await overrides.receipts?.(values)
  }, { acknowledged, waitMs: 100 }), f.clock)
  t.after(async () => { registry.dispose(); await tick() })
  const execution = registry.executeCreate(create)
  await until(() => f.pipe.written.some(row => row.t === 'start'))
  f.pipe.receive(readyRecord); await deliverySettled(execution)
  await terminalExit(f); await until(() => f.child.inspect().relay.state === 'closed')
  await until(() => registry.deliveryStatus(registryControl(create, 'inspect'))[0].terminal.state === 'retained')
  h.fixture.brand(f.child, h.root, nonce, h.scope.pid)
  assert.notEqual(f.child.liveRetirementScope(), null)
  await h.fs.writeFile(h.journal, journalBytes([start, readyRecord]))
  const retire = registryControl(create, 'retire', 3)
  return { ...h, ...f, admission, registry, create, retire, execution, posts, journalFixture: journal }
}

test('live-owned retirement composes retained receipts journal API and home deletion before one prune', async t => {
  const f = await liveRetireFixture(t), original = f.registry.createReply(f.create)
  const pending = f.registry.executeRetire(f.retire)
  assert.equal(f.registry.executeRetire(f.retire), pending)
  assert.equal(await filesystemSettled(pending), 'retained')
  await assert.rejects(f.fs.lstat(f.home), { code: 'ENOENT' })
  assert.equal(f.registry.entries.size, 0); assert.equal(f.fixture.handles.size, 0)
  assert.equal(f.journalFixture.acks.length, 2)
  await tick(); assert.equal(f.posts.filter(row => row.reason === 'home_deleted').length, 1)
  assert.equal(await f.registry.executeRetire(f.retire), 'retained')
  assert.equal(f.registry.createReply(f.create), original)
  assert.equal(f.registry.executeCreate(f.create), f.execution)
  assert.equal(f.pipe.written.filter(row => row.t === 'start').length, 1)
})

test('live-owned retirement requires every API predicate before any removal and preserves capacity', async t => {
  for (const name of ['observations', 'usage', 'reservations', 'terminalState', 'terminalWriter', 'createAnswered', 'capture', 'payloadScrubbed']) {
    const f = await liveRetireFixture(t, { acknowledged: async (_body, answer) => { answer.predicates[name].met = false; return answer } })
    assert.equal(await filesystemSettled(f.registry.executeRetire(f.retire)), 'unresolved', name)
    assert.equal(f.registry.entries.size, 1); assert.equal(f.fixture.handles.size, 0)
    assert.equal(f.posts.some(row => row.reason === 'home_deleted'), false)
    await f.fs.lstat(f.journal)
  }
})

test('live-owned retirement retains in-flight API work after deadline and forbids a second pass', async t => {
  const held = deferred(); let entered = false
  const f = await liveRetireFixture(t, { acknowledged: async (_body, answer) => { entered = true; await held.promise; return answer } })
  const pending = f.registry.executeRetire(f.retire)
  await processCondition(async () => entered, Boolean)
  f.clock.advance(100)
  assert.equal(await filesystemSettled(pending), 'unresolved')
  assert.equal(f.registry.executeRetire(f.retire), pending)
  assert.ok(f.fixture.handles.size > 0)
  assert.throws(() => f.registry.preflightJournal(registryControl(f.create, 'inspect'), {
    ...recoveryOptions, scope: f.child.liveRetirementScope().scope,
  }, f.journalFixture.operations), /busy/)
  held.resolve()
  await processCondition(async () => f.fixture.handles.size, size => size === 0)
  assert.equal(f.registry.entries.size, 1); await f.fs.lstat(f.home)
  assert.equal(f.posts.some(row => row.reason === 'home_deleted'), false)
})

async function filesystemSettled(pending) {
  const sentinel = Symbol('filesystem deadline'); let timer
  try {
    const result = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve(sentinel), 3000) })])
    assert.notEqual(result, sentinel, 'owned filesystem operation must settle before bounded sentinel')
    return result
  } finally { clearTimeout(timer) }
}

async function settledLivePass(f) {
  await processCondition(async () => [...f.registry.retirements.values()][0]?.live?.active, value => value === false)
}

test('live-owned retirement waits missing own receipt ACK without fencing or resetting sender', async t => {
  const held = deferred()
  const f = await liveRetireFixture(t, { receipts: values => values[0].stage === 'failed' ? held.promise : undefined })
  const pending = f.registry.executeRetire(f.retire)
  await tick(); assert.equal(f.fixture.handles.size, 0); assert.equal(f.journalFixture.acks.length, 0)
  assert.equal(f.admission.state, 'released'); assert.equal(f.controls.length, 0)
  const before = f.posts.length
  held.resolve(); await tick(); await tick(); f.clock.advance(10)
  assert.equal(await filesystemSettled(pending), 'retained')
  assert.equal(f.posts.filter(row => row.stage === 'failed').length, 1)
  assert.equal(f.posts.length, before + 1, 'only cleanup receipt is new')
})

test('live-owned retirement refuses wrong lease identity and malformed journal without deleting', async t => {
  for (const mode of ['nonce', 'pid', 'journal', 'unit']) {
    const f = await liveRetireFixture(t)
    if (mode === 'nonce' || mode === 'pid') {
      const rows = liveLeaseRows(f.scope)
      if (mode === 'nonce') rows[0].identity.nonce = 'b'.repeat(64)
      else rows[0].identity.pid++
      await f.fs.writeFile(f.lease, encodeLiveLease(rows))
    } else if (mode === 'journal') await f.fs.appendFile(f.journal, 'torn')
    else {
      // Original prepared child and journal disagree on the reserved accounting unit.
      f.child.journalTarget = { ...f.child.journalTarget, unit: 'usd' }
      const frames = apiFrames(recoveryFrames).map(row => row.t === 'start' ? { ...row, nonce: f.scope.nonce } : row)
      await f.fs.writeFile(f.journal, journalBytes(frames))
    }
    assert.equal(await filesystemSettled(f.registry.executeRetire(f.retire)), 'unresolved', mode)
    assert.equal(f.registry.entries.size, 1); assert.equal(f.fixture.handles.size, 0)
    await f.fs.lstat(f.home)
  }
})

test('live-owned retirement invalidates Stop new epoch disposal and deadline during an owned read', async t => {
  for (const mode of ['stop', 'epoch', 'dispose', 'deadline']) {
    const f = await liveRetireFixture(t), held = deferred(); let entered = false
    f.fixture.beforeRead = async path => { if (path.endsWith('sophia-reply.jsonl')) { entered = true; await held.promise } }
    const pending = f.registry.executeRetire(f.retire)
    await processCondition(async () => entered, Boolean)
    if (mode === 'stop') f.registry.stopReply(registryControl(f.create, 'stop', 4))
    if (mode === 'epoch') await f.registry.executeInspect(registryControl(f.create, 'inspect', 4))
    if (mode === 'dispose') f.registry.dispose()
    if (mode === 'deadline') f.clock.advance(100)
    held.resolve()
    assert.equal(await filesystemSettled(pending), 'unresolved', mode)
    await settledLivePass(f)
    assert.equal(f.fixture.handles.size, 0); assert.equal(f.registry.entries.size, 1)
    assert.equal(f.posts.some(row => row.reason === 'home_deleted'), false); await f.fs.lstat(f.home)
  }
})

test('partial live-home removal or uncertain directory sync never prunes and cannot be retried as absence', async t => {
  for (const mode of ['unlink', 'sync', 'stop', 'deadline']) {
    const f = await liveRetireFixture(t), privateFile = f.join(f.home, 'first-private')
    await f.fs.writeFile(privateFile, 'synthetic')
    let unlinked = 0
    f.fixture.afterUnlink = async () => {
      unlinked++
      if (mode === 'unlink') throw new Error('synthetic uncertain deletion')
      if (mode === 'stop') f.registry.stopReply(registryControl(f.create, 'stop', 4))
      if (mode === 'deadline') f.clock.advance(100)
    }
    if (mode === 'sync') f.fixture.beforeSync = async () => { throw new Error('synthetic sync uncertainty') }
    const pending = f.registry.executeRetire(f.retire)
    assert.equal(await filesystemSettled(pending), 'unresolved', mode); await settledLivePass(f)
    assert.equal(unlinked, 1); assert.equal(f.registry.entries.size, 1); assert.equal(f.fixture.handles.size, 0)
    assert.equal(f.posts.some(row => row.reason === 'home_deleted'), false)
    if (mode !== 'stop') assert.equal(f.registry.executeRetire(f.retire), pending)
    assert.equal(unlinked, 1)
  }
})

test('live-home removal refuses names beyond inventory cap before deleting', async t => {
  const f = await liveHomeFixture(t)
  for (let n = 0; n < 4096; n++) await f.fs.writeFile(f.join(f.home, `entry${n}`), '')
  const reader = await f.openHome(f.scope, () => {}); await readWholeHome(reader)
  await assert.rejects(reader.remove(), /reply_live_home_unconfirmed/); await reader.close()
  assert.equal((await f.fs.readdir(f.home)).length, 4098)
})

test('live-owned retirement keeps uncertain close after successful removal as unresolved', async t => {
  const f = await liveRetireFixture(t)
  f.fixture.beforeClose = async path => { if (path.endsWith('/gen-one')) throw new Error('synthetic uncertain close') }
  const pending = f.registry.executeRetire(f.retire)
  assert.equal(await filesystemSettled(pending), 'unresolved'); await settledLivePass(f)
  await assert.rejects(f.fs.lstat(f.home), { code: 'ENOENT' })
  assert.equal(f.registry.entries.size, 1); assert.equal(f.registry.executeRetire(f.retire), pending)
  assert.equal(f.posts.some(row => row.reason === 'home_deleted'), false)
  assert.equal(f.fixture.handles.size, 1)
  f.fixture.beforeClose = null
  for (const handle of [...f.fixture.handles]) await handle.close() // Fixture teardown only; no product cleanup receipt.
})

test('live-owned retirement detects renamed home after a partial delete and stops further removals', async t => {
  const f = await liveRetireFixture(t), moved = f.home + '-moved'
  await f.fs.writeFile(f.join(f.home, 'first'), 'synthetic'); let unlinked = 0
  f.fixture.afterUnlink = async () => {
    if (++unlinked === 1) { await f.fs.rename(f.home, moved); await f.fs.mkdir(f.home); await f.fs.writeFile(f.join(f.home, 'canary'), 'untouched') }
  }
  assert.equal(await filesystemSettled(f.registry.executeRetire(f.retire)), 'unresolved'); await settledLivePass(f)
  assert.equal(unlinked, 1); assert.equal(await f.fs.readFile(f.join(f.home, 'canary'), 'utf8'), 'untouched')
  assert.equal(f.registry.entries.size, 1); assert.equal(f.fixture.handles.size, 0)
})

test('independent H87 moved nested descriptor must be refused before deleting its outside contents', async t => {
  const f = await liveHomeFixture(t), nested = f.join(f.home, 'nested'), moved = f.join(f.scratch, 'moved-outside-home')
  await f.fs.mkdir(nested, { mode: 0o700 }); await f.fs.writeFile(f.join(nested, 'victim'), 'preserve')
  await f.fs.writeFile(f.join(f.home, 'first-private'), 'synthetic')
  const reader = await f.openHome(f.scope, () => {}); await readWholeHome(reader)
  let changed = false
  f.fixture.afterUnlink = async () => {
    if (changed) return
    changed = true
    await f.fs.rename(nested, moved); f.fixture.remap(nested, moved)
    await f.fs.mkdir(nested, { mode: 0o700 }); await f.fs.writeFile(f.join(nested, 'canary'), 'untouched')
  }
  await assert.rejects(reader.remove(), /reply_live_home_unconfirmed/)
  await reader.close()
  assert.equal(changed, true)
  assert.equal(await f.fs.readFile(f.join(nested, 'canary'), 'utf8'), 'untouched')
  assert.equal(await f.fs.lstat(f.join(moved, 'victim')).then(() => true, () => false), true,
    'must not unlink through retained nested fd after it was moved outside the owned home')
})

test('independent H87 refuses a consistent foreign-device subtree before any deletion', async t => {
  const f = await liveHomeFixture(t), nested = f.join(f.home, 'mounted-subtree')
  await f.fs.mkdir(nested, { mode: 0o700 }); await f.fs.writeFile(f.join(nested, 'external-canary'), 'preserve')
  f.fixture.foreignDevice = nested
  const reader = await f.openHome(f.scope, () => {}); await readWholeHome(reader)
  try { await assert.rejects(reader.remove(), /reply_live_home_unconfirmed/, 'foreign device must refuse before mutation') }
  finally { await reader.close() }
  assert.equal(await f.fs.readFile(f.join(nested, 'external-canary'), 'utf8'), 'preserve')
})

test('live-home refuses a different-device home from its retained generation before removal', async t => {
  const f = await liveHomeFixture(t); f.fixture.foreignDevice = f.home
  await assert.rejects(f.openHome(f.scope, () => {}), /reply_live_home_unconfirmed/)
  assert.deepEqual(await f.fs.readFile(f.journal), f.text); assert.equal(f.fixture.handles.size, 0)
})


test('erased create unit is recovered from immutable correlated rows for both units, including zero usage', async () => {
  for (const unit of ['calls_tokens', 'usd']) for (const amount of [0, 7]) {
    const frames = recoveryFrames.filter(f => f.t !== 'settled').map(f => f.t === 'settle'
      ? { ...f, used: { calls: 1, tokens: amount, priceMicros: amount }, usage: { inputTokens: amount, outputTokens: 0 } } : f)
    const fixture = recoveryFixture(frames, { unit, states: [{ ordinal: 1, state: 'reserved' }] })
    const result = await recoverReplyJournal({ ...recoveryOptions, unit: null }, fixture.operations)
    assert.equal(result.databaseBarrier, true)
    assert.deepEqual(fixture.settlements.map(x => x.used), [{ calls: 1, tokens: unit === 'calls_tokens' ? amount : 0,
      priceMicros: unit === 'usd' ? amount : 0 }])
  }
})

test('unit provenance rejects original mismatch, missing unit and later changed unit before another settlement', async () => {
  const mismatch = recoveryFixture(recoveryFrames, { unit: 'usd' })
  await assert.rejects(recoverReplyJournal(recoveryOptions, mismatch.operations), /reply_recovery_unit_conflict/)
  for (const changed of ['missing', 'changed']) {
    const f = recoveryFixture()
    f.operations.acknowledged = async request => {
      const answer = f.answer(request)
      if (changed === 'missing') delete answer.predicates.reservations.states[0].unit
      else if (f.acks.length > 1) answer.predicates.reservations.states[0].unit = 'usd'
      return answer
    }
    await assert.rejects(recoverReplyJournal({ ...recoveryOptions, unit: null }, f.operations), /reply_recovery_(ack_invalid|unit_conflict)/)
    assert.equal(f.settlements.length, 0)
  }
})

test('erased unit never guesses for a missing admitted row; no-row no-call journal needs no unit', async () => {
  const missing = recoveryFixture(recoveryFrames, { states: [] })
  assert.equal((await recoverReplyJournal({ ...recoveryOptions, unit: null }, missing.operations)).accountingVerified, false)
  assert.equal(missing.settlements.length, 0)
  const empty = recoveryFixture(recoveryFrames.filter(f => ['start', 'ready'].includes(f.t)), { states: [] })
  assert.equal((await recoverReplyJournal({ ...recoveryOptions, unit: null }, empty.operations)).accountingVerified, true)
  assert.equal(empty.settlements.length, 0)
})
