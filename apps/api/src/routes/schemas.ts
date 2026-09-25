// JSON Schemas shared by several routes. Contract component schemas are registered by id in app.ts.

/**
 * Lowercase canonical UUIDs only. `format: 'uuid'` also accepts uppercase and `urn:uuid:` forms: an
 * uppercase id never matches the lowercase NOTIFY payload (the stream would fall back to polling),
 * and `urn:uuid:` fails in Postgres as a 503.
 */
export const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

export const projectParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', pattern: UUID_PATTERN } },
  required: ['projectId'],
} as const

/** Every admission requires a stable key; callers reuse it after an ambiguous reply. */
export const idempotencyHeader = {
  type: 'object',
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 160 } },
  required: ['idempotency-key'],
} as const
