/**
 * A synthetic Paperclip for tests, never live evidence: core issues held in memory, the plugin's namespace in a real
 * PostgreSQL database (its migration applied as written, with stub `public.issues` and `public.heartbeat_runs`). It
 * stands in for the pinned host's issue APIs as far as CoordinationHost declares them: exact origin lookup within a
 * company, creates and status updates, the managed reviewer agent and config. Wakeups follow the pin, not a wish: one
 * is never deduplicated by its idempotency key (every arrival queues a run of the issue in `heartbeat_runs`), and a
 * fault can fail one before it is durable or after (`plugin-host-services.ts` logs activity after
 * `heartbeat.wakeup`). Runtime SQL obeys the pin's ctx.db rules (`host-sql.ts`).
 * @module @sophia/paperclip-plugin/memory-host
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import type { IssueStatus } from '@sophia/coordination/plugin-wire'
import { handleApiRequest } from './coordination.ts'
import type { ApiRequest, ApiResponse, CoordinationHost, HostIssue, HostIssueCreate, Row } from './host.ts'
import { checkExecute, checkQuery } from './host-sql.ts'
import { manifest } from './manifest.ts'

/** The namespace the pinned host derives for this plugin key (plugin_<key>_<hash>). */
export const NAMESPACE = 'plugin_sophia_coordination_00c896da3d'

/** A connection to the database that holds the namespace (Paperclip's own database in production, never Sophia's). */
export type Queryable = pg.Client

/** Create the stub core table, the namespace and the plugin's migration in an empty database. */
export async function installNamespace(db: Queryable): Promise<void> {
  const migration = readFileSync(
    fileURLToPath(new URL('../migrations/001_sophia_coordination.sql', import.meta.url)),
    'utf8',
  )
  await db.query('CREATE TABLE IF NOT EXISTS public.issues (id uuid PRIMARY KEY)')
  await db.query(
    `CREATE TABLE IF NOT EXISTS public.heartbeat_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id text NOT NULL,
       status text NOT NULL DEFAULT 'queued', context_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now())`,
  )
  await db.query(`CREATE SCHEMA ${NAMESPACE}`)
  await db.query(migration)
}

export interface MemoryIssue extends Omit<HostIssueCreate, 'status'> {
  readonly id: string
  status: string
}

export interface MemoryPaperclipOptions {
  readonly config: Readonly<Record<string, unknown>>
  /** The managed source-reviewer agent; null when it is not provisioned. */
  readonly reviewerAgentId?: string | null
  readonly now?: () => number
  /** Runs inside create before the issue exists, e.g. to hold a create in flight. */
  readonly beforeCreate?: () => Promise<void>
  /**
   * Fault injection while its check says so: a status update fails, changing nothing; a wakeup fails `before` it is
   * durable (no run), or `after` (its run is queued, then the call fails, as when the host's activity log fails), or
   * is `not_queued` (the host answers `{queued: false, runId: null}`, as for an agent left in error).
   */
  /** Runs inside a status update before it lands, e.g. to hold one in flight (a delayed host call). */
  readonly beforeUpdate?: (issueId: string, status: string) => Promise<void> | undefined
  readonly fails?: {
    readonly update?: () => boolean
    readonly wake?: () => 'before' | 'after' | 'not_queued' | null
  }
}

export interface MemoryPaperclip {
  readonly host: CoordinationHost
  readonly issues: Map<string, MemoryIssue>
  readonly wakeups: Wakeup[]
  /** A board user's request through the plugin's onApiRequest. */
  request(input: Omit<ApiRequest, 'actor'> & { actor?: ApiRequest['actor'] }): Promise<ApiResponse>
}

const view = (issue: MemoryIssue): HostIssue => ({
  id: issue.id,
  companyId: issue.companyId,
  projectId: issue.projectId,
  status: issue.status,
  originKind: issue.originKind,
  originId: issue.originId,
})

export const INTEGRATION_USER = 'user-sophia-integration'

type Wakeup = { issueId: string; idempotencyKey: string }

/** The pinned host's issue service, as far as CoordinationHost declares it, over a map. */
function issueService(
  db: Queryable,
  options: MemoryPaperclipOptions,
  issues: Map<string, MemoryIssue>,
  wakeups: Wakeup[],
) {
  const owned = (issueId: string, companyId: string): MemoryIssue => {
    const issue = issues.get(issueId)
    if (issue?.companyId !== companyId) throw new Error('issue not found in company')
    return issue
  }
  const service: CoordinationHost['issues'] = {
    list: (input) =>
      Promise.resolve(
        [...issues.values()]
          .filter(
            (i) =>
              i.companyId === input.companyId && i.originKind === input.originKind && i.originId === input.originId,
          )
          .slice(0, input.limit)
          .map(view),
      ),
    get: (issueId, companyId) => {
      const issue = issues.get(issueId)
      return Promise.resolve(issue?.companyId === companyId ? view(issue) : null)
    },
    create: async (input) => {
      await options.beforeCreate?.()
      const issue: MemoryIssue = { ...input, id: randomUUID() }
      await db.query('INSERT INTO public.issues (id) VALUES ($1)', [issue.id])
      issues.set(issue.id, issue)
      return view(issue)
    },
    update: async (issueId, patch: { status: IssueStatus }, companyId) => {
      if (options.fails?.update?.() === true) throw new Error('injected: issue update failed')
      await options.beforeUpdate?.(issueId, patch.status)
      const issue = owned(issueId, companyId)
      issue.status = patch.status
      return view(issue)
    },
    requestWakeup: async (issueId, companyId, wake) => {
      const fault = options.fails?.wake?.() ?? null
      if (fault === 'before') throw new Error('injected: wakeup failed before it was durable')
      owned(issueId, companyId)
      if (fault === 'not_queued') return { queued: false }
      await db.query(`INSERT INTO public.heartbeat_runs (company_id, context_snapshot) VALUES ($1, $2)`, [
        companyId,
        { issueId, wakeReason: wake.reason, source: wake.contextSource },
      ])
      wakeups.push({ issueId, idempotencyKey: wake.idempotencyKey })
      if (fault === 'after') throw new Error('injected: wakeup durable, then the call failed')
      return { queued: true }
    },
  }
  return service
}

export function memoryPaperclip(db: Queryable, options: MemoryPaperclipOptions): MemoryPaperclip {
  const issues = new Map<string, MemoryIssue>()
  const wakeups: Wakeup[] = []
  const host: CoordinationHost = {
    issues: issueService(db, options, issues, wakeups),
    reviewerAgent: () =>
      Promise.resolve(options.reviewerAgentId === undefined ? 'agent-source-reviewer' : options.reviewerAgentId),
    namespace: NAMESPACE,
    query: async <T extends Row>(sql: string, params: readonly unknown[]) => {
      checkQuery(sql, NAMESPACE, manifest.database.coreReadTables)
      return (await db.query<T>(sql, [...params])).rows
    },
    execute: async (sql, params) => {
      checkExecute(sql, NAMESPACE)
      return { rowCount: (await db.query(sql, [...params])).rowCount ?? 0 }
    },
    config: () => Promise.resolve(options.config),
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
  }
  const integration = { actorType: 'user' as const, actorId: INTEGRATION_USER, userId: INTEGRATION_USER }
  return {
    host,
    issues,
    wakeups,
    request: (input) => handleApiRequest(host, { ...input, actor: input.actor ?? integration }),
  }
}
