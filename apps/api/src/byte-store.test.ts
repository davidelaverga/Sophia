import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ByteStoreError, memoryByteStore, objectPath, s3ByteStore, storedKey } from './byte-store.ts'
import { authorization, presignedUrl } from './s3-sign.ts'
import { reportFilename } from './routes/sources.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'
const S = '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d'

interface Sent {
  url: string
  init: RequestInit
}

/** A fetch that records each request and answers from a list. */
function recording(...replies: Response[]): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = []
  return {
    sent,
    fetch: (input, init) => {
      sent.push({ url: input instanceof Request ? input.url : input.toString(), init: init ?? {} })
      const next = replies.shift()
      return next ? Promise.resolve(next) : Promise.reject(new Error('no reply'))
    },
  }
}

const config = {
  endpoint: 'https://ref.supabase.co/storage/v1/s3/',
  region: 'eu-central-1',
  accessKeyId: 'storage-key-id',
  secretAccessKey: 'storage-secret',
  bucket: 'reports',
}
const NOW = new Date('2026-10-01T12:00:00Z')
const clock = () => NOW
const exists = (err: unknown) => err instanceof ByteStoreError && err.status === 409
const headerOf = (sent: Sent | undefined, name: string) =>
  (sent?.init.headers as Record<string, string> | undefined)?.[name]

describe('Signature Version 4 (AWS’s published examples)', () => {
  const creds = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
  }
  const at = new Date('2013-05-24T00:00:00Z')
  const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  it('signs a request in its Authorization header', () => {
    const auth = authorization(
      {
        method: 'GET',
        host: 'examplebucket.s3.amazonaws.com',
        path: '/test.txt',
        query: [],
        headers: { range: 'bytes=0-9', 'x-amz-content-sha256': empty, 'x-amz-date': '20130524T000000Z' },
        payloadHash: empty,
      },
      creds,
      at,
    )
    assert.equal(
      auth,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })

  it('presigns a GET', () => {
    const url = presignedUrl(
      'https://examplebucket.s3.amazonaws.com',
      { method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', query: [] },
      creds,
      at,
      86400,
    )
    assert.equal(
      new URL(url).searchParams.get('X-Amz-Signature'),
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })
})

describe('report byte store (D5)', () => {
  it('names one object per source, under its project', () => {
    assert.equal(objectPath(P, S), `${P}/${S}`)
    assert.equal(storedKey(P, S), `objects/${P}/${S}`)
  })

  it('stores bytes once with a Storage-only key: a head first, then a put that never replaces', async () => {
    const io = recording(new Response(null, { status: 404 }), new Response(null, { status: 200 }))
    await s3ByteStore(config, io.fetch, clock).put(objectPath(P, S), new Uint8Array([1, 2, 3]), 'application/pdf')
    const [head, put] = io.sent
    const url = `https://ref.supabase.co/storage/v1/s3/reports/${P}/${S}`
    assert.deepEqual([head?.url, head?.init.method, put?.url, put?.init.method], [url, 'HEAD', url, 'PUT'])
    assert.deepEqual(
      ['content-type', 'if-none-match', 'x-amz-date'].map((h) => headerOf(put, h)),
      ['application/pdf', '*', '20261001T120000Z'],
    )
    assert.match(
      headerOf(put, 'authorization') ?? '',
      /^AWS4-HMAC-SHA256 Credential=storage-key-id\/20261001\/eu-central-1\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;if-none-match;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    )
    assert.equal(
      headerOf(put, 'x-amz-content-sha256'),
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      'the body is signed',
    )
    assert.equal(JSON.stringify(io.sent).includes('storage-secret'), false, 'the secret never travels')
  })

  it('refuses to replace an object, whether the head or the put finds it', async () => {
    const found = recording(new Response(null, { status: 200 }))
    await assert.rejects(
      s3ByteStore(config, found.fetch, clock).put('a/b', new Uint8Array([1]), 'application/pdf'),
      exists,
    )
    assert.equal(found.sent.length, 1, 'nothing is written')
    const raced = recording(new Response(null, { status: 404 }), new Response(null, { status: 412 }))
    await assert.rejects(
      s3ByteStore(config, raced.fetch, clock).put('a/b', new Uint8Array([1]), 'application/pdf'),
      exists,
    )
    const down = recording(new Response('unavailable', { status: 503 }))
    await assert.rejects(
      s3ByteStore(config, down.fetch, clock).put('a/b', new Uint8Array([1]), 'application/pdf'),
      /store head: 503/,
    )
  })

  it('presigns a GET that reads the object until it expires, saving it under its name only when asked', async () => {
    const store = s3ByteStore(config, recording().fetch, clock)
    const read = new URL(await store.signedUrl(objectPath(P, S), 120, null))
    assert.equal(`${read.origin}${read.pathname}`, `https://ref.supabase.co/storage/v1/s3/reports/${P}/${S}`)
    assert.deepEqual(
      ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders'].map((k) =>
        read.searchParams.get(k),
      ),
      ['AWS4-HMAC-SHA256', 'storage-key-id/20261001/eu-central-1/s3/aws4_request', '20261001T120000Z', '120', 'host'],
    )
    assert.equal(read.searchParams.has('response-content-disposition'), false)
    const save = new URL(await store.signedUrl(objectPath(P, S), 120, 'hosts-v2.pdf'))
    assert.equal(save.searchParams.get('response-content-disposition'), 'attachment; filename="hosts-v2.pdf"')
    assert.notEqual(
      save.searchParams.get('X-Amz-Signature'),
      read.searchParams.get('X-Amz-Signature'),
      'the name is signed',
    )
    assert.equal(save.toString().includes('storage-secret'), false)
  })

  it("reads an object for the API itself with a signed GET (a render package's image), and says when it is missing", async () => {
    const io = recording(new Response(new Uint8Array([7, 8, 9]), { status: 200 }), new Response('', { status: 404 }))
    const store = s3ByteStore(config, io.fetch, clock)
    assert.deepEqual([...(await store.get(objectPath(P, S)))], [7, 8, 9])
    const [get] = io.sent
    assert.deepEqual([get?.url, get?.init.method], [`https://ref.supabase.co/storage/v1/s3/reports/${P}/${S}`, 'GET'])
    assert.match(
      headerOf(get, 'authorization') ?? '',
      /^AWS4-HMAC-SHA256 Credential=storage-key-id\/.*SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    )
    await assert.rejects(store.get('a/missing'), /store get: 404/)
    assert.equal(JSON.stringify(io.sent).includes('storage-secret'), false)
  })

  it('keeps bytes in memory for tests, with the same write-once rule', async () => {
    const store = memoryByteStore()
    await store.put('a/b', new Uint8Array([1]), 'application/pdf')
    await assert.rejects(store.put('a/b', new Uint8Array([2]), 'application/pdf'), /exists/)
    assert.match(
      await store.signedUrl('a/b', 60, 'x.pdf'),
      /^https:\/\/store\.invalid\/a\/b\?expires=60&download=x\.pdf$/,
    )
    await assert.rejects(store.signedUrl('a/c', 60, null), /missing/)
    assert.deepEqual([...(await store.get('a/b'))], [1])
    await assert.rejects(store.get('a/c'), /missing/)
  })

  it('names a saved report after its title, version and format', () => {
    assert.equal(
      reportFilename('Sandboxed PDF rendering on managed hosts', 2, 'pdf'),
      'sandboxed-pdf-rendering-on-managed-hosts-v2.pdf',
    )
    assert.equal(reportFilename('Perché Città?', 1, 'markdown'), 'perche-citta-v1.md')
    assert.equal(reportFilename('***', null, 'markdown'), 'report.md')
    assert.equal(reportFilename('x'.repeat(200), 3, 'pdf'), `${'x'.repeat(80)}-v3.pdf`)
  })
})
