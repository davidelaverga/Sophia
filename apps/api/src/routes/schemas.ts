// JSON Schemas shared by several routes. Contract component schemas are registered by id in app.ts.

/**
 * Lowercase canonical UUIDs only. `format: 'uuid'` also accepts uppercase and `urn:uuid:` forms: an
 * uppercase id never matches the lowercase NOTIFY payload (the stream would fall back to polling),
 * and `urn:uuid:` fails in Postgres as a 503.
 */
export const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

/**
 * The one spelling of an id a `format: 'uuid'` schema has accepted (any case, optionally `urn:uuid:`): its last 36
 * characters, lowercase, the spelling the database reads. The A48, A51 and A53 routes still keep local copies of this
 * one-liner (api-contributions.ts `pathId`, project-resources.ts and personal-answers.ts `canonicalId`), left until
 * #519, which changes api-contributions.ts, has landed.
 */
export const canonicalId = (id: string): string => id.slice(-36).toLowerCase()

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

/** A60 server-owned identities only; opaque paging never selects a native cursor or run. */
export const runnerWorkParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    goalId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'goalId'],
} as const
export const runnerResultParams = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: { type: 'string', pattern: UUID_PATTERN },
    resultId: { type: 'string', pattern: UUID_PATTERN },
  },
  required: ['projectId', 'resultId'],
} as const
export const runnerWorkPageQuery = {
  type: 'object',
  additionalProperties: false,
  properties: { after: { type: 'string', pattern: UUID_PATTERN } },
} as const
export const runnerWorkLookupQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 160 },
    kind: { type: 'string', enum: ['operation', 'collection'] },
  },
  required: ['key', 'kind'],
} as const
