/**
 * Shared paths, process helpers and the sanitized launch environment for the
 * S1-01 runtime-unit scripts. No script here reads provider credentials.
 */

import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (the directory holding pnpm-workspace.yaml). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The one runtime unit this checkout builds. */
export const RUNTIME_UNIT_PATH = join(REPO_ROOT, 'config', 'runtime-unit.json')

/** Committed profile installation inputs (manifest, lock, empty user patch). */
export const PROFILE_SOURCE_DIR = join(REPO_ROOT, 'config', 'dsh', 'profile')

/** Build output root; gitignored, overridable for out-of-tree builds. */
export const ARTIFACTS_DIR = resolve(process.env.SOPHIA_ARTIFACTS_DIR ?? join(REPO_ROOT, '.artifacts'))

/** The deployed dsh runtime artifact produced by `pnpm deploy`. */
export const RUNTIME_DIR = join(ARTIFACTS_DIR, 'runtime')

/** Launcher entry inside a runtime artifact: the package's declared `dsh` bin. */
export const DSH_ENTRY = 'node_modules/@deepseek-ai/dsh/lib/bin.js'

/**
 * Platform key for platform-specific identities. The runtime artifact holds
 * native prebuilds (koffi, node-pty) and platform-optional packages, so its
 * digest is recorded per platform; the execution host is linux-x64.
 */
export function platformKey() {
  return `${process.platform}-${process.arch}`
}

/** Default Harness home root for local profile installs, outside the product tree. */
export const DEFAULT_HOME_ROOT = join(tmpdir(), 'sophia-next')

/** @returns {any} parsed JSON. */
export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Write JSON with two-space indentation and a trailing newline. */
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * The committed runtime unit. Its bundle archive identity holds on every platform: the archive is normalized when
 * packed (scripts/lib/artifacts.mjs `normalizeGzipOs`), so no per-platform archive record exists.
 * @returns {any} the committed runtime unit.
 */
export function loadRuntimeUnit() {
  return readJson(RUNTIME_UNIT_PATH)
}

/** @returns {string} absolute path of the packed bundle archive for `unit`. */
export function bundleArchivePath(unit) {
  return join(ARTIFACTS_DIR, unit.sophia_bundle.archive)
}

/**
 * Run a command to completion.
 * @param {string} command - executable.
 * @param {string[]} args - arguments.
 * @param {import('node:child_process').SpawnSyncOptions} [options] - spawn options.
 * @returns {{ status: number|null, signal: string|null, timedOut: boolean, stdout: string, stderr: string }}
 */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options })
  // A deliberate deadline (bounded boot) reports ETIMEDOUT with the kill signal set.
  const timedOut = options.timeout !== undefined && result.error?.code === 'ETIMEDOUT'
  if (result.error && !timedOut) throw result.error
  return { status: result.status, signal: result.signal, timedOut, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/**
 * Run a command and throw with its output when it fails.
 * @returns {string} stdout.
 */
export function runChecked(command, args, options = {}) {
  const result = run(command, args, options)
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? result.signal}\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout
}

/**
 * `dsh plugin` forwards to pnpm, which need not live beside node (CI's
 * pnpm/action-setup installs it elsewhere). Only this one directory from the
 * caller's PATH enters the launch environment; `pnpm toolchain:check`
 * verifies it is the pinned version.
 * @returns {string} directory of the first executable `pnpm` on the caller's PATH.
 */
export function pnpmBinDir(pathValue = process.env.PATH ?? '') {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue
    try {
      accessSync(join(dir, 'pnpm'), constants.X_OK)
      return dir
    } catch {}
  }
  throw new Error('pnpm is not on PATH; dsh plugin management requires the pinned pnpm')
}

/**
 * The launch environment for dsh: an explicit Harness home, a throwaway
 * process HOME and TMPDIR, no inherited personal home, no credentials,
 * telemetry off.
 * PATH holds only the node directory, the pinned pnpm directory and /usr/bin:/bin.
 * @param {{ dshHome: string, home: string, credentials?: string[] }} homes - absolute directories, plus the
 *   credential variable names (never values) to copy from this process when set. dsh resolves them by
 *   reference per request; nothing else from the caller's environment passes.
 * @returns {Record<string, string>} the complete child environment.
 */
export function sanitizedEnv({ dshHome, home, credentials = [] }) {
  // dsh's spill-local plugin writes under the process temp dir; keep it inside this install.
  const tmp = join(home, 'tmp')
  mkdirSync(tmp, { recursive: true })
  const passed = Object.fromEntries(credentials.filter((name) => process.env[name]).map((name) => [name, process.env[name]]))
  return {
    ...passed,
    HOME: home,
    TMPDIR: tmp,
    DSH_HOME: dshHome,
    PATH: [...new Set([dirname(process.execPath), pnpmBinDir(), '/usr/bin', '/bin'])].join(':'),
    DSH_TELEMETRY_DISABLED: '1',
    LANG: 'C.UTF-8',
  }
}

/**
 * Launch the pinned dsh from a runtime artifact.
 * @param {string} runtimeDir - deployed runtime artifact.
 * @param {string[]} args - launcher arguments.
 * @param {{ env: Record<string, string>, cwd: string, timeoutMs?: number }} options - launch options.
 */
export function runDsh(runtimeDir, args, { env, cwd, timeoutMs }) {
  const entry = join(runtimeDir, DSH_ENTRY)
  if (!existsSync(entry)) throw new Error(`no dsh launcher at ${entry}; run \`pnpm artifacts\` first`)
  return run(process.execPath, [entry, ...args], { env, cwd, timeout: timeoutMs, killSignal: 'SIGTERM' })
}

/**
 * Whether any member of process group `pgid` may still be alive. Only ESRCH says none is: any other answer (EPERM, or
 * an error this process cannot read) leaves it possibly alive, so a group is never called gone without that proof.
 */
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    return error?.code !== 'ESRCH'
  }
}

/** Signal group `pgid`; a group already gone (ESRCH) is fine, any other failure is reported as false. */
function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal)
    return true
  } catch (error) {
    return error?.code === 'ESRCH'
  }
}

/** The combined stdout and stderr runDshOwned keeps, the same finite bound `run` gives spawnSync. */
export const OWNED_OUTPUT_BYTES = 256 * 1024 * 1024

/**
 * Launch the pinned dsh like runDsh, but as the leader of its own process group, and wait for it without blocking
 * this process. `dsh plugin` forwards to pnpm, which keeps dsh's descriptors and group, and pnpm may start lifecycle
 * scripts; a group is the one target that reaches all of them, and its members can outlive dsh with their output
 * already closed.
 *
 * Every way the run ends goes through the same closure, so no caller reads an outcome while a member may still write:
 * - `exited`: dsh exited by itself. Members still in the group (`survivors`) are then stopped as below.
 * - `stopped`: `signal` aborted.
 * - `output_limit`: more than `outputBytes` of combined output. `truncated` is then set (also when the limit is passed
 *   while another end is settling): what was kept is not the whole output.
 * Stopping sends SIGTERM to the group, then SIGKILL once `graceMs` has passed, and `closure` is `gone` only when a
 * probe finds no member within a second `graceMs`; otherwise `unknown` (members may still run, and what they do is
 * unknown). Output pipes are awaited only within the same bound.
 * @param {string} runtimeDir - deployed runtime artifact.
 * @param {string[]} args - launcher arguments.
 * @param {{ env: Record<string, string>, cwd: string, signal: AbortSignal, graceMs?: number, outputBytes?: number }} options
 * @returns {Promise<{ end: 'exited'|'stopped'|'output_limit', status: number|null, signal: string|null, survivors: boolean,
 *   closure: 'gone'|'unknown', truncated: boolean, stdout: string, stderr: string }>}
 */
export function runDshOwned(runtimeDir, args, { env, cwd, signal, graceMs = 5000, outputBytes = OWNED_OUTPUT_BYTES }) {
  const entry = join(runtimeDir, DSH_ENTRY)
  if (!existsSync(entry)) throw new Error(`no dsh launcher at ${entry}; run \`pnpm artifacts\` first`)
  if (signal.aborted) throw new Error('stopped before dsh started')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { env, cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const pid = child.pid
    if (pid === undefined) {
      // Nothing started: the spawn's own error is the outcome.
      child.once('error', reject)
      return
    }
    // After the spawn, errors come only from signalling it; the closure below decides the outcome.
    child.on('error', () => {})
    const wait = (ms) => new Promise((done) => setTimeout(done, ms))
    const goneWithin = async (ms) => {
      for (const end = Date.now() + ms; groupAlive(pid) && Date.now() < end; ) await wait(25)
      return !groupAlive(pid)
    }
    let leader = null
    const exited = new Promise((done) => child.once('exit', (status, exitSignal) => done((leader = { status, signal: exitSignal }))))
    const closed = new Promise((done) => child.once('close', done))
    let stdout = ''
    let stderr = ''
    let kept = 0
    let truncated = false
    let settling = null
    const collect = (append) => (text) => {
      if (truncated) return
      kept += Buffer.byteLength(text)
      if (kept <= outputBytes) return append(text)
      truncated = true
      settle('output_limit')
    }
    child.stdout.setEncoding('utf8').on('data', collect((text) => (stdout += text)))
    child.stderr.setEncoding('utf8').on('data', collect((text) => (stderr += text)))
    const onAbort = () => settle('stopped')
    function settle(end) {
      if (settling) return
      signal.removeEventListener('abort', onAbort)
      settling = { end }
      void (async () => {
        let survivors = false
        let closure = 'gone'
        try {
          survivors = end === 'exited' && groupAlive(pid)
          if (end !== 'exited' || survivors) {
            signalGroup(pid, 'SIGTERM')
            if (!(await goneWithin(graceMs))) {
              signalGroup(pid, 'SIGKILL')
              if (!(await goneWithin(graceMs))) closure = 'unknown'
            }
          }
          await Promise.race([closed, wait(graceMs)])
          if (end !== 'exited') await Promise.race([exited, wait(graceMs)])
        } catch {
          closure = 'unknown'
        }
        child.stdout.destroy()
        child.stderr.destroy()
        resolve({ end, status: leader?.status ?? null, signal: leader?.signal ?? null, survivors, closure, truncated, stdout, stderr })
      })()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void exited.then(() => settle('exited'))
  })
}

/**
 * Replace machine-specific absolute paths so committed evidence is stable
 * and discloses no local layout.
 * @param {string} text - raw output.
 * @param {Record<string, string>} placeholders - absolute path → placeholder.
 */
export function normalizePaths(text, placeholders) {
  let out = text
  const entries = Object.entries(placeholders).filter(([path]) => path).sort((a, b) => b[0].length - a[0].length)
  for (const [path, placeholder] of entries) out = out.split(path).join(placeholder)
  return out
}
