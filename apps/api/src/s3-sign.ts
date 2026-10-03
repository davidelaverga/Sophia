// AWS Signature Version 4 for S3-compatible object storage (Supabase Storage's S3 endpoint, SMC-M03 D5). Two forms:
// a request signed in its Authorization header (put, head) and a presigned URL that reads one object until it expires.
// Written against AWS's published examples (byte-store.test.ts checks both signatures they give).
import { createHash, createHmac } from 'node:crypto'

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

const ALGORITHM = 'AWS4-HMAC-SHA256'

export const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

const hmac = (key: string | Buffer, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest()

/** RFC 3986 as SigV4 wants it: A–Z, a–z, 0–9, `-_.~` kept, every other byte %XX in upper case. */
export const uriEncode = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** An object key as a path: each segment encoded, the slashes kept. */
export const encodeKey = (key: string): string => key.split('/').map(uriEncode).join('/')

/** `20130524T000000Z` and `20130524`. */
export function amzDates(now: Date): { amzDate: string; date: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { amzDate, date: amzDate.slice(0, 8) }
}

const scopeOf = (date: string, region: string) => `${date}/${region}/s3/aws4_request`

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), 's3'), 'aws4_request')
}

/** The canonical query: each name and value encoded, sorted by name, then by value. */
function canonicalQuery(query: ReadonlyArray<readonly [string, string]>): string {
  return query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .toSorted(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

export interface SignedRequest {
  method: string
  host: string
  /** The path as sent, already encoded (encodeKey). */
  path: string
  query: ReadonlyArray<readonly [string, string]>
  /** Every header to sign, including host-independent x-amz-* ones; `host` is added. */
  headers: Readonly<Record<string, string>>
  /** The hex SHA-256 of the body, or UNSIGNED-PAYLOAD. */
  payloadHash: string
}

function signature(req: SignedRequest, creds: S3Credentials, amzDate: string, date: string) {
  const all: Record<string, string> = { host: req.host }
  for (const [k, v] of Object.entries(req.headers)) all[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ')
  const names = Object.keys(all).toSorted()
  const signedHeaders = names.join(';')
  const canonical = [
    req.method,
    req.path,
    canonicalQuery(req.query),
    names.map((n) => `${n}:${all[n] ?? ''}\n`).join(''),
    signedHeaders,
    req.payloadHash,
  ].join('\n')
  const toSign = [ALGORITHM, amzDate, scopeOf(date, creds.region), sha256Hex(canonical)].join('\n')
  return {
    signedHeaders,
    value: createHmac('sha256', signingKey(creds.secretAccessKey, date, creds.region))
      .update(toSign)
      .digest('hex'),
  }
}

/** The Authorization header for a request whose headers already carry its x-amz-date and x-amz-content-sha256. */
export function authorization(req: SignedRequest, creds: S3Credentials, now: Date): string {
  const { amzDate, date } = amzDates(now)
  const sig = signature(req, creds, amzDate, date)
  return `${ALGORITHM} Credential=${creds.accessKeyId}/${scopeOf(date, creds.region)}, SignedHeaders=${sig.signedHeaders}, Signature=${sig.value}`
}

/** A URL that performs `method` on `path` until `expiresInSeconds` pass; only the host is signed. */
export function presignedUrl(
  origin: string,
  req: Pick<SignedRequest, 'method' | 'host' | 'path' | 'query'>,
  creds: S3Credentials,
  now: Date,
  expiresInSeconds: number,
): string {
  const { amzDate, date } = amzDates(now)
  const query: (readonly [string, string])[] = [
    ...req.query,
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${creds.accessKeyId}/${scopeOf(date, creds.region)}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresInSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
  const sig = signature({ ...req, query, headers: {}, payloadHash: 'UNSIGNED-PAYLOAD' }, creds, amzDate, date)
  return `${origin}${req.path}?${canonicalQuery(query)}&X-Amz-Signature=${sig.value}`
}
