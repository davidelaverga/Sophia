/**
 * @sophia/dsh-bundle — the Cordis plugin behind the `sophia-control-bridge`
 * row of the `sophia-runtime` profile.
 *
 * S1-01 scope: an identifiable bundle that loads under the official `dsh`
 * launcher, validates its row config, and reports `not_ready`. The bridge
 * over the public Agent interface (create/resume/steer/hold/stop, outbound
 * authenticated connection, domain guards) is S1-03. Until that bridge
 * reports `ready`, nothing may treat a runtime carrying this bundle as
 * healthy (02_DSH_BOOTSTRAP §2: a loaded plugin is not readiness).
 * @module @sophia/dsh-bundle
 */

import { readFileSync } from 'node:fs'

/** Row id the bundle patch inserts; also the plugin name reported to Cordis. */
export const name = 'sophia-control-bridge'

/** Wire protocol between this bridge and the Sophia service. */
export const PROTOCOL_VERSION = 1

/** Package identity, read from the packed manifest rather than restated. */
export const BUNDLE: { readonly name: string; readonly version: string } = (() => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    name: string
    version: string
  }
  return { name: manifest.name, version: manifest.version }
})()

/** Validated row config of `sophia-control-bridge`. */
export interface ControlBridgeConfig {
  readonly protocolVersion: typeof PROTOCOL_VERSION
}

/** Bridge readiness as the supervisor will observe it; `ready` is S1-03 work. */
export type Readiness =
  | { readonly state: 'ready' }
  | { readonly state: 'not_ready'; readonly reason: string }

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
  const { protocolVersion } = config as { protocolVersion?: unknown }
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new TypeError(`${name}: unsupported protocolVersion ${JSON.stringify(protocolVersion)}; ${BUNDLE.name}@${BUNDLE.version} speaks ${PROTOCOL_VERSION}`)
  }
  return { protocolVersion }
}

/** @returns The bridge's readiness; always `not_ready` until S1-03 lands the bridge. */
export function readiness(): Readiness {
  return { state: 'not_ready', reason: 'control bridge not implemented (S1-03)' }
}

/**
 * Cordis entry point. Emits one labelled startup line so the retained startup
 * diagnostics show which bundle identity actually loaded.
 * @param _ctx - the Cordis context; unused until the S1-03 bridge injects services.
 * @param config - the row config.
 */
export function apply(_ctx: unknown, config: unknown): void {
  const { protocolVersion } = parseConfig(config)
  const state = readiness()
  const detail = state.state === 'ready' ? '' : ` reason="${state.reason}"`
  process.stderr.write(`[${name}] loaded ${BUNDLE.name}@${BUNDLE.version} protocolVersion=${protocolVersion} readiness=${state.state}${detail}\n`)
}

export default { name, apply }
