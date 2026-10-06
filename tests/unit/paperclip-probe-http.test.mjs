// WBC-02 (WBC-02-CX-0037): the probe's HTTP exchange and wait settle within their deadline whatever a server does.
// Each server below is a real one on loopback; each case races the exchange against a sentinel, so a promise left
// pending (the defect: an idle timeout a slow drip keeps alive; a cut response nobody settles; a wait whose check never
// returns) shows as `pending` instead of hanging the test.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, describe, it } from 'node:test'
import { exchange, until } from '../../scripts/paperclip-probe-http.mjs'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { flowFor } from '../../scripts/paperclip-probe-flow.mjs'
import { secretSink } from '../../scripts/paperclip-probe-url.mjs'

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

describe('every credential the probe makes or is given is handed over for the scrub (review of 215b276)', () => {
  it('the bootstrap reports the password the server received, its session cookie and the board key; a refused sign-up its password', async () => {
    const received = []
    const port = await serve((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const json = body ? JSON.parse(body) : {}
        if (req.url === '/api/auth/sign-up/email') {
          received.push(json.password)
          if (json.email.startsWith('late'))
            return res.writeHead(400).end(JSON.stringify({ code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED', message: 'Email and password sign up is not enabled' }))
          res.writeHead(200, { 'set-cookie': ['better-auth.session_token=cookie-value-0123; Path=/; HttpOnly'] })
          return res.end(JSON.stringify({ user: { id: 'user-1' } }))
        }
        if (req.url === '/api/bootstrap/claim') return res.writeHead(200).end('{}')
        if (req.url === '/api/board-api-keys') return res.writeHead(201).end(JSON.stringify({ token: 'pcp_board-key-0123456789' }))
        res.writeHead(404).end('{}')
      })
    })
    const reported = []
    const flow = flowFor({ port, origin: `http://127.0.0.1:${port}`, pluginPath: '/nonexistent', onSecret: (v) => reported.push(v) })
    const op = await flow.bootstrap()
    assert.equal(op.token, 'pcp_board-key-0123456789')
    assert.deepEqual(reported, [received[0], 'cookie-value-0123', 'pcp_board-key-0123456789'])
    assert.match(received[0], /^[0-9a-f]{32}$/)
    assert.deepEqual(await flow.signUpRefused(), { status: 400, code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' })
    assert.deepEqual(reported.slice(3), [received[1]])
  })

  it('review of 08c2915: sign-up counts as closed only on the pin’s own refusal, not on any client error', async () => {
    const answers = [
      [404, '{}'],
      [429, '{"message":"Too many requests"}'],
      [400, '{"code":"VALIDATION_ERROR","message":"Invalid email"}'],
      [403, '{"code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"}'],
    ]
    for (const [status, body] of answers) {
      const port = await serve((req, res) => {
        req.resume()
        req.on('end', () => res.writeHead(status).end(body))
      })
      const flow = flowFor({ port, origin: `http://127.0.0.1:${port}`, pluginPath: '/nonexistent' })
      await assert.rejects(flow.signUpRefused(), /sign-up after close/, `${status} ${body}`)
    }
  })

  it('the probe command, with --secrets, lists what the server received and issued, even when a later step fails', async () => {
    const received = []
    const port = await serve((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const host = req.headers.host ?? ''
        if (req.url === '/api/health') {
          if (host.startsWith('evil.example')) return res.writeHead(403).end('{}')
          return res.end(JSON.stringify({ status: 'ok' }))
        }
        if (req.url === '/api/auth/sign-up/email') {
          received.push(JSON.parse(body).password)
          res.writeHead(200, { 'set-cookie': ['better-auth.session_token=cookie-value-4567; Path=/'] })
          return res.end(JSON.stringify({ user: { id: 'user-1' } }))
        }
        if (req.url === '/api/bootstrap/claim') return res.writeHead(200).end('{}')
        if (req.url === '/api/board-api-keys') return res.writeHead(201).end(JSON.stringify({ token: 'pcp_board-key-4567890123' }))
        res.writeHead(404).end('{}') // the plugin step fails here
      })
    })
    const dir = mkdtempSync(join(tmpdir(), 'pc-probe-cli-'))
    try {
      const probe = fileURLToPath(new URL('../../scripts/paperclip-service-probe.mjs', import.meta.url))
      const args = ['--url', `http://127.0.0.1:${port}`, '--phase', 'first', '--state', join(dir, 'state.json')]
      const child = spawn(process.execPath, [probe, ...args, '--secrets', join(dir, 'secrets.txt'), '--out', join(dir, 'out.json'), '--wait-ms', '3000', '--deadline-ms', '20000'], {
        env: { ...process.env, GITHUB_ACTIONS: '' },
      })
      const code = await settledWithin(new Promise((done) => child.on('exit', done)), 25_000)
      assert.notEqual(code, PENDING, 'the probe ended')
      assert.equal(code.value, 1, 'the plugin step failed, as the stand-in made it')
      const out = JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8'))
      assert.equal(out.steps.find((s) => s.step === 'first admin and board key')?.ok, true)
      assert.equal(readFileSync(join(dir, 'secrets.txt'), 'utf8'), `${received[0]}\ncookie-value-4567\npcp_board-key-4567890123\n`)
      assert.ok(!readFileSync(join(dir, 'out.json'), 'utf8').includes(received[0]), 'the result holds no credential')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the sink keeps each value once, a line of a file only its owner reads, masked only in a GitHub Actions log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pc-secrets-'))
    try {
      const path = join(dir, 'probe-secrets.txt')
      const masks = []
      const sink = secretSink(path, { env: { GITHUB_ACTIONS: 'true' }, log: (line) => masks.push(line) })
      sink('first-secret-value')
      sink('first-secret-value')
      sink('')
      sink('second-secret-value')
      assert.equal(readFileSync(path, 'utf8'), 'first-secret-value\nsecond-secret-value\n')
      assert.equal(statSync(path).mode & 0o777, 0o600)
      assert.deepEqual(masks, ['::add-mask::first-secret-value', '::add-mask::second-secret-value'])
      const quiet = []
      secretSink(join(dir, 'other.txt'), { env: {}, log: (line) => quiet.push(line) })('third-secret-value')
      assert.deepEqual(quiet, [], 'no mask command outside GitHub Actions')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

