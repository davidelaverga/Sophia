#!/usr/bin/env node
/** A failed canonical check stays failed. This producer only retains a separately reviewable Linux record. */
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONFIG = 'config/runtime-unit.json'
const PROFILE = 'config/dsh/profile/pnpm-lock.yaml'
const FACTS = '.artifacts/identities.json'
const CLOSED = 'db/tests/0110_research_call_observed_facts.sql'
const ROW = 'dsh.artifacts_by_platform.linux-x64'
const PRIMARY = 'dsh.artifact_digest'
const COMMON = [
  'dsh.release_integrity',
  'workspace_lock_sha256',
  'sophia_bundle.archive_sha256',
  'sophia_bundle.archive_integrity',
  'sophia_bundle.artifact_digest',
]
const LOG_LIMIT = 8 * 1024 * 1024
const META_LIMIT = 8 * 1024 * 1024
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const equal = isDeepStrictEqual
const get = (value, path) => path.split('.').reduce((v, key) => v?.[key], value)
const fixedError = () => 'input_unavailable'

function boundedFile(path, limit = META_LIMIT) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > limit) throw new Error('input_bound')
    const bytes = readFileSync(fd)
    if (bytes.length > limit) throw new Error('input_bound')
    return bytes
  } finally {
    closeSync(fd)
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: META_LIMIT })
  if (result.status !== 0) throw new Error('git_metadata_unavailable')
  return result.stdout
}

/** Metadata only for the excluded body and any indexed identical aliases. No git status/diff/body command. */
function tracked() {
  const leaves = git(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [identity, path] = line.split('\t')
      const [mode, type, blob] = identity.split(' ')
      if (type !== 'blob') throw new Error('unsupported_tree_entry')
      return { path, mode, blob }
    })
  if (leaves.length > 10000) throw new Error('source_bound')
  const index = git(['ls-files', '--stage', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [identity, path] = line.split('\t')
      const [mode, blob, stage] = identity.split(' ')
      if (stage !== '0') throw new Error('unmerged_index')
      return { path, mode, blob }
    })
  leaves.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  index.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  if (!equal(leaves, index)) throw new Error('index_changed')
  const denied = leaves.find((leaf) => leaf.path === CLOSED)?.blob
  if (!denied) throw new Error('closed_metadata_missing')
  let total = 0
  const rows = leaves.map((leaf) => {
    if (leaf.path === CLOSED || leaf.blob === denied) return { ...leaf, opaque: true }
    const path = join(ROOT, leaf.path)
    const stat = lstatSync(path)
    const bytes =
      leaf.mode === '120000' && stat.isSymbolicLink()
        ? Buffer.from(readlinkSync(path))
        : stat.isFile() && (leaf.mode === '100644' || leaf.mode === '100755')
          ? boundedFile(path, 16 * 1024 * 1024)
          : null
    if (bytes === null || (leaf.mode !== '120000' && Boolean(stat.mode & 0o111) !== (leaf.mode === '100755')))
      throw new Error('source_mode_changed')
    total += bytes.length
    if (total > 512 * 1024 * 1024) throw new Error('source_bound')
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    return { ...leaf, actual, sha256: sha(bytes) }
  })
  return { rows, clean: rows.every((row) => row.opaque || row.actual === row.blob) }
}

export function outsideSource(source, candidate) {
  const rel = relative(resolve(source), resolve(candidate))
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function identity(path, privateDirectory = false) {
  const value = lstatSync(path, { bigint: true })
  if (!value.isDirectory() || value.isSymbolicLink() || value.uid !== BigInt(process.getuid()))
    throw new Error('unowned_directory')
  if ((value.mode & (privateDirectory ? 0o077n : 0o022n)) !== 0n) throw new Error('directory_permissions')
  return { dev: String(value.dev), ino: String(value.ino), uid: String(value.uid) }
}

export function capturePaths({ source = ROOT, temp, id, attempt, invocation }) {
  if (
    !temp ||
    !isAbsolute(temp) ||
    !/^\d{1,20}$/.test(id ?? '') ||
    !/^\d{1,8}$/.test(attempt ?? '') ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(invocation ?? '')
  )
    throw new Error('ci_identity_missing')
  const canonicalSource = realpathSync(source)
  const parent = resolve(temp)
  if (/[\r\n]/.test(parent) || realpathSync(parent) !== parent || !outsideSource(canonicalSource, parent))
    throw new Error('packet_parent_refused')
  const packet = join(parent, `sophia-linux-runtime-record-${id}-${attempt}-${invocation}`)
  return { source: canonicalSource, parent, packet, scratch: `${packet}.private`, invocation }
}

export function assertLocation(location) {
  if (
    !outsideSource(location.source, location.packet) ||
    !outsideSource(location.source, location.scratch) ||
    realpathSync(location.parent) !== location.parent
  )
    throw new Error('packet_location_changed')
  for (const [key, path, privateDirectory] of [
    ['parentIdentity', location.parent, false],
    ['packetIdentity', location.packet, true],
    ['scratchIdentity', location.scratch, true],
  ]) {
    if (!equal(identity(path, privateDirectory), location[key])) throw new Error('packet_ownership_changed')
  }
}

/** No handle escapes unless BOTH directories were freshly created and their canonical parent is proven. */
export function createLocation(context) {
  const location = capturePaths(context)
  location.parentIdentity = identity(location.parent)
  mkdirSync(location.packet, { mode: 0o700 })
  mkdirSync(location.scratch, { mode: 0o700 })
  location.packetIdentity = identity(location.packet, true)
  location.scratchIdentity = identity(location.scratch, true)
  assertLocation(location)
  return location
}

function context(invocation) {
  return {
    temp: process.env.RUNNER_TEMP,
    id: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    invocation,
  }
}

function outputs(values) {
  const path = process.env.GITHUB_OUTPUT
  if (!path || !isAbsolute(path) || !outsideSource(realpathSync(ROOT), realpathSync(path)))
    throw new Error('step_output_unavailable')
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW)
  try {
    const value = fstatSync(fd)
    if (!value.isFile() || value.uid !== process.getuid()) throw new Error('step_output_unowned')
    writeFileSync(
      fd,
      Object.entries(values)
        .map(([key, entry]) => `${key}=${entry}\n`)
        .join(''),
    )
  } finally {
    closeSync(fd)
  }
}

/** The current step supplies a nonce/hash emitted only after its successful fresh capture. */
export function readCapture(context, expectedHash) {
  if (!/^[0-9a-f]{64}$/.test(expectedHash ?? '')) throw new Error('current_capture_hash_missing')
  const expected = capturePaths(context)
  const current = {
    ...expected,
    parentIdentity: identity(expected.parent),
    packetIdentity: identity(expected.packet, true),
    scratchIdentity: identity(expected.scratch, true),
  }
  assertLocation(current)
  const bytes = boundedFile(join(expected.scratch, 'capture.json'), 24 * 1024 * 1024)
  if (sha(bytes) !== expectedHash) throw new Error('capture_bytes_changed')
  const saved = JSON.parse(bytes)
  if (!equal(saved.location, current)) throw new Error('capture_invocation_changed')
  assertLocation(saved.location)
  return saved
}

function snapshot() {
  const source = tracked()
  return {
    source,
    config: boundedFile(join(ROOT, CONFIG)).toString(),
    profile: boundedFile(join(ROOT, PROFILE)).toString(),
    head: git(['rev-parse', 'HEAD']).trim(),
    tree: git(['rev-parse', 'HEAD^{tree}']).trim(),
    parents: git(['log', '-1', '--format=%P']).trim().split(' ').filter(Boolean),
  }
}

function safeText(text) {
  if (
    Buffer.byteLength(text) > LOG_LIMIT ||
    /-----BEGIN [^-]*PRIVATE KEY|(?:authorization|password|access_token|api_key)["']?\s*[:=]\s*["']?[^\s"',]{12,}/i.test(
      text,
    )
  )
    throw new Error('nonsecret_packet_refused')
  return text
}

function json(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
}

/** Consume exactly the maintained VERIFY block; a copied/stale facts file alone is never authority. */
export function verifyEvidence(log, facts, unit, profilePath) {
  const expectedKeys = [ROW, ...COMMON, ...(unit.dsh?.artifact_primary_platform === 'linux-x64' ? [PRIMARY] : [])]
  const keys = Object.keys(facts)
  if (!equal(keys.toSorted(), expectedKeys.toSorted())) return null
  const lines = log.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
  const start = lines.findIndex((line) =>
    /^(match   |MISMATCH |UNRECORDED )dsh\.artifacts_by_platform\.linux-x64$/.test(line),
  )
  if (start < 0) return null
  let at = start
  const mismatches = []
  for (const key of keys) {
    const header = /^(match   |MISMATCH |UNRECORDED )(.+)$/.exec(lines[at++] ?? '')
    if (!header || header[2] !== key) return null
    const status = header[1].trim()
    const built = lines[at++]
    if (!built?.startsWith('         built    ')) return null
    try {
      if (!equal(JSON.parse(built.slice(18)), facts[key])) return null
    } catch {
      return null
    }
    if (status !== 'match') {
      mismatches.push(key)
      if (status === 'MISMATCH') {
        const recorded = lines[at++]
        if (!recorded?.startsWith('         recorded ')) return null
        try {
          if (!equal(JSON.parse(recorded.slice(18)), get(unit, key))) return null
        } catch {
          return null
        }
      } else {
        if (
          get(unit, key) !== undefined ||
          lines[at++] !==
            '         nothing is recorded for this platform yet (primary: ' +
              unit.dsh.artifact_primary_platform +
              '); record it with `pnpm artifacts:record` in a reviewed commit'
        )
          return null
      }
    } else if (!equal(get(unit, key), facts[key])) return null
  }
  if (lines[at++] !== `match   ${profilePath}`) return null
  if (lines[at] === '') at++
  if (
    lines[at] !== `${mismatches.length} identity mismatch(es): this checkout does not reproduce runtime unit ${unit.id}`
  )
    return null
  const row = facts[ROW]
  if (
    !row ||
    !/^sophia-tree-v2:sha256:[0-9a-f]{64}$/.test(row.digest) ||
    !Number.isSafeInteger(row.entries) ||
    row.entries < 1
  )
    return null
  if (keys.includes(PRIMARY) && facts[PRIMARY] !== row.digest) return null
  if (mismatches.length === 0 || mismatches.some((key) => ![ROW, PRIMARY].includes(key))) return null
  return mismatches
}

export function guard(input) {
  if (input.event !== 'push' || !input.ref?.startsWith('refs/heads/')) return 'not_branch_push'
  if (input.platform !== 'linux' || input.arch !== 'x64') return 'not_linux_x64'
  if (input.outcome !== 'failure' || input.checkStatus !== 1 || !input.checkContained) return 'not_canonical_failure'
  if (input.node !== '24.21.0' || input.pnpm !== '11.7.0') return 'toolchain_mismatch'
  if (
    input.artifactsOverride ||
    input.captureProblem ||
    !input.initialFactsAbsent ||
    input.overflow ||
    !input.before?.source.clean ||
    !input.current?.source.clean
  )
    return 'source_or_capture_unavailable'
  if (
    input.sha !== input.before.head ||
    input.current.head !== input.before.head ||
    input.current.tree !== input.before.tree ||
    !equal(input.before.source, input.current.source)
  )
    return 'source_changed'
  if (input.before.config !== input.current.config || input.before.profile !== input.current.profile)
    return 'source_changed'
  if (!input.facts || !input.log) return 'verify_missing'
  try {
    safeText(input.log)
    if (!verifyEvidence(input.log, input.facts, JSON.parse(input.before.config), input.profilePath))
      return 'verify_not_linux_only'
  } catch {
    return 'verify_not_linux_only'
  }
  return null
}

/** Only these identities may differ; normal generator serialization is checked too. */
export function validateDelta(before, after, facts) {
  if (!equal(after.facts, facts)) return false
  const expected = JSON.parse(before.config)
  expected.dsh.artifacts_by_platform['linux-x64'] = facts[ROW]
  if (expected.dsh.artifact_primary_platform === 'linux-x64') expected.dsh.artifact_digest = facts[PRIMARY]
  if (after.config !== `${JSON.stringify(expected, null, 2)}\n` || after.profile !== before.profile) return false
  if (
    before.head !== after.head ||
    before.tree !== after.tree ||
    before.source.rows.length !== after.source.rows.length
  )
    return false
  return before.source.rows.every((row, index) =>
    row.path === CONFIG ? after.source.rows[index].path === CONFIG : equal(row, after.source.rows[index]),
  )
}

/** Pure orchestration seam: tests inject only fake execution; CLI supplies its actual process/snapshot inputs. */
export async function produce(input, execute, afterSnapshot) {
  const refused = guard(input)
  if (refused) return { state: 'skipped', reason: refused }
  const command = { executable: 'pnpm', args: ['artifacts:record'] }
  const result = await execute(command)
  let after
  try {
    after = afterSnapshot()
  } catch {
    return { state: 'failed', reason: 'after_snapshot_unavailable', command, result }
  }
  if (
    result.status !== 0 ||
    result.signal ||
    result.overflow ||
    result.timedOut ||
    result.lingering ||
    !result.groupGone
  )
    return { state: 'failed', reason: 'normal_record_failed', command, result, after }
  if (!validateDelta(input.before, after, input.facts))
    return { state: 'failed', reason: 'unexpected_generated_delta', command, result, after }
  return { state: 'recorded_unaccepted', command, result, after }
}

export function execute(executable, args, { timeoutMs, forward = false }) {
  return new Promise((resolveResult) => {
    const child = spawn(executable, args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'], detached: true })
    let stdout = '',
      stderr = '',
      combined = '',
      overflow = false,
      timedOut = false,
      receivedSignal = null
    const collect = (key, stream) =>
      stream.on('data', (chunk) => {
        if (forward) (key === 'stdout' ? process.stdout : process.stderr).write(chunk)
        if (Buffer.byteLength(combined) + chunk.length > LOG_LIMIT) overflow = true
        else combined += chunk.toString()
        const current = key === 'stdout' ? stdout : stderr
        if (Buffer.byteLength(current) + chunk.length > LOG_LIMIT) overflow = true
        else if (key === 'stdout') stdout += chunk.toString()
        else stderr += chunk.toString()
      })
    collect('stdout', child.stdout)
    collect('stderr', child.stderr)
    const alive = () => {
      try {
        process.kill(-child.pid, 0)
        return true
      } catch (err) {
        return err.code !== 'ESRCH'
      }
    }
    const signal = (name) => {
      try {
        process.kill(-child.pid, name)
      } catch {}
    }
    let force
    const forwardSignal = (name) => {
      receivedSignal = name
      signal(name)
      force ??= setTimeout(() => signal('SIGKILL'), 2000)
    }
    const terminate = () => forwardSignal('SIGTERM')
    const interrupt = () => forwardSignal('SIGINT')
    process.once('SIGTERM', terminate)
    process.once('SIGINT', interrupt)
    const timer = setTimeout(() => {
      timedOut = true
      signal('SIGTERM')
      force = setTimeout(() => signal('SIGKILL'), 2000)
    }, timeoutMs)
    child.on('error', () => {
      stderr = 'command_spawn_failed'
      child.stdout.destroy()
      child.stderr.destroy()
    })
    child.on('close', async (status, killed) => {
      clearTimeout(timer)
      clearTimeout(force)
      process.off('SIGTERM', terminate)
      process.off('SIGINT', interrupt)
      process.removeListener('SIGTERM', terminate)
      process.removeListener('SIGINT', interrupt)
      const lingering = alive()
      if (lingering) {
        signal('SIGTERM')
        await new Promise((done) => setTimeout(done, 100))
        if (alive()) signal('SIGKILL')
      }
      resolveResult({
        status,
        signal: receivedSignal ?? killed,
        stdout,
        stderr,
        combined,
        overflow,
        timedOut,
        groupGone: !alive(),
        lingering,
      })
    })
  })
}

function validateSelected(value, depth = 0, budget = { left: 200000 }) {
  if (--budget.left < 0 || depth > 20) throw new Error('payload_bound')
  if (typeof value === 'string') safeText(value)
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      safeText(key)
      validateSelected(item, depth + 1, budget)
    }
}

/** Validate ALL selected raw fields before the first payload write, including unexpected after.profile. */
export function exportPacket(location, input, receipt) {
  assertLocation(location)
  const emit = (name, value, raw = false) => {
    assertLocation(location)
    if (raw) writeFileSync(join(location.packet, name), value, { flag: 'wx', mode: 0o600 })
    else json(join(location.packet, name), value)
    assertLocation(location)
  }
  const status = receipt.result
    ? {
        command: receipt.command,
        status: receipt.result.status,
        signal: receipt.result.signal,
        overflow: receipt.result.overflow,
        timedOut: receipt.result.timedOut,
        groupGone: receipt.result.groupGone,
        lingering: receipt.result.lingering,
      }
    : undefined
  const metadata = {
    invocation: location.invocation,
    head: input.before?.head,
    tree: input.before?.tree,
    parents: input.before?.parents,
    event: input.event,
    ref: input.ref,
    sha: input.sha,
    platform: input.platform,
    arch: input.arch,
    node: input.node,
    pnpm: input.pnpm,
    canonicalExit: input.checkStatus,
  }
  const payloads =
    receipt.state === 'skipped'
      ? {}
      : {
          'verify.log': input.log,
          'before.json': {
            config: input.before.config,
            profile: input.before.profile,
            facts: input.facts,
            source: input.before.source,
          },
          ...(receipt.after ? { 'after.json': receipt.after } : {}),
          'record.stdout': receipt.result.stdout,
          'record.stderr': receipt.result.stderr,
        }
  let refused = false
  try {
    validateSelected(metadata)
    validateSelected(payloads)
  } catch {
    refused = true
  }
  const hashes = Object.fromEntries(
    Object.entries(payloads).map(([key, value]) => {
      try {
        return [key, sha(typeof value === 'string' ? value : JSON.stringify(value))]
      } catch {
        return [key, 'unavailable']
      }
    }),
  )
  const final = refused
    ? { state: 'failed', reason: 'payload_refused', originalState: receipt.state, originalReason: receipt.reason }
    : { state: receipt.state, reason: receipt.reason }
  // These are fixed metadata/hash-only diagnostics; no rejected raw field reaches a packet file.
  emit('record-status.json', status ?? { command: null, state: receipt.state })
  emit('field-hashes.json', hashes)
  if (!refused) {
    emit('metadata.json', metadata)
    for (const [name, value] of Object.entries(payloads)) emit(name, value, typeof value === 'string')
    if (receipt.state !== 'skipped')
      emit('canonical-capture.json', {
        exit: input.checkStatus,
        initialFactsAbsent: input.initialFactsAbsent,
        overflow: input.overflow,
        sourceClean: input.before.source.clean,
        invocation: location.invocation,
      })
    if (receipt.state === 'recorded_unaccepted')
      emit('linux-identity-diff.json', {
        before: get(JSON.parse(input.before.config), ROW),
        after: get(JSON.parse(receipt.after.config), ROW),
        primaryBefore: get(JSON.parse(input.before.config), PRIMARY),
        primaryAfter: get(JSON.parse(receipt.after.config), PRIMARY),
      })
  }
  emit('receipt.json', final)
  return final
}

/** Local tests inject fake check/snapshot/output functions; CLI binds its actual context and fixed command. */
export async function captureInvocation({
  context: inputContext,
  takeSnapshot,
  check,
  publish,
  initialFactsAbsent,
  artifactsOverride = false,
}) {
  let location, before
  try {
    const candidate = createLocation(inputContext)
    const source = takeSnapshot()
    assertLocation(candidate)
    location = candidate
    before = source
  } catch {
    /* No handle escapes partial creation or a failed pre-check snapshot. */
  }
  const result = await check({ executable: 'pnpm', args: ['check'] })
  let ready = false
  try {
    if (!location) throw new Error('capture_unavailable')
    assertLocation(location)
    const path = join(location.scratch, 'capture.json')
    json(path, { location, before, initialFactsAbsent, captureProblem: null, artifactsOverride, result })
    assertLocation(location)
    const digest = sha(boundedFile(path, 24 * 1024 * 1024))
    publish({ capture_id: inputContext.invocation, capture_sha256: digest, capture_ready: 'true' })
    ready = true
  } catch {
    /* No current-step readiness is emitted without a successful fresh capture. */
  }
  return { result, ready, ...(ready ? { location } : {}) }
}

async function capture(script) {
  if (boundedFile(script, 1024).toString().trim() !== 'pnpm check') throw new Error('unexpected_check_command')
  const captured = await captureInvocation({
    context: context(randomUUID()),
    takeSnapshot: snapshot,
    check: (command) => execute(command.executable, command.args, { timeoutMs: 25 * 60 * 1000, forward: true }),
    publish: outputs,
    initialFactsAbsent: !existsSync(join(ROOT, FACTS)),
    artifactsOverride: process.env.SOPHIA_ARTIFACTS_DIR !== undefined,
  })
  if (!captured.ready)
    console.error('Linux runtime record: current capture unavailable; no record or upload is qualified')
  const result = captured.result
  process.exitCode =
    result.signal === 'SIGTERM'
      ? 143
      : result.signal === 'SIGINT'
        ? 130
        : Number.isInteger(result.status)
          ? result.status
          : 1
}

async function main() {
  const [mode, script] = process.argv.slice(2)
  if (mode === 'capture') return capture(script)
  if (mode !== 'produce') throw new Error('unsupported_mode')
  if (process.env.SOPHIA_CAPTURE_READY !== 'true') throw new Error('current_capture_missing')
  const saved = readCapture(context(process.env.SOPHIA_CAPTURE_ID), process.env.SOPHIA_CAPTURE_SHA256)
  const location = saved.location
  let final
  try {
    const pnpm = spawnSync('pnpm', ['--version'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 })
    const input = {
      ...saved,
      checkStatus: saved.result.status,
      checkContained:
        saved.result.groupGone && !saved.result.lingering && !saved.result.signal && !saved.result.timedOut,
      overflow: saved.result.overflow,
      event: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
      outcome: process.env.SOPHIA_CANONICAL_OUTCOME,
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      pnpm: pnpm.status === 0 ? pnpm.stdout.trim() : null,
      current: snapshot(),
      facts: JSON.parse(boundedFile(join(ROOT, FACTS), 128 * 1024)),
      log: saved.result.combined,
      profilePath: join(ROOT, PROFILE),
    }
    assertLocation(location)
    const receipt = await produce(
      input,
      (command) => {
        assertLocation(location)
        return execute(command.executable, command.args, { timeoutMs: 40000 })
      },
      () => ({ ...snapshot(), facts: JSON.parse(boundedFile(join(ROOT, FACTS), 128 * 1024)) }),
    )
    final = exportPacket(location, input, receipt)
  } catch {
    // Only a proven current handle may retain even a fixed diagnostic. Never recreate or reset old directories.
    assertLocation(location)
    json(join(location.packet, 'receipt.json'), { state: 'failed', reason: fixedError() })
    final = { state: 'failed', reason: fixedError() }
  }
  assertLocation(location)
  outputs({ packet_path: location.packet, packet_ready: 'true' })
  console.log(`Linux runtime record: ${final.state}; canonical failure is unchanged`)
  if (final.state === 'failed') process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error('Linux runtime record: input_unavailable; no packet is qualified for upload')
    process.exitCode = 1
  })
