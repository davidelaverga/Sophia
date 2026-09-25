/**
 * The exact toolchain this repository builds with. A mismatch is an error,
 * not a warning: byte-identical archives depend on the same Node zlib and
 * the same pnpm pack/deploy behavior.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, run } from './common.mjs'

/** @returns {{ node: string, pnpm: string }} versions pinned by the repository. */
export function pinnedToolchain() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const nodeVersion = readFileSync(join(REPO_ROOT, '.node-version'), 'utf8').trim()
  const pnpm = /^pnpm@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager ?? '')?.[1]
  if (!pnpm) throw new Error(`package.json packageManager must be an exact pnpm@x.y.z, got ${pkg.packageManager}`)
  if (pkg.engines?.node !== nodeVersion) throw new Error(`engines.node ${pkg.engines?.node} differs from .node-version ${nodeVersion}`)
  if (pkg.engines?.pnpm !== pnpm) throw new Error(`engines.pnpm ${pkg.engines?.pnpm} differs from packageManager ${pnpm}`)
  return { node: nodeVersion, pnpm }
}

/** @returns {{ node: string, pnpm: string }} versions actually in use. */
export function activeToolchain() {
  const pnpm = run('pnpm', ['--version'], { cwd: REPO_ROOT, env: { ...process.env, COREPACK_ENABLE_STRICT: '0' } })
  return { node: process.versions.node, pnpm: pnpm.status === 0 ? pnpm.stdout.trim() : `unavailable (${pnpm.stderr.trim()})` }
}

/** Throw unless the active toolchain is exactly the pinned one. */
export function assertToolchain() {
  const pinned = pinnedToolchain()
  const active = activeToolchain()
  const problems = []
  if (active.node !== pinned.node) problems.push(`node ${active.node} is active; this repository requires ${pinned.node} (.node-version)`)
  if (active.pnpm !== pinned.pnpm) problems.push(`pnpm ${active.pnpm} is active; this repository requires ${pinned.pnpm} (packageManager)`)
  if (problems.length > 0) throw new Error(problems.join('\n'))
  return pinned
}
