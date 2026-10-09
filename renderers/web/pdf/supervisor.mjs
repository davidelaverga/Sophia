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
// - once the kernel's leader exits, kills what is left of its process group and waits until none of it (and, in UML
//   mode, no process of the render uid) is alive before it removes the job directory; a job whose processes outlive
//   that wait taints the host (HostTainted): its directory is kept and the supervisor stops claiming.
// SDD-01: a claim names the formats this host renders (`pdf`, and `png` for the capture kernel, capture-html.mjs); a
// capture job runs that kernel instead and uploads each PNG its receipt names, checked against the receipt, before it
// settles. A runner that names no formats is a PDF runner and is never handed a capture.
// SDD-01, Render: with SOPHIA_RENDER_ISOLATION=uml the kernel runs, unchanged, inside a User-mode Linux guest
// (renderers/web/pdf/uml) behind the host launchers (render uid, fresh user/network/PID namespaces, no new privileges,
// Landlock, seccomp): one read-only input disk carries the job, one output disk of a fixed size carries its output
// back (uml-job.mjs), read through the descriptor this process created it with, only as regular files with the
// kernels' own names, within bounds. Killing the launcher's process group ends the guest; a guest past its job's time
// plus UML_MARGIN_MS is killed and its job abandoned.
// Usage: supervisor.mjs, with SOPHIA_API_URL, SOPHIA_RENDER_RUNNER_TOKEN_FILE (or SOPHIA_RENDER_RUNNER_TOKEN),
// SOPHIA_RENDER_WORK (a directory), and for the kernel SOPHIA_RENDER_UID (when root), SOPHIA_CHROMIUM_PATH or
// PLAYWRIGHT_BROWSERS_PATH (or Playwright's default cache in HOME); or SOPHIA_RENDER_ISOLATION=uml, with the guest's
// artifacts under SOPHIA_UML_ROOT (/opt/uml).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromiumPath } from './confine.mjs'
import { sha256Hex } from './source-manifest.mjs'
import { inputArchive, outputDisk, takeOutput } from './uml-job.mjs'

/** The kernel each format runs. */
const KERNELS = {
  pdf: fileURLToPath(new URL('./render-html.mjs', import.meta.url)),
  png: fileURLToPath(new URL('./capture-html.mjs', import.meta.url)),
}
/** The formats this host renders, as its claims name them. */
export const FORMATS = /** @type {const} */ (['pdf', 'png'])
/** A capture's file name, as the capture kernel writes it and the API accepts it. */
const CAPTURE_NAME = /^[a-z0-9][a-z0-9.-]{0,150}\.png$/
/** What the kernel inherits besides the browser's path: the render user and nothing else (never the capability). */
const KERNEL_ENV = ['SOPHIA_RENDER_UID', 'SOPHIA_RENDER_GID']
const KILL_GRACE_MS = 10_000
/** How long a job's processes may take to be gone once its leader exited (each round killed again), and its pipes. */
const GONE_MS = 15_000
const CLOSE_MS = 2_000
/** A claim's longest time: the API sets 120 s; anything past this (or not a whole positive number) is malformed. */
const MAX_TIMEOUT_MS = 600_000
/** The render uid the UML launchers run as (namespace-launch.py maps exactly it). */
const RENDER_UID = 10001
/** How many of the guest's marked lines (`UML_`) are logged, each printable and at most 300 characters. */
const UML_LOG_LINES = 400
/** A UML guest's time past its job's: its boot, the archive written back and its power-off. */
export const UML_MARGIN_MS = 90_000
/** What the launchers and the guest may print before the job is refused: their records, boot and kernel logs. */
const UML_LOG_BYTES = 8 * 1024 * 1024
/** The guest's artifacts, each root-owned and writable by no one else (namespace-launch.py checks them again). */
const UML_ARTIFACTS = ['namespace-launch.py', 'landlock-launch.py', 'linux.uml', 'initrd.gz', 'guest.raw']
/** Where a job's paths lie inside the guest (uml/guest-job). */
const GUEST = { dir: '/work/job', sourceRoot: '/work/job/src', outputDir: '/work/job/out' }

/**
 * @typedef {{ root?: string, command?: (dir: string) => string[], marginMs?: number, goneMs?: number }} UmlConfig the
 *   guest's artifacts; `command`, `marginMs` and `goneMs` replace the launchers, the margin and the reap's wait in tests
 *   only
 * @typedef {{ apiUrl: string, token: string, workDir: string, env?: NodeJS.ProcessEnv, heartbeatMs?: number,
 *   pollMs?: number, beforeRender?: (job: RenderJob) => Promise<void>, log?: (line: string) => void,
 *   isolation?: 'native' | 'uml', uml?: UmlConfig, tokenFile?: string }} SupervisorConfig
 * @typedef {{ jobId: string, leaseToken: string, language: string, sourceManifestHash: string, timeoutMs: number,
 *   files: { path: string, role: 'entry' | 'asset', sha256: string, byteLength: number }[], format: 'pdf' | 'png',
 *   targets: string[], sections: string[] | null }} RenderJob
 * @typedef {{ claimed: false } | { claimed: true, jobId: string, outcome: string }} RunOutcome
 * @typedef {{ cancelled: boolean, timedOut: boolean, lingering: boolean, failed: string | null }} RunEnd how a
 *   kernel's run ended: stopped, past its time, with processes that outlived the wait, or never started
 */

/** A job's processes outlived it: its directory is kept, and this host claims nothing more until it restarts. */
export class HostTainted extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'HostTainted'
  }
}

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
 * @param {{ method?: string, lease?: string, json?: unknown, bytes?: { type: string, data: Buffer } }} [init]
 */
async function api(cfg, route, init = {}) {
  /** @type {Record<string, string>} */
  const headers = { authorization: `Bearer ${cfg.token}` }
  if (init.lease) headers['x-sophia-render-lease'] = init.lease
  /** @type {string | Uint8Array<ArrayBuffer> | undefined} */
  let body
  if (init.bytes) {
    headers['content-type'] = init.bytes.type
    body = Uint8Array.from(init.bytes.data)
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
  if (typeof receipt !== 'object' || receipt === null || !('status' in receipt)) {
    throw new Error('the kernel wrote no receipt')
  }
  /** @type {unknown} */
  const output = Reflect.get(receipt, 'output')
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
 * A claim's time: 120 s when it names none, else a whole number of 1 to MAX_TIMEOUT_MS ms, or the claim is malformed.
 * @param {object} job
 */
function timeoutOf(job) {
  /** @type {unknown} */
  const timeout = Reflect.get(job, 'timeoutMs')
  if (timeout === undefined) return 120_000
  if (typeof timeout === 'number' && Number.isSafeInteger(timeout) && timeout > 0 && timeout <= MAX_TIMEOUT_MS)
    return timeout
  throw new Error(`the API answered the claim with a timeout that is not 1 to ${MAX_TIMEOUT_MS} ms`)
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
  if (!Array.isArray(files)) throw new Error('the API answered the claim with a malformed job')
  const format = textOf(job, 'format') || 'pdf'
  if (format !== 'pdf' && format !== 'png')
    throw new Error(`the API handed a ${format} job to a host that renders pdf and png`)
  return {
    jobId: textOf(job, 'jobId'),
    leaseToken: textOf(job, 'leaseToken'),
    language: textOf(job, 'language'),
    sourceManifestHash: textOf(job, 'sourceManifestHash'),
    timeoutMs: timeoutOf(job),
    files: files.map((/** @type {unknown} */ f) => jobFileOf(f)),
    format,
    targets: textsOf(Reflect.get(job, 'targets')) ?? [],
    sections: textsOf(Reflect.get(job, 'sections')),
  }
}

/**
 * A list of strings, or null when the value is not one.
 * @param {unknown} value
 * @returns {string[] | null}
 */
const textsOf = (value) =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? value.map(String) : null

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
  const common = {
    jobId: job.jobId,
    sourceRoot: where.sourceRoot,
    entry: ref(entry),
    language: job.language,
    outputDir: where.outputDir,
    scratchDir: where.dir,
    timeoutMs: job.timeoutMs,
  }
  if (job.format === 'png') return { ...common, targets: job.targets, sections: job.sections }
  return { ...common, assets: job.files.filter((f) => f.role === 'asset').map(ref) }
}

/**
 * Run the kernel as its own process group with heartbeats; resolve with whether it was cancelled.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {string} jobFile
 * @param {string} browser the headless shell, resolved by this process
 * @returns {Promise<RunEnd>}
 */
function runKernel(cfg, job, jobFile, browser) {
  const source = cfg.env ?? process.env
  /** @type {NodeJS.ProcessEnv} */
  const env = { PATH: '/usr/bin:/bin', HOME: path.dirname(jobFile), SOPHIA_CHROMIUM_PATH: browser }
  for (const key of KERNEL_ENV) if (source[key]) env[key] = source[key]
  const child = spawn(process.execPath, [KERNELS[job.format], '--job', jobFile], {
    env,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child.stderr.on('data', (/** @type {Buffer} */ d) => cfg.log?.(`[kernel ${job.jobId}] ${d.toString().trim()}`))
  return supervised(cfg, job, child, { wallMs: null, uid: null, goneMs: GONE_MS }).done
}

/**
 * Signal a process group this process started; one already gone is not an error.
 * @param {number} group the negated pid of its leader
 * @param {NodeJS.Signals} signal
 */
function signalGroup(group, signal) {
  try {
    process.kill(group, signal)
  } catch (error) {
    if (!(error instanceof Error) || Reflect.get(error, 'code') !== 'ESRCH') throw error
  }
}

/**
 * The processes alive now (zombies left out), from /proc: each one's process group and real uid; null where there is
 * no /proc to read.
 * @returns {{ pgrp: number, uid: number, pid: number }[] | null}
 */
function liveProcesses() {
  let names
  try {
    names = fs.readdirSync('/proc')
  } catch {
    return null
  }
  /** @type {{ pgrp: number, uid: number, pid: number }[]} */
  const live = []
  for (const name of names) {
    if (!/^\d+$/u.test(name)) continue
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8')
      const [state, , pgrp] = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      const status = fs.readFileSync(`/proc/${name}/status`, 'utf8')
      // A zombie has one thread left; a process whose main thread exited while others run also reads Z, and runs.
      const threads = Number(/^Threads:\s+(\d+)/mu.exec(status)?.[1] ?? 1)
      if (state === 'X' || (state === 'Z' && threads <= 1)) continue
      const uid = /^Uid:\s+(\d+)/mu.exec(status)?.[1]
      live.push({ pid: Number(name), pgrp: Number(pgrp), uid: Number(uid ?? -1) })
    } catch {
      // gone while it was read
    }
  }
  return live
}

/**
 * Kill what is left of a process group whose leader exited, and (when `uid` is set) every process of that uid, until
 * none is alive or `goneMs` passes. Zombies are not alive: this process may be PID 1 and never reap them.
 * @param {number} pgid
 * @param {number | null} uid
 * @param {number} goneMs
 * @returns {Promise<boolean>} whether they are all gone
 */
async function reap(pgid, uid, goneMs) {
  const until = Date.now() + goneMs
  for (;;) {
    const live = liveProcesses()
    const left = live
      ? live.filter((p) => p.pgrp === pgid || (uid !== null && p.uid === uid))
      : groupAlive(pgid)
        ? [{ pid: -pgid }]
        : []
    if (left.length === 0) return true
    if (Date.now() > until) return false
    for (const target of [-pgid, ...left.map((p) => p.pid).filter((pid) => pid > 0 && pid !== process.pid)]) {
      try {
        process.kill(target, 'SIGKILL')
      } catch {
        // gone already, or not this process's to kill: counted again next round
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Whether any process of a group is still there (where there is no /proc; a zombie counts).
 * @param {number} pgid
 */
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Heartbeats for a running job, every `heartbeatMs`: anything but `continue` (a Hold, a Stop, a lost lease), or no
 * answer, stops it.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {() => void} stop
 */
function heartbeats(cfg, job, stop) {
  const beat = async () => {
    try {
      const res = await api(cfg, `/v1/renderer/jobs/${job.jobId}/heartbeat`, { json: { leaseToken: job.leaseToken } })
      if (stateOf(await res.json()) !== 'continue') stop()
    } catch {
      stop()
    }
  }
  void beat()
  return setInterval(() => void beat(), cfg.heartbeatMs ?? 5000)
}

/**
 * When the group's leader exits: kill and wait for what is left (reap), then its pipes for at most CLOSE_MS, and end
 * the run with whether all of it was gone. A leader that never started ends the run at once.
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ uid: number | null, goneMs: number }} limits
 * @param {(end: Omit<RunEnd, 'cancelled' | 'timedOut'>) => void} finish
 */
function onLeaderEnd(child, limits, finish) {
  const closed = new Promise((resolve) => {
    child.once('close', resolve)
  })
  child.on('error', (error) => {
    if (child.pid === undefined) finish({ lingering: false, failed: `the kernel did not start: ${error.message}` })
  })
  child.once('exit', () => {
    const pgid = child.pid
    if (pgid === undefined) return
    reap(pgid, limits.uid, limits.goneMs)
      .then(async (gone) => {
        await Promise.race([closed, new Promise((r) => setTimeout(r, CLOSE_MS).unref())])
        finish({ lingering: !gone, failed: null })
      })
      .catch(() => finish({ lingering: true, failed: null }))
  })
}

/**
 * Supervise a process group the supervisor started: heartbeats while it runs; a Hold, a Stop, a lost lease or (when
 * `wallMs` is set) its time running out kills the group, TERM then KILL. Once its leader exits, what is left of the
 * group (and, with `uid`, every process of that uid) is killed and waited for, for at most `goneMs`, then its pipes for
 * at most CLOSE_MS; a leader that never starts ends it too, and one still running `goneMs` after its SIGKILL ends it as
 * lingering. Resolves with how it ended.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {import('node:child_process').ChildProcess} child the group's leader
 * @param {{ wallMs: number | null, uid: number | null, goneMs: number }} limits
 * @returns {{ stop: () => void, done: Promise<RunEnd> }}
 */
function supervised(cfg, job, child, limits) {
  let cancelled = false
  let timedOut = false
  let stopped = false
  /** @type {PromiseWithResolvers<RunEnd>} */
  const ended = Promise.withResolvers()
  const { promise: done, resolve } = ended
  const running = () => child.exitCode === null && child.signalCode === null
  /** @param {Omit<RunEnd, 'cancelled' | 'timedOut'>} end */
  const finish = (end) => {
    clearInterval(timer)
    clearTimeout(wall)
    resolve({ cancelled, timedOut, ...end })
  }
  const kill = () => {
    if (stopped || child.pid === undefined || !running()) return
    stopped = true
    const group = -child.pid
    signalGroup(group, 'SIGTERM')
    setTimeout(() => {
      if (!running()) return
      signalGroup(group, 'SIGKILL')
      // A leader that outlives its SIGKILL never exits for us: the run ends as lingering, and the host is tainted.
      setTimeout(() => running() && finish({ lingering: true, failed: null }), limits.goneMs).unref()
    }, KILL_GRACE_MS).unref()
  }
  const stop = () => {
    if (!stopped) cancelled = true
    kill()
  }
  const timer = heartbeats(cfg, job, stop)
  const wall =
    limits.wallMs === null
      ? undefined
      : setTimeout(() => {
          if (!stopped) timedOut = true
          kill()
        }, limits.wallMs)
  child.once('exit', () => {
    clearInterval(timer)
    clearTimeout(wall)
  })
  onLeaderEnd(child, limits, finish)
  return { stop: kill, done }
}

/**
 * The launchers' command for one job directory: namespace-launch.py, then landlock-launch.py in job mode, which must
 * show the runner capability's file and this process's environment refused before it starts the guest.
 * @param {SupervisorConfig} cfg
 * @param {string} dir
 */
function umlCommand(cfg, dir) {
  if (cfg.uml?.command) return cfg.uml.command(dir)
  const root = cfg.uml?.root ?? '/opt/uml'
  const refused = [`/proc/${process.pid}/environ`, ...(cfg.tokenFile ? [cfg.tokenFile] : [])]
  return [
    '/usr/bin/python3',
    path.join(root, 'namespace-launch.py'),
    path.join(root, 'landlock-launch.py'),
    path.join(root, 'linux.uml'),
    path.join(root, 'initrd.gz'),
    dir,
    path.join(root, 'guest.raw'),
    'job',
    ...refused,
  ]
}

/**
 * What the launchers reported before the guest started, read from the group's output within UML_LOG_BYTES: the first
 * record of each kind counts, and a second (which only the guest could print) refuses the job. Lines the launchers or
 * the guest mark (`UML_`) are logged; the rest of the guest's console is counted, not kept.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {import('node:child_process').ChildProcess} child
 * @param {() => void} stop
 */
function launcherRecords(cfg, job, child, stop) {
  /** @type {{ adverse: object | null, policy: object | null, refused: string | null }} */
  const seen = { adverse: null, policy: null, refused: null }
  let bytes = 0
  let logged = 0
  /** @param {string} line */
  const take = (line) => {
    if (line.startsWith('UML_') && logged < UML_LOG_LINES) {
      logged += 1
      cfg.log?.(`[uml ${job.jobId}] ${line.slice(0, 300).replaceAll(/[^\x20-\x7e]/gu, '?')}`)
    }
    const record = recordOf(line)
    if (!record) return
    const event = fieldOf(record, 'event')
    const key =
      event === 'UML_HOST_ADVERSE_CONTROLS' ? 'adverse' : event === 'UML_HOST_POLICY_APPLIED' ? 'policy' : null
    if (!key) return
    if (seen[key]) seen.refused = `${String(event)} was reported twice`
    else seen[key] = record
  }
  /** A reader of one stream, with its own partial line: the two streams' lines never mix. */
  const reader = () => {
    let pending = ''
    /** @param {Buffer} chunk */
    return (chunk) => {
      bytes += chunk.length
      if (bytes > UML_LOG_BYTES) {
        seen.refused ??= `the guest printed more than ${UML_LOG_BYTES} bytes`
        stop()
        return
      }
      pending += chunk.toString('utf8')
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      if (pending.length > 64 * 1024) pending = ''
      for (const line of lines) take(line.trim())
    }
  }
  child.stdout?.on('data', reader())
  child.stderr?.on('data', reader())
  return seen
}

/**
 * A launcher's record on one line (a JSON object naming a `UML_HOST_` event), or null.
 * @param {string} line
 * @returns {object | null}
 */
function recordOf(line) {
  if (!line.startsWith('{') || !line.includes('"UML_HOST_')) return null
  try {
    /** @type {unknown} */
    const record = JSON.parse(line)
    return typeof record === 'object' && record !== null ? record : null
  } catch {
    return null
  }
}

/**
 * Whether the launchers showed their policy applied: the render uid, seccomp, Landlock ABI 4 or later, and every
 * adverse control (refused paths, no socket, a descendant bound by the same policy).
 * @param {ReturnType<typeof launcherRecords>} seen
 */
function policyApplied(seen) {
  const { adverse, policy } = seen
  if (seen.refused || !adverse || !policy) return false
  const abi = fieldOf(policy, 'landlockABI')
  return (
    fieldOf(policy, 'uid') === 10001 &&
    fieldOf(policy, 'seccomp') === 2 &&
    typeof abi === 'number' &&
    abi >= 4 &&
    adverseShown(adverse)
  )
}

/**
 * Whether the launcher's adverse controls all held: two refused paths or more (EPERM or EACCES), its own job directory
 * read and written, an escaping link refused, no socket, and a descendant bound by the same policy.
 * @param {object} adverse
 */
function adverseShown(adverse) {
  const refused = fieldOf(adverse, 'excluded_errno')
  return (
    fieldOf(adverse, 'descendant_inherits') === true &&
    fieldOf(adverse, 'own_job_read_write') === true &&
    fieldOf(adverse, 'socket_errno') === 1 &&
    fieldOf(adverse, 'symlink_errno') === 13 &&
    typeof refused === 'object' &&
    refused !== null &&
    Object.keys(refused).length >= 2 &&
    Object.values(refused).every((e) => e === 1 || e === 13)
  )
}

/**
 * A field of a record a launcher printed, unchecked.
 * @param {object} o
 * @param {string} key
 * @returns {unknown}
 */
const fieldOf = (o, key) => /** @type {unknown} */ (Reflect.get(o, key))

/**
 * Refuse a guest's run whose output may not be taken: past its time, refused by its records, or without the launchers'
 * policy shown applied.
 * @param {RunEnd} result
 * @param {ReturnType<typeof launcherRecords>} seen
 */
function refuseGuest(result, seen) {
  if (result.timedOut) throw new Error(`the UML guest ran past its job's time and was killed`)
  if (seen.refused) throw new Error(`the UML guest's output is refused: ${seen.refused}`)
  if (!policyApplied(seen)) throw new Error('the UML launchers did not report their host policy applied')
}

/**
 * Run one job's kernel inside the UML guest: its input disk written, its output disk made, the launchers started as
 * their own process group under the same heartbeats and Stop as a native kernel, and a wall time of the job's own plus
 * the margin. The output is taken only when the launchers reported their policy applied, and only through the
 * descriptor this process made the output disk with: whatever the guest's side does to the path (a FIFO, a link,
 * another file) changes nothing read.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {{ dir: string, sourceRoot: string, outputDir: string }} where
 * @returns {Promise<RunEnd>}
 */
async function runUml(cfg, job, where) {
  const { dir, disk, owner } = jobDisks(job, where)
  try {
    const child = spawnLaunchers(cfg, dir)
    const wallMs = job.timeoutMs + (cfg.uml?.marginMs ?? UML_MARGIN_MS)
    // Every process of the render uid is this job's only with the real launchers, as root, one job at a time
    // (umlReady); a test's stand-in launcher sweeps its own group alone.
    const uid = owner && !cfg.uml?.command ? RENDER_UID : null
    const run = supervised(cfg, job, child, { wallMs, uid, goneMs: cfg.uml?.goneMs ?? GONE_MS })
    const seen = launcherRecords(cfg, job, child, run.stop)
    const result = await run.done
    if (result.failed || result.lingering || result.cancelled) return result
    refuseGuest(result, seen)
    takeOutput(disk, where.outputDir)
    return result
  } finally {
    fs.closeSync(disk)
  }
}

/**
 * One job's guest directory: the input disk (the job's archive, this process's and read-only to the guest) and the
 * output disk, whose descriptor is kept (outputDisk), in a directory the launchers' uid owns when this process is root.
 * @param {RenderJob} job
 * @param {{ dir: string, sourceRoot: string }} where
 * @returns {{ dir: string, disk: number, owner: { uid: number, gid: number } | null }}
 */
function jobDisks(job, where) {
  const dir = path.join(where.dir, 'uml')
  // namespace-launch.py maps exactly uid and gid 10001; the guest's directory is theirs, its input this process's.
  const owner = process.getuid?.() === 0 ? { uid: RENDER_UID, gid: RENDER_UID } : null
  fs.mkdirSync(dir, { mode: 0o700 })
  const files = job.files.map((f) => f.path)
  const archive = inputArchive(job.format, kernelJob(job, GUEST), where.sourceRoot, files)
  fs.writeFileSync(path.join(dir, 'input.tar'), archive, { flag: 'wx', mode: 0o644 })
  const disk = outputDisk(path.join(dir, 'output.img'), owner)
  try {
    if (owner) fs.chownSync(dir, owner.uid, owner.gid)
  } catch (error) {
    fs.closeSync(disk)
    throw error
  }
  return { dir, disk, owner }
}

/**
 * The launchers for one job directory, started as their own process group, with only PATH in their environment.
 * @param {SupervisorConfig} cfg
 * @param {string} dir
 */
function spawnLaunchers(cfg, dir) {
  const [command, ...args] = umlCommand(cfg, dir)
  if (!command) throw new Error('no UML launcher')
  return spawn(command, args, { env: { PATH: '/usr/bin:/bin' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * The captures a capture receipt names, each with its file name and hash.
 * @param {unknown} receipt
 * @returns {{ name: string, sha256: string }[]}
 */
function capturesOf(receipt) {
  /** @type {unknown} */
  const list = typeof receipt === 'object' && receipt !== null ? Reflect.get(receipt, 'captures') : null
  if (!Array.isArray(list)) throw new Error('the capture receipt names no captures')
  return list.map((/** @type {unknown} */ c) => {
    const name = typeof c === 'object' && c !== null ? textOf(c, 'name') : ''
    const sha256 = typeof c === 'object' && c !== null ? textOf(c, 'sha256') : ''
    if (!CAPTURE_NAME.test(name)) throw new Error('the capture receipt names a capture the API would not accept')
    return { name, sha256 }
  })
}

/**
 * Upload what the kernel produced, each file checked against its receipt: the PDF, or every capture.
 * @param {SupervisorConfig} cfg
 * @param {RenderJob} job
 * @param {string} outputDir
 * @param {unknown} receipt
 * @param {string | null} outputSha256
 */
async function upload(cfg, job, outputDir, receipt, outputSha256) {
  if (job.format === 'pdf') {
    const pdf = fs.readFileSync(path.join(outputDir, 'report.pdf'))
    if (sha256Hex(pdf) !== outputSha256) throw new Error('the PDF does not match its receipt')
    const bytes = { type: 'application/pdf', data: pdf }
    await api(cfg, `/v1/renderer/jobs/${job.jobId}/output`, { method: 'PUT', lease: job.leaseToken, bytes })
    return
  }
  for (const capture of capturesOf(receipt)) {
    const png = fs.readFileSync(path.join(outputDir, capture.name))
    if (sha256Hex(png) !== capture.sha256) throw new Error(`the capture ${capture.name} does not match its receipt`)
    const route = `/v1/renderer/jobs/${job.jobId}/captures/${capture.name}`
    await api(cfg, route, { method: 'PUT', lease: job.leaseToken, bytes: { type: 'image/png', data: png } })
  }
}

/**
 * Upload the outputs when the kernel succeeded, then settle with its receipt.
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
  if (facts.status === 'succeeded') await upload(cfg, job, outputDir, receipt, facts.outputSha256)
  else cfg.log?.(`render ${job.jobId} ${String(facts.status)}: ${facts.errorCode || 'no error code'}`)
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
  if (cfg.isolation === 'uml') {
    umlReady(cfg)
    return ''
  }
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
 * What a UML host needs before it claims: the guest's artifacts, each a regular file, root-owned and writable by no
 * one else when this process is root (it must be, to separate the launchers' uid), and a work directory the render
 * uid can reach. Tests that replace the launchers skip the root requirement.
 * @param {SupervisorConfig} cfg
 */
function umlReady(cfg) {
  if (cfg.uml?.command) return
  if (process.getuid?.() !== 0)
    throw new Error('a UML host runs its supervisor as root, to start the guest as uid 10001')
  for (const name of UML_ARTIFACTS) immutableArtifact(path.join(cfg.uml?.root ?? '/opt/uml', name))
  fs.accessSync('/usr/bin/python3', fs.constants.X_OK)
  // One job at a time: the reap after a job kills every process of the render uid, so none may run before one.
  if (liveProcesses()?.some((p) => p.uid === RENDER_UID)) {
    throw new Error(`a process of the render uid ${RENDER_UID} is running: this host takes no job beside it`)
  }
  if ((fs.statSync(cfg.workDir).mode & 0o001) === 0) {
    throw new Error(`the render user cannot reach ${cfg.workDir}: give it search permission for others (o+x)`)
  }
}

/**
 * A guest artifact: a regular file (not through a link), root-owned and writable by no one else.
 * @param {string} file
 */
function immutableArtifact(file) {
  const st = fs.lstatSync(file, { throwIfNoEntry: false })
  if (!st?.isFile()) throw new Error(`no UML artifact at ${file}`)
  if (st.uid !== 0 || (st.mode & 0o022) !== 0) throw new Error(`${file} is not root-owned and immutable`)
}

/**
 * How a kernel's run ended, as runOnce acts on it: true when it was cancelled, false when its output may be delivered;
 * it throws where the output is not delivered, HostTainted where the run's processes outlived it.
 * @param {RunEnd} run
 * @param {RenderJob} job
 * @param {string} dir
 */
function cancelledRun(run, job, dir) {
  if (run.lingering) throw new HostTainted(`render ${job.jobId}: its processes outlived it; ${dir} is kept`)
  if (run.failed) throw new Error(run.failed)
  if (run.cancelled) return true
  if (run.timedOut) throw new Error('the kernel ran past its time and was killed')
  return false
}

/**
 * Claim one job and see it through. Never throws for the job's own failure.
 * @param {SupervisorConfig} cfg
 * @returns {Promise<RunOutcome>}
 */
export async function runOnce(cfg) {
  const browser = hostReady(cfg)
  const job = jobOf(await (await api(cfg, '/v1/renderer/claim', { json: { formats: FORMATS } })).json())
  if (!job) return { claimed: false }
  const dir = fs.mkdtempSync(path.join(cfg.workDir, 'job-'))
  let tainted = false
  try {
    // The render user reads the package and owns its scratch inside this directory; the outputs stay this process's.
    fs.chmodSync(dir, 0o755)
    const where = { dir, sourceRoot: path.join(dir, 'src'), outputDir: path.join(dir, 'out') }
    fs.mkdirSync(where.sourceRoot, { mode: 0o755 })
    fs.mkdirSync(where.outputDir, { mode: 0o700 })
    await fetchPackage(cfg, job, where.sourceRoot)
    let run
    if (cfg.isolation === 'uml') {
      await cfg.beforeRender?.(job)
      run = await runUml(cfg, job, where)
    } else {
      const jobFile = path.join(dir, 'job.json')
      fs.writeFileSync(jobFile, JSON.stringify(kernelJob(job, where)), { flag: 'wx', mode: 0o600 })
      await cfg.beforeRender?.(job)
      run = await runKernel(cfg, job, jobFile, browser)
    }
    if (cancelledRun(run, job, dir)) return { claimed: true, jobId: job.jobId, outcome: 'cancelled' }
    return { claimed: true, jobId: job.jobId, outcome: await deliver(cfg, job, where.outputDir) }
  } catch (error) {
    if (error instanceof HostTainted) {
      tainted = true
      throw error
    }
    cfg.log?.(`render ${job.jobId} not delivered: ${error instanceof Error ? error.message : String(error)}`)
    return { claimed: true, jobId: job.jobId, outcome: 'abandoned' }
  } finally {
    // Never a recursive delete under a directory a live process of the job could still change.
    if (!tainted) fs.rmSync(dir, { recursive: true, force: true })
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
      if (error instanceof HostTainted) throw error
      cfg.log?.(`claim failed: ${error instanceof Error ? error.message : String(error)}`)
      idle = true
    }
    if (idle) await new Promise((resolve) => setTimeout(resolve, cfg.pollMs ?? 2000))
  }
}

/**
 * How this host runs its kernels: natively (the default), or in the UML guest.
 * @param {NodeJS.ProcessEnv} env
 * @returns {'native' | 'uml'}
 */
function isolationOf(env) {
  const isolation = env.SOPHIA_RENDER_ISOLATION ?? 'native'
  if (isolation !== 'native' && isolation !== 'uml') throw new Error('SOPHIA_RENDER_ISOLATION is native or uml')
  return isolation
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
    isolation: isolationOf(env),
    uml: { root: env.SOPHIA_UML_ROOT ?? '/opt/uml' },
    ...(tokenFile ? { tokenFile } : {}),
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
