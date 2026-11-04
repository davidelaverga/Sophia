/**
 * The runtime host's profile reconciliation (R00-CX-0003) against the real pinned dsh. A project root keeps its
 * profile between deploys, so a deploy that changes the bundle must reinstall the profile, and only the profile:
 * native sessions, storages, the bridge journal and the workspace are the project's and must survive.
 * Requires `pnpm artifacts` first.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
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

test('a profile that runs the recorded bundle is left alone', async () => {
  const { layout, data } = projectRoot()
  assert.deepEqual(profileDrift({ unit, layout }), [])
  assert.deepEqual(await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout }), { state: 'current', drift: [] })
  assert.equal(existsSync(join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)), false)
  assertDataKept(data)
})

test('a stale profile is reinstalled in place; sessions, storages, the journal and the workspace are kept', async () => {
  const { layout, data } = projectRoot()
  age(layout)
  const drift = profileDrift({ unit, layout })
  assert.ok(drift.includes('installed bundle lacks dist/retained-queue.js'), drift.join('; '))
  assert.ok(drift.includes('installed bundle dist/control-bridge.js differs from the recorded archive'), drift.join('; '))

  const result = await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout })
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

test('a failed reinstall puts the previous profile back', async () => {
  const { layout, data } = projectRoot()
  age(layout)
  const before = profileDrift({ unit, layout })
  await assert.rejects(() => reconcileProfile({ unit, runtimeDir: join(scratch, 'no-runtime'), layout }))
  assert.deepEqual(profileDrift({ unit, layout }), before, 'the previous profile is back, unchanged')
  assert.equal(existsSync(join(layout.dshHome, 'profiles', `.${unit.dsh.profile}.previous`)), false)
  assertDataKept(data)
})

test('a root without a profile gets one', async () => {
  const layout = homeLayout(join(scratch, 'fresh'))
  mkdirSync(layout.root, { recursive: true })
  assert.deepEqual(await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout }), { state: 'installed', drift: [] })
  assert.deepEqual(profileDrift({ unit, layout }), [])
})

/**
 * B-NATIVE-PROFILE-HISTORY-01. A root that has been upgraded before holds `.<profile>.previous`, the profile an earlier
 * upgrade replaced (production holds one). The next upgrade must keep it as well as the profile it replaces now: no
 * reconciliation deletes a profile's history, and a state it cannot handle safely is refused before anything moves.
 */
const profilesOf = (layout) => join(layout.dshHome, 'profiles')
const previousOf = (layout) => join(profilesOf(layout), `.${unit.dsh.profile}.previous`)
const retiredOf = (layout, stamp) => `${previousOf(layout)}.${stamp}`

/** Every entry under `dir`, never following a link: its type, permissions and bytes (or link text), as one digest. */
function snapshot(dir) {
  const lines = []
  const walk = (at) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name)
      const rel = relative(dir, path)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) lines.push(`l ${rel} ${readlinkSync(path)}`)
      else if (stat.isDirectory()) {
        lines.push(`d ${rel} ${(stat.mode & 0o7777).toString(8)}`)
        walk(path)
      } else lines.push(`f ${rel} ${(stat.mode & 0o7777).toString(8)} ${createHash('sha256').update(readFileSync(path)).digest('hex')}`)
    }
  }
  walk(dir)
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}

/** A root an earlier upgrade left with a `.previous`: a distinct, older profile with its own bytes. */
function upgradedBefore() {
  const root = projectRoot()
  const previous = previousOf(root.layout)
  cpSync(profileDir(root.layout), previous, { recursive: true, verbatimSymlinks: true })
  appendFileSync(join(previous, 'cordis.patch.yml'), '\n# the profile an earlier upgrade replaced\n')
  writeFileSync(join(previous, 'history-marker'), 'older history')
  return root
}

test('an upgrade keeps the earlier .previous as well as the profile it replaces, upgrade after upgrade', async () => {
  const { layout, data } = upgradedBefore()
  const history = snapshot(previousOf(layout))
  age(layout)
  const replaced = snapshot(profileDir(layout))
  assert.notEqual(history, replaced, 'two distinct profiles')

  const first = await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout, stamp: 'first' })
  assert.equal(first.state, 'upgraded')
  assert.deepEqual(profileDrift({ unit, layout }), [], 'the profile now runs the recorded bundle')
  assert.equal(snapshot(previousOf(layout)), replaced, 'the replaced profile is .previous, byte for byte')
  assert.ok(existsSync(retiredOf(layout, 'first')), 'the earlier .previous is not deleted')
  assert.equal(snapshot(retiredOf(layout, 'first')), history, 'the earlier .previous is kept, byte for byte')

  // The next deploy (a restart on a later bundle, say) keeps all of it again.
  appendFileSync(join(profileDir(layout), 'cordis.patch.yml'), '\n# drifted again\n')
  const replacedAgain = snapshot(profileDir(layout))
  const second = await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout, stamp: 'second' })
  assert.equal(second.state, 'upgraded')
  assert.deepEqual(profileDrift({ unit, layout }), [])
  assert.equal(snapshot(previousOf(layout)), replacedAgain)
  assert.equal(snapshot(retiredOf(layout, 'second')), replaced)
  assert.equal(snapshot(retiredOf(layout, 'first')), history)
  assert.deepEqual(
    readdirSync(profilesOf(layout)).sort(),
    [`.${unit.dsh.profile}.previous`, `.${unit.dsh.profile}.previous.first`, `.${unit.dsh.profile}.previous.second`, unit.dsh.profile].sort(),
  )
  assertDataKept(data)
})

test('without a stamp, an upgrade names the earlier .previous by a fresh one of its own', async () => {
  const { layout } = upgradedBefore()
  const history = snapshot(previousOf(layout))
  age(layout)
  assert.equal((await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout })).state, 'upgraded')
  const kept = readdirSync(profilesOf(layout)).filter((name) => name.startsWith(`.${unit.dsh.profile}.previous.`))
  assert.equal(kept.length, 1, kept.join(', '))
  assert.match(kept[0], /\.previous\.\d{8}T\d{9}Z-[0-9a-f]{8}$/)
  assert.equal(snapshot(join(profilesOf(layout), kept[0])), history)
})

test('a current profile with an earlier .previous is left alone, history and all', async () => {
  const { layout, data } = upgradedBefore()
  const before = snapshot(profilesOf(layout))
  assert.deepEqual(await reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout, stamp: 'unused' }), { state: 'current', drift: [] })
  assert.equal(snapshot(profilesOf(layout)), before)
  assertDataKept(data)
})

test('a failed reinstall puts back both the profile and the earlier .previous', async () => {
  const { layout, data } = upgradedBefore()
  age(layout)
  const before = snapshot(profilesOf(layout))
  await assert.rejects(() => reconcileProfile({ unit, runtimeDir: join(scratch, 'no-runtime'), layout, stamp: 'failed' }), /no dsh launcher/)
  assert.equal(snapshot(profilesOf(layout)), before, 'the profile and its history are back, unchanged; nothing new is left')
  assert.equal(existsSync(retiredOf(layout, 'failed')), false)
  assertDataKept(data)
})

test('a state it cannot handle safely is refused before anything moves', async () => {
  const refused = async (label, prepare, stamp, message) => {
    const { layout, data } = upgradedBefore()
    age(layout)
    const outside = prepare(layout)
    const profiles = snapshot(profilesOf(layout))
    const target = outside && snapshot(outside)
    await assert.rejects(() => reconcileProfile({ unit, runtimeDir: RUNTIME_DIR, layout, stamp }), message, label)
    assert.equal(snapshot(profilesOf(layout)), profiles, `${label}: the profiles are untouched`)
    if (outside) assert.equal(snapshot(outside), target, `${label}: what a link names is untouched`)
    assertDataKept(data)
  }
  // An earlier .previous that is not a directory of its own.
  await refused('.previous is a link', (layout) => {
    const elsewhere = join(layout.root, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, 'kept'), 'not the profile history')
    rmSync(previousOf(layout), { recursive: true })
    symlinkSync(elsewhere, previousOf(layout))
    return elsewhere
  }, 'link', /\.previous is not a directory/)
  await refused('.previous is a file', (layout) => {
    rmSync(previousOf(layout), { recursive: true })
    writeFileSync(previousOf(layout), 'a file')
  }, 'file', /\.previous is not a directory/)
  // The name the earlier .previous would take is already used, even by an empty directory (rename would replace it).
  await refused('the new name is an empty directory', (layout) => {
    mkdirSync(retiredOf(layout, 'taken'))
  }, 'taken', /exists; nothing is changed/)
  await refused('the new name is kept history', (layout) => {
    mkdirSync(retiredOf(layout, 'taken'))
    writeFileSync(join(retiredOf(layout, 'taken'), 'older'), 'older still')
  }, 'taken', /exists; nothing is changed/)
  // A stamp that is not a plain name, and a profile that is a link.
  for (const stamp of ['', '../escape', 'a/b', '.', 'x'.repeat(65)]) await refused(`stamp ${JSON.stringify(stamp)}`, () => undefined, stamp, /not a safe history name/)
  await refused('the profile is a link', (layout) => {
    const real = join(layout.root, 'real-profile')
    cpSync(profileDir(layout), real, { recursive: true, verbatimSymlinks: true })
    rmSync(profileDir(layout), { recursive: true })
    symlinkSync(real, profileDir(layout))
    return real
  }, 'linked', /is not a directory/)
})
