// WBC-02 (WBC-02-CX-0037): the probe's HTTP exchange and wait settle within their deadline whatever a server does.
// Each server below is a real one on loopback; each case races the exchange against a sentinel, so a promise left
// pending (the defect: an idle timeout a slow drip keeps alive; a cut response nobody settles; a wait whose check never
// returns) shows as `pending` instead of hanging the test.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, describe, it } from 'node:test'
import { exchange, MAX_BODY_BYTES, until } from '../../scripts/paperclip-probe-http.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { flowFor, newIdentity } from '../../scripts/paperclip-probe-flow.mjs'
import { minimumDeadlineMs, PHASE_LIMITS, secretSink } from '../../scripts/paperclip-probe-url.mjs'

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
      const child = spawn(process.execPath, [probe, ...args, '--secrets', join(dir, 'secrets.txt'), '--out', join(dir, 'out.json'), '--wait-ms', '3000', '--deadline-ms', '600000'], {
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


const PROBE = fileURLToPath(new URL('../../scripts/paperclip-service-probe.mjs', import.meta.url))
const CONFIG = { coordinationUrl: 'http://127.0.0.1:9' }

/** A stand-in for a restarted server holding the first phase's plugin, configuration and issue. */
const restartedServer = (calls) =>
  serve((req, res) => {
    req.resume()
    req.on('end', () => {
      calls.push(`${req.method} ${req.url.split('?')[0]}`)
      const host = req.headers.host ?? ''
      const json = (status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      if (req.url === '/api/health') return host.startsWith('evil.example') ? json(403, {}) : json(200, { status: 'ok' })
      if (req.url === '/api/plugins/plugin-1') return json(200, { status: 'ready' })
      if (req.url.startsWith('/api/plugins/plugin-1/config')) return json(200, { configJson: CONFIG })
      if (req.url === '/api/plugins/sophia.coordination/api/commissions/lookup')
        return json(200, { outcome: 'found', issueId: 'issue-1', status: 'cancelled' })
      if (req.url === '/api/plugins/sophia.coordination/api/commissions') return json(200, { outcome: 'existing', issueId: 'issue-1' })
      if (req.url === '/api/auth/sign-up/email') return json(400, { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' })
      json(404, {})
    })
  })

const runPhase = async (port, dir, phase, deadlineMs = '600000') => {
  const out = join(dir, `${phase}.json`)
  const args = ['--url', `http://127.0.0.1:${port}`, '--phase', phase, '--state', join(dir, 'state.json'), '--secrets', join(dir, 'secrets.txt')]
  const child = spawn(process.execPath, [PROBE, ...args, '--out', out, '--wait-ms', '3000', '--deadline-ms', deadlineMs], {
    env: { ...process.env, GITHUB_ACTIONS: '' },
  })
  const code = await settledWithin(new Promise((done) => child.on('exit', done)), 25_000)
  assert.notEqual(code, PENDING, `the ${phase} phase ended`)
  return { code: code.value, result: JSON.parse(readFileSync(out, 'utf8')) }
}

describe('review of 9ee7754: the restart phase checks what persists, and leaves sign-up alone', () => {
  it('restart: the same plugin, configuration and issue, the resend answered by it, the host-name guard; no sign-up', async () => {
    const calls = []
    const port = await restartedServer(calls)
    const dir = mkdtempSync(join(tmpdir(), 'pc-restart-'))
    try {
      const state = {
        schema: 'sophia.paperclip-probe-state.v1',
        origin: `http://127.0.0.1:${port}`,
        identity: newIdentity(),
        op: { userId: 'user-1', token: 'pcp_board-key-0000000000' },
        ids: { pluginId: 'plugin-1', companyId: 'company-1', projectId: 'project-1' },
        issueId: 'issue-1',
        configDigest: createHash('sha256').update(JSON.stringify(CONFIG)).digest('hex'),
      }
      writeFileSync(join(dir, 'state.json'), JSON.stringify(state))
      const restart = await runPhase(port, dir, 'restart')
      assert.equal(restart.code, 0, JSON.stringify(restart.result))
      assert.equal(restart.result.outcome, 'passed')
      assert.deepEqual(restart.result.steps[0].detail, { httpStatus: 200, status: 'ok' }, 'health as observed: its HTTP status and body')
      assert.deepEqual(
        restart.result.steps.map((s) => s.step),
        ['health', 'plugin ready again', 'config unchanged', 'same issue found, still cancelled', 'commission resend answered by the same issue', 'host-name guard'],
      )
      assert.ok(!calls.includes('POST /api/auth/sign-up/email'), 'sign-up is still open after a restart: not tried')
      const recreated = await runPhase(port, dir, 'restarted')
      assert.equal(recreated.code, 0, JSON.stringify(recreated.result))
      assert.equal(recreated.result.steps.at(-2).step, 'sign-up refused')
      assert.ok(calls.includes('POST /api/auth/sign-up/email'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('review of 63a929a: a phase’s deadline is never shorter than what its limits permit', () => {
  /** A stand-in answering each request of all three phases at once, each wait on its first poll; sign-up closes when told. */
  const lifecycleServer = (calls, life) =>
    serve((req, res) => {
      let text = ''
      req.on('data', (chunk) => (text += chunk))
      req.on('end', () => {
        const path = req.url.split('?')[0]
        calls.push(`${req.method} ${path}`)
        const host = req.headers.host ?? ''
        const json = (status, body, headers = {}) =>
          res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body))
        if (path === '/api/health') return host.startsWith('evil.example') ? json(403, {}) : json(200, { status: 'ok' })
        if (path === '/api/auth/sign-up/email')
          return life.signUpClosed
            ? json(400, { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' })
            : json(200, { user: { id: 'user-1' } }, { 'set-cookie': ['better-auth.session_token=cookie-1234; Path=/'] })
        if (path === '/api/bootstrap/claim') return json(200, {})
        if (path === '/api/board-api-keys') return json(201, { token: 'pcp_board-key-1234567890' })
        if (path === '/api/companies') return json(201, { id: 'company-1' })
        if (path === '/api/companies/company-1/projects') return json(201, { id: 'project-1' })
        if (path === '/api/plugins/install') return json(200, { id: 'plugin-1' })
        if (path === '/api/plugins/plugin-1') return json(200, { status: 'ready' })
        if (path === '/api/plugins/plugin-1/config') {
          if (req.method === 'POST') life.config = JSON.parse(text).configJson
          return json(200, req.method === 'POST' ? {} : { configJson: life.config })
        }
        if (path === '/api/plugins/sophia.coordination/api/commissions')
          return json(200, { outcome: life.commissions++ === 0 ? 'created' : 'existing', issueId: 'issue-1' })
        if (path === '/api/plugins/sophia.coordination/api/issues/issue-1/control')
          return json(200, { outcome: life.stops++ === 0 ? 'applied' : 'already', status: 'cancelled', issueId: 'issue-1' })
        if (path === '/api/plugins/plugin-1/jobs') return json(200, [{ id: 'job-1', jobKey: 'settle-status-writes' }])
        if (path === '/api/plugins/plugin-1/jobs/job-1/runs') return json(200, [{ id: 'run-1', status: 'succeeded' }])
        if (path === '/api/plugins/sophia.coordination/api/commissions/lookup')
          return json(200, { outcome: 'found', issueId: 'issue-1', status: 'cancelled' })
        json(404, {})
      })
    })

  it('each phase makes exactly the requests its limits count, one poll for each wait and for health; its minimum suffices', async () => {
    const calls = []
    const life = { signUpClosed: false, commissions: 0, stops: 0 }
    const port = await lifecycleServer(calls, life)
    const dir = mkdtempSync(join(tmpdir(), 'pc-limits-'))
    try {
      for (const phase of ['first', 'restart', 'restarted']) {
        life.signUpClosed = phase === 'restarted'
        const before = calls.length
        const run = await runPhase(port, dir, phase, String(minimumDeadlineMs(phase, 3000)))
        assert.equal(run.code, 0, JSON.stringify(run.result))
        assert.equal(run.result.outcome, 'passed')
        const { requests, waits } = PHASE_LIMITS[phase]
        const made = calls.slice(before)
        assert.equal(made.length, requests + waits.length + 1, `${phase}: ${made.join(', ')}`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a deadline shorter than its phase permits, or none a number, is refused before the server is reached', async () => {
    const calls = []
    const port = await lifecycleServer(calls, { signUpClosed: false, commissions: 0, stops: 0 })
    const dir = mkdtempSync(join(tmpdir(), 'pc-short-'))
    try {
      for (const [phase, wait, deadline] of [
        ['first', 3000, String(minimumDeadlineMs('first', 3000) - 1)],
        ['first', 300_000, '600000'], // the workflow's first phase before this review
        ['restart', 3000, String(minimumDeadlineMs('restart', 3000) - 1)],
        ['restarted', 3000, String(minimumDeadlineMs('restarted', 3000) - 1)],
        ['first', 3000, 'soon'],
      ]) {
        const out = join(dir, 'out.json')
        const args = ['--url', `http://127.0.0.1:${port}`, '--phase', phase, '--state', join(dir, 'state.json'), '--secrets', join(dir, 'secrets.txt')]
        const child = spawn(process.execPath, [PROBE, ...args, '--out', out, '--wait-ms', String(wait), '--deadline-ms', deadline], {
          env: { ...process.env, GITHUB_ACTIONS: '' },
        })
        let stderr = ''
        child.stderr.on('data', (chunk) => (stderr += chunk))
        const code = await settledWithin(new Promise((done) => child.on('close', done)), 25_000)
        assert.notEqual(code, PENDING, `${phase} ${deadline}: the probe ended`)
        assert.notEqual(code.value, 0, `${phase} ${deadline}: refused`)
        assert.match(stderr, new RegExp(`--deadline-ms must cover what the ${phase} phase permits: at least ${minimumDeadlineMs(phase, wait)} ms`))
        assert.deepEqual(calls, [], `${phase} ${deadline}: the server was not reached`)
        assert.throws(() => statSync(out), /ENOENT/, 'no result is written for a run that never began')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('review of 9bc711a: a response is read up to a byte cap, never buffered without bound', () => {
  /** Headers at once, then 64 KiB every millisecond, never the end. */
  const flood = () =>
    serve((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      const chunk = 'x'.repeat(65536)
      const pump = setInterval(() => res.write(chunk), 1)
      req.on('close', () => clearInterval(pump))
      res.on('close', () => clearInterval(pump))
    })

  it('a response past the cap is ended at once, with the cap named, long before the time deadline', async () => {
    const port = await flood()
    const started = Date.now()
    const outcome = await settledWithin(exchange({ port, timeoutMs: 10_000, maxBodyBytes: 200_000 }), 3000)
    assert.notEqual(outcome, PENDING, 'still pending at the sentinel')
    assert.match(outcome.error.message, /the response passed 200000 bytes/)
    assert.ok(Date.now() - started < 2000)
  })

  it('the default cap is 1 MiB: a body just under or of exactly that many bytes resolves, one byte more is refused', async () => {
    assert.equal(MAX_BODY_BYTES, 1024 * 1024)
    for (const size of [MAX_BODY_BYTES - 1, MAX_BODY_BYTES]) {
      const port = await serve((_req, res) => res.end('x'.repeat(size)))
      const outcome = await settledWithin(exchange({ port, timeoutMs: 10_000 }), 5000)
      assert.notEqual(outcome, PENDING)
      assert.equal(outcome.value?.text.length, size, outcome.error?.message)
    }
    const over = await serve((_req, res) => res.end('x'.repeat(MAX_BODY_BYTES + 1)))
    const refused = await settledWithin(exchange({ port: over, timeoutMs: 10_000 }), 5000)
    assert.notEqual(refused, PENDING)
    assert.match(refused.error?.message ?? '', /the response passed 1048576 bytes/)
  })

  it('bytes are counted as received, not characters: a hundred three-byte characters fit a 300-byte cap, one more does not', async () => {
    const fits = await serve((_req, res) => res.end('\u20ac'.repeat(100)))
    const kept = await settledWithin(exchange({ port: fits, timeoutMs: 5000, maxBodyBytes: 300 }), 3000)
    assert.notEqual(kept, PENDING)
    assert.equal(kept.value?.text, '\u20ac'.repeat(100), kept.error?.message)
    const over = await serve((_req, res) => res.end('\u20ac'.repeat(101)))
    const refused = await settledWithin(exchange({ port: over, timeoutMs: 5000, maxBodyBytes: 300 }), 3000)
    assert.notEqual(refused, PENDING)
    assert.match(refused.error?.message ?? '', /passed 300 bytes/)
  })

  it('positive controls under the cap: JSON, a health answer and cookies come back whole, a multi-byte body decoded once', async () => {
    const port = await serve((req, res) => {
      if (req.url === '/api/health') return res.end(JSON.stringify({ status: 'ok' }))
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] })
      res.write(Buffer.from('{"name":"synthetic \u20ac', 'utf8').subarray(0, 21)) // the € cut after its first byte
      res.end(Buffer.from('{"name":"synthetic \u20ac"}', 'utf8').subarray(21))
    })
    const health = await settledWithin(exchange({ port, path: '/api/health', timeoutMs: 2000 }), 3000)
    assert.deepEqual(health.value?.json, { status: 'ok' })
    const cookies = await settledWithin(exchange({ port, path: '/api/auth/sign-up/email', timeoutMs: 2000 }), 3000)
    assert.deepEqual(cookies.value?.cookies, ['a=1; Path=/', 'b=2; Path=/'])
    assert.deepEqual(cookies.value?.json, { name: 'synthetic \u20ac' }, 'a character split across chunks is decoded whole')
  })

  it('in a process of its own, a finite one-chunk answer over a small cap is refused and the process exits cleanly, as a flooding one is', async () => {
    // The refusal destroys the request without an error: the promise already carries it, and a socket a complete answer
    // released to the agent's pool would otherwise emit an unhandled error and end the process (Codex, on 75e6156).
    const HTTP = fileURLToPath(new URL('../../scripts/paperclip-probe-http.mjs', import.meta.url))
    const dir = mkdtempSync(join(tmpdir(), 'pc-cap-child-'))
    try {
      const script = join(dir, 'child.mjs')
      writeFileSync(
        script,
        [
          `import { createServer } from 'node:http'`,
          `import { exchange } from ${JSON.stringify(HTTP)}`,
          `const [kind, cap] = process.argv.slice(2)`,
          `const body = kind === 'ascii' ? 'x'.repeat(2049) : kind === 'utf8' ? '\\u20ac'.repeat(683) + 'x' : kind === 'exact' ? 'x'.repeat(2048) : null`,
          `const server = createServer((req, res) => { if (body !== null) return res.end(body); const pump = setInterval(() => res.write('y'.repeat(65536)), 1); req.on('close', () => clearInterval(pump)) })`,
          `await new Promise((r) => server.listen(0, '127.0.0.1', r))`,
          `try { const v = await exchange({ port: server.address().port, timeoutMs: 3000, maxBodyBytes: Number(cap) }); console.log('resolved ' + v.text.length) } catch (e) { console.log('refused: ' + e.message) }`,
          `server.closeAllConnections()`,
          `server.close()`,
          '',
        ].join('\n'),
      )
      for (const [kind, cap, expected] of [
        ['ascii', '2048', 'refused: GET /: the response passed 2048 bytes'],
        ['utf8', '2048', 'refused: GET /: the response passed 2048 bytes'],
        ['exact', '2048', 'resolved 2048'],
        ['flood', '200000', 'refused: GET /: the response passed 200000 bytes'],
      ]) {
        const child = spawnSync(process.execPath, [script, kind, cap], { encoding: 'utf8', timeout: 20_000 })
        assert.equal(child.status, 0, `${kind}: exit ${child.status}; ${child.stderr}`)
        assert.equal(child.stdout.trim(), expected, kind)
        assert.equal(child.stderr, '', `${kind}: nothing on stderr`)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the flow’s health read and the container helper’s share the cap: a flooding health answer is no answer', async () => {
    const port = await flood()
    const flow = flowFor({ port, origin: `http://127.0.0.1:${port}`, pluginPath: '/nonexistent' })
    const outcome = await settledWithin(flow.health(), 5000)
    assert.notEqual(outcome, PENDING)
    assert.equal(outcome.value, null)
  })
})
