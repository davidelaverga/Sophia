#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §5, CX-0036): what the container's home (/paperclip, a named volume) actually holds, so
// persistence is checked on its contents and not on the volume's existence:
//   node scripts/paperclip-image-home.mjs snapshot <container> <out.json>   every regular file under /paperclip (at most
//                                                                         500, each under 10 MiB): path, size, sha256
//   node scripts/paperclip-image-home.mjs compare <before.json> <after.json> <out.json>
// The comparison passes only when the first container wrote files there; every one of them is still there after the
// container was recreated on the same volume; the adapter registry start.sh writes (adapter-plugins.json) exists both
// times; and every file is byte-identical except the documented growing runtime records (GROWING: logs, JSONL
// journals, and files under a logs/ or runs/ directory), which may grow but not disappear. Paths and digests only: no
// file's contents leave the container.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The runtime records the server appends to while it runs; the only files allowed to change across a recreation. */
export const GROWING = [/\.log$/, /\.jsonl$/, /(^|\/)logs?\//, /(^|\/)runs?\//]
/** Files that must exist before and after, byte-identical: the adapter registry deploy/paperclip/start.sh writes. */
export const REQUIRED_STABLE = ['adapter-plugins.json']

/** The comparison of two snapshots' `files` ({ path, size, sha256 }[]); `persisted` is its verdict. */
export function compareSnapshots(before, after) {
  const afterByPath = new Map(after.map((f) => [f.path, f]))
  const beforeByPath = new Map(before.map((f) => [f.path, f]))
  const growing = (path) => GROWING.some((rule) => rule.test(path))
  const missing = before.filter((f) => !afterByPath.has(f.path)).map((f) => f.path)
  const changed = before.filter((f) => afterByPath.has(f.path) && afterByPath.get(f.path).sha256 !== f.sha256).map((f) => f.path)
  const requiredAbsent = REQUIRED_STABLE.filter((p) => !beforeByPath.has(p) || !afterByPath.has(p))
  const changedStable = changed.filter((p) => !growing(p))
  return {
    filesBefore: before.length,
    filesAfter: after.length,
    missing,
    changedGrowing: changed.filter(growing),
    changedStable,
    requiredAbsent,
    instanceConfigs: before.filter((f) => /^instances\/[^/]+\/config\.json$/.test(f.path)).map((f) => f.path),
    persisted: before.length > 0 && missing.length === 0 && changedStable.length === 0 && requiredAbsent.length === 0,
  }
}

function snapshot(container, out) {
  const listing = execFileSync(
    'docker',
    [
      'exec',
      container,
      'sh',
      '-c',
      'cd /paperclip && find . -type f -size -10M | sort | head -n 500 | while read -r f; do printf "%s\\t%s\\t%s\\n" "$(stat -c %s "$f")" "$(sha256sum "$f" | cut -c1-64)" "$f"; done',
    ],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  )
  const files = listing
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [size, sha256, path] = line.split('\t')
      return { path: path.replace(/^\.\//, ''), size: Number(size), sha256 }
    })
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), files }, null, 2)}\n`)
  console.log(`[home] ${files.length} files under /paperclip`)
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  const [mode, ...args] = process.argv.slice(2)
  if (mode === 'snapshot') snapshot(args[0], args[1])
  else if (mode === 'compare') {
    const [beforePath, afterPath, out] = args
    const files = (path) => JSON.parse(readFileSync(path, 'utf8')).files
    const result = compareSnapshots(files(beforePath), files(afterPath))
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
    console.log(
      `[home] before ${result.filesBefore}, after ${result.filesAfter}, missing ${result.missing.length}, ` +
        `changed stable [${result.changedStable.join(', ')}], changed growing ${result.changedGrowing.length}, ` +
        `required absent [${result.requiredAbsent.join(', ')}], persisted ${result.persisted}`,
    )
    if (!result.persisted) process.exitCode = 1
  } else throw new Error('usage: paperclip-image-home.mjs snapshot <container> <out.json> | compare <before> <after> <out>')
}
