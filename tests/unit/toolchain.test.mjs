import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { pinnedToolchain } from '../../scripts/lib/toolchain.mjs'

test('every toolchain pin agrees: .node-version, .nvmrc, engines, packageManager, runtime unit', () => {
  const pinned = pinnedToolchain()
  const unit = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'runtime-unit.json'), 'utf8'))
  assert.equal(readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim(), pinned.node)
  assert.equal(unit.toolchain.node_exact_version, pinned.node)
  assert.equal(unit.toolchain.node_major, Number(pinned.node.split('.')[0]))
  assert.equal(unit.toolchain.pnpm, pinned.pnpm)
})

test('the bundle pins the same dsh version as the runtime package and the runtime unit', () => {
  const unit = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'runtime-unit.json'), 'utf8'))
  const bundle = JSON.parse(readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'package.json'), 'utf8'))
  const runtime = JSON.parse(readFileSync(join(REPO_ROOT, 'runtime', 'dsh', 'package.json'), 'utf8'))
  assert.equal(bundle.peerDependencies['@deepseek-ai/dsh'], unit.dsh.package_version)
  assert.equal(runtime.dependencies['@deepseek-ai/dsh'], unit.dsh.package_version)
  assert.equal(bundle.name, unit.sophia_bundle.name)
  assert.equal(bundle.version, unit.sophia_bundle.version)
  assert.equal(bundle.dsh.bundle.patch, './cordis.patch.yml')
})

test('build facts are recorded, not left null or guessed', () => {
  const unit = JSON.parse(readFileSync(join(REPO_ROOT, 'config', 'runtime-unit.json'), 'utf8'))
  assert.match(unit.dsh.artifact_digest, /^sophia-tree-v1:sha256:[0-9a-f]{64}$/)
  const primary = unit.dsh.artifacts_by_platform[unit.dsh.artifact_primary_platform]
  assert.equal(primary.digest, unit.dsh.artifact_digest, 'artifact_digest is the primary platform digest')
  assert.ok(primary.entries > 0)
  assert.match(unit.sophia_bundle.archive_sha256, /^[0-9a-f]{64}$/)
  assert.match(unit.sophia_bundle.archive_integrity, /^sha512-/)
  assert.match(unit.workspace_lock_sha256, /^[0-9a-f]{64}$/)
})
