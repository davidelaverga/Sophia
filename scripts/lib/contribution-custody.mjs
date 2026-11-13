/**
 * INC01-CC-004 S5c: the explicit custodian of a member's API contribution runtime (docs/plans/api-contributions.md
 * "S5c"). Two host-local files, both read the same guarded way:
 *
 * - the BINDING record, written once by scripts/register-contribution-runtime.ts for one registered runtime: project,
 *   runtime, resource, connection, credential revision, runtime unit, route, service origin and the runtime's
 *   capability (its only authority towards Sophia);
 * - the CUSTODY file, which an owner/operator step places in a configured private directory: a closed header naming the
 *   connection, credential revision and route it is for, then the key. Its name is derived from the binding, never
 *   chosen by the file, and its header must equal the binding.
 *
 * The header DECLARES which registration the key is meant for; it proves no provider account, organization, benefit,
 * balance or qualification. Nothing here discovers, adopts, chmods or repairs a file, or reads a credential store.
 * Every refusal is a CustodyError with a fixed code; no message ever carries a file's content.
 * @module scripts/lib/contribution-custody
 */

import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

/** The one route a contribution runtime serves, and the variable its key is passed under (config/runtime-unit.json). */
export const CUSTODY_ROUTE = Object.freeze({ routeId: 'research-sol-medium-v1', credentialRef: 'OPENAI_RESEARCH_API_KEY' })
export const BINDING_SCHEMA = 'sophia.contribution-binding.v1'
const CUSTODY_HEADER = 'sophia-contribution-credential v1'
const MAX_CUSTODY_BYTES = 8192
const MAX_BINDING_BYTES = 4096
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** A key is one printable token: no spaces, bounded (the shape a bearer header carries). */
const KEY_VALUE = /^[\x21-\x7e]{16,4096}$/
/** A runtime capability as registration mints it: 32 random bytes, base64url. */
const CAPABILITY = /^[A-Za-z0-9_-]{43}$/
const UNIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const BINDING_KEYS = ['schema', 'projectId', 'runtimeId', 'resourceId', 'connectionId', 'credentialRevision', 'runtimeUnitId', 'routeId', 'serviceOrigin', 'capability']

/** A refusal: a fixed code, never a value, a path's content or a raw cause. */
export class CustodyError extends Error {
  constructor(code) {
    super(`contribution custody refused: ${code}`)
    this.name = 'CustodyError'
    this.code = code
  }
}
const refuse = (code) => {
  throw new CustodyError(code)
}
const currentUid = () => (typeof process.getuid === 'function' ? process.getuid() : refuse('platform_unsupported'))

/**
 * Every ancestor of a directory, root first, must be a canonical directory owned by root or `uid`, and writable by
 * nobody else unless it is root-owned and sticky (like /tmp: others cannot rename or remove what is ours).
 */
function assertSafeAncestors(dir, uid) {
  const parts = dir.split(sep).filter(Boolean)
  let at = sep
  for (const part of ['', ...parts]) {
    at = part === '' ? sep : join(at, part)
    const stat = lstatSync(at, { throwIfNoEntry: false })
    if (stat === undefined || !stat.isDirectory()) refuse('ancestor_unsafe')
    if (stat.uid !== 0 && stat.uid !== uid) refuse('ancestor_unsafe')
    if ((stat.mode & 0o022) !== 0 && !(stat.uid === 0 && (stat.mode & 0o1000) !== 0)) refuse('ancestor_unsafe')
  }
}

/** The configured private directory: absolute, canonical, ours, nobody else's to read or write. */
export function assertPrivateDirectory(dir, uid = currentUid()) {
  if (typeof dir !== 'string' || !isAbsolute(dir) || resolve(dir) !== dir) refuse('path_not_absolute')
  let real
  try {
    real = realpathSync(dir)
  } catch {
    refuse('directory_unsafe')
  }
  if (real !== dir) refuse('directory_unsafe')
  assertSafeAncestors(dirname(dir), uid)
  const stat = lstatSync(dir)
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o077) !== 0) refuse('directory_unsafe')
}

/**
 * Read a private file from a stable snapshot: opened without following a link and without blocking, the descriptor a
 * regular file owned by `uid`, not group- or other-accessible, with one link, the path still naming that descriptor,
 * at most `maxBytes`, and unchanged while it was read (a file that grows is still read only up to its bound).
 */
export function readPrivateFile(path, maxBytes, uid = currentUid()) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) refuse('path_not_absolute')
  assertPrivateDirectory(dirname(path), uid)
  let fd
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | constants.O_NOCTTY)
  } catch (error) {
    if (error?.code === 'ENOENT') refuse('not_found')
    if (error?.code === 'ELOOP') refuse('symlink')
    if (error?.code === 'ENXIO' || error?.code === 'EOPNOTSUPP') refuse('not_regular')
    refuse('unreadable')
  }
  try {
    const before = fstatSync(fd)
    if (!before.isFile()) refuse('not_regular')
    if (before.uid !== uid) refuse('foreign_owner')
    if ((before.mode & 0o077) !== 0) refuse('mode_open')
    if (before.nlink !== 1) refuse('multiple_links')
    if (before.size > maxBytes) refuse('too_large')
    const named = lstatSync(path, { throwIfNoEntry: false })
    if (named === undefined || named.dev !== before.dev || named.ino !== before.ino) refuse('path_changed')
    const buffer = Buffer.alloc(maxBytes + 1)
    let total = 0
    for (;;) {
      let n
      try {
        n = readSync(fd, buffer, total, buffer.length - total, null)
      } catch {
        refuse('unreadable')
      }
      if (n === 0) break
      total += n
      if (total > maxBytes) refuse('too_large')
    }
    const after = fstatSync(fd)
    if (after.size !== total || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)
      refuse('changed_while_read')
    return buffer.subarray(0, total)
  } finally {
    closeSync(fd)
  }
}

/** The binding record's fields, exactly, or a refusal (never the JSON parser's message, which can quote content). */
export function parseBinding(bytes) {
  let record
  try {
    record = JSON.parse(bytes.toString('utf8'))
  } catch {
    refuse('binding_invalid')
  }
  if (typeof record !== 'object' || record === null || Array.isArray(record)) refuse('binding_invalid')
  const keys = Object.keys(record).toSorted()
  if (keys.length !== BINDING_KEYS.length || keys.some((k, i) => k !== BINDING_KEYS.toSorted()[i])) refuse('binding_invalid')
  if (record.schema !== BINDING_SCHEMA) refuse('binding_invalid')
  for (const k of ['projectId', 'runtimeId', 'resourceId', 'connectionId']) if (typeof record[k] !== 'string' || !UUID.test(record[k])) refuse('binding_invalid')
  if (!Number.isSafeInteger(record.credentialRevision) || record.credentialRevision < 1) refuse('binding_invalid')
  if (typeof record.runtimeUnitId !== 'string' || !UNIT_ID.test(record.runtimeUnitId)) refuse('binding_invalid')
  if (record.routeId !== CUSTODY_ROUTE.routeId) refuse('binding_invalid')
  if (typeof record.capability !== 'string' || !CAPABILITY.test(record.capability)) refuse('binding_invalid')
  if (serviceOriginOf(record.serviceOrigin) !== record.serviceOrigin) refuse('binding_invalid')
  return Object.freeze({ ...record })
}

/** An http(s) origin with no credentials, path, query or fragment, or null. */
export function serviceOriginOf(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || (url.pathname !== '/' && url.pathname !== '')) return null
  return url.origin === value ? value : null
}

/** Read a binding record from its private directory. */
export function readBinding(path, uid = currentUid()) {
  return parseBinding(readPrivateFile(path, MAX_BINDING_BYTES, uid))
}

/** The custody file's name for a binding: derived from the registration, never from a file or a request. */
export function custodyFileName(binding) {
  return `${binding.connectionId}.r${binding.credentialRevision}.${binding.routeId}.credential`
}

/**
 * The key a custody file holds for exactly this binding. Five LF-terminated lines, nothing else: the header, the
 * connection, the revision, the route and the key; printable ASCII only (no CR, NUL or other control). Any other
 * shape, or a header for another registration, is refused.
 */
export function parseCustody(bytes, binding) {
  for (const byte of bytes) if (byte !== 0x0a && (byte < 0x20 || byte > 0x7e)) refuse('custody_invalid')
  const text = bytes.toString('ascii')
  if (!text.endsWith('\n')) refuse('custody_invalid')
  const lines = text.slice(0, -1).split('\n')
  if (lines.length !== 5 || lines[0] !== CUSTODY_HEADER) refuse('custody_invalid')
  const field = (line, name) => (line.startsWith(`${name} `) ? line.slice(name.length + 1) : refuse('custody_invalid'))
  const connection = field(lines[1], 'connection')
  const revision = field(lines[2], 'revision')
  const route = field(lines[3], 'route')
  const key = field(lines[4], 'key')
  if (!UUID.test(connection) || !/^[1-9][0-9]{0,15}$/.test(revision)) refuse('custody_invalid')
  if (connection !== binding.connectionId || Number(revision) !== binding.credentialRevision || route !== binding.routeId)
    refuse('binding_mismatch')
  if (!KEY_VALUE.test(key)) refuse('key_invalid')
  return key
}

/** The custodian's key for a binding, from the configured private directory. */
export function readCustodyKey({ custodyDir, binding, uid = currentUid() }) {
  assertPrivateDirectory(custodyDir, uid)
  return parseCustody(readPrivateFile(join(custodyDir, custodyFileName(binding)), MAX_CUSTODY_BYTES, uid), binding)
}

/** One spelling for an accepted UUID (0094 r2): 8-4-4-4-12 hex in any case, optionally `urn:uuid:`, as lowercase hex. */
export function canonicalUuid(value) {
  if (typeof value !== 'string') return null
  const match = /^(?:urn:uuid:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value)
  return match ? match[1].toLowerCase() : null
}

/** The complete record for a registration: the caller's checked fields and what registration returned. */
export function bindingRecord(fields, registered, capability) {
  return {
    schema: BINDING_SCHEMA,
    projectId: fields.projectId,
    runtimeId: registered.runtimeId,
    resourceId: registered.resourceId,
    connectionId: fields.connectionId,
    credentialRevision: registered.credentialRevision,
    runtimeUnitId: fields.runtimeUnitId,
    routeId: CUSTODY_ROUTE.routeId,
    serviceOrigin: fields.serviceOrigin,
    capability,
  }
}

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Everything registration's caller controls in a record, checked and in its one spelling BEFORE anything is
 * registered (S5c r2): the ids (any accepted UUID spelling becomes lowercase; any other is refused, even one
 * PostgreSQL would cast), the unit, the origin and the private directory. The complete record, with placeholders for
 * what registration returns, must already pass the closed parser, so only SQL's own values can still differ.
 */
export function bindingFields({ projectId, connectionId, runtimeUnitId, serviceOrigin, dir, capability }, uid = currentUid()) {
  const project = canonicalUuid(projectId)
  const connection = canonicalUuid(connectionId)
  if (project === null || connection === null) refuse('id_invalid')
  if (typeof runtimeUnitId !== 'string' || !UNIT_ID.test(runtimeUnitId)) refuse('unit_invalid')
  if (serviceOriginOf(serviceOrigin) !== serviceOrigin) refuse('service_origin_invalid')
  assertPrivateDirectory(dir, uid)
  const fields = Object.freeze({ projectId: project, connectionId: connection, runtimeUnitId, serviceOrigin })
  const provisional = bindingRecord(fields, { runtimeId: PLACEHOLDER_ID, resourceId: PLACEHOLDER_ID, credentialRevision: 1 }, capability)
  parseBinding(Buffer.from(JSON.stringify(provisional)))
  return fields
}

/** The filesystem calls createBinding makes; tests replace some to fail deterministically. */
const FS = Object.freeze({ openSync, writeSync, fsyncSync, fstatSync, closeSync, lstatSync, unlinkSync })

/** Make a directory entry durable: fsync the directory itself, opened without following a link. */
function syncDirectory(dir, io) {
  const fd = io.openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
}

/** Remove the record this call created, only while the path still names that file; true once it is gone. */
function discardCreated(path, identity, dir, io) {
  if (identity === null) return false
  let named
  try {
    named = io.lstatSync(path, { throwIfNoEntry: false })
  } catch {
    return false
  }
  if (named === undefined) return true
  if (named.dev !== identity.dev || named.ino !== identity.ino) return false
  try {
    io.unlinkSync(path)
  } catch {
    return false
  }
  try {
    syncDirectory(dir, io)
  } catch {
    // The entry is gone; a removal that is not yet durable leaves at most an inert record.
  }
  return true
}

/**
 * Create a binding record in an existing private directory, exclusively and without following a link (mode 0600),
 * and make it durable: every byte written (a zero-byte write fails), the file fsynced and its size checked, the
 * directory fsynced, and the record read back through the guarded read and compared. An existing file is never
 * replaced or adopted. If any step after the create fails, the file this call created is removed (only while the path
 * still names it) and the refusal is `binding_unwritable`. Returns the path and `discard`, which removes the record the
 * same way: registration calls it only when its transaction definitely did not commit (S5c r2).
 */
export function createBinding(dir, record, { uid = currentUid(), io = FS } = {}) {
  const checked = parseBinding(Buffer.from(JSON.stringify(record)))
  assertPrivateDirectory(dir, uid)
  const path = join(dir, `${checked.runtimeId}.binding.json`)
  const bytes = Buffer.from(`${JSON.stringify(checked)}\n`)
  let fd
  try {
    fd = io.openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  } catch (error) {
    refuse(error?.code === 'EEXIST' ? 'binding_exists' : 'binding_unwritable')
  }
  let identity = null
  let open = true
  try {
    identity = io.fstatSync(fd)
    let written = 0
    while (written < bytes.length) {
      const n = io.writeSync(fd, bytes, written, bytes.length - written)
      if (!Number.isSafeInteger(n) || n <= 0) throw new Error('incomplete write')
      written += n
    }
    io.fsyncSync(fd)
    if (io.fstatSync(fd).size !== bytes.length) throw new Error('incomplete write')
    open = false
    io.closeSync(fd)
    syncDirectory(dir, io)
    const back = readBinding(path, uid)
    if (BINDING_KEYS.some((k) => back[k] !== checked[k])) throw new Error('record differs')
  } catch {
    if (open) {
      try {
        io.closeSync(fd)
      } catch {
        // Already failing: the record is removed below if it is still ours.
      }
    }
    discardCreated(path, identity, dir, io)
    refuse('binding_unwritable')
  }
  return Object.freeze({ path, discard: () => discardCreated(path, identity, dir, io) })
}

/** Create a binding record (createBinding) and return its path. */
export function writeBinding(dir, record, uid = currentUid()) {
  return createBinding(dir, record, { uid }).path
}
