// WBC-02 (WBC-02-CX-0037): the probe's HTTP exchange and wait settle within their deadline whatever a server does.
// Each server below is a real one on loopback; each case races the exchange against a sentinel, so a promise left
// pending (the defect: an idle timeout a slow drip keeps alive; a cut response nobody settles; a wait whose check never
// returns) shows as `pending` instead of hanging the test.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, describe, it } from 'node:test'
import { exchange, until } from '../../scripts/paperclip-probe-http.mjs'
import { flowFor } from '../../scripts/paperclip-probe-flow.mjs'

const PENDING = 'pending'
/** The promise's outcome, or PENDING if it has not settled within ms. */
const settledWithin = (promise, ms) =>
  Promise.race([
    promise.then(
      (value) => ({ value }),
      (error) => ({ error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve(PENDING), ms)),
  ])

const servers = []
async function serve(handler) {
  const server = createServer(handler)
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}
after(() => {
  for (const server of servers) {
    server.closeAllConnections()
    server.close()
  }
})

/** Headers at once, then one byte every 100 ms, never the end. */
const slowDrip = () =>
  serve((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    const drip = setInterval(() => res.write(' '), 100)
    req.on('close', () => clearInterval(drip))
    res.on('close', () => clearInterval(drip))
  })

describe('the bounded exchange (WBC-02-CX-0037)', () => {
  it('positive control: a complete response resolves with its status and JSON', async () => {
    const port = await serve((_req, res) => res.end(JSON.stringify({ status: 'ok' })))
    const outcome = await settledWithin(exchange({ port, path: '/api/health', timeoutMs: 2000 }), 3000)
    assert.notEqual(outcome, PENDING)
    assert.equal(outcome.value.status, 200)
    assert.deepEqual(outcome.value.json, { status: 'ok' })
  })

  it('CX-0037: a slow drip is ended at the absolute deadline, not kept alive by its bytes', async () => {
    const port = await slowDrip()
    const started = Date.now()
    const outcome = await settledWithin(exchange({ port, timeoutMs: 400 }), 3000)
    assert.notEqual(outcome, PENDING, 'still pending at the sentinel')
    assert.match(outcome.error.message, /no complete answer in 0.4 s/)
    assert.ok(Date.now() - started < 1500)
  })

  it('CX-0037: a response cut short (fewer bytes than its length, then the connection closed) rejects at once', async () => {
    const port = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': '1000' })
      res.write('{"partial":')
      setTimeout(() => res.socket.destroy(), 50)
    })
    const outcome = await settledWithin(exchange({ port, timeoutMs: 10_000 }), 3000)
    assert.notEqual(outcome, PENDING, 'still pending at the sentinel')
    assert.ok(outcome.error instanceof Error)
  })

  it('a server that accepts and never answers, or drops the connection, settles too', async () => {
    const silent = await serve(() => undefined)
    const quiet = await settledWithin(exchange({ port: silent, timeoutMs: 300 }), 3000)
    assert.notEqual(quiet, PENDING)
    assert.ok(quiet.error instanceof Error)
    const dropping = await serve((req) => req.socket.destroy())
    const dropped = await settledWithin(exchange({ port: dropping, timeoutMs: 10_000 }), 3000)
    assert.notEqual(dropped, PENDING)
    assert.ok(dropped.error instanceof Error)
  })
})

describe('the bounded wait (WBC-02-CX-0037)', () => {
  it('CX-0037: a check that never settles cannot hold the wait past its deadline', async () => {
    const outcome = await settledWithin(
      until('a check that never returns', () => new Promise(() => undefined), 300),
      3000,
    )
    assert.notEqual(outcome, PENDING, 'still pending at the sentinel')
    assert.match(outcome.error.message, /timed out waiting for a check that never returns/)
  })

  it('positive control: a check that becomes true returns its value', async () => {
    let calls = 0
    const outcome = await settledWithin(until('the second call', () => (++calls >= 2 ? 'ready' : null), 5000), 4000)
    assert.deepEqual(outcome, { value: 'ready' })
  })

  it('CX-0037: the probe flow waiting on a slow-dripping health ends at its deadline', async () => {
    const port = await slowDrip()
    const flow = flowFor({ port, origin: `http://127.0.0.1:${port}`, pluginPath: '/nonexistent', requestTimeoutMs: 300 })
    const outcome = await settledWithin(until('the server to report ready', flow.health, 1200), 5000)
    assert.notEqual(outcome, PENDING, 'still pending at the sentinel')
    assert.match(outcome.error.message, /timed out waiting for the server to report ready/)
  })
})
