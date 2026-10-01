import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import type { SourceContent } from '@sophia/contracts'
import { checkedBlob, downloadSource, HashMismatch, sha256Hex, utf8, type DownloadDeps } from './download.ts'

describe('a download is the version on screen', () => {
  const text = '# Report\nHosts — sandboxed.\n'
  const sha = createHash('sha256').update(text, 'utf8').digest('hex')

  it('hashes the stored bytes (UTF-8) as the service does', async () => {
    assert.equal(await sha256Hex(utf8(text)), sha)
  })

  it('saves bytes whose hash matches the record, and refuses any other', async () => {
    const blob = await checkedBlob(utf8(text), sha.toUpperCase(), 'text/markdown')
    assert.equal(await blob.text(), text)
    assert.equal(blob.type, 'text/markdown')
    await assert.rejects(checkedBlob(utf8(`${text} `), sha, 'text/markdown'), HashMismatch)
  })
})

/** API, storage and save doubles; `bytes` is what the storage URL serves. */
function doubles(record: SourceContent, bytes: Uint8Array<ArrayBuffer> | Error) {
  const seen = { content: 0, fetched: [] as string[], saved: [] as { blob: Blob; filename: string }[] }
  const deps: DownloadDeps = {
    getContent: (_token, _source, disposition) => {
      seen.content += 1
      assert.equal(disposition, 'attachment')
      return Promise.resolve(record)
    },
    fetchBytes: (url) => {
      seen.fetched.push(url)
      return bytes instanceof Error ? Promise.reject(bytes) : Promise.resolve(bytes)
    },
    save: (blob, filename) => seen.saved.push({ blob, filename }),
  }
  return { deps, seen }
}

describe("the card's download checks the bytes it saves (M03-RF-0012)", () => {
  const text = '# Report\nHosts — sandboxed.\n'
  const sha = createHash('sha256').update(text, 'utf8').digest('hex')
  const stored = utf8(text)
  const content = (over: Partial<SourceContent> = {}): SourceContent => ({
    sourceId: 's1',
    sha256: sha,
    mime: 'text/markdown',
    byteLength: stored.byteLength,
    filename: 'Hosts v1.md',
    disposition: 'attachment',
    downloadUrl: 'https://storage.example/object?X-Amz-Signature=x',
    expiresAt: '2026-10-01T19:00:00Z',
    ...over,
  })
  it('fetches stored bytes, checks them against the version, and saves them as a Blob under the record name', async () => {
    const { deps, seen } = doubles(content(), stored)
    const saved = await downloadSource('t', 's1', sha.toUpperCase(), deps)
    assert.deepEqual(saved, { filename: 'Hosts v1.md', byteLength: stored.byteLength })
    assert.equal(seen.fetched.length, 1)
    assert.equal(seen.saved.length, 1)
    assert.equal(seen.saved[0]?.filename, 'Hosts v1.md')
    assert.equal(await seen.saved[0]?.blob.text(), text)
  })

  it('refuses stored bytes that do not match, and saves nothing (Codex’s reproduction)', async () => {
    const { deps, seen } = doubles(content(), utf8(`${text}tampered`))
    await assert.rejects(downloadSource('t', 's1', sha, deps), HashMismatch)
    assert.equal(seen.fetched.length, 1, 'the bytes were read, not merely the metadata')
    assert.equal(seen.saved.length, 0)
  })

  it('refuses a record for other bytes than the selected version, before reading them', async () => {
    const other = createHash('sha256').update('another version').digest('hex')
    const { deps, seen } = doubles(content({ sha256: other }), stored)
    await assert.rejects(downloadSource('t', 's1', sha, deps), HashMismatch)
    assert.deepEqual([seen.fetched.length, seen.saved.length], [0, 0])
  })

  it('checks inline text against the version too', async () => {
    const inline = doubles(content({ text, downloadUrl: null, expiresAt: null }), stored)
    await downloadSource('t', 's1', sha, inline.deps)
    assert.deepEqual([inline.seen.fetched.length, inline.seen.saved.length], [0, 1])
    const wrong = doubles(content({ text: `${text}!`, downloadUrl: null, expiresAt: null }), stored)
    await assert.rejects(downloadSource('t', 's1', sha, wrong.deps), HashMismatch)
    assert.equal(wrong.seen.saved.length, 0)
  })

  it('surfaces a failed read or a file with no bytes yet, and saves nothing', async () => {
    const failed = doubles(content(), new Error('The report could not be read. Try again.'))
    await assert.rejects(downloadSource('t', 's1', sha, failed.deps), /could not be read/)
    const none = doubles(content({ downloadUrl: null, expiresAt: null }), stored)
    await assert.rejects(downloadSource('t', 's1', sha, none.deps), /not available to download yet/)
    assert.deepEqual([failed.seen.saved.length, none.seen.saved.length], [0, 0])
  })
})
