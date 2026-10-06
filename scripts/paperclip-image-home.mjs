#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §5, CX-0036, CX-0039, CX-0040): what the container's home (/paperclip, a named volume)
// actually holds, so persistence is checked on its contents and not on the volume's existence:
//   node scripts/paperclip-image-home.mjs snapshot <container> <out.json> [<before.json>]
//       every regular file under the volume mounted at the container's /paperclip, read from the runner (through sudo
//       when not root), outside the container and so outside the memory cgroup the qualification measures: path, size
//       and sha256 of files under MAX_FILE_BYTES, at most MAX_FILES of them; its coverage (how many regular files there
//       are, which were too large to hash, which directories could not be read); given the earlier snapshot, each
//       growing file's prefix: the sha256 of its first N bytes, N its earlier size
//   node scripts/paperclip-image-home.mjs scan <dir>          (what snapshot runs: the JSON of one scan, to stdout)
//   node scripts/paperclip-image-home.mjs compare <before.json> <after.json> <out.json>
// Each file is read once (open, fstat, then exactly the bytes fstat named): its size is the count of the bytes read and
// its digest their hash, and its prefix is hashed from the same bytes, so a record appended to mid-scan is described
// consistently; a read that came up short, or that failed, leaves size and digest null (unverified, never a default).
// The comparison passes only when the first container wrote files there; every one of them is still there after the
// container was recreated on the same volume; the adapter registry start.sh writes (adapter-plugins.json) exists both
// times; every file is the same size with the same digest except the documented growing runtime records (GROWING: logs,
// JSONL journals, and files under a logs/ or runs/ directory); and each of those only grew: no smaller than before,
// its earlier bytes retained as its prefix (WBC-02-CX-0036). Every size and digest compared must be one that was read:
// an entry without a whole-number size or a sha256, one whose size and digest disagree about being empty, or a path
// listed twice, is unverified, never equal to another (CX-0039, CX-0040). Paths and digests only: no file's contents
// are recorded.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, openSync, readdirSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The runtime records the server appends to while it runs; the only files allowed to change across a recreation. */
export const GROWING = [/\.log$/, /\.jsonl$/, /(^|\/)logs?\//, /(^|\/)runs?\//]
/** Files that must exist before and after, byte-identical: the adapter registry deploy/paperclip/start.sh writes. */
export const REQUIRED_STABLE = ['adapter-plugins.json']
/** The snapshot's bounds: files hashed at most, and the size from which a file is listed but not hashed. */
export const MAX_FILES = 500
export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** The sha256 of no bytes: the digest of an empty file, and of nothing else. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

const SHA256 = /^[0-9a-f]{64}$/
const growing = (path) => GROWING.some((rule) => rule.test(path))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** A size and digest that were both read, and agree: no bytes hash to the empty digest, and only no bytes do. */
const consistent = (size, digest) =>
  Number.isSafeInteger(size) && size >= 0 && SHA256.test(digest ?? '') && (size === 0) === (digest === EMPTY_SHA256)
/** A recorded entry whose path, size and digest were all read. */
const measured = (f) => typeof f?.path === 'string' && f.path !== '' && consistent(f.size, f.sha256)

/**
 * One scan of a home directory: every regular file under it (symbolic links are neither listed nor followed), each read
 * once. `prefixOf` ({ [path]: N }) names the growing files whose first N bytes to hash from that same read. `onOpened`
 * (path) runs after a file's size was read and before its bytes are: the test seam for a file changing in between.
 */
export function scan(root, { prefixOf = {}, maxFiles = MAX_FILES, maxFileBytes = MAX_FILE_BYTES, onOpened } = {}) {
  const paths = []
  const errors = []
  const visit = (rel) => {
    let entries
    try {
      entries = readdirSync(rel ? join(root, rel) : root, { withFileTypes: true })
    } catch (error) {
      errors.push({ path: rel || '.', error: error.code ?? 'unreadable' })
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) paths.push(path)
    }
  }
  visit('')
  const files = []
  const oversize = []
  const prefixes = {}
  for (const path of paths) {
    let fd
    try {
      fd = openSync(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW)
      const stat = fstatSync(fd)
      if (!stat.isFile()) throw Object.assign(new Error('not a regular file'), { code: 'ENOTREG' })
      if (stat.size >= maxFileBytes) {
        oversize.push({ path, size: stat.size })
        continue
      }
      if (files.length >= maxFiles) continue
      onOpened?.(path)
      const bytes = Buffer.alloc(stat.size)
      let read = 0
      while (read < stat.size) {
        const got = readSync(fd, bytes, read, stat.size - read, read)
        if (got === 0) break
        read += got
      }
      if (read !== stat.size) {
        files.push({ path, size: null, sha256: null, short: { expected: stat.size, read } })
        continue
      }
      files.push({ path, size: read, sha256: sha256(bytes) })
      const n = prefixOf[path]
      if (Number.isSafeInteger(n) && n >= 0 && n <= read) prefixes[path] = { size: n, sha256: sha256(bytes.subarray(0, n)) }
    } catch (error) {
      if (files.length < maxFiles) files.push({ path, size: null, sha256: null, error: error.code ?? 'unreadable' })
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }
  return { coverage: { total: paths.length, oversize, errors, maxFiles, maxFileBytes }, files, prefixes }
}

/**
 * The comparison of two snapshots' `files` ({ path, size, sha256 }[]) and the later one's `prefixes` ({ [path]: { size,
 * sha256 } }: each growing file's first `size` bytes, from the same read as its entry); `persisted` is its verdict.
 */
export function compareSnapshots(before, after, prefixes = {}) {
  const unverified = new Set()
  const index = (list) => {
    const byPath = new Map()
    const seen = new Set()
    for (const f of list) {
      const path = typeof f?.path === 'string' && f.path !== '' ? f.path : '(no path)'
      if (seen.has(path) || !measured(f)) {
        unverified.add(path)
        byPath.delete(path)
      } else byPath.set(path, f)
      seen.add(path)
    }
    return { byPath, seen }
  }
  const was = index(before)
  const now = index(after)
  // A growing record that changed is proved to have kept its bytes only by a prefix read: without one, it is unverified.
  const proof = (p) => {
    const old = was.byPath.get(p)
    const prefix = prefixes[p]
    if (now.byPath.get(p).size < old.size) return 'rewritten'
    if (!consistent(prefix?.size, prefix?.sha256) || prefix.size !== old.size) return 'unverified'
    return prefix.sha256 === old.sha256 ? 'kept' : 'rewritten'
  }
  for (const path of unverified) {
    was.byPath.delete(path)
    now.byPath.delete(path)
  }
  const kept = [...was.byPath.values()]
  // Only entries measured on both sides are compared, by size and by digest; one recorded on either side without its
  // measurements is unverified.
  const missing = kept.filter((f) => !now.seen.has(f.path)).map((f) => f.path)
  const changed = kept
    .filter((f) => now.byPath.has(f.path) && (now.byPath.get(f.path).sha256 !== f.sha256 || now.byPath.get(f.path).size !== f.size))
    .map((f) => f.path)
  const requiredAbsent = REQUIRED_STABLE.filter((p) => !was.seen.has(p) || !now.seen.has(p))
  const changedStable = changed.filter((p) => !growing(p))
  const changedGrowing = changed.filter(growing)
  const rewrittenGrowing = changedGrowing.filter((p) => proof(p) === 'rewritten')
  for (const p of changedGrowing.filter((p) => proof(p) === 'unverified')) unverified.add(p)
  return {
    filesBefore: before.length,
    filesAfter: after.length,
    missing,
    changedGrowing,
    rewrittenGrowing,
    changedStable,
    requiredAbsent,
    unverified: [...unverified],
    instanceConfigs: kept.filter((f) => /^instances\/[^/]+\/config\.json$/.test(f.path)).map((f) => f.path),
    persisted:
      kept.length > 0 &&
      missing.length === 0 &&
      changedStable.length === 0 &&
      rewrittenGrowing.length === 0 &&
      requiredAbsent.length === 0 &&
      unverified.size === 0,
  }
}

/**
 * Whether a snapshot listed and hashed every regular file under the home: `complete` only when it recorded how many
 * there are, none was too large to hash, every directory was read, and every file is listed (the MAX_FILES bound was
 * not reached).
 */
export function coverageOf(snapshot) {
  const total = snapshot?.coverage?.total
  const oversize = snapshot?.coverage?.oversize
  const errors = snapshot?.coverage?.errors
  const listed = Array.isArray(snapshot?.files) ? snapshot.files.length : null
  const recorded = Number.isSafeInteger(total) && Array.isArray(oversize) && Array.isArray(errors) && listed !== null
  return {
    total: recorded ? total : null,
    listed,
    oversize: Array.isArray(oversize) ? oversize : null,
    errors: Array.isArray(errors) ? errors : null,
    complete: recorded && oversize.length === 0 && errors.length === 0 && listed === total,
  }
}

/** The host directory behind the container's /paperclip mount. */
function homeSource(container) {
  const mounts = JSON.parse(
    execFileSync('docker', ['inspect', '--format', '{{json .Mounts}}', container], { encoding: 'utf8', timeout: 20_000 }),
  )
  const home = Array.isArray(mounts) ? mounts.find((m) => m.Destination === '/paperclip') : null
  if (!home?.Source) throw new Error(`${container} has no mount at /paperclip`)
  return home.Source
}

function snapshot(container, out, beforePath) {
  const before = beforePath ? JSON.parse(readFileSync(beforePath, 'utf8')).files : []
  const prefixOf = Object.fromEntries(before.filter((f) => measured(f) && growing(f.path)).map((f) => [f.path, f.size]))
  const self = fileURLToPath(import.meta.url)
  const command = [process.execPath, self, 'scan', homeSource(container)]
  // The volume's files belong to the container's user; the runner reads them as root.
  const [program, ...args] = process.getuid?.() === 0 ? command : ['sudo', '-n', ...command]
  const result = JSON.parse(
    execFileSync(program, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024, input: JSON.stringify({ prefixOf }) }),
  )
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), ...result }, null, 2)}\n`)
  const { coverage, files, prefixes } = result
  const { complete } = coverageOf(result)
  console.log(
    `[home] ${files.length} of ${coverage.total} files under /paperclip listed, ${files.filter((f) => !measured(f)).length} of them unread, ` +
      `${coverage.oversize.length} too large to hash, ${coverage.errors.length} directories unread ` +
      `(coverage ${complete ? 'complete' : 'incomplete'}); ${Object.keys(prefixes).length} growing records' prefixes read`,
  )
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const [mode, ...args] = process.argv.slice(2)
  if (mode === 'snapshot') snapshot(args[0], args[1], args[2])
  else if (mode === 'scan') {
    const input = readFileSync(0, 'utf8').trim()
    process.stdout.write(`${JSON.stringify(scan(args[0], input ? JSON.parse(input) : {}))}\n`)
  } else if (mode === 'compare') {
    const [beforePath, afterPath, out] = args
    const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
    const before = read(beforePath)
    const after = read(afterPath)
    const result = {
      ...compareSnapshots(before.files, after.files, after.prefixes ?? {}),
      coverage: { before: coverageOf(before), after: coverageOf(after) },
    }
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
    console.log(
      `[home] before ${result.filesBefore}, after ${result.filesAfter}, missing ${result.missing.length}, ` +
        `changed stable [${result.changedStable.join(', ')}], changed growing ${result.changedGrowing.length} ` +
        `(rewritten [${result.rewrittenGrowing.join(', ')}]), required absent [${result.requiredAbsent.join(', ')}], ` +
        `unverified [${result.unverified.join(', ')}], coverage ${result.coverage.before.complete && result.coverage.after.complete ? 'complete' : 'incomplete'}, ` +
        `persisted ${result.persisted}`,
    )
    if (!result.persisted || !result.coverage.before.complete || !result.coverage.after.complete) process.exitCode = 1
  } else
    throw new Error('usage: paperclip-image-home.mjs snapshot <container> <out.json> [<before.json>] | scan <dir> | compare <before> <after> <out>')
}
