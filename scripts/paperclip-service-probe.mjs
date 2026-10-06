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
//      (its resend answers with the same issue) and applies a signed Stop (its resend: already applied);
//   5. the settle job runs on the host's own scheduler;
//   6. the server restarts on the same database and home, with sign-up closed: the plugin is ready again from its path
//      with its configuration unchanged, the adapter loads again, the lookup finds the same issue, and a new sign-up is
//      refused;
//   7. the resident memory of the server and of the plugin worker is sampled throughout, by phase. The server runs with
//      the image's heap bound; SOPHIA_PROBE_NODE_OPTIONS tries another (the plugin worker does not inherit it: the host
//      scrubs its environment).
// Synthetic data only: no provider, no Sophia service (the adapter is given an address nothing listens on), nothing
// beyond loopback. The database and the home are removed at the end.
//
// With --url, it starts nothing and drives a server already running at a loopback origin, in two phases (WBC-02-CX-0031;
// scripts/paperclip-probe-url.mjs):
//   node scripts/paperclip-service-probe.mjs --url http://127.0.0.1:3100 --phase first|restarted --state <file> [--out <file>]
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import assert from 'node:assert/strict'
import { flowFor, hex, PRIVATE_NAME, sleep, until } from './paperclip-probe-flow.mjs'

const PIN = '5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb'
const { values } = parseArgs({
  options: {
    paperclip: { type: 'string' },
    dist: { type: 'string' },
    url: { type: 'string' },
    phase: { type: 'string' },
    state: { type: 'string' },
    out: { type: 'string' },
    'plugin-path': { type: 'string' },
    'wait-ms': { type: 'string' },
    'deadline-ms': { type: 'string' },
  },
})

if (values.url !== undefined) {
  const { runUrl } = await import('./paperclip-probe-url.mjs')
  await runUrl(values)
} else {
  await runLocal()
}

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

async function runLocal() {
  const checkout = resolve(values.paperclip ?? process.env.PAPERCLIP_SOURCE ?? '')
  const dist = resolve(values.dist ?? join(import.meta.dirname, '../deploy/paperclip/dist'))
  const admin = process.env.SOPHIA_DISPOSABLE_DATABASE_URL
  if (!admin) throw new Error('SOPHIA_DISPOSABLE_DATABASE_URL is required')
  const { default: pg } = await import('pg')

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
    NODE_OPTIONS: process.env.SOPHIA_PROBE_NODE_OPTIONS ?? '--max-old-space-size=1024',
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
  }
  const flow = flowFor({ port, origin, pluginPath: join(dist, 'sophia-coordination-plugin') })
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
        return flow.health()
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

  const report = []
  try {
    execFileSync(process.execPath, [join(dist, 'verify-manifest.mjs'), dist, PIN], { stdio: 'inherit' })
    const first = await start()
    phase = 'operate'
    report.push(`started: health ${first.status}; the pinned migrations applied at start; sophia_dsh loaded (PAPERCLIP_ADAPTERS)`)
    await flow.hostGuard()
    report.push(`host-name guard: ${PRIVATE_NAME} admitted, any other name 403`)
    const op = await flow.bootstrap()
    report.push('first admin signed up and claimed over loopback; board API key minted')
    const ids = await flow.plugin(op)
    const sent = await flow.commission(op, ids)
    assert.equal(sent.reply.outcome, 'created')
    const issueId = sent.reply.issueId
    const resent = (await sent.resend()).json
    assert.deepEqual([resent?.outcome, resent?.issueId], ['existing', issueId], 'the resend answers with the same issue')
    const stopped = await flow.stop(op, ids, issueId)
    assert.deepEqual([stopped.first.outcome, stopped.first.status], ['applied', 'cancelled'])
    assert.deepEqual([stopped.again.outcome, stopped.again.status], ['already', 'cancelled'])
    report.push('plugin installed from its fixed path and configured; a signed commission created one issue (its resend: the same issue); a signed Stop applied (cancelled; its resend: already)')
    const run = await flow.scheduledJob(op, ids.pluginId)
    report.push(`settle job: a scheduled run ${run.status}`)
    const configDigest = await flow.configDigest(op, ids)
    await stop()
    phase = 'restart'
    const second = await start({ PAPERCLIP_AUTH_DISABLE_SIGN_UP: 'true' })
    phase = 'after restart'
    assert.equal(await flow.pluginStatus(op, ids.pluginId), 'ready')
    assert.equal(await flow.configDigest(op, ids), configDigest, 'the configuration is unchanged')
    const found = await flow.lookup(op, ids)
    assert.deepEqual([found.outcome, found.issueId, found.status], ['found', issueId, 'cancelled'])
    const refused = await flow.signUpRefused()
    report.push(`restarted (health ${second.status}): the plugin ready again from its path with its configuration unchanged, sophia_dsh loaded again, the lookup found the same issue (cancelled), sign-up refused (${refused})`)
    phase = 'idle'
    await sleep(30_000)
    await stop()
    for (const [label, m] of memory)
      report.push(
        `memory, ${label}: peak ${mib(m.peakKiB)} MiB resident (server and its children, at most ${m.processes} processes; the server alone ${mib(m.peakServerKiB)} MiB), last ${mib(m.lastKiB)} MiB, ${m.samples} samples`,
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
}
