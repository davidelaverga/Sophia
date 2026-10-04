/**
 * Build and identify the two S1-01 artifacts:
 *
 * - the dsh runtime artifact: `pnpm deploy --prod` of @sophia/dsh-runtime
 *   from the committed lock, identified by its content tree digest;
 * - the Sophia bundle archive: `pnpm pack` of @sophia/dsh-bundle,
 *   identified by SHA-256 and by the sha512 integrity pnpm locks record.
 *
 * Also regenerates the profile lock, which pins the archive integrity so a
 * frozen profile install rejects any other archive bytes.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parse } from 'yaml'
import { ARTIFACTS_DIR, PROFILE_SOURCE_DIR, REPO_ROOT, RUNTIME_DIR, bundleArchivePath, platformKey, runChecked } from './common.mjs'
import { baseBundleDir, baseBundleVersion, checkReviewedBaseRows, loadReviewedBaseRows } from './gate.mjs'
import { lintComposition, parsePatch } from './patch-lint.mjs'
import { fileDigest, fileIntegrity, treeDigest } from './tree-digest.mjs'

const BUNDLE_DIR = join(REPO_ROOT, 'packages', 'dsh-bundle')

/** Files copied from config/dsh/profile into a profile directory. */
export const PROFILE_FILES = ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml']

/**
 * The committed profile lock. One lock serves every platform: it pins only the bundle archive's integrity, and the
 * normalized archive is the same everywhere (SMC-M03 CX-0005).
 * @returns {string} the committed profile lock path.
 */
export function profileLockPath() {
  return join(PROFILE_SOURCE_DIR, 'pnpm-lock.yaml')
}

/**
 * Make a gzip archive's bytes independent of the platform that packed it. Its header names the writer's operating
 * system (byte 9): Node's zlib writes 3 (Unix) on Linux and 19 on macOS around the same deflate stream, so the same
 * tar packed on each had two hashes (SMC-M03 CX-0005: setting the Mac byte to 3 reproduces the Linux archive
 * exactly). No checksum covers byte 9 when the header carries no flags, which is checked first.
 * @param {string} path - the archive, rewritten in place when its byte differs.
 */
export function normalizeGzipOs(path) {
  const bytes = readFileSync(path)
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) throw new Error(`${path} is not a deflate gzip archive`)
  if (bytes[3] !== 0) throw new Error(`${path} has gzip header flags ${bytes[3]}; only a flagless header is normalized`)
  if (bytes[9] === 3) return
  bytes[9] = 3
  writeFileSync(path, bytes)
}

/**
 * Integrity of `name@version` as the workspace lock records it.
 * @returns {string} sha512 SRI string.
 */
export function lockedIntegrity(name, version) {
  const lock = parse(readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8'))
  const entry = lock.packages?.[`${name}@${version}`]
  if (!entry?.resolution?.integrity) throw new Error(`pnpm-lock.yaml has no integrity for ${name}@${version}`)
  return entry.resolution.integrity
}

/** Compile and pack the bundle. @returns {string} archive path. */
export function buildBundleArchive(unit) {
  runChecked('pnpm', ['--filter', unit.sophia_bundle.name, 'run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' })
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const archive = bundleArchivePath(unit)
  rmSync(archive, { force: true })
  runChecked('pnpm', ['--dir', BUNDLE_DIR, 'pack', '--pack-destination', ARTIFACTS_DIR], { cwd: REPO_ROOT })
  if (!existsSync(archive)) throw new Error(`pnpm pack produced no ${archive}`)
  normalizeGzipOs(archive)
  return archive
}

/** Deploy the runtime artifact from the lock. @returns {string} runtime directory. */
export function buildRuntimeArtifact() {
  rmSync(RUNTIME_DIR, { recursive: true, force: true })
  runChecked('pnpm', ['--filter', '@sophia/dsh-runtime', 'deploy', '--prod', '--frozen-lockfile', RUNTIME_DIR], { cwd: REPO_ROOT })
  return RUNTIME_DIR
}

/**
 * Resolve the profile lock for `archive` in a scratch profile directory.
 * @returns {string} lock text.
 */
export function resolveProfileLock(archive) {
  const dir = mkdtempSync(join(tmpdir(), 'sophia-profile-lock-'))
  try {
    for (const file of PROFILE_FILES) copyFileSync(join(PROFILE_SOURCE_DIR, file), join(dir, file))
    copyFileSync(archive, join(dir, basename(archive)))
    runChecked('pnpm', ['install', '--lockfile-only', '--offline', '--ignore-scripts'], { cwd: dir })
    return readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Build both artifacts and return their identities.
 * @returns {{ facts: Record<string, any>, profileLock: string, lintFindings: any[] }}
 */
export function buildArtifacts(unit) {
  const archive = buildBundleArchive(unit)
  const runtimeDir = buildRuntimeArtifact()
  const { digest, entries } = treeDigest(runtimeDir)

  const basePatch = join(baseBundleDir(runtimeDir), 'cordis.patch.yml')
  const lintFindings = lintComposition({
    basePatch,
    bundlePatch: join(BUNDLE_DIR, 'cordis.patch.yml'),
    profilePatch: join(PROFILE_SOURCE_DIR, 'cordis.patch.yml'),
  })
  const base = parsePatch(readFileSync(basePatch, 'utf8'), '@deepseek-ai/dsh-base')
  if (base.rows !== null) lintFindings.push(...checkReviewedBaseRows(base.rows, loadReviewedBaseRows(), baseBundleVersion(runtimeDir)))

  const facts = {
    [`dsh.artifacts_by_platform.${platformKey()}`]: { digest, entries: entries.length },
    'dsh.release_integrity': {
      [`@deepseek-ai/dsh@${unit.dsh.package_version}`]: lockedIntegrity('@deepseek-ai/dsh', unit.dsh.package_version),
      [`@deepseek-ai/dsh-base@${unit.dsh.package_version}`]: lockedIntegrity('@deepseek-ai/dsh-base', unit.dsh.package_version),
    },
    'workspace_lock_sha256': fileDigest(join(REPO_ROOT, 'pnpm-lock.yaml'), 'sha256'),
  }
  // The runtime tree differs per platform (native prebuilds); the normalized bundle archive does not.
  const bundle = { archive_sha256: fileDigest(archive, 'sha256'), archive_integrity: fileIntegrity(archive), artifact_digest: `sha256:${fileDigest(archive, 'sha256')}` }
  if (platformKey() === unit.dsh.artifact_primary_platform) facts['dsh.artifact_digest'] = digest
  for (const [key, value] of Object.entries(bundle)) facts[`sophia_bundle.${key}`] = value
  return { facts, profileLock: resolveProfileLock(archive), lintFindings }
}

/** Read a dotted path such as `dsh.artifact_digest`. */
export function getPath(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object)
}

/** Write a dotted path. */
export function setPath(object, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  const target = keys.reduce((node, key) => (node[key] ??= {}), object)
  target[last] = value
}
