#!/usr/bin/env node
// WBC-02 (WBC-02-CX-0032 §5): what the container's home (/paperclip, a named volume) actually holds, so persistence is
// checked on its contents and not on the volume's existence:
//   node scripts/paperclip-image-home.mjs snapshot <container> <out.json>   every regular file under /paperclip (at most
//                                                                         500, each under 10 MiB): path, size, sha256
//   node scripts/paperclip-image-home.mjs compare <before.json> <after.json> <out.json>
// The comparison passes when the first container wrote files there, every one of them is still there after the
// container was recreated on the same volume, and an instance configuration (instances/*/config.json), if there is
// one, is byte-identical. Other changed files (logs and run records grow) are reported, not judged. Paths and digests
// only: no file's contents leave the container.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [mode, ...args] = process.argv.slice(2)
const GROWS = /(\.log|\.jsonl|\/logs?\/|\/runs?\/)/

if (mode === 'snapshot') {
  const [container, out] = args
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
} else if (mode === 'compare') {
  const [beforePath, afterPath, out] = args
  const before = JSON.parse(readFileSync(beforePath, 'utf8')).files
  const after = new Map(JSON.parse(readFileSync(afterPath, 'utf8')).files.map((f) => [f.path, f]))
  const missing = before.filter((f) => !after.has(f.path)).map((f) => f.path)
  const changed = before.filter((f) => after.has(f.path) && after.get(f.path).sha256 !== f.sha256).map((f) => f.path)
  const configs = before.filter((f) => /^instances\/[^/]+\/config\.json$/.test(f.path)).map((f) => f.path)
  const configChanged = configs.filter((p) => changed.includes(p) || missing.includes(p))
  const result = {
    filesBefore: before.length,
    filesAfter: after.size,
    missing,
    changedGrowing: changed.filter((p) => GROWS.test(p)),
    changedOther: changed.filter((p) => !GROWS.test(p)),
    instanceConfigs: configs,
    persisted: before.length > 0 && missing.length === 0 && configChanged.length === 0,
  }
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(
    `[home] before ${result.filesBefore}, after ${result.filesAfter}, missing ${missing.length}, ` +
      `instance configs ${configs.length} (changed ${configChanged.length}), persisted ${result.persisted}`,
  )
  if (!result.persisted) process.exitCode = 1
} else {
  throw new Error('usage: paperclip-image-home.mjs snapshot <container> <out.json> | compare <before> <after> <out>')
}
