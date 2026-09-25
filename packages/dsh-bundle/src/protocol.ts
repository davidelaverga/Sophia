/**
 * Runtime command protocol between the Sophia service and this bridge.
 *
 * LOCAL COPY of the design shapes in docs/pack/contracts/interfaces.ts
 * (`WorkBinding`, `RuntimeCommand`, `RuntimeReceipt`). S1-02 owns
 * `packages/contracts`; when it lands, these declarations are replaced by
 * imports from it and this file keeps only the validation.
 * @module @sophia/dsh-bundle/protocol
 */

/** Receipt stages; `admitted` is written by the Sophia service, never by the bridge. */
export type ReceiptStage =
  | 'admitted' | 'delivered' | 'incorporation_observed' | 'checked'
  | 'rejected' | 'failed' | 'outcome_unknown'

/** The accepted work a command belongs to. */
export interface WorkBinding {
  readonly projectId: string
  readonly goalId: string
  readonly goalRevision: number
  readonly attemptId: string
  readonly resourceId: string
  readonly authorityEpoch: number
  readonly runtimeUnitId: string
}

/** Command kinds the bridge executes. */
export type RuntimeCommandKind = 'create' | 'resume' | 'input' | 'steer' | 'hold' | 'stop' | 'inspect'

/** One admitted command, delivered by the Sophia service's outbox. */
export interface RuntimeCommand {
  readonly schema: 'sophia.runtime-command.v1'
  readonly commandId: string
  readonly binding: WorkBinding
  readonly kind: RuntimeCommandKind
  readonly expectedNativeSessionId: string | null
  readonly contextPacketId: string | null
  readonly payload: Readonly<Record<string, unknown>>
}

/** What the bridge observed for one command. */
export interface RuntimeReceipt {
  readonly commandId: string
  readonly attemptId: string
  readonly stage: ReceiptStage
  readonly nativeSessionId: string | null
  readonly nativeSequence: number | null
  readonly evidenceRefs: readonly string[]
  readonly observedAt: string
  readonly reason: string | null
}

const KINDS: ReadonlySet<string> = new Set(['create', 'resume', 'input', 'steer', 'hold', 'stop', 'inspect'])

/** A command that failed validation; the bridge answers it with a `rejected` receipt. */
export class ProtocolError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new ProtocolError(`${key} must be a non-empty string`)
  return value
}

const integer = (record: Record<string, unknown>, key: string): number => {
  const value = record[key]
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ProtocolError(`${key} must be a non-negative safe integer`)
  return value as number
}

/**
 * Validate one wire command. Everything the bridge acts on comes from the
 * Sophia service's server-side admission; nothing here is trusted from a model.
 * @param value - parsed JSON.
 * @returns the validated command.
 */
export function parseCommand(value: unknown): RuntimeCommand {
  if (!isRecord(value)) throw new ProtocolError('command must be an object')
  if (value.schema !== 'sophia.runtime-command.v1') throw new ProtocolError(`unsupported command schema ${JSON.stringify(value.schema)}`)
  const commandId = text(value, 'commandId')
  const kind = text(value, 'kind')
  if (!KINDS.has(kind)) throw new ProtocolError(`unsupported command kind ${JSON.stringify(kind)}`)
  if (!isRecord(value.binding)) throw new ProtocolError('binding must be an object')
  const b = value.binding
  const binding: WorkBinding = {
    projectId: text(b, 'projectId'),
    goalId: text(b, 'goalId'),
    goalRevision: integer(b, 'goalRevision'),
    attemptId: text(b, 'attemptId'),
    resourceId: text(b, 'resourceId'),
    authorityEpoch: integer(b, 'authorityEpoch'),
    runtimeUnitId: text(b, 'runtimeUnitId'),
  }
  const expected = value.expectedNativeSessionId
  if (expected !== null && (typeof expected !== 'string' || expected.length === 0)) {
    throw new ProtocolError('expectedNativeSessionId must be null or a non-empty string')
  }
  const packet = value.contextPacketId
  if (packet !== null && typeof packet !== 'string') throw new ProtocolError('contextPacketId must be null or a string')
  if (!isRecord(value.payload)) throw new ProtocolError('payload must be an object')
  return {
    schema: 'sophia.runtime-command.v1',
    commandId,
    binding,
    kind: kind as RuntimeCommandKind,
    expectedNativeSessionId: expected,
    contextPacketId: packet,
    payload: value.payload,
  }
}

/**
 * The model-facing text a command carries (`input`/`steer`/`create` prompt).
 * @returns trimmed text, or undefined when the payload has none.
 */
export function commandText(command: RuntimeCommand): string | undefined {
  const value = command.payload.text
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) throw new ProtocolError('payload.text must be a non-empty string')
  return value
}
