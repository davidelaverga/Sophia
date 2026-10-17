/**
 * #393 4302689994: the service executor's identity is its installed closure (executor-identity.ts), and the bundle
 * advertises it only when it equals the operator's expected pin. The crossing proves it against real dsh processes;
 * these cases hold the recipe and the decision.
 */

import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  ClosureUnverifiable,
  DSH_ENTRY,
  assertConfigOnlyPatch,
  assertNoLaunchModifiers,
  executorClosure,
  loadedClosureInputs,
  treeDigestWithin,
} from '../../packages/dsh-bundle/dist/executor-identity.js'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { replyServiceSettings } from '../../packages/dsh-bundle/dist/index.js'
import { treeDigest } from '../../scripts/lib/tree-digest.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'sophia-executor-identity-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
let n = 0
const dir = (files) => {
  const root = join(scratch, `t${n++}`)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  return root
}
const unverifiable = (reason) => (error) => error instanceof ClosureUnverifiable && error.reason === reason

test('the runtime and bundle components are sophia-tree-v2 exactly, inner symlinks and exec bits included', () => {
  const root = dir({ 'node_modules/.pnpm/a@1/node_modules/a/index.js': 'a', 'bin/run': '#!', 'pnpm-lock.yaml': 'volatile' })
  chmodSync(join(root, 'bin/run'), 0o755)
  mkdirSync(join(root, 'node_modules/a'), { recursive: true })
  symlinkSync('../.pnpm/a@1/node_modules/a/index.js', join(root, 'node_modules/a/index.js'))
  assert.equal(treeDigestWithin(root), treeDigest(root).digest)
})

test('a symlink out of its root, or absolute, leaves the closure unverifiable', () => {
  const outside = dir({ 'x.js': 'outside' })
  const escaping = dir({ 'index.js': 'a' })
  symlinkSync(join('..', outside.split('/').at(-1), 'x.js'), join(escaping, 'link.js'))
  assert.throws(() => treeDigestWithin(escaping), unverifiable('symlink_escapes_root'))
  const absolute = dir({ 'index.js': 'a' })
  symlinkSync(join(outside, 'x.js'), join(absolute, 'link.js'))
  assert.throws(() => treeDigestWithin(absolute), unverifiable('symlink_escapes_root'))
})

const MANIFEST = JSON.stringify({ dependencies: { '@sophia/dsh-bundle': 'file:./b.tgz' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@sophia/dsh-bundle'] } } })
const OVERRIDE = (config = {}) => Buffer.from(JSON.stringify([{ id: 'llm-pi-ai', config }]))

function install() {
  const runtimeDir = dir({ [DSH_ENTRY]: 'dsh', 'node_modules/pi-ai/index.js': 'adapter' })
  const dshHome = dir({ 'profiles/.keep': '' })
  const profileDir = dir({ 'package.json': MANIFEST, 'pnpm-workspace.yaml': 'a', 'cordis.patch.yml': '[]\n', 'pnpm-lock.yaml': 'l', 'b.tgz': 'z',
    'node_modules/.modules.yaml': 'm', 'node_modules/@sophia/dsh-bundle/dist/index.js': 'bundle' })
  return { runtimeDir, dshHome, profileDir, bundleDir: join(profileDir, 'node_modules/@sophia/dsh-bundle'), archive: 'b.tgz', overlays: [OVERRIDE()],
    profile: 'sophia-runtime', toolchain: { node: 'v24.21.0', platform: 'darwin', arch: 'arm64' } }
}

test('the closure changes with every component: adapter, bundle, profile input, overlay, Node', () => {
  const inputs = install()
  const base = executorClosure(inputs).digest
  assert.match(base, /^[0-9a-f]{64}$/)
  assert.equal(executorClosure(inputs).digest, base, 'deterministic')
  const variants = [
    () => writeFileSync(join(inputs.runtimeDir, 'node_modules/pi-ai/index.js'), 'adapter2'),
    () => writeFileSync(join(inputs.bundleDir, 'dist/index.js'), 'bundle2'),
    () => writeFileSync(join(inputs.profileDir, 'pnpm-lock.yaml'), 'l2'),
  ]
  let last = base
  for (const change of variants) {
    change()
    const next = executorClosure(inputs).digest
    assert.notEqual(next, last)
    last = next
  }
  assert.notEqual(executorClosure({ ...inputs, overlays: [OVERRIDE({ maxRetries: 0 })] }).digest, last)
  assert.notEqual(executorClosure({ ...inputs, toolchain: { ...inputs.toolchain, node: 'v24.22.0' } }).digest, last)
  assert.throws(() => executorClosure({ ...inputs, toolchain: { ...inputs.toolchain, platform: 'win32' } }), unverifiable('unsupported_platform'))
  assert.throws(() => executorClosure({ ...inputs, bundleDir: inputs.runtimeDir }), unverifiable('bundle_outside_profile'))
})

test('only the launch dsh is given is read: its bin, one --profile and --patch files; anything else is unreadable', () => {
  const runtime = dir({ [DSH_ENTRY]: 'dsh' })
  const patch = join(dir({ 'p.yml': 'overlay' }), 'p.yml')
  const bin = join(runtime, DSH_ENTRY)
  const toolchain = { node: 'v24.21.0', platform: 'darwin', arch: 'arm64' }
  const read = (argv, env = { DSH_HOME: '/h' }) => loadedClosureInputs(['node', ...argv], [], env, '/b', 'b.tgz', toolchain)
  const ok = read([bin, '--profile', 'sophia-runtime', '--patch', patch])
  assert.equal(ok.runtimeDir, runtime)
  assert.equal(ok.profileDir, '/h/profiles/sophia-runtime')
  assert.equal(ok.dshHome, '/h')
  assert.deepEqual(ok.overlays.map(String), ['overlay'])
  for (const argv of [
    ['/elsewhere/dsh.js', '--profile', 'sophia-runtime'],
    [bin],
    [bin, '--profile', 'sophia-runtime', '--profile', 'other'],
    [bin, '--profile', 'sophia-runtime', '--config', 'x'],
    [bin, '--profile', '../escape'],
    [bin, '--profile', 'sophia-runtime', '--patch'],
  ]) assert.throws(() => read(argv), unverifiable('launch_unreadable'), JSON.stringify(argv))
  assert.throws(() => read([bin, '--profile', 'sophia-runtime', '--patch', join(scratch, 'missing.yml')]), unverifiable('component_unreadable'))
})

const ROUTES = { svc: { provider: 'openai', model: 'm', reasoningEffort: 'high', maxTokens: 4096, prices: { inputPerMTokUsd: 1, outputPerMTokUsd: 1 } } }
const REPLIES = { mode: 'service', routeId: 'svc', executorDigestEnv: 'PIN' }
const PIN = 'a'.repeat(64)

test('the advertised tuple is the verified closure, only when it equals the expected pin; never a fallback', () => {
  const lines = []
  const settings = (env, closure) => replyServiceSettings(REPLIES, ROUTES, env, (line) => lines.push(line), closure)
  assert.equal(settings({ PIN }, () => PIN)?.executorArtifactDigest, PIN)
  assert.deepEqual(lines.splice(0), ['reply_service executor_closure_verified'])
  assert.equal(settings({ PIN }, () => 'b'.repeat(64)), null)
  assert.deepEqual(lines.splice(0), ['reply_service_unavailable executor_closure_mismatch'])
  assert.equal(settings({ PIN }, () => { throw new ClosureUnverifiable('symlink_escapes_root') }), null)
  assert.deepEqual(lines.splice(0), ['reply_service_unavailable executor_closure_unverifiable symlink_escapes_root'])
  assert.equal(settings({ PIN }, () => { throw new Error('/secret/path read failed') }), null)
  assert.deepEqual(lines.splice(0), ['reply_service_unavailable executor_closure_unverifiable'], 'no path or message is logged')
  let called = false
  assert.equal(settings({}, () => { called = true; return PIN }), null)
  assert.equal(called, false, 'no closure is derived without an expected pin')
  assert.deepEqual(lines.splice(0), ['reply_service_unavailable executor_digest_unset'])
  assert.equal(replyServiceSettings(null, ROUTES, { PIN }, () => {}, () => { throw new Error('never') }), null, 'service mode off derives nothing')
})

// #393 R-B2-A868-01..03: the service composition admits only the reviewed shape; everything else refuses before a role.
test('a home patch in any form refuses: a file, a directory, a dangling link', () => {
  for (const make of [
    (home) => writeFileSync(join(home, 'cordis.patch.yml'), '[]'),
    (home) => mkdirSync(join(home, 'cordis.patch.yml')),
    (home) => symlinkSync(join(home, 'missing'), join(home, 'cordis.patch.yml')),
  ]) {
    const inputs = install()
    executorClosure(inputs)
    make(inputs.dshHome)
    assert.throws(() => executorClosure(inputs), unverifiable('home_patch_present'))
  }
})

test('only the reviewed base profile: no other package, dependency or bundle', () => {
  for (const change of [
    (p) => mkdirSync(join(p, 'node_modules', 'extra-plugin')),
    (p) => mkdirSync(join(p, 'node_modules', '@sophia', 'other')),
    (p) => writeFileSync(join(p, 'package.json'), MANIFEST.replace('"@sophia/dsh-bundle":"file:./b.tgz"', '"@sophia/dsh-bundle":"file:./b.tgz","x":"1"')),
    (p) => writeFileSync(join(p, 'package.json'), MANIFEST.replace('"@deepseek-ai/dsh-base",', '')),
  ]) {
    const inputs = install()
    change(inputs.profileDir)
    assert.throws(() => executorClosure(inputs), unverifiable('profile_unsupported'))
  }
})

test('a patch is strict JSON overrides of reviewed config rows; no insert, name, group, include, expression or inline key', () => {
  for (const ok of ['[]', '[{"id":"llm-pi-ai","config":{"providers":{"p":{"apiKeyEnv":"OPENAI_API_KEY","baseURL":"http://127.0.0.1:1/v1"}}}}]',
    '[{"id":"sophia-control-bridge","config":{"protocolVersion":1}},{"id":"agent-default-model","config":{"provider":"p"}}]']) {
    assertConfigOnlyPatch(Buffer.from(ok))
  }
  for (const bad of [
    '- id: llm-pi-ai\n  config: {}\n',
    '- id: llm-pi-ai\n  config: !!js/function "() => 1"\n',
    '[{"insert":[{"id":"x","name":"./plugin.mjs"}]}]',
    '[{"id":"llm-pi-ai","name":"./plugin.mjs","config":{}}]',
    '[{"id":"llm-pi-ai","config":{},"group":true}]',
    '[{"id":"llm-pi-ai","config":{},"disabled":true}]',
    '[{"id":"include-row","config":{"path":"./more.yml"}}]',
    '[{"id":"llm-pi-ai","config":[{"name":"./plugin.mjs"}]}]',
    '[{"id":"llm-pi-ai","config":{"providers":{"p":{"apiKey":"inline"}}}}]',
    '{"id":"llm-pi-ai","config":{}}',
  ]) assert.throws(() => assertConfigOnlyPatch(Buffer.from(bad)), unverifiable('patch_unsupported'), bad)
  const inputs = install()
  writeFileSync(join(inputs.profileDir, 'cordis.patch.yml'), '[{"insert":[{"id":"x","name":"./plugin.mjs"}]}]')
  assert.throws(() => executorClosure(inputs), unverifiable('patch_unsupported'), 'the profile patch is held to the same shape')
})

test('Node code-loading or resolution modifiers refuse, in the bundle and in the launcher; an empty one is none', () => {
  assertNoLaunchModifiers([], { NODE_OPTIONS: '', PATH: '/bin' })
  assert.throws(() => assertNoLaunchModifiers(['--import', 'x.mjs'], {}), unverifiable('launch_modifier'))
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_PRESERVE_SYMLINKS', 'NODE_PRESERVE_SYMLINKS_MAIN']) {
    assert.throws(() => assertNoLaunchModifiers([], { [name]: '1' }), unverifiable('launch_modifier'), name)
  }
  const bin = join(dir({ [DSH_ENTRY]: 'dsh' }), DSH_ENTRY)
  assert.throws(() => loadedClosureInputs(['node', bin, '--profile', 'sophia-runtime'], ['--require', 'x.cjs'], {}, '/b', 'b.tgz',
    { node: 'v24.21.0', platform: 'darwin', arch: 'arm64' }), unverifiable('launch_modifier'))
  assert.throws(() => launchRuntime({ unit: { id: 'u', dsh: { profile: 'sophia-runtime' } }, runtimeDir: '/r', layout: {}, extraEnv: { NODE_OPTIONS: '--import=x.mjs' } }),
    (error) => error.message === 'launchRuntime: a Node code-loading or resolution modifier is not a supported launch')
})
