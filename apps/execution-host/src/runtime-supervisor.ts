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

import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

/** What the supervisor needs to know about the runtime unit it launches. */
export interface SupervisedUnit {
  readonly id: string
  readonly profile: string
  /** Deployed runtime artifact directory (verified by the caller before launch). */
  readonly runtimeDir: string
  /** Launcher path inside the artifact, e.g. `node_modules/@deepseek-ai/dsh/lib/bin.js`. */
  readonly launcherEntry: string
}

export interface SupervisorOptions {
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
  state: SupervisorState = 'idle'

  constructor(private readonly options: SupervisorOptions) {
    this.leasePath = join(options.projectRoot, 'supervisor.lease')
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
    return {
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
