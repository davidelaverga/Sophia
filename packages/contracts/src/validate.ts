// Runtime validation of what a client reads from the Sophia API (published as "@sophia/contracts/validate").
// Browser-safe: the validators are generated ahead of time (scripts/generate-validators.ts), so there is
// no Ajv compiler and no eval at runtime. A body that breaks the contract throws; it is never cast.
import type { ErrorObject, ValidateFunction } from 'ajv'
import {
  validateCursorAdvance,
  validateError,
  validateEvent,
  validateProjectCreated,
  validateReceipt,
  validateSnapshot,
} from './generated/validators.js'
import type { CursorAdvance, Error as ErrorBody, Event } from './generated-types.ts'

/** A value from the wire that does not match the contract schema it was read as. */
export class ContractViolation extends Error {
  readonly schema: string
  readonly issues: string

  constructor(schema: string, issues: string) {
    super(`Response does not match ${schema}: ${issues}`)
    this.name = 'ContractViolation'
    this.schema = schema
    this.issues = issues
  }
}

const describe = (errors: ErrorObject[] | null | undefined) =>
  (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? e.keyword}`).join('; ') || 'invalid'

function parser<T>(schema: string, validate: ValidateFunction<T>): (value: unknown) => T {
  return (value) => {
    if (validate(value)) return value
    throw new ContractViolation(schema, describe(validate.errors))
  }
}

export const parseSnapshot = parser('Snapshot', validateSnapshot)
export const parseReceipt = parser('Receipt', validateReceipt)
export const parseProjectCreated = parser('ProjectCreated', validateProjectCreated)
export const parseEvent = parser('Event', validateEvent)
export const parseCursorAdvance = parser('CursorAdvance', validateCursorAdvance)

/** An error body when the reply is one, else null: callers fall back to the HTTP status. */
export function asErrorBody(value: unknown): ErrorBody | null {
  return validateError(value) ? value : null
}

/** One event-stream frame. `cursor.advanced` is reserved for hidden events; everything else is an Event. */
export function parseFrame(value: unknown): Event | CursorAdvance {
  const isAdvance = typeof value === 'object' && value !== null && 'type' in value && value.type === 'cursor.advanced'
  return isAdvance ? parseCursorAdvance(value) : parseEvent(value)
}

/** Narrow a frame without a cast: after `if (isCursorAdvance(f)) …`, `f` is an Event. */
export function isCursorAdvance(frame: Event | CursorAdvance): frame is CursorAdvance {
  return frame.type === 'cursor.advanced'
}
