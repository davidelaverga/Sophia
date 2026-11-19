/** One finite result task owned by the existing runtime dispatcher. No second scheduling loop. */
import { createHash } from 'node:crypto'
import type pg from 'pg'
import { OwnerHostPortProxy } from '@sophia/coordination/owner-host-port-proxy'
import { digestOf, type CollectedContent, type RunnerEnvelope } from '@sophia/coordination/runner-port'
import {
  claimRunnerResult,
  resumeRunnerResult,
  consumeRunnerResult,
  finishRunnerResult,
  maintainRunnerResults,
  requireRunnerResults,
  RunnerResultExchangeStore,
  type RunnerResultClaim,
} from '@sophia/persistence'

export interface ResultController {
  pass(): void
  stop(): Promise<void>
}

/** PostgreSQL jsonb's string array encoding; all members are validated native identity strings. */
export function resultVersionKey(
  c: { envelope: Pick<RunnerEnvelope, 'operationId' | 'bindingId'>; journalId: string; namespace: string },
  r: CollectedContent,
): string {
  const identity = [
    c.envelope.operationId,
    c.envelope.bindingId,
    c.journalId,
    c.namespace,
    r.threadId,
    r.runId,
    r.inputMessageId,
    r.messageId,
    r.itemId,
  ]
  return createHash('sha256')
    .update(`[${identity.map((v) => JSON.stringify(v)).join(', ')}]`, 'utf8')
    .digest('hex')
}

async function collect(pool: pg.Pool, c: RunnerResultClaim): Promise<void> {
  const store = new RunnerResultExchangeStore(pool, c)
  const port = new OwnerHostPortProxy({
    store,
    ownerId: c.ownerId,
    environmentRef: c.environmentRef,
    journalId: c.journalId,
    namespace: c.namespace,
    deadlineMs: 30_000,
  })
  const result = await port.collect(
    { envelope: c.envelope, journalId: c.journalId, digest: digestOf(c.envelope) },
    { v: 1, maxPages: c.maxPages, maxBytes: c.maxBytes },
  )
  if (result.kind !== 'collected' || !store.exchangeId) return
  // Only metadata crosses back. SQL consumes the original staged answer and redacts it atomically with the Source.
  await consumeRunnerResult(pool, c, {
    exchangeId: store.exchangeId,
    sha256: result.textSha256,
    versionKey: resultVersionKey(c, result),
  })
}

export interface RunnerResultsOptions {
  enabled: boolean
  log?: (line: string) => void
  shutdownMs?: number
}

export class RunnerResultsController implements ResultController {
  private pending: Promise<void> | null = null
  private stopped = false
  private readonly pool: pg.Pool
  private readonly options: RunnerResultsOptions
  constructor(pool: pg.Pool, options: RunnerResultsOptions) {
    this.pool = pool
    this.options = options
  }

  pass(): void {
    if (this.stopped || this.pending) return
    this.pending = this.run()
      .catch(() => this.options.log?.('runner result pass failed'))
      .finally(() => {
        this.pending = null
      })
  }

  private async run(): Promise<void> {
    // OFF may clean up existing commitments, but never claims, reserves or enqueues a new read.
    try {
      await requireRunnerResults(this.pool)
    } catch (err) {
      if (
        !this.options.enabled &&
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === 'projection_unavailable'
      )
        return
      throw err
    }
    await maintainRunnerResults(this.pool)
    if (this.stopped) return
    const recovered = await resumeRunnerResult(this.pool)
    const c = recovered ?? (this.options.enabled ? await claimRunnerResult(this.pool) : null)
    if (!c) return
    try {
      if (this.accepting()) await collect(this.pool, c)
    } finally {
      await finishRunnerResult(this.pool, c)
    }
  }

  private accepting(): boolean {
    return !this.stopped
  }

  async stop(): Promise<void> {
    this.stopped = true
    const pending = this.pending
    if (!pending) return
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      pending,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.options.shutdownMs ?? 1000)
      }),
    ])
    clearTimeout(timer)
    // A pending native transport is not cancelled or settled by this bounded wait. SQL keeps its durable commitment.
  }
}
