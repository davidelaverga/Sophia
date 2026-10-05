#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0015): qualifies the Paperclip service recipe on a local stack, before any hosting decision:
//   SOPHIA_DISPOSABLE_DATABASE_URL=postgres://... node scripts/paperclip-service-probe.mjs \
//     --paperclip <checkout at the pin, built as its own Dockerfile's build stage builds it> --dist <paperclip-build.mjs output>
// It starts the pin's built server as the image does (the image's environment, deploy/paperclip/start.sh), on loopback
// only, with a throwaway PostgreSQL database and PAPERCLIP_HOME, and then acts as the private operator would:
//   1. the server applies every pinned migration at start, and loads sophia_dsh (PAPERCLIP_ADAPTERS refuses the start
//      otherwise, and disables every adapter not declared);
//   2. the host-name guard admits loopback and the configured private name, and refuses any other name;
//   3. the first instance admin signs up and claims the instance over loopback, and mints a board API key;
//   4. the plugin installs from its fixed path, is configured for one company, creates one issue for a signed commission
//      and applies a signed Stop;
//   5. the settle job runs on the host's own scheduler;
//   6. the server restarts on the same database and home, with sign-up closed: the plugin is ready again from its path,
//      the adapter loads again, the lookup finds the same issue, and a new sign-up is refused;
//   7. the resident memory of the server and of the plugin worker is sampled throughout; the peak is reported.
// Synthetic data only: no provider, no Sophia service (the adapter is given an address nothing listens on), nothing
// beyond loopback. The database and the home are removed at the end.
import { execFileSync, spawn } from 'node:child_process'
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import assert from 'node:assert/strict'
import pg from 'pg'
import { signEnvelope } from '../packages/coordination/src/envelope.ts'

const PIN = '5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb'
const PRIVATE_NAME = 'paperclip-private'
const { values } = parseArgs({ options: { paperclip: { type: 'string' }, dist: { type: 'string' } } })
const checkout = resolve(values.paperclip ?? process.env.PAPERCLIP_SOURCE ?? '')
const dist = resolve(values.dist ?? join(import.meta.dirname, '../deploy/paperclip/dist'))
const admin = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
if (!admin) throw new Error('SOPHIA_DISPOSABLE_DATABASE_URL is required')

const hex = (bytes) => randomBytes(bytes).toString('hex')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })
}

/** Resident memory (KiB) of a process and every process below it, from /proc. */
function residentKiB(root) {
  const parents = new Map()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8')
      parents.set(Number(entry), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]))
    } catch {
      // the process ended while it was read
    }
  }
  const tree = [root]
  for (let i = 0; i < tree.length; i += 1)
    for (const [pid, ppid] of parents) if (ppid === tree[i]) tree.push(pid)
  const sizes = tree.map((pid) => {
    try {
      return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0)
    } catch {
      return 0
    }
  })
  return { processes: tree.length, kib: sizes.reduce((a, b) => a + b, 0), serverKiB: sizes[0] ?? 0 }
}

/** One HTTP exchange over loopback, with an explicit Host header when asked (fetch cannot set one). */
function call(port, method, path, { body, headers = {}, host } = {}) {
  return new Promise((done, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
          ...(host === undefined ? {} : { host }),
          ...headers,
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => {
          let json = null
          try {
            json = JSON.parse(text)
          } catch {
            // not JSON
          }
          done({ status: res.statusCode ?? 0, json, text, cookies: res.headers['set-cookie'] ?? [] })
        })
      },
    )
    req.on('error', fail)
    // a server that accepts and never answers (one thrashing in garbage collection, say) must not hang the probe
    req.setTimeout(20_000, () => req.destroy(new Error(`${method} ${path}: no answer in 20 s`)))
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

async function until(what, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(1000)
  }
}

const name = `sophia_pcsvc_${hex(5)}`
const server = new pg.Client({ connectionString: admin })
await server.connect()
await server.query(`CREATE DATABASE ${name}`)
const url = new URL(admin)
url.pathname = `/${name}`
const home = mkdtempSync(join(tmpdir(), 'sophia-paperclip-home-'))
const port = await freePort()
const origin = `http://127.0.0.1:${port}`
const env = {
  PATH: process.env.PATH ?? '',
  // the image's environment (deploy/paperclip/Dockerfile), on loopback instead of 0.0.0.0
  NODE_ENV: 'production',
  HOME: home,
  HOST: '127.0.0.1',
  PORT: String(port),
  SERVE_UI: 'true',
  PAPERCLIP_HOME: home,
  PAPERCLIP_INSTANCE_ID: 'default',
  PAPERCLIP_DEPLOYMENT_MODE: 'authenticated',
  PAPERCLIP_DEPLOYMENT_EXPOSURE: 'private',
  PAPERCLIP_MIGRATION_AUTO_APPLY: 'true',
  PAPERCLIP_DISABLE_CWD_ENV_FILE: 'true',
  PAPERCLIP_DISABLE_PLUGIN_AUTOBUILD: '1',
  PAPERCLIP_TELEMETRY_DISABLED: '1',
  PAPERCLIP_ANNOUNCEMENTS_ENABLED: 'false',
  PAPERCLIP_DB_BACKUP_ENABLED: 'false',
  PAPERCLIP_ADAPTERS: '[{"adapterType":"sophia_dsh"}]',
  SOPHIA_PAPERCLIP_DIR: dist,
  PAPERCLIP_APP_DIR: checkout,
  // what the secret store would hold
  DATABASE_URL: url.toString(),
  BETTER_AUTH_SECRET: hex(32),
  PAPERCLIP_SECRETS_MASTER_KEY: hex(32),
  PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: hex(32),
  PAPERCLIP_DECISION_SIGNING_SECRET: hex(32),
  PAPERCLIP_ALLOWED_HOSTNAMES: PRIVATE_NAME,
  SOPHIA_COORDINATION_URL: 'http://127.0.0.1:9',
  SOPHIA_COORDINATION_TOKEN: hex(32),
  // a heap cap to try a smaller service tier (the plugin worker does not inherit it: the host scrubs its environment)
  ...(process.env.SOPHIA_PROBE_NODE_OPTIONS ? { NODE_OPTIONS: process.env.SOPHIA_PROBE_NODE_OPTIONS } : {}),
}
const log = openSync(join(home, 'server.log'), 'a')
/** Resident memory by phase: the peak (server and its children; the server alone) and the last sample. */
const memory = new Map()
let phase = 'start'
let child = null
let sampler = null

function sample(pid) {
  const now = residentKiB(pid)
  const seen = memory.get(phase) ?? { peakKiB: 0, peakServerKiB: 0, lastKiB: 0, processes: 0, samples: 0 }
  memory.set(phase, {
    peakKiB: Math.max(seen.peakKiB, now.kib),
    peakServerKiB: Math.max(seen.peakServerKiB, now.serverKiB),
    lastKiB: now.kib,
    processes: Math.max(seen.processes, now.processes),
    samples: seen.samples + 1,
  })
}

const mib = (kib) => Math.round(kib / 1024)

function start(extra = {}) {
  child = spawn('/bin/sh', [join(dist, 'start.sh')], { env: { ...env, ...extra }, stdio: ['ignore', log, log] })
  const pid = child.pid
  sampler = setInterval(() => sample(pid), 500)
  return until(
    'the server to report ready',
    async () => {
      if (child.exitCode !== null) throw new Error(`the server exited (${child.exitCode}); see ${join(home, 'server.log')}`)
      const health = await call(port, 'GET', '/api/health').catch(() => null)
      return health?.status === 200 && health.json?.status === 'ok' ? health.json : null
    },
    240_000,
  )
}

async function stop() {
  clearInterval(sampler)
  const exited = new Promise((done) => child.once('exit', done))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
  await exited
  clearTimeout(timer)
}

const cookieOf = (cookies) => cookies.map((c) => c.split(';')[0]).join('; ')

/** The first instance admin over loopback: sign-up, the private-mode claim, and a board API key that does not expire. */
async function bootstrap() {
  const signUp = await call(port, 'POST', '/api/auth/sign-up/email', {
    body: { email: 'operator@example.invalid', password: hex(16), name: 'Synthetic operator' },
    headers: { origin },
  })
  assert.equal(signUp.status, 200, signUp.text)
  const session = { cookie: cookieOf(signUp.cookies), origin }
  const claim = await call(port, 'POST', '/api/bootstrap/claim', { body: {}, headers: session })
  assert.ok(claim.status < 300, `claim: ${claim.status} ${claim.text}`)
  const key = await call(port, 'POST', '/api/board-api-keys', {
    body: { name: 'operator', expiresAt: null },
    headers: session,
  })
  assert.ok(key.status < 300, `board key: ${key.status} ${key.text}`)
  return { userId: signUp.json.user.id, auth: { authorization: `Bearer ${key.json.token}` } }
}

async function hostGuard() {
  const named = await call(port, 'GET', '/api/health', { host: `${PRIVATE_NAME}:${port}` })
  const other = await call(port, 'GET', '/api/health', { host: `evil.example:${port}` })
  assert.equal(named.status, 200, 'the private name is admitted')
  assert.equal(other.status, 403, 'any other host name is refused')
}

const sophia = generateKeyPairSync('ed25519')
const SOPHIA_PROJECT = randomUUID()
const workId = randomUUID()
const key = `sophia-wbc02-${workId}`

function envelope(companyId, projectId, op, deliveryKey, body) {
  const now = Math.floor(Date.now() / 1000)
  return signEnvelope(
    {
      op,
      companyId,
      paperclipProjectId: projectId,
      sophiaProjectId: SOPHIA_PROJECT,
      workId,
      commissionKey: key,
      deliveryKey,
      initiator: { kind: 'member', id: randomUUID() },
      nonce: randomUUID(),
      iat: now,
      exp: now + 120,
    },
    body,
    sophia.privateKey,
  )
}

/** Install from the fixed path, configure for one company, then one commission and one Stop through the plugin. */
async function plugin(op) {
  const company = await call(port, 'POST', '/api/companies', { body: { name: 'Synthetic company' }, headers: op.auth })
  assert.ok(company.status < 300, company.text)
  const companyId = company.json.id
  const project = await call(port, 'POST', `/api/companies/${companyId}/projects`, {
    body: { name: 'Synthetic project' },
    headers: op.auth,
  })
  assert.ok(project.status < 300, project.text)
  const projectId = project.json.id
  const installed = await call(port, 'POST', '/api/plugins/install', {
    body: { packageName: join(dist, 'sophia-coordination-plugin'), isLocalPath: true },
    headers: op.auth,
  })
  assert.equal(installed.status, 200, installed.text)
  const pluginId = installed.json.id
  await until('the plugin to be ready', async () => (await pluginStatus(op, pluginId)) === 'ready', 60_000)
  const configJson = {
    signingPublicKey: sophia.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    integrationUserId: op.userId,
    projects: [{ sophiaProjectId: SOPHIA_PROJECT, companyId, paperclipProjectId: projectId }],
  }
  const configured = await call(port, 'POST', `/api/plugins/${pluginId}/config`, {
    body: { companyId, configJson },
    headers: op.auth,
  })
  assert.ok(configured.status < 300, configured.text)
  return { companyId, projectId, pluginId }
}

async function pluginStatus(op, pluginId) {
  return (await call(port, 'GET', `/api/plugins/${pluginId}`, { headers: op.auth })).json?.status
}

async function commissionAndStop(op, ids) {
  const commission = {
    key,
    sophiaProjectId: SOPHIA_PROJECT,
    paperclipProjectId: ids.projectId,
    workId,
    title: 'Source review: synthetic',
    description: 'A synthetic commission. Source text stays in Sophia.',
    initialStatus: 'blocked',
    wake: false,
  }
  const created = await call(port, 'POST', '/api/plugins/sophia.coordination/api/commissions', {
    body: { companyId: ids.companyId, envelope: envelope(ids.companyId, ids.projectId, 'commission', `commission-${workId}`, commission), commission },
    headers: op.auth,
  })
  assert.equal(created.status, 200, created.text)
  assert.equal(created.json.outcome, 'created')
  const control = { op: 'stop', key: 'stop-1', commissionKey: key, sophiaProjectId: SOPHIA_PROJECT, workId }
  const stopped = await call(port, 'POST', `/api/plugins/sophia.coordination/api/issues/${created.json.issueId}/control`, {
    body: { envelope: envelope(ids.companyId, ids.projectId, 'stop', control.key, control), control },
    headers: op.auth,
  })
  assert.equal(stopped.status, 200, stopped.text)
  assert.deepEqual([stopped.json.outcome, stopped.json.status], ['applied', 'cancelled'])
  return created.json.issueId
}

/** The settle job, run by the host's own scheduler (every minute; the scheduler ticks every 30 s). */
async function scheduledJob(op, pluginId) {
  const jobs = (await call(port, 'GET', `/api/plugins/${pluginId}/jobs`, { headers: op.auth })).json
  const job = jobs.find((j) => j.jobKey === 'settle-status-writes')
  assert.ok(job, 'the settle job is registered')
  return until(
    'a scheduled run of the settle job',
    async () => {
      const runs = (await call(port, 'GET', `/api/plugins/${pluginId}/jobs/${job.id}/runs`, { headers: op.auth })).json
      return Array.isArray(runs) ? runs.find((r) => r.status === 'succeeded') : null
    },
    150_000,
  )
}

async function lookup(op, ids) {
  const body = { key, sophiaProjectId: SOPHIA_PROJECT, workId }
  return call(port, 'POST', '/api/plugins/sophia.coordination/api/commissions/lookup', {
    body: { companyId: ids.companyId, envelope: envelope(ids.companyId, ids.projectId, 'lookup', `lookup-${workId}`, body), lookup: body },
    headers: op.auth,
  })
}

const report = []
try {
  execFileSync(process.execPath, [join(dist, 'verify-manifest.mjs'), dist, PIN], { stdio: 'inherit' })
  const first = await start()
  phase = 'operate'
  report.push(`started: health ${first.status}; the pinned migrations applied at start; sophia_dsh loaded (PAPERCLIP_ADAPTERS)`)
  await hostGuard()
  report.push(`host-name guard: ${PRIVATE_NAME} admitted, any other name 403`)
  const op = await bootstrap()
  report.push('first admin signed up and claimed over loopback; board API key minted')
  const ids = await plugin(op)
  const issueId = await commissionAndStop(op, ids)
  report.push('plugin installed from its fixed path and configured; a signed commission created one issue; a signed Stop applied (cancelled)')
  const run = await scheduledJob(op, ids.pluginId)
  report.push(`settle job: a scheduled run ${run.status}`)
  await stop()
  phase = 'restart'
  const second = await start({ PAPERCLIP_AUTH_DISABLE_SIGN_UP: 'true' })
  phase = 'after restart'
  assert.equal(await pluginStatus(op, ids.pluginId), 'ready')
  const found = await lookup(op, ids)
  assert.equal(found.status, 200, found.text)
  assert.deepEqual([found.json.outcome, found.json.issueId, found.json.status], ['found', issueId, 'cancelled'])
  const closed = await call(port, 'POST', '/api/auth/sign-up/email', {
    body: { email: 'late@example.invalid', password: hex(16), name: 'Late' },
    headers: { origin },
  })
  assert.ok(closed.status >= 400, `sign-up after close: ${closed.status}`)
  report.push(`restarted (health ${second.status}): the plugin ready again from its path, sophia_dsh loaded again, the lookup found the same issue (cancelled), sign-up refused (${closed.status})`)
  phase = 'idle'
  await sleep(30_000)
  await stop()
  for (const [name, m] of memory)
    report.push(
      `memory, ${name}: peak ${mib(m.peakKiB)} MiB resident (server and its children, at most ${m.processes} processes; the server alone ${mib(m.peakServerKiB)} MiB), last ${mib(m.lastKiB)} MiB, ${m.samples} samples`,
    )
  for (const line of report) console.log(`[service-probe] ${line}`)
} finally {
  if (child?.exitCode === null) await stop().catch(() => undefined)
  clearInterval(sampler)
  await server.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  await server.end()
  if (process.env.SOPHIA_KEEP_PROBE_HOME !== '1') rmSync(home, { recursive: true, force: true })
  else console.log(`[service-probe] home kept at ${home}`)
}
