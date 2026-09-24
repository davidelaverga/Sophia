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

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parse } from 'yaml'
import {
  ARTIFACTS_DIR,
  PROFILE_SOURCE_DIR,
  REPO_ROOT,
  RUNTIME_DIR,
  bundleArchivePath,
  platformKey,
  runChecked,
} from './common.mjs'
import { baseBundleDir } from './gate.mjs'
import { lintComposition } from './patch-lint.mjs'
import { fileDigest, fileIntegrity, treeDigest } from './tree-digest.mjs'

const BUNDLE_DIR = join(REPO_ROOT, 'packages', 'dsh-bundle')

/** Files copied from config/dsh/profile into a profile directory. */
export const PROFILE_FILES = ['package.json', 'pnpm-workspace.yaml', 'cordis.patch.yml']

/** @returns {string} the committed profile lock path. */
export const PROFILE_LOCK = join(PROFILE_SOURCE_DIR, 'pnpm-lock.yaml')

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
  return archive
}

/** Deploy the runtime artifact from the lock. @returns {string} runtime directory. */
export function buildRuntimeArtifact() {
  rmSync(RUNTIME_DIR, { recursive: true, force: true })
  runChecked('pnpm', ['--filter', '@sophia/dsh-runtime', 'deploy', '--prod', '--frozen-lockfile', RUNTIME_DIR], {
    cwd: REPO_ROOT,
  })
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

  const lintFindings = lintComposition({
    basePatch: join(baseBundleDir(runtimeDir), 'cordis.patch.yml'),
    bundlePatch: join(BUNDLE_DIR, 'cordis.patch.yml'),
    profilePatch: join(PROFILE_SOURCE_DIR, 'cordis.patch.yml'),
  })

  const facts = {
    [`dsh.artifacts_by_platform.${platformKey()}`]: { digest, entries: entries.length },
    'dsh.release_integrity': {
      [`@deepseek-ai/dsh@${unit.dsh.package_version}`]: lockedIntegrity('@deepseek-ai/dsh', unit.dsh.package_version),
      [`@deepseek-ai/dsh-base@${unit.dsh.package_version}`]: lockedIntegrity(
        '@deepseek-ai/dsh-base',
        unit.dsh.package_version,
      ),
    },
    'sophia_bundle.archive_sha256': fileDigest(archive, 'sha256'),
    'sophia_bundle.archive_integrity': fileIntegrity(archive),
    workspace_lock_sha256: fileDigest(join(REPO_ROOT, 'pnpm-lock.yaml'), 'sha256'),
  }
  if (platformKey() === unit.dsh.artifact_primary_platform) facts['dsh.artifact_digest'] = digest
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
