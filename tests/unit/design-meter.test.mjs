/**
 * The design meter (SDD-01, Davide on #107): every model call of a designer or a visual reviewer is reserved before it
 * leaves and settled from its usage, through the design operations, over a real connection to a local service that
 * answers, loses its reply, or accepts the request and never finishes its headers or its body. The bridge's own
 * meteredDesign runs; no model, provider or Sophia is involved.
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { after, before, test } from 'node:test'
import { ControlBridge, RouteRefused } from '../../packages/dsh-bundle/dist/control-bridge.js'
import { boundedAccounts } from '../../packages/dsh-bundle/dist/review-tools.js'
import { ServiceTransport } from '../../packages/dsh-bundle/dist/transport.js'

const ATTEMPT = '99999999-9999-4999-8999-999999999999'
const RESERVATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RESERVED = { reservationId: RESERVATION, state: 'reserved', kind: 'model', purpose: 'call', amountUsd: 0.01, target: null }
const SETTLED = { reservationId: RESERVATION, state: 'settled', settledUsd: 0.000015 }

/**
 * A local service: each request is answered as `script(path, n)` says, n counting that path's requests: 'answer',
 * 'lose' (the connection is cut once the whole request arrived), 'headers' or 'body' (it starts its answer and never
 * finishes it), 'nothing', or `{ status, body }`.
 */
const service = { script: () => 'answer', requests: [], sockets: new Set(), port: 0 }
const server = createServer((socket) => {
  service.sockets.add(socket)
  let request = ''
  socket.on('data', (chunk) => {
    request += chunk.toString('latin1')
    const end = request.indexOf('\r\n\r\n')
    const length = Number(/content-length: *(\d+)/i.exec(request)?.[1] ?? 0)
    if (end < 0 || request.length < end + 4 + length) return
    const path = request.split(' ')[1]
    const body = JSON.parse(request.slice(end + 4, end + 4 + length))
    const n = service.requests.filter((r) => r.path === path).length + 1
    service.requests.push({ path, body })
    request = ''
    const step = service.script(path, n)
    const answer = path.endsWith('/reserve') ? RESERVED : SETTLED
    const json = JSON.stringify(typeof step === 'object' ? step.body : answer)
    const status = typeof step === 'object' ? step.status : 200
    const head = `HTTP/1.1 ${status} X\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(json)}\r\n`
    if (step === 'answer' || typeof step === 'object') socket.end(`${head}connection: close\r\n\r\n${json}`)
    else if (step === 'lose') socket.destroy()
    else if (step === 'headers') socket.write('HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n')
    else if (step === 'body') socket.write(`${head}\r\n${json.slice(0, 20)}`)
  })
})
before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', () => { service.port = server.address().port; resolve() })))
after(async () => {
  for (const socket of service.sockets) socket.destroy()
  await new Promise((resolve) => server.close(resolve))
})

/** A fresh script and request log. */
function scripted(script) {
  service.script = script
  service.requests = []
}
const sent = (suffix) => service.requests.filter((r) => r.path.endsWith(suffix))
const transport = () => new ServiceTransport({ baseUrl: `http://127.0.0.1:${service.port}`, token: 't', runtimeUnitId: 'u', bridgeInstanceId: 'b' })

/** The bridge's own meteredDesign, on a bridge holding only what metering reads. */
function meter() {
  const bridge = Object.create(ControlBridge.prototype)
  const logs = []
  Object.assign(bridge, { transport: transport(), settings: { log: (line) => logs.push(line) }, journal: { append: () => {} } })
  let streams = 0
  const run = async (signal, { during } = {}) => {
    const next = () => (async function* () {
      streams += 1
      yield { type: 'text-delta', text: 'ok' }
      during?.()
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
    })()
    const attempt = { attemptId: ATTEMPT, sessionId: `sophia-${ATTEMPT}` }
    const options = { sessionId: 'session-1', messages: [], signal }
    const route = { provider: 'openai', model: 'gpt-x', maxTokens: 100 }
    const prices = { input: 1, cacheRead: 1, cacheWrite: 1, output: 1 }
    const chunks = []
    for await (const chunk of bridge.meteredDesign(attempt, options, route, prices, next)) chunks.push(chunk)
    return chunks
  }
  return { run, streams: () => streams, logs }
}

/** What `promise` settles to within `ms`, or 'still waiting'. */
async function within(ms, promise) {
  let timer
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve('still waiting'), ms) })
  try {
    return await Promise.race([promise, late])
  } finally {
    clearTimeout(timer)
  }
}

const QUICK = { tries: 3, pauseMs: 1, maxMs: 1_500 }
const ids = { attemptId: ATTEMPT, nativeSessionId: `sophia-${ATTEMPT}` }
const RESERVE = { ...ids, callId: 'llm-1', kind: 'model', provider: 'openai', amountUsd: 0.01, purpose: 'call' }
const SETTLE = { ...ids, reservationId: RESERVATION, outcome: 'settled', costUsd: 0.000015 }
const designAccounts = (t, patience = QUICK) =>
  boundedAccounts({ reserve: (b, s) => t.designReserve(b, s), settle: (b, s) => t.designSettle(b, s) }, patience)

test('a model call is reserved, streamed once and settled from its usage, through the design operations', async () => {
  scripted(() => 'answer')
  const m = meter()
  const chunks = await m.run(new AbortController().signal)
  assert.deepEqual(chunks.map((c) => c.type), ['text-delta', 'usage'])
  assert.equal(m.streams(), 1)
  const [reserve] = sent('/design/reserve')
  const [settle] = sent('/design/settle')
  assert.match(reserve.body.callId, /^llm-[0-9a-f-]{36}$/)
  assert.deepEqual([settle.body.reservationId, settle.body.outcome, settle.body.costUsd], [RESERVATION, 'settled', 0.000015])
})

test('a reservation or a settlement whose headers or body never finish ends at its deadline as unknown, never sent changed', { timeout: 20_000 }, async () => {
  for (const stall of ['headers', 'body']) {
    scripted(() => stall)
    const accounts = designAccounts(transport())
    await assert.rejects(within(5_000, accounts.reserve(RESERVE)).then((v) => { if (v === 'still waiting') throw new Error('unbounded'); return v }), /no answer to the reservation; its outcome is unknown/, stall)
    // A stalled request is given the time left, so its deadline usually ends the patience: what is sent is unchanged.
    const reserves = sent('/design/reserve')
    assert.ok(reserves.length >= 1 && reserves.length <= QUICK.tries, `${stall}: ${String(reserves.length)} sent`)
    assert.ok(reserves.every((r) => JSON.stringify(r.body) === JSON.stringify(RESERVE)), 'the same callId each time')
    scripted(() => stall)
    await assert.rejects(within(5_000, accounts.settle(SETTLE)).then((v) => { if (v === 'still waiting') throw new Error('unbounded'); return v }), /no answer to the settlement; its outcome is unknown/, stall)
    assert.ok(sent('/design/settle').every((r) => JSON.stringify(r.body) === JSON.stringify(SETTLE)), 'the same reservationId and outcome each time')
  }
})

test('a reservation and a settlement whose reply was lost are sent again under the same ids, and answered once', async () => {
  scripted((path, n) => (n === 1 ? 'lose' : 'answer'))
  const m = meter()
  await m.run(new AbortController().signal)
  const reserves = sent('/design/reserve')
  const settles = sent('/design/settle')
  assert.equal(reserves.length, 2)
  assert.equal(reserves[0].body.callId, reserves[1].body.callId, 'the same callId: the service answers with the reservation it made')
  assert.equal(m.streams(), 1, 'one model call')
  assert.equal(settles.length, 2)
  assert.deepEqual(settles[0].body, settles[1].body, 'the same settlement')
})

test('a cancelled model call sends no reservation, and cuts one in flight; neither lets the call leave', async () => {
  scripted(() => 'answer')
  const m = meter()
  await assert.rejects(m.run(AbortSignal.abort()), RouteRefused)
  assert.equal(service.requests.length, 0, 'nothing was sent')
  scripted(() => 'nothing')
  const stop = new AbortController()
  const running = m.run(stop.signal)
  while (sent('/design/reserve').length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
  stop.abort()
  // At once: well within the patience's first pause (1 s).
  await assert.rejects(within(500, running).then((v) => { if (v === 'still waiting') throw new Error('the reservation outlived the cancel'); return v }), RouteRefused)
  assert.equal(m.streams(), 0, 'no model call leaves on an unknown reservation')
  assert.equal(sent('/design/settle').length, 0, 'and nothing is released or settled without proof')
})

test('a refused reservation refuses the call at once; a settlement is owed after a Hold or Stop and still sent', async () => {
  scripted(() => ({ status: 409, body: { code: 'invalid_state', message: 'held' } }))
  const m = meter()
  await assert.rejects(m.run(new AbortController().signal), (err) => err instanceof RouteRefused && /invalid_state/.test(err.message))
  assert.equal(sent('/design/reserve').length, 1, 'a refusal is not sent again')
  assert.equal(m.streams(), 0)

  scripted((path, n) => (path.endsWith('/settle') && n === 1 ? 'lose' : 'answer'))
  const held = new AbortController()
  await m.run(held.signal, { during: () => held.abort() })
  assert.equal(m.streams(), 1)
  const settles = sent('/design/settle')
  assert.equal(settles.length, 2, 'the settlement is sent, and again when its reply was lost, after the Hold')
  assert.deepEqual([settles[1].body.reservationId, settles[1].body.outcome], [RESERVATION, 'settled'])
})
