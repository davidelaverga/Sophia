/** CON supervisor lifecycle with owned inert runtime/helpers. No provider or physical settlement proof. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RuntimeSupervisor } from '../../apps/execution-host/dist/runtime-supervisor.js'

const digest = 'sophia-reply-tree-v1:sha256:' + 'a'.repeat(64)
const helper = `import json, os, pathlib, sys, time
p=pathlib.Path(__file__)
c=json.loads(p.with_suffix('.json').read_text())
kind=sys.argv[1]
with p.with_suffix('.log').open('a') as out: out.write(json.dumps({'kind':kind,'argv':sys.argv[1:],'env':dict(os.environ),'pid':os.getpid()})+'\\n')
mode=c['mode']
if mode==kind+'_fail': sys.exit(74)
if mode==kind+'_signal': os.kill(os.getpid(),9)
if mode==kind+'_overflow': print('x'*70000); sys.exit(0)
if mode==kind+'_timeout': time.sleep(30)
if mode=='probe_add_root' and kind=='probe': pathlib.Path(c['parent'],'gen-added').mkdir(mode=0o700)
if kind=='sweep' and mode=='sweep_replace_admit':
 root=pathlib.Path(os.environ['SOPHIA_REPLY_ROOT']); (root/'.admit').rename(root/'.admit-old'); (root/'.admit').touch(mode=0o600)
if kind=='digest': print(c['digest']+('extra' if mode=='digest_bad' else ''))
if kind=='sweep' and mode=='sweep_replace_root':
 root=pathlib.Path(os.environ['SOPHIA_REPLY_ROOT']); root.rename(root.with_name('sealed-replaced')); root.mkdir(mode=0o700)
`
function configure(f, mode) { writeFileSync(f.config, JSON.stringify({ mode, digest, parent: join(f.root, 'replies') })) }
function records(f) { return existsSync(f.log) ? readFileSync(f.log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [] }
function generation(f, name) {
  const root = join(f.root, 'replies', name)
  mkdirSync(root, { recursive: true, mode: 0o700 }); writeFileSync(join(root, '.admit'), '', { mode: 0o600 })
  return root
}
function replyEnv(s) { return Object.fromEntries(Object.entries(s.environment()).filter(([key]) => key.startsWith('SOPHIA_REPLY_'))) }
async function waitFor(read, predicate) {
  const deadline = performance.now() + 5000
  while (performance.now() < deadline) {
    const result = read(); if (predicate(result)) return result
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.fail('owned fixture condition did not settle in five seconds')
}
function fixture(t, overrides = {}) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'con-reply-supervisor-')))
  const root = join(scratch, 'project'), launcher = join(scratch, 'helper.py')
  mkdirSync(root, { mode: 0o700 }); writeFileSync(launcher, helper)
  writeFileSync(join(scratch, 'inert.mjs'), "console.log('[sophia-control-bridge] readiness=ready');process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)")
  const f = { scratch, root, launcher, config: join(scratch, 'helper.json'), log: join(scratch, 'helper.log'), supervisors: [] }
  configure(f, 'ok')
  f.options = { projectRoot: root, unit: { id: 'synthetic', profile: 'synthetic', runtimeDir: scratch, launcherEntry: 'inert.mjs' },
    bridge: { url: 'http://127.0.0.1:9', token: 'synthetic-must-not-reach-helper' }, readyTimeoutMs: 2000, stopTimeoutMs: 100,
    replies: { launcher, python: '/usr/bin/python3', template: join(scratch, 'template'), profileName: 'synthetic', templateDigest: digest }, ...overrides }
  f.make = extra => { const s = new RuntimeSupervisor({ ...f.options, ...extra }); f.supervisors.push(s); return s }
  t.after(async () => {
    for (const s of f.supervisors) { const pid = s.pid; await s.stop(); if (pid) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }) }
    rmSync(scratch, { recursive: true, force: true }); assert.equal(existsSync(scratch), false)
  })
  return f
}

test('reply supervisor seals before each launch and stop sweeps without sealing or exposing credentials', async t => {
  const f = fixture(t), old = generation(f, 'gen-old'), original = lstatSync(old), s = f.make()
  await s.start()
  const env = replyEnv(s), first = env.SOPHIA_REPLY_ROOT
  assert.equal(s.state, 'ready'); assert.equal(existsSync(old), false)
  assert.equal(lstatSync(join(f.root, 'replies', 'sealed-old')).ino, original.ino)
  assert.equal(lstatSync(first).mode & 0o777, 0o700)
  assert.equal(lstatSync(join(first, '.admit')).mode & 0o777, 0o600)
  assert.equal(lstatSync(join(first, '.admit')).size, 0)
  assert.equal(Object.keys(env).length, 10); assert.deepEqual(replyEnv(s), env)
  assert.deepEqual(records(f).map(r => r.kind), ['probe', 'digest', 'sweep'])
  for (const row of records(f)) for (const key of ['HOME', 'DSH_HOME', 'SOPHIA_BRIDGE_TOKEN', 'SOPHIA_BRIDGE_URL']) assert.equal(key in row.env, false)
  await s.stop()
  assert.equal(existsSync(first), true); assert.deepEqual(replyEnv(s), {})
  assert.deepEqual(records(f).map(r => r.kind), ['probe', 'digest', 'sweep', 'probe', 'digest', 'sweep'])
  await s.start()
  const second = replyEnv(s).SOPHIA_REPLY_ROOT
  assert.notEqual(second, first); assert.equal(existsSync(first), false)
  assert.equal(existsSync(join(dirname(first), 'sealed-' + first.split('/').at(-1).slice(4))), true)
})

test('reply supervisor strips all reserved injection names and freezes configuration', async t => {
  const f = fixture(t), extraEnv = { SOPHIA_REPLY_ROOT: '/redirect', SOPHIA_REPLY_UNKNOWN: 'no', KEEP_GOAL: 'yes' }
  for (const replies of [undefined, { ...f.options.replies, maxChildren: 3 }, { ...f.options.replies, deadlineMs: 1 }]) {
    const s = f.make({ replies, extraEnv }); await s.start()
    assert.deepEqual(replyEnv(s), {}); assert.equal(s.environment().KEEP_GOAL, 'yes'); await s.stop()
  }
  const options = { ...f.options.replies }, s = f.make({ replies: options, extraEnv })
  options.launcher = '/changed'; options.templateDigest = 'changed'
  await s.start(); assert.equal(replyEnv(s).SOPHIA_REPLY_LAUNCHER, f.launcher)
  assert.equal(replyEnv(s).SOPHIA_REPLY_UNKNOWN, undefined)
})

test('reply supervisor failures disable only CON and preserve goal readiness', async t => {
  for (const mode of ['probe_fail', 'digest_fail', 'sweep_fail', 'digest_bad', 'probe_signal', 'probe_overflow', 'sweep_replace_root', 'sweep_replace_admit', 'probe_add_root']) {
    const f = fixture(t); configure(f, mode); const s = f.make(); await s.start()
    assert.equal(s.state, 'ready', mode); assert.deepEqual(replyEnv(s), {}, mode)
    assert.equal(s.log.includes('sophia-reply-tree'), false)
    await s.stop()
  }
  const f = fixture(t), s = f.make({ replies: { ...f.options.replies, python: '/nonexistent-con01-python' } })
  await s.start(); assert.equal(s.state, 'ready'); assert.deepEqual(replyEnv(s), {})
})

test('reply supervisor refuses collisions, links, wrong modes and full inventory without overwriting homes', async t => {
  for (const mode of ['collision', 'link', 'mode', 'full']) {
    const f = fixture(t), old = generation(f, 'gen-old')
    writeFileSync(join(old, 'retained'), 'synthetic-governed-record')
    if (mode === 'collision') generation(f, 'sealed-old')
    if (mode === 'link') symlinkSync(old, join(f.root, 'replies', 'gen-link'))
    if (mode === 'mode') chmodSync(old, 0o755)
    if (mode === 'full') for (let i = 0; i < 255; i++) generation(f, 'sealed-' + i)
    const s = f.make(); await s.start()
    assert.deepEqual(replyEnv(s), {}, mode)
    assert.equal(readFileSync(join(old, 'retained'), 'utf8'), 'synthetic-governed-record')
    assert.equal(records(f).length, 0)
  }
})

test('reply supervisor crash recovery makes a new generation; an old unleased stop cannot touch replacement', async t => {
  const f = fixture(t), events = [], s = f.make({ onEvent: e => events.push(e) })
  await s.start(); const first = replyEnv(s).SOPHIA_REPLY_ROOT, pid = s.pid
  process.kill(pid, 'SIGKILL')
  await waitFor(() => events, rows => rows.filter(row => row.type === 'state' && row.state === 'ready').length === 2)
  const second = replyEnv(s).SOPHIA_REPLY_ROOT
  assert.notEqual(second, first); assert.equal(existsSync(first), false)
  await s.stop()
  const replacement = f.make(); await replacement.start()
  const before = records(f).length, names = readdirSync(join(f.root, 'replies'))
  await s.stop()
  assert.equal(records(f).length, before); assert.deepEqual(readdirSync(join(f.root, 'replies')), names)
  assert.equal(replacement.state, 'ready')
})

test('actual unqualified launcher probe refuses CON without disturbing inert goal runtime', async t => {
  const f = fixture(t), s = f.make({ replies: { ...f.options.replies,
    launcher: fileURLToPath(new URL('../../apps/execution-host/reply/reply-launch.py', import.meta.url)) } })
  await s.start(); assert.equal(s.state, 'ready'); assert.deepEqual(replyEnv(s), {})
  assert.equal(readdirSync(join(f.root, 'replies')).length, 0)
})

test('reply supervisor helper timeout reaps only its owned helper and still starts the inert goal', async t => {
  const f = fixture(t); configure(f, 'probe_timeout'); const s = f.make()
  await s.start()
  assert.equal(s.state, 'ready'); assert.deepEqual(replyEnv(s), {})
  const helperPid = records(f)[0].pid
  assert.throws(() => process.kill(helperPid, 0), { code: 'ESRCH' })
  configure(f, 'ok')
})

test('reply supervisor refuses a replaced admission before a stop sweep and preserves partial seals', async t => {
  const f = fixture(t), s = f.make(); await s.start()
  const root = replyEnv(s).SOPHIA_REPLY_ROOT
  fs.renameSync(join(root, '.admit'), join(root, '.admit-old'))
  writeFileSync(join(root, '.admit'), '', { mode: 0o600 })
  const count = records(f).filter(row => row.kind === 'sweep').length
  await s.stop()
  assert.equal(records(f).filter(row => row.kind === 'sweep').length, count)
  const g = fixture(t); generation(g, 'gen-a'); generation(g, 'gen-b')
  const rename = fs.renameSync
  fs.renameSync = (from, to) => { if (from === join(g.root, 'replies', 'gen-b')) throw new Error('synthetic rename failure'); return rename(from, to) }
  syncBuiltinESMExports()
  try {
    const other = g.make(); await other.start(); assert.deepEqual(replyEnv(other), {})
    assert.equal(existsSync(join(g.root, 'replies', 'sealed-a')), true)
    assert.equal(existsSync(join(g.root, 'replies', 'gen-a')), false)
    assert.equal(existsSync(join(g.root, 'replies', 'gen-b')), true)
  } finally { fs.renameSync = rename; syncBuiltinESMExports() }
})

test('reply supervisor rejects parent links and fsync failures without exposing a generation', async t => {
  const f = fixture(t), outside = join(f.scratch, 'outside')
  mkdirSync(outside, { mode: 0o700 }); symlinkSync(outside, join(f.root, 'replies'))
  const s = f.make(); await s.start(); assert.deepEqual(replyEnv(s), {}); assert.deepEqual(readdirSync(outside), [])
  const g = fixture(t); generation(g, 'gen-old'); const sync = fs.fsyncSync
  fs.fsyncSync = () => { throw new Error('synthetic fsync failure') }; syncBuiltinESMExports()
  try {
    const other = g.make(); await other.start(); assert.equal(other.state, 'ready'); assert.deepEqual(replyEnv(other), {})
    assert.equal(existsSync(join(g.root, 'replies', 'sealed-old')), true)
  } finally { fs.fsyncSync = sync; syncBuiltinESMExports() }
})

test('reply supervisor reserves exactly one inventory slot and strips credential-prefix injection', async t => {
  const f = fixture(t)
  for (let i = 0; i < 255; i++) generation(f, 'sealed-' + i)
  process.env.SOPHIA_REPLY_TEST_CREDENTIAL = 'synthetic-no-pass'
  try {
    const s = f.make({ credentials: ['SOPHIA_REPLY_TEST_CREDENTIAL'] }); await s.start()
    assert.equal(readdirSync(join(f.root, 'replies')).length, 256)
    assert.equal(replyEnv(s).SOPHIA_REPLY_TEST_CREDENTIAL, undefined)
    assert.ok(replyEnv(s).SOPHIA_REPLY_ROOT)
    await s.stop(); await s.start()
    assert.deepEqual(replyEnv(s), {})
    assert.equal(readdirSync(join(f.root, 'replies')).length, 256)
  } finally { delete process.env.SOPHIA_REPLY_TEST_CREDENTIAL }
})

test('reply supervisor revalidates admission and parent identities at environment consumption, latching refusal', async t => {
  for (const kind of ['admit', 'parent', 'root']) {
    const f = fixture(t)
    const s = f.make({ onEvent: event => {
      if (event.type !== 'state' || event.state !== 'starting') return
      const parent = join(f.root, 'replies'), name = readdirSync(parent).find(x => x.startsWith('gen-'))
      const root = join(parent, name)
      if (kind === 'admit') {
        fs.renameSync(join(root, '.admit'), join(root, '.old'))
        writeFileSync(join(root, '.admit'), '', { mode: 0o600 })
      } else {
        const target = kind === 'parent' ? parent : root
        fs.renameSync(target, target + '-old'); mkdirSync(target, { mode: 0o700 })
        if (kind === 'parent') fs.renameSync(join(target + '-old', name), join(target, name))
        else writeFileSync(join(target, '.admit'), '', { mode: 0o600 })
      }
    } })
    await s.start(); assert.equal(s.state, 'ready'); assert.deepEqual(replyEnv(s), {}, kind)
    assert.deepEqual(replyEnv(s), {}, 'refusal stays latched')
  }
})

test('reply supervisor clears reply projection after failed startup and exhausted restart lease', async t => {
  const f = fixture(t)
  writeFileSync(join(f.scratch, 'inert.mjs'), 'process.exit(2)')
  const s = f.make()
  await assert.rejects(s.start(), /runtime exited before ready/)
  assert.equal(s.state, 'failed'); assert.equal(existsSync(join(f.root, 'supervisor.lease')), false)
  assert.deepEqual(replyEnv(s), {}); await s.stop(); assert.deepEqual(replyEnv(s), {})
  const g = fixture(t), other = g.make({ maxRestarts: 0 })
  await other.start(); assert.ok(replyEnv(other).SOPHIA_REPLY_ROOT)
  process.kill(other.pid, 'SIGKILL')
  await waitFor(() => other.state, value => value === 'failed')
  assert.deepEqual(replyEnv(other), {})
})

test('reply supervisor refuses changed goal binding without changing existing goal configuration behavior', async t => {
  for (const field of ['launcherEntry', 'runtimeDir', 'id', 'profile', 'projectRoot']) {
    const f = fixture(t), unit = { ...f.options.unit }, options = { ...f.options, unit }
    const s = new RuntimeSupervisor(options); f.supervisors.push(s)
    if (field === 'launcherEntry') {
      fs.copyFileSync(join(f.scratch, 'inert.mjs'), join(f.scratch, 'other.mjs')); unit.launcherEntry = 'other.mjs'
    } else if (field === 'runtimeDir') {
      const dir = join(f.scratch, 'runtime-other'); mkdirSync(dir, { mode: 0o700 })
      fs.copyFileSync(join(f.scratch, 'inert.mjs'), join(dir, 'inert.mjs')); unit.runtimeDir = dir
    } else if (field === 'projectRoot') {
      options.projectRoot = join(f.scratch, 'project-other'); mkdirSync(options.projectRoot, { mode: 0o700 })
    } else unit[field] = 'changed'
    await s.start(); assert.equal(s.state, 'ready'); assert.deepEqual(replyEnv(s), {}, field)
    assert.equal(records(f).length, 0, 'changed binding starts no reply helper')
  }
})
