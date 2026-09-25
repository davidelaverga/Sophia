/**
 * Shared paths, process helpers and the sanitized launch environment for the
 * S1-01 runtime-unit scripts. No script here reads provider credentials.
 */

import { spawnSync } from 'node:child_process'
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

/** @returns {any} the committed runtime unit. */
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
