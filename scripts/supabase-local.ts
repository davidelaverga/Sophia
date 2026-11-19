#!/usr/bin/env node
// Provision the local Supabase stack for sophia-next (Docker; no cloud account involved):
//   1. local ES256 JWT signing key (supabase/signing_keys.json, gitignored)
//   2. `supabase start` with only db, auth, gateway and Mailpit
//   3. db/migrations through the checksum-ledger runner, as the migration owner
//   4. the API login, with a fresh random password each run
//   5. .env.supabase.local (API + live tests) and apps/studio/.env.development.local (browser)
// The keys printed by `supabase status` are Supabase's documented local-development defaults.
//   node scripts/supabase-local.ts
//
// CI isolation (SOPHIA_SUPABASE_ISOLATION=<run id>-<run attempt>): the attempt runs its own project (sophia-ci-<id>)
// from its own workdir under $RUNNER_TEMP, on one block of host ports below the kernel's ephemeral range. It starts only
// once Docker has positively answered that nothing with that name exists; an unknown answer or an existing resource
// means no start and no stop. Only after that does it record its ownership and start, so it owns what that start
// creates, a partial stack included, and only that: on a failure it stops that project and keeps every error, and
// `--stop` (CI's always() step) stops it only when the workdir, record and config are exactly what this attempt wrote.
// Not guaranteed: a port probe is not a reservation, and nothing excludes another process taking a port or the same
// unique project id between the check and the start. Without the variable nothing changes: the committed config
// (sophia-next, 54321/54322) and the same commands.
//   node scripts/supabase-local.ts --stop
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from '../packages/persistence/src/migrate.ts'
import { apiLoginUrl, provisionApiLogin } from './lib/api-login.ts'
import { pickStrings } from './lib/env-file.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// The CLI is a locked root devDependency (package.json, pnpm-lock.yaml): its platform binary comes from the lock,
// never from an unrecorded npx download.
const CLI = 'pnpm exec supabase'
const EXCLUDED_SERVICES = 'realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor'
const SIGNING_KEYS = 'supabase/signing_keys.json'
const CONFIG = 'supabase/config.toml'
const OWNER = 'sophia-owner.json'

const STATUS_KEYS = ['API_URL', 'DB_URL', 'PUBLISHABLE_KEY', 'SECRET_KEY', 'MAILPIT_URL'] as const

/** What one command returned (status null: it did not run). Tests inject their own runner; nothing else does. */
export interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
export type Tool = 'supabase' | 'docker'
export type Runner = (tool: Tool, args: readonly string[]) => Ran

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * The Supabase CLI runs through pnpm's shim (a shell is needed on Windows) with constants or a checked workdir path;
 * docker runs without a shell.
 */
const runCli: Runner = (tool, args) => {
  const r =
    tool === 'docker'
      ? spawnSync('docker', args, { encoding: 'utf8' })
      : spawnSync(`${CLI} ${args.join(' ')}`, { encoding: 'utf8', shell: true })
  return { status: r.status, stdout: text(r.stdout), stderr: text(r.stderr) }
}

function supabase(run: Runner, args: readonly string[]): string {
  const r = run('supabase', args)
  if (r.status !== 0) throw new Error(`supabase ${args.join(' ')} failed:\n${r.stderr || r.stdout}`)
  return r.stdout
}

function readStatus(run: Runner, at: readonly string[]) {
  return pickStrings(
    JSON.parse(supabase(run, ['status', '-o', 'json', ...at]).replace(/^[^{]*/, '')),
    STATUS_KEYS,
    'supabase status',
  )
}
export type Status = ReturnType<typeof readStatus>

/** One CI attempt's identity. */
export interface Isolation {
  id: string
  projectId: string
}
const ISOLATION_ID = /^[1-9]\d{0,19}-[1-9]\d{0,3}$/

/** The attempt named by SOPHIA_SUPABASE_ISOLATION, checked before any effect; null keeps the developer defaults. */
export function isolationFrom(env: NodeJS.ProcessEnv): Isolation | null {
  const id = env.SOPHIA_SUPABASE_ISOLATION
  if (id === undefined) return null
  // An empty or malformed value is refused, never read as "no isolation": that would reuse the shared defaults.
  if (!ISOLATION_ID.test(id)) throw new Error('SOPHIA_SUPABASE_ISOLATION must be <run id>-<run attempt>, digits only')
  return { id, projectId: `sophia-ci-${id}` }
}

/** Host ports by role, at the committed config's offsets from its base (54320 + n). */
export interface Ports {
  shadow: number
  api: number
  db: number
  studio: number
  mail: number
  analytics: number
  pooler: number
}
export const portsAt = (base: number): Ports => ({
  shadow: base,
  api: base + 1,
  db: base + 2,
  studio: base + 3,
  mail: base + 4,
  analytics: base + 7,
  pooler: base + 9,
})
/** Blocks of ten from 20000 to 31999, below Linux's default ephemeral range; at most `tries` are probed. */
export const BLOCKS = { first: 20_000, count: 1_200, size: 10, tries: 8 } as const

export type PortRange = readonly [number, number]
/** The kernel's ephemeral port range, where outgoing connections take their ports; Linux's default if unreadable. */
export function ephemeralRange(path = '/proc/sys/net/ipv4/ip_local_port_range'): PortRange {
  try {
    const [lo, hi] = readFileSync(path, 'utf8').trim().split(/\s+/).map(Number)
    if (typeof lo === 'number' && typeof hi === 'number' && lo > 0 && hi >= lo) return [lo, hi]
  } catch {
    // Not Linux, or no procfs: the default below still keeps the blocks outside it.
  }
  return [32_768, 60_999]
}

/** True when `port` can be bound on every IPv4 interface now; the listener closes at once. Not a reservation. */
export function isFree(port: number): Promise<boolean> {
  return new Promise((settle) => {
    const server = createServer()
    server.once('error', () => settle(false))
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => server.close(() => settle(true)))
  })
}

async function blockProblem(
  ports: Ports,
  probe: (port: number) => Promise<boolean>,
  ephemeral: PortRange,
): Promise<string | null> {
  const all = Object.values(ports)
  if (all.some((p) => p >= ephemeral[0] && p <= ephemeral[1])) {
    return `inside the ephemeral range ${ephemeral[0]}-${ephemeral[1]}`
  }
  const free = await Promise.all(all.map(probe))
  const busy = all.filter((_, i) => free[i] !== true)
  return busy.length > 0 ? `busy ${busy.join(', ')}` : null
}

/** The first block, from the attempt's own starting point, wholly outside `ephemeral` with every port free. */
export async function chooseBlock(
  id: string,
  probe: (port: number) => Promise<boolean> = isFree,
  ephemeral: PortRange = ephemeralRange(),
): Promise<Ports> {
  const start = createHash('sha256').update(id).digest().readUInt32BE(0) % BLOCKS.count
  const passed: string[] = []
  for (let i = 0; i < BLOCKS.tries; i++) {
    const base = BLOCKS.first + ((start + i) % BLOCKS.count) * BLOCKS.size
    // Blocks are tried one at a time: the first free one wins, and no more are probed.
    const problem = await blockProblem(portsAt(base), probe, ephemeral)
    if (problem === null) return portsAt(base)
    passed.push(`${base}: ${problem}`)
  }
  throw new Error(`no free Supabase port block for attempt ${id}; nothing was stopped:\n${passed.join('\n')}`)
}

/** True when `ports` is exactly one block this script can choose. */
export function isBlock(ports: unknown): ports is Ports {
  if (typeof ports !== 'object' || ports === null || !('shadow' in ports) || typeof ports.shadow !== 'number') {
    return false
  }
  const offset = ports.shadow - BLOCKS.first
  const inGrid = Number.isInteger(offset) && offset >= 0 && offset % BLOCKS.size === 0
  const inRange = offset / BLOCKS.size < BLOCKS.count
  return inGrid && inRange && JSON.stringify(ports) === JSON.stringify(portsAt(ports.shadow))
}

type Role = keyof Ports | 'project'
/** [section, key, role]: every key the isolated config overrides, each expected exactly once. */
const OVERRIDES: ReadonlyArray<readonly [string, string, Role]> = [
  ['', 'project_id', 'project'],
  ['api', 'port', 'api'],
  ['db', 'port', 'db'],
  ['db', 'shadow_port', 'shadow'],
  ['db.pooler', 'port', 'pooler'],
  ['studio', 'port', 'studio'],
  ['local_smtp', 'port', 'mail'],
  ['analytics', 'port', 'analytics'],
]

function overrideFor(section: string, line: string) {
  return OVERRIDES.find(([s, key]) => s === section && line.startsWith(key) && /^\s*=/.test(line.slice(key.length)))
}

/**
 * The committed config with this attempt's project id and ports; refused unless every override lands exactly once. The
 * overrides read the file line by line, so a multi-line string (where a line need not be a key) is refused outright.
 */
export function isolatedConfig(toml: string, projectId: string, ports: Ports): string {
  if (toml.includes('"""') || toml.includes("'''")) throw new Error(`${CONFIG}: multi-line strings are not supported`)
  let section = ''
  const hits = new Map<string, number>()
  const lines = toml.split('\n').map((line) => {
    const header = /^\[([^\]]+)\]\s*$/.exec(line)
    if (header) section = header[1] ?? ''
    const entry = header ? undefined : overrideFor(section, line)
    if (!entry) return line
    const [s, key, role] = entry
    hits.set(`${s}.${key}`, (hits.get(`${s}.${key}`) ?? 0) + 1)
    return `${key} = ${role === 'project' ? JSON.stringify(projectId) : ports[role]}`
  })
  const missed = OVERRIDES.filter(([s, key]) => hits.get(`${s}.${key}`) !== 1).map(([s, key]) => `${s}.${key}`)
  if (missed.length > 0) throw new Error(`${CONFIG}: not exactly one ${missed.join(', ')}; nothing was started`)
  const stale = lines.filter((line) => !line.trimStart().startsWith('#') && /\b543\d\d\b/.test(line))
  if (stale.length > 0) throw new Error(`${CONFIG}: a default port is still active (${stale.join('; ')})`)
  return lines.join('\n')
}

/** The attempt's own workdir; its path crosses a shell, so it is limited to plain characters. */
export function workdirOf(iso: Isolation, root: string): string {
  const dir = join(resolve(root), `sophia-supabase-${iso.id}`)
  if (!/^[\w./-]+$/.test(dir)) throw new Error(`Supabase workdir ${dir}: only letters, digits and . _ / - are allowed`)
  return dir
}

const codeOf = (err: unknown) => (err instanceof Error && 'code' in err ? err.code : undefined)

/** Creates the workdir exclusively: one that already exists is not this attempt's and is left as it is. */
function claimWorkdir(workdir: string): void {
  try {
    mkdirSync(workdir, { mode: 0o700 })
  } catch (err: unknown) {
    if (codeOf(err) === 'EEXIST') {
      throw new Error(`${workdir} already exists, so it is not this attempt's: left untouched`, { cause: err })
    }
    throw err
  }
}

/** Read-only Docker questions, each by the attempt's unique name (a substring match, so it can over-match). */
const PRESENCE_QUERIES: ReadonlyArray<readonly string[]> = [
  ['ps', '-a', '-q'],
  ['volume', 'ls', '-q'],
  ['network', 'ls', '-q'],
]

/**
 * Null only when Docker positively answered, for containers, volumes and networks, that nothing carries the project's
 * name. Any other answer (Docker not running or not reachable, a refusal, no client) is unknown, never absence; any
 * output means something with that name exists, a partial stack included. Both are reasons not to start.
 */
export function absenceProblem(run: Runner, projectId: string): string | null {
  for (const query of PRESENCE_QUERIES) {
    const args = [...query, '--filter', `name=${projectId}`]
    const r = run('docker', args)
    if (r.status !== 0) {
      const how = r.status === null ? 'did not run' : `exited ${r.status}`
      return `its absence is unknown: docker ${args.join(' ')} ${how} ${(r.stderr || r.stdout).trim()}`.trim()
    }
    const found = r.stdout.trim()
    if (found !== '') return `docker ${query.slice(0, -1).join(' ')} already lists ${found.split('\n').join(', ')}`
  }
  return null
}

/** The files a start reads, from the repository by default. */
export interface Sources {
  config: string
  signingKeys: string
}
const repoSources = (): Sources => ({ config: join(ROOT, CONFIG), signingKeys: join(ROOT, SIGNING_KEYS) })

/** Writes the attempt's project copy; returns the config's sha256. */
function writeProject(workdir: string, iso: Isolation, ports: Ports, sources: Sources): string {
  const config = isolatedConfig(readFileSync(sources.config, 'utf8'), iso.projectId, ports)
  mkdirSync(join(workdir, 'supabase'), { mode: 0o700 })
  writeFileSync(join(workdir, CONFIG), config, { mode: 0o600 })
  writeFileSync(join(workdir, SIGNING_KEYS), readFileSync(sources.signingKeys), { mode: 0o600 })
  return createHash('sha256').update(config).digest('hex')
}

/** The ownership record: written only after known absence, immediately before the start it covers. */
export interface OwnerRecord {
  version: 1
  id: string
  projectId: string
  ports: Ports
  config: string
}
const RECORD_KEYS = ['config', 'id', 'ports', 'projectId', 'version']

function checkReportedPorts(status: Status, ports: Ports): void {
  const api = new URL(status.API_URL).port
  const db = new URL(status.DB_URL).port
  if (api !== String(ports.api) || db !== String(ports.db)) {
    throw new Error(`supabase status reports API ${api} and DB ${db}, not this attempt's ${ports.api} and ${ports.db}`)
  }
}

const removeDir = (dir: string): void => rmSync(dir, { recursive: true, force: true })
const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))

/**
 * After `primary` failed: stop this attempt's project if it owns one, then remove the workdir, unless the stop failed
 * (the workdir is kept for the next step and for inspection). Returns `primary` itself when cleanup succeeded, else an
 * AggregateError holding `primary` first and every cleanup failure after it.
 */
export function released(
  run: Runner,
  workdir: string,
  owned: boolean,
  primary: unknown,
  remove: (dir: string) => void = removeDir,
): Error {
  const failures: Error[] = []
  if (owned) {
    const stop = run('supabase', ['stop', '--no-backup', '--workdir', workdir])
    if (stop.status !== 0) {
      const why = (stop.stderr || stop.stdout).trim()
      failures.push(new Error(`stopping this attempt's own project failed (workdir kept: ${workdir}): ${why}`))
    }
  }
  if (failures.length === 0) {
    try {
      remove(workdir)
    } catch (cause: unknown) {
      failures.push(new Error(`removing this attempt's workdir ${workdir} failed`, { cause }))
    }
  }
  const first = asError(primary)
  if (failures.length === 0) return first
  const message = [first.message, ...failures.map((f) => `and ${f.message}`)].join('\n')
  return new AggregateError([first, ...failures], message, { cause: first })
}

/** Starting points a test can replace: the port probe, the source files and the removal. */
export interface StartOptions {
  probe?: (port: number) => Promise<boolean>
  sources?: Sources
  remove?: (dir: string) => void
}

/** Starts this attempt's own project from its own workdir, once its absence is known, and checks its ports. */
export async function startIsolated(
  run: Runner,
  iso: Isolation,
  root: string,
  options: StartOptions = {},
): Promise<{ status: Status; workdir: string }> {
  const workdir = workdirOf(iso, root)
  claimWorkdir(workdir)
  let owned = false
  try {
    const ports = await chooseBlock(iso.id, options.probe)
    const config = writeProject(workdir, iso, ports, options.sources ?? repoSources())
    const problem = absenceProblem(run, iso.projectId)
    if (problem !== null) throw new Error(`${iso.projectId}: ${problem}; nothing was started or stopped`)
    const record: OwnerRecord = { version: 1, id: iso.id, projectId: iso.projectId, ports, config }
    writeFileSync(join(workdir, OWNER), `${JSON.stringify(record)}\n`, { mode: 0o600 })
    // The ownership transition: absence is known and recorded, so what this start creates is this attempt's.
    owned = true
    const at = ['--workdir', workdir]
    supabase(run, ['start', '-x', EXCLUDED_SERVICES, ...at])
    const status = readStatus(run, at)
    checkReportedPorts(status, ports)
    return { status, workdir }
  } catch (err: unknown) {
    throw released(run, workdir, owned, err, options.remove)
  }
}

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')

/** Null when `path` is exactly what this script makes there: a real directory or regular file, never a link. */
function entryProblem(path: string, kind: 'directory' | 'file'): string | null {
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return `${path} is a link`
    const ok = kind === 'directory' ? stat.isDirectory() : stat.isFile()
    if (!ok) return `${path} is not a ${kind}`
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return `${path} has another owner`
    return null
  } catch (err: unknown) {
    return `${path} cannot be read (${String(codeOf(err))})`
  }
}

function layoutProblem(workdir: string): string | null {
  const entries = readdirSync(workdir).toSorted()
  if (JSON.stringify(entries) !== JSON.stringify([OWNER, 'supabase']))
    return `unexpected contents ${entries.join(', ')}`
  const paths: ReadonlyArray<readonly [string, 'directory' | 'file']> = [
    [join(workdir, 'supabase'), 'directory'],
    [join(workdir, OWNER), 'file'],
    [join(workdir, CONFIG), 'file'],
    [join(workdir, SIGNING_KEYS), 'file'],
  ]
  for (const [path, kind] of paths) {
    const problem = entryProblem(path, kind)
    if (problem !== null) return problem
  }
  return null
}

function recordFrom(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    // An unreadable or malformed record proves nothing: the caller refuses.
    return null
  }
}

/** Null only for the exact record this attempt writes. */
function recordProblem(record: unknown, iso: Isolation): string | null {
  if (typeof record !== 'object' || record === null) return 'the ownership record is not an object'
  if (JSON.stringify(Object.keys(record).toSorted()) !== JSON.stringify(RECORD_KEYS)) {
    return 'the ownership record has unexpected fields'
  }
  const fields = new Map<string, unknown>(Object.entries(record))
  if (fields.get('version') !== 1 || fields.get('id') !== iso.id || fields.get('projectId') !== iso.projectId) {
    return `the ownership record does not name ${iso.projectId}`
  }
  if (!isBlock(fields.get('ports'))) return 'the ownership record does not hold one valid port block'
  const config = fields.get('config')
  return typeof config === 'string' && /^[0-9a-f]{64}$/.test(config) ? null : 'the ownership record has no config hash'
}

/**
 * Null only when the workdir is exactly what this attempt's start left: a real directory of this user holding its
 * record and project copy, no links, a complete record naming this attempt, and a config that hashes to the record and
 * equals the committed config with that project and those ports.
 */
export function ownershipProblem(workdir: string, iso: Isolation, sources: Sources = repoSources()): string | null {
  const problem = entryProblem(workdir, 'directory') ?? layoutProblem(workdir)
  if (problem !== null) return problem
  const record = recordFrom(join(workdir, OWNER))
  const invalid = recordProblem(record, iso)
  if (invalid !== null) return invalid
  if (!isOwnerRecord(record)) return 'the ownership record is invalid'
  const config = readFileSync(join(workdir, CONFIG), 'utf8')
  if (sha256(config) !== record.config) return 'the config changed after the start'
  const expected = isolatedConfig(readFileSync(sources.config, 'utf8'), iso.projectId, record.ports)
  return config === expected ? null : "the config is not this attempt's project copy"
}

function isOwnerRecord(record: unknown): record is OwnerRecord {
  return typeof record === 'object' && record !== null && 'ports' in record && isBlock(record.ports)
}

function exists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (err: unknown) {
    if (codeOf(err) === 'ENOENT') return false
    throw err
  }
}

/** CI's always() step: stop this attempt's own project and drop its workdir; anything else is refused untouched. */
export function stopIsolated(
  run: Runner,
  iso: Isolation,
  root: string,
  options: { sources?: Sources; remove?: (dir: string) => void } = {},
): string {
  const workdir = workdirOf(iso, root)
  if (!exists(workdir)) return `no Supabase workdir left for ${iso.projectId}: nothing to stop`
  const problem = ownershipProblem(workdir, iso, options.sources)
  if (problem !== null) throw new Error(`${workdir}: ${problem}; nothing was stopped and it is left untouched`)
  supabase(run, ['stop', '--no-backup', '--workdir', workdir])
  try {
    ;(options.remove ?? removeDir)(workdir)
  } catch (err: unknown) {
    throw new Error(`stopped ${iso.projectId}, but removing ${workdir} failed`, { cause: err })
  }
  return `stopped ${iso.projectId} and removed its workdir`
}

function ensureSigningKey(run: Runner): void {
  if (existsSync(SIGNING_KEYS)) return
  writeFileSync(SIGNING_KEYS, '[]')
  supabase(run, ['gen', 'signing-key', '--algorithm', 'ES256', '--append'])
  console.log('✓ generated local ES256 signing key')
}

function startDefault(run: Runner): Status {
  supabase(run, ['start', '-x', EXCLUDED_SERVICES])
  return readStatus(run, [])
}

const envFile = (entries: Record<string, string>, header?: string) =>
  [...(header ? [header] : []), ...Object.entries(entries).map(([k, v]) => `${k}=${v}`), ''].join('\n')

async function provision(status: Status): Promise<void> {
  console.log(`✓ Supabase local: API ${status.API_URL} · DB ${status.DB_URL.replace(/:[^:@]+@/, ':***@')}`)

  const report = await migrate(status.DB_URL, 'db/migrations')
  const applied = report.rows.filter((r) => r.status === 'applied').length
  console.log(`✓ migrations: ${applied} applied, ${report.rows.length - applied} already applied`)

  const password = randomBytes(16).toString('hex')
  await provisionApiLogin(status.DB_URL, password)
  console.log('✓ API login provisioned (member of sophia_api, no BYPASSRLS)')

  // Dev-only, gitignored (.env.*). The secret key is the local default, used only by the live test
  // suite to create synthetic users in this local Auth.
  const env = {
    SOPHIA_API_DATABASE_URL: apiLoginUrl(status.DB_URL, password),
    SOPHIA_MIGRATION_DATABASE_URL: status.DB_URL,
    SUPABASE_URL: status.API_URL,
    SUPABASE_JWT_ISSUER: `${status.API_URL}/auth/v1`,
    SUPABASE_JWKS_URL: `${status.API_URL}/auth/v1/.well-known/jwks.json`,
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_TEST_ADMIN_KEY: status.SECRET_KEY,
    MAILPIT_URL: status.MAILPIT_URL,
  }
  writeFileSync(
    '.env.supabase.local',
    envFile(env, '# Generated by scripts/supabase-local.ts — local Supabase only. Do not copy to hosted environments.'),
  )
  writeFileSync(
    'apps/studio/.env.development.local',
    envFile({ VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY }),
  )
  console.log(`✓ wrote .env.supabase.local and apps/studio/.env.development.local`)
  console.log(`  Sign-in emails arrive in Mailpit: ${status.MAILPIT_URL}`)
}

async function main(): Promise<void> {
  process.chdir(ROOT)
  const iso = isolationFrom(process.env)
  const root = process.env.RUNNER_TEMP ?? tmpdir()
  if (process.argv.includes('--stop')) {
    if (!iso) throw new Error('--stop stops only an isolated CI attempt (SOPHIA_SUPABASE_ISOLATION)')
    console.log(`✓ ${stopIsolated(runCli, iso, root)}`)
    return
  }
  ensureSigningKey(runCli)
  if (!iso) return provision(startDefault(runCli))
  const { status, workdir } = await startIsolated(runCli, iso, root)
  try {
    await provision(status)
  } catch (err: unknown) {
    throw released(runCli, workdir, true, err)
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
