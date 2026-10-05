/**
 * The external Paperclip adapter `sophia_dsh` (WBC-02 G1/G3): Paperclip's loader calls `createServerAdapter()` from
 * the package root (deploy/paperclip builds that root). The adapter holds Sophia's coordination capability from the
 * Paperclip service environment; it holds no provider credential, builds no prompt and runs no model. An agent's
 * config may only tune how often a run looks at Sophia and how long it observes.
 * @module @sophia/paperclip-adapters/sophia-dsh
 */
import { httpSophiaClient, type SophiaClient } from './client.ts'
import { ADAPTER_TYPE, endpointOf, testEnvironment } from './environment.ts'
import { execute, type ExecuteDeps } from './execute.ts'
import type { AdapterExecutionResult, AdapterSessionCodec, ServerAdapterModule } from './types.ts'

export { ADAPTER_TYPE } from './environment.ts'
export { execute, type ExecuteDeps } from './execute.ts'
export { httpSophiaClient, SophiaRefusal, SophiaUnreachable, type SophiaClient } from './client.ts'

const SESSION_KEYS = ['sophiaWorkId', 'sophiaAttemptId', 'nativeSessionId'] as const

/** Only Sophia's own identifiers survive a session round trip; anything else Paperclip stored is dropped. */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const source: Readonly<Record<string, unknown>> = { ...raw }
    const kept = Object.fromEntries(
      SESSION_KEYS.filter((k) => typeof source[k] === 'string').map((k) => [k, source[k]]),
    )
    return Object.keys(kept).length > 0 ? kept : null
  },
  serialize(params) {
    return params === null ? null : sessionCodec.deserialize(params)
  },
  getDisplayId(params) {
    const id = params?.nativeSessionId
    return typeof id === 'string' ? id : null
  },
}

/** A number from an agent's config, clamped; anything else is the default. */
function tuned(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = config[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted === true) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })

export interface AdapterOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly fetch?: typeof fetch
  /** A client for tests; production builds one from the environment. */
  readonly client?: SophiaClient
}

const NOT_CONFIGURED: AdapterExecutionResult = {
  exitCode: null,
  signal: null,
  timedOut: false,
  errorCode: 'sophia_not_configured',
  errorMessage: 'The Paperclip service has no Sophia coordination endpoint; nothing was started.',
}

export function createSophiaDshAdapter(options: AdapterOptions = {}): ServerAdapterModule {
  const env = options.env ?? process.env
  const fetcher = options.fetch ?? fetch
  return {
    type: ADAPTER_TYPE,
    sessionCodec,
    supportsLocalAgentJwt: false,
    models: [{ id: 'sophia-source-review-v1', label: "Sophia source review (Sophia's runtime and route)" }],
    agentConfigurationDoc:
      "Runs only issues Sophia commissioned, through Sophia's own runtime. Optional: pollSeconds (2-60), maxRunMinutes (1-60). Credentials come from the Paperclip service environment, never from this config.",
    async execute(ctx) {
      const endpoint = endpointOf(env)
      const client = options.client ?? ('origin' in endpoint ? httpSophiaClient({ ...endpoint, fetch: fetcher }) : null)
      if (client === null) return NOT_CONFIGURED
      const deps: ExecuteDeps = {
        client,
        pollMs: tuned(ctx.config, 'pollSeconds', 5, 2, 60) * 1000,
        settleMs: 120_000,
        maxRunMs: tuned(ctx.config, 'maxRunMinutes', 30, 1, 60) * 60_000,
        now: Date.now,
        sleep,
      }
      return execute(ctx, deps)
    },
    testEnvironment: (ctx) => testEnvironment(ctx, env, fetcher, () => new Date()),
  }
}

/** Paperclip's external-adapter entry point. */
export function createServerAdapter(): ServerAdapterModule {
  return createSophiaDshAdapter()
}
