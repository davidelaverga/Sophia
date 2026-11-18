// One finite task on the stock RuntimeDispatcher. OFF keeps original-journal maintenance, never fresh work.
import type pg from 'pg'
import { DbExchangeStore, originalOwnerHostRoute, maintainOwnerHosts } from '@sophia/persistence'
import { OwnerHostPortProxy } from '@sophia/coordination/owner-host-port-proxy'
import type { SophiaRunnerPort } from '@sophia/coordination/runner-port'
import { runnerDispatchFromEnv, runnerDispatchOnce } from './runner-dispatch.ts'

export interface OwnerHostRouteConfig {
  ownerId: string
  environmentRef: string
  journalId: string
  sends: boolean
}
const selected = (env: Record<string, string | undefined>, key: string) => (env[key] ?? '').trim()
export function ownerHostRouteFromEnv(env: Record<string, string | undefined>): OwnerHostRouteConfig | null {
  const mode = runnerDispatchFromEnv(env)
  const ownerId = selected(env, 'SOPHIA_OWNER_RUNNER_OWNER_ID')
  const environmentRef = selected(env, 'SOPHIA_OWNER_RUNNER_ENVIRONMENT_REF')
  const journalId = selected(env, 'SOPHIA_OWNER_RUNNER_JOURNAL_ID')
  if (!ownerId && !environmentRef && !journalId && mode === 'off') return null
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
  if (
    !ownerId ||
    !uuid.test(ownerId) ||
    !journalId ||
    !uuid.test(journalId) ||
    !environmentRef ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(environmentRef)
  )
    throw new Error('Owner runner requires the complete explicit owner/environment/original journal tuple')
  return { ownerId, environmentRef, journalId, sends: mode === 'on' }
}

/** Startup ON needs current records; every real prepare/GO retains its own current qualification/rights checks. */
export async function requireOwnerHostRoute(pool: pg.Pool, config: OwnerHostRouteConfig | null): Promise<void> {
  if (!config?.sends) return
  const route = await originalOwnerHostRoute(pool, config.ownerId, config.environmentRef, config.journalId)
  if (!route?.newWorkQualified) throw new Error('Owner runner has no currently qualified original route')
}

function sameRoute(
  current: Awaited<ReturnType<typeof originalOwnerHostRoute>>,
  original: NonNullable<Awaited<ReturnType<typeof originalOwnerHostRoute>>>,
): boolean {
  return (
    current !== null &&
    ['hostId', 't3Namespace', 'accountKey', 'profileId', 'profileRevision'].every(
      (key) => Reflect.get(current, key) === Reflect.get(original, key),
    )
  )
}
export class OwnerHostRouteController {
  private pending: Promise<void> | null = null
  private stopped = false
  private isStopped(): boolean {
    return this.stopped
  }
  private readonly pool: pg.Pool
  private readonly config: OwnerHostRouteConfig | null
  private readonly workerId: string
  private readonly log: ((line: string) => void) | undefined
  constructor(pool: pg.Pool, config: OwnerHostRouteConfig | null, workerId: string, log?: (line: string) => void) {
    this.pool = pool
    this.config = config
    this.workerId = workerId
    this.log = log
  }
  pass(): void {
    if (this.isStopped() || this.pending || !this.config) return
    this.pending = this.run(this.config)
      .catch(() => this.log?.('owner host route unavailable; existing work remains unknown'))
      .finally(() => {
        this.pending = null
      })
  }
  private async run(config: OwnerHostRouteConfig): Promise<void> {
    const original = await originalOwnerHostRoute(this.pool, config.ownerId, config.environmentRef, config.journalId)
    if (!original || this.isStopped()) throw new Error('Owner host route unavailable')
    const proxy = new OwnerHostPortProxy({
      store: new DbExchangeStore(this.pool),
      ...config,
      namespace: original.t3Namespace,
      deadlineMs: 10_000,
    })
    const fence = async (newWork = false) => {
      if (this.isStopped()) throw new Error('Owner host route stopped')
      const current = await originalOwnerHostRoute(this.pool, config.ownerId, config.environmentRef, config.journalId)
      if (
        this.isStopped() ||
        !current ||
        !sameRoute(current, original) ||
        (newWork && (!config.sends || !current.newWorkQualified))
      )
        throw new Error('Owner host route unavailable')
    }
    const port: SophiaRunnerPort = {
      journalId: config.journalId,
      send: async (...args) => {
        await fence(args[0].kind !== 'stop')
        return proxy.send(...args)
      },
      reconcile: async (...args) => {
        await fence()
        return proxy.reconcile(...args)
      },
      observe: async (...args) => {
        await fence()
        return proxy.observe(...args)
      },
    }
    await maintainOwnerHosts(this.pool, 20)
    if (this.isStopped()) return
    await runnerDispatchOnce(this.pool, {
      workerId: this.workerId,
      runner: config,
      port,
      canPrepare: async (row) => {
        if (this.isStopped()) return false
        const route = await originalOwnerHostRoute(this.pool, config.ownerId, config.environmentRef, config.journalId, {
          projectId: row.project_id,
          outboxId: row.id,
        })
        return !this.isStopped() && route?.hostId === original.hostId
      },
      sends: config.sends && original.newWorkQualified,
      batchSize: 1,
      followupLimit: 1,
      log: () => this.log?.('owner runner pass updated metadata'),
    })
  }
  async stop(): Promise<void> {
    this.stopped = true
    await this.pending
  }
}
