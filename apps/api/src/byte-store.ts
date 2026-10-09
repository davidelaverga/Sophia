// The report byte store (SMC-M03, D5): private object storage for bytes too large to keep inline (a report's PDF,
// a long Markdown, retained passages). Only the API holds its credential: the runtime host sends bytes through the
// API, and a member reads them through a URL the API signs after authorizing that read (A11 getSourceContent).
// Objects are written once under a source id and never overwritten, so a URL always reads the bytes whose hash the
// API answered with. The credential is a Storage-only S3 access key (binding §8): it reaches no database.
//
// Write-once is kept by the database, not left to the service: Supabase Storage's S3 PutObject replaces an object and
// ignores If-None-Match (upstream 307c5e31, SDD-01-CX-0015). writeOnce claims each key in the database (0044) and
// commits the claim before a byte is sent; a key already claimed, by this API or one racing it, is refused before any
// I/O to the store, and buildApp hands the routes no other store. The keys are fresh besides (renderer_output_slot and
// renderer_capture_slot mint gen_random_uuid(); a retry gets a new one), and every read checks the recorded SHA-256
// (the API's fileBytes, the Studio's download.ts).
import { amzDates, authorization, encodeKey, presignedUrl, sha256Hex, uriEncode } from './s3-sign.ts'

/** A stored source's object path: one object per source, named by its project and id. */
export const objectPath = (projectId: string, sourceId: string) => `${projectId}/${sourceId}`

/** The storage_key recorded for a stored source (an inline text's is `inline/<projectId>/<sourceId>`). */
export const storedKey = (projectId: string, sourceId: string) => `objects/${objectPath(projectId, sourceId)}`

export interface ByteStore {
  /**
   * Store new bytes at `path`. A path written before is refused (409) and its object stays as written: writeOnce keeps
   * that for every store the API is given, whose own refusals (s3ByteStore's HEAD and If-None-Match) are a second line.
   */
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>
  /** A URL that reads `path` until it expires; with a file name, opening it saves the file under that name. */
  signedUrl(path: string, expiresInSeconds: number, downloadAs: string | null): Promise<string>
  /** The bytes at `path`, read by the API itself (a render package's image for the render runner). */
  get(path: string): Promise<Uint8Array>
}

export class ByteStoreError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A write's claim could not be made (the database did not answer): nothing was sent to the store. */
export class WriteClaimError extends ByteStoreError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(503, message)
    this.name = 'WriteClaimError'
    if (options && 'cause' in options) this.cause = options.cause
  }
}

export interface S3StorageConfig {
  /** The S3 endpoint, path-style: for Supabase, https://<ref>.supabase.co/storage/v1/s3. */
  endpoint: string
  region: string
  /** A Storage-only access key (Supabase S3 access keys reach Storage, never the database). */
  accessKeyId: string
  secretAccessKey: string
  /** A private bucket. */
  bucket: string
}

type Fetch = typeof fetch

/** The five settings of the S3 byte store, all or none. */
export const STORAGE_SETTINGS = [
  'SOPHIA_STORAGE_S3_ENDPOINT',
  'SOPHIA_STORAGE_S3_REGION',
  'SOPHIA_STORAGE_S3_ACCESS_KEY_ID',
  'SOPHIA_STORAGE_S3_SECRET_ACCESS_KEY',
  'SOPHIA_STORAGE_BUCKET',
] as const

/**
 * The report byte store an environment configures (SMC-M03, D5): a Storage-only S3 access key, all five settings or
 * none (null). The REST settings are retired: their key also bypassed the database's RLS (binding §8), so they refuse.
 * The API (server.ts) and the operator's write-once probe (storage-probe.ts) read the same settings the same way.
 */
export function byteStoreFromEnv(env: Record<string, string | undefined>, fetchImpl: Fetch = fetch): ByteStore | null {
  // Trimmed, as the API reads every setting: a trailing CR from a CRLF env file would break the signature.
  const read = (name: string) => env[name]?.trim() || undefined
  if (read('SOPHIA_STORAGE_URL') || read('SOPHIA_STORAGE_KEY')) {
    throw new Error('SOPHIA_STORAGE_URL and SOPHIA_STORAGE_KEY are retired: configure the S3 access key instead')
  }
  const values = STORAGE_SETTINGS.map(read)
  if (values.every((v) => !v)) return null
  const [endpoint, region, accessKeyId, secretAccessKey, bucket] = values
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(`${STORAGE_SETTINGS.join(', ')} are set together or not at all`)
  }
  return s3ByteStore({ endpoint, region, accessKeyId, secretAccessKey, bucket }, fetchImpl)
}

/** The quoted file name a download is saved as; the API's names are ASCII slugs (reportFilename), kept as they are. */
const attachment = (name: string) => `attachment; filename="${name.replace(/["\\\r\n]/g, '_')}"`

/**
 * S3-compatible object storage, signed with Signature Version 4: a put that refuses a key it finds (a HEAD first) and
 * sends `If-None-Match: *` (a 412 is 409 too, where the service honours it; Supabase's does not), and a presigned GET
 * that saves the file under its name when the reader asked to. Path-style addressing (`<endpoint>/<bucket>/<key>`), as
 * Supabase's S3 endpoint uses. Not yet exercised against a live project: Codex's qualification (plan §5) runs it
 * before any hosted release.
 */
export function s3ByteStore(
  config: S3StorageConfig,
  fetchImpl: Fetch = fetch,
  clock: () => Date = () => new Date(),
): ByteStore {
  const endpoint = new URL(config.endpoint.replace(/\/+$/, ''))
  const creds = { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: config.region }
  const pathOf = (key: string) =>
    `${endpoint.pathname.replace(/\/+$/, '')}/${uriEncode(config.bucket)}/${encodeKey(key)}`

  async function send(method: string, key: string, body: Uint8Array | null, extra: Record<string, string>) {
    const now = clock()
    const payloadHash = sha256Hex(body ?? new Uint8Array())
    const headers: Record<string, string> = {
      ...extra,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDates(now).amzDate,
    }
    const path = pathOf(key)
    const auth = authorization({ method, host: endpoint.host, path, query: [], headers, payloadHash }, creds, now)
    return fetchImpl(`${endpoint.origin}${path}`, {
      method,
      headers: { ...headers, authorization: auth },
      ...(body === null ? {} : { body }),
    })
  }

  async function failure(res: Response, what: string): Promise<ByteStoreError> {
    const text = await res.text().catch(() => '')
    return new ByteStoreError(res.status, `${what}: ${res.status} ${text.slice(0, 200)}`)
  }

  return {
    async put(path, bytes, mime) {
      const head = await send('HEAD', path, null, {})
      if (head.ok) throw new ByteStoreError(409, `store put: ${path} exists`)
      if (head.status !== 404) throw await failure(head, 'store head')
      const res = await send('PUT', path, bytes, {
        'content-type': mime,
        'cache-control': 'private, max-age=0',
        'if-none-match': '*',
      })
      if (res.status === 412) throw new ByteStoreError(409, `store put: ${path} exists`)
      if (!res.ok) throw await failure(res, 'store put')
    },
    signedUrl(path, expiresInSeconds, downloadAs) {
      const query: [string, string][] =
        downloadAs === null ? [] : [['response-content-disposition', attachment(downloadAs)]]
      const req = { method: 'GET', host: endpoint.host, path: pathOf(path), query }
      return Promise.resolve(presignedUrl(endpoint.origin, req, creds, clock(), expiresInSeconds))
    },
    async get(path) {
      const res = await send('GET', path, null, {})
      if (!res.ok) throw await failure(res, 'store get')
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

/** Claims a key's one write: true the first time, false for a key already claimed (claimObjectWrite, 0044). */
export type WriteClaim = (path: string, sha256: string, byteLength: number) => Promise<boolean>

/**
 * The store, written once per key whatever the store itself does with a second write: each put first claims its key
 * (committed before any byte is sent) and is refused with 409 for a key already claimed, the same bytes included. A
 * claim that cannot be made refuses the write with WriteClaimError: nothing reaches the store unclaimed.
 * Reads are the store's own.
 */
export function writeOnce(store: ByteStore, claim: WriteClaim): ByteStore {
  return {
    async put(path, bytes, mime) {
      let claimed: boolean
      try {
        claimed = await claim(path, sha256Hex(bytes), bytes.byteLength)
      } catch (error) {
        throw new WriteClaimError(`store claim: ${path}: the database did not answer`, { cause: error })
      }
      if (!claimed) throw new ByteStoreError(409, `store put: ${path} was already written`)
      await store.put(path, bytes, mime)
    },
    signedUrl: (path, expiresInSeconds, downloadAs) => store.signedUrl(path, expiresInSeconds, downloadAs),
    get: (path) => store.get(path),
  }
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

/** Bytes in memory, for tests and local development. Signed URLs point nowhere real; they carry the path. */
export function memoryByteStore(origin = 'https://store.invalid'): ByteStore & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    put(path, bytes) {
      if (objects.has(path)) return Promise.reject(new ByteStoreError(409, `store put: ${path} exists`))
      objects.set(path, bytes)
      return Promise.resolve()
    },
    signedUrl(path, expiresInSeconds, downloadAs) {
      if (!objects.has(path)) return Promise.reject(new ByteStoreError(404, `store sign: ${path} is missing`))
      const url = new URL(`${origin}/${encodePath(path)}`)
      url.searchParams.set('expires', String(expiresInSeconds))
      if (downloadAs !== null) url.searchParams.set('download', downloadAs)
      return Promise.resolve(url.toString())
    },
    get(path) {
      const bytes = objects.get(path)
      return bytes ? Promise.resolve(bytes) : Promise.reject(new ByteStoreError(404, `store get: ${path} is missing`))
    },
  }
}
