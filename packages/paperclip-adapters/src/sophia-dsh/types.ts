/**
 * The external-adapter contract this adapter implements, declared structurally from the pinned source
 * (paperclipai/paperclip@5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb, packages/adapter-utils/src/types.ts): only the
 * members it reads or returns. The loader calls `createServerAdapter()` from the package root
 * (docs/adapters/external-adapters.md at the pin). A field here keeps the pinned name and meaning.
 * @module @sophia/paperclip-adapters/sophia-dsh/types
 */

export interface AdapterAgent {
  readonly id: string
  readonly companyId: string
  readonly name: string
}

export interface AdapterRuntime {
  readonly sessionParams: Record<string, unknown> | null
  readonly sessionDisplayId: string | null
}

/** AdapterExecutionContext: what one Paperclip run hands the adapter. */
export interface AdapterExecutionContext {
  /** Run-scoped operator cancellation; adapters must settle before returning. */
  readonly signal?: AbortSignal
  /** Opt in to signal-based cancellation before starting provider work. */
  readonly onCancellationReady?: () => Promise<void>
  readonly runId: string
  readonly agent: AdapterAgent
  readonly runtime: AdapterRuntime
  readonly config: Record<string, unknown>
  /** The run's context: an issue-driven run carries `issueId` (heartbeat.ts reads `context.issueId ?? context.taskId`). */
  readonly context: Record<string, unknown>
  readonly onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>
  /** Reports that execution crosses the dispatch boundary; called immediately before starting the remote operation. */
  readonly onDispatch?: () => void
}

export interface UsageSummary {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cachedInputTokens?: number
}

export type AdapterBillingType = 'api' | 'metered_api' | 'unknown'

/** AdapterExecutionResult, the members this adapter sets. */
export interface AdapterExecutionResult {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly timedOut: boolean
  readonly errorMessage?: string | null
  readonly errorCode?: string | null
  readonly usage?: UsageSummary
  /** "per_run": the tokens cover this run only. Absent means unknown. */
  readonly usageBasis?: 'per_run' | 'session_cumulative' | null
  readonly sessionParams?: Record<string, unknown> | null
  readonly sessionDisplayId?: string | null
  readonly provider?: string | null
  readonly biller?: string | null
  readonly model?: string | null
  readonly billingType?: AdapterBillingType | null
  /** null when unknown; never a guessed zero. */
  readonly costUsd?: number | null
  readonly resultJson?: Record<string, unknown> | null
  readonly summary?: string | null
}

export interface AdapterEnvironmentCheck {
  readonly code: string
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
  readonly detail?: string | null
  readonly hint?: string | null
}

export interface AdapterEnvironmentTestContext {
  readonly companyId: string
  readonly adapterType: string
  readonly config: Record<string, unknown>
}

export interface AdapterEnvironmentTestResult {
  readonly adapterType: string
  readonly status: 'pass' | 'warn' | 'fail'
  readonly checks: AdapterEnvironmentCheck[]
  readonly testedAt: string
}

export interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null
  getDisplayId?: (params: Record<string, unknown> | null) => string | null
}

/** ServerAdapterModule, the members this adapter provides. */
export interface ServerAdapterModule {
  readonly type: string
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>
  readonly sessionCodec?: AdapterSessionCodec
  readonly models?: Array<{ id: string; label: string }>
  readonly agentConfigurationDoc?: string
  readonly supportsLocalAgentJwt?: boolean
}
