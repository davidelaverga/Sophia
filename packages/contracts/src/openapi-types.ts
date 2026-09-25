// OpenAPI → dependency-free TypeScript types. Node port of the pack's scripts/generate_api_types.py:
// for the pack's own contract the output equals the pack's api/generated-types.ts apart from the header
// line (checked in contracts.test.ts). Pure, so the check can run it on the pack as well as on ours.

/** The JSON Schema subset the Sophia contract uses. */
interface Schema {
  $ref?: string
  const?: unknown
  enum?: unknown[]
  anyOf?: Schema[]
  type?: 'null' | 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  items?: Schema
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: Schema | boolean
}

interface Operation {
  operationId: string
  requestBody?: { content?: Record<string, { schema?: Schema }> }
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>
}

export interface OpenApi {
  components: { schemas: Record<string, Schema> }
  paths: Record<string, Record<string, Operation>>
}

/** Stream operations have no JSON body; their frames are typed here. */
const STREAM_RESPONSE = 'AsyncIterable<Event | CursorAdvance>'

/** Python json.dumps(): ASCII-only escapes (non-ASCII becomes \uXXXX). */
const dumps = (value: unknown) =>
  JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

function objectType(s: Schema): string {
  const props = s.properties ?? {}
  const required = s.required ?? []
  if (Object.keys(props).length === 0 && typeof s.additionalProperties === 'object') {
    return `Readonly<Record<string, ${typeOf(s.additionalProperties)}>>`
  }
  const fields = Object.entries(props).map(([k, v]) => `${dumps(k)}${required.includes(k) ? '' : '?'}: ${typeOf(v)};`)
  return `{ ${fields.join(' ')} }`
}

const PRIMITIVES: Partial<Record<NonNullable<Schema['type']>, string>> = {
  null: 'null',
  string: 'string',
  integer: 'number',
  number: 'number',
  boolean: 'boolean',
}

function typeOf(s: Schema): string {
  if (s.$ref) return s.$ref.split('/').at(-1) ?? s.$ref
  if ('const' in s) return dumps(s.const)
  if (s.enum) return s.enum.map(dumps).join(' | ')
  if (s.anyOf) return s.anyOf.map(typeOf).join(' | ')
  const primitive = s.type && PRIMITIVES[s.type]
  if (primitive) return primitive
  if (s.type === 'array' && s.items) return `ReadonlyArray<${typeOf(s.items)}>`
  if (s.type === 'object') return objectType(s)
  throw new Error(`Unsupported schema: ${JSON.stringify(s)}`)
}

function operationLine(path: string, method: string, op: Operation): string {
  const request = op.requestBody?.content?.['application/json']?.schema
  const success = Object.entries(op.responses).find(([status]) => status.startsWith('2'))?.[1]
  const response = success?.content?.['application/json']?.schema
  return (
    `  ${dumps(op.operationId)}: { method: ${dumps(method.toUpperCase())}; path: ${dumps(path)}; ` +
    `request: ${request ? typeOf(request) : 'undefined'}; response: ${response ? typeOf(response) : STREAM_RESPONSE}; };`
  )
}

const HEADER = '/** Format/pattern constraints are runtime validation obligations, not encoded by string types. */'

/** The generated file's text; `firstLine` names the generator (the one line that differs from the pack). */
export function typesFromOpenApi(doc: OpenApi, firstLine: string): string {
  const lines = [
    firstLine,
    HEADER,
    ...Object.entries(doc.components.schemas).map(([name, s]) => `export type ${name} = ${typeOf(s)};`),
    'export interface Operations {',
    ...Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => operationLine(path, method, op)),
    ),
    '}',
  ]
  return `${lines.join('\n')}\n`
}
