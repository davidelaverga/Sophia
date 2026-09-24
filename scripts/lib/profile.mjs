/**
 * Install the `sophia-runtime` profile into an isolated Harness home through
 * the upstream-supported `dsh plugin` path, and boot it for startup evidence.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PROFILE_SOURCE_DIR, bundleArchivePath, platformKey, runDsh, sanitizedEnv } from './common.mjs'
import { PROFILE_FILES } from './artifacts.mjs'
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
  if (!recorded)
    throw new Error(
      `no runtime artifact is recorded for ${platform}; run \`pnpm artifacts:record\` on ${platform} and commit it`,
    )
  const { digest } = treeDigest(runtimeDir)
  if (digest !== recorded)
    throw new Error(`runtime artifact ${digest} is not the recorded ${platform} artifact ${recorded}`)
}

/**
 * Write the committed profile inputs and run the frozen, offline install.
 * @param {{ unit: any, runtimeDir: string, layout: ReturnType<typeof homeLayout>, force?: boolean }} input
 * @returns {{ status: number|null, stdout: string, stderr: string }} the dsh plugin result.
 */
export function installProfile({ unit, runtimeDir, layout, force = false }) {
  const profileDir = join(layout.dshHome, 'profiles', unit.dsh.profile)
  if (existsSync(layout.root)) {
    if (!force) throw new Error(`${layout.root} exists; pass --force to replace this install`)
    rmSync(layout.root, { recursive: true, force: true })
  }
  mkdirSync(profileDir, { recursive: true })
  mkdirSync(layout.cwd, { recursive: true })
  for (const file of [...PROFILE_FILES, 'pnpm-lock.yaml'])
    copyFileSync(join(PROFILE_SOURCE_DIR, file), join(profileDir, file))
  copyFileSync(bundleArchivePath(unit), join(profileDir, unit.sophia_bundle.archive))
  const result = runDsh(
    runtimeDir,
    ['plugin', '--profile', unit.dsh.profile, 'install', '--frozen-lockfile', '--offline'],
    {
      env: sanitizedEnv(layout),
      cwd: layout.cwd,
    },
  )
  if (result.status !== 0)
    throw new Error(`dsh plugin install exited ${result.status}\n${result.stdout}\n${result.stderr}`)
  return result
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
  const bridgeLine =
    result.stderr.split('\n').find((line) => line.startsWith('[sophia-control-bridge] loaded ')) ?? null
  const logs = join(layout.dshHome, 'logs')
  const diagnostics = existsSync(logs)
    ? readdirSync(logs)
        .filter((f) => f.startsWith('startup-'))
        .map((f) => join(logs, f))
    : []
  return { ...result, bridgeLine, diagnostics }
}
