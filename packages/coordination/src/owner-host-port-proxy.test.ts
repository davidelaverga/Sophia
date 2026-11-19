import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkExchangeRequest,
  exchangeRequest,
  type EnqueueResult,
  type ExchangeRequest,
  type ExchangeStore,
  type ExchangeView,
  type SettleResult,
} from './owner-host-channel.ts'
import { canonicalJson } from './canonical.ts'
import { OwnerHostPortProxy } from './owner-host-port-proxy.ts'
import { digestOf, sha256Hex, type RunnerEnvelope } from './runner-port.ts'
import { deriveIdentity } from './t3-port-mapping.ts'

const JOURNAL = '00000000-0000-4000-8000-0000000000aa'
const NS = 'client:auth-session-1'
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
  environmentRef: 'env-owner-1',
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

interface Script {
  enqueue?: EnqueueResult
  /** Views the store answers in turn; the last repeats. */
  views?: ExchangeView[]
  settle?: SettleResult
  throwOn?: 'enqueue' | 'exchange'
}

/** A scripted worker-side store that records every call. */
function store(script: Script) {
  const calls: { enqueue: { key: string; request: ExchangeRequest; deadlineMs: number; journalId: string }[] } & {
    exchange: number
    settle: number
  } = { enqueue: [], exchange: 0, settle: 0 }
  let i = 0
  const s: ExchangeStore = {
    enqueue(input) {
      if (script.throwOn === 'enqueue') return Promise.reject(new Error('database unavailable'))
      calls.enqueue.push(input)
      return Promise.resolve(script.enqueue ?? { result: 'queued', exchangeId: 'x1', state: 'queued' })
    },
    exchange() {
      if (script.throwOn === 'exchange') return Promise.reject(new Error('database unavailable'))
      calls.exchange += 1
      const views = script.views ?? []
      const v = views[Math.min(i, views.length - 1)] ?? null
      i += 1
      return Promise.resolve(v)
    },
    settle() {
      calls.settle += 1
      return Promise.resolve(script.settle ?? { result: 'not_sent', state: 'lapsed', reason: 'no GO was granted' })
    },
  }
  return { s, calls }
}
const view = (over: Partial<ExchangeView>): ExchangeView => ({
  exchangeId: 'x1',
  state: 'queued',
  goCount: 0,
  answer: null,
  reason: null,
  deadlinePassed: false,
  ...over,
})
const proxy = (s: ExchangeStore, over: { namespace?: string } = {}) =>
  new OwnerHostPortProxy({
    store: s,
    ownerId: env().ownerId,
    environmentRef: 'env-owner-1',
    journalId: JOURNAL,
    namespace: over.namespace ?? NS,
    deadlineMs: 5000,
    pollMs: 10,
    sleep: () => Promise.resolve(),
  })
const send = (p: OwnerHostPortProxy, e = env()) => p.send(e, digestOf(e), JOURNAL)
const ident = (e = env()) => ({ envelope: e, digest: digestOf(e), journalId: JOURNAL })

describe('the owner-host port proxy: send', () => {
  it('queues one send keyed by its operation, with the whole identity, and returns the checked answer', async () => {
    const identity = deriveIdentity(env(), NS)
    const received = { kind: 'received', identity, runId: 'run-1', delivery: 'started' }
    const { s, calls } = store({
      views: [
        view({}),
        view({ state: 'go_granted', goCount: 1 }),
        view({ state: 'answered', goCount: 1, answer: received }),
      ],
    })
    const p = proxy(s)
    assert.equal(p.journalId, JOURNAL)
    assert.deepEqual(await send(p), received)
    assert.equal(calls.enqueue.length, 1)
    const q = calls.enqueue[0]
    assert.equal(q?.key, `send:${env().operationId}`)
    assert.equal(q?.journalId, JOURNAL)
    assert.equal(q?.deadlineMs, 5000)
    assert.deepEqual(q?.request, {
      v: 1,
      kind: 'send',
      journalId: JOURNAL,
      projectId: env().projectId,
      operationId: env().operationId,
      digest: digestOf(env()),
      envelope: env(),
    })
    assert.equal(calls.settle, 0)
  })

  it('keeps a receipt under another namespace unknown: the bound namespace is the one T3 derives under', async () => {
    const other = deriveIdentity(env(), 'client:another-sign-in')
    const { s } = store({
      views: [
        view({
          state: 'answered',
          goCount: 1,
          answer: { kind: 'received', identity: other, runId: 'r', delivery: 'started' },
        }),
      ],
    })
    const a = await send(proxy(s))
    assert.equal(a.kind, 'unknown')
  })

  it('answers refused when no host may take it: nothing was queued', async () => {
    const { s, calls } = store({ enqueue: { result: 'no_host' } })
    const a = await send(proxy(s))
    assert.equal(a.kind, 'refused')
    assert.equal(calls.exchange, 0)
    assert.equal(calls.settle, 0)
  })

  it('answers conflict for another payload under the same key', async () => {
    const { s } = store({ enqueue: { result: 'conflict', exchangeId: 'x1' } })
    assert.equal((await send(proxy(s))).kind, 'conflict')
  })

  it('answers refused for a send denied before any GO, as the GO ledger proves', async () => {
    const { s, calls } = store({
      views: [view({ state: 'denied', reason: 'at go: the goal changed' })],
      settle: { result: 'not_sent', state: 'denied', reason: 'at go: the goal changed' },
    })
    const a = await send(proxy(s))
    assert.deepEqual(a, { kind: 'refused', reason: 'the owner host was never granted GO: at go: the goal changed' })
    assert.equal(calls.settle, 1)
  })

  it('answers refused when the deadline passed with no GO', async () => {
    const { s } = store({ views: [view({ state: 'delivered', deadlinePassed: true })] })
    assert.equal((await send(proxy(s))).kind, 'refused')
  })

  it('NEVER answers refused after a GO: the deadline passing with no answer is unknown', async () => {
    const { s } = store({
      views: [view({ state: 'go_granted', goCount: 1, deadlinePassed: true })],
      settle: { result: 'possible', reason: 'GO was granted and no answer came: a send may have happened' },
    })
    const a = await send(proxy(s))
    assert.equal(a.kind, 'unknown')
    assert.match(a.kind === 'unknown' ? a.reason : '', /may have happened/)
  })

  it('takes an answer that arrives as it settles', async () => {
    const identity = deriveIdentity(env(), NS)
    // r4: a create's receipt names its run (a null run is no receipt; see the operation-aware create tests).
    const answer = { kind: 'received', identity, runId: 'run-1', delivery: 'started' }
    const { s } = store({
      views: [view({ state: 'go_granted', goCount: 1, deadlinePassed: true })],
      settle: { result: 'answered', answer },
    })
    assert.deepEqual(await send(proxy(s)), answer)
  })

  it('keeps a malformed answer unknown', async () => {
    const { s } = store({ views: [view({ state: 'answered', goCount: 1, answer: { kind: 'not_sent' } })] })
    assert.equal((await send(proxy(s))).kind, 'unknown')
  })

  it('stops waiting a little past the deadline even if the store never says so', async () => {
    const { s, calls } = store({
      views: [view({ state: 'go_granted', goCount: 1 })],
      settle: { result: 'possible', reason: 'p' },
    })
    const p = new OwnerHostPortProxy({
      store: s,
      ownerId: env().ownerId,
      environmentRef: 'env-owner-1',
      journalId: JOURNAL,
      namespace: NS,
      deadlineMs: 1000,
      pollMs: 10,
    })
    assert.equal((await send(p)).kind, 'unknown')
    assert.ok(calls.exchange > 1)
  })

  it('refuses a digest that does not bind the envelope, and another journal is unknown: nothing queued', async () => {
    const { s, calls } = store({})
    const p = proxy(s)
    assert.equal((await p.send(env(), digestOf(env({ message: 'x' })), JOURNAL)).kind, 'refused')
    assert.equal((await p.send(env(), digestOf(env()), '00000000-0000-4000-8000-0000000000bb')).kind, 'unknown')
    assert.equal(calls.enqueue.length, 0)
  })

  it('lets a store failure propagate, so the dispatcher records unknown', async () => {
    const { s } = store({ throwOn: 'enqueue' })
    await assert.rejects(send(proxy(s)), /database unavailable/)
  })

  it('bounds its deadline', () => {
    const { s } = store({})
    for (const deadlineMs of [999, 120_001, 1.5])
      assert.throws(
        () =>
          new OwnerHostPortProxy({
            store: s,
            ownerId: 'o',
            environmentRef: 'e',
            journalId: JOURNAL,
            namespace: NS,
            deadlineMs,
          }),
        /out of bounds/,
      )
  })
})

describe('the owner-host port proxy: reconcile and observe', () => {
  it('queues a read with a fresh key each time and passes a settled answer through', async () => {
    const identity = deriveIdentity(env(), NS)
    const settled = { kind: 'settled', identity, reason: 'proven' }
    const { s, calls } = store({ views: [view({ state: 'answered', answer: settled })] })
    const p = proxy(s)
    assert.deepEqual(await p.reconcile(ident()), settled)
    await p.reconcile(ident())
    const keys = calls.enqueue.map((c) => c.key)
    assert.equal(new Set(keys).size, 2)
    for (const k of keys) assert.match(k, /^reconcile:00000000-0000-4000-8000-000000000001:[0-9a-f-]{36}$/)
    assert.equal(calls.enqueue[0]?.request.kind, 'reconcile')
  })

  it('is unknown with no host, no answer, or a failure: a read is never refused', async () => {
    for (const script of [
      { enqueue: { result: 'no_host' } } as Script,
      { views: [view({ state: 'delivered', deadlinePassed: true })] },
      { views: [view({ state: 'lapsed' })] },
      { throwOn: 'exchange' } as Script,
    ]) {
      const { s } = store(script)
      assert.equal((await proxy(s).reconcile(ident())).kind, 'unknown')
      assert.equal((await proxy(s).observe(ident())).kind, 'unknown')
    }
  })

  it('passes a checked observation through and keeps a malformed one unknown', async () => {
    const { s } = store({
      views: [view({ state: 'answered', answer: { kind: 'run', status: 'running', terminal: false } })],
    })
    assert.deepEqual(await proxy(s).observe(ident()), { kind: 'run', status: 'running', terminal: false })
    const bad = store({ views: [view({ state: 'answered', answer: { kind: 'run', status: 'running' } })] })
    assert.equal((await proxy(bad.s).observe(ident())).kind, 'unknown')
  })

  it("passes a run's checked report through (INC04-S03b B2): malformed content is dropped, the status kept", async () => {
    const reportedModels = {
      state: 'unavailable',
      threadId: 't-1',
      runId: 'r-1',
      reason: 'attempts_not_loaded',
      collectedAt: 'x',
    }
    const run = { kind: 'run', status: 'completed', terminal: true }
    const ok = store({ views: [view({ state: 'answered', answer: { ...run, reportedModels } })] })
    assert.deepEqual(await proxy(ok.s).observe(ident()), { ...run, reportedModels })
    const bad = store({
      views: [
        view({ state: 'answered', answer: { ...run, reportedModels: { state: 'collected', model: 'secret-m' } } }),
      ],
    })
    const got = await proxy(bad.s).observe(ident())
    assert.deepEqual(got, { ...run, reportedModels: { state: 'malformed', reason: 'invalid' } })
    assert.ok(!JSON.stringify(got).includes('secret-m'))
  })

  it('checks an observation for its own operation: a Stop needs the thread proof, a Create or Input its run (r5)', async () => {
    const observe = async (kind: 'create' | 'input' | 'stop', answer: unknown) => {
      const e = env({
        kind,
        ...(kind === 'create' ? {} : { targetOperationId: '00000000-0000-4000-8000-0000000000aa' }),
      })
      const lines: string[] = []
      const p = new OwnerHostPortProxy({
        store: store({ views: [view({ state: 'answered', answer })] }).s,
        ownerId: 'o',
        environmentRef: 'e',
        journalId: JOURNAL,
        namespace: NS,
        deadlineMs: 1000,
        pollMs: 10,
        sleep: () => Promise.resolve(),
        log: (l) => lines.push(l),
      })
      return { got: await p.observe(ident(e)), lines }
    }
    const terminalRun = { kind: 'run', status: 'completed', terminal: true }
    assert.deepEqual((await observe('stop', { kind: 'no_active_run' })).got, { kind: 'no_active_run' })
    for (const answer of [terminalRun, { kind: 'run', status: 'running', terminal: true }]) {
      const out = await observe('stop', answer)
      assert.equal(out.got.kind, 'unknown', JSON.stringify(answer))
      assert.match(out.got.kind === 'unknown' ? out.got.reason : '', /does not prove a stop's state/)
      assert.equal(out.lines.length, 1)
      assert.ok(!out.lines[0]?.includes('running'), 'the log names no host-supplied content')
    }
    for (const kind of ['create', 'input'] as const) {
      assert.deepEqual((await observe(kind, terminalRun)).got, terminalRun)
      for (const answer of [
        { kind: 'no_active_run' },
        { kind: 'run', status: 'running', terminal: true },
        { kind: 'run', status: 'mystery', terminal: true },
      ])
        assert.equal((await observe(kind, answer)).got.kind, 'unknown', `${kind}: ${JSON.stringify(answer)}`)
    }
  })

  it('answers unknown for another journal without queuing', async () => {
    const { s, calls } = store({})
    const p = proxy(s)
    assert.equal((await p.reconcile({ ...ident(), journalId: '00000000-0000-4000-8000-0000000000bb' })).kind, 'unknown')
    assert.equal(calls.enqueue.length, 0)
  })
})

describe('operation-aware receipts (r2, CC003-S1A-STUDY-F01)', () => {
  const THREAD = 'mcp:launch:0000000000000000000000000000000000000000000000000000000000000001'
  const input = env({
    kind: 'input',
    title: null,
    message: 'And the outbox boundary?',
    targetOperationId: '00000000-0000-4000-8000-000000000009',
    nativeThreadId: THREAD,
  })
  const stop = env({
    kind: 'stop',
    title: null,
    message: null,
    targetOperationId: '00000000-0000-4000-8000-000000000009',
    nativeThreadId: THREAD,
  })
  const received = (e: RunnerEnvelope, runId: unknown, delivery: string) => ({
    kind: 'received',
    identity: deriveIdentity(e, NS),
    runId,
    delivery,
  })
  const viaSend = async (e: RunnerEnvelope, answer: unknown) => {
    const { s } = store({ views: [view({ state: 'answered', goCount: 1, answer })] })
    return proxy(s).send(e, digestOf(e), JOURNAL)
  }
  const viaReconcile = async (e: RunnerEnvelope, answer: unknown) => {
    const { s } = store({ views: [view({ state: 'answered', answer })] })
    return proxy(s).reconcile({ envelope: e, digest: digestOf(e), journalId: JOURNAL })
  }

  for (const [path, run] of [
    ['send', viaSend],
    ['reconcile', viaReconcile],
  ] as const) {
    for (const [label, runId] of [
      ['null', null],
      ['empty', ''],
      ['blank', '   '],
      ['numeric', 7],
      ['object', { id: 'run-1' }],
    ] as const) {
      it(`${path}: an input "received" with a ${label} run ID stays unknown, never received`, async () => {
        const a = await run(input, received(input, runId, 'started'))
        assert.equal(a.kind, 'unknown', JSON.stringify(a))
      })
    }
    it(`${path}: an input "received" with no run ID key stays unknown`, async () => {
      const { runId: _drop, ...noRun } = received(input, 'x', 'started')
      assert.equal((await run(input, noRun)).kind, 'unknown')
    })
    it(`${path}: an input "received" whose delivery does not fit an input stays unknown`, async () => {
      assert.equal((await run(input, received(input, 'run-7', 'stop_requested'))).kind, 'unknown')
    })
    it(`${path}: keeps the exact derived identity on the unknown it returns for a well-formed but unproven receipt`, async () => {
      const a = await run(input, received(input, null, 'queued'))
      assert.ok(a.kind === 'unknown')
      assert.deepEqual(a.identity, deriveIdentity(input, NS))
    })
    it(`${path}: a genuine input receipt (a non-blank run ID, queued or started) is received`, async () => {
      for (const delivery of ['queued', 'started']) {
        const answer = received(input, 'run-7', delivery)
        assert.deepEqual(await run(input, answer), answer)
      }
    })
    it(`${path}: a stop acknowledgement keeps its nullable run ID`, async () => {
      for (const delivery of ['no_active_run', 'already_ended', 'stop_requested']) {
        const answer = received(stop, null, delivery)
        assert.deepEqual(await run(stop, answer), answer)
      }
      assert.equal(
        (await run(stop, received(stop, '  ', 'stop_requested'))).kind,
        'unknown',
        'a blank run is not a run',
      )
      assert.equal((await run(stop, received(stop, null, 'started'))).kind, 'unknown', 'a stop is not started')
    })
  }

  it('never turns an unproven receipt after GO into refused or a resend: one exchange, settle not asked', async () => {
    const { s, calls } = store({
      views: [view({ state: 'answered', goCount: 1, answer: received(input, null, 'started') })],
    })
    const a = await proxy(s).send(input, digestOf(input), JOURNAL)
    assert.equal(a.kind, 'unknown')
    assert.equal(calls.enqueue.length, 1)
    assert.equal(calls.settle, 0)
  })
})

describe('operation-aware create receipts (r4, CC003-S1A-STUDY-R2-F01)', () => {
  const create = env()
  const receivedCreate = (runId: unknown) => ({
    kind: 'received',
    identity: deriveIdentity(create, NS),
    runId,
    delivery: 'started',
  })
  const viaSend = async (answer: unknown) => {
    const { s } = store({ views: [view({ state: 'answered', goCount: 1, answer })] })
    return proxy(s).send(create, digestOf(create), JOURNAL)
  }
  const viaReconcile = async (answer: unknown) => {
    const { s } = store({ views: [view({ state: 'answered', answer })] })
    return proxy(s).reconcile({ envelope: create, digest: digestOf(create), journalId: JOURNAL })
  }
  const viaSettle = async (answer: unknown) => {
    // The retained answer the database returns as the worker stops waiting.
    const { s } = store({
      views: [view({ state: 'go_granted', goCount: 1, deadlinePassed: true })],
      settle: { result: 'answered', answer },
    })
    return proxy(s).send(create, digestOf(create), JOURNAL)
  }
  for (const [path, run] of [
    ['send', viaSend],
    ['reconcile', viaReconcile],
    ['retained answer at settle', viaSettle],
  ] as const) {
    for (const [label, runId] of [
      ['null', null],
      ['empty', ''],
      ['blank', '  '],
      ['number', 7],
      ['object', { id: 'run-1' }],
      ['boolean', true],
      ['array', ['run-1']],
    ] as const) {
      it(`${path}: a create "received" with a ${label} run stays unknown`, async () => {
        const a = await run(receivedCreate(runId))
        assert.equal(a.kind, 'unknown', JSON.stringify(a))
      })
    }
    it(`${path}: a create "received" with no run key stays unknown`, async () => {
      const { runId: _drop, ...noRun } = receivedCreate('x')
      assert.equal((await run(noRun)).kind, 'unknown')
    })
    it(`${path}: an unproven create keeps its exact derived identity`, async () => {
      const a = await run(receivedCreate(null))
      assert.ok(a.kind === 'unknown')
      if (path !== 'retained answer at settle') assert.deepEqual(a.identity, deriveIdentity(create, NS))
    })
    it(`${path}: a genuine create receipt (a non-blank run, started) is received`, async () => {
      const answer = receivedCreate('run-1')
      assert.deepEqual(await run(answer), answer)
    })
  }
})

describe('the owner-host port proxy under source authority (INC01-CC-005, 0096)', () => {
  it('never puts an instruction in an exchange: a payload handed to send is dropped', async () => {
    const payload = canonicalJson({ message: 'A private instruction.', title: 'A title' })
    const { message: _m, title: _t, ...common } = env()
    const v2 = {
      ...common,
      v: 2,
      payloadSha256: sha256Hex(payload),
      manifestSha256: 'c'.repeat(64),
      baseCommit: '0123456789abcdef0123456789abcdef01234567',
      writeScope: 'read_only',
      settings: { instanceId: 'claudeAgent', model: 'synthetic-model', options: [] },
    } as unknown as RunnerEnvelope
    const { s, calls } = store({ views: [view({ state: 'denied', reason: 'x' })] })
    await proxy(s).send(v2, digestOf(v2), JOURNAL, payload)
    const request = calls.enqueue[0]?.request
    assert.deepEqual(request, exchangeRequest('send', v2, JOURNAL))
    assert.equal(JSON.stringify(request).includes('private instruction'), false)
    assert.equal(checkExchangeRequest(request).ok, true, 'the host accepts the content-free v2 request')
    assert.equal(checkExchangeRequest({ ...request, payload }).ok, false, 'and refuses one that carries more')
  })
})

import { collectionUnavailable } from './runner-port.ts'
describe('optional result collection transport', () => {
  const bounds = { v: 1 as const, maxPages: 2, maxBytes: 128 }
  const identity = () => ({ envelope: env(), digest: digestOf(env()), journalId: JOURNAL })
  it('old stores are explicitly unavailable without enqueue or input fallback', async () => {
    const { s, calls } = store({})
    assert.deepEqual(await proxy(s).collect(identity(), bounds), collectionUnavailable('unsupported'))
    assert.equal(calls.enqueue.length, 0)
    assert.equal(calls.exchange, 0)
  })
  it('transports only a v2 read and checks unavailable/foreign/malformed answers', async () => {
    for (const answer of [
      collectionUnavailable('unsupported'),
      { kind: 'run', status: 'completed', terminal: true },
      { text: 'PRIVATE' },
    ]) {
      const { s, calls } = store({ views: [view({ state: 'answered', answer })] })
      const got = await proxy({ ...s, collectionVersion: 1 }).collect(identity(), bounds)
      assert.equal(got.kind, 'collection_unavailable')
      assert.equal(calls.enqueue[0]?.request.kind, 'collect')
      assert.equal(calls.enqueue[0]?.request.v, 2)
      assert.equal(checkExchangeRequest(calls.enqueue[0]?.request).ok, true)
      assert.equal(calls.settle, 0)
    }
  })
  it('no host, thrown transport and foreign identity remain unavailable, never a replacement send', async () => {
    for (const script of [{ enqueue: { result: 'no_host' as const } }, { throwOn: 'enqueue' as const }]) {
      const { s, calls } = store(script)
      assert.equal(
        (await proxy({ ...s, collectionVersion: 1 }).collect(identity(), bounds)).kind,
        'collection_unavailable',
      )
      assert.equal(calls.enqueue.filter((c) => c.request.kind === 'send').length, 0)
    }
    const { s, calls } = store({})
    assert.deepEqual(
      await proxy({ ...s, collectionVersion: 1 }).collect({ ...identity(), journalId: env().ownerId }, bounds),
      collectionUnavailable('scope'),
    )
    assert.equal(calls.enqueue.length, 0)
  })
})

import { sha256Hex as collectionTextHash } from './runner-port.ts'
it('the collection proxy accepts only hash-checked content bound to this native namespace', async () => {
  const e = env()
  const identity = { envelope: e, digest: digestOf(e), journalId: JOURNAL }
  const native = deriveIdentity(e, NS)
  const content = {
    v: 1 as const,
    kind: 'collected' as const,
    operationId: e.operationId,
    bindingId: e.bindingId,
    journalId: JOURNAL,
    envelopeDigest: identity.digest,
    threadId: native.threadId,
    runId: 'accepted-run',
    inputMessageId: native.messageId,
    messageId: 'final-message',
    itemId: 'final-item',
    text: 'Useful result',
    textSha256: collectionTextHash('Useful result'),
    byteLength: 13,
    pages: 2,
    coverageDigest: 'a'.repeat(64),
    lastPosition: 2,
  }
  for (const foreign of [false, true]) {
    const body = { ...content, threadId: foreign ? 'foreign-thread' : native.threadId }
    const answer = { ...body, resultDigest: digestOf(body) }
    const { s, calls } = store({ views: [view({ state: 'answered', answer })] })
    const got = await proxy({ ...s, collectionVersion: 1 }).collect(identity, { v: 1, maxPages: 2, maxBytes: 128 })
    assert.equal(got.kind, foreign ? 'collection_unavailable' : 'collected')
    assert.equal(calls.enqueue.length, 1)
    assert.equal(calls.enqueue[0]?.request.kind, 'collect')
  }
})

function proxyMutationGate() {
  let resolveWait: (() => void) | undefined
  const wait = new Promise<void>((resolve) => {
    resolveWait = resolve
  })
  return { wait, release: () => resolveWait?.(), started: false }
}
function mutableSourceIdentity() {
  const { message: _message, title: _title, ...common } = env()
  const envelope = {
    ...common,
    v: 2 as const,
    kind: 'create' as const,
    payloadSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    baseCommit: '0123456789abcdef0123456789abcdef01234567',
    writeScope: 'read_only' as const,
    settings: { instanceId: 'claudeAgent', model: 'synthetic-model', options: [{ id: 'effort', value: 'high' }] },
  }
  return { envelope, digest: digestOf(envelope), journalId: JOURNAL }
}
function proxyCollectionAnswer(identity: ReturnType<typeof ident>, text = 'Useful', pages = 2) {
  const native = deriveIdentity(identity.envelope, NS)
  const body = {
    v: 1 as const,
    kind: 'collected' as const,
    operationId: identity.envelope.operationId,
    bindingId: identity.envelope.bindingId,
    journalId: identity.journalId,
    envelopeDigest: identity.digest,
    threadId: native.threadId,
    runId: 'accepted-run',
    inputMessageId: native.messageId,
    messageId: 'assistant',
    itemId: 'item',
    text,
    textSha256: collectionTextHash(text),
    byteLength: Buffer.byteLength(text),
    pages,
    lastPosition: 2,
    coverageDigest: 'a'.repeat(64),
  }
  return { ...body, resultDigest: digestOf(body) }
}
describe('NCOL-F01 proxy snapshots', () => {
  it('NCOL-F01 proxy preserves nested caller identity while enqueue is deferred', async () => {
    const identity = mutableSourceIdentity()
    const original = structuredClone(identity)
    const bounds = { v: 1 as const, maxPages: 2, maxBytes: 128 }
    const gate = proxyMutationGate()
    const scripted = store({ views: [view({ state: 'answered', answer: proxyCollectionAnswer(original) })] })
    const s: ExchangeStore = {
      ...scripted.s,
      collectionVersion: 1,
      async enqueue(input) {
        gate.started = true
        await gate.wait
        return scripted.s.enqueue(input)
      },
    }
    try {
      const pending = proxy(s).collect(identity, bounds)
      assert.equal(gate.started, true)
      identity.envelope.bindingId = env().ownerId
      identity.envelope.operationId = env().resourceId
      identity.envelope.settings.model = 'changed'
      const option = identity.envelope.settings.options[0]
      if (!option) throw new Error('synthetic setting missing')
      option.value = 'low'
      identity.envelope.manifestSha256 = 'c'.repeat(64)
      identity.digest = 'd'.repeat(64)
      identity.journalId = env().ownerId
      gate.release()
      assert.equal((await pending).kind, 'collected')
      assert.deepEqual(scripted.calls.enqueue[0]?.request.envelope, original.envelope)
      assert.equal(scripted.calls.enqueue[0]?.request.digest, original.digest)
      assert.equal(Object.isFrozen(identity.envelope.settings), false)
    } finally {
      gate.release()
    }
  })
  it('NCOL-F01 proxy protects private identity from store-side wire mutation', async () => {
    const identity = mutableSourceIdentity()
    const original = structuredClone(identity)
    let forged = proxyCollectionAnswer(original)
    const scripted = store({})
    const s: ExchangeStore = {
      ...scripted.s,
      collectionVersion: 1,
      enqueue(input) {
        Object.assign(input.request.envelope, { bindingId: env().ownerId })
        forged = proxyCollectionAnswer({ ...original, envelope: input.request.envelope })
        return scripted.s.enqueue(input)
      },
      exchange() {
        return Promise.resolve(view({ state: 'answered', answer: forged }))
      },
    }
    const result = await proxy(s).collect(identity, { v: 1, maxPages: 2, maxBytes: 128 })
    assert.equal(result.kind, 'collection_unavailable')
    assert.deepEqual(identity, original, 'store must not receive aliases of the caller either')
  })
  it('NCOL-F01 proxy preserves narrower limits while its answer is deferred', async () => {
    const identity = ident()
    const bounds = { v: 1 as const, maxPages: 2, maxBytes: 16 }
    const gate = proxyMutationGate()
    const scripted = store({})
    const s: ExchangeStore = {
      ...scripted.s,
      collectionVersion: 1,
      async exchange() {
        gate.started = true
        await gate.wait
        return view({ state: 'answered', answer: proxyCollectionAnswer(identity, 'x'.repeat(32), 4) })
      },
    }
    try {
      const pending = proxy(s).collect(identity, bounds)
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(gate.started, true)
      bounds.maxPages = 8
      bounds.maxBytes = 128
      gate.release()
      assert.equal((await pending).kind, 'collection_unavailable')
      assert.equal(Object.isFrozen(bounds), false)
    } finally {
      gate.release()
    }
  })
})

it('NCOL-F01 proxy private limits cannot be changed through the store wire request', async () => {
  const identity = ident()
  const bounds = { v: 1 as const, maxPages: 2, maxBytes: 16 }
  const scripted = store({
    views: [view({ state: 'answered', answer: proxyCollectionAnswer(identity, 'x'.repeat(32), 4) })],
  })
  const s: ExchangeStore = {
    ...scripted.s,
    collectionVersion: 1,
    enqueue(input) {
      if (!input.request.collection) throw new Error('collection request missing')
      Object.assign(input.request.collection, { maxPages: 8, maxBytes: 128 })
      return scripted.s.enqueue(input)
    },
  }
  assert.equal((await proxy(s).collect(identity, bounds)).kind, 'collection_unavailable')
  assert.deepEqual(bounds, { v: 1, maxPages: 2, maxBytes: 16 })
})
