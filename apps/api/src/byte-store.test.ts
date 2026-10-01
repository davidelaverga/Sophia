import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ByteStoreError, memoryByteStore, objectPath, storedKey, supabaseByteStore } from './byte-store.ts'
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

const config = { url: 'https://ref.supabase.co/', key: 'server-key', bucket: 'reports' }

describe('report byte store (D5)', () => {
  it('names one object per source, under its project', () => {
    assert.equal(objectPath(P, S), `${P}/${S}`)
    assert.equal(storedKey(P, S), `objects/${P}/${S}`)
  })

  it('stores bytes once with the server key, never replacing an object', async () => {
    const io = recording(new Response('{}', { status: 200 }))
    await supabaseByteStore(config, io.fetch).put(objectPath(P, S), new Uint8Array([1, 2, 3]), 'application/pdf')
    const [put] = io.sent
    assert.ok(put)
    assert.equal(put.url, `https://ref.supabase.co/storage/v1/object/reports/${P}/${S}`)
    assert.equal(put.init.method, 'POST')
    assert.deepEqual(put.init.headers, {
      authorization: 'Bearer server-key',
      apikey: 'server-key',
      'content-type': 'application/pdf',
      'x-upsert': 'false',
      'cache-control': 'private, max-age=0',
    })
    const refused = recording(new Response('{"error":"Duplicate"}', { status: 409 }))
    await assert.rejects(
      supabaseByteStore(config, refused.fetch).put(objectPath(P, S), new Uint8Array([1]), 'application/pdf'),
      (err: unknown) => err instanceof ByteStoreError && err.status === 409,
    )
  })

  it('signs a URL that reads the object, and saves it under its name only when asked', async () => {
    const signed = `/object/sign/reports/${P}/${S}?token=abc`
    const io = recording(Response.json({ signedURL: signed }), Response.json({ signedURL: signed }))
    const store = supabaseByteStore(config, io.fetch)
    assert.equal(
      await store.signedUrl(objectPath(P, S), 120, null),
      `https://ref.supabase.co/storage/v1/object/sign/reports/${P}/${S}?token=abc`,
    )
    assert.equal(
      await store.signedUrl(objectPath(P, S), 120, 'hosts-v2.pdf'),
      `https://ref.supabase.co/storage/v1/object/sign/reports/${P}/${S}?token=abc&download=hosts-v2.pdf`,
    )
    assert.equal(io.sent[0]?.url, `https://ref.supabase.co/storage/v1/object/sign/reports/${P}/${S}`)
    assert.equal(io.sent[0]?.init.body, '{"expiresIn":120}')
  })

  it('fails loudly on a store error or a reply without a signed URL', async () => {
    const down = recording(new Response('unavailable', { status: 503 }))
    await assert.rejects(supabaseByteStore(config, down.fetch).signedUrl('a/b', 60, null), /store sign: 503/)
    const odd = recording(Response.json({ signedURL: 'https://elsewhere.example/x' }))
    await assert.rejects(supabaseByteStore(config, odd.fetch).signedUrl('a/b', 60, null), /no signed URL/)
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
