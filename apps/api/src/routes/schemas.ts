// JSON Schemas shared by several routes. Contract component schemas are registered by id in app.ts.

export const projectParams = {
  type: 'object',
  additionalProperties: false,
  properties: { projectId: { type: 'string', format: 'uuid' } },
  required: ['projectId'],
} as const

/** Every admission requires a stable key; callers reuse it after an ambiguous reply. */
export const idempotencyHeader = {
  type: 'object',
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 160 } },
  required: ['idempotency-key'],
} as const
