/**
 * @sophia/dsh-bundle — the Cordis plugin behind the `sophia-control-bridge`
 * row of the `sophia-runtime` profile.
 *
 * S1-03: the bridge over the public Agent interface (see control-bridge.ts).
 * It reports `ready` only after its fences and observers are installed and
 * the Sophia service accepted its hello. Without a service binding it stays
 * `not_ready`, and no component may treat the runtime as healthy
 * (02_DSH_BOOTSTRAP §2: a loaded plugin is not readiness).
 * @module @sophia/dsh-bundle
 */

import { lookup } from 'node:dns/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { ControlBridge } from './control-bridge.js'
import type { BridgeReadiness, RouteConfig, RoutePrices } from './control-bridge.js'
import type { ResearchSources } from './research-tools.js'
import { roleOf } from './role-registry.js'
import { createJinaReader } from './source-jina.js'
import { createTavilySearch } from './source-tavily.js'

export { ControlBridge } from './control-bridge.js'
export { foldLog } from './session-events.js'
export { parseCommand, ProtocolError } from './protocol.js'
export type { RuntimeCommand, RuntimeReceipt, WorkBinding } from './protocol.js'

/** Row id the bundle patch inserts; also the plugin name reported to Cordis. */
export const name = 'sophia-control-bridge'

/**
 * Services the bridge drives; the row waits until all exist. `agentDefaultModel`
 * supplies the recorded model route, `agentPresets` the native presets roles
 * run under (SMC-M02 G3), `systemPrompt` the research section a research agent
 * gets in its own scope (SMC-M03 S4).
 */
export const inject = ['agents', 'sessions', 'tools', 'agentDefaultModel', 'agentPresets', 'systemPrompt']

/** Wire protocol between this bridge and the Sophia service. */
export const PROTOCOL_VERSION = 1

/** Package identity, read from the packed manifest rather than restated. */
export const BUNDLE: { readonly name: string; readonly version: string; readonly dsh: string } = (() => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    name: string
    version: string
    peerDependencies: Record<string, string>
  }
  return { name: manifest.name, version: manifest.version, dsh: manifest.peerDependencies['@deepseek-ai/dsh'] ?? 'unknown' }
})()

/** Validated row config of `sophia-control-bridge`. Values name environment variables or routes, never secrets. */
export interface ControlBridgeConfig {
  readonly protocolVersion: typeof PROTOCOL_VERSION
  readonly serviceUrlEnv: string
  readonly tokenEnv: string
  readonly runtimeUnitEnv: string
  readonly workspaceEnv: string
  /**
   * The unit's route allowlist beyond `default` (the `agent-default-model` selection), by immutable route id
   * (SMC-M03). Changing one is a new runtime unit.
   */
  readonly routes: Readonly<Record<string, RouteConfig>>
  /** Role id → route id. A role not named runs on `default`. */
  readonly roleRoutes: Readonly<Record<string, string>>
  /**
   * The research providers' keys, by environment variable (SMC-M03 S4). Endpoints are overridden only in tests, to a
   * loopback stub; the gate refuses any override in the committed row.
   */
  readonly sources: {
    readonly tavilyKeyEnv: string
    readonly jinaKeyEnv: string
    readonly tavilyEndpoint: string | null
    readonly jinaEndpoint: string | null
  }
}

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/
/** A route id: lowercase words joined by hyphens, never `default` (which names the composition's default model). */
const ROUTE_ID = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/
const ROUTE_PART = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const EFFORT = /^[a-z]{1,16}$/
const CONFIG_KEYS = new Set(['protocolVersion', 'serviceUrlEnv', 'tokenEnv', 'runtimeUnitEnv', 'workspaceEnv', 'routes', 'roleRoutes', 'sources'])
const PRICE_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseRoutes(value: unknown): Record<string, RouteConfig> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new TypeError(`${name}: routes must be a map of route id to route`)
  const routes: Record<string, RouteConfig> = {}
  for (const [id, route] of Object.entries(value)) {
    if (!ROUTE_ID.test(id) || id === 'default') throw new TypeError(`${name}: route id ${JSON.stringify(id)} is not a route id`)
    if (!isRecord(route)) throw new TypeError(`${name}: route ${id} must be an object`)
    const extra = Object.keys(route).filter((key) => !['provider', 'model', 'reasoningEffort', 'maxTokens', 'prices'].includes(key))
    if (extra.length > 0) throw new TypeError(`${name}: route ${id} has unknown fields ${extra.join(', ')}`)
    const { provider, model, reasoningEffort } = route
    if (typeof provider !== 'string' || !ROUTE_PART.test(provider)) throw new TypeError(`${name}: route ${id} needs a provider`)
    if (typeof model !== 'string' || !ROUTE_PART.test(model)) throw new TypeError(`${name}: route ${id} needs a model`)
    if (reasoningEffort !== undefined && reasoningEffort !== null && (typeof reasoningEffort !== 'string' || !EFFORT.test(reasoningEffort))) {
      throw new TypeError(`${name}: route ${id} reasoningEffort must be a level name or null`)
    }
    // The route's output ceiling (M03-RF-0003): the adapter's model entry only supplies a default.
    const { maxTokens } = route
    if (typeof maxTokens !== 'number' || !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000_000) {
      throw new TypeError(`${name}: route ${id} needs maxTokens, its output ceiling`)
    }
    const prices = route.prices === undefined ? undefined : parsePrices(id, route.prices)
    routes[id] = { provider, model, reasoningEffort: typeof reasoningEffort === 'string' ? reasoningEffort : null, maxTokens, ...(prices ? { prices } : {}) }
  }
  return routes
}

/** A route's prices: USD per million tokens of each kind, every one given (SMC-M03 S4). */
function parsePrices(id: string, value: unknown): RoutePrices {
  if (!isRecord(value) || Object.keys(value).some((key) => !(PRICE_KEYS as readonly string[]).includes(key))) {
    throw new TypeError(`${name}: route ${id} prices are ${PRICE_KEYS.join(', ')}`)
  }
  const price = (key: (typeof PRICE_KEYS)[number]): number => {
    const v = value[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1000) throw new TypeError(`${name}: route ${id} needs prices.${key}, USD per million tokens`)
    return v
  }
  return { input: price('input'), cacheRead: price('cacheRead'), cacheWrite: price('cacheWrite'), output: price('output') }
}

/** A test-only endpoint override: an http URL on the loopback interface, never a remote host. */
function loopbackEndpoint(key: string, value: unknown): string | null {
  if (value === undefined || value === null) return null
  let url: URL | null = null
  try {
    url = typeof value === 'string' ? new URL(value) : null
  } catch {
    url = null
  }
  if (!url || url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
    throw new TypeError(`${name}: sources.${key} may only name a loopback test stub`)
  }
  return url.href
}

function parseSources(value: unknown): ControlBridgeConfig['sources'] {
  const raw = value === undefined ? {} : value
  if (!isRecord(raw)) throw new TypeError(`${name}: sources must be an object`)
  const extra = Object.keys(raw).filter((key) => !['tavilyKeyEnv', 'jinaKeyEnv', 'tavilyEndpoint', 'jinaEndpoint'].includes(key))
  if (extra.length > 0) throw new TypeError(`${name}: sources has unknown fields ${extra.join(', ')}`)
  const env = (key: string, fallback: string): string => {
    const v = raw[key] ?? fallback
    if (typeof v !== 'string' || !ENV_NAME.test(v)) throw new TypeError(`${name}: sources.${key} must name an environment variable`)
    return v
  }
  return {
    tavilyKeyEnv: env('tavilyKeyEnv', 'TAVILY_API_KEY'),
    jinaKeyEnv: env('jinaKeyEnv', 'JINA_API_KEY'),
    tavilyEndpoint: loopbackEndpoint('tavilyEndpoint', raw.tavilyEndpoint),
    jinaEndpoint: loopbackEndpoint('jinaEndpoint', raw.jinaEndpoint),
  }
}

/** Every A and AAAA address a name resolves to, for the eligibility check (the host resolves; it never fetches). */
const resolveAll = async (host: string): Promise<string[]> => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)

/** The research providers, reading their keys at call time; a key is never stored or logged. */
function researchSources(sources: ControlBridgeConfig['sources']): ResearchSources {
  return {
    search: createTavilySearch({ apiKey: () => process.env[sources.tavilyKeyEnv], ...(sources.tavilyEndpoint ? { endpoint: sources.tavilyEndpoint } : {}) }),
    read: createJinaReader({ apiKey: () => process.env[sources.jinaKeyEnv], ...(sources.jinaEndpoint ? { endpoint: sources.jinaEndpoint } : {}) }),
    resolve: resolveAll,
  }
}

function parseRoleRoutes(value: unknown, routes: Readonly<Record<string, RouteConfig>>): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new TypeError(`${name}: roleRoutes must be a map of role id to route id`)
  const roleRoutes: Record<string, string> = {}
  for (const [role, route] of Object.entries(value)) {
    if (!roleOf(role)) throw new TypeError(`${name}: roleRoutes names ${JSON.stringify(role)}, which is not one of this bundle's roles`)
    if (typeof route !== 'string' || (route !== 'default' && !Object.hasOwn(routes, route))) {
      throw new TypeError(`${name}: roleRoutes maps ${role} to ${JSON.stringify(route)}, which is neither default nor an allowed route`)
    }
    roleRoutes[role] = route
  }
  return roleRoutes
}

/**
 * Validate the row config. Throwing makes dsh report this plugin as failed,
 * which the Sophia runtime gate treats as an unusable composition.
 * @param config - the row's `config` value exactly as the Loader passes it.
 * @returns The validated config.
 */
export function parseConfig(config: unknown): ControlBridgeConfig {
  if (typeof config !== 'object' || config === null) {
    throw new TypeError(`${name}: row config must be an object, got ${config === null ? 'null' : typeof config}`)
  }
  const raw = config as Record<string, unknown>
  const unknown = Object.keys(raw).filter((key) => !CONFIG_KEYS.has(key))
  if (unknown.length > 0) throw new TypeError(`${name}: unknown config fields ${unknown.join(', ')}`)
  if (raw.protocolVersion !== PROTOCOL_VERSION) {
    throw new TypeError(`${name}: unsupported protocolVersion ${JSON.stringify(raw.protocolVersion)}; ${BUNDLE.name}@${BUNDLE.version} speaks ${PROTOCOL_VERSION}`)
  }
  const envName = (key: string, fallback: string): string => {
    const value = raw[key] ?? fallback
    if (typeof value !== 'string' || !ENV_NAME.test(value)) throw new TypeError(`${name}: ${key} must name an environment variable`)
    return value
  }
  const routes = parseRoutes(raw.routes)
  return {
    protocolVersion: PROTOCOL_VERSION,
    serviceUrlEnv: envName('serviceUrlEnv', 'SOPHIA_BRIDGE_URL'),
    tokenEnv: envName('tokenEnv', 'SOPHIA_BRIDGE_TOKEN'),
    runtimeUnitEnv: envName('runtimeUnitEnv', 'SOPHIA_RUNTIME_UNIT'),
    workspaceEnv: envName('workspaceEnv', 'SOPHIA_WORKSPACE'),
    routes,
    roleRoutes: parseRoleRoutes(raw.roleRoutes, routes),
    sources: parseSources(raw.sources),
  }
}

const log = (line: string): void => {
  process.stderr.write(`[${name}] ${line}\n`)
}

let current: ControlBridge | null = null

/** @returns the running bridge's readiness, or `not_ready` before `apply`. */
export function readiness(): BridgeReadiness {
  return current?.readiness ?? { state: 'not_ready', reason: 'bridge not started' }
}

/**
 * Cordis entry point. Emits one labelled startup line naming the bundle
 * identity, then starts the bridge inside a reversible effect.
 * @param ctx - the Cordis context with `agents`, `sessions` and `tools` injected.
 * @param config - the row config.
 */
export function apply(ctx: Context, config: unknown): void {
  const settings = parseConfig(config)
  const url = process.env[settings.serviceUrlEnv]
  const token = process.env[settings.tokenEnv]
  const unit = process.env[settings.runtimeUnitEnv]
  const workspace = process.env[settings.workspaceEnv] ?? process.cwd()
  if (!isAbsolute(workspace)) throw new TypeError(`${name}: ${settings.workspaceEnv} must be an absolute path`)
  log(`loaded ${BUNDLE.name}@${BUNDLE.version} protocolVersion=${settings.protocolVersion} runtimeUnit=${unit ?? '(unset)'}`)
  const bridge = new ControlBridge(ctx, {
    protocolVersion: PROTOCOL_VERSION,
    bundle: `${BUNDLE.name}@${BUNDLE.version}`,
    dshVersion: BUNDLE.dsh,
    runtimeUnitId: unit ?? '(unset)',
    service: url && token && unit ? { baseUrl: url, token } : null,
    workspace,
    journalDir: join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sophia-bridge'),
    pollWaitMs: 20_000,
    settleTimeoutMs: 30_000,
    routes: settings.routes,
    roleRoutes: settings.roleRoutes,
    research: researchSources(settings.sources),
    log,
  })
  current = bridge
  ctx.effect(() => {
    const stop = bridge.start()
    return () => {
      if (current === bridge) current = null
      void stop()
    }
  })
}

export default { name, inject, apply }
