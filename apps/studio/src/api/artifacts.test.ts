import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { listArtifactVersions } from './artifacts.ts'

const realFetch = globalThis.fetch
const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'
const A = '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d'

/** A published report version as the API lists it, `bytes` long, after a parent `previousBytes` long. */
const version = (n: number, bytes: number, previousBytes: number | null) => ({
  id: `1a2b3c4d-0000-4000-8000-00000000000${String(n)}`,
  artifactId: A,
  projectId: P,
  parentId: n > 1 ? `1a2b3c4d-0000-4000-8000-00000000000${String(n - 1)}` : null,
  sourceId: `2b3c4d5e-0000-4000-8000-00000000000${String(n)}`,
  sourceHash: String(n).repeat(64),
  state: 'stable',
  previewId: null,
  format: 'markdown',
  exportEditability: 'source_editable',
  title: 'Hosts',
  versionNumber: n,
  createdAt: '2026-10-03T10:00:00.000Z',
  changeFacts: { cited: 3, added: [], dropped: [], bytes, previousBytes },
})

/** The API answers every call with `body`. */
const serve = (body: unknown) => {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
}

describe('a report’s versions', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('reads a long report’s history: a draft may be 262,144 bytes (0025), so may its version', async () => {
    const list = [version(2, 262_144, 262_144), version(1, 262_144, null)]
    serve(list)
    assert.deepEqual(await listArtifactVersions('token', A), list)
  })

  it('refuses a version longer than a draft may be', async () => {
    serve([version(2, 262_145, 262_144)])
    await assert.rejects(listArtifactVersions('token', A))
  })
})
