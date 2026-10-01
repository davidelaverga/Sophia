// The report byte store (SMC-M03, D5): private object storage for bytes too large to keep inline (a report's PDF,
// a long Markdown, retained passages). Only the API holds its credential: the runtime host sends bytes through the
// API, and a member reads them through a URL the API signs after authorizing that read (A11 getSourceContent).
// Objects are written once under a source id and never overwritten, so a URL always reads the bytes whose hash the
// API answered with. The credential is a Storage-only S3 access key (binding §8): it reaches no database.
import { amzDates, authorization, encodeKey, presignedUrl, sha256Hex, uriEncode } from './s3-sign.ts'

/** A stored source's object path: one object per source, named by its project and id. */
export const objectPath = (projectId: string, sourceId: string) => `${projectId}/${sourceId}`

/** The storage_key recorded for a stored source (an inline text's is `inline/<projectId>/<sourceId>`). */
export const storedKey = (projectId: string, sourceId: string) => `objects/${objectPath(projectId, sourceId)}`

export interface ByteStore {
  /** Store new bytes at `path`. A path already written is refused: an object is never replaced. */
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>
  /** A URL that reads `path` until it expires; with a file name, opening it saves the file under that name. */
  signedUrl(path: string, expiresInSeconds: number, downloadAs: string | null): Promise<string>
}

export class ByteStoreError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
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

/** The quoted file name a download is saved as; the API's names are ASCII slugs (reportFilename), kept as they are. */
const attachment = (name: string) => `attachment; filename="${name.replace(/["\\\r\n]/g, '_')}"`

/**
 * S3-compatible object storage, signed with Signature Version 4: a put that never replaces an object (a HEAD first,
 * then `If-None-Match: *`; either refusal is 409), and a presigned GET that saves the file under its name when the
 * reader asked to. Path-style addressing (`<endpoint>/<bucket>/<key>`), as Supabase's S3 endpoint uses. Not yet
 * exercised against a live project: Codex's qualification (plan §5) runs it before any hosted release.
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
  }
}
