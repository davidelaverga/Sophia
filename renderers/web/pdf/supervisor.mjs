#!/usr/bin/env node
// The render supervisor (SMC-M03 S5a part 2, plan §2.7): the trusted process on the renderer host. It holds only a
// render runner capability and talks only to the Sophia API. For each claimed job it:
// - fetches every file of the source package through the API, checking each against the package's SHA-256 and size,
//   into a fresh job directory;
// - runs the kernel (render-html.mjs) as its own process group, with an environment that names the browser (resolved
//   here, as the kernel's home is the job directory) and the render user and nothing else, so the capability never
//   reaches the kernel or the browser;
// - sends heartbeats while it runs: a Hold or a Stop (or a lost lease) kills the kernel, and nothing is uploaded;
// - uploads the PDF once if the kernel succeeded, then settles with the kernel's receipt;
// - removes the job directory, whatever happened.
// Usage: supervisor.mjs, with SOPHIA_API_URL, SOPHIA_RENDER_RUNNER_TOKEN_FILE (or SOPHIA_RENDER_RUNNER_TOKEN),
// SOPHIA_RENDER_WORK (a directory), and for the kernel SOPHIA_RENDER_UID (when root), SOPHIA_CHROMIUM_PATH or
// PLAYWRIGHT_BROWSERS_PATH (or Playwright's default cache in HOME).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromiumPath } from './confine.mjs'
import { sha256Hex } from './source-manifest.mjs'

const KERNEL = fileURLToPath(new URL('./render-html.mjs', import.meta.url))
/** What the kernel inherits besides the browser's path: the render user and nothing else (never the capability). */
const KERNEL_ENV = ['SOPHIA_RENDER_UID', 'SOPHIA_RENDER_GID']
const KILL_GRACE_MS = 10_000

/**
 * @typedef {{ apiUrl: string, token: string, workDir: string, env?: NodeJS.ProcessEnv, heartbeatMs?: number,
 *   pollMs?: number, beforeRender?: (job: RenderJob) => Promise<void>, log?: (line: string) => void }} SupervisorConfig
 * @typedef {{ jobId: string, leaseToken: string, language: string, sourceManifestHash: string, timeoutMs: number,
 *   files: { path: string, role: 'entry' | 'asset', sha256: string, byteLength: number }[] }} RenderJob
 * @typedef {{ claimed: false } | { claimed: true, jobId: string, outcome: string }} RunOutcome
 */

/** Why a call to the API failed; `status` is the HTTP status. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * One call to the API with the runner's capability.
 * @param {SupervisorConfig} cfg
 * @param {string} route
 * @param {{ method?: string, lease?: string, json?: unknown, pdf?: Buffer }} [init]
 */
async function api(cfg, route, init = {}) {
  /** @type {Record<string, string>} */
  const headers = { authorization: `Bearer ${cfg.token}` }
  if (init.lease) headers['x-sophia-render-lease'] = init.lease
  /** @type {string | Uint8Array<ArrayBuffer> | undefined} */
  let body
  if (init.pdf) {
    headers['content-type'] = 'application/pdf'
    body = Uint8Array.from(init.pdf)
  } else if (init.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.json)
  }
  const res = await fetch(new URL(route, cfg.apiUrl), {
    method: init.method ?? 'POST',
    headers,
    ...(body === undefined ? {} : { body }),
  })
  if (!res.ok) throw new ApiError(res.status, `${route}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res
}

/**
 * A reply's `state` (a heartbeat's or a settlement's), or '' when it has none.
 * @param {unknown} reply
 */
const stateOf = (reply) =>
  typeof reply === 'object' && reply !== null && 'state' in reply && typeof reply.state === 'string' ? reply.state : ''

/**
 * What the supervisor reads from the kernel's receipt; the receipt itself goes to the API, which validates it.
 * @param {unknown} receipt
 */
function receiptFacts(receipt) {
  if (typeof receipt !== 'object' || receipt === null || !('status' in receipt) || !('output' in receipt)) {
    throw new Error('the kernel wrote no receipt')
  }
  const output = receipt.output
  const outputSha256 =
    typeof output === 'object' && output !== null && 'sha256' in output && typeof output.sha256 === 'string'
      ? output.sha256
      : null
  /** @type {unknown} */
  const error = Reflect.get(receipt, 'error')
  const errorCode = typeof error === 'object' && error !== null ? textOf(error, 'code') : ''
  return { status: receipt.status, outputSha256, errorCode }
}

/**
 * A string field of an object, or '' when it has none.
 * @param {object} o
 * @param {string} key
 */
const textOf = (o, key) => {
  /** @type {unknown} */
  const value = Reflect.get(o, key)
  return typeof value === 'string' ? value : ''
}

/**
 * One file of a claimed package, checked for its shape.
 * @param {unknown} f
 * @returns {RenderJob['files'][number]}
 */
function jobFileOf(f) {
  if (typeof f !== 'object' || f === null) throw new Error('the API answered the claim with a malformed file')
  const role = textOf(f, 'role')
  /** @type {unknown} */
  const byteLength = Reflect.get(f, 'byteLength')
  if ((role !== 'entry' && role !== 'asset') || typeof byteLength !== 'number') {
    throw new Error('the API answered the claim with a malformed file')
  }
  return { path: textOf(f, 'path'), role, sha256: textOf(f, 'sha256'), byteLength }
}

/**
 * The claimed job in the API's reply (RenderClaim), or null when there is none.
 * @param {unknown} reply
 * @returns {RenderJob | null}
 */
function jobOf(reply) {
  if (typeof reply !== 'object' || reply === null || !('job' in reply)) {
    throw new Error('the API answered the claim without a job')
  }
  /** @type {unknown} */
  const job = reply.job
  if (job === null) return null
  if (typeof job !== 'object') throw new Error('the API answered the claim with a malformed job')
  /** @type {unknown} */
  const files = Reflect.get(job, 'files')
  /** @type {unknown} */
  const timeout = Reflect.get(job, 'timeoutMs')
  if (!Array.isArray(files)) throw new Error('the API answered the claim with a malformed job')
  return {
    jobId: textOf(job, 'jobId'),
    leaseToken: textOf(job, 'leaseToken'),
    language: textOf(job, 'language'),
    sourceManifestHash: textOf(job, 'sourceManifestHash'),
    timeoutMs: typeof timeout === 'number' ? timeout : 120_000,
    files: files.map((/** @type {unknown} */ f) => jobFileOf(f)),
  }
}

/**
 * Fetch every file of the package into `sourceRoot`, each checked against its hash and size, written once.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {string} sourceRoot
 */
async function fetchPackage(cfg, job, sourceRoot) {
  for (const file of job.files) {
    const res = await api(cfg, `/v1/renderer/jobs/${job.jobId}/file?path=${encodeURIComponent(file.path)}`, {
      method: 'GET',
      lease: job.leaseToken,
    })
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength !== file.byteLength || sha256Hex(bytes) !== file.sha256) {
      throw new Error(`the package file ${file.path} does not match its record`)
    }
    const target = path.join(sourceRoot, file.path)
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 })
    fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 })
  }
}

/** @param {RenderJob['files'][number]} f */
const ref = (f) => ({ path: f.path, sha256: f.sha256 })

/**
 * The job file the kernel reads.
 * @param {RenderJob} job
 * @param {{ dir: string, sourceRoot: string, outputDir: string }} where
 */
function kernelJob(job, where) {
  const entry = job.files.find((f) => f.role === 'entry')
  if (!entry) throw new Error('the package has no entry')
  return {
    jobId: job.jobId,
    sourceRoot: where.sourceRoot,
    entry: ref(entry),
    assets: job.files.filter((f) => f.role === 'asset').map(ref),
    language: job.language,
    outputDir: where.outputDir,
    scratchDir: where.dir,
    timeoutMs: job.timeoutMs,
  }
}

/**
 * Run the kernel as its own process group with heartbeats; resolve with whether it was cancelled.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {string} jobFile
 * @param {string} browser the headless shell, resolved by this process
 * @returns {Promise<{ cancelled: boolean }>}
 */
function runKernel(cfg, job, jobFile, browser) {
  const source = cfg.env ?? process.env
  /** @type {NodeJS.ProcessEnv} */
  const env = { PATH: '/usr/bin:/bin', HOME: path.dirname(jobFile), SOPHIA_CHROMIUM_PATH: browser }
  for (const key of KERNEL_ENV) if (source[key]) env[key] = source[key]
  const child = spawn(process.execPath, [KERNEL, '--job', jobFile], {
    env,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child.stderr.on('data', (/** @type {Buffer} */ d) => cfg.log?.(`[kernel ${job.jobId}] ${d.toString().trim()}`))
  let cancelled = false
  const stop = () => {
    if (cancelled || child.pid === undefined) return
    cancelled = true
    process.kill(-child.pid, 'SIGTERM')
    setTimeout(
      () => child.exitCode === null && child.pid !== undefined && process.kill(-child.pid, 'SIGKILL'),
      KILL_GRACE_MS,
    ).unref()
  }
  const beat = async () => {
    try {
      const res = await api(cfg, `/v1/renderer/jobs/${job.jobId}/heartbeat`, { json: { leaseToken: job.leaseToken } })
      if (stateOf(await res.json()) !== 'continue') stop()
    } catch {
      stop()
    }
  }
  void beat()
  const timer = setInterval(() => void beat(), cfg.heartbeatMs ?? 5000)
  return new Promise((resolve) => {
    child.on('exit', () => {
      clearInterval(timer)
      resolve({ cancelled })
    })
  })
}

/**
 * Upload the PDF when the kernel succeeded, then settle with its receipt.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {string} outputDir
 */
async function deliver(cfg, job, outputDir) {
  const receiptFile = path.join(outputDir, 'receipt.json')
  if (!fs.existsSync(receiptFile)) throw new Error('the kernel wrote no receipt')
  /** @type {unknown} */
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'))
  const facts = receiptFacts(receipt)
  if (facts.status === 'succeeded') {
    const pdf = fs.readFileSync(path.join(outputDir, 'report.pdf'))
    if (sha256Hex(pdf) !== facts.outputSha256) throw new Error('the PDF does not match its receipt')
    await api(cfg, `/v1/renderer/jobs/${job.jobId}/output`, { method: 'PUT', lease: job.leaseToken, pdf })
  } else cfg.log?.(`render ${job.jobId} ${String(facts.status)}: ${facts.errorCode || 'no error code'}`)
  const res = await api(cfg, `/v1/renderer/jobs/${job.jobId}/settle`, { json: { leaseToken: job.leaseToken, receipt } })
  return stateOf(await res.json())
}

/**
 * What a host needs before it claims, so a misconfigured host takes no job; returns the browser's path.
 * - The headless shell, resolved here: the kernel's home is the job directory, so it is handed the path.
 * - When this process is root, the browser runs as the render user, who must reach the job directories: the work
 *   directory needs search permission for others.
 * @param {SupervisorConfig} cfg
 */
function hostReady(cfg) {
  const browser = chromiumPath(cfg.env ?? process.env)
  if (!fs.existsSync(browser)) {
    throw new Error(`no headless shell at ${browser}: set SOPHIA_CHROMIUM_PATH or PLAYWRIGHT_BROWSERS_PATH`)
  }
  if (process.getuid?.() === 0 && (fs.statSync(cfg.workDir).mode & 0o001) === 0) {
    throw new Error(`the render user cannot reach ${cfg.workDir}: give it search permission for others (o+x)`)
  }
  return browser
}

/**
 * Claim one job and see it through. Never throws for the job's own failure.
 * @param {SupervisorConfig} cfg
 * @returns {Promise<RunOutcome>}
 */
export async function runOnce(cfg) {
  const browser = hostReady(cfg)
  const job = jobOf(await (await api(cfg, '/v1/renderer/claim')).json())
  if (!job) return { claimed: false }
  const dir = fs.mkdtempSync(path.join(cfg.workDir, 'job-'))
  try {
    // The render user reads the package and owns its scratch inside this directory; the outputs stay this process's.
    fs.chmodSync(dir, 0o755)
    const where = { dir, sourceRoot: path.join(dir, 'src'), outputDir: path.join(dir, 'out') }
    fs.mkdirSync(where.sourceRoot, { mode: 0o755 })
    fs.mkdirSync(where.outputDir, { mode: 0o700 })
    await fetchPackage(cfg, job, where.sourceRoot)
    const jobFile = path.join(dir, 'job.json')
    fs.writeFileSync(jobFile, JSON.stringify(kernelJob(job, where)), { flag: 'wx', mode: 0o600 })
    await cfg.beforeRender?.(job)
    const run = await runKernel(cfg, job, jobFile, browser)
    if (run.cancelled) return { claimed: true, jobId: job.jobId, outcome: 'cancelled' }
    return { claimed: true, jobId: job.jobId, outcome: await deliver(cfg, job, where.outputDir) }
  } catch (error) {
    cfg.log?.(`render ${job.jobId} not delivered: ${error instanceof Error ? error.message : String(error)}`)
    return { claimed: true, jobId: job.jobId, outcome: 'abandoned' }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Claim and render until the signal aborts, waiting `pollMs` when there is nothing to claim.
 * @param {SupervisorConfig} cfg
 * @param {AbortSignal} signal
 */
export async function supervise(cfg, signal) {
  while (!signal.aborted) {
    let idle = false
    try {
      idle = !(await runOnce(cfg)).claimed
    } catch (error) {
      cfg.log?.(`claim failed: ${error instanceof Error ? error.message : String(error)}`)
      idle = true
    }
    if (idle) await new Promise((resolve) => setTimeout(resolve, cfg.pollMs ?? 2000))
  }
}

/** @param {NodeJS.ProcessEnv} env */
function configOf(env) {
  const tokenFile = env.SOPHIA_RENDER_RUNNER_TOKEN_FILE
  const token = tokenFile ? fs.readFileSync(tokenFile, 'utf8').trim() : (env.SOPHIA_RENDER_RUNNER_TOKEN ?? '')
  const apiUrl = env.SOPHIA_API_URL ?? ''
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(apiUrl)
  if (!token || !env.SOPHIA_RENDER_WORK || !(apiUrl.startsWith('https://') || local)) {
    throw new Error('set SOPHIA_API_URL (https), SOPHIA_RENDER_RUNNER_TOKEN_FILE and SOPHIA_RENDER_WORK')
  }
  return {
    apiUrl,
    token,
    workDir: env.SOPHIA_RENDER_WORK,
    env,
    log: (/** @type {string} */ l) => process.stderr.write(`${l}\n`),
  }
}

/**
 * Whether this file is the command being run, however it was named (the package's bin link included): never an error,
 * whatever the process's first argument is, so importing the package's entry never fails on it (M03-RF-0023).
 */
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

if (isMain()) {
  const controller = new AbortController()
  process.once('SIGTERM', () => controller.abort())
  process.once('SIGINT', () => controller.abort())
  await supervise(configOf(process.env), controller.signal)
}
