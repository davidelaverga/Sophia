import type { ManagedExploreAccountSnapshot, ManagedExploreFunding } from '@sophia/contracts'
import { UUID_PATTERN } from './routes/schemas.ts'

export interface ManagedExploreAccountConfig {
  projectId: string
  founderId: string
  routeId: string
  observation: ManagedExploreAccountSnapshot
}

const uuid = new RegExp(UUID_PATTERN, 'u')
const route = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const utc = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u
const fields = ['projectId', 'founderId', 'routeId', 'balanceCents', 'currency', 'autoRechargeEnabled', 'observedAt']

function exactRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  )
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value
}

function isObservedAt(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = utc.exec(value)
  if (!match || match[0] !== value) return false
  const milliseconds = (match[2] ?? '').slice(0, 3).padEnd(3, '0')
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString() === `${match[1]}.${milliseconds}Z`
}

function parseRecord(value: unknown): ManagedExploreAccountConfig | undefined {
  if (!exactRecord(value)) return undefined
  const { projectId, founderId, routeId, balanceCents, currency, autoRechargeEnabled, observedAt } = value
  if (!matches(projectId, uuid) || !matches(founderId, uuid) || !matches(routeId, route)) return undefined
  if (balanceCents !== null && (typeof balanceCents !== 'number' || !Number.isSafeInteger(balanceCents)))
    return undefined
  if (autoRechargeEnabled !== null && typeof autoRechargeEnabled !== 'boolean') return undefined
  if (currency !== 'USD' || !isObservedAt(observedAt)) return undefined
  return { projectId, founderId, routeId, observation: { balanceCents, currency, autoRechargeEnabled, observedAt } }
}

/** Invalid or unavailable observational configuration quietly omits this optional field. */
export function managedExploreAccountFromEnv(raw: string | undefined): ManagedExploreAccountConfig | undefined {
  if (!raw) return undefined
  try {
    return parseRecord(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** Call after a scoped database read. Only the observation is projected, never the configuration's actor or project. */
export function withManagedExploreAccount<T extends { funding: ManagedExploreFunding }>(
  view: T,
  projectId: string,
  founderId: string,
  config: ManagedExploreAccountConfig | undefined,
): T {
  if (config?.projectId !== projectId || config.founderId !== founderId || config.routeId !== view.funding.routeId) {
    return view
  }
  return { ...view, funding: { ...view.funding, accountSnapshot: config.observation } }
}
