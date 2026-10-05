#!/usr/bin/env node
// Qualify a renderer host before its runner is registered (SMC-M03 OP-C, plan §2.7 "Qualification"). Run it on the
// host, as the supervisor runs (root, with SOPHIA_RENDER_UID/GID naming the render user), with the supervisor's own
// environment. It holds no runner capability and calls no API.
// 1. It renders a fixture in the confined browser: the sandbox self-test, every kernel check and the page checks pass.
//    It captures a fixture page the same way a design's render is captured (SDD-01, capture-html.mjs), at both
//    targets: the capture succeeds in an active sandbox, every check passes (an unmeasured contrast is not a failure,
//    as the design gate reads it), and every PNG the receipt names is on disk with its hash.
// 2. Through bin/confine-chromium itself, the wrapper the browser starts through (the render user, no new privileges,
//    fresh user, network, PID and mount namespaces, an empty environment, its resource limits), it runs a small Node
//    program instead of the browser. It checks that the job has a network namespace of its own with no interface up
//    and only its own four environment variables; that public TCP, DNS, the link-local metadata address and the API
//    host are refused at once (no answer in time is not a refusal); and that the supervisor's environment, the runner
//    token file and any secret (each entry inside a named directory too) are refused by permission (EACCES or EPERM;
//    any other error shows nothing).
// A check that was not performed is a failure, never a pass (M03-RF-0019): without SOPHIA_API_URL, an API host that
// does not resolve here, or one this host cannot reach either (a refusal inside would prove nothing); without
// SOPHIA_RENDER_RUNNER_TOKEN_FILE; for a named secret that does not exist here, that is not a file or a directory, or
// that this probe cannot read either; and for a directory with more than 256 entries. Only the paths named are tried.
// Prints one JSON line per check, and exits 0 only when every check passes (1 when one fails; 2, running nothing, on a
// command line it does not understand). Usage:
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
import { parseArgs } from 'node:util'
import { captureHtml } from './capture-html.mjs'
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

/** A small designed page as the design compiler writes one: its own CSP, inline styles, two sections. */
const CAPTURE_FIXTURE = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Probe</title>
<style>body{margin:0;font:18px/1.5 Georgia,serif;color:#222;background:#fafafa} section{padding:1rem 2rem;max-width:60rem;margin:auto}</style>
</head><body><main><h1>Verifica dell'host di cattura</h1>
<section data-section="s1"><p data-block="b1">${'Città, señal, naïve façade: àèéìòù. '.repeat(8)}</p></section>
<section data-section="s2"><ul><li data-block="b2">Uno.</li><li data-block="b3">Due.</li></ul></section></main></body></html>
`

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

// Inside the namespace, each attempt must be refused: an error code means it was; { ok } is a positive finding (the
// job's environment, its network namespace); { found } (or anything else) says what was reached or why nothing was
// shown. With -e there is no script path,
// so the arguments start at argv[1]. The supervisor's PID can name another process in the fresh PID namespace (in a
// container the supervisor is often PID 1, and so is the confined process), so an environment read there is the
// supervisor's only when its bytes are the supervisor's own (compared by hash).
const INSIDE = `
import net from 'node:net'; import dns from 'node:dns/promises'; import fs from 'node:fs'; import os from 'node:os'
import { createHash } from 'node:crypto'
const [apiIp, apiPort, supervisorPid, supervisorEnvSha, jobEnvKeys, supervisorNet, ...files] = process.argv.slice(1)
const code = (e) => e.code || e.message
// A refusal is an error the attempt meets at once; one that connects, or gets no answer in time, shows nothing closed.
const tcp = (host, port) => new Promise((resolve) => {
  const s = net.connect({ host, port: Number(port), timeout: 3000 })
  s.on('connect', () => { s.destroy(); resolve({ found: 'connected from the job context' }) })
  s.on('timeout', () => { s.destroy(); resolve({ found: 'no refusal within 3 s, so not shown closed' }) })
  s.on('error', (e) => resolve(code(e)))
})
const lookup = async (name) => {
  try { await dns.lookup(name); return { found: 'resolved from the job context' } } catch (e) { return code(e) }
}
// Only a permission refusal shows a path closed to the job; any other error (not there, not a file) shows nothing.
const unreadable = (f) => {
  try {
    if (fs.statSync(f).isDirectory()) fs.readdirSync(f)
    else {
      const fd = fs.openSync(f, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
      try { fs.readSync(fd, Buffer.alloc(1), 0, 1, null) } finally { fs.closeSync(fd) }
    }
    return { found: 'readable from the job context' }
  } catch (e) {
    return e.code === 'EACCES' || e.code === 'EPERM' ? e.code : { found: 'not shown closed: ' + code(e) }
  }
}
const environ = () => {
  let bytes
  try { bytes = fs.readFileSync('/proc/' + supervisorPid + '/environ') } catch (e) { return code(e) }
  const same = createHash('sha256').update(bytes).digest('hex') === supervisorEnvSha
  return same ? { found: 'the supervisor environment is readable' } : 'that PID here is another process'
}
// Evidence for the network checks: the job context has a network namespace of its own, with no interface up.
const netns = () => {
  let mine
  try { mine = fs.readlinkSync('/proc/self/ns/net') } catch (e) { return { found: 'its namespace cannot be read: ' + code(e) } }
  if (mine === supervisorNet) return { found: 'the job context shares the supervisor network namespace' }
  const up = Object.keys(os.networkInterfaces()).filter((name) => name !== 'lo')
  return up.length > 0 ? { found: 'the job context has interfaces: ' + up.join(', ') } : { ok: 'its own, with no interface up' }
}
const extra = Object.keys(process.env).filter((k) => !jobEnvKeys.split(',').includes(k))
const out = {
  'job_environment': extra.length > 0 ? { found: 'the job context holds ' + extra.join(', ') } : { ok: 'only ' + jobEnvKeys },
  'network_namespace': netns(),
  'public_tcp:1.1.1.1:443': await tcp('1.1.1.1', 443),
  'dns:example.com': await lookup('example.com'),
  'metadata:169.254.169.254:80': await tcp('169.254.169.254', 80),
  ['supervisor_environment:/proc/' + supervisorPid + '/environ']: environ(),
}
if (apiIp) out['api_host:' + apiIp + ':' + apiPort] = await tcp(apiIp, apiPort)
for (const f of files) out['unreadable:' + f] = unreadable(f)
process.stdout.write(JSON.stringify(out))
`

/**
 * One check inside, from its answer: an error code is the refusal it needs, `{ ok }` a positive finding; anything else
 * fails. Only a variable's name is ever reported, never its value, and never a file's contents.
 * @param {string} check
 * @param {unknown} answer
 * @returns {ProbeResult}
 */
function outcome(check, answer) {
  if (typeof answer === 'string') return { check, ok: true, detail: `refused (${answer})` }
  const ok = typeof answer === 'object' && answer !== null && 'ok' in answer ? answer.ok : null
  if (typeof ok === 'string') return { check, ok: true, detail: ok }
  const found = typeof answer === 'object' && answer !== null && 'found' in answer ? answer.found : null
  return { check, ok: false, detail: typeof found === 'string' ? found : 'reachable or readable from the job context' }
}

const USAGE = 'usage: host-probe.mjs [--secret <path>]... [--node <path>]'

/**
 * The command line, read strictly: an unknown flag, a positional argument or a flag without a value stops the probe
 * before anything runs, so a secret the operator meant to name is never silently left out.
 * @param {string[]} argv
 * @returns {{ secrets: string[], node?: string }}
 */
export function probeArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { secret: { type: 'string', multiple: true }, node: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  })
  const secrets = values.secret ?? []
  if (secrets.includes('') || values.node === '') throw new Error('a flag was given an empty path')
  return { secrets, ...(values.node ? { node: values.node } : {}) }
}

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
 * A directory and every entry under it, as this process sees them, following symbolic links (each directory once),
 * or null when there are more than the cap.
 * @param {string} dir
 * @returns {string[] | null}
 */
function filesUnder(dir) {
  /** @type {string[]} */
  const found = [dir]
  const seen = new Set([fs.realpathSync(dir)])
  const queue = [dir]
  let entries = 0
  while (queue.length > 0) {
    const at = queue.shift() ?? ''
    for (const name of fs.readdirSync(at)) {
      entries += 1
      if (entries > MAX_SECRET_FILES) return null
      const full = path.join(at, name)
      found.push(full)
      const real = directoryOf(full)
      if (real !== null && !seen.has(real)) {
        seen.add(real)
        queue.push(full)
      }
    }
  }
  return found
}

/**
 * A path's real location when it is a directory (through a link too), else null.
 * @param {string} p
 */
function directoryOf(p) {
  try {
    return fs.statSync(p).isDirectory() ? fs.realpathSync(p) : null
  } catch {
    return null
  }
}

/**
 * Why a path cannot be tried inside, or null. Only a file or a directory can be shown closed, and only one this probe
 * itself can read: a refusal inside proves nothing about a path the supervisor's own side cannot read either.
 * @param {string} p
 * @returns {string | null}
 */
function untriable(p) {
  /** @type {fs.Stats} */
  let stat
  try {
    stat = fs.statSync(p)
  } catch (error) {
    return `${p} cannot be reached on this host (${codeOf(error)})`
  }
  if (!stat.isFile() && !stat.isDirectory()) return 'not a file or a directory, so the probe cannot show it closed'
  try {
    if (stat.isDirectory()) fs.readdirSync(p)
    else readOneByte(p)
  } catch (error) {
    return `this probe cannot read it either (${codeOf(error)}), so a refusal inside would prove nothing: run the probe as the supervisor`
  }
  return null
}

/**
 * @param {string} file
 */
function readOneByte(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
  try {
    fs.readSync(fd, Buffer.alloc(1), 0, 1, null)
  } finally {
    fs.closeSync(fd)
  }
}

/** @param {unknown} error */
const codeOf = (error) =>
  (error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code) ||
  (error instanceof Error ? error.message : String(error))

/**
 * The paths that must stay unreadable, as absolute paths, split into those to try inside (a directory with every entry
 * under it, since a directory that cannot be listed may still let its files be read by name) and the failures for
 * those that cannot be tried.
 * @param {string[]} named
 */
function secretTargets(named) {
  /** @type {string[]} */
  const present = []
  /** @type {ProbeResult[]} */
  const untried = []
  for (const f of named.map((p) => path.resolve(p))) {
    if (!fs.existsSync(f)) {
      untried.push(notRun(`unreadable:${f}`, `${f} does not exist on this host`))
      continue
    }
    const under = directoryOf(f) === null ? [f] : filesUnder(f)
    if (!under) untried.push(notRun(`unreadable:${f}`, `more than ${MAX_SECRET_FILES} entries; name the files instead`))
    for (const p of under ?? []) {
      const why = untriable(p)
      if (why) untried.push(notRun(`unreadable:${p}`, why))
      else present.push(p)
    }
  }
  return { present, untried }
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
 * Whether every capture a receipt names is on disk in `dir` with its hash.
 * @param {string} dir
 * @param {Array<{ name: string, sha256: string }>} captures
 */
function capturesOnDisk(dir, captures) {
  return captures.every((c) => {
    try {
      return sha256Hex(fs.readFileSync(path.join(dir, c.name))) === c.sha256
    } catch {
      return false
    }
  })
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<ProbeResult[]>}
 */
async function captureCheck(env) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-probe-capture-src-'))
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-probe-capture-out-'))
  fs.chmodSync(root, 0o755)
  fs.chmodSync(out, 0o777)
  fs.writeFileSync(path.join(root, 'index.html'), CAPTURE_FIXTURE, { mode: 0o644 })
  try {
    const receipt = await captureHtml(
      {
        sourceRoot: root,
        outputDir: out,
        entry: { path: 'index.html', sha256: sha256Hex(Buffer.from(CAPTURE_FIXTURE)) },
        language: 'it',
        targets: ['w390-light', 'w1280-light'],
      },
      { env },
    )
    const captured = receipt.status === 'succeeded'
    // As the design gate reads them: an unmeasured contrast is said on the page, not a failure.
    const failed = receipt.checks
      .filter((c) => c.outcome !== 'passed' && !(c.name === 'contrast' && c.outcome === 'unknown'))
      .map((c) => `${c.name}${c.target ? `@${c.target}` : ''}=${c.outcome}`)
    const judged = captured && receipt.checks.length > 0
    return [
      { check: 'capture', ok: captured, detail: receipt.error?.code ?? receipt.status },
      {
        check: 'capture_checks',
        ok: judged && failed.length === 0,
        detail: judged ? failed.join(', ') || 'all passed' : 'not run: nothing was captured',
      },
      {
        check: 'capture_sandbox',
        ok: receipt.sandbox?.active === true,
        detail: receipt.sandbox ? `renderers=${receipt.sandbox.renderers} uid=${receipt.sandbox.browserUid}` : 'none',
      },
      {
        check: 'capture_images',
        ok: captured && receipt.captures.length > 0 && capturesOnDisk(out, receipt.captures),
        detail: captured ? `${receipt.captures.length} captures` : 'not run: nothing was captured',
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
    files.untried,
  ].flat()
  if (process.platform !== 'linux') {
    const why = `the confinement runs on Linux only (here: ${process.platform})`
    return [notRun('confinement', why), ...unperformed]
  }
  try {
    const renderUser = renderUserOf(env)
    const envSha = sha256Hex(fs.readFileSync('/proc/self/environ'))
    const netns = fs.readlinkSync('/proc/self/ns/net')
    const args = [api.ip, api.port, String(process.pid), envSha, JOB_ENV_KEYS.join(','), netns, ...files.present]
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
    ['capture', () => captureCheck(env)],
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

/** Whether this file is the command being run, however it was named (a symbolic link to it included). */
function isMain() {
  try {
    return (
      Boolean(process.argv[1]) &&
      fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

/**
 * The command: one JSON line per check, exit 0 only when every check passes, 1 when one fails, 2 on a command line
 * it does not understand (nothing runs).
 * @param {string[]} argv
 */
async function main(argv) {
  /** @type {{ secrets: string[], node?: string }} */
  let options
  try {
    options = probeArgs(argv)
  } catch (error) {
    process.stderr.write(`host-probe: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`)
    process.exitCode = 2
    return
  }
  const results = await probeHost(options)
  for (const r of results) process.stdout.write(`${JSON.stringify(r)}\n`)
  process.exitCode = results.every((r) => r.ok) ? 0 : 1
}

if (isMain()) await main(process.argv.slice(2))
