// WBC-02 (WBC-02-CX-0040): the home snapshot's scan, on real directories. Each file is read once: its size is the count
// of the bytes read and its digest their hash, and a growing file's prefix is hashed from the same bytes. The sentinel
// cases change a file between the moment its size is read and the moment its bytes are (CX-0040's race: a truncation
// between a count and a separate hash), through the scan's own seam, and the positive controls append, keep an empty
// file and run the actual scan command.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
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

describe('the home scan (WBC-02-CX-0040)', () => {
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
