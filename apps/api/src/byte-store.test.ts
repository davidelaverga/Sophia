import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { BACKUP_WRITE_MS } from './byte-backup.ts'
import {
  ByteStoreError,
  byteStoreFromEnv,
  memoryByteStore,
  objectPath,
  s3ByteStore,
  storedKey,
  withByteBackup,
  writeOnce,
} from './byte-store.ts'
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

it('never starts a late S3 PUT after a timed-out HEAD that ignores cancellation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let finish: ((response: Response) => void) | undefined
  const methods: string[] = []
  const store = withByteBackup(
    s3ByteStore(
      config,
      (_input, init) => {
        methods.push(init?.method ?? '')
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      },
      clock,
    ),
    () => Promise.resolve(),
  )
  const rejected = assert.rejects(store.put(objectPath(P, S), new Uint8Array([1]), 'application/pdf'))
  await nextTurn()
  assert.deepEqual(methods, ['HEAD'])
  assert.ok(finish)
  t.mock.timers.tick(BACKUP_WRITE_MS)
  assert.equal(await Promise.race([rejected.then(() => 'refused'), nextTurn('sentinel')]), 'refused')
  finish(new Response(null, { status: 404 }))
  await nextTurn()
  assert.deepEqual(methods, ['HEAD'], 'expired HEAD cannot initiate PUT')
})

it('rechecks the monotonic deadline after signing before starting provider I/O', async (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  let requests = 0
  const store = s3ByteStore(
    config,
    () => {
      requests += 1
      return Promise.resolve(new Response(null, { status: 404 }))
    },
    () => {
      now = 11
      return NOW
    },
  )
  await assert.rejects(
    store.put(objectPath(P, S), new Uint8Array([1]), 'application/pdf', undefined, {
      signal: new AbortController().signal,
      deadline: 10,
    }),
  )
  assert.equal(requests, 0, 'signing crossed expiry; no HEAD or PUT starts')
})

function configuredStore(fetchImpl: typeof fetch) {
  const store = byteStoreFromEnv(
    {
      SOPHIA_STORAGE_S3_ENDPOINT: config.endpoint,
      SOPHIA_STORAGE_S3_REGION: config.region,
      SOPHIA_STORAGE_S3_ACCESS_KEY_ID: config.accessKeyId,
      SOPHIA_STORAGE_S3_SECRET_ACCESS_KEY: config.secretAccessKey,
      SOPHIA_STORAGE_BUCKET: config.bucket,
    },
    fetchImpl,
  )
  assert.ok(store)
  return store
}

it('bounds and aborts default backup-off writes at HEAD and PUT, reopening capacity after actual settlement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const stalled of ['HEAD', 'PUT']) {
    const signals: AbortSignal[] = []
    let hanging = true
    const methods: string[] = []
    const store = configuredStore((_input, init) => {
      const method = init?.method ?? ''
      methods.push(method)
      if (!hanging || method !== stalled)
        return Promise.resolve(new Response(null, { status: method === 'HEAD' ? 404 : 200 }))
      const signal = init?.signal
      if (signal) signals.push(signal)
      return new Promise<Response>((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }),
      )
    })
    const refused = assert.rejects(
      store.put(objectPath(P, S), new Uint8Array([1]), 'application/pdf'),
      (error: unknown) => error instanceof ByteStoreError && error.status === 503,
    )
    await nextTurn()
    assert.equal(signals.length, 1, 'default-off write supplies cancellation at the provider step')
    t.mock.timers.tick(BACKUP_WRITE_MS)
    assert.equal(await Promise.race([refused.then(() => 'refused'), nextTurn('sentinel')]), 'refused')
    assert.equal(signals[0]?.aborted, true)
    await nextTurn()
    hanging = false
    await assert.doesNotReject(store.put(objectPath(P, S), new Uint8Array(32 * 1024 * 1024), 'application/pdf'))
    assert.deepEqual(methods.slice(-2), ['HEAD', 'PUT'], 'settled aborted operation releases retained-write capacity')
  }
})

it('retains backup-off write admission after timeout until an ignoring HEAD settles and never starts its PUT', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let finish: ((response: Response) => void) | undefined
  const methods: string[] = []
  const store = configuredStore((_input, init) => {
    methods.push(init?.method ?? '')
    return new Promise<Response>((resolve) => {
      finish = resolve
    })
  })
  const refused = assert.rejects(store.put(objectPath(P, S), new Uint8Array(32 * 1024 * 1024), 'application/pdf'))
  await nextTurn()
  assert.ok(finish)
  try {
    t.mock.timers.tick(BACKUP_WRITE_MS)
    assert.equal(await Promise.race([refused.then(() => 'refused'), nextTurn('sentinel')]), 'refused')
    await assert.rejects(
      configuredStore(recording().fetch).put('other', new Uint8Array([1]), 'image/png'),
      (error: unknown) => error instanceof ByteStoreError && error.status === 503,
    )
    assert.deepEqual(methods, ['HEAD'])
  } finally {
    finish(new Response(null, { status: 404 }))
    await nextTurn()
  }
  assert.deepEqual(methods, ['HEAD'], 'late HEAD cannot start a PUT')
  const fast = recording(new Response(null, { status: 404 }), new Response(null, { status: 200 }))
  await assert.doesNotReject(configuredStore(fast.fetch).put('other', new Uint8Array(32 * 1024 * 1024), 'image/png'))
})

it('fences expired and late write claims before provider work without refunding the claim', async (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const controller = new AbortController()
  const control = { signal: controller.signal, deadline: 10 }
  const store = memoryByteStore()
  let claims = 0
  const once = writeOnce(store, (_key, _hash, _length, received) => {
    assert.equal(received, control, 'claim receives the original database control')
    claims += 1
    now = 11
    return Promise.resolve(true)
  })
  const path = objectPath(P, S)
  await assert.rejects(once.put(path, Buffer.from('pdf'), 'application/pdf', undefined, control), { status: 503 })
  assert.equal(claims, 1, 'the successful claim remains consumed')
  assert.equal(store.objects.size, 0, 'late claim cannot start provider I/O')
  await assert.rejects(once.put(path, Buffer.from('pdf'), 'application/pdf', undefined, control), { status: 503 })
  assert.equal(claims, 1, 'an expired request starts no new claim')
})
