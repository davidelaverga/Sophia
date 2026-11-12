/**
 * INC01-CC-004 S5c: the contribution runtime's custodian files (scripts/lib/contribution-custody.mjs) and the
 * launcher's checks before the root is touched (scripts/contribution-runtime-host.mjs prepareContributionLaunch).
 * Every key here is INVENTED and marked; the directories are fresh temporary ones. A "foreign owner" case runs under a
 * different EXPECTED uid only: no second real user exists here, so it is structural, not an actual foreign-UID test.
 * A file changing while it is read is guarded in source but not driven here (no deterministic interposition).
 * S5c r2: registration's caller fields are checked and canonical before anything is registered, and a record is
 * created completely and durably or removed; its I/O failures are driven through createBinding's injected calls.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import {
  BINDING_SCHEMA,
  CUSTODY_ROUTE,
  CustodyError,
  bindingFields,
  bindingRecord,
  canonicalUuid,
  createBinding,
  custodyFileName,
  parseBinding,
  parseCustody,
  readBinding,
  readCustodyKey,
  readPrivateFile,
  serviceOriginOf,
  writeBinding,
} from '../../scripts/lib/contribution-custody.mjs'
import { assertContributedRoute, prepareContributionLaunch } from '../../scripts/contribution-runtime-host.mjs'
import { loadRuntimeUnit } from '../../scripts/lib/common.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'sophia-s5c-custody-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
const unit = loadRuntimeUnit()
const KEY = `sk-s5c-invented-${randomBytes(12).toString('hex')}`
let n = 0
/** A fresh private (0700) directory under the scratch root. */
function privateDir() {
  const dir = join(scratch, `d${n++}`)
  mkdirSync(dir, { mode: 0o700 })
  return dir
}
const binding = (over = {}) => ({
  schema: BINDING_SCHEMA,
  projectId: randomUUID(),
  runtimeId: randomUUID(),
  resourceId: randomUUID(),
  connectionId: randomUUID(),
  credentialRevision: 1,
  runtimeUnitId: unit.id,
  routeId: CUSTODY_ROUTE.routeId,
  serviceOrigin: 'http://127.0.0.1:4321',
  capability: randomBytes(32).toString('base64url'),
  ...over,
})
const custodyText = (b, { key = KEY, connection = b.connectionId, revision = b.credentialRevision, route = b.routeId } = {}) =>
  `sophia-contribution-credential v1\nconnection ${connection}\nrevision ${revision}\nroute ${route}\nkey ${key}\n`
/** Write the custody file for a binding, 0600, unless `text`/`mode`/`name` says otherwise. */
function custody(dir, b, { text = custodyText(b), mode = 0o600, name = custodyFileName(b) } = {}) {
  const file = join(dir, name)
  writeFileSync(file, text, { mode })
  chmodSync(file, mode)
  return file
}
/** The refusal code of a call, or null when it succeeds; asserts no message carries the invented key. */
function code(fn) {
  try {
    fn()
    return null
  } catch (error) {
    assert.ok(error instanceof CustodyError, `a CustodyError, not ${error?.name}: ${error?.message}`)
    assert.ok(!String(error.message).includes(KEY), 'no refusal carries the key')
    assert.equal(error.message, `contribution custody refused: ${error.code}`)
    return error.code
  }
}

describe('the custody file', () => {
  test('returns the key for exactly its registration, from a private regular file', () => {
    const dir = privateDir()
    const b = binding()
    custody(dir, b)
    assert.equal(readCustodyKey({ custodyDir: dir, binding: b }), KEY)
    assert.match(custodyFileName(b), /^[0-9a-f-]{36}\.r1\.research-sol-medium-v1\.credential$/)
  })

  test('refuses a header for another connection, revision or route, or another version', () => {
    const b = binding()
    const bytes = (opts) => Buffer.from(custodyText(b, opts))
    assert.equal(code(() => parseCustody(bytes({ connection: randomUUID() }), b)), 'binding_mismatch')
    assert.equal(code(() => parseCustody(bytes({ revision: 2 }), b)), 'binding_mismatch')
    assert.equal(code(() => parseCustody(bytes({ route: 'default' }), b)), 'binding_mismatch')
    assert.equal(code(() => parseCustody(Buffer.from(custodyText(b).replace(' v1', ' v2')), b)), 'custody_invalid')
  })

  test('refuses any other shape: CR, NUL, extra or missing lines, blank or spaced keys, no final newline', () => {
    const b = binding()
    const good = custodyText(b)
    const cases = {
      crlf: good.replaceAll('\n', '\r\n'),
      nul: good.replace('key ', 'key \0'),
      extra: `${good}note x\n`,
      missing: good.replace(/route .*\n/, ''),
      reordered: good.replace(/(revision .*\n)(route .*\n)/, '$2$1'),
      trailing: good.replace(/\n$/, ''),
      tab: good.replace('key ', 'key\t'),
      utf8: good.replace('key ', 'key é'),
    }
    for (const [name, text] of Object.entries(cases)) assert.equal(code(() => parseCustody(Buffer.from(text), b)), 'custody_invalid', name)
    assert.equal(code(() => parseCustody(Buffer.from(custodyText(b, { key: '' })), b)), 'key_invalid', 'blank')
    assert.equal(code(() => parseCustody(Buffer.from(custodyText(b, { key: 'short' })), b)), 'key_invalid', 'too short')
    assert.equal(code(() => parseCustody(Buffer.from(custodyText(b, { key: `${KEY} more` })), b)), 'key_invalid', 'a space')
  })

  test('refuses a symlink, a FIFO, a socket, a directory, a hard link, an open mode, an oversize file and a missing one', async () => {
    const dir = privateDir()
    const b = binding()
    const name = custodyFileName(b)
    const other = privateDir()
    const target = custody(other, b)
    symlinkSync(target, join(dir, name))
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'symlink')
    rmSync(join(dir, name))
    execFileSync('mkfifo', ['-m', '600', join(dir, name)])
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'not_regular', 'a FIFO, opened without blocking')
    rmSync(join(dir, name))
    const server = createServer()
    await new Promise((resolve) => server.listen(join(dir, name), resolve))
    try {
      assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'not_regular', 'a socket')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
    rmSync(join(dir, name), { force: true })
    mkdirSync(join(dir, name), { mode: 0o700 })
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'not_regular', 'a directory')
    rmSync(join(dir, name), { recursive: true })
    const linked = custody(dir, b)
    linkSync(linked, join(dir, 'second-name'))
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'multiple_links')
    rmSync(join(dir, 'second-name'))
    for (const mode of [0o640, 0o604, 0o660]) {
      chmodSync(linked, mode)
      assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'mode_open', mode.toString(8))
    }
    chmodSync(linked, 0o600)
    writeFileSync(linked, `${custodyText(b)}${'x'.repeat(9000)}`)
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'too_large')
    rmSync(linked)
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b })), 'not_found', 'no fallback to anything else')
  })

  test('refuses an unsafe directory or ancestor, and a relative or traversing path', () => {
    const b = binding()
    const open = join(scratch, `open${n++}`)
    mkdirSync(open, { mode: 0o700 })
    chmodSync(open, 0o755)
    custody(open, b)
    assert.equal(code(() => readCustodyKey({ custodyDir: open, binding: b })), 'directory_unsafe', 'a readable directory')
    const shared = join(scratch, `shared${n++}`)
    mkdirSync(shared)
    chmodSync(shared, 0o777)
    const inner = join(shared, 'inner')
    mkdirSync(inner, { mode: 0o700 })
    custody(inner, b)
    assert.equal(code(() => readCustodyKey({ custodyDir: inner, binding: b })), 'ancestor_unsafe', 'a world-writable, non-sticky ancestor')
    assert.equal(code(() => readCustodyKey({ custodyDir: 'relative/dir', binding: b })), 'path_not_absolute')
    assert.equal(code(() => readCustodyKey({ custodyDir: `${inner}/../inner`, binding: b })), 'path_not_absolute', 'a traversal')
    const real = privateDir()
    const alias = join(scratch, `alias${n++}`)
    symlinkSync(real, alias)
    custody(real, b)
    assert.equal(code(() => readCustodyKey({ custodyDir: alias, binding: b })), 'directory_unsafe', 'a linked directory')
  })

  test('refuses a file this process does not own (structural: another EXPECTED uid, not a real second user)', () => {
    const dir = privateDir()
    const b = binding()
    custody(dir, b)
    const other = (typeof process.getuid === 'function' ? process.getuid() : 0) + 4242
    assert.equal(code(() => readCustodyKey({ custodyDir: dir, binding: b, uid: other })), 'directory_unsafe')
    assert.equal(code(() => readPrivateFile(join(dir, custodyFileName(b)), 8192, other)), 'directory_unsafe')
  })
})

describe('the binding record', () => {
  test('is written once, 0600, exclusively, and read back exactly', () => {
    const dir = privateDir()
    const b = binding()
    const path = writeBinding(dir, b)
    assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.deepEqual(readBinding(path), b)
    assert.equal(code(() => writeBinding(dir, b)), 'binding_exists', 'never replaced')
    const open = join(scratch, `bopen${n++}`)
    mkdirSync(open, { mode: 0o755 })
    chmodSync(open, 0o755)
    assert.equal(code(() => writeBinding(open, binding())), 'directory_unsafe', 'never into a readable directory')
  })

  test('is a closed record: unknown, missing or malformed fields are refused without quoting them', () => {
    const b = binding()
    const bad = {
      unknown: { ...b, extra: 1 },
      missing: Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'resourceId')),
      schema: { ...b, schema: 'other' },
      uuid: { ...b, connectionId: '../escape' },
      upper: { ...b, projectId: b.projectId.toUpperCase() },
      revision: { ...b, credentialRevision: 0 },
      fraction: { ...b, credentialRevision: 1.5 },
      route: { ...b, routeId: 'default' },
      capability: { ...b, capability: 'short' },
      originPath: { ...b, serviceOrigin: 'http://127.0.0.1:4321/api' },
      originCreds: { ...b, serviceOrigin: 'http://u:p@127.0.0.1:4321' },
      originScheme: { ...b, serviceOrigin: 'file:///etc' },
    }
    for (const [name, record] of Object.entries(bad)) assert.equal(code(() => parseBinding(Buffer.from(JSON.stringify(record)))), 'binding_invalid', name)
    const raw = Buffer.from(`{"schema":"${KEY}`)
    assert.equal(code(() => parseBinding(raw)), 'binding_invalid', 'a parse failure never quotes the bytes')
    assert.equal(serviceOriginOf('https://sophia.example'), 'https://sophia.example')
    assert.equal(serviceOriginOf('https://sophia.example/'), null, 'an origin is written without a path')
  })
})

describe('the launcher before the root is touched', () => {
  test('passes exactly the custodian key, under the route reference, and refuses another unit or route', () => {
    const bdir = privateDir()
    const cdir = privateDir()
    const b = binding()
    const path = writeBinding(bdir, b)
    custody(cdir, b)
    const ambient = { OPENAI_RESEARCH_API_KEY: 'sk-ambient-research-must-not-pass', OPENAI_API_KEY: 'sk-ambient-default-must-not-pass' }
    const saved = { ...process.env }
    Object.assign(process.env, ambient)
    try {
      const prepared = prepareContributionLaunch({ binding: path, custodyDir: cdir, unit })
      assert.deepEqual(prepared.credentialValues, { OPENAI_RESEARCH_API_KEY: KEY })
      assert.deepEqual(prepared.bridge, { url: b.serviceOrigin, token: b.capability })
      assert.ok(!JSON.stringify(prepared.safe).includes(KEY) && !JSON.stringify(prepared.safe).includes(b.capability))
    } finally {
      for (const k of Object.keys(ambient)) if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    assert.equal(code(() => prepareContributionLaunch({ binding: path, custodyDir: cdir, unit: { ...unit, id: 'another-unit' } })), 'binding_mismatch')
    const moved = structuredClone(unit)
    moved.model_routes[CUSTODY_ROUTE.routeId].credential_ref = 'OPENAI_API_KEY'
    assert.equal(code(() => assertContributedRoute(moved)), 'route_unrecorded')
    const other = structuredClone(unit)
    other.role_routes['sophia-research-md-v1'] = 'default'
    assert.equal(code(() => assertContributedRoute(other)), 'route_unrecorded')
    const compaction = structuredClone(unit)
    compaction.compaction.modelPolicies = [{ provider: 'openai' }]
    assert.equal(code(() => assertContributedRoute(compaction)), 'route_unrecorded')
  })
})

describe('registration\'s record (S5c r2): checked before registering, then created completely and durably or removed', () => {
  const fields = (over = {}) => ({
    projectId: randomUUID(),
    connectionId: randomUUID(),
    runtimeUnitId: unit.id,
    serviceOrigin: 'http://127.0.0.1:4321',
    dir: privateDir(),
    capability: randomBytes(32).toString('base64url'),
    ...over,
  })
  /** The real calls, with the named ones replaced; records which descriptors were fsynced. */
  function io(over = {}) {
    const synced = []
    const real = { openSync: fs.openSync, writeSync: fs.writeSync, fsyncSync: fs.fsyncSync, fstatSync: fs.fstatSync, closeSync: fs.closeSync, lstatSync: fs.lstatSync, unlinkSync: fs.unlinkSync }
    const calls = { ...real, fsyncSync: (fd) => (synced.push(fd), real.fsyncSync(fd)), ...over }
    return { calls, synced, real }
  }
  const registered = () => ({ runtimeId: randomUUID(), resourceId: randomUUID(), credentialRevision: 2 })
  const record = (f) => bindingRecord(bindingFields(f), registered(), f.capability)

  test('every accepted UUID spelling becomes lowercase; anything else, a bad unit, origin or directory is refused first', () => {
    const id = randomUUID()
    assert.equal(canonicalUuid(id.toUpperCase()), id)
    assert.equal(canonicalUuid(`urn:uuid:${id}`), id)
    assert.equal(canonicalUuid(`URN:UUID:${id.toUpperCase()}`), id)
    for (const bad of [`{${id}}`, id.replaceAll('-', ''), ` ${id}`, `${id}\n`, `${id}0`, 'not-a-uuid', '', undefined, 7]) assert.equal(canonicalUuid(bad), null)
    const f = fields({ projectId: id.toUpperCase(), connectionId: `urn:uuid:${id}` })
    assert.deepEqual({ ...bindingFields(f) }, { projectId: id, connectionId: id, runtimeUnitId: unit.id, serviceOrigin: f.serviceOrigin })
    assert.equal(code(() => bindingFields(fields({ projectId: `{${id}}` }))), 'id_invalid', 'a spelling PostgreSQL would cast is still refused')
    assert.equal(code(() => bindingFields(fields({ connectionId: id.replaceAll('-', '') }))), 'id_invalid')
    assert.equal(code(() => bindingFields(fields({ runtimeUnitId: 'a unit' }))), 'unit_invalid')
    assert.equal(code(() => bindingFields(fields({ runtimeUnitId: `u${'x'.repeat(128)}` }))), 'unit_invalid', 'longer than a record holds')
    assert.equal(code(() => bindingFields(fields({ serviceOrigin: 'http://127.0.0.1:4321/api' }))), 'service_origin_invalid')
    assert.equal(code(() => bindingFields(fields({ serviceOrigin: undefined }))), 'service_origin_invalid')
    assert.equal(code(() => bindingFields(fields({ dir: 'relative/dir' }))), 'path_not_absolute')
    const open = join(scratch, `fopen${n++}`)
    mkdirSync(open, { mode: 0o755 })
    chmodSync(open, 0o755)
    assert.equal(code(() => bindingFields(fields({ dir: open }))), 'directory_unsafe')
    assert.equal(code(() => bindingFields(fields({ capability: 'short' }))), 'binding_invalid', 'the whole record is parsed first')
  })

  test('is written completely across short writes, fsynced with its directory, read back, and discarded only once ours', () => {
    const f = fields()
    const r = record(f)
    const opened = []
    const { calls, synced } = io({
      writeSync: (fd, buffer, offset, length) => fs.writeSync(fd, buffer, offset, Math.min(1, length)),
      openSync: (path, flags, mode) => {
        const fd = fs.openSync(path, flags, mode)
        opened.push({ path, fd, directory: (flags & fs.constants.O_DIRECTORY) !== 0 })
        return fd
      },
    })
    const created = createBinding(f.dir, r, { io: calls })
    assert.deepEqual(readBinding(created.path), r, 'every byte, one at a time')
    assert.equal(statSync(created.path).mode & 0o777, 0o600)
    const file = opened.find((o) => o.path === created.path)
    const dir = opened.find((o) => o.directory && o.path === f.dir)
    assert.ok(file && synced.includes(file.fd), 'the file was fsynced')
    assert.ok(dir && synced.includes(dir.fd), 'the directory was fsynced')
    assert.equal(code(() => createBinding(f.dir, r)), 'binding_exists', 'never replaced or adopted')
    assert.equal(created.discard(), true)
    assert.deepEqual(readdirSync(f.dir), [])
    assert.equal(created.discard(), true, 'already gone')
    // A path that names another file is never removed.
    const again = createBinding(f.dir, r)
    renameSync(again.path, `${again.path}.moved`)
    writeFileSync(again.path, 'another file', { mode: 0o600 })
    assert.equal(again.discard(), false)
    assert.equal(readFileSync(again.path, 'utf8'), 'another file')
  })

  test('a failed write, fsync, close or read-back after the create removes only its own record', () => {
    const fail = (name) => () => {
      throw Object.assign(new Error(`${name} failed`), { code: 'EIO' })
    }
    const cases = {
      'a zero-byte write': { writeSync: () => 0 },
      'a write error (EFBIG)': { writeSync: () => { throw Object.assign(new Error('too big'), { code: 'EFBIG' }) } },
      'a file fsync error': { fsyncSync: fail('fsync') },
      'a close error': { closeSync: fail('close') },
      'a different record on disk': { writeSync: (fd, buffer, offset, length) => fs.writeSync(fd, Buffer.from(buffer.toString().replace('"credentialRevision":2', '"credentialRevision":3')), offset, length) },
    }
    for (const [what, over] of Object.entries(cases)) {
      const f = fields()
      assert.equal(code(() => createBinding(f.dir, record(f), { io: io(over).calls })), 'binding_unwritable', what)
      assert.deepEqual(readdirSync(f.dir), [], `${what}: no record remains`)
    }
    // The directory's fsync fails: the file's own fsync succeeded, yet its entry is not durable, so it is removed.
    const f = fields()
    let fileSynced = false
    const dirSync = io({
      fsyncSync: (fd) => {
        if (fs.fstatSync(fd).isDirectory()) throw Object.assign(new Error('dir fsync'), { code: 'EIO' })
        fileSynced = true
        return fs.fsyncSync(fd)
      },
    })
    assert.equal(code(() => createBinding(f.dir, record(f), { io: dirSync.calls })), 'binding_unwritable')
    assert.ok(fileSynced)
    assert.deepEqual(readdirSync(f.dir), [])
    // Replaced under its name before the failure: the other file is left alone.
    const g = fields()
    const rg = record(g)
    const path = join(g.dir, `${rg.runtimeId}.binding.json`)
    const swapped = io({
      fsyncSync: () => {
        renameSync(path, `${path}.moved`)
        writeFileSync(path, 'another file', { mode: 0o600 })
        throw Object.assign(new Error('fsync'), { code: 'EIO' })
      },
    })
    assert.equal(code(() => createBinding(g.dir, rg, { io: swapped.calls })), 'binding_unwritable')
    assert.equal(readFileSync(path, 'utf8'), 'another file')
    // A link already at the name is never followed or replaced.
    const h = fields()
    const rh = record(h)
    const target = join(scratch, `target${n++}`)
    writeFileSync(target, 'untouched')
    symlinkSync(target, join(h.dir, `${rh.runtimeId}.binding.json`))
    assert.equal(code(() => createBinding(h.dir, rh)), 'binding_exists')
    assert.equal(readFileSync(target, 'utf8'), 'untouched')
  })
})
