/**
 * Binds Paperclip's plugin context to CoordinationHost. `SdkContext` and `SdkApiRequest` are the members of the pinned
 * SDK's PluginContext and PluginApiRequestInput (packages/plugins/sdk/src/types.ts and define-plugin.ts at
 * paperclipai/paperclip@5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb) this plugin reads, declared structurally so the
 * binding is typed and tested here; the real context is assignable to them. scripts/paperclip-build.mjs writes the
 * two-line SDK entry (`definePlugin` + `runWorker`) that hands the context to `pluginHandlers`.
 * @module @sophia/paperclip-plugin/bind
 */
import { readFileSync, readlinkSync } from 'node:fs'
import type { IssueStatus } from '@sophia/coordination/plugin-wire'
import { handleApiRequest, settleOpenWrites } from './coordination.ts'
import {
  UnansweredHostCall,
  type ApiResponse,
  type CoordinationHost,
  type HostIssue,
  type HostIssueCreate,
  type HostProcess,
  type OriginKind,
  type Row,
} from './host.ts'
import { REVIEWER_AGENT_KEY, SETTLE_JOB_KEY } from './manifest.ts'

/** The Issue fields read (shared/src/types/issue.ts). */
interface SdkIssue {
  readonly id: string
  readonly companyId: string
  readonly projectId?: string | null
  readonly status: string
  readonly originKind?: string | null
  readonly originId?: string | null
}

export interface SdkContext {
  readonly issues: {
    list(input: {
      companyId: string
      originKind?: OriginKind
      originId?: string
      limit?: number
    }): Promise<readonly SdkIssue[]>
    get(issueId: string, companyId: string): Promise<SdkIssue | null>
    create(input: HostIssueCreate): Promise<SdkIssue>
    update(issueId: string, patch: { status?: IssueStatus }, companyId: string): Promise<SdkIssue>
    requestWakeup(
      issueId: string,
      companyId: string,
      options?: { reason?: string; contextSource?: string; idempotencyKey?: string | null },
    ): Promise<{ readonly queued: boolean }>
  }
  readonly agents: {
    readonly managed: { reconcile(agentKey: string, companyId: string): Promise<{ readonly agentId: string | null }> }
  }
  readonly db: {
    readonly namespace: string
    query<T extends Row>(sql: string, params?: unknown[]): Promise<T[]>
    execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>
  }
  readonly config: { get(companyId?: string): Promise<Record<string, unknown>> }
  readonly jobs: { register(key: string, fn: (job: unknown) => Promise<void>): void }
}

export interface SdkApiRequest {
  readonly routeKey: string
  readonly params: Record<string, string>
  readonly body: unknown
  readonly actor: { readonly actorType: 'user' | 'agent'; readonly actorId: string; readonly userId?: string | null }
  readonly companyId: string
}

const issueOf = (issue: SdkIssue): HostIssue => ({
  id: issue.id,
  companyId: issue.companyId,
  projectId: issue.projectId ?? null,
  status: issue.status,
  originKind: issue.originKind ?? null,
  originId: issue.originId ?? null,
})

/** The pinned SDK's JsonRpcCallError code for a worker-to-host call it stopped waiting for (PLUGIN_RPC_ERROR_CODES). */
const RPC_TIMEOUT = -32003

/**
 * How long the worker waits for the host to answer one call, given to the SDK's `startWorkerRpcHost` by the worker
 * entry (scripts/paperclip-build.mjs) instead of its 30 s default: a status write the host answers, however slowly, is
 * finished at once, while one it never answers stays open until the host process that served it is gone.
 */
export const HOST_CALL_TIMEOUT_MS = 10 * 60 * 1000

/** The /proc reads the host-process identity needs, injected for tests. */
export interface ProcFs {
  read(path: string): string
  link(path: string): string
}

const procFs: ProcFs = { read: (path) => readFileSync(path, 'utf8'), link: (path) => readlinkSync(path) }

/** A process's start time, field 22 of `/proc/<pid>/stat`, read after the command name (which may hold spaces). */
function startOf(stat: string): string | null {
  const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  return start !== undefined && /^\d+$/.test(start) ? start : null
}

/**
 * The host process serving this worker, and its process namespace. The pinned host forks each plugin worker as its
 * direct child (plugin-worker-manager.ts, `fork`), so the parent is the host: `pid:start` (the start time tells a
 * reused pid apart). The namespace is the machine boot (`/proc/sys/kernel/random/boot_id`) and the pid namespace
 * (`/proc/self/ns/pid`). Recorded with each status write so that an operator can tell which instance served it. Null
 * when any part cannot be read.
 */
export function hostProcessOf(ppid: number = process.ppid, fs: ProcFs = procFs): HostProcess | null {
  if (!Number.isInteger(ppid) || ppid <= 0) return null
  try {
    const start = startOf(fs.read(`/proc/${String(ppid)}/stat`))
    const boot = fs.read('/proc/sys/kernel/random/boot_id').trim()
    const pids = fs.link('/proc/self/ns/pid')
    return start === null || boot === '' || pids === ''
      ? null
      : { namespace: `${boot}/${pids}`, process: `${String(ppid)}:${start}` }
  } catch {
    return null
  }
}

/** A host call's result; a call the worker stopped waiting for is told apart from the host's own error. */
async function answered<T>(call: Promise<T>): Promise<T> {
  try {
    return await call
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === RPC_TIMEOUT)
      throw new UnansweredHostCall(err instanceof Error ? err.message : 'The host did not answer the call')
    throw err
  }
}

export function hostOf(
  ctx: SdkContext,
  clock: () => number = Date.now,
  hostProcess: HostProcess | null = hostProcessOf(),
): CoordinationHost {
  return {
    issues: {
      list: async (input) => (await ctx.issues.list(input)).map(issueOf),
      get: async (issueId, companyId) => {
        const issue = await ctx.issues.get(issueId, companyId)
        return issue ? issueOf(issue) : null
      },
      create: async (input) => issueOf(await ctx.issues.create(input)),
      update: async (issueId, patch, companyId) =>
        issueOf(await answered(ctx.issues.update(issueId, patch, companyId))),
      requestWakeup: async (issueId, companyId, options) => ({
        queued: (await ctx.issues.requestWakeup(issueId, companyId, options)).queued,
      }),
    },
    reviewerAgent: async (companyId) => (await ctx.agents.managed.reconcile(REVIEWER_AGENT_KEY, companyId)).agentId,
    namespace: ctx.db.namespace,
    query: (sql, params) => ctx.db.query(sql, [...params]),
    execute: (sql, params) => ctx.db.execute(sql, [...params]),
    config: (companyId) => ctx.config.get(companyId),
    now: () => Math.floor(clock() / 1000),
    hostProcess,
  }
}

const NOT_READY: ApiResponse = {
  status: 503,
  body: { error: { code: 'not_ready', message: 'The plugin is starting' } },
}

/** The plugin's `setup` (which registers the settle job) and `onApiRequest`; one instance per worker. */
export function pluginHandlers(): {
  setup(ctx: SdkContext): Promise<void>
  onApiRequest(input: SdkApiRequest): Promise<ApiResponse>
} {
  let host: CoordinationHost | null = null
  return {
    setup(ctx) {
      const bound = hostOf(ctx)
      host = bound
      ctx.jobs.register(SETTLE_JOB_KEY, async () => {
        await settleOpenWrites(bound)
      })
      return Promise.resolve()
    },
    onApiRequest(input) {
      if (host === null) return Promise.resolve(NOT_READY)
      const { routeKey, params, body, companyId } = input
      const actor = {
        actorType: input.actor.actorType,
        actorId: input.actor.actorId,
        userId: input.actor.userId ?? null,
      }
      return handleApiRequest(host, { routeKey, params, body, actor, companyId })
    },
  }
}
