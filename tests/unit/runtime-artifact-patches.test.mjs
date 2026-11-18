import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { relocateRuntimePatches } from '../../scripts/lib/runtime-artifact-patches.mjs'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = file => parse(readFileSync(file, 'utf8'))
const write = (file, value) => writeFileSync(file, stringify(value))

function fixture(t, layout = 'checkout') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'runtime-patches-')))
  t.after(() => rmSync(root, { recursive: true }))
  const repo = join(root, layout)
  const runtime = join(root, layout === 'checkout' ? 'output' : 'different/deep/deployment/runtime')
  mkdirSync(join(repo, 'patches'), { recursive: true })
  mkdirSync(runtime, { recursive: true })
  const source = { 'alpha@1.0.0': 'patches/alpha.patch', '@scope/beta@2.0.0': 'patches/beta.patch' }
  const locked = {}
  const deployed = {}
  for (const [key, ref] of Object.entries(source)) {
    const bytes = `patch ${key}\n context with deliberate spaces  \n`
    writeFileSync(join(repo, ref), bytes)
    locked[key] = sha(bytes)
    deployed[key] = relative(runtime, join(repo, ref))
  }
  const workspace = join(repo, 'pnpm-workspace.yaml')
  const lock = join(repo, 'pnpm-lock.yaml')
  const generated = join(runtime, 'pnpm-workspace.yaml')
  const options = { allowBuilds: { alpha: true, beta: false }, futureSetting: { nested: [1, 'yes', null], flag: false } }
  write(workspace, { patchedDependencies: source })
  write(lock, { patchedDependencies: locked })
  write(generated, { ...options, patchedDependencies: deployed })
  return { root, repo, runtime, workspace, lock, generated, source, options }
}

function alter(file, callback) {
  const value = read(file)
  callback(value)
  write(file, value)
}

test('different checkout names and deployment depths reproduce; config and exact patch bytes stay hashed', t => {
  const a = fixture(t)
  const b = fixture(t, 'other/nested/source-name')
  assert.notEqual(treeDigest(a.runtime).digest, treeDigest(b.runtime).digest, 'unrepaired deployment exposes the original bug')
  for (const f of [a, b]) {
    relocateRuntimePatches(f.repo, f.runtime)
    const generated = read(f.generated)
    assert.deepEqual({ ...generated, patchedDependencies: undefined }, { ...f.options, patchedDependencies: undefined })
    for (const [key, ref] of Object.entries(generated.patchedDependencies)) {
      assert.match(ref, /^\.sophia-patches\/[^/]+\.patch$/)
      const copied = resolve(f.runtime, ref)
      assert.ok(copied.startsWith(f.runtime + '/'))
      assert.deepEqual(readFileSync(copied), readFileSync(join(f.repo, f.source[key])))
      assert.equal(lstatSync(copied).mode & 0o777, 0o644)
    }
  }
  assert.deepEqual(readFileSync(a.generated), readFileSync(b.generated))
  assert.equal(treeDigest(a.runtime).digest, treeDigest(b.runtime).digest)
  const before = treeDigest(a.runtime).digest
  writeFileSync(join(a.runtime, '.sophia-patches/alpha.patch'), 'changed copied patch\n')
  assert.notEqual(treeDigest(a.runtime).digest, before, 'copied patch mutation must change identity')
  const configBefore = treeDigest(b.runtime).digest
  alter(b.generated, value => { value.allowBuilds.alpha = false })
  assert.notEqual(treeDigest(b.runtime).digest, configBefore, 'generated config remains hashed')
})

const invalid = {
  'missing generated map': f => alter(f.generated, v => { delete v.patchedDependencies }),
  'invalid generated map': f => alter(f.generated, v => { v.patchedDependencies = [] }),
  'missing generated package': f => alter(f.generated, v => { delete v.patchedDependencies['alpha@1.0.0'] }),
  'foreign generated package': f => alter(f.generated, v => { v.patchedDependencies.foreign = '../outside' }),
  'missing locked package': f => alter(f.lock, v => { delete v.patchedDependencies['alpha@1.0.0'] }),
  'foreign locked package': f => alter(f.lock, v => { v.patchedDependencies.foreign = 'bad' }),
  'changed source patch bytes': f => writeFileSync(join(f.repo, 'patches/alpha.patch'), 'unlocked mutation'),
  'invalid frozen hash': f => alter(f.lock, v => { v.patchedDependencies['alpha@1.0.0'] = {} }),
  'absolute source reference': f => alter(f.workspace, v => { v.patchedDependencies['alpha@1.0.0'] = join(f.root, 'outside') }),
  'escaping source reference': f => alter(f.workspace, v => { v.patchedDependencies['alpha@1.0.0'] = 'patches/../../outside' }),
  'missing source patch': f => rmSync(join(f.repo, 'patches/alpha.patch')),
  'absolute generated reference': f => alter(f.generated, v => { v.patchedDependencies['alpha@1.0.0'] = join(f.repo, 'patches/alpha.patch') }),
  'foreign generated reference': f => alter(f.generated, v => { v.patchedDependencies['alpha@1.0.0'] = relative(f.runtime, join(f.root, 'outside')) }),
  'noncanonical generated escape': f => alter(f.generated, v => { v.patchedDependencies['alpha@1.0.0'] = './' + v.patchedDependencies['alpha@1.0.0'] }),
  'invalid generated reference': f => alter(f.generated, v => { v.patchedDependencies['alpha@1.0.0'] = null }),
  'symlink source patch': f => { rmSync(join(f.repo, 'patches/alpha.patch')); symlinkSync(join(f.root, 'outside'), join(f.repo, 'patches/alpha.patch')) },
  'symlink source directory': f => { rmSync(join(f.repo, 'patches'), { recursive: true }); symlinkSync(join(f.root, 'outside-directory'), join(f.repo, 'patches')) },
  'symlink generated config': f => { rmSync(f.generated); symlinkSync(join(f.root, 'outside'), f.generated) },
  'destination directory collision': f => mkdirSync(join(f.runtime, '.sophia-patches')),
  'destination file collision': f => writeFileSync(join(f.runtime, '.sophia-patches'), 'foreign content'),
  'destination symlink escape': f => symlinkSync(join(f.root, 'outside-directory'), join(f.runtime, '.sophia-patches')),
  'duplicate destination name': f => {
    alter(f.workspace, v => { v.patchedDependencies['@scope/beta@2.0.0'] = v.patchedDependencies['alpha@1.0.0'] })
    alter(f.lock, v => { v.patchedDependencies['@scope/beta@2.0.0'] = v.patchedDependencies['alpha@1.0.0'] })
    alter(f.generated, v => { v.patchedDependencies['@scope/beta@2.0.0'] = v.patchedDependencies['alpha@1.0.0'] })
  },
}
for (const [name, mutate] of Object.entries(invalid)) {
  test(`refuses ${name} before changing runtime or outside sentinels`, t => {
    const f = fixture(t)
    writeFileSync(join(f.root, 'outside'), 'private sentinel must not be read or written')
    mkdirSync(join(f.root, 'outside-directory'))
    writeFileSync(join(f.root, 'outside-directory/sentinel'), 'untouched')
    mutate(f)
    const before = treeDigest(f.runtime).digest
    assert.throws(() => relocateRuntimePatches(f.repo, f.runtime))
    assert.equal(treeDigest(f.runtime).digest, before)
    assert.equal(readFileSync(join(f.root, 'outside'), 'utf8'), 'private sentinel must not be read or written')
    assert.equal(readFileSync(join(f.root, 'outside-directory/sentinel'), 'utf8'), 'untouched')
  })
}

test('refuses a symlink runtime root and source-as-runtime', t => {
  const f = fixture(t)
  const alias = join(f.root, 'alias')
  symlinkSync(f.runtime, alias)
  assert.throws(() => relocateRuntimePatches(f.repo, alias))
  const before = readFileSync(f.workspace)
  assert.throws(() => relocateRuntimePatches(f.repo, f.repo))
  assert.deepEqual(readFileSync(f.workspace), before)
})


// Complete valid deployments, with the source repository physically inside the runtime. Refusal must happen
// before copying/reformatting anything, even when a child component begins with two dots.
for (const child of ['source', '..source', '..cache/sub']) {
  test(`refuses contained source component ${child} without changing the fixture`, t => {
    const f = fixture(t)
    const repo = join(f.runtime, child)
    mkdirSync(dirname(repo), { recursive: true })
    renameSync(f.repo, repo)
    alter(f.generated, value => {
      value.patchedDependencies = Object.fromEntries(Object.entries(f.source).map(([key, ref]) => [key, relative(f.runtime, join(repo, ref))]))
    })
    const sentinel = join(f.root, 'outside-sentinel')
    writeFileSync(sentinel, 'unchanged fixture sentinel')
    const snapshot = () => ({ runtime: treeDigest(f.runtime), config: sha(readFileSync(f.generated)), sentinel: sha(readFileSync(sentinel)) })
    const before = snapshot()
    let error
    try { relocateRuntimePatches(repo, f.runtime) } catch (caught) { error = caught }
    const after = snapshot()
    t.diagnostic(JSON.stringify({ boundary: child, before, after, refused: !!error, error: error?.message }))
    assert.ok(error, 'contained source must be refused before any artifact writes')
    assert.match(error.message, /runtime must not contain the source repository/)
    assert.deepEqual(after, before)
  })
}

test('normal runtime output nested under the source checkout remains supported', t => {
  const f = fixture(t)
  const runtime = join(f.repo, '.artifacts/runtime')
  mkdirSync(dirname(runtime), { recursive: true })
  renameSync(f.runtime, runtime)
  const generated = join(runtime, 'pnpm-workspace.yaml')
  alter(generated, value => {
    value.patchedDependencies = Object.fromEntries(Object.entries(f.source).map(([key, ref]) => [key, relative(runtime, join(f.repo, ref))]))
  })
  relocateRuntimePatches(f.repo, runtime)
  for (const [key, ref] of Object.entries(read(generated).patchedDependencies)) {
    assert.deepEqual(readFileSync(join(runtime, ref)), readFileSync(join(f.repo, f.source[key])))
  }
})

test('maintained buildRuntimeArtifact relocates after deploy, before returning the runtime', async t => {
  const f = fixture(t)
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const artifactsRoot = join(f.root, 'actual-callsite')
  const runtime = join(artifactsRoot, 'runtime')
  const previous = process.env.SOPHIA_ARTIFACTS_DIR
  process.env.SOPHIA_ARTIFACTS_DIR = artifactsRoot
  t.after(() => {
    if (previous === undefined) delete process.env.SOPHIA_ARTIFACTS_DIR
    else process.env.SOPHIA_ARTIFACTS_DIR = previous
  })
  let deployCalls = 0
  const mocked = t.mock.method(childProcess, 'spawnSync', (command, args, options) => {
    assert.equal(command, 'pnpm')
    assert.deepEqual(args, ['--filter', '@sophia/dsh-runtime', 'deploy', '--prod', '--frozen-lockfile', runtime])
    assert.equal(options.cwd, repo)
    assert.equal(existsSync(runtime), false)
    mkdirSync(runtime, { recursive: true })
    const source = read(join(repo, 'pnpm-workspace.yaml')).patchedDependencies
    const deployed = Object.fromEntries(Object.entries(source).map(([key, ref]) => [key, relative(runtime, join(repo, ref))]))
    write(join(runtime, 'pnpm-workspace.yaml'), { patchedDependencies: deployed, allowBuilds: { koffi: true } })
    deployCalls++
    return { status: 0, stdout: '', stderr: '' }
  })
  syncBuiltinESMExports()
  try {
    const { buildRuntimeArtifact } = await import('../../scripts/lib/artifacts.mjs')
    assert.equal(buildRuntimeArtifact(), runtime)
    assert.equal(deployCalls, 1)
    const generated = read(join(runtime, 'pnpm-workspace.yaml'))
    assert.deepEqual(generated.allowBuilds, { koffi: true })
    for (const ref of Object.values(generated.patchedDependencies)) assert.ok(existsSync(join(runtime, ref)))
    assert.ok(treeDigest(runtime).entries.some(line => line.includes('f .sophia-patches/')))
  } finally {
    mocked.mock.restore()
    syncBuiltinESMExports()
  }
})
