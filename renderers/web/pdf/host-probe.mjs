#!/usr/bin/env node
// Qualify a renderer host before its runner is registered (SMC-M03 OP-C, plan §2.7 "Qualification"). Run it on the
// host, as the supervisor runs (root, with SOPHIA_RENDER_UID/GID naming the render user), with the supervisor's own
// environment. It holds no runner capability and calls no API.
// 1. It renders a fixture in the confined browser: the sandbox self-test, every kernel check and the page checks pass.
// 2. From inside the same confinement the browser gets (bin/confine-chromium's recipe: the render user, no new
//    privileges, fresh user, network, PID and mount namespaces, an empty environment), it checks that public TCP,
//    DNS, the link-local metadata address and the API host are all unreachable, and that the supervisor's
//    environment, the runner token file and any secret files are unreadable.
// Prints one JSON line per check, and exits 0 only when every check passes. Usage:
//   host-probe.mjs [--secret <path>]... [--node <path>]
// SOPHIA_API_URL and SOPHIA_RENDER_RUNNER_TOKEN_FILE are read when set. The checks inside run under this Node binary
// (or --node's), which the render user must be able to execute; when it cannot, the probe fails and says so.
import { spawnSync } from 'node:child_process'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { renderHtmlToPdf, renderUserOf } from './index.mjs'
import { sha256Hex } from './source-manifest.mjs'

/** @typedef {{ check: string, ok: boolean, detail: string }} ProbeResult */
/** @typedef {{ secrets?: string[], env?: NodeJS.ProcessEnv, node?: string }} ProbeOptions */

const FIXTURE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Probe</title></head><body>
<h1>Verifica dell'host di stampa</h1><p>${'Città, señal, naïve façade: àèéìòù ÀÈÉÌÒÙ ñ ¿¡. '.repeat(24)}</p></body></html>`

/**
 * Run a small Node program inside the confinement the browser gets, as the render user. Its stdout is a JSON object
 * of check name → error text (or null when the attempt succeeded, which is a failure for a negative check).
 * @param {string} node the Node binary that runs it
 * @param {string} program
 * @param {string[]} args
 * @param {{ uid: number, gid: number } | null} renderUser
 */
function inConfinement(node, program, args, renderUser) {
  const confine = [
    'unshare',
    '--user',
    '--map-current-user',
    '--net',
    '--pid',
    '--mount',
    '--fork',
    '--kill-child',
    '--mount-proc',
    '--',
    node,
    '--input-type=module',
    '-e',
    program,
    '--',
    ...args,
  ]
  const asUser = renderUser
    ? [
        'setpriv',
        `--reuid=${renderUser.uid}`,
        `--regid=${renderUser.gid}`,
        '--clear-groups',
        '--no-new-privs',
        '--',
        ...confine,
      ]
    : ['setpriv', '--no-new-privs', '--', ...confine]
  const run = spawnSync('env', ['-i', 'PATH=/usr/bin:/bin', 'HOME=/nonexistent', 'LANG=C.UTF-8', ...asUser], {
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (run.status !== 0)
    throw new Error(`the confinement did not run: ${(run.stderr || run.error?.message || '').trim()}`)
  const parsed = /** @type {unknown} */ (JSON.parse(run.stdout))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('the confinement answered no checks')
  // Anything but an error text counts as the attempt succeeding: the check fails.
  return Object.fromEntries(
    Object.entries(parsed).map(([check, error]) => [check, typeof error === 'string' ? error : null]),
  )
}

// Inside the namespace: each attempt must fail. A value of null means it succeeded. With -e there is no script path,
// so the arguments start at argv[1]. The supervisor's PID can name another process in the fresh PID namespace (in a
// container the supervisor is often PID 1, and so is the confined process), so an environment read there is the
// supervisor's only when its bytes are the supervisor's own (compared by hash).
const INSIDE = `
import net from 'node:net'; import dns from 'node:dns/promises'; import fs from 'node:fs'
import { createHash } from 'node:crypto'
const [apiIp, apiPort, supervisorPid, supervisorEnvSha, ...files] = process.argv.slice(1)
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
const out = {
  'public_tcp:1.1.1.1:443': await tcp('1.1.1.1', 443),
  'dns:example.com': await fail(() => dns.lookup('example.com')),
  'metadata:169.254.169.254:80': await tcp('169.254.169.254', 80),
  ['api_host:' + (apiIp || 'none') + ':' + apiPort]: apiIp ? await tcp(apiIp, apiPort) : 'no API host to try',
  ['supervisor_environment:/proc/' + supervisorPid + '/environ']: environ(),
}
for (const f of files) out['unreadable:' + f] = await fail(() => fs.statSync(f).isDirectory() ? fs.readdirSync(f) : fs.readFileSync(f))
process.stdout.write(JSON.stringify(out))
`

/**
 * The values of every `flag <value>` pair.
 * @param {string[]} argv
 * @param {string} flag
 */
const valuesOf = (argv, flag) => argv.flatMap((a, i) => (argv[i - 1] === flag ? [a] : []))

/**
 * The API host as an address (resolved here, outside, so the inside attempt is a connection, not a lookup).
 * @param {NodeJS.ProcessEnv} env
 */
async function apiTarget(env) {
  const raw = env.SOPHIA_API_URL
  if (!raw) return { ip: '', port: '443' }
  const url = new URL(raw)
  const { address } = await dns.lookup(url.hostname).catch(() => ({ address: '' }))
  return { ip: address, port: url.port || (url.protocol === 'https:' ? '443' : '80') }
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
  const renderUser = renderUserOf(env)
  const api = await apiTarget(env)
  const files = [env.SOPHIA_RENDER_RUNNER_TOKEN_FILE ?? '', ...secrets].filter(Boolean)
  const envSha = sha256Hex(fs.readFileSync('/proc/self/environ'))
  const inside = inConfinement(node, INSIDE, [api.ip, api.port, String(process.pid), envSha, ...files], renderUser)
  return Object.entries(inside).map(([check, error]) => ({
    check,
    ok: error !== null,
    detail: error === null ? 'reachable or readable from the job context' : `refused (${error})`,
  }))
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
