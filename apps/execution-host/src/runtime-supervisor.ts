/**
 * Execution-host runtime supervisor: launches the OFFICIAL `dsh --profile
 * sophia-runtime` for one project and supervises that child process. It is
 * not a Cordis root, not a second agent loop, and not a scheduler: the dsh
 * loop runs the work, the bridge inside it talks to the Sophia service, and
 * this supervisor only owns the process lifecycle (02_DSH_BOOTSTRAP §1–§2).
 *
 * - One project home per runtime unit (`<projectRoot>/{dsh-home,home,work,workspace}`),
 *   guarded by a single-writer lease file; a second supervisor on the same
 *   home is refused.
 * - A fully explicit launch environment: explicit DSH_HOME, throwaway HOME
 *   and TMPDIR inside the project, telemetry off, only named credential
 *   references passed through, and the bridge's service binding.
 * - Ready only when the bridge inside reports `readiness=ready`. A loaded
 *   plugin, a live process or a dsh exit code are not readiness.
 * - A crashed runtime restarts with bounded backoff. Restarts are counted in a
 *   window, and exhausting them is a terminal `failed` state, not a loop. The
 *   bridge reconciles its journal and the native history on every start.
 * @module @sophia/execution-host/runtime-supervisor
 */

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { delimiter, dirname, join, resolve, sep } from 'node:path'

/** What the supervisor needs to know about the runtime unit it launches. */
export interface SupervisedUnit {
  readonly id: string
  readonly profile: string
  /** Deployed runtime artifact directory (verified by the caller before launch). */
  readonly runtimeDir: string
  /** Launcher path inside the artifact, e.g. `node_modules/@deepseek-ai/dsh/lib/bin.js`. */
  readonly launcherEntry: string
}

export interface ReplySupervisorOptions {
  readonly launcher: string
  readonly python: string
  readonly template: string
  readonly profileName: string
  readonly templateDigest: string
  readonly maxChildren?: number
  readonly deadlineMs?: number
}

export interface SupervisorOptions {
  readonly replies?: ReplySupervisorOptions
  readonly unit: SupervisedUnit
  /** Per-project root; the profile must already be installed at `<root>/dsh-home/profiles/<profile>`. */
  readonly projectRoot: string
  /** Sophia service binding for the bridge. */
  readonly bridge: { readonly url: string; readonly token: string }
  /** Credential variable NAMES to pass through when set (e.g. the model route's key reference). */
  readonly credentials?: readonly string[]
  /** Extra launcher arguments (e.g. `--patch` overlays in tests). */
  readonly extraArgs?: readonly string[]
  /** Extra child environment (tests only). */
  readonly extraEnv?: Readonly<Record<string, string>>
  readonly readyTimeoutMs?: number
  readonly stopTimeoutMs?: number
  readonly maxRestarts?: number
  readonly restartWindowMs?: number
  readonly onEvent?: (event: SupervisorEvent) => void
}

export type SupervisorState = 'idle' | 'starting' | 'ready' | 'restarting' | 'stopping' | 'stopped' | 'failed'

export type SupervisorEvent =
  | { type: 'state'; state: SupervisorState; reason?: string }
  | { type: 'exit'; code: number | null; signal: NodeJS.Signals | null; generation: number }

/** Thrown when another live supervisor holds the project home. */
export class LeaseHeldError extends Error {}

const READY_LINE = '[sophia-control-bridge] readiness=ready'

/** Leases held by supervisors in THIS process (a pid check cannot tell them apart). */
const heldInProcess = new Set<string>()
const STARTUP_FAILED = /dsh: startup failed/

export class RuntimeSupervisor {
  private child: ChildProcess | null = null
  private generation = 0
  private restarts: number[] = []
  private stopping = false
  private output = ''
  private leasePath: string
  private leased = false
  private readonly replyGeneration: ReplyGeneration
  state: SupervisorState = 'idle'

  constructor(private readonly options: SupervisorOptions) {
    this.leasePath = join(options.projectRoot, 'supervisor.lease')
    this.replyGeneration = new ReplyGeneration(options)
  }

  /** The dsh child's pid for the current generation, if running. */
  get pid(): number | undefined {
    return this.child?.pid
  }

  /** Combined stdout/stderr of the current generation (diagnostics). */
  get log(): string {
    return this.output
  }

  private setState(state: SupervisorState, reason?: string): void {
    this.state = state
    this.options.onEvent?.({ type: 'state', state, reason })
  }

  /** Take the single-writer lease on the project home or throw LeaseHeldError. */
  private acquireLease(): void {
    mkdirSync(this.options.projectRoot, { recursive: true, mode: 0o700 })
    if (heldInProcess.has(this.leasePath)) {
      throw new LeaseHeldError(`project home ${this.options.projectRoot} is leased by another supervisor in this process`)
    }
    if (existsSync(this.leasePath)) {
      const pid = Number(readFileSync(this.leasePath, 'utf8').trim())
      if (Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid && isAlive(pid)) {
        throw new LeaseHeldError(`project home ${this.options.projectRoot} is leased by live supervisor pid ${pid}`)
      }
      rmSync(this.leasePath, { force: true })
    }
    const fd = openSync(this.leasePath, 'wx', 0o600)
    try {
      writeSync(fd, `${process.pid}\n`)
    } finally {
      closeSync(fd)
    }
    heldInProcess.add(this.leasePath)
    this.leased = true
  }

  private releaseLease(): void {
    if (!this.leased) return
    this.leased = false
    heldInProcess.delete(this.leasePath)
    if (existsSync(this.leasePath) && readFileSync(this.leasePath, 'utf8').trim() === String(process.pid)) rmSync(this.leasePath, { force: true })
  }

  /** The complete child environment; nothing else is inherited. */
  environment(): Record<string, string> {
    const root = this.options.projectRoot
    const home = join(root, 'home')
    const tmp = join(home, 'tmp')
    for (const dir of [home, tmp, join(root, 'work'), join(root, 'workspace')]) mkdirSync(dir, { recursive: true, mode: 0o700 })
    const passed: Record<string, string> = {}
    for (const name of this.options.credentials ?? []) {
      const value = process.env[name]
      if (value) passed[name] = value
    }
    const environment: Record<string, string> = {
      ...passed,
      HOME: home,
      TMPDIR: tmp,
      DSH_HOME: join(root, 'dsh-home'),
      DSH_TELEMETRY_DISABLED: '1',
      LANG: 'C.UTF-8',
      PATH: [...new Set([dirname(process.execPath), pnpmDir(), '/usr/bin', '/bin'].filter(Boolean))].join(':'),
      SOPHIA_RUNTIME_UNIT: this.options.unit.id,
      SOPHIA_WORKSPACE: join(root, 'workspace'),
      SOPHIA_BRIDGE_URL: this.options.bridge.url,
      SOPHIA_BRIDGE_TOKEN: this.options.bridge.token,
      ...this.options.extraEnv,
    }
    for (const name of Object.keys(environment)) if (name.startsWith('SOPHIA_REPLY_')) delete environment[name]
    return { ...environment, ...this.replyGeneration.environment(this.options, this.replyActive()) }
  }

  private replyActive(): boolean {
    return this.leased && (this.state === 'starting' || this.state === 'restarting' ||
      (this.state === 'ready' && this.child !== null && this.child.exitCode === null && this.child.signalCode === null))
  }

  private sweepReplies(seal: boolean): void {
    if (this.leased) this.replyGeneration.sweep(seal, this.options)
  }

  /**
   * Acquire the lease, launch, and resolve once the bridge reports ready. A
   * failed first start is terminal: nothing restarts it, and the lease is
   * released before the error is thrown.
   */
  async start(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'stopped' && this.state !== 'failed') throw new Error(`cannot start from state ${this.state}`)
    this.acquireLease()
    this.stopping = false
    this.restarts = []
    try {
      this.sweepReplies(true)
      await this.launch('starting')
    } catch (error) {
      this.setState('failed', (error as Error).message)
      this.releaseLease()
      throw error
    }
  }

  private launch(state: 'starting' | 'restarting'): Promise<void> {
    this.setState(state)
    this.generation += 1
    const generation = this.generation
    this.output = ''
    const { unit } = this.options
    const args = [join(unit.runtimeDir, unit.launcherEntry), '--profile', unit.profile, ...(this.options.extraArgs ?? [])]
    const child = spawn(process.execPath, args, { cwd: join(this.options.projectRoot, 'work'), env: this.environment(), stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    return new Promise<void>((resolve, reject) => {
      let settled = false
      // Set when this generation failed to start: its exit is expected and is not a crash to recover.
      let abandoned = false
      const timer = setTimeout(() => finish(new Error(`bridge did not report ready within ${this.options.readyTimeoutMs ?? 60_000} ms`)), this.options.readyTimeoutMs ?? 60_000)
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          abandoned = true
          // Reject only once the process is gone: the caller then releases the
          // single-writer lease, and nothing of this generation may still write the home.
          if (child.exitCode === null && child.signalCode === null) {
            child.once('exit', () => reject(error))
            child.kill('SIGKILL')
          } else {
            reject(error)
          }
        } else {
          this.setState('ready')
          resolve()
        }
      }
      const collect = (chunk: Buffer) => {
        this.output += chunk.toString()
        if (this.output.includes(READY_LINE)) finish()
        else if (STARTUP_FAILED.test(this.output)) finish(new Error('dsh startup failed; see the startup diagnostics under DSH_HOME/logs'))
      }
      child.stdout!.on('data', collect)
      child.stderr!.on('data', collect)
      child.on('exit', (code, signal) => {
        this.options.onEvent?.({ type: 'exit', code, signal, generation })
        if (generation !== this.generation) return
        this.child = null
        if (!settled) return finish(new Error(`runtime exited before ready (code ${code}, signal ${signal})`))
        if (!abandoned && !this.stopping) void this.recover()
      })
    })
  }

  /** Restart after an unexpected exit, within the restart budget. */
  private async recover(): Promise<void> {
    const now = Date.now()
    const window = this.options.restartWindowMs ?? 60_000
    this.restarts = this.restarts.filter((time) => now - time < window)
    if (this.restarts.length >= (this.options.maxRestarts ?? 5)) {
      this.setState('failed', `restart budget exhausted: ${this.restarts.length} restarts within ${window} ms`)
      this.releaseLease()
      return
    }
    this.restarts.push(now)
    const backoff = Math.min(250 * 2 ** (this.restarts.length - 1), 5000)
    await new Promise((resolve) => setTimeout(resolve, backoff))
    if (this.stopping) return
    try {
      this.sweepReplies(true)
      await this.launch('restarting')
    } catch (error) {
      // A restart that never became ready counts against the same budget.
      if (this.stopping) return
      this.setState('restarting', `restart failed: ${(error as Error).message}`)
      await this.recover()
    }
  }

  /** SIGTERM (dsh disposes its root), then SIGKILL after the stop timeout. */
  async stop(): Promise<{ code: number | null; signal: NodeJS.Signals | null } | null> {
    this.stopping = true
    this.setState('stopping')
    const child = this.child
    let result: { code: number | null; signal: NodeJS.Signals | null } | null = null
    if (child && child.exitCode === null && child.signalCode === null) {
      result = await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill('SIGKILL'), this.options.stopTimeoutMs ?? 15_000)
        child.once('exit', (code, signal) => {
          clearTimeout(timer)
          resolve({ code, signal })
        })
        child.kill('SIGTERM')
      })
    }
    this.child = null
    this.sweepReplies(false)
    this.releaseLease()
    this.setState('stopped')
    return result
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Directory of the first executable `pnpm` on this process's PATH (dsh plugin management needs it). */
function pnpmDir(): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir && existsSync(join(dir, 'pnpm'))) return dir
  }
  return undefined
}


interface ReplyConfiguration extends ReplySupervisorOptions {
  readonly unitId: string
  readonly unitProfile: string
  readonly projectRoot: string
  readonly runtimeDir: string
  readonly entry: string
  readonly node: string
}
function replyPath(value: unknown): value is string {
  return typeof value === 'string' && value !== '/' && !value.includes('\0') && resolve(value) === value
}
function replyConfiguration(options: SupervisorOptions): Readonly<ReplyConfiguration> | null {
  if (options.replies === undefined) return null
  const value = { ...options.replies }, unit = { ...options.unit }
  if (![value.launcher, value.python, value.template, unit.runtimeDir, options.projectRoot].every(replyPath) ||
      typeof value.profileName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value.profileName) ||
      typeof value.templateDigest !== 'string' || !/^sophia-reply-tree-v1:sha256:[0-9a-f]{64}$/.test(value.templateDigest) ||
      (value.maxChildren !== undefined && value.maxChildren !== 2) ||
      (value.deadlineMs !== undefined && value.deadlineMs !== 120_000)) throw new Error('reply_configuration_invalid')
  const entry = resolve(unit.runtimeDir, unit.launcherEntry)
  if (!entry.startsWith(unit.runtimeDir + sep)) throw new Error('reply_configuration_invalid')
  return Object.freeze({ ...value, unitId: unit.id, unitProfile: unit.profile, projectRoot: options.projectRoot, runtimeDir: unit.runtimeDir, entry, node: process.execPath })
}
function replyDirectory(path: string, privateMode = true): Stats {
  const info = lstatSync(path)
  if (!info.isDirectory() || info.isSymbolicLink() ||
      (privateMode && (info.uid !== process.geteuid?.() || (info.mode & 0o777) !== 0o700))) throw new Error('reply_namespace_invalid')
  return info
}
function replyAncestors(path: string): void {
  for (let current = path; current !== '/'; current = dirname(current)) replyDirectory(current, current === path)
}
function sameReplyDirectory(path: string, expected: Stats): void {
  const current = replyDirectory(path)
  if (current.dev !== expected.dev || current.ino !== expected.ino) throw new Error('reply_namespace_changed')
}
function syncReplyDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try { fsyncSync(fd) } finally { closeSync(fd) }
}
function replyAbsent(path: string): boolean {
  try { lstatSync(path); return false }
  catch (error: unknown) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return true; throw error }
}
function replyInventory(path: string, limit: number): ReadonlyMap<string, Stats> {
  const names = readdirSync(path).sort()
  if (names.length > limit || names.some(name => !/^(gen|sealed)-[A-Za-z0-9_-]{1,100}$/.test(name))) throw new Error('reply_inventory_invalid')
  const roots = new Map(names.map(name => [name, replyDirectory(join(path, name))]))
  for (const name of names) if (name.startsWith('gen-') && roots.has('sealed-' + name.slice(4))) throw new Error('reply_seal_collision')
  return roots
}
function replyAdmissionFile(root: string): Stats {
  const info = lstatSync(join(root, '.admit'))
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== 0 ||
      info.uid !== process.geteuid?.() || (info.mode & 0o777) !== 0o600) throw new Error('reply_admission_invalid')
  return info
}
function replyFreshRoot(parent: string): string {
  const suffix = randomUUID(), root = join(parent, 'gen-' + suffix)
  if (!replyAbsent(join(parent, 'sealed-' + suffix))) throw new Error('reply_generation_reused')
  mkdirSync(root, { mode: 0o700 }) // Exclusive; never reuse or truncate a former generation.
  const identity = replyDirectory(root)
  const fd = openSync(join(root, '.admit'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.nlink !== 1 || info.size !== 0 || (info.mode & 0o777) !== 0o600 || info.uid !== process.geteuid?.()) throw new Error('reply_admission_invalid')
    fsyncSync(fd)
  } finally { closeSync(fd) }
  sameReplyDirectory(root, identity); syncReplyDirectory(root); syncReplyDirectory(parent)
  return root
}

/** Optional CON namespace owner. No prompt, provider, transport, home deletion or settlement receipt. */
class ReplyGeneration {
  private readonly config: Readonly<ReplyConfiguration> | null = null
  private invalid = false
  private root: string | null = null
  private rootIdentity: Stats | null = null
  private admissionIdentity: Stats | null = null
  private projectIdentity: Stats | null = null
  private parentIdentity: Stats | null = null
  private ready = false

  constructor(options: SupervisorOptions) {
    try { this.config = replyConfiguration(options) }
    catch { this.invalid = true }
  }
  environment(options: SupervisorOptions, active: boolean): Record<string, string> {
    const c = this.config
    if (!this.ready || !this.root || !c) return {}
    try {
      if (!active) throw new Error('reply_not_owned')
      this.validateBinding(options)
      this.validateNamespace()
    } catch { this.ready = false; return {} }
    return { SOPHIA_REPLY_ROOT: this.root, SOPHIA_REPLY_DIR: join(c.projectRoot, 'replies'),
      SOPHIA_REPLY_LAUNCHER: c.launcher, SOPHIA_REPLY_PYTHON: c.python, SOPHIA_REPLY_NODE: c.node,
      SOPHIA_REPLY_ENTRY: c.entry, SOPHIA_REPLY_RUNTIME_DIR: c.runtimeDir, SOPHIA_REPLY_TEMPLATE: c.template,
      SOPHIA_REPLY_PROFILE: c.profileName, SOPHIA_REPLY_TEMPLATE_DIGEST: c.templateDigest }
  }
  sweep(seal: boolean, options: SupervisorOptions): void {
    this.ready = false
    if (!this.config && !this.invalid) return
    try { this.validateBinding(options); this.qualify(seal) } catch {
      // Optional CON failure never changes the goal state or exposes helper output.
      try { process.stderr.write('[sophia-reply-supervisor] containment_unavailable\n') } catch { /* CON stays disabled even if diagnostics cannot be written. */ }
    }
  }
  private validateBinding(options: SupervisorOptions): void {
    const c = this.config
    if (!c || options.projectRoot !== c.projectRoot || options.unit.runtimeDir !== c.runtimeDir ||
        options.unit.id !== c.unitId || options.unit.profile !== c.unitProfile ||
        resolve(options.unit.runtimeDir, options.unit.launcherEntry) !== c.entry) throw new Error('reply_binding_changed')
  }
  private qualify(seal: boolean): void {
    const c = this.config
    if (!c) throw new Error('reply_configuration_invalid')
    replyAncestors(c.projectRoot)
    const project = replyDirectory(c.projectRoot), parent = join(c.projectRoot, 'replies')
    if (seal && replyAbsent(parent)) mkdirSync(parent, { mode: 0o700 })
    const identity = replyDirectory(parent)
    const roots = replyInventory(parent, seal ? 255 : 256)
    this.helper(['probe'], 10_000)
    const digest = this.helper(['digest', c.template], 30_000)
    if (digest !== c.templateDigest + '\n') throw new Error('reply_template_mismatch')
    replyAncestors(c.projectRoot)
    sameReplyDirectory(c.projectRoot, project); sameReplyDirectory(parent, identity)
    this.verifyInventory(parent, roots)
    if (seal) {
      this.root = this.seal(parent, identity, roots)
      this.rootIdentity = replyDirectory(this.root)
      this.admissionIdentity = replyAdmissionFile(this.root)
    }
    this.validateRoot()
    const finalRoots = replyInventory(parent, 256)
    this.helper(['sweep', '--replies', parent], 15_000)
    replyAncestors(c.projectRoot)
    sameReplyDirectory(c.projectRoot, project); sameReplyDirectory(parent, identity)
    this.verifyInventory(parent, finalRoots)
    this.validateRoot()
    this.projectIdentity = project
    this.parentIdentity = identity
    this.ready = seal
  }
  private validateNamespace(): void {
    const c = this.config
    if (!c || !this.projectIdentity || !this.parentIdentity) throw new Error('reply_namespace_missing')
    replyAncestors(c.projectRoot)
    sameReplyDirectory(c.projectRoot, this.projectIdentity)
    sameReplyDirectory(join(c.projectRoot, 'replies'), this.parentIdentity)
    this.validateRoot()
  }
  private validateRoot(): void {
    if (!this.root || !this.rootIdentity || !this.admissionIdentity) throw new Error('reply_generation_missing')
    sameReplyDirectory(this.root, this.rootIdentity)
    const current = replyAdmissionFile(this.root)
    if (current.dev !== this.admissionIdentity.dev || current.ino !== this.admissionIdentity.ino) throw new Error('reply_admission_changed')
  }
  private verifyInventory(parent: string, roots: ReadonlyMap<string, Stats>): void {
    const current = replyInventory(parent, 256)
    if (current.size !== roots.size) throw new Error('reply_namespace_changed')
    for (const [name, expected] of roots) sameReplyDirectory(join(parent, name), expected)
  }
  private seal(parent: string, identity: Stats, roots: ReadonlyMap<string, Stats>): string {
    for (const [name, expected] of roots) {
      sameReplyDirectory(parent, identity)
      sameReplyDirectory(join(parent, name), expected)
      if (!name.startsWith('gen-')) continue
      const target = join(parent, 'sealed-' + name.slice(4))
      if (!replyAbsent(target)) throw new Error('reply_seal_collision')
      renameSync(join(parent, name), target)
      sameReplyDirectory(target, expected)
      if (!replyAbsent(join(parent, name))) throw new Error('reply_seal_unconfirmed')
      syncReplyDirectory(parent)
    }
    sameReplyDirectory(parent, identity)
    return replyFreshRoot(parent)
  }
  private helper(args: readonly string[], timeout: number): string {
    const c = this.config
    if (!c) throw new Error('reply_configuration_invalid')
    const result = spawnSync(c.python, ['-I', '-B', c.launcher, ...args], { cwd: '/',
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', SOPHIA_REPLY_RUNTIME_DIR: c.runtimeDir,
        ...(this.root ? { SOPHIA_REPLY_ROOT: this.root } : {}) }, timeout, killSignal: 'SIGKILL',
      maxBuffer: 65_536, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (result.error || result.signal !== null || result.status !== 0) throw new Error('reply_helper_unconfirmed')
    return result.stdout
  }
}
