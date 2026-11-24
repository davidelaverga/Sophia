import { createHash } from 'node:crypto'

export const PROTOTYPE_ENTRY_NAME = 'index.html'
export const PROTOTYPE_ENTRY_MAX_BYTES = 2_097_152
const SHA256 = /^[a-f0-9]{64}$/u
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]*$/u

export type PrototypeManifestValue =
  | null
  | boolean
  | number
  | string
  | readonly PrototypeManifestValue[]
  | { readonly [field: string]: PrototypeManifestValue }

export interface PrototypeFileIdentity {
  readonly path: typeof PROTOTYPE_ENTRY_NAME
  readonly mime: 'text/html'
  readonly bytes: number
  readonly sha256: string
  readonly sourceId: string
}

/** Hash retained transport bytes without decoding and reserializing the entry. */
export function prototypeEntrySha256(bytes: Uint8Array): string | null {
  if (bytes.byteLength === 0 || bytes.byteLength > PROTOTYPE_ENTRY_MAX_BYTES) return null
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
  return createHash('sha256').update(bytes).digest('hex')
}

export function isPrototypeSha256(value: string): boolean {
  return SHA256.test(value)
}

/** Fixed-schema JSON with ASCII field names, no lossy number or Unicode conversion, and ordered semantic arrays. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new TypeError('Manifest strings must be well-formed Unicode')
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('Manifest numbers must be safe integers')
    return String(value)
  }
  if (Array.isArray(value)) return '[' + Array.from(value, canonicalJson).join(',') + ']'
  if (typeof value !== 'object') throw new TypeError('Manifest fields must have JSON values')
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('Manifest objects must be plain records')
  }
  return (
    '{' +
    Object.entries(value)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, member]) => {
        if (!FIELD_NAME.test(key)) throw new TypeError('Invalid manifest field name')
        return JSON.stringify(key) + ':' + canonicalJson(member)
      })
      .join(',') +
    '}'
  )
}

/** The caller supplies the exact schema-owned fields, excluding the digest field and transient viewing permits. */
export function prototypeManifestSha256(payload: PrototypeManifestValue): string {
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

export function prototypeFileIdentity(bytes: Uint8Array, sourceId: string): PrototypeFileIdentity | null {
  const sha256 = prototypeEntrySha256(bytes)
  if (!sha256 || !sourceId) return null
  return { path: PROTOTYPE_ENTRY_NAME, mime: 'text/html', bytes: bytes.byteLength, sha256, sourceId }
}
