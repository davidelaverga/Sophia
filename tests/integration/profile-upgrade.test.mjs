/**
 * The runtime host's profile reconciliation (R00-CX-0003) against the real pinned dsh. A project root keeps its
 * profile between deploys, so a deploy that changes the bundle must reinstall the profile, and only the profile:
 * native sessions, storages, the bridge journal and the workspace are the project's and must survive.
 * Requires `pnpm artifacts` first.
 */

import assert from 'node:assert/strict'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { RUNTIME_DIR, loadRuntimeUnit } from '../../scripts/lib/common.mjs'
import { assertRecordedArtifacts, bootProfile, homeLayout, installProfile, profileDrift, reconcileProfile } from '../../scripts/lib/profile.mjs'

const unit = loadRuntimeUnit()
const scratch = mkdtempSync(join(tmpdir(), 'sophia-profile-upgrade-'))
const pristine = homeLayout(join(scratch, 'pristine'))

before(() => {
  assertRecordedArtifacts(unit, RUNTIME_DIR)
  installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
})
after(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
/** A copy of the pristine install holding project data, as a runtime root on a persistent disk would. */
function projectRoot() {
  const layout = homeLayout(join(scratch, `project-${counter++}`))
  cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
  const data = {
    [join(layout.dshHome, 'sessions', '--workspace--', 'att-1', 'session.v4.jsonl.zstd')]: 'native session bytes',
    [join(layout.dshHome, 'storages', 'session_projcache', 'sessions', 'att-1.json')]: '{"seq":7}',
    [join(layout.dshHome, 'sophia-bridge', 'att-1.jsonl')]: '{"commandId":"c1","stage":"completed"}\n',
    [join(layout.root, 'workspace', 'notes.md')]: 'work in progress',
  }
  for (const [path, text] of Object.entries(data)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  return { layout, data }
}
const profileDir = (layout) => join(layout.dshHome, 'profiles', unit.dsh.profile)
const installedBundle = (layout) => realpathSync(join(profileDir(layout), 'node_modules', ...unit.sophia_bundle.name.split('/')))
const assertDataKept = (data) => {
  for (const [path, text] of Object.entries(data)) assert.equal(readFileSync(path, 'utf8'), text, `${path} kept`)
}

/** Make the installed profile look like one installed from an older bundle: a file missing and one changed. */
function age(layout) {
  const bundle = installedBundle(layout)
  rmSync(join(bundle, 'dist', 'retained-queue.js'))
  appendFileSync(join(bundle, 'dist', 'control-bridge.js'), '\n// an older build\n')
}

test('a profile that runs the recorded bundle is left alone', () => {
  const { layout, data } = projectRoot()
  assert.deepEqual(profileDrift({ unit, layout }), [])
  assert.deepEqual(reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout }), { state: 'current', drift: [] })
  assert.equal(existsSync(join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)), false)
  assertDataKept(data)
})

test('a stale profile is reinstalled in place; sessions, storages, the journal and the workspace are kept', () => {
  const { layout, data } = projectRoot()
  age(layout)
  const drift = profileDrift({ unit, layout })
  assert.ok(drift.includes('installed bundle lacks dist/retained-queue.js'), drift.join('; '))
  assert.ok(drift.includes('installed bundle dist/control-bridge.js differs from the recorded archive'), drift.join('; '))

  const result = reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
  assert.equal(result.state, 'upgraded')
  assert.deepEqual(result.drift, drift)
  assert.deepEqual(profileDrift({ unit, layout }), [], 'the profile now runs the recorded bundle')
  assert.ok(existsSync(join(installedBundle(layout), 'dist', 'retained-queue.js')))
  assertDataKept(data)
  const previous = join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)
  assert.ok(existsSync(join(previous, 'package.json')), 'the previous profile is kept for a manual rollback')

  const boot = bootProfile({ unit, runtimeDir: RUNTIME_DIR, layout, seconds: 8 })
  assert.match(boot.bridgeLine ?? '', /loaded @sophia\/dsh-bundle@/, `${boot.stdout}\n${boot.stderr}`)
  assertDataKept(data)
})

test('a failed reinstall puts the previous profile back', () => {
  const { layout, data } = projectRoot()
  age(layout)
  const before = profileDrift({ unit, layout })
  assert.throws(() => reconcileProfile({ unit, runtimeDir: join(scratch, 'no-runtime'), layout }))
  assert.deepEqual(profileDrift({ unit, layout }), before, 'the previous profile is back, unchanged')
  assert.equal(existsSync(join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)), false)
  assertDataKept(data)
})

test('a root without a profile gets one', () => {
  const layout = homeLayout(join(scratch, 'fresh'))
  mkdirSync(layout.root, { recursive: true })
  assert.deepEqual(reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout }), { state: 'installed', drift: [] })
  assert.deepEqual(profileDrift({ unit, layout }), [])
})
