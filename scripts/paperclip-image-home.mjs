#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §5, CX-0036, CX-0039): what the container's home (/paperclip, a named volume) actually holds, so
// persistence is checked on its contents and not on the volume's existence:
//   node scripts/paperclip-image-home.mjs snapshot <container> <out.json> [<before.json>]
//       every regular file under /paperclip under MAX_FILE_BYTES, at most MAX_FILES of them: path, size, sha256; its
//       coverage (how many regular files there are, and which were too large to hash); given the earlier snapshot, also
//       the sha256 of each growing file's first N bytes, N its earlier size (its retained prefix)
//   node scripts/paperclip-image-home.mjs compare <before.json> <after.json> <out.json>
// The comparison passes only when the first container wrote files there; every one of them is still there after the
// container was recreated on the same volume; the adapter registry start.sh writes (adapter-plugins.json) exists both
// times; every file is byte-identical except the documented growing runtime records (GROWING: logs, JSONL journals,
// and files under a logs/ or runs/ directory); and each of those only grew: no smaller than before, its earlier bytes
// retained as its prefix (WBC-02-CX-0036). Every size and digest compared must be one that was read: a recorded entry
// without a whole-number size or a sha256, or a path listed twice, is unverified, never equal to another (CX-0039).
// Paths and digests only: no file's contents leave the container.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The runtime records the server appends to while it runs; the only files allowed to change across a recreation. */
export const GROWING = [/\.log$/, /\.jsonl$/, /(^|\/)logs?\//, /(^|\/)runs?\//]
/** Files that must exist before and after, byte-identical: the adapter registry deploy/paperclip/start.sh writes. */
export const REQUIRED_STABLE = ['adapter-plugins.json']
/** The snapshot's bounds: files hashed at most, and the size from which a file is listed but not hashed. */
export const MAX_FILES = 500
export const MAX_FILE_BYTES = 10 * 1024 * 1024

const SHA256 = /^[0-9a-f]{64}$/
/** A recorded entry whose path, size and digest were all read. */
const measured = (f) =>
  typeof f?.path === 'string' && f.path !== '' && Number.isSafeInteger(f.size) && f.size >= 0 && SHA256.test(f.sha256 ?? '')

/**
 * The comparison of two snapshots' `files` ({ path, size, sha256 }[]) and the later one's `prefixes` ({ [path]: { size,
 * sha256 } }: each growing file's first `size` bytes); `persisted` is its verdict.
 */
export function compareSnapshots(before, after, prefixes = {}) {
  const growing = (path) => GROWING.some((rule) => rule.test(path))
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
  for (const path of unverified) {
    was.byPath.delete(path)
    now.byPath.delete(path)
  }
  const kept = [...was.byPath.values()]
  // Only entries measured on both sides are compared; one recorded on either side without its measurements is unverified.
  const missing = kept.filter((f) => !now.seen.has(f.path)).map((f) => f.path)
  const changed = kept.filter((f) => now.byPath.has(f.path) && now.byPath.get(f.path).sha256 !== f.sha256).map((f) => f.path)
  const requiredAbsent = REQUIRED_STABLE.filter((p) => !was.seen.has(p) || !now.seen.has(p))
  const changedStable = changed.filter((p) => !growing(p))
  // A growing record passes only if it kept every byte it had: not smaller, and its old content its prefix.
  const rewrittenGrowing = changed
    .filter(growing)
    .filter((p) => {
      const old = was.byPath.get(p)
      const prefix = prefixes[p]
      return !(now.byPath.get(p).size >= old.size && prefix?.size === old.size && prefix.sha256 === old.sha256)
    })
  return {
    filesBefore: before.length,
    filesAfter: after.length,
    missing,
    changedGrowing: changed.filter(growing),
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
 * there are, none was too large to hash, and every one of them is listed (the MAX_FILES bound was not reached).
 */
export function coverageOf(snapshot) {
  const total = snapshot?.coverage?.total
  const oversize = snapshot?.coverage?.oversize
  const listed = Array.isArray(snapshot?.files) ? snapshot.files.length : null
  const recorded = Number.isSafeInteger(total) && Array.isArray(oversize) && listed !== null
  return {
    total: recorded ? total : null,
    listed,
    oversize: Array.isArray(oversize) ? oversize : null,
    complete: recorded && oversize.length === 0 && listed === total,
  }
}

/**
 * The snapshot listing's rows (`total`, `oversize`, `file`) as { coverage, files }. A size or digest that was not read
 * (a failed stat, or a read that came up short, prints nothing) stays null, never a default: the comparison counts it
 * unverified.
 */
export function parseListing(listing) {
  const size = (text) => (/^\d+$/.test(text ?? '') ? Number(text) : null)
  const relative = (path) => (path ?? '').replace(/^\.\//, '')
  const rows = listing
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
  const files = rows
    .filter((r) => r[0] === 'file')
    .map(([, bytes, sha256, path]) => ({ path: relative(path), size: size(bytes), sha256: SHA256.test(sha256 ?? '') ? sha256 : null }))
  const oversize = rows.filter((r) => r[0] === 'oversize').map(([, bytes, path]) => ({ path: relative(path), size: size(bytes) }))
  const total = rows.find((r) => r[0] === 'total')?.[1]?.trim()
  return { coverage: { total: size(total), oversize, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES }, files }
}

/**
 * The listing, in one pass over the home's regular files, so its total is the count of the files it walked: each too
 * large to hash is an `oversize` row; each other (up to MAX_FILES) a `file` row whose digest covers exactly the bytes
 * its size names, read with head -c, so a record appended to mid-snapshot is still described consistently; a size not
 * read, or a read that came up short, leaves the digest empty (unverified, never a default).
 */
const LISTING = [
  'cd /paperclip || exit 1',
  'find . -type f | sort | {',
  '  n=0; k=0',
  '  while IFS= read -r f; do',
  '    n=$((n + 1))',
  '    s=$(stat -c %s "$f" 2>/dev/null)',
  '    case "$s" in "" | *[!0-9]*) s="" ;; esac',
  `    if [ -n "$s" ] && [ "$s" -ge ${MAX_FILE_BYTES} ]; then printf "oversize\\t%s\\t%s\\n" "$s" "$f"; continue; fi`,
  `    [ "$k" -ge ${MAX_FILES} ] && continue`,
  '    k=$((k + 1)); h=""',
  '    if [ -n "$s" ] && [ "$(head -c "$s" "$f" 2>/dev/null | wc -c)" -eq "$s" ]; then h=$(head -c "$s" "$f" | sha256sum | cut -c1-64); fi',
  '    printf "file\\t%s\\t%s\\t%s\\n" "$s" "$h" "$f"',
  '  done',
  '  printf "total\\t%s\\n" "$n"',
  '}',
].join('\n')

function snapshot(container, out, beforePath) {
  const listing = execFileSync('docker', ['exec', container, 'sh', '-c', LISTING], {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const { coverage, files } = parseListing(listing)
  const prefixes = beforePath ? prefixesOf(container, JSON.parse(readFileSync(beforePath, 'utf8')).files) : {}
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), coverage, files, prefixes }, null, 2)}\n`)
  const { complete } = coverageOf({ coverage, files })
  console.log(
    `[home] ${files.length} of ${coverage.total ?? '?'} files under /paperclip listed, ${files.filter((f) => !f.sha256).length} of them unread, ` +
      `${coverage.oversize.length} too large to hash ` +
      `(coverage ${complete ? 'complete' : 'incomplete'}); ${Object.keys(prefixes).length} growing records' prefixes read`,
  )
}

/** For each growing file of the earlier snapshot: the sha256 of its first N bytes now, N its earlier size. */
function prefixesOf(container, before) {
  const growing = before.filter((f) => measured(f) && GROWING.some((rule) => rule.test(f.path)))
  if (growing.length === 0) return {}
  const listing = execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'sh',
      '-c',
      'cd /paperclip && while IFS= read -r line; do n="${line%% *}"; f="${line#* }"; [ -f "$f" ] && printf "%s\\t%s\\n" "$(head -c "$n" "$f" | sha256sum | cut -c1-64)" "$f"; done',
    ],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024, input: growing.map((f) => `${f.size} ${f.path}\n`).join('') },
  )
  const sizes = new Map(growing.map((f) => [f.path, f.size]))
  return Object.fromEntries(
    listing
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha256, path] = line.split('\t')
        return [path, { size: sizes.get(path), sha256 }]
      }),
  )
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const [mode, ...args] = process.argv.slice(2)
  if (mode === 'snapshot') snapshot(args[0], args[1], args[2])
  else if (mode === 'compare') {
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
  } else throw new Error('usage: paperclip-image-home.mjs snapshot <container> <out.json> [<before.json>] | compare <before> <after> <out>')
}
