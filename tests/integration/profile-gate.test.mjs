/**
 * S1-01 acceptance and adverse checks against the real pinned dsh runtime.
 * Requires `pnpm artifacts` first; a missing or unrecorded artifact fails
 * the suite rather than skipping it.
 *
 * Each case copies one pristine install and damages it the way the goal's
 * adverse checks describe. Upstream `--dump-config` exits 0 for most of these
 * (the bundle is skipped, or an unmatched row only warns), so every case
 * asserts both what dsh did and that the Sophia gate rejected it.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { REPO_ROOT, RUNTIME_DIR, loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { verifyProfile } from '../../scripts/lib/gate.mjs'
import { assertRecordedArtifacts, bootProfile, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'

const unit = loadRuntimeUnit()
const scratch = mkdtempSync(join(tmpdir(), 'sophia-profile-gate-'))
const pristine = homeLayout(join(scratch, 'pristine'))

before(() => {
  assertRecordedArtifacts(unit, RUNTIME_DIR)
  installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
})
after(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
/** Copy the pristine install and apply `damage(profileDir, layout)`. */
function variant(damage) {
  const layout = homeLayout(join(scratch, `case-${counter++}`))
  cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
  damage(join(layout.dshHome, 'profiles', unit.dsh.profile), layout)
  return layout
}
const gateOf = (layout) => verifyProfile({ unit, runtimeDir: RUNTIME_DIR, ...layout })
const findingCodes = (gate) => gate.checks.flatMap((c) => c.findings.map((f) => f.code))
const bundleDir = (profileDir) => join(profileDir, 'node_modules', '@sophia', 'dsh-bundle')

test('positive: dsh-base + Sophia bundle compose cleanly, no other root loop; runtime still unhealthy until S1-03', () => {
  const gate = gateOf(pristine)
  assert.deepEqual(findingCodes(gate), [])
  assert.equal(gate.ok, true)
  assert.equal(gate.dump.status, 0)
  assert.equal(gate.dump.stderr, '')
  assert.equal(gate.health.healthy, false)
  assert.deepEqual(gate.health.reasons, ['bridge_not_ready: control bridge not implemented (S1-03)'])
})

test('adverse: a missing Sophia bundle is rejected although dsh boots the base alone', () => {
  const gate = gateOf(variant((profile) => rmSync(bundleDir(profile), { recursive: true })))
  assert.equal(gate.dump.status, 0, 'upstream dump still succeeds without the bundle')
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('bundle_missing'))
  assert.ok(findingCodes(gate).includes('bridge_row_missing'))
})

test('adverse: an incompatible Sophia bundle (wrong dsh peer) is rejected', () => {
  const gate = gateOf(variant((profile) => {
    const manifest = join(bundleDir(profile), 'package.json')
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    pkg.peerDependencies['@deepseek-ai/dsh'] = '0.2.0'
    writeFileSync(manifest, JSON.stringify(pkg, null, 2))
  }))
  assert.equal(gate.dump.status, 0, 'upstream skips the bundle and continues')
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('bundle_incompatible'))
  assert.ok(findingCodes(gate).includes('bridge_row_missing'))
})

test('adverse: a comments-only bundle patch is diagnosed, not accepted as configuration', () => {
  const gate = gateOf(variant((profile) => writeFileSync(join(bundleDir(profile), 'cordis.patch.yml'), '# rows removed\n')))
  assert.equal(gate.dump.status, 0)
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('patch_comments_only'))
})

test('adverse: an empty [] bundle patch (silently accepted upstream) is rejected', () => {
  const gate = gateOf(variant((profile) => writeFileSync(join(bundleDir(profile), 'cordis.patch.yml'), '[]\n')))
  assert.equal(gate.dump.status, 0)
  assert.equal(gate.dump.stderr, '', 'upstream prints nothing for an empty bundle layer')
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('patch_no_rows'))
  assert.ok(findingCodes(gate).includes('required_disable_missing'))
})

test('adverse: a wrong-row patch is diagnosed, not a silent no-op', () => {
  const gate = gateOf(variant((profile) => {
    const file = join(bundleDir(profile), 'cordis.patch.yml')
    writeFileSync(file, readFileSync(file, 'utf8').replace('- id: session-log-deepseek\n', '- id: session-log-deepseek-typo\n'))
  }))
  assert.equal(gate.dump.status, 0, 'upstream only warns about an unmatched row')
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('patch_unmatched_row'))
  assert.ok(findingCodes(gate).includes('required_disable_missing'), 'the intended disable did not land')
})

test('adverse: a comments-only profile patch fails the dump and the lint', () => {
  const gate = gateOf(variant((profile) => writeFileSync(join(profile, 'cordis.patch.yml'), '# only comments\n')))
  assert.equal(gate.dump.status, 1)
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('dump_failed'))
  assert.ok(findingCodes(gate).includes('patch_comments_only'))
})

test('adverse: another app bundle (a second root loop) in the profile is rejected', () => {
  const gate = gateOf(variant((profile) => {
    const manifest = join(profile, 'package.json')
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    pkg.dsh.profile.bundles.push('@deepseek-ai/dsh-headless')
    writeFileSync(manifest, JSON.stringify(pkg, null, 2))
  }))
  assert.equal(gate.ok, false)
  assert.equal(gate.dump.status, 0, 'upstream composes the headless runner without complaint')
  assert.ok(findingCodes(gate).includes('profile_bundles_mismatch'))
  assert.ok(findingCodes(gate).includes('foreign_root_loop'), 'the composed headless-runner row is named')
  assert.ok(findingCodes(gate).includes('foreign_layer'))
})

test('adverse: a bundle archive other than the recorded bytes is rejected', () => {
  const gate = gateOf(variant((profile) => writeFileSync(join(profile, unit.sophia_bundle.archive), 'not the recorded archive')))
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('bundle_archive_mismatch'))
})

test('adverse: installed bundle files that differ from the recorded archive are rejected', () => {
  const gate = gateOf(variant((profile) => {
    const entry = join(bundleDir(profile), 'dist', 'index.js')
    writeFileSync(entry, `${readFileSync(entry, 'utf8')}\n// modified after install\n`)
  }))
  assert.equal(gate.dump.status, 0, 'the dump only sees composition, not the bridge code')
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('bundle_files_mismatch'))
})

test('adverse: a bundle selecting a model route other than the recorded one is rejected', () => {
  const gate = gateOf(variant((profile) => {
    const file = join(bundleDir(profile), 'cordis.patch.yml')
    writeFileSync(file, readFileSync(file, 'utf8').replace('    model: gpt-6-luna\n', '    model: gpt-6-astra\n'))
  }))
  assert.equal(gate.dump.status, 0, 'upstream composes any route without complaint')
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('model_route_invalid'))
})

test('adverse: a profile without the recorded archive cannot be checked and is rejected', () => {
  const gate = gateOf(variant((profile) => rmSync(join(profile, unit.sophia_bundle.archive))))
  assert.equal(gate.ok, false)
  assert.ok(findingCodes(gate).includes('bundle_archive_missing'))
})

test('profile:verify refuses a runtime artifact that is not the recorded one', () => {
  const tampered = join(RUNTIME_DIR, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const original = readFileSync(tampered)
  try {
    writeFileSync(tampered, Buffer.concat([original, Buffer.from('\n')]))
    const result = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'profile-verify.mjs'), '--home', pristine.root], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /profile:verify refused: runtime artifact .* is not the recorded .* artifact/)
  } finally {
    writeFileSync(tampered, original)
  }
})

test('adverse: a bundle copy reachable from the runtime installation (masking the profile) is rejected', () => {
  const shadow = join(RUNTIME_DIR, 'node_modules', '@sophia', 'dsh-bundle')
  mkdirSync(join(RUNTIME_DIR, 'node_modules', '@sophia'), { recursive: true })
  try {
    cpSync(bundleDir(join(pristine.dshHome, 'profiles', unit.dsh.profile)), shadow, { recursive: true })
    const gate = gateOf(variant((profile) => rmSync(bundleDir(profile), { recursive: true })))
    assert.equal(gate.ok, false)
    assert.ok(findingCodes(gate).includes('bundle_shadowed'))
  } finally {
    rmSync(join(RUNTIME_DIR, 'node_modules', '@sophia'), { recursive: true, force: true })
  }
})

test('boot: the official launcher stays up with the Sophia row loaded and reports not_ready', () => {
  const layout = variant(() => {})
  const boot = bootProfile({ unit, runtimeDir: RUNTIME_DIR, layout, seconds: 8 })
  assert.equal(boot.timedOut, true, 'runtime was still running at the deadline')
  assert.match(boot.bridgeLine ?? '', /loaded @sophia\/dsh-bundle@0\.1\.0 protocolVersion=1 readiness=not_ready/)
  assert.deepEqual(boot.diagnostics, [])
  assert.doesNotMatch(boot.stderr, /skipping profile bundle|not found|startup failed/)
})

test('boot: a required-entry failure exits nonzero and its full startup diagnostics are retained', () => {
  const layout = variant((profile) => writeFileSync(join(profile, 'cordis.patch.yml'), '- id: agent-loop\n  config:\n    agents: 5\n'))
  const boot = bootProfile({ unit, runtimeDir: RUNTIME_DIR, layout, seconds: 30 })
  assert.equal(boot.timedOut, false)
  assert.equal(boot.status, 1)
  assert.match(boot.stderr, /startup failed: 1 required plugin did not activate/)
  assert.equal(boot.diagnostics.length, 1)
  assert.match(readFileSync(boot.diagnostics[0], 'utf8'), /agent-loop/)
})
