/**
 * Runtime command protocol between the Sophia service and this bridge.
 *
 * The shapes are canonical in the product contract (packages/contracts,
 * amendment A04). `runtime-wire*.generated.ts` holds their types and
 * standalone validators, generated from that contract, so the bridge and
 * the API validate exactly the same schemas and this file keeps no copy.
 * It adds only the bridge's reading of a command: which failures it names
 * and what text a command carries.
 * @module @sophia/dsh-bundle/protocol
 */

import { wire } from './runtime-wire.generated.js'
import type { WireValidator } from './runtime-wire.generated.js'
import type { RuntimeCommand, RuntimeReceipt, RuntimeWorkBinding } from './runtime-wire-types.generated.js'

export type { RuntimeCommand, RuntimeReceipt } from './runtime-wire-types.generated.js'

/** The accepted work a command belongs to. */
export type WorkBinding = RuntimeWorkBinding

/** Receipt stages the bridge reports; `admitted` is written by the Sophia service, never by the bridge. */
export type ReceiptStage = RuntimeReceipt['stage']

/** Command kinds the bridge executes. */
export type RuntimeCommandKind = RuntimeCommand['kind']

const KINDS: ReadonlySet<string> = new Set(['create', 'resume', 'input', 'steer', 'hold', 'stop', 'inspect'])

/** A command that failed validation; the bridge answers it with a `rejected` receipt. */
export class ProtocolError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The first failure a generated validator left, as `path message`. */
export function describeFailure(validator: WireValidator<unknown>): string {
  const first = validator.errors?.[0]
  return first ? `${first.instancePath || '/'} ${first.message ?? 'is invalid'}` : 'is invalid'
}

/**
 * Validate one wire command against the contract's RuntimeCommand. Everything
 * the bridge acts on comes from the Sophia service's server-side admission;
 * nothing here is trusted from a model. The schema and kind are named first,
 * so a command from a newer service says what this bridge cannot run.
 * @param value - parsed JSON.
 * @returns the validated command.
 */
export function parseCommand(value: unknown): RuntimeCommand {
  if (!isRecord(value)) throw new ProtocolError('command must be an object')
  if (value.schema !== 'sophia.runtime-command.v1') throw new ProtocolError(`unsupported command schema ${JSON.stringify(value.schema)}`)
  if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) throw new ProtocolError(`unsupported command kind ${JSON.stringify(value.kind)}`)
  if (!wire.RuntimeCommand(value)) throw new ProtocolError(`command ${describeFailure(wire.RuntimeCommand)}`)
  return value
}

/**
 * The model-facing text a command carries (`input`/`steer`/`create` prompt).
 * @returns the text, or undefined when the payload has none.
 */
export function commandText(command: RuntimeCommand): string | undefined {
  const value = command.payload.text
  if (value === undefined) return undefined
  if (value.trim().length === 0) throw new ProtocolError('payload.text must be a non-empty string')
  return value
}
