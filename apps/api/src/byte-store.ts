// The report byte store (SMC-M03, D5): private object storage for bytes too large to keep inline (a report's PDF,
// a long Markdown, retained passages). Only the API holds its credential: the runtime host sends bytes through the
// API, and a member reads them through a URL the API signs after authorizing that read (A11 getSourceContent).
// Objects are written once under a source id and never overwritten, so a URL always reads the bytes whose hash the
// API answered with.

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

export interface SupabaseStorageConfig {
  /** The project's API origin, e.g. https://<ref>.supabase.co. */
  url: string
  /** A server-only key with Storage access. Never sent to a browser, never used for the database. */
  key: string
  /** A private bucket. */
  bucket: string
}

type Fetch = typeof fetch

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

/**
 * Supabase Storage over its REST API: upload with `x-upsert: false` (a second write of a path fails), and sign a GET
 * URL with `download` when the reader asked to save the file. Not yet exercised against a live project: Codex's
 * qualification (plan §5) runs it before any hosted release.
 */
export function supabaseByteStore(config: SupabaseStorageConfig, fetchImpl: Fetch = fetch): ByteStore {
  const base = `${config.url.replace(/\/+$/, '')}/storage/v1`
  const auth = { authorization: `Bearer ${config.key}`, apikey: config.key }
  const bucket = encodeURIComponent(config.bucket)

  async function failure(res: Response, what: string): Promise<ByteStoreError> {
    const text = await res.text().catch(() => '')
    return new ByteStoreError(res.status, `${what}: ${res.status} ${text.slice(0, 200)}`)
  }

  return {
    async put(path, bytes, mime) {
      const res = await fetchImpl(`${base}/object/${bucket}/${encodePath(path)}`, {
        method: 'POST',
        headers: { ...auth, 'content-type': mime, 'x-upsert': 'false', 'cache-control': 'private, max-age=0' },
        body: bytes,
      })
      if (!res.ok) throw await failure(res, 'store put')
    },
    async signedUrl(path, expiresInSeconds, downloadAs) {
      const res = await fetchImpl(`${base}/object/sign/${bucket}/${encodePath(path)}`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      })
      if (!res.ok) throw await failure(res, 'store sign')
      const body: unknown = await res.json()
      const signed =
        typeof body === 'object' && body !== null && 'signedURL' in body && typeof body.signedURL === 'string'
          ? body.signedURL
          : null
      if (!signed?.startsWith('/')) throw new ByteStoreError(502, 'store sign: no signed URL in the reply')
      const url = new URL(`${base}${signed}`)
      if (downloadAs !== null) url.searchParams.set('download', downloadAs)
      return url.toString()
    },
  }
}

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
