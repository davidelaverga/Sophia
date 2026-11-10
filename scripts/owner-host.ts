#!/usr/bin/env node
// The owner-host CLI (INC01-CC-003 S1a; docs/plans/owner-host-transport.md). Run on the owner's own machine.
//   node scripts/owner-host.ts check      --config <file>   validate the configuration and its files; print the hello
//   node scripts/owner-host.ts capability --config <file>   make this host's capability in its file (0600, never replaced)
//   node scripts/owner-host.ts redeem     --config <file>   refused: no Sophia owner-host route is mounted yet
//   node scripts/owner-host.ts run        --config <file>   refused: no Sophia owner-host route is mounted yet
// Paths only on the command line: the T3 bearer, the capability and a pairing code are read from files (or, later, from
// standard input), never from argv, never printed and never logged. `check` opens the gateway journal (creating it on
// first use) under its lock, to report its durable id; it calls neither Sophia nor T3.
import { closeSync, existsSync, openSync, readFileSync, statSync, writeSync } from 'node:fs'
import { isAbsolute } from 'node:path'
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
  if (Object.keys(parsed).toSorted().join(',') !== [...KEYS].toSorted().join(','))
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
  }
}

/** A secret file: present, a regular file, this user's only (no group or other bits). Its content is not printed. */
function privateFileRefusal(file: string): string | null {
  if (!existsSync(file)) return 'missing'
  const s = statSync(file)
  if (!s.isFile()) return 'not a regular file'
  if ((s.mode & 0o077) !== 0) return 'readable by others: chmod 600'
  if (typeof process.getuid === 'function' && s.uid !== process.getuid()) return 'not owned by this user'
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

function makeCapability(c: HostConfig) {
  if (existsSync(c.capabilityFile))
    fail('capabilityFile exists: a capability is never replaced; pair again as a new host')
  const fd = openSync(c.capabilityFile, 'wx', 0o600)
  try {
    writeSync(fd, `${newSecret()}\n`)
  } finally {
    closeSync(fd)
  }
  console.log('owner-host: capability written (its value is not shown)')
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { config: { type: 'string' } },
})
const [command] = positionals
if (!values.config) fail('--config <file> is required')
const config = loadConfig(values.config)
if (command === 'check') check(config)
else if (command === 'capability') makeCapability(config)
else if (command === 'redeem' || command === 'run')
  fail(
    `${command}: no Sophia owner-host route is mounted in this slice (INC01-CC-003 S1a); ` +
      'see docs/handoffs/INC01-CC-003.md',
  )
else fail('usage: owner-host.ts check|capability|redeem|run --config <file>')
