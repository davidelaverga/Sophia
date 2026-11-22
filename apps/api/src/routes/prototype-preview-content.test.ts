import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  createPrototypePreviewContentHandler,
  isPrototypePreviewPath,
  previewRequestHeaders,
  type RetainedPreviewEntry,
} from './prototype-preview-content.ts'

const previewOrigin = 'https://prototype.example'
const studioOrigin = 'https://studio.example'
const token = 'A'.repeat(43)
const exactPath = `/v1/previews/${token}/index.html`
const shellUrl = previewOrigin + exactPath.replace('index.html', 'shell.html')
const documentUrl = previewOrigin + exactPath.replace('index.html', 'document.html')
const frame = (url: string, site: string) =>
  new Request(url, {
    headers: { 'sec-fetch-site': site, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
  })
const top = (url: string) =>
  new Request(url, {
    headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
  })

const now = Date.UTC(2026, 10, 22, 15)
const bytes = new TextEncoder().encode('<!doctype html>\r\n<button id="ack">Acknowledge</button>\r\n')
const entry: RetainedPreviewEntry = {
  bytes,
  byteLength: bytes.byteLength,
  entrySha256: createHash('sha256').update(bytes).digest('hex'),
  expiresAt: new Date(now + 59_000).toISOString(),
}

function forEntry(read: (candidate: string) => Promise<RetainedPreviewEntry | null>) {
  return createPrototypePreviewContentHandler({
    previewOrigin,
    studioOrigin,
    now: () => now,
    readPermit: read,
    recordServed: () => Promise.resolve(true),
  })
}

test('serves only exact verified bytes as an inert attachment with no browser referrer', async () => {
  const page = forEntry((candidate) => Promise.resolve(candidate === token ? entry : null))
  const response = await page(new Request(previewOrigin + exactPath))
  assert.equal(response.status, 200)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes)
  assert.equal(response.headers.get('content-type'), 'application/octet-stream')
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="index.html"')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('cache-control'), 'no-store, private')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'; sandbox")
})

test('wrong host, wrong path, alternate file and non-GET never call the resolver', async () => {
  let calls = 0
  const page = forEntry(() => {
    calls++
    return Promise.resolve(entry)
  })
  for (const request of [
    new Request(studioOrigin + exactPath),
    new Request(previewOrigin + exactPath + '?arbitrary=1'),
    new Request(previewOrigin + exactPath.replace('index.html', 'other.html')),
    new Request(previewOrigin + exactPath, { method: 'POST' }),
  ]) {
    assert.equal((await page(request)).status, 404)
  }
  assert.equal(calls, 0)
})

test('missing scope, expired grants and corrupted entries have the same body', async () => {
  const oversized = new Uint8Array(2_097_153)
  const ended = { ...entry, byteLength: oversized.byteLength, bytes: oversized }
  for (const record of [
    null,
    { ...entry, expiresAt: new Date(now).toISOString() },
    { ...entry, expiresAt: new Date(now + 600_001).toISOString() },
    { ...entry, byteLength: 1 },
    ended,
    { ...entry, byteLength: 0, bytes: new Uint8Array() },
    { ...entry, entrySha256: '0'.repeat(64) },
  ]) {
    const response = await forEntry(() => Promise.resolve(record))(new Request(previewOrigin + exactPath))
    assert.equal(response.status, 404)
    assert.equal(await response.text(), 'Preview unavailable')
  }
  assert.throws(
    () =>
      createPrototypePreviewContentHandler({
        previewOrigin: studioOrigin,
        studioOrigin,
        readPermit: () => Promise.resolve(null),
        recordServed: () => Promise.resolve(false),
      }),
    /separate hosts/,
  )
})

test('refuses hash-valid documents that declare remote dependencies', async () => {
  for (const html of [
    '<script src="/outside.js"></script>',
    '<meta http-equiv="refresh" content="1;url=https://missing.example/">',
    '<style>@import "https://missing.example/theme.css";</style>',
    '<p style="background: url(https://missing.example/p.png)">Preview</p>',
    '<template><img src="//missing.example/p.png"></template>',
  ]) {
    const raw = new TextEncoder().encode(html)
    const row = {
      ...entry,
      bytes: raw,
      byteLength: raw.byteLength,
      entrySha256: createHash('sha256').update(raw).digest('hex'),
    }
    assert.equal((await forEntry(() => Promise.resolve(row))(new Request(previewOrigin + exactPath))).status, 404)
  }
})

test('HEAD and raw GET never record an approval receipt and an expired receipt blocks the guarded document', async () => {
  let served = 0
  let grantCurrent = true
  const handle = createPrototypePreviewContentHandler({
    previewOrigin,
    studioOrigin,
    now: () => now,
    readPermit: () => Promise.resolve(entry),
    recordServed: (candidate) => {
      assert.equal(candidate, token)
      served++
      return Promise.resolve(grantCurrent)
    },
  })
  const head = (origin: string) => new Request(previewOrigin + exactPath, { method: 'HEAD', headers: { origin } })
  assert.equal((await handle(head(previewOrigin))).status, 404)
  const verified = await handle(head(studioOrigin))
  assert.equal(verified.status, 200)
  assert.equal(verified.headers.get('access-control-allow-origin'), studioOrigin)
  assert.equal(verified.headers.get('x-sophia-preview-entry-sha256'), entry.entrySha256)
  assert.equal(await verified.text(), '')
  assert.equal(served, 0)
  assert.equal((await handle(new Request(previewOrigin + exactPath))).status, 200)
  assert.equal(served, 0)
  assert.equal((await handle(frame(documentUrl, 'same-origin'))).status, 200)
  assert.equal(served, 1)
  grantCurrent = false
  assert.equal((await handle(frame(documentUrl, 'same-origin'))).status, 404)
  assert.equal(served, 2)
})

test('serves the trusted shell and opaque document under the same exact permit', async () => {
  let reads = 0
  let receipts = 0
  const handle = createPrototypePreviewContentHandler({
    previewOrigin,
    studioOrigin,
    now: () => now,
    readPermit: (candidate) => {
      assert.equal(candidate, token)
      reads++
      return Promise.resolve(entry)
    },
    recordServed: () => {
      receipts++
      return Promise.resolve(true)
    },
  })
  const shell = await handle(frame(shellUrl, 'cross-site'))
  assert.equal(shell.status, 200)
  assert.ok(shell.headers.get('content-security-policy')?.includes(`frame-src ${documentUrl};`))
  assert.ok(shell.headers.get('content-security-policy')?.endsWith('sandbox allow-scripts allow-same-origin'))
  assert.match(await shell.text(), /Retained interactive prototype/u)
  assert.equal(receipts, 0)
  const document = await handle(frame(documentUrl, 'same-origin'))
  assert.equal(document.status, 200)
  assert.ok(
    document.headers.get('content-security-policy')?.includes(`frame-ancestors ${studioOrigin} ${previewOrigin};`),
  )
  assert.ok(document.headers.get('content-security-policy')?.endsWith('sandbox allow-scripts'))
  const served = await document.text()
  assert.ok(served.startsWith('<!doctype html><script>'))
  assert.ok(served.endsWith('\r\n<button id="ack">Acknowledge</button>\r\n'))
  assert.equal(receipts, 1)
  assert.deepEqual(new Uint8Array(await (await handle(new Request(previewOrigin + exactPath))).arrayBuffer()), bytes)
  for (const url of [documentUrl, shellUrl]) {
    for (const suffix of ['?', '?fixed=1', '#anchor']) {
      const refused = await handle(frame(url + suffix, url === documentUrl ? 'same-origin' : 'cross-site'))
      assert.equal(refused.status, 404)
      assert.equal(refused.headers.get('location'), null)
    }
    assert.equal((await handle(new Request(url, { method: 'HEAD', headers: { origin: studioOrigin } }))).status, 404)
  }
  assert.equal(reads, 3)
  assert.equal(receipts, 1)
})

test('checks the raw listener path before URL normalization', () => {
  assert.ok(isPrototypePreviewPath(exactPath))
  assert.ok(isPrototypePreviewPath(exactPath.replace('index.html', 'shell.html')))
  assert.ok(isPrototypePreviewPath(exactPath.replace('index.html', 'document.html')))
  for (const path of [
    undefined,
    exactPath + '?',
    exactPath + '?fixed=1',
    exactPath.replace('index.html', 'extra/../document.html'),
    exactPath.replace('index.html', '%64ocument.html'),
    exactPath.replace('index.html', 'extra/../shell.html'),
    exactPath.replace('index.html', 'document.html?fixed=1'),
  ])
    assert.equal(isPrototypePreviewPath(path), false)
})

test('requires frame navigation metadata before resolving a presentation', async () => {
  let reads = 0
  const handle = forEntry(() => {
    reads++
    return Promise.resolve(entry)
  })
  for (const request of [
    new Request(documentUrl),
    new Request(shellUrl),
    top(documentUrl),
    top(shellUrl),
    frame(documentUrl, 'cross-site'),
    frame(documentUrl, 'same-site'),
    frame(shellUrl, 'same-origin'),
    new Request(documentUrl, {
      headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'iframe' },
    }),
  ]) {
    assert.equal((await handle(request)).status, 404)
  }
  assert.equal(reads, 0)
  assert.equal((await handle(frame(shellUrl, 'same-site'))).status, 200)
  assert.equal(reads, 1)
  assert.deepEqual(
    Object.fromEntries(
      previewRequestHeaders({
        origin: studioOrigin,
        cookie: 'fixture=ignored',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'iframe',
        'sec-fetch-site': ['same-origin', 'cross-site'],
      }),
    ),
    { origin: studioOrigin, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
  )
})
