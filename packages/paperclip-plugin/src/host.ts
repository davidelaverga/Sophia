/**
 * The part of Paperclip's plugin context (`@paperclipai/plugin-sdk`, PluginContext, at the pinned source
 * paperclipai/paperclip@5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb) this plugin uses, declared structurally so the
 * handlers are tested without the SDK; worker.ts binds the real context to it. Each member names the pinned method
 * it stands for (docs/SOURCE_MAP.md lists the files and lines):
 *
 * - issues.list/get/create/update/requestWakeup: PluginIssuesClient (packages/plugins/sdk/src/types.ts), served by
 *   server/src/services/plugin-host-services.ts. `list` filters originKind and originId by exact equality within
 *   the company (server/src/services/issues.ts); a plugin may only use origin kinds under `plugin:<its key>`.
 *   `create` and `update` reject with UnansweredHostCall when the host never answered them.
 * - reviewerAgent: `ctx.agents.managed.reconcile(agentKey, companyId)` (PluginManagedAgentResolution.agentId).
 * - query/execute: PluginDatabaseClient on the host-derived namespace (SELECT; namespace INSERT/UPDATE/DELETE).
 * - config: PluginConfigClient.get(companyId).
 * @module @sophia/paperclip-plugin/host
 */

import type { IssueStatus } from '@sophia/coordination/plugin-wire'

/** An issue origin kind a plugin may use: under `plugin:<its key>` (PluginIssueOriginKind). */
export type OriginKind = `plugin:${string}`

/** A row the namespace returns. */
export type Row = Record<string, unknown>

/** The fields of a core Issue the plugin reads. */
export interface HostIssue {
  readonly id: string
  readonly companyId: string
  readonly projectId: string | null
  readonly status: string
  readonly originKind: string | null
  readonly originId: string | null
}

export interface HostIssueCreate {
  readonly companyId: string
  readonly projectId: string
  readonly title: string
  readonly description: string
  readonly status: 'todo' | 'blocked' | 'cancelled'
  readonly priority: 'medium'
  readonly assigneeAgentId: string
  readonly originKind: OriginKind
  readonly originId: string
  readonly billingCode: string
}

export interface CoordinationHost {
  readonly issues: {
    list(input: {
      companyId: string
      originKind: OriginKind
      originId: string
      limit: number
    }): Promise<readonly HostIssue[]>
    get(issueId: string, companyId: string): Promise<HostIssue | null>
    create(input: HostIssueCreate): Promise<HostIssue>
    update(issueId: string, patch: { status: IssueStatus }, companyId: string): Promise<HostIssue>
    requestWakeup(
      issueId: string,
      companyId: string,
      options: { reason: string; contextSource: string; idempotencyKey: string },
    ): Promise<{ queued: boolean }>
  }
  /** The plugin-managed source-reviewer agent of a company (the dsh adapter's agent), or null when it cannot be resolved. */
  reviewerAgent(companyId: string): Promise<string | null>
  /** The plugin's database namespace (schema name). */
  readonly namespace: string
  query<T extends Row>(sql: string, params: readonly unknown[]): Promise<readonly T[]>
  execute(sql: string, params: readonly unknown[]): Promise<{ rowCount: number }>
  config(companyId: string): Promise<Readonly<Record<string, unknown>>>
  /** Seconds since the epoch. */
  now(): number
  /**
   * The host process serving this worker, `pid:start`, and its process namespace (the machine boot and the pid
   * namespace); null when either cannot be read. A status write is recorded with both, so an operator can tell which
   * instance served it. It never finishes a write: a dead process's database session can still commit.
   */
  readonly hostProcess: HostProcess | null
}

export interface HostProcess {
  readonly namespace: string
  readonly process: string
}

/**
 * A host call the host never answered: the pinned worker stopped waiting for it (its own timeout, JsonRpcCallError
 * PLUGIN_RPC_ERROR_CODES.TIMEOUT in packages/plugins/sdk/src/worker-rpc-host.ts). The host may still act on it. Any
 * other error is the host's answer, sent only once its handler finished (plugin-worker-manager.ts, handleWorkerRequest).
 */
export class UnansweredHostCall extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnansweredHostCall'
  }
}

/** The request the host hands the plugin's onApiRequest after enforcing auth, company access and route matching. */
export interface ApiRequest {
  readonly routeKey: string
  readonly params: Readonly<Record<string, string>>
  readonly body: unknown
  readonly actor: { readonly actorType: 'user' | 'agent'; readonly actorId: string; readonly userId?: string | null }
  readonly companyId: string
}

export interface ApiResponse {
  readonly status: number
  readonly body: unknown
}
