// WBC-02 (WBC-02-CX-0040 and the review of 3db6ef9): the home snapshot's scan, on real directories. Each file is read once: its size is the count
// of the bytes read and its digest their hash, and a growing file's prefix is hashed from the same bytes. The sentinel
// cases change a file between the moment its size is read and the moment its bytes are (CX-0040's race: a truncation
// between a count and a separate hash), through the scan's own seam, and the positive controls append, keep an empty
// file and run the actual scan command.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compareSnapshots, coverageOf, EMPTY_SHA256, scan } from '../../scripts/paperclip-image-home.mjs'

const HOME_SCRIPT = fileURLToPath(new URL('../../scripts/paperclip-image-home.mjs', import.meta.url))
const LOG = 'instances/default/logs/server.log'
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})
/** A home like the container's: the adapter registry, an empty file, a name with a space, and a log 100 bytes long. */
function home() {
  const root = mkdtempSync(join(tmpdir(), 'pc-home-'))
  roots.push(root)
  mkdirSync(join(root, 'instances/default/logs'), { recursive: true })
  writeFileSync(join(root, 'adapter-plugins.json'), '{"adapters":[]}')
  writeFileSync(join(root, 'instances/default/empty.json'), '')
  writeFileSync(join(root, 'instances/default/a b.txt'), 'x')
  writeFileSync(join(root, LOG), 'l'.repeat(100))
  return root
}
const growingOf = (snapshot) => Object.fromEntries(snapshot.files.filter((f) => f.path === LOG).map((f) => [f.path, f.size]))
const entry = (snapshot, path) => snapshot.files.find((f) => f.path === path)

/** The scan checks each opened descriptor's path through /proc/self/fd, as the Linux scanner container does. */
const LINUX_ONLY = process.platform !== 'linux' && `the home scan reads /proc/self/fd: Linux only (here: ${process.platform})`

describe('the home scan (WBC-02-CX-0040)', { skip: LINUX_ONLY }, () => {
  it('positive control: every file read once, sizes and digests of the actual bytes, an empty file included, coverage complete', () => {
    const root = home()
    const snapshot = scan(root)
    assert.deepEqual(
      snapshot.files.map((f) => f.path),
      ['adapter-plugins.json', 'instances/default/a b.txt', 'instances/default/empty.json', LOG],
    )
    assert.deepEqual(entry(snapshot, 'adapter-plugins.json'), { path: 'adapter-plugins.json', size: 15, sha256: sha256('{"adapters":[]}') })
    assert.deepEqual(entry(snapshot, 'instances/default/empty.json'), { path: 'instances/default/empty.json', size: 0, sha256: EMPTY_SHA256 })
    assert.deepEqual(entry(snapshot, LOG), { path: LOG, size: 100, sha256: sha256('l'.repeat(100)) })
    assert.equal(coverageOf(snapshot).complete, true)
    assert.equal(compareSnapshots(snapshot.files, scan(root).files).persisted, true, 'nothing changed: persisted')
  })

  it('positive control: a log appended to between the snapshots keeps its bytes as its prefix, read with its entry', () => {
    const root = home()
    const before = scan(root)
    appendFileSync(join(root, LOG), 'more\n')
    const later = scan(root, { prefixOf: growingOf(before) })
    assert.deepEqual(later.prefixes[LOG], { size: 100, sha256: sha256('l'.repeat(100)) })
    const result = compareSnapshots(before.files, later.files, later.prefixes)
    assert.deepEqual(result.changedGrowing, [LOG])
    assert.deepEqual(result.rewrittenGrowing, [])
    assert.equal(result.persisted, true)
  })

  it('CX-0040 sentinel: a file truncated after its size was read and before its bytes were is unverified, never its old size with the empty digest', () => {
    const root = home()
    const snapshot = scan(root, { onOpened: (path) => path === LOG && truncateSync(join(root, LOG), 0) })
    assert.deepEqual(entry(snapshot, LOG), { path: LOG, size: null, sha256: null, short: { expected: 100, read: 0 } })
    const result = compareSnapshots(snapshot.files, scan(root).files)
    assert.equal(result.persisted, false)
    assert.deepEqual(result.unverified, [LOG])
    // Truncated part-way: the same.
    const partial = home()
    const cut = scan(partial, { onOpened: (path) => path === LOG && truncateSync(join(partial, LOG), 40) })
    assert.deepEqual(entry(cut, LOG).short, { expected: 100, read: 40 })
  })

  it('a file appended to after its size was read is described by exactly the bytes its size names', () => {
    const root = home()
    const snapshot = scan(root, { onOpened: (path) => path === LOG && appendFileSync(join(root, LOG), 'appended mid-scan\n') })
    assert.deepEqual(entry(snapshot, LOG), { path: LOG, size: 100, sha256: sha256('l'.repeat(100)) })
  })

  it('a truncation between the snapshots is a rewrite, not a growth', () => {
    const root = home()
    const before = scan(root)
    truncateSync(join(root, LOG), 0)
    const later = scan(root, { prefixOf: growingOf(before) })
    assert.deepEqual(entry(later, LOG), { path: LOG, size: 0, sha256: EMPTY_SHA256 })
    assert.equal(later.prefixes[LOG], undefined, 'no prefix of 100 bytes in a file of 0')
    const result = compareSnapshots(before.files, later.files, later.prefixes)
    assert.deepEqual(result.rewrittenGrowing, [LOG])
    assert.equal(result.persisted, false)
  })

  it('a log rewritten to a longer content is not a growth: its first bytes differ', () => {
    const root = home()
    const before = scan(root)
    writeFileSync(join(root, LOG), 'r'.repeat(150))
    const later = scan(root, { prefixOf: growingOf(before) })
    assert.deepEqual(compareSnapshots(before.files, later.files, later.prefixes).rewrittenGrowing, [LOG])
  })

  it('a read that fails is recorded as unverified; symbolic links are neither listed nor followed', () => {
    const root = home()
    symlinkSync('/etc/hostname', join(root, 'link'))
    const snapshot = scan(root, {
      onOpened: (path) => {
        if (path === 'instances/default/a b.txt') throw Object.assign(new Error('injected'), { code: 'EIO' })
      },
    })
    assert.equal(snapshot.coverage.total, 4, 'the link is not a regular file of the home')
    assert.deepEqual(entry(snapshot, 'instances/default/a b.txt'), { path: 'instances/default/a b.txt', size: null, sha256: null, error: 'EIO' })
    assert.deepEqual(compareSnapshots(snapshot.files, snapshot.files).unverified, ['instances/default/a b.txt'])
  })

  it('review of 3db6ef9: a directory swapped for a symbolic link after the listing is not followed out of the home', () => {
    const root = home()
    const outside = mkdtempSync(join(tmpdir(), 'pc-outside-'))
    roots.push(outside)
    writeFileSync(join(outside, 'server.log'), 'a file outside the home')
    const logs = join(root, 'instances/default/logs')
    const snapshot = scan(root, {
      onListed: () => {
        renameSync(logs, `${logs}.moved`)
        symlinkSync(outside, logs)
      },
    })
    assert.deepEqual(entry(snapshot, LOG), { path: LOG, size: null, sha256: null, error: 'ESCAPED' })
    assert.ok(!JSON.stringify(snapshot).includes(sha256('a file outside the home')), 'no digest of the outside file is recorded')
    assert.deepEqual(compareSnapshots(snapshot.files, snapshot.files).unverified, [LOG])
  })

  it('review of 3db6ef9: a file swapped for a FIFO after the listing does not hold the scan open', () => {
    const root = home()
    // In a child process with a deadline: a scan that blocked on the FIFO would otherwise hang this test.
    const program = [
      "import { spawnSync } from 'node:child_process'",
      "import { unlinkSync } from 'node:fs'",
      `const { scan } = await import(${JSON.stringify(pathToFileURL(HOME_SCRIPT).href)})`,
      `const target = ${JSON.stringify(join(root, LOG))}`,
      `const result = scan(${JSON.stringify(root)}, { onListed: () => { unlinkSync(target); spawnSync('mkfifo', [target]) } })`,
      `console.log(JSON.stringify(result.files.find((f) => f.path === ${JSON.stringify(LOG)})))`,
    ].join('\n')
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(run.signal, null, 'the scan finished within its deadline')
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(JSON.parse(run.stdout), { path: LOG, size: null, sha256: null, error: 'ENOTREG' })
    unlinkSync(join(root, LOG))
  })

  it('the bounds: a file too large to hash and the file count are reported as incomplete coverage', () => {
    const root = home()
    const large = scan(root, { maxFileBytes: 50 })
    assert.deepEqual(large.coverage.oversize, [{ path: LOG, size: 100 }])
    assert.equal(coverageOf(large).complete, false)
    assert.deepEqual(scan(root, { maxFileBytes: 100 }).coverage.oversize, [{ path: LOG, size: 100 }], 'a file of exactly the bound is too large')
    assert.deepEqual(scan(root, { maxFileBytes: 101 }).coverage.oversize, [], 'one byte under the bound is hashed')
    const capped = scan(root, { maxFiles: 2 })
    assert.equal(capped.files.length, 2)
    assert.equal(capped.coverage.total, 4)
    assert.equal(coverageOf(capped).complete, false)
    const missing = scan(join(root, 'nonexistent'))
    assert.deepEqual(missing.coverage.errors, [{ path: '.', error: 'ENOENT' }])
    assert.equal(coverageOf(missing).complete, false)
  })

  it('the scan command, as the snapshot runs it: the prefixes asked for on stdin, the JSON on stdout', () => {
    const root = home()
    const before = scan(root)
    appendFileSync(join(root, LOG), 'more\n')
    const run = spawnSync(process.execPath, [HOME_SCRIPT, 'scan', root], {
      input: JSON.stringify({ prefixOf: growingOf(before) }),
      encoding: 'utf8',
    })
    assert.equal(run.status, 0, run.stderr)
    const later = JSON.parse(run.stdout)
    assert.equal(coverageOf(later).complete, true)
    assert.equal(compareSnapshots(before.files, later.files, later.prefixes).persisted, true)
  })
})

/**
 * A stand-in for the docker calls the snapshot makes: it logs each call, answers the two inspects, and runs the scanner
 * command locally (the mounted script on the home directory) unless FAIL_RUN is set.
 */
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
  inspect)
    case "$3" in
      '{{json .Mounts}}') echo '[{"Type":"volume","Name":"pchome","Destination":"/paperclip"}]' ;;
      '{{.Image}}') echo sha256:${'c'.repeat(64)} ;;
      '{{.State.Running}}') echo "\${RUNNING:-true}" ;;
    esac ;;
  pause|unpause) echo "$2" ;;
  run)
    [ -n "$FAIL_RUN" ] && { echo 'scanner failed' >&2; exit 1; }
    for a in "$@"; do case "$a" in --volume=*:/opt/home-scan/scan.mjs:ro) s="\${a#--volume=}"; s="\${s%%:*}" ;; esac; done
    exec "$NODE" "$s" scan "$HOME_ROOT" ;;
esac
`

describe('the snapshot around the scan (review of 3db6ef9)', { skip: LINUX_ONLY }, () => {
  const snapshotWith = (root, extra = {}) => {
    const bin = mkdtempSync(join(tmpdir(), 'pc-docker-'))
    roots.push(bin)
    writeFileSync(join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 })
    const out = join(bin, 'snapshot.json')
    const log = join(bin, 'docker.log')
    const run = spawnSync(process.execPath, [HOME_SCRIPT, 'snapshot', 'pc', out], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NODE: process.execPath, HOME_ROOT: root, DOCKER_LOG: log, ...extra },
    })
    const calls = readFileSync(log, 'utf8').trim().split('\n')
    return { run, calls, out }
  }

  it('freezes the container, scans its volume read-only in a disposable container, then thaws it', () => {
    const root = home()
    const { run, calls, out } = snapshotWith(root)
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(
      calls.map((c) => c.split(' ')[0]),
      ['inspect', 'inspect', 'inspect', 'pause', 'run', 'unpause'],
    )
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).writer, 'paused', 'the record says the writer was paused for the scan')
    const scanner = calls[4].split(' ')
    for (const flag of ['--rm', '--network=none', '--read-only', '--cap-drop=ALL', '--cap-add=DAC_READ_SEARCH', '--security-opt=no-new-privileges', '--volume=pchome:/paperclip:ro'])
      assert.ok(scanner.includes(flag), flag)
    assert.ok(scanner.some((a) => /^--volume=.+:\/opt\/home-scan\/scan\.mjs:ro$/.test(a)), 'the scan script, read-only')
    assert.ok(!scanner.some((a) => a.startsWith('--env') || a.startsWith('-e')), 'no environment')
    assert.equal(coverageOf(JSON.parse(readFileSync(out, 'utf8'))).complete, true)
  })

  it('review of 2bad104: a container already stopped is scanned as it is, neither paused nor thawed, and the record says so', () => {
    const { run, calls, out } = snapshotWith(home(), { RUNNING: 'false' })
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(
      calls.map((c) => c.split(' ')[0]),
      ['inspect', 'inspect', 'inspect', 'run'],
    )
    const record = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(record.writer, 'stopped')
    assert.equal(coverageOf(record).complete, true)
  })

  it('thaws the container when the scan fails', () => {
    const { run, calls } = snapshotWith(home(), { FAIL_RUN: '1' })
    assert.notEqual(run.status, 0)
    assert.deepEqual(calls.map((c) => c.split(' ')[0]).slice(-2), ['run', 'unpause'])
  })
})

