/**
 * Install the `sophia-runtime` profile into an isolated Harness home through
 * the upstream-supported `dsh plugin` path, and boot it for startup evidence.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { PROFILE_SOURCE_DIR, bundleArchivePath, platformKey, runDsh, sanitizedEnv } from './common.mjs'
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

/** Write the committed profile inputs into the profile directory and run the frozen, offline install there. */
function installInto({ unit, runtimeDir, layout }) {
  const profileDir = profileDirOf(unit, layout)
  mkdirSync(profileDir, { recursive: true })
  mkdirSync(layout.cwd, { recursive: true })
  for (const file of PROFILE_FILES) copyFileSync(join(PROFILE_SOURCE_DIR, file), join(profileDir, file))
  copyFileSync(profileLockPath(), join(profileDir, 'pnpm-lock.yaml'))
  copyFileSync(bundleArchivePath(unit), join(profileDir, unit.sophia_bundle.archive))
  const result = runDsh(runtimeDir, ['plugin', '--profile', unit.dsh.profile, 'install', '--frozen-lockfile', '--offline'], {
    env: sanitizedEnv(layout),
    cwd: layout.cwd,
  })
  if (result.status !== 0) throw new Error(`dsh plugin install exited ${result.status}\n${result.stdout}\n${result.stderr}`)
  return result
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

/**
 * Bring a project's profile to the recorded bundle without touching anything else in the project root: native
 * sessions and storages (`dsh-home/sessions`, `dsh-home/storages`), the bridge journal (`dsh-home/sophia-bridge`)
 * and the workspace stay as they are. A profile that already runs the recorded bundle is left alone. A stale one
 * is moved aside to `.<profile>.previous` (kept for a manual rollback), reinstalled from the committed inputs with
 * the same frozen, offline install, and verified; if either step fails, the previous profile is put back.
 * Run it only while no runtime uses this root (the runtime host calls it before its supervisor starts).
 * @param {{ unit: any, runtimeDir: string, layout: ReturnType<typeof homeLayout> }} input
 * @returns {{ state: 'installed' | 'current' | 'upgraded', drift: string[] }}
 */
export function reconcileProfile({ unit, runtimeDir, layout }) {
  const profileDir = profileDirOf(unit, layout)
  if (!existsSync(profileDir)) {
    installInto({ unit, runtimeDir, layout })
    const after = profileDrift({ unit, layout })
    if (after.length > 0) throw new Error(`the installed profile differs from the recorded one: ${after.join('; ')}`)
    return { state: 'installed', drift: [] }
  }
  const drift = profileDrift({ unit, layout })
  if (drift.length === 0) return { state: 'current', drift }
  const previous = join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)
  rmSync(previous, { recursive: true, force: true })
  renameSync(profileDir, previous)
  try {
    installInto({ unit, runtimeDir, layout })
    const after = profileDrift({ unit, layout })
    if (after.length > 0) throw new Error(`the reinstalled profile still differs: ${after.join('; ')}`)
  } catch (error) {
    rmSync(profileDir, { recursive: true, force: true })
    renameSync(previous, profileDir)
    throw error
  }
  return { state: 'upgraded', drift }
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
