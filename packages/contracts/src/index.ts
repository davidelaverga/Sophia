// @sophia/contracts — the Sophia HTTP contract (openapi/openapi.json) and its generated types.
// No application, framework or provider dependency.
import { readFileSync } from 'node:fs'

export type * from './generated-types.ts'

interface OpenApiDocument {
  components: { schemas: Record<string, Record<string, unknown>> }
}

export const openapi: OpenApiDocument = JSON.parse(
  readFileSync(new URL('../openapi/openapi.json', import.meta.url), 'utf8'),
) as OpenApiDocument

/**
 * Component schemas as standalone JSON Schemas for a validator such as Fastify's Ajv:
 * each gets `$id: <Name>` and every `#/components/schemas/X` reference becomes `X#`.
 */
export function componentSchemas(): Array<Record<string, unknown> & { $id: string }> {
  return Object.entries(openapi.components.schemas).map(([name, schema]) => ({
    ...(JSON.parse(
      JSON.stringify(schema)
        .replaceAll('"#/components/schemas/', '"')
        .replace(/"\$ref":"(\w+)"/g, '"$ref":"$1#"'),
    ) as Record<string, unknown>),
    $id: name,
  }))
}

/** Decimal-string cursor pattern shared by snapshot, events and receipts. */
export const CURSOR_PATTERN = /^(0|[1-9][0-9]*)$/
