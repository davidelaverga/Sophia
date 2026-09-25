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

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { ControlBridge } from './control-bridge.js'
import type { BridgeReadiness } from './control-bridge.js'

export { ControlBridge } from './control-bridge.js'
export { foldLog } from './session-events.js'
export { parseCommand, ProtocolError } from './protocol.js'
export type { RuntimeCommand, RuntimeReceipt, WorkBinding } from './protocol.js'

/** Row id the bundle patch inserts; also the plugin name reported to Cordis. */
export const name = 'sophia-control-bridge'

/** Services the bridge drives; the row waits until all exist. `agentDefaultModel` supplies the recorded model route. */
export const inject = ['agents', 'sessions', 'tools', 'agentDefaultModel']

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

/** Validated row config of `sophia-control-bridge`. Values name environment variables, never secrets. */
export interface ControlBridgeConfig {
  readonly protocolVersion: typeof PROTOCOL_VERSION
  readonly serviceUrlEnv: string
  readonly tokenEnv: string
  readonly runtimeUnitEnv: string
  readonly workspaceEnv: string
}

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/

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
  if (raw.protocolVersion !== PROTOCOL_VERSION) {
    throw new TypeError(`${name}: unsupported protocolVersion ${JSON.stringify(raw.protocolVersion)}; ${BUNDLE.name}@${BUNDLE.version} speaks ${PROTOCOL_VERSION}`)
  }
  const envName = (key: string, fallback: string): string => {
    const value = raw[key] ?? fallback
    if (typeof value !== 'string' || !ENV_NAME.test(value)) throw new TypeError(`${name}: ${key} must name an environment variable`)
    return value
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    serviceUrlEnv: envName('serviceUrlEnv', 'SOPHIA_BRIDGE_URL'),
    tokenEnv: envName('tokenEnv', 'SOPHIA_BRIDGE_TOKEN'),
    runtimeUnitEnv: envName('runtimeUnitEnv', 'SOPHIA_RUNTIME_UNIT'),
    workspaceEnv: envName('workspaceEnv', 'SOPHIA_WORKSPACE'),
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
