#!/usr/bin/env node
// Qualify a renderer host before its runner is registered (SMC-M03 OP-C, plan §2.7 "Qualification"). Run it on the
// host, as the supervisor runs (root, with SOPHIA_RENDER_UID/GID naming the render user), with the supervisor's own
// environment. It holds no runner capability and calls no API.
// 1. It renders a fixture in the confined browser: the sandbox self-test, every kernel check and the page checks pass.
// 2. Through bin/confine-chromium itself, the wrapper the browser starts through (the render user, no new privileges,
//    fresh user, network, PID and mount namespaces, an empty environment, its resource limits), it runs a small Node
//    program instead of the browser and checks that public TCP, DNS, the link-local metadata address and the API host
//    are all unreachable, that the job's environment holds nothing of the supervisor's, and that the supervisor's
//    environment, the runner token file and any secret files (each file inside a named directory too) are unreadable.
// A check that was not performed is a failure, never a pass (M03-RF-0019): without SOPHIA_API_URL, an API host that
// does not resolve here, or one this host cannot reach either (a refusal inside would prove nothing); without
// SOPHIA_RENDER_RUNNER_TOKEN_FILE; and for a named secret that does not exist here.
// Prints one JSON line per check, and exits 0 only when every check passes. Usage:
//   host-probe.mjs [--secret <path>]... [--node <path>]
// SOPHIA_API_URL and SOPHIA_RENDER_RUNNER_TOKEN_FILE are read when set. The checks inside run under this Node binary
// (or --node's), which the render user must be able to execute; when it cannot, the probe fails and says so.
import { spawnSync } from 'node:child_process'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { renderHtmlToPdf, renderUserOf } from './index.mjs'
import { sha256Hex } from './source-manifest.mjs'

/** @typedef {{ check: string, ok: boolean, detail: string }} ProbeResult */
const WRAPPER = fileURLToPath(new URL('./bin/confine-chromium', import.meta.url))
/** The job context's whole environment, as the wrapper sets it. */
const JOB_ENV_KEYS = ['HOME', 'LANG', 'PATH', 'TMPDIR']
/** At most this many files of a named secret directory are tried one by one. */
const MAX_SECRET_FILES = 256
/** @typedef {{ secrets?: string[], env?: NodeJS.ProcessEnv, node?: string }} ProbeOptions */

const FIXTURE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Probe</title></head><body>
<h1>Verifica dell'host di stampa</h1><p>${'Città, señal, naïve façade: àèéìòù ÀÈÉÌÒÙ ñ ¿¡. '.repeat(24)}</p></body></html>`

/**
 * Run a small Node program inside the confinement the browser gets, through the browser's own wrapper with this Node
 * binary in the browser's place, as the render user. Its stdout is a JSON object of check name → the error text when
 * the attempt was refused, or what it found when it succeeded (a failure: every check inside is a negative one).
 * @param {string} node the Node binary that runs it
 * @param {string} program
 * @param {string[]} args
 * @param {{ uid: number, gid: number } | null} renderUser
 */
function inConfinement(node, program, args, renderUser) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-probe-home-'))
  fs.chmodSync(home, 0o755)
  try {
    const run = spawnSync(WRAPPER, ['--input-type=module', '-e', program, '--', ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        SOPHIA_CHROMIUM: node,
        SOPHIA_RENDER_HOME: home,
        ...(renderUser ? { SOPHIA_RENDER_UID: String(renderUser.uid), SOPHIA_RENDER_GID: String(renderUser.gid) } : {}),
      },
      encoding: 'utf8',
      timeout: 30_000,
    })
    if (run.status !== 0)
      throw new Error(`the confinement did not run: ${(run.stderr || run.error?.message || '').trim()}`)
    const parsed = /** @type {unknown} */ (JSON.parse(run.stdout))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('the confinement answered no checks')
    // Anything but an error text counts as the attempt succeeding: the check fails.
    return Object.entries(parsed).map(([check, answer]) => outcome(check, answer))
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
}

// Inside the namespace: each attempt must fail. An error text means it did; { found } (or null) means it succeeded. With -e there is no script path,
// so the arguments start at argv[1]. The supervisor's PID can name another process in the fresh PID namespace (in a
// container the supervisor is often PID 1, and so is the confined process), so an environment read there is the
// supervisor's only when its bytes are the supervisor's own (compared by hash).
const INSIDE = `
import net from 'node:net'; import dns from 'node:dns/promises'; import fs from 'node:fs'
import { createHash } from 'node:crypto'
const [apiIp, apiPort, supervisorPid, supervisorEnvSha, jobEnvKeys, ...files] = process.argv.slice(1)
const tcp = (host, port) => new Promise((resolve) => {
  const s = net.connect({ host, port: Number(port), timeout: 3000 })
  s.on('connect', () => { s.destroy(); resolve(null) })
  s.on('timeout', () => { s.destroy(); resolve('timeout') })
  s.on('error', (e) => resolve(e.code || e.message))
})
const fail = async (fn) => { try { await fn(); return null } catch (e) { return e.code || e.message } }
const environ = () => {
  let bytes
  try { bytes = fs.readFileSync('/proc/' + supervisorPid + '/environ') } catch (e) { return e.code || e.message }
  return createHash('sha256').update(bytes).digest('hex') === supervisorEnvSha ? null : 'that PID here is another process'
}
const extra = Object.keys(process.env).filter((k) => !jobEnvKeys.split(',').includes(k))
const out = {
  'job_environment': extra.length > 0 ? { found: 'the job context holds ' + extra.join(', ') } : 'only ' + jobEnvKeys,
  'public_tcp:1.1.1.1:443': await tcp('1.1.1.1', 443),
  'dns:example.com': await fail(() => dns.lookup('example.com')),
  'metadata:169.254.169.254:80': await tcp('169.254.169.254', 80),
  ['supervisor_environment:/proc/' + supervisorPid + '/environ']: environ(),
}
if (apiIp) out['api_host:' + apiIp + ':' + apiPort] = await tcp(apiIp, apiPort)
for (const f of files) out['unreadable:' + f] = await fail(() => fs.statSync(f).isDirectory() ? fs.readdirSync(f) : fs.readFileSync(f))
process.stdout.write(JSON.stringify(out))
`

/**
 * One check inside, from its answer: an error text is the refusal it needs; anything else is an attempt that succeeded.
 * Only a variable's name is ever reported, never its value.
 * @param {string} check
 * @param {unknown} answer
 * @returns {ProbeResult}
 */
function outcome(check, answer) {
  if (typeof answer === 'string') return { check, ok: true, detail: `refused (${answer})` }
  const found =
    typeof answer === 'object' && answer !== null && 'found' in answer && typeof answer.found === 'string'
      ? answer.found
      : 'reachable or readable from the job context'
  return { check, ok: false, detail: found }
}

/**
 * The values of every `flag <value>` pair.
 * @param {string[]} argv
 * @param {string} flag
 */
const valuesOf = (argv, flag) => argv.flatMap((a, i) => (argv[i - 1] === flag ? [a] : []))

/**
 * @param {string} check
 * @param {string} why
 * @returns {ProbeResult}
 */
const notRun = (check, why) => ({ check, ok: false, detail: `not run: ${why}` })

/**
 * The API host as an address, resolved here, outside, so the inside attempt is a connection, not a lookup. Without
 * one there is nothing to try, and the check fails.
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{ ip: string, port: string } | ProbeResult>}
 */
async function apiTarget(env) {
  const raw = env.SOPHIA_API_URL
  if (!raw) return notRun('api_host', 'SOPHIA_API_URL is not set, so there is no API host to try')
  let url
  try {
    url = new URL(raw)
  } catch {
    return notRun('api_host', 'SOPHIA_API_URL is not a URL')
  }
  // An IPv6 literal keeps its brackets in a URL's hostname; a lookup wants it bare.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
  if (!host) return notRun('api_host', 'SOPHIA_API_URL names no host')
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  const resolved = await dns.lookup(host).catch(() => null)
  const ip = typeof resolved?.address === 'string' ? resolved.address : ''
  if (!ip) return notRun(`api_host:${host}:${port}`, `${host} does not resolve on this host`)
  // The positive control: a refusal inside proves isolation only for an API this host itself reaches.
  const reached = await tcpFromHere(ip, port)
  if (reached !== null)
    return notRun(
      `api_host:${ip}:${port}`,
      `this host cannot reach the API either (${reached}), so a refusal inside would prove nothing`,
    )
  return { ip, port }
}

/**
 * A TCP connection from this host, outside the confinement: null when it connected, else why not.
 * @param {string} host
 * @param {string} port
 * @returns {Promise<string | null>}
 */
function tcpFromHere(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port), timeout: 3000 })
    socket.on('connect', () => {
      socket.destroy()
      resolve(null)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve('timeout')
    })
    socket.on('error', (e) => resolve(/** @type {NodeJS.ErrnoException} */ (e).code ?? e.message))
  })
}

/**
 * A directory and every file under it (as this process sees them), or null when there are more than the cap.
 * @param {string} dir
 * @returns {string[] | null}
 */
function filesUnder(dir) {
  /** @type {string[]} */
  const found = [dir]
  const queue = [dir]
  while (queue.length > 0) {
    const at = queue.shift() ?? ''
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name)
      found.push(full)
      if (entry.isDirectory()) queue.push(full)
      if (found.length > MAX_SECRET_FILES) return null
    }
  }
  return found
}

/**
 * The files that must stay unreadable, split into those to try inside (a directory with every file under it, since
 * a directory that cannot be listed may still let its files be read by name) and the failures for those that cannot
 * be tried.
 * @param {string[]} files
 */
function secretTargets(files) {
  /** @type {string[]} */
  const present = []
  /** @type {ProbeResult[]} */
  const missing = []
  for (const f of files) {
    if (!fs.existsSync(f)) missing.push(notRun(`unreadable:${f}`, `${f} does not exist on this host`))
    else if (!fs.statSync(f).isDirectory()) present.push(f)
    else {
      const under = filesUnder(f)
      if (under) present.push(...under)
      else missing.push(notRun(`unreadable:${f}`, `more than ${MAX_SECRET_FILES} entries; name the files instead`))
    }
  }
  return { present, missing }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<ProbeResult[]>}
 */
async function renderCheck(env) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-probe-src-'))
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-probe-out-'))
  fs.chmodSync(root, 0o755)
  fs.chmodSync(out, 0o777)
  fs.writeFileSync(path.join(root, 'report.html'), FIXTURE, { mode: 0o644 })
  try {
    const receipt = await renderHtmlToPdf(
      {
        sourceRoot: root,
        outputDir: out,
        entry: { path: 'report.html', sha256: sha256Hex(Buffer.from(FIXTURE)) },
        assets: [],
        language: 'it',
      },
      { env },
    )
    const rendered = receipt.status === 'succeeded'
    const failed = receipt.checks.filter((c) => c.outcome !== 'passed').map((c) => `${c.name}=${c.outcome}`)
    // The checks pass only on a PDF that exists and was judged: a render that failed ran no check.
    const judged = rendered && receipt.checks.length > 0
    return [
      { check: 'render', ok: rendered, detail: receipt.error?.code ?? receipt.status },
      {
        check: 'kernel_checks',
        ok: judged && failed.length === 0,
        detail: judged ? failed.join(', ') || 'all passed' : 'not run: no PDF was rendered',
      },
      {
        check: 'sandbox',
        ok: receipt.sandbox?.active === true,
        detail: receipt.sandbox ? `renderers=${receipt.sandbox.renderers} uid=${receipt.sandbox.browserUid}` : 'none',
      },
    ]
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(out, { recursive: true, force: true })
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} secrets
 * @param {string} node
 * @returns {Promise<ProbeResult[]>}
 */
async function confinementChecks(env, secrets, node) {
  const target = await apiTarget(env)
  const api = 'ip' in target ? target : { ip: '', port: '' }
  const tokenFile = env.SOPHIA_RENDER_RUNNER_TOKEN_FILE
  const files = secretTargets([tokenFile ?? '', ...secrets].filter(Boolean))
  /** @type {ProbeResult[]} */
  const unperformed = [
    'check' in target ? [target] : [],
    tokenFile ? [] : [notRun('runner_token_file', 'SOPHIA_RENDER_RUNNER_TOKEN_FILE is not set, so it was not tried')],
    files.missing,
  ].flat()
  try {
    const renderUser = renderUserOf(env)
    const envSha = sha256Hex(fs.readFileSync('/proc/self/environ'))
    const args = [api.ip, api.port, String(process.pid), envSha, JOB_ENV_KEYS.join(','), ...files.present]
    return [...inConfinement(node, INSIDE, args, renderUser), ...unperformed]
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return [{ check: 'confinement', ok: false, detail }, ...unperformed]
  }
}

/**
 * Run every check; a check that cannot run is a failure, never a pass.
 * @param {ProbeOptions} [options] the files that must stay unreadable, the supervisor's environment, and the Node
 *   binary the checks inside run under
 */
export async function probeHost({ secrets = [], env = process.env, node = process.execPath } = {}) {
  /** @type {ProbeResult[]} */
  const results = []
  /** @type {Array<[string, () => Promise<ProbeResult[]>]>} */
  const steps = [
    ['render', () => renderCheck(env)],
    ['confinement', () => confinementChecks(env, secrets, node)],
  ]
  for (const [name, step] of steps) {
    try {
      results.push(...(await step()))
    } catch (error) {
      results.push({ check: name, ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const node = valuesOf(argv, '--node')[0]
  const results = await probeHost({ secrets: valuesOf(argv, '--secret'), ...(node ? { node } : {}) })
  for (const r of results) process.stdout.write(`${JSON.stringify(r)}\n`)
  process.exitCode = results.every((r) => r.ok) ? 0 : 1
}
