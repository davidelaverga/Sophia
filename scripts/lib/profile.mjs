/**
 * Install the `sophia-runtime` profile into an isolated Harness home through
 * the upstream-supported `dsh plugin` path, and boot it for startup evidence.
 */

import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { DSH_ENTRY, OWNED_OUTPUT_BYTES, PROFILE_SOURCE_DIR, bundleArchivePath, platformKey, runDsh, runDshOwned, sanitizedEnv } from './common.mjs'
import { PROFILE_FILES, profileLockPath } from './artifacts.mjs'
import { fileIntegrity, treeDigest } from './tree-digest.mjs'

/**
 * Locations for one isolated install. `cwd` is an empty working directory so
 * dsh reads no invoking-directory `.env`.
 * @param {string} root - absolute directory owned by this install.
 */
export function homeLayout(root) {
  return { root, dshHome: join(root, 'dsh-home'), home: join(root, 'home'), cwd: join(root, 'work') }
}

/** Throw unless the built artifacts are exactly the recorded ones. */
export function assertRecordedArtifacts(unit, runtimeDir) {
  const archive = bundleArchivePath(unit)
  if (!existsSync(archive)) throw new Error(`missing ${archive}; run \`pnpm artifacts\``)
  const integrity = fileIntegrity(archive)
  if (integrity !== unit.sophia_bundle.archive_integrity) {
    throw new Error(`bundle archive ${integrity} is not the recorded ${unit.sophia_bundle.archive_integrity}`)
  }
  const platform = platformKey()
  const recorded = unit.dsh.artifacts_by_platform?.[platform]?.digest
  if (!recorded) throw new Error(`no runtime artifact is recorded for ${platform}; run \`pnpm artifacts:record\` on ${platform} and commit it`)
  const { digest } = treeDigest(runtimeDir)
  if (digest !== recorded) throw new Error(`runtime artifact ${digest} is not the recorded ${platform} artifact ${recorded}`)
}

/**
 * Write the committed profile inputs and run the frozen, offline install.
 * @param {{ unit: any, runtimeDir: string, layout: ReturnType<typeof homeLayout>, force?: boolean }} input
 * @returns {{ status: number|null, stdout: string, stderr: string }} the dsh plugin result.
 */
export function installProfile({ unit, runtimeDir, layout, force = false }) {
  if (existsSync(layout.root)) {
    if (!force) throw new Error(`${layout.root} exists; pass --force to replace this install`)
    rmSync(layout.root, { recursive: true, force: true })
  }
  return installInto({ unit, runtimeDir, layout })
}

/** The profile directory of one install. */
const profileDirOf = (unit, layout) => join(layout.dshHome, 'profiles', unit.dsh.profile)

/** The frozen, offline install's dsh arguments. */
const installArgs = (unit) => ['plugin', '--profile', unit.dsh.profile, 'install', '--frozen-lockfile', '--offline']

/** Write the committed profile inputs into the profile directory. */
function stageInputs({ unit, layout }) {
  const profileDir = profileDirOf(unit, layout)
  mkdirSync(profileDir, { recursive: true })
  mkdirSync(layout.cwd, { recursive: true })
  for (const file of PROFILE_FILES) copyFileSync(join(PROFILE_SOURCE_DIR, file), join(profileDir, file))
  copyFileSync(profileLockPath(), join(profileDir, 'pnpm-lock.yaml'))
  copyFileSync(bundleArchivePath(unit), join(profileDir, unit.sophia_bundle.archive))
}

/** Write the committed profile inputs into the profile directory and run the frozen, offline install there. */
function installInto({ unit, runtimeDir, layout }) {
  stageInputs({ unit, layout })
  const result = runDsh(runtimeDir, installArgs(unit), { env: sanitizedEnv(layout), cwd: layout.cwd })
  if (result.status !== 0) throw new Error(`dsh plugin install exited ${result.status}\n${result.stdout}\n${result.stderr}`)
  return result
}

/** The last `bytes` of an install's output, for a diagnostic that stays finite however much it printed. */
const tail = (text, bytes = 8192) => (text.length > bytes ? `[... ${text.length - bytes} earlier characters not shown]${text.slice(-bytes)}` : text)

/**
 * installInto for the reconciler: the same install, run as its own process group (runDshOwned), so `signal` can stop
 * all of it and no member outlives the outcome read here. Only an install whose dsh exited 0 by itself, left no
 * member running and stayed within the output bound counts as installed. Any other end throws:
 * - `closureUnknown: true` when the group was not shown gone: its members may still write, so nothing may be
 *   verified, moved back or released beneath them;
 * - otherwise a plain failure (the group is gone), with `stopped: true` when `signal` stopped it.
 */
async function installOwned({ unit, runtimeDir, layout, signal, graceMs, outputBytes }) {
  if (signal.aborted) throw Object.assign(new Error(`dsh plugin install was stopped (${signal.reason?.message ?? 'aborted'}) before it started`), { stopped: true })
  stageInputs({ unit, layout })
  const run = await runDshOwned(runtimeDir, installArgs(unit), { env: sanitizedEnv(layout), cwd: layout.cwd, signal, graceMs, outputBytes })
  const stopped = run.end === 'stopped'
  const why = stopped
    ? `was stopped (${signal.reason?.message ?? 'aborted'})`
    : run.end === 'output_limit' || run.truncated
      ? `printed more than its output bound (${outputBytes ?? OWNED_OUTPUT_BYTES} bytes) and was stopped`
      : run.survivors
        ? `exited ${run.status ?? run.signal} while members of its process group still ran, and they were stopped`
        : null
  if (run.closure === 'unknown') {
    throw Object.assign(new Error(`dsh plugin install ${why ?? 'ended'}, and its process group was NOT shown gone after SIGKILL: its members may still run`), { closureUnknown: true, stopped })
  }
  if (why) throw Object.assign(new Error(`dsh plugin install ${why}; its process group is gone; the install is not qualified`), { stopped })
  if (run.status !== 0) throw new Error(`dsh plugin install exited ${run.status ?? run.signal}\n${tail(run.stdout)}\n${tail(run.stderr)}`)
  return run
}

/**
 * The regular files of a gzipped npm tarball, keyed by their path inside the package (without `package/`).
 * @param {string} archive
 * @returns {Map<string, Buffer>}
 */
export function tarballFiles(archive) {
  const tar = gunzipSync(readFileSync(archive))
  const files = new Map()
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0[\s\S]*$/, '')
    const name = field(345, 155) ? `${field(345, 155)}/${field(0, 100)}` : field(0, 100)
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    const type = field(156, 1)
    if (type === '0' || type === '') files.set(name.replace(/^package\//, ''), tar.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

/** Every regular file under `dir`, keyed by its relative path. */
function treeFiles(dir) {
  const files = new Map()
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) files.set(relative(dir, path), readFileSync(path))
    }
  }
  walk(dir)
  return files
}

/**
 * How an installed profile differs from the recorded one: its copied inputs against the committed ones, and every
 * file of the installed bundle against the recorded archive, byte for byte. Empty when it runs exactly the recorded
 * bundle. Sessions, the bridge journal and the workspace live outside the profile directory and are not read.
 * @returns {string[]}
 */
export function profileDrift({ unit, layout }) {
  const profileDir = profileDirOf(unit, layout)
  const drift = []
  for (const file of [...PROFILE_FILES, 'pnpm-lock.yaml']) {
    const installed = join(profileDir, file)
    const source = file === 'pnpm-lock.yaml' ? profileLockPath() : join(PROFILE_SOURCE_DIR, file)
    if (!existsSync(installed) || !readFileSync(installed).equals(readFileSync(source))) {
      drift.push(`profile ${file} is not the committed one`)
    }
  }
  const archive = join(profileDir, unit.sophia_bundle.archive)
  if (!existsSync(archive) || fileIntegrity(archive) !== unit.sophia_bundle.archive_integrity) {
    drift.push(`profile ${unit.sophia_bundle.archive} is not the recorded archive`)
  }
  const bundleDir = join(profileDir, 'node_modules', ...unit.sophia_bundle.name.split('/'))
  if (!existsSync(bundleDir)) return [...drift, `${unit.sophia_bundle.name} is not installed`]
  const installed = treeFiles(realpathSync(bundleDir))
  const recorded = tarballFiles(bundleArchivePath(unit))
  for (const [path, bytes] of recorded) {
    if (!installed.has(path)) drift.push(`installed bundle lacks ${path}`)
    else if (!installed.get(path).equals(bytes)) drift.push(`installed bundle ${path} differs from the recorded archive`)
  }
  for (const path of installed.keys()) if (!recorded.has(path)) drift.push(`installed bundle has ${path}, which the recorded archive does not`)
  return drift
}

/** What is at `path`, without following a link: 'none', 'directory' or 'other' (a link, a file, anything else). */
function entryKind(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  return stat === undefined ? 'none' : stat.isDirectory() ? 'directory' : 'other'
}

/** A fresh name for a kept profile: UTC to the millisecond and 8 random hex, e.g. `20261102T170512345Z-1f2e3d4c`. */
const historyStamp = () => `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`

/**
 * Bring a project's profile to the recorded bundle without touching anything else in the project root: native
 * sessions and storages (`dsh-home/sessions`, `dsh-home/storages`), the bridge journal (`dsh-home/sophia-bridge`)
 * and the workspace stay as they are. A profile that already runs the recorded bundle is left alone. A stale one
 * is moved aside to `.<profile>.previous` (kept for a manual rollback), reinstalled from the committed inputs with
 * the same frozen, offline install, and verified; if either step fails, the previous profile is put back.
 * No upgrade deletes an earlier one's history: a `.<profile>.previous` already there is first renamed, whole, to
 * `.<profile>.previous.<stamp>`, and put back if the upgrade fails. Before anything moves, the profile and that
 * `.previous` must each be a directory of its own (not a link) and the new name must be free; otherwise nothing changes.
 * Kept profiles are never removed here; retention is the operator's.
 *
 * The install runs as its own process group (installOwned), and this process keeps running while it does, so its
 * caller can stop it (`signal`; the runtime host aborts it on SIGTERM or SIGINT). Before the first change, the
 * caller's `exclusion` is held (`hold()`; a hold that cannot be made refuses with nothing changed). It is released
 * (`release()`) only once the outcome is settled with the install's group gone: the profile installed and verified,
 * or both earlier profiles put back. When the group is not shown gone (`closureUnknown`), nothing is verified or moved
 * back beneath it and the exclusion is kept: the rejection says where each profile is. When the release or the
 * putting back itself fails, the exclusion is kept too, and the call rejects with `exclusionKept: true` (never a
 * success). A first install that fails leaves its partial profile, as before.
 * Run it only while no runtime uses this root (the runtime host calls it under the root's lease, before its supervisor starts).
 * @param {{ unit: any, runtimeDir: string, layout: ReturnType<typeof homeLayout>, stamp?: string, signal?: AbortSignal,
 *   exclusion?: { hold(): void, release(): void }, graceMs?: number, outputBytes?: number }} input - `stamp` names the
 *   kept `.previous` (a fresh one by default); `signal` stops the reconciliation; `graceMs` and `outputBytes` are the
 *   install's stop wait and output bound (runDshOwned's defaults unless a test sets them).
 * @returns {Promise<{ state: 'installed' | 'current' | 'upgraded', drift: string[] }>}
 */
export async function reconcileProfile({ unit, runtimeDir, layout, stamp = historyStamp(), signal = new AbortController().signal, exclusion = NO_EXCLUSION, graceMs, outputBytes }) {
  const profileDir = profileDirOf(unit, layout)
  const owned = { unit, runtimeDir, layout, signal, graceMs, outputBytes }
  const notStarted = () => {
    if (signal.aborted) throw Object.assign(new Error('profile reconciliation was stopped before anything changed'), { stopped: true })
  }
  if (!existsSync(profileDir)) {
    notStarted()
    exclusion.hold()
    try {
      await installOwned(owned)
      const after = profileDrift({ unit, layout })
      if (after.length > 0) throw new Error(`the installed profile differs from the recorded one: ${after.join('; ')}`)
    } catch (error) {
      if (error.closureUnknown) {
        error.message += `; nothing was verified or removed: the unqualified install is at ${profileDir}`
        throw error
      }
      throw released(exclusion, error)
    }
    released(exclusion)
    return { state: 'installed', drift: [] }
  }
  const drift = profileDrift({ unit, layout })
  if (drift.length === 0) return { state: 'current', drift }
  const previous = join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)
  if (!/^[0-9A-Za-z][0-9A-Za-z_-]{0,63}$/.test(stamp)) throw new Error(`${JSON.stringify(stamp)} is not a safe history name; nothing is changed`)
  const kept = `${previous}.${stamp}`
  if (entryKind(profileDir) !== 'directory') throw new Error(`${profileDir} is not a directory; nothing is changed`)
  const history = entryKind(previous)
  if (history === 'other') throw new Error(`${previous} is not a directory; nothing is changed`)
  if (history === 'directory' && entryKind(kept) !== 'none') throw new Error(`${kept} exists; nothing is changed`)
  notStarted()
  exclusion.hold()
  try {
    if (history === 'directory') renameSync(previous, kept)
  } catch (error) {
    throw released(exclusion, error)
  }
  try {
    renameSync(profileDir, previous)
  } catch (error) {
    if (history === 'directory') {
      try {
        renameSync(kept, previous)
      } catch (back) {
        error.message += `; putting ${previous} back failed (${back.message}): it is at ${kept}`
        throw Object.assign(error, { exclusionKept: true })
      }
    }
    throw released(exclusion, error)
  }
  try {
    await installOwned(owned)
    const after = profileDrift({ unit, layout })
    if (after.length > 0) throw new Error(`the reinstalled profile still differs: ${after.join('; ')}`)
  } catch (error) {
    if (error.closureUnknown) {
      const at = history === 'directory' ? `, the one before it at ${kept}` : ''
      error.message += `; nothing was verified or moved back: the unqualified install is at ${profileDir}, the replaced profile at ${previous}${at}`
      throw error
    }
    // Only the new install, never qualified, is removed; both earlier profiles go back where they were.
    try {
      rmSync(profileDir, { recursive: true, force: true })
      renameSync(previous, profileDir)
      if (history === 'directory') renameSync(kept, previous)
    } catch (restore) {
      error.message += `; putting the earlier profiles back failed (${restore.message}): look under ${join(layout.dshHome, 'profiles')}`
      throw Object.assign(error, { exclusionKept: true })
    }
    error.message += '; both earlier profiles are back where they were'
    throw released(exclusion, error)
  }
  released(exclusion)
  return { state: 'upgraded', drift }
}

/** No exclusion, for a caller that holds none (tests of the reconciler alone). */
const NO_EXCLUSION = { hold() {}, release() {} }

/**
 * Release `exclusion` once an outcome is settled. Returns `error` (to throw) when there is one; a release that fails
 * keeps the root excluded and turns the outcome, success included, into a rejection with `exclusionKept: true`.
 */
function released(exclusion, error) {
  try {
    exclusion.release()
  } catch (failure) {
    const kept = error ?? new Error('the profile was reconciled')
    kept.message += `; the root's exclusion could not be released (${failure.message}), so it stays excluded`
    throw Object.assign(kept, { exclusionKept: true })
  }
  return error
}

/**
 * reconcileProfile in a process that holds the root's lease. While it runs, SIGTERM and SIGINT stop it instead of
 * ending the process at once, which would leave the install running, the profiles moved aside and the lease behind.
 * A signal that arrives once the profile is reconciled still stops: the call rejects with the state reached. A
 * rejection after a signal has `stopped: true` and `signal`; `closureUnknown` and `exclusionKept` are kept as they are.
 * The listeners are removed when it settles, so later phases keep each signal's earlier handling.
 * @param {Parameters<typeof reconcileProfile>[0]} input - read only once the listeners are in place.
 * @returns {ReturnType<typeof reconcileProfile>}
 */
export async function reconcileProfileUntilSignalled(input) {
  const stop = new AbortController()
  let received
  const handlers = ['SIGTERM', 'SIGINT'].map((name) => [name, () => {
    received ??= name
    stop.abort(new Error(`${name} received`))
  }])
  for (const [name, handler] of handlers) process.on(name, handler)
  try {
    const result = await reconcileProfile({ ...input, signal: stop.signal })
    // A signal that arrived during the synchronous parts is handled only once the event loop turns; let it.
    await new Promise((resolve) => setImmediate(resolve))
    if (received) throw new Error(`${received} received after the profile was reconciled (${result.state})`)
    return result
  } catch (error) {
    if (received) Object.assign(error, { stopped: true, signal: received })
    throw error
  } finally {
    for (const [name, handler] of handlers) process.off(name, handler)
  }
}

/**
 * Boot the profile for a bounded time. A runtime still running at the
 * deadline is stopped with SIGTERM (dsh disposes the root on SIGTERM).
 * @returns {{ status: number|null, signal: string|null, stdout: string, stderr: string, bridgeLine: string|null, diagnostics: string[] }}
 */
export function bootProfile({ unit, runtimeDir, layout, seconds }) {
  const result = runDsh(runtimeDir, ['--profile', unit.dsh.profile], {
    env: sanitizedEnv(layout),
    cwd: layout.cwd,
    timeoutMs: seconds * 1000,
  })
  const bridgeLine = result.stderr.split('\n').find((line) => line.startsWith('[sophia-control-bridge] loaded ')) ?? null
  const logs = join(layout.dshHome, 'logs')
  const diagnostics = existsSync(logs) ? readdirSync(logs).filter((f) => f.startsWith('startup-')).map((f) => join(logs, f)) : []
  return { ...result, bridgeLine, diagnostics }
}

/**
 * The service executor's expected digest for one install (#393 4302689994): the bundle's own recipe
 * (packages/dsh-bundle/src/executor-identity.ts, `sophia-executor-closure-v2`) over this runtime, this profile, the
 * overlays the launch will pass and this Node, computed only after the runtime is the recorded artifact and the profile
 * runs exactly the recorded bundle. The operator pins this value; the running bundle derives its own and serves only
 * when they are equal. `overlays` are the `--patch` texts, in launch order. The recipe's service composition applies
 * here too: a home patch, an unreviewed profile package, or an overlay beyond config-only overrides refuses.
 * @param {{ unit: any, runtimeDir: string, layout: ReturnType<typeof homeLayout>, overlays?: string[] }} input
 * @returns {Promise<{ digest: string, components: Record<string, unknown> }>}
 */
export async function executorClosureDigest({ unit, runtimeDir, layout, overlays = [] }) {
  assertRecordedArtifacts(unit, runtimeDir)
  const drift = profileDrift({ unit, layout })
  if (drift.length > 0) throw new Error(`the installed profile differs from the recorded one: ${drift.join('; ')}`)
  const { DSH_ENTRY: BUNDLE_DSH_ENTRY, executorClosure } = await import('../../packages/dsh-bundle/dist/executor-identity.js')
  if (BUNDLE_DSH_ENTRY !== DSH_ENTRY) throw new Error('the bundle and the launcher name different dsh entries')
  const profileDir = profileDirOf(unit, layout)
  return executorClosure({
    runtimeDir,
    dshHome: layout.dshHome,
    profileDir,
    bundleDir: join(profileDir, 'node_modules', ...unit.sophia_bundle.name.split('/')),
    archive: unit.sophia_bundle.archive,
    overlays: overlays.map((text) => Buffer.from(text)),
    profile: unit.dsh.profile,
    toolchain: { node: process.version, platform: process.platform, arch: process.arch },
  })
}
