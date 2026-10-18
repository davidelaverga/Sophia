import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import {
  downloadSource,
  HashMismatch,
  ownedSave,
  SaveWithheld,
  sha256Hex,
  utf8,
  type DownloadDeps,
} from './download.ts'
import { reportRead } from './report-read.ts'

// R-C1-b8 P1 r4307115215: a report-owned save after its last await is stopped by a NEWER own refusal of that report in
// the initiating account's cache (no save, no success); an older allowed read settling late never lifts it; a read
// set out since and allowed restores it; another report, another account, a later owner change and unowned saves are
// untouched; storage/hash failures stay what they are. Card path (downloadSource) and the viewer's save (ownedSave).
const A = 'artifact-a'
const BYTES = utf8('report bytes')
const refuse403 = () => Promise.reject(new ApiError(403, 'forbidden', 'No', 'never'))
const refuse = (client: QueryClient, artifactId = A) => assert.rejects(reportRead(artifactId, refuse403)({ client }))
const allow = (client: QueryClient, artifactId = A) => reportRead(artifactId, () => Promise.resolve(1))({ client })
const held = <T>() => {
  let release!: (v: T) => void
  const promise = new Promise<T>((r) => (release = r))
  return { promise, release }
}
/** Bytes whose fetch has begun and that arrive only when the test releases them. */
const heldFetch = () => {
  const started = held<void>()
  const bytes = held<Uint8Array<ArrayBuffer>>()
  const fetchBytes = () => {
    started.release()
    return bytes.promise
  }
  return { started: started.promise, release: bytes.release, fetchBytes }
}

async function setup() {
  const sha = await sha256Hex(BYTES)
  const saves: string[] = []
  const content = { sha256: sha, mime: 'text/markdown', filename: 'r.md', downloadUrl: 'https://store.test/x' }
  const deps = (over: Partial<DownloadDeps> = {}): DownloadDeps => ({
    getContent: () => Promise.resolve(content as never),
    fetchBytes: () => Promise.resolve(BYTES),
    save: (_b, name) => void saves.push(name),
    ...over,
  })
  return { sha, saves, content, deps }
}

describe('a report-owned save and a newer own refusal', () => {
  it('card: bytes held, then the report is refused to this account, then valid bytes arrive: nothing saved, no success', async () => {
    const { sha, saves, deps } = await setup()
    const client = new QueryClient()
    const fetch = heldFetch()
    const run = downloadSource('t', 's', sha, deps({ fetchBytes: fetch.fetchBytes }), {
      client,
      artifactId: A,
    })
    await fetch.started
    await refuse(client)
    fetch.release(BYTES)
    await assert.rejects(run, SaveWithheld)
    assert.equal(saves.length, 0)
  })

  it('viewer save: held hash/inline completion, a refusal lands meanwhile: nothing saved', async () => {
    const { sha, saves } = await setup()
    const client = new QueryClient()
    const run = ownedSave(
      { bytes: BYTES, filename: 'v.md', mime: 'text/markdown' },
      sha,
      { client, artifactId: A },
      (_b, n) => void saves.push(n),
    )
    await refuse(client) // settles while the digest is still being computed
    await assert.rejects(run, SaveWithheld)
    assert.equal(saves.length, 0)
  })

  it('an allowed metadata read set out BEFORE the refusal and settling after it does not lift it', async () => {
    const { sha, saves, content, deps } = await setup()
    const client = new QueryClient()
    const meta = held<typeof content>()
    const run = downloadSource('t', 's', sha, deps({ getContent: () => meta.promise as never }), {
      client,
      artifactId: A,
    })
    await refuse(client)
    meta.release(content)
    await assert.rejects(run, SaveWithheld)
    assert.equal(saves.length, 0)
  })

  it('a read set out since the refusal and allowed restores the save', async () => {
    const { sha, saves, deps } = await setup()
    const client = new QueryClient()
    await refuse(client)
    await allow(client)
    assert.deepEqual(await downloadSource('t', 's', sha, deps(), { client, artifactId: A }), {
      filename: 'r.md',
      byteLength: BYTES.byteLength,
    })
    assert.deepEqual(saves, ['r.md'])
  })

  it('another report, another account, and a later change of the owner object do not decide A’s save', async () => {
    const { sha, saves, deps } = await setup()
    const client = new QueryClient()
    const other = new QueryClient()
    const fetch = heldFetch()
    const owner = { client, artifactId: A }
    const run = downloadSource('t', 's', sha, deps({ fetchBytes: fetch.fetchBytes }), owner)
    await fetch.started
    await refuse(client, 'artifact-b')
    await refuse(other)
    // The visible owner changes while it awaits (a newer account, refused there): the save stays the original's.
    owner.client = other
    fetch.release(BYTES)
    await run
    assert.deepEqual(saves, ['r.md'])
  })

  it('unowned saves are untouched; storage and hash failures stay theirs, never a withheld save', async () => {
    const { sha, saves, deps } = await setup()
    const client = new QueryClient()
    await refuse(client)
    await downloadSource('t', 's', sha, deps())
    assert.deepEqual(saves, ['r.md'])
    await assert.rejects(
      downloadSource('t', 's', 'b'.repeat(64), deps(), { client: new QueryClient(), artifactId: A }),
      HashMismatch,
    )
    await assert.rejects(
      downloadSource('t', 's', sha, deps({ fetchBytes: () => Promise.reject(new Error('expired')) }), {
        client: new QueryClient(),
        artifactId: A,
      }),
      (e: unknown) => !(e instanceof SaveWithheld),
    )
    assert.equal(saves.length, 1)
  })
})
