// SMC-M03 CX-0005: one bundle archive identity and one profile lock for every platform. The same tar packed on Linux
// and on macOS differed only in the gzip header's OS byte; the build sets it to Unix, so the bytes match.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import { normalizeGzipOs, profileLockPath } from '../../scripts/lib/artifacts.mjs'
import { loadRuntimeUnit } from '../../scripts/lib/common.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

test('an archive packed with another OS byte is rewritten to the Unix one, and only that byte changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sophia-gzip-'))
  try {
    const unix = gzipSync(Buffer.from('package/dist/index.js'), { level: 9 })
    assert.equal(unix[9], 3, 'Linux writes 3')
    const mac = Buffer.from(unix)
    mac[9] = 0x13
    const file = join(dir, 'bundle.tgz')
    writeFileSync(file, mac)
    normalizeGzipOs(file)
    const after = readFileSync(file)
    assert.equal(sha256(after), sha256(unix), 'the Mac-packed archive becomes the Linux one')
    assert.deepEqual(gunzipSync(after), Buffer.from('package/dist/index.js'))
    normalizeGzipOs(file)
    assert.equal(sha256(readFileSync(file)), sha256(unix), 'idempotent')
    writeFileSync(file, Buffer.from('not a gzip archive at all'))
    assert.throws(() => normalizeGzipOs(file), /not a deflate gzip archive/)
    const named = Buffer.from(unix)
    named[3] = 0x08
    writeFileSync(file, named)
    assert.throws(() => normalizeGzipOs(file), /header flags 8/, 'a header with optional fields is not rewritten')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the unit records one bundle archive and the profile has one lock, whatever the platform', () => {
  const unit = loadRuntimeUnit()
  assert.equal(unit.sophia_bundle.archives_by_platform, undefined, 'no per-platform archive record')
  assert.match(profileLockPath(), /config\/dsh\/profile\/pnpm-lock\.yaml$/)
  const lock = readFileSync(profileLockPath(), 'utf8')
  assert.ok(lock.includes(unit.sophia_bundle.archive_integrity), 'the lock pins the recorded archive')
})
