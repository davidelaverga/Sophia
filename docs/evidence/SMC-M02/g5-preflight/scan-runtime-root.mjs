#!/usr/bin/env node
/**
 * SMC-M02 G5 preflight: a read-only scan of a copied dsh runtime root.
 *
 *   node scan-runtime-root.mjs <root-or-dsh-home> [--manifest <out.json>]
 *
 * Point it at the state copy (CC-0005 §2, C1–C2), never the live root. It opens every file read-only, writes nothing
 * under <root>, and prints counts, ids and types only: no message, prompt, tool argument or result text, and no path
 * outside <root>. With --manifest it also writes the relative path, size and SHA-256 of every file under <root>, so
 * two copies (or a copy and the live root at a later moment) can be compared byte for byte.
 *
 * Self-contained on Node 24 (node:zlib has Zstandard); it imports nothing from the repository, so it can run on the
 * runtime host from a copy whose SHA-256 is checked against the committed file.
 *
 * Per native session log (`sessions/<workspace>/<session>/session.v4.jsonl.zstd`):
 *   decoded      the whole Zstandard container decodes and every line parses
 *   events       count, and the type of the last event
 *   turns        turn/end count by reason kind
 *   requested    tool-call ids the model requested (assistant/message content)
 *   unpaired     requested ids with no tool/result: a history the provider would refuse, which 0.1.7's failed-step
 *                path leaves (M02-T10) and both units refuse to resume (log-compat)
 *   open_turn    the log ends inside a turn (a turn/start after the last turn/end)
 * Per bridge journal (`sophia-bridge/<session>.jsonl`): records, fence and its authority epoch, commands by kind,
 * commands with no `sophia/settled`, and whether an execution identity (`sophia/identity`, M02 only) is recorded.
 * Profiles: which of `profiles/<name>` and `profiles/.<name>.previous` exist, and the SHA-256 of each one's lock.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { constants, zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** dsh's container of concatenated Zstandard frames (tests/support/native-log.mjs, same algorithm). */
function decodeFrames(buffer) {
  const starts = []
  for (let at = buffer.indexOf(MAGIC); at !== -1; at = buffer.indexOf(MAGIC, at + 1)) starts.push(at)
  if (starts[0] !== 0) throw new Error('not a Zstandard container')
  const parts = []
  let start = 0
  for (let i = 1; i <= starts.length; i += 1) {
    const end = i < starts.length ? starts[i] : buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(start, end)))
      start = end
    } catch {
      if (i < starts.length) continue
      parts.push(zstdDecompressSync(buffer.subarray(start), { finishFlush: constants.ZSTD_e_flush }))
    }
  }
  return Buffer.concat(parts)
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const tally = (values) => Object.fromEntries([...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort())
const list = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : [])

function scanSession(file) {
  const out = { bytes: statSync(file).size, decoded: false }
  let events
  try {
    events = decodeFrames(readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  } catch (error) {
    return { ...out, error: error instanceof SyntaxError ? 'a line does not parse' : 'the container does not decode' }
  }
  const requested = events
    .filter((e) => e.type === 'assistant/message')
    .flatMap((e) => (e.data?.message?.content ?? []).filter((b) => b?.type === 'tool-call').map((b) => b.id))
  const answered = new Set(events.filter((e) => e.type === 'tool/result').map((e) => e.data?.message?.toolCallId))
  const lastStart = events.findLastIndex((e) => e.type === 'turn/start')
  const lastEnd = events.findLastIndex((e) => e.type === 'turn/end')
  return {
    ...out,
    decoded: true,
    events: events.length,
    last_type: events.at(-1)?.type ?? null,
    turns: tally(events.filter((e) => e.type === 'turn/end').map((e) => e.data?.reason?.kind ?? 'unknown')),
    requested: requested.length,
    results: answered.size,
    unpaired: requested.filter((id) => !answered.has(id)).length,
    open_turn: lastStart > lastEnd,
  }
}

function scanJournal(file) {
  const records = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const commands = records.filter((r) => r.type === 'sophia/command')
  const settled = new Set(records.filter((r) => r.type === 'sophia/settled').map((r) => r.data?.commandId))
  let fence = 'active'
  let epoch = null
  for (const r of records) {
    if (r.type === 'sophia/command' && typeof r.data?.authorityEpoch === 'number') epoch = r.data.authorityEpoch
    if (r.type === 'sophia/fence' && fence !== 'stopped') fence = r.data?.state ?? fence
  }
  return {
    records: records.length,
    fence,
    authority_epoch: epoch,
    commands: tally(commands.map((r) => r.data?.kind ?? 'unknown')),
    unsettled_commands: commands.filter((r) => !settled.has(r.data?.commandId)).length,
    identity: records.some((r) => r.type === 'sophia/identity'),
  }
}

function manifest(root) {
  const rows = []
  const walk = (dir) => {
    for (const name of list(dir)) {
      const path = join(dir, name)
      const stat = statSync(path, { throwIfNoEntry: false })
      if (!stat) continue
      if (stat.isDirectory()) walk(path)
      else if (stat.isFile()) rows.push({ path: relative(root, path), bytes: stat.size, sha256: sha256(readFileSync(path)) })
    }
  }
  walk(root)
  return rows
}

const [target, flag, out] = process.argv.slice(2)
if (!target || (flag && (flag !== '--manifest' || !out))) {
  console.error('usage: node scan-runtime-root.mjs <root-or-dsh-home> [--manifest <out.json>]')
  process.exit(2)
}
const root = resolve(target)
const dshHome = existsSync(join(root, 'dsh-home')) ? join(root, 'dsh-home') : root

const sessions = []
for (const workspace of list(join(dshHome, 'sessions'))) {
  for (const session of list(join(dshHome, 'sessions', workspace))) {
    const file = join(dshHome, 'sessions', workspace, session, 'session.v4.jsonl.zstd')
    if (existsSync(file)) sessions.push({ session, ...scanSession(file) })
  }
}
const journals = list(join(dshHome, 'sophia-bridge'))
  .filter((name) => name.endsWith('.jsonl'))
  .map((name) => ({ session: name.slice(0, -'.jsonl'.length), ...scanJournal(join(dshHome, 'sophia-bridge', name)) }))
const profiles = list(join(dshHome, 'profiles')).map((name) => {
  const lock = join(dshHome, 'profiles', name, 'pnpm-lock.yaml')
  return { name, lock_sha256: existsSync(lock) ? sha256(readFileSync(lock)) : null }
})

const report = {
  schema: 'sophia.smc-m02.runtime-root-scan.v1',
  profiles,
  sessions,
  journals,
  totals: {
    sessions: sessions.length,
    undecodable: sessions.filter((s) => !s.decoded).length,
    with_unpaired_calls: sessions.filter((s) => s.unpaired > 0).length,
    open_turns: sessions.filter((s) => s.open_turn).length,
    journals: journals.length,
    fences: tally(journals.map((j) => j.fence)),
    unsettled_commands: journals.reduce((n, j) => n + j.unsettled_commands, 0),
    journals_without_session_log: journals.filter((j) => !sessions.some((s) => s.session === j.session)).length,
  },
}
if (out) {
  const rows = manifest(root)
  writeFileSync(out, `${JSON.stringify({ root: '<root>', files: rows.length, rows }, null, 2)}\n`)
  report.manifest = { files: rows.length, sha256: sha256(Buffer.from(JSON.stringify(rows))) }
}
console.log(JSON.stringify(report, null, 2))
