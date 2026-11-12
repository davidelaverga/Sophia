// Native14 (NATIVE13-F01; docs/plans/owner-host-transport.md): the owner-host CLI writes its capability whole and
// flushed before it says so, and a failed initialization never blocks an ordinary retry.
// Every run is the real CLI in a bounded child process, with a FAKE, unregistered configuration in an owned private
// temporary directory: a loopback URL nothing listens on, a fake token, nothing sent anywhere. Faults are injected
// only inside the child, by a test preload that patches the capability's own descriptor. No assertion holds secret
// bytes: a capability is described by its length, mode and shape alone.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, describe, it } from 'node:test'

const ROOT = resolve(import.meta.dirname, '../..')
const CLI = join(ROOT, 'scripts/owner-host.ts')
const base = mkdtempSync(join(tmpdir(), 'owner-host-cli-'))
after(() => rmSync(base, { recursive: true, force: true }))

/**
 * TEST-ONLY preload, loaded by the child with --import. It patches writeSync, fsyncSync and closeSync for the
 * capability's descriptor alone (and fsyncSync for its directory), resynchronizes the ESM imports, and traces the
 * calls. Write steps: a number writes that many bytes for real; 'zero', 'negative', 'fraction' and 'over' report
 * impossible progress; 'throw' fails with EIO; 'replace' and 'symlink' put a foreign file or a link at the path, then
 * fail with EIO. Repair 1 adds: `fstat` ('throw', 'replace', 'symlink') fails the identity read of the capability's
 * descriptor with an error whose message carries a private marker and the path; `lstat` and `unlink` ('throw') fail
 * those calls on the capability's path; `close` may name the error code a failing close throws.
 */
const PRELOAD = join(base, 'fault-preload.mjs')
writeFileSync(
  PRELOAD,
  `import fs from 'node:fs'
import { dirname } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
const spec = JSON.parse(process.env.OWNER_HOST_TEST_FAULT || '{}')
const target = process.env.OWNER_HOST_TEST_CAPABILITY
const tracePath = process.env.OWNER_HOST_TEST_TRACE
const real = { openSync: fs.openSync, writeSync: fs.writeSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync, symlinkSync: fs.symlinkSync, fstatSync: fs.fstatSync, lstatSync: fs.lstatSync, unlinkSync: fs.unlinkSync }
const trace = { writes: 0, flushes: 0, dirFlushes: 0, closes: 0, hits: 0 }
const failing = (code, call) => Object.assign(new Error(code + ': PRIVATE-DIAGNOSTIC-MARKER, ' + call + " '" + target + "'"), { code })
const steps = [...(spec.writes || [])]
let capFd = -1
let dirFd = -1
const eio = () => Object.assign(new Error('EIO: i/o error, injected by the test'), { code: 'EIO' })
const foreign = (link) => {
  real.renameSync(target, target + '.moved')
  if (link) real.symlinkSync(target + '.moved', target)
  else {
    const f = real.openSync(target, 'wx', 0o600)
    real.writeSync(f, 'FOREIGN\\n')
    real.closeSync(f)
  }
}
fs.openSync = (path, ...rest) => {
  const fd = real.openSync(path, ...rest)
  if (path === target) capFd = fd
  else if (path === dirname(target)) dirFd = fd
  return fd
}
fs.writeSync = (fd, data, a, b, c) => {
  if (fd !== capFd) return real.writeSync(fd, data, a, b, c)
  trace.writes += 1
  const text = typeof data === 'string'
  const view = text ? Buffer.from(data, 'utf8') : data
  const offset = !text && typeof a === 'number' ? a : 0
  const length = !text && typeof b === 'number' ? b : view.length - offset
  const at = text ? a : c
  const position = typeof at === 'number' ? at : null
  const bytes = Buffer.from(view.subarray(offset, offset + length))
  const step = steps.shift()
  if (step === undefined) return real.writeSync(fd, bytes, 0, bytes.length, position)
  trace.hits += 1
  if (step === 'throw') throw eio()
  if (step === 'replace' || step === 'symlink') {
    foreign(step === 'symlink')
    throw eio()
  }
  if (typeof step === 'number') return real.writeSync(fd, bytes, 0, step, position)
  if (step === 'over') return real.writeSync(fd, bytes, 0, bytes.length, position) + 1
  return { zero: 0, negative: -1, fraction: 0.5 }[step]
}
fs.fsyncSync = (fd) => {
  if (fd === capFd) {
    trace.flushes += 1
    if (spec.fsync === 'throw') {
      trace.hits += 1
      throw eio()
    }
  } else if (fd === dirFd) {
    trace.dirFlushes += 1
    if (spec.dirFsync === 'throw') {
      trace.hits += 1
      throw eio()
    }
  }
  return real.fsyncSync(fd)
}
fs.closeSync = (fd) => {
  if (fd !== capFd) return real.closeSync(fd)
  trace.closes += 1
  capFd = -1
  real.closeSync(fd)
  if (spec.close === 'throw') {
    trace.hits += 1
    throw eio()
  }
  if (typeof spec.close === 'string') {
    trace.hits += 1
    throw failing(spec.close, 'close')
  }
}
fs.fstatSync = (fd, ...rest) => {
  if (fd !== capFd || !spec.fstat) return real.fstatSync(fd, ...rest)
  trace.hits += 1
  if (spec.fstat === 'replace' || spec.fstat === 'symlink') foreign(spec.fstat === 'symlink')
  throw failing('EIO', 'fstat')
}
fs.lstatSync = (path, ...rest) => {
  if (path !== target || spec.lstat !== 'throw') return real.lstatSync(path, ...rest)
  trace.hits += 1
  throw failing('EACCES', 'lstat')
}
fs.unlinkSync = (path) => {
  if (path !== target || spec.unlink !== 'throw') return real.unlinkSync(path)
  trace.hits += 1
  throw failing('EPERM', 'unlink')
}
syncBuiltinESMExports()
process.on('exit', () => {
  const f = real.openSync(tracePath, 'w', 0o600)
  real.writeSync(f, JSON.stringify(trace))
  real.closeSync(f)
})
`,
)

let runs = 0
/** A fake host: its private directory, a fake token, and a configuration naming only files inside it. */
function host(name) {
  const dir = join(base, name)
  mkdirSync(dir, { mode: 0o700 })
  const tokenFile = join(dir, 't3-token')
  writeFileSync(tokenFile, 'fake-token-not-a-credential\n', { mode: 0o600 })
  const cap = join(dir, 'capability')
  const config = join(dir, 'owner-host.json')
  writeFileSync(
    config,
    JSON.stringify({
      t3Url: 'http://127.0.0.1:1/mcp',
      environmentRef: 'env-fake',
      t3Namespace: 'client:fake-session',
      adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
      profileId: 'read-only-v1',
      profileRevision: 1,
      accountKey: 'fake:acct-unregistered',
      tokenFile,
      capabilityFile: cap,
      journalFile: join(dir, 'journal', 'journal.jsonl'),
    }),
    { mode: 0o600 },
  )
  return { dir, cap, config }
}

/** One bounded run of the real CLI, with the preload and the given fault. */
function cli(h, command, fault = {}) {
  const trace = join(h.dir, `trace-${(runs += 1)}.json`)
  const r = spawnSync(process.execPath, ['--import', PRELOAD, CLI, command, '--config', h.config], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    killSignal: 'SIGKILL',
    env: {
      PATH: process.env.PATH ?? '',
      OWNER_HOST_TEST_FAULT: JSON.stringify(fault),
      OWNER_HOST_TEST_CAPABILITY: h.cap,
      OWNER_HOST_TEST_TRACE: trace,
    },
  })
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    trace: existsSync(trace) ? JSON.parse(readFileSync(trace, 'utf8')) : null,
  }
}

const CAPABILITY = /^[A-Za-z0-9_-]{43}\n$/
/** The capability path, described without its value. */
function fileOf(path) {
  let st
  try {
    st = lstatSync(path)
  } catch {
    return 'absent'
  }
  if (st.isSymbolicLink()) return 'symbolic link'
  const text = readFileSync(path, 'utf8')
  return {
    bytes: st.size,
    mode: (st.mode & 0o777).toString(8),
    shape: CAPABILITY.test(text) ? 'capability' : text === 'FOREIGN\n' ? 'foreign' : 'malformed',
  }
}
const WRITTEN = 'owner-host: capability written (its value is not shown)'
const said = (r) => {
  const lines = `${r.stdout}${r.stderr}`
  if (lines.includes(WRITTEN)) return 'written'
  if (/the incomplete file was removed; run capability again/.test(lines)) return 'removed: run again'
  if (/the path no longer names the file this run created; it was left in place/.test(lines)) return 'left in place'
  if (/its identity could not be read, so the path was left in place unverified/.test(lines)) return 'left unverified'
  if (/the path could not be inspected \(E[A-Z]+\), so it was left in place/.test(lines)) return 'not inspected'
  if (/could not be removed \(E[A-Z]+\); remove it, then run capability again/.test(lines)) return 'own: remove it'
  if (/written and flushed, but closing it failed/.test(lines)) return 'kept: close failed'
  if (/written and flushed, but its directory was not synced/.test(lines)) return 'kept: directory not synced'
  if (/capabilityFile exists: a capability is never replaced/.test(lines)) return 'refused: exists'
  return 'other'
}
/** No run ever printed the capability that ends up on disk. */
function neverPrinted(h, results) {
  const st = fileOf(h.cap)
  if (typeof st !== 'object' || st.shape !== 'capability') return true
  const value = readFileSync(h.cap, 'utf8').trim()
  return results.every((r) => !r.stdout.includes(value) && !r.stderr.includes(value))
}
const VALID = { bytes: 44, mode: '600', shape: 'capability' }

/** Make under a fault, then check, then make again, then check again. */
function attempt(name, fault) {
  const h = host(name)
  const make = cli(h, 'capability', fault)
  const afterMake = fileOf(h.cap)
  const check = cli(h, 'check')
  const retry = cli(h, 'capability')
  const afterRetry = fileOf(h.cap)
  const recheck = cli(h, 'check')
  return {
    h,
    seen: {
      make: { exit: make.status, signal: make.signal, said: said(make) },
      hits: make.trace?.hits ?? null,
      afterMake,
      check: check.status,
      retry: { exit: retry.status, said: said(retry) },
      afterRetry,
      recheck: recheck.status,
      neverPrinted: neverPrinted(h, [make, check, retry, recheck]),
    },
    make,
  }
}
/** What a failed initialization must leave: nothing announced, nothing blocking, an ordinary retry that works. */
const failedThenRetried = (hits) => ({
  make: { exit: 1, signal: null, said: 'removed: run again' },
  hits,
  afterMake: 'absent',
  check: 1,
  retry: { exit: 0, said: 'written' },
  afterRetry: VALID,
  recheck: 0,
  neverPrinted: true,
})

describe('a capability is written whole and flushed before the CLI says so (Native14, NATIVE13-F01)', () => {
  it('writes 44 bytes, 0600, a well-formed capability, flushes the file and its directory, and never replaces it', () => {
    const { seen, make } = attempt('normal', {})
    assert.deepEqual(seen, {
      make: { exit: 0, signal: null, said: 'written' },
      hits: 0,
      afterMake: VALID,
      check: 0,
      retry: { exit: 1, said: 'refused: exists' },
      afterRetry: VALID,
      recheck: 0,
      neverPrinted: true,
    })
    assert.deepEqual(make.trace, { writes: 1, flushes: 1, dirFlushes: 1, closes: 1, hits: 0 })
  })

  it('completes the exact bytes after tiny positive short writes (1, then 7, then the rest)', () => {
    const { seen, make } = attempt('short', { writes: [1, 7] })
    assert.deepEqual(seen, {
      make: { exit: 0, signal: null, said: 'written' },
      hits: 2,
      afterMake: VALID,
      check: 0,
      retry: { exit: 1, said: 'refused: exists' },
      afterRetry: VALID,
      recheck: 0,
      neverPrinted: true,
    })
    assert.deepEqual(make.trace, { writes: 3, flushes: 1, dirFlushes: 1, closes: 1, hits: 2 })
  })

  for (const step of ['zero', 'negative', 'fraction', 'over']) {
    it(`refuses ${step} progress at once, removes its own incomplete file, and lets an ordinary retry succeed`, () => {
      const { seen, make } = attempt(`progress-${step}`, { writes: [step] })
      assert.deepEqual(seen, failedThenRetried(1))
      assert.match(make.stderr, /capability not written \(no valid progress\)/)
    })
  }

  it('fails on a prefix then EIO: nothing announced, its own file removed, a retry succeeds', () => {
    const { seen, make } = attempt('prefix-eio', { writes: [7, 'throw'] })
    assert.deepEqual(seen, failedThenRetried(2))
    assert.match(make.stderr, /capability not written \(EIO\)/)
  })

  it('fails on a file fsync error: nothing announced, its own file removed, a retry succeeds', () => {
    const { seen, make } = attempt('fsync-eio', { fsync: 'throw' })
    assert.deepEqual(seen, failedThenRetried(1))
    assert.equal(make.trace?.flushes, 1, 'the flush was really attempted')
  })

  it('keeps a complete, flushed capability when closing it fails, and says so without "written"', () => {
    const { seen } = attempt('close-eio', { close: 'throw' })
    assert.deepEqual(seen, {
      make: { exit: 1, signal: null, said: 'kept: close failed' },
      hits: 1,
      afterMake: VALID,
      check: 0,
      retry: { exit: 1, said: 'refused: exists' },
      afterRetry: VALID,
      recheck: 0,
      neverPrinted: true,
    })
  })

  it('keeps a complete, flushed capability when its directory cannot be synced, and says so without "written"', () => {
    const { seen } = attempt('dir-eio', { dirFsync: 'throw' })
    assert.deepEqual(seen, {
      make: { exit: 1, signal: null, said: 'kept: directory not synced' },
      hits: 1,
      afterMake: VALID,
      check: 0,
      retry: { exit: 1, said: 'refused: exists' },
      afterRetry: VALID,
      recheck: 0,
      neverPrinted: true,
    })
  })
})

describe('a capability path it did not create is never removed or replaced (Native14, NATIVE13-F01)', () => {
  for (const [name, content, shape] of [
    ['a valid capability', `${randomBytes(32).toString('base64url')}\n`, 'capability'],
    ['a malformed file', 'not a capability\n', 'malformed'],
    ['a foreign file', 'FOREIGN\n', 'foreign'],
  ]) {
    it(`refuses an existing ${name} and keeps it byte for byte (control)`, () => {
      const h = host(`existing-${shape}`)
      writeFileSync(h.cap, content, { mode: 0o600 })
      const before = readFileSync(h.cap)
      const r = cli(h, 'capability')
      assert.deepEqual({ exit: r.status, said: said(r) }, { exit: 1, said: 'refused: exists' })
      assert.deepEqual(readFileSync(h.cap), before)
    })
  }

  for (const step of ['replace', 'symlink']) {
    it(`leaves a ${step === 'replace' ? 'replacement file' : 'symbolic link'} put at the path during a failed write`, () => {
      const h = host(`during-${step}`)
      const r = cli(h, 'capability', { writes: [step] })
      assert.deepEqual(
        { exit: r.status, said: said(r), hits: r.trace?.hits, at: fileOf(h.cap), moved: existsSync(`${h.cap}.moved`) },
        {
          exit: 1,
          said: 'left in place',
          hits: 1,
          at: step === 'replace' ? { bytes: 8, mode: '600', shape: 'foreign' } : 'symbolic link',
          moved: true,
        },
      )
      assert.equal(statSync(h.dir).mode & 0o777, 0o700)
    })
  }
})

describe('the whole initialization is guarded, and an unverified path is never deleted (Native14 repair 1, NATIVE14-F01)', () => {
  /** Whether a run printed the injected private marker, the private directory or a stack. */
  const leaked = (h, r) => ({
    marker: `${r.stdout}${r.stderr}`.includes('PRIVATE-DIAGNOSTIC-MARKER'),
    path: `${r.stdout}${r.stderr}`.includes(h.dir),
    stack: /\n\s+at /.test(r.stderr),
  })
  const NONE = { marker: false, path: false, stack: false }

  it('fails an identity read before any write: no success, nothing leaked, the descriptor closed, the path left unverified', () => {
    const h = host('identity-eio')
    const r = cli(h, 'capability', { fstat: 'throw' })
    const check = cli(h, 'check')
    const retry = cli(h, 'capability')
    assert.deepEqual(
      {
        exit: r.status,
        said: said(r),
        leaked: leaked(h, r),
        code: /\(EIO\)/.test(r.stderr),
        removalAdvised: /remove it/.test(r.stderr),
        trace: r.trace,
        at: fileOf(h.cap),
        check: check.status,
        retry: { exit: retry.status, said: said(retry) },
      },
      {
        exit: 1,
        said: 'left unverified',
        leaked: NONE,
        code: true,
        removalAdvised: false,
        trace: { writes: 0, flushes: 0, dirFlushes: 0, closes: 1, hits: 1 },
        at: { bytes: 0, mode: '600', shape: 'malformed' },
        check: 1,
        retry: { exit: 1, said: 'refused: exists' },
      },
    )
  })

  for (const step of ['replace', 'symlink']) {
    it(`keeps a ${step === 'replace' ? 'replacement file' : 'symbolic link'} put at the path before a failed identity read`, () => {
      const h = host(`identity-${step}`)
      const r = cli(h, 'capability', { fstat: step })
      assert.deepEqual(
        {
          exit: r.status,
          said: said(r),
          leaked: leaked(h, r),
          closes: r.trace?.closes,
          at: fileOf(h.cap),
          moved: existsSync(`${h.cap}.moved`),
        },
        {
          exit: 1,
          said: 'left unverified',
          leaked: NONE,
          closes: 1,
          at: step === 'replace' ? { bytes: 8, mode: '600', shape: 'foreign' } : 'symbolic link',
          moved: true,
        },
      )
    })
  }

  it('reports the original error when closing also fails: the close error never replaces it', () => {
    const h = host('identity-close')
    const r = cli(h, 'capability', { fstat: 'throw', close: 'EBADF' })
    assert.deepEqual(
      {
        exit: r.status,
        said: said(r),
        leaked: leaked(h, r),
        original: /\(EIO\)/.test(r.stderr),
        secondary: /EBADF/.test(r.stderr),
        hits: r.trace?.hits,
        closes: r.trace?.closes,
      },
      { exit: 1, said: 'left unverified', leaked: NONE, original: true, secondary: false, hits: 2, closes: 1 },
    )
  })

  it('leaves a path it cannot inspect in place, without advising its removal', () => {
    const h = host('cleanup-lstat')
    const r = cli(h, 'capability', { writes: ['zero'], lstat: 'throw' })
    assert.deepEqual(
      {
        exit: r.status,
        said: said(r),
        leaked: leaked(h, r),
        removalAdvised: /remove it/.test(r.stderr),
        hits: r.trace?.hits,
        at: fileOf(h.cap),
      },
      {
        exit: 1,
        said: 'not inspected',
        leaked: NONE,
        removalAdvised: false,
        hits: 2,
        at: { bytes: 0, mode: '600', shape: 'malformed' },
      },
    )
  })

  it('keeps the removal advice only for its own file whose unlink failed (control)', () => {
    const h = host('cleanup-unlink')
    const r = cli(h, 'capability', { writes: ['zero'], unlink: 'throw' })
    assert.deepEqual(
      { exit: r.status, said: said(r), leaked: leaked(h, r), hits: r.trace?.hits, at: fileOf(h.cap) },
      {
        exit: 1,
        said: 'own: remove it',
        leaked: NONE,
        hits: 2,
        at: { bytes: 0, mode: '600', shape: 'malformed' },
      },
    )
  })
})
