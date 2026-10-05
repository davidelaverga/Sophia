/**
 * The adapter's environment test: Sophia's coordination origin and capability are set in the Paperclip service's
 * environment (never in an agent's config, which a board user can read), and Sophia answers its health check. It
 * makes no model call, starts nothing and spends nothing.
 * @module @sophia/paperclip-adapters/sophia-dsh/environment
 */
import type { AdapterEnvironmentCheck, AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from './types.ts'

export const ADAPTER_TYPE = 'sophia_dsh'

/** The two variables the Paperclip service needs; their values are never echoed. */
export const ENV = { origin: 'SOPHIA_COORDINATION_URL', token: 'SOPHIA_COORDINATION_TOKEN' } as const

export interface SophiaEndpoint {
  readonly origin: string
  readonly token: string
}

/** The configured endpoint, or the checks that say what is missing. */
export function endpointOf(
  env: Readonly<Record<string, string | undefined>>,
): SophiaEndpoint | AdapterEnvironmentCheck[] {
  const origin = env[ENV.origin]?.trim() ?? ''
  const token = env[ENV.token]?.trim() ?? ''
  const missing: AdapterEnvironmentCheck[] = []
  if (!/^https?:\/\/[^\s/]+/.test(origin)) {
    missing.push({
      code: 'sophia_origin_missing',
      level: 'error',
      message: `${ENV.origin} is not set to Sophia's API origin.`,
      hint: 'Set it in the Paperclip service environment.',
    })
  }
  if (token.length < 32) {
    missing.push({
      code: 'sophia_token_missing',
      level: 'error',
      message: `${ENV.token} is not set.`,
      hint: "Set the adapter's Sophia capability in the Paperclip service environment.",
    })
  }
  return missing.length === 0 ? { origin: origin.replace(/\/+$/, ''), token } : missing
}

const hasEndpoint = (value: SophiaEndpoint | AdapterEnvironmentCheck[]): value is SophiaEndpoint => 'origin' in value

async function healthCheck(endpoint: SophiaEndpoint, fetcher: typeof fetch): Promise<AdapterEnvironmentCheck> {
  try {
    const res = await fetcher(`${endpoint.origin}/health`, { signal: AbortSignal.timeout(5_000) })
    if (res.ok) return { code: 'sophia_reachable', level: 'info', message: 'Sophia answered its health check.' }
    return {
      code: 'sophia_unhealthy',
      level: 'error',
      message: `Sophia answered its health check with ${String(res.status)}.`,
    }
  } catch (err: unknown) {
    return {
      code: 'sophia_unreachable',
      level: 'error',
      message: 'Sophia did not answer its health check.',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
  env: Readonly<Record<string, string | undefined>>,
  fetcher: typeof fetch,
  now: () => Date,
): Promise<AdapterEnvironmentTestResult> {
  const endpoint = endpointOf(env)
  const checks = hasEndpoint(endpoint) ? [await healthCheck(endpoint, fetcher)] : endpoint
  const status = checks.some((c) => c.level === 'error')
    ? 'fail'
    : checks.some((c) => c.level === 'warn')
      ? 'warn'
      : 'pass'
  return { adapterType: ctx.adapterType, status, checks, testedAt: now().toISOString() }
}
