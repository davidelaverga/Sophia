// The owner-runner dispatcher (INC01-CC-002; migration 0092, amendment A47): moves admitted owner-runner operations
// through the one SophiaRunnerPort. It is a transport consumer, not a second scheduler or agent loop: it never builds
// prompts, chooses work or retries an effect it cannot prove absent. Each pass
//   1. maintains expired leases and superseded rows (never possibly sent: requeued; possibly sent: unknown),
//   2. claims pending runner rows, stops first, rechecks current authority and marks the possible send (prepare, one
//      committed transaction), then sends through the port and records its answer under the lease. A possibly-sent
//      operation is never prepared again: without a receipt it stays unknown (r3, R2-F01),
//   3. follows up: an unknown operation is reconciled by its original identities, a received one is observed (no turn).
//      A Stop's observation is recorded with its inputs' barrier token (integrated r2, F01), and a gateway's journaled
//      settlement of a lost Stop is only a cached past read: the dispatcher answers it with a fresh observation.
// Its rows (runner.*) are never claimed by the dsh dispatcher (native.*). The port is injected: in this candidate only
// tests give one (an owner gateway over a fake T3 transport). No live owner-host transport exists yet (INC01-CC-003).
// A v2 send (INC01-CC-005, 0096) is handed its instruction exactly as prepare-send returned it after its recheck; the
// dispatcher never reads, keeps or logs it, and reconcile and observe never need it.
//
// `sends: false` turns new WORK off without hiding or abandoning anything: step 2 claims no create or input (they wait,
// unsent), but still claims and sends an already-admitted Stop (r3, R2-F08), with every recheck prepare-send makes.
// Steps 1 and 3 continue, so an operation possibly sent before the switch is still reconciled by its original
// identities and observed until it settles, and its account reservation is kept until then.
import type pg from 'pg'
import { digestOf, type RunnerAnswer, type SophiaRunnerPort } from '@sophia/coordination/runner-port'
import {
  claimRunnerOutbox,
  maintainRunnerOperations,
  prepareRunnerSend,
  ProjectEventListener,
  recordRunnerAnswer,
  recordRunnerModelReport,
  runnerFollowups,
  type OutboxRow,
  type OwnerRunner,
  type PrepareOutcome,
  type RunnerFollowup,
} from '@sophia/persistence'

export interface RunnerDispatchOptions {
  readonly workerId: string
  /** The one owner runner this dispatcher serves: only its operations are claimed, reconciled and observed. */
  readonly runner: OwnerRunner
  /** That runner's gateway. */
  readonly port: SophiaRunnerPort
  /**
   * Whether new work (create, input) is sent. Off still sends already-admitted Stops, and maintains, reconciles and
   * observes what was already sent.
   */
  readonly sends: boolean
  readonly batchSize?: number
  readonly leaseSeconds?: number
  readonly followupLimit?: number
  /** A received or unknown operation is followed again at most this often (seconds). */
  readonly followupMinAgeSeconds?: number
  readonly log?: (line: string) => void
}

export interface RunnerPass {
  maintained: number
  prepared: PrepareOutcome['result'][]
  /** What the port answered for each send made in this pass. */
  sent: RunnerAnswer['kind'][]
  /** Rows whose lease was lost before their answer could be recorded (maintained on a later pass). */
  lost: number
  reconciled: number
  observed: number
}

const text = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Step 2 for one claimed row: prepare (recheck and mark the possible send), send through the port, record. */
async function sendClaimed(
  pool: pg.Pool,
  row: OutboxRow,
  lease: string,
  options: RunnerDispatchOptions,
  pass: RunnerPass,
) {
  let prepared: PrepareOutcome
  try {
    prepared = await prepareRunnerSend(pool, row.project_id, row.id, lease, options.port.journalId)
  } catch (err) {
    pass.lost += 1
    options.log?.(`runner outbox ${row.id}: not prepared: ${text(err)}`)
    return
  }
  pass.prepared.push(prepared.result)
  if (prepared.result !== 'send') {
    options.log?.(`runner outbox ${row.id}: ${prepared.result}: ${prepared.reason}`)
    return
  }
  const envelope = prepared.envelope
  let answer: RunnerAnswer
  try {
    answer = await options.port.send(envelope, digestOf(envelope), options.port.journalId, prepared.payload)
  } catch {
    // The port threw after the possible send was committed: nothing proves either way.
    // Repair 1 (F01): a fixed reason. What the port threw may echo the instruction: it is neither recorded nor logged.
    options.log?.(`runner operation ${envelope.operationId}: the gateway call threw`)
    answer = { kind: 'unknown', identity: null, reason: 'the gateway call failed; a send may have happened' }
  }
  pass.sent.push(answer.kind)
  try {
    await recordRunnerAnswer(
      pool,
      {
        projectId: row.project_id,
        operationId: envelope.operationId,
        leaseToken: lease,
        journalId: options.port.journalId,
      },
      answer,
    )
  } catch (err) {
    // The gateway journaled the answer; reconciliation reads it back by the operation's identity.
    pass.lost += 1
    options.log?.(`runner operation ${envelope.operationId}: answer not recorded: ${text(err)}`)
  }
}

/**
 * Observe one operation and record what the read proves; a Stop's observation carries its barrier token.
 * INC04-S03b B2 (0108): a create's or input's run observation first appends its reported models, or `absent` when it
 * carried none, in its own statement. That append never decides the lifecycle: whatever its outcome (a missing
 * function, a refused report, a lost connection), the status is recorded next, from the observation's own fields only.
 * Its failure is logged as a fixed class with the operation id, never with database text, a report or a model id.
 */
async function observeOne(pool: pg.Pool, options: RunnerDispatchOptions, f: RunnerFollowup, pass: RunnerPass) {
  const journalId = options.port.journalId
  const seen = await options.port.observe({ envelope: f.envelope, digest: digestOf(f.envelope), journalId })
  const target = { projectId: f.projectId, operationId: f.operationId, leaseToken: null, journalId }
  if (seen.kind === 'run' && f.kind !== 'stop') {
    const appended = await recordRunnerModelReport(pool, target, seen.reportedModels ?? { state: 'absent' })
    if (!appended.recorded)
      options.log?.(`runner operation ${f.operationId}: model evidence not recorded (${appended.reason})`)
  }
  await recordRunnerAnswer(
    pool,
    target,
    seen.kind === 'unknown'
      ? { kind: 'unobserved' }
      : seen.kind === 'run'
        ? { kind: 'run', status: seen.status, terminal: seen.terminal, barrier: f.barrier }
        : { kind: 'no_active_run', barrier: f.barrier },
  )
  pass.observed += 1
}

/**
 * Reconcile one unknown operation by its original identities. A lost Stop's `settled` from the gateway's journal is a
 * cached past read (integrated r2, F01): it is answered with a fresh observation, never recorded as settlement.
 */
async function reconcileOne(pool: pg.Pool, options: RunnerDispatchOptions, f: RunnerFollowup, pass: RunnerPass) {
  const journalId = options.port.journalId
  const answer = await options.port.reconcile({ envelope: f.envelope, digest: digestOf(f.envelope), journalId })
  pass.reconciled += 1
  if (f.kind === 'stop' && answer.kind === 'settled') return observeOne(pool, options, f, pass)
  await recordRunnerAnswer(
    pool,
    { projectId: f.projectId, operationId: f.operationId, leaseToken: null, journalId },
    answer,
  )
}

/** Step 3: reconcile what is unknown, observe what was received, each through this runner's own gateway. */
async function followUp(pool: pg.Pool, options: RunnerDispatchOptions, pass: RunnerPass) {
  const limit = options.followupLimit ?? 20
  const journalId = options.port.journalId
  const followups = await runnerFollowups(pool, options.runner, journalId, limit, options.followupMinAgeSeconds ?? 10)
  for (const f of followups) {
    try {
      await (f.state === 'unknown' ? reconcileOne(pool, options, f, pass) : observeOne(pool, options, f, pass))
    } catch (err) {
      options.log?.(`runner operation ${f.operationId}: follow-up failed: ${text(err)}`)
    }
  }
}

export async function runnerDispatchOnce(pool: pg.Pool, options: RunnerDispatchOptions): Promise<RunnerPass> {
  const pass: RunnerPass = { maintained: 0, prepared: [], sent: [], lost: 0, reconciled: 0, observed: 0 }
  pass.maintained = await maintainRunnerOperations(pool)
  const claimed = await claimRunnerOutbox(pool, options.workerId, options.runner, {
    newWork: options.sends,
    limit: options.batchSize ?? 10,
    leaseSeconds: options.leaseSeconds ?? 60,
  })
  for (const row of claimed) if (row.lease_token) await sendClaimed(pool, row, row.lease_token, options, pass)
  await followUp(pool, options, pass)
  return pass
}

/** Passes until stopped: at once when a project event commits, and at least every `idleMs` so leases are maintained. */
export class RunnerDispatcher {
  private stopped = false
  private wake: (() => void) | null = null
  private halt: () => void = () => undefined
  private readonly halted = new Promise<void>((resolve) => {
    this.halt = resolve
  })
  private readonly listener: ProjectEventListener
  private loop: Promise<void> | null = null
  private readonly pool: pg.Pool
  private readonly options: RunnerDispatchOptions & { idleMs?: number }

  constructor(pool: pg.Pool, options: RunnerDispatchOptions & { idleMs?: number }) {
    this.pool = pool
    this.options = options
    this.listener = new ProjectEventListener(pool, {
      onProject: () => this.wake?.(),
      onReconnect: () => this.wake?.(),
      onError: (err) => options.log?.(`event listener: ${err.message}`),
    })
  }

  start(): void {
    this.loop ??= this.run()
  }

  private async run(): Promise<void> {
    await Promise.race([this.listener.listening, this.halted])
    while (!this.stopped) {
      try {
        const pass = await runnerDispatchOnce(this.pool, this.options)
        if (pass.prepared.length > 0 || pass.maintained > 0) continue
      } catch (err: unknown) {
        this.options.log?.(`runner dispatch pass failed: ${text(err)}`)
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, this.options.idleMs ?? 2000)
        function done() {
          clearTimeout(timer)
          resolve()
        }
        this.wake = done
      })
      this.wake = null
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.halt()
    this.wake?.()
    await this.listener.stop()
    await this.loop
  }
}

/**
 * SOPHIA_OWNER_RUNNER_DISPATCH: unset or `off` only. No owner-host transport is qualified yet (INC01-CC-003), so any
 * other value refuses to start rather than pretend a live route exists.
 */
export function runnerDispatchFromEnv(env: { SOPHIA_OWNER_RUNNER_DISPATCH?: string | undefined }): 'off' {
  const value = env.SOPHIA_OWNER_RUNNER_DISPATCH?.trim()
  if (value === undefined || value === '' || value === 'off') return 'off'
  throw new Error(
    'SOPHIA_OWNER_RUNNER_DISPATCH is off or unset: no owner-host runner transport is qualified (INC01-CC-003)',
  )
}
