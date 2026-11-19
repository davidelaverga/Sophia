#!/usr/bin/env node
import { HttpHostChannel, readOwnerSecret, ownerHostOrigin } from '../packages/coordination/src/owner-host-http.ts'
import { T3McpTransport } from '../packages/coordination/src/t3-mcp-transport.ts'
import { RunnerGateway, type GatewayProfile } from '../packages/coordination/src/runner-gateway.ts'
import { OwnerHostAgent } from '../packages/coordination/src/owner-host-agent.ts'
import type { RunnerSourcePolicy, SophiaRunnerPort } from '../packages/coordination/src/runner-port.ts'
// The owner-host CLI (INC01-CC-003 S1a; docs/plans/owner-host-transport.md). Run on the owner's own machine.
//   node scripts/owner-host.ts check      --config <file>   validate the configuration and its files; print the hello
//   node scripts/owner-host.ts capability --config <file>   make this host's capability in its file (0600, never replaced)
//   node scripts/owner-host.ts redeem     --config <file> --code-file <file>   retry ambiguous replies with these same files
//   node scripts/owner-host.ts run        --config <file>   serve only the explicitly selected local profile and durable journal
// Paths only on the command line: the T3 bearer, the capability and a pairing code are read from files (or, later, from
// standard input), never from argv, never printed and never logged. `check` opens the gateway journal (creating it on
// first use) under its lock, to report its durable id; it calls neither Sophia nor T3.
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { helloRefusal, isSecret, newSecret, type HostHello } from '../packages/coordination/src/owner-host-channel.ts'
import { RunnerJournal } from '../packages/coordination/src/runner-journal.ts'
import { loopbackRefusal } from '../packages/coordination/src/t3-mcp-transport.ts'

interface HostConfig {
  /** T3's MCP endpoint on this machine (loopback). */
  t3Url: string
  /** The T3 environment this host serves. */
  environmentRef: string
  /** T3's request namespace for this host's sign-in: `client:<auth session id>`, declared, never derived. */
  t3Namespace: string
  adapterPin: string
  profileId: string
  profileRevision: number
  accountKey: string
  /** Absolute paths. The token and capability files must be readable by this user only. */
  tokenFile: string
  capabilityFile: string
  journalFile: string
  run?: { sophiaOrigin: string; gatewayProfileFile: string; collectionVersion: 1 | null; loopbackTest: boolean }
}

const KEYS = [
  't3Url',
  'environmentRef',
  't3Namespace',
  'adapterPin',
  'profileId',
  'profileRevision',
  'accountKey',
  'tokenFile',
  'capabilityFile',
  'journalFile',
] as const

function fail(message: string): never {
  console.error(`owner-host: ${message}`)
  process.exit(1)
}

const ZERO = '00000000-0000-0000-0000-000000000000'
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The configuration, every field checked: the identity as a hello is, the URL as loopback, the paths absolute. */
function loadConfig(file: string): HostConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    fail('the configuration is not readable JSON')
  }
  if (!isRecord(parsed)) fail('the configuration is not an object')
  const runKeys = ['sophiaOrigin', 'gatewayProfileFile', 'collectionVersion', 'loopbackTest']
  const withRun = Object.keys(parsed).toSorted().join(',') === [...KEYS, ...runKeys].toSorted().join(',')
  if (!withRun && Object.keys(parsed).toSorted().join(',') !== [...KEYS].toSorted().join(','))
    fail(`the configuration has exactly the fields ${[...KEYS].join(', ')}`)
  const {
    t3Url,
    tokenFile,
    capabilityFile,
    journalFile,
    environmentRef,
    adapterPin,
    profileId,
    accountKey,
    t3Namespace,
  } = parsed
  const { profileRevision } = parsed
  const paths = { tokenFile, capabilityFile, journalFile }
  for (const [k, v] of Object.entries(paths))
    if (typeof v !== 'string' || !isAbsolute(v)) fail(`${k} must be an absolute path`)
  if (typeof t3Url !== 'string') fail('t3Url is not a URL')
  const url = loopbackRefusal(t3Url)
  if (url) fail(`t3Url is refused: ${url}`)
  const identity = { environmentRef, adapterPin, profileId, profileRevision, accountKey, t3Namespace }
  const refusal = helloRefusal({ v: 1, journalId: ZERO, ...identity })
  if (refusal) fail(`the host identity is refused: ${refusal}`)
  return {
    t3Url,
    environmentRef: String(environmentRef),
    t3Namespace: String(t3Namespace),
    adapterPin: String(adapterPin),
    profileId: String(profileId),
    profileRevision: Number(profileRevision),
    accountKey: String(accountKey),
    tokenFile: String(tokenFile),
    capabilityFile: String(capabilityFile),
    journalFile: String(journalFile),
    ...(withRun ? { run: runConfig(parsed) } : {}),
  }
}

/** A secret file: present, a regular file, this user's only (no group or other bits). Its content is not printed. */
function privateFileRefusal(file: string): string | null {
  if (!existsSync(file)) return 'missing'
  const s = statSync(file)
  if (!s.isFile()) return 'not a regular file'
  if ((s.mode & 0o077) !== 0) return 'readable by others: chmod 600'
  if (typeof process.getuid === 'function' && (typeof process.getuid !== 'function' || s.uid !== process.getuid()))
    return 'not owned by this user'
  return null
}

function helloOf(c: HostConfig, journalId: string): HostHello {
  return {
    v: 1,
    journalId,
    environmentRef: c.environmentRef,
    adapterPin: c.adapterPin,
    profileId: c.profileId,
    profileRevision: c.profileRevision,
    accountKey: c.accountKey,
    t3Namespace: c.t3Namespace,
  }
}

function check(c: HostConfig) {
  const problems: string[] = []
  const token = privateFileRefusal(c.tokenFile)
  if (token) problems.push(`tokenFile: ${token}`)
  const capability = privateFileRefusal(c.capabilityFile)
  if (capability) problems.push(`capabilityFile: ${capability}`)
  else if (!isSecret(readFileSync(c.capabilityFile, 'utf8').trim()))
    problems.push('capabilityFile: not a capability made by this CLI')
  let journal: RunnerJournal | null = null
  try {
    journal = new RunnerJournal(c.journalFile)
    const hello = helloOf(c, journal.id)
    const refusal = helloRefusal(hello)
    if (refusal) problems.push(`hello: ${refusal}`)
    else console.log(JSON.stringify({ hello }, null, 2))
  } catch (err) {
    problems.push(`journalFile: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300))
  } finally {
    journal?.close()
  }
  if (problems.length > 0) fail(problems.join('; '))
  console.log('owner-host: configuration ok (nothing was sent to Sophia or T3)')
}

/** An error's code only (EIO, ENOSPC, …): never its message, which may name a private path. */
const codeOf = (err: unknown): string =>
  err instanceof Error && 'code' in err && typeof err.code === 'string' && /^E[A-Z0-9]{1,15}$/.test(err.code)
    ? err.code
    : 'no valid progress'

/**
 * Every byte of `bytes` from the start of the new file (Native14, NATIVE13-F01). A positive short write continues from
 * the byte it stopped at; progress that is not a whole number in 1..remaining throws, so the loop is bounded.
 */
function writeWhole(fd: number, bytes: Buffer): void {
  let done = 0
  while (done < bytes.length) {
    const left = bytes.length - done
    const n = writeSync(fd, bytes, done, left, done)
    if (!Number.isSafeInteger(n) || n < 1 || n > left) throw new Error('owner-host: a write made no valid progress')
    done += n
  }
}

/**
 * Remove a failed initialization's file only while the path still names the inode this run created (a regular file,
 * same device and inode), with its descriptor still open. A replacement or a symbolic link is left in place. Repair 1
 * (NATIVE14-F01): a path that cannot be inspected is left in place without removal advice; only a confirmed own file
 * whose unlink failed is the owner's to remove.
 */
function removeOwnIncomplete(file: string, created: { dev: number; ino: number }): string {
  let named: ReturnType<typeof lstatSync>
  try {
    named = lstatSync(file)
  } catch (err) {
    return `the path could not be inspected (${codeOf(err)}), so it was left in place; inspect it before any retry`
  }
  if (!named.isFile() || named.dev !== created.dev || named.ino !== created.ino)
    return 'the path no longer names the file this run created; it was left in place'
  try {
    unlinkSync(file)
  } catch (err) {
    return `the incomplete file could not be removed (${codeOf(err)}); remove it, then run capability again`
  }
  return 'the incomplete file was removed; run capability again'
}

/** Close a descriptor on a failure path; a close error never replaces the error being reported. */
function closeQuietly(fd: number): void {
  try {
    closeSync(fd)
  } catch {
    // The original error is the one reported.
  }
}

const UNVERIFIED =
  'its identity could not be read, so the path was left in place unverified; inspect it before any retry ' +
  '(check reports what is there)'

/**
 * Make this host's capability (Native14, NATIVE13-F01; docs/plans/owner-host-transport.md). Created exclusively, mode
 * 0600, never replaced. Its 44 bytes are written whole and fsynced before success; then the file is closed and its
 * directory fsynced. A write or file-fsync failure is a failed initialization: never announced, and this run's own
 * file is removed so that an ordinary retry works. A complete, flushed file is never removed: a later close or
 * directory-sync failure keeps it and says so. Only fixed text and an error code are printed, never the value or a path.
 */
function makeCapability(c: HostConfig) {
  if (existsSync(c.capabilityFile))
    fail('capabilityFile exists: a capability is never replaced; pair again as a new host')
  // Repair 1 (NATIVE14-F01): the secret exists before anything is created, so nothing can fail between the create
  // and the guard below.
  let bytes: Buffer
  try {
    bytes = Buffer.from(`${newSecret()}\n`, 'utf8')
  } catch (err) {
    fail(`capability could not be generated (${codeOf(err)}); nothing was created`)
  }
  let fd: number
  try {
    fd = openSync(c.capabilityFile, 'wx', 0o600)
  } catch (err) {
    bytes.fill(0)
    fail(`capabilityFile could not be created (${codeOf(err)}); nothing was written`)
  }
  // Every step after the create is guarded: the identity read, the writes and the file's fsync. Without an identity,
  // nothing is unlinked.
  let created: { dev: number; ino: number } | null = null
  try {
    created = fstatSync(fd)
    writeWhole(fd, bytes)
    fsyncSync(fd)
  } catch (err) {
    bytes.fill(0)
    const outcome = created === null ? UNVERIFIED : removeOwnIncomplete(c.capabilityFile, created)
    closeQuietly(fd)
    fail(`capability not written (${codeOf(err)}): ${outcome}`)
  }
  bytes.fill(0)
  try {
    closeSync(fd)
  } catch (err) {
    fail(`the capability was written and flushed, but closing it failed (${codeOf(err)}); run check before pairing`)
  }
  try {
    const dir = openSync(dirname(c.capabilityFile), 'r')
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
  } catch (err) {
    fail(
      `the capability was written and flushed, but its directory was not synced (${codeOf(err)}); run check before pairing`,
    )
  }
  console.log('owner-host: capability written (its value is not shown)')
}

function refuseRun(message: string): never {
  throw new Error(message)
}
function runConfig(v: Record<string, unknown>): NonNullable<HostConfig['run']> {
  if (
    typeof v.sophiaOrigin !== 'string' ||
    typeof v.gatewayProfileFile !== 'string' ||
    !isAbsolute(v.gatewayProfileFile) ||
    typeof v.loopbackTest !== 'boolean' ||
    (v.collectionVersion !== 1 && v.collectionVersion !== null)
  )
    refuseRun('run configuration refused')
  ownerHostOrigin(v.sophiaOrigin, v.loopbackTest)
  return {
    sophiaOrigin: v.sophiaOrigin,
    gatewayProfileFile: v.gatewayProfileFile,
    collectionVersion: v.collectionVersion,
    loopbackTest: v.loopbackTest,
  }
}
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).toSorted().join(',') === keys.toSorted().join(',')
const ref = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v)
function privateJson(file: string): unknown {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const s = fstatSync(fd)
    if (
      !s.isFile() ||
      typeof process.getuid !== 'function' ||
      s.uid !== process.getuid() ||
      (s.mode & 0o077) !== 0 ||
      s.size > 65_536
    )
      refuseRun('private profile refused')
    return JSON.parse(readFileSync(fd, 'utf8'))
  } finally {
    closeSync(fd)
  }
}
function sourcePolicy(value: unknown): RunnerSourcePolicy {
  if (
    !isRecord(value) ||
    !exact(value, ['v', 'instanceId', 'models']) ||
    value.v !== 1 ||
    !ref(value.instanceId) ||
    !Array.isArray(value.models) ||
    value.models.length > 20
  )
    refuseRun('source policy refused')
  const models = value.models.map((model: unknown) => {
    if (
      !isRecord(model) ||
      !exact(model, ['model', 'options']) ||
      !ref(model.model) ||
      !Array.isArray(model.options) ||
      model.options.length > 20
    )
      refuseRun('source policy refused')
    const options = model.options.map((option: unknown) => {
      if (
        !isRecord(option) ||
        !exact(option, ['id', 'values']) ||
        !ref(option.id) ||
        !Array.isArray(option.values) ||
        option.values.length > 20
      )
        refuseRun('source policy refused')
      const values = option.values.map((item: unknown) => {
        if (typeof item !== 'boolean' && !ref(item)) refuseRun('source policy refused')
        return item
      })
      return { id: option.id, values }
    })
    return { model: model.model, options }
  })
  return { v: 1, instanceId: value.instanceId, models }
}
function profileIdentity(p: Record<string, unknown>, c: HostConfig, journalId: string): string {
  if (
    typeof p.ownerId !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(p.ownerId) ||
    p.journalId !== journalId
  )
    refuseRun('gateway profile identity refused')
  for (const key of [
    'environmentRef',
    'adapterPin',
    'profileId',
    'profileRevision',
    'accountKey',
    't3Namespace',
  ] as const)
    if (p[key] !== c[key]) refuseRun('gateway profile identity refused')
  return p.ownerId
}
function trustedProfile(c: HostConfig, journalId: string): GatewayProfile {
  if (!c.run) refuseRun('redeem/run requires the complete local run configuration')
  const p = privateJson(c.run.gatewayProfileFile)
  const fields = [
    'ownerId',
    'environmentRef',
    'adapterPin',
    'profileId',
    'profileRevision',
    'accountKey',
    'journalId',
    't3Namespace',
    'nativeProjectRefs',
    'operations',
  ]
  if (!isRecord(p)) refuseRun('gateway profile refused')
  if (!exact(p, 'sourcePolicy' in p ? [...fields, 'sourcePolicy'] : fields)) refuseRun('gateway profile refused')
  const ownerId = profileIdentity(p, c, journalId)
  if (!Array.isArray(p.nativeProjectRefs) || p.nativeProjectRefs.length > 20 || !p.nativeProjectRefs.every(ref))
    refuseRun('gateway projects refused')
  if (!Array.isArray(p.operations) || p.operations.length === 0 || p.operations.length > 3)
    refuseRun('gateway operations refused')
  const operations = p.operations.map((op: unknown) => {
    if (op !== 'create' && op !== 'input' && op !== 'stop') refuseRun('gateway operations refused')
    return op
  })
  return {
    ownerId,
    environmentRef: c.environmentRef,
    adapterPin: c.adapterPin,
    profileId: c.profileId,
    profileRevision: c.profileRevision,
    accountKey: c.accountKey,
    nativeProjectRefs: new Set(p.nativeProjectRefs),
    operations: new Set(operations),
    ...('sourcePolicy' in p ? { sourcePolicy: sourcePolicy(p.sourcePolicy) } : {}),
  }
}

function localGateway(
  c: HostConfig,
  journal: RunnerJournal,
  profile: GatewayProfile,
  fence: () => void,
): SophiaRunnerPort {
  if (!c.run) refuseRun('run configuration required')
  const transport = new T3McpTransport({
    url: c.t3Url,
    environmentId: c.environmentRef,
    namespace: c.t3Namespace,
    bearer: () => readOwnerSecret(c.tokenFile),
    timeoutMs: 10_000,
    // N's transport may initialize or renew within one call. Fence every next HTTP dispatch, while draining one
    // already in flight; a possibly sent operation still receives N's honest unknown outcome.
    fetch: (...args) => {
      fence()
      return fetch(...args)
    },
  })
  const gateway = new RunnerGateway({
    journal,
    transport: {
      namespace: () => transport.namespace(),
      call: (...args) => {
        fence()
        return transport.call(...args)
      },
    },
    profile,
    ...(c.run.collectionVersion === 1 ? { collectionVersion: 1 } : {}),
  })
  const port: SophiaRunnerPort = {
    journalId: journal.id,
    send: (...args) => {
      fence()
      return gateway.send(...args)
    },
    reconcile: (...args) => {
      fence()
      return gateway.reconcile(...args)
    },
    observe: (...args) => {
      fence()
      return gateway.observe(...args)
    },
    ...(c.run.collectionVersion === 1
      ? {
          collectionVersion: 1 as const,
          collect: (...args: Parameters<NonNullable<SophiaRunnerPort['collect']>>) => {
            fence()
            return gateway.collect(...args)
          },
        }
      : {}),
  }
  return port
}
async function runAgent(
  c: HostConfig,
  journal: RunnerJournal,
  profile: GatewayProfile,
  channel: HttpHostChannel,
  controller: AbortController,
): Promise<void> {
  const fence = () => {
    if (controller.signal.aborted) throw new Error('Owner host stopping')
  }
  const port = localGateway(c, journal, profile, fence)
  const agent = new OwnerHostAgent({
    journal,
    gateway: port,
    hello: helloOf(c, journal.id),
    pollLimit: 1,
    channel: {
      hello: (...args) => {
        fence()
        return channel.hello(...args)
      },
      poll: (...args) => {
        fence()
        return channel.poll(...args)
      },
      go: async (...args) => {
        fence()
        const value = await channel.go(...args)
        fence()
        return value
      },
      answer: (...args) => channel.answer(...args),
    },
  })
  await agent.run(controller.signal)
}

/** Shutdown fences each next poll/GO/send; an already executing gateway call drains before the journal closes. */
async function runHost(c: HostConfig, redeemFile?: string): Promise<void> {
  if (!c.run) refuseRun('redeem/run requires the complete local run configuration')
  const journal = new RunnerJournal(c.journalFile)
  const controller = new AbortController()
  const stop = () => controller.abort()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop)
  try {
    const profile = trustedProfile(c, journal.id)
    const channel = new HttpHostChannel({
      origin: c.run.sophiaOrigin,
      capabilityFile: c.capabilityFile,
      loopbackTest: c.run.loopbackTest,
    })
    if (redeemFile) {
      const redeemed = await channel.redeem(readOwnerSecret(redeemFile))
      if (redeemed.result !== 'bound' || redeemed.ownerId !== profile.ownerId)
        refuseRun('pairing refused or identity unknown; retry only with the same code and capability')
      console.log('owner-host: pairing bound (declared identity remains unqualified)')
      return
    }
    await runAgent(c, journal, profile, channel, controller)
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.removeListener(signal, stop)
    journal.close()
  }
}
async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { config: { type: 'string' }, 'code-file': { type: 'string' } },
  })
  const [command] = positionals
  if (positionals.length !== 1 || !values.config) fail('--config <file> and one command are required')
  if (values['code-file'] && (command !== 'redeem' || !isAbsolute(values['code-file'])))
    fail('--code-file is an absolute path for redeem only')
  const config = loadConfig(values.config)
  if (command === 'check') check(config)
  else if (command === 'capability') makeCapability(config)
  else if (command === 'redeem') {
    if (!values['code-file']) fail('redeem requires --code-file <file>')
    await runHost(config, values['code-file'])
  } else if (command === 'run') await runHost(config)
  else fail('usage: owner-host.ts check|capability|redeem|run --config <file>')
}
void main().catch(() => {
  console.error('owner-host: request failed; outcome unknown, retain the same capability and journal')
  process.exitCode = 1
})
