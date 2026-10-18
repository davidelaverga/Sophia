import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import { downloadSource, type DownloadDeps } from './download.ts'
import { fenced, reportFenceKey, type ReportFence } from './report-read.ts'

// R-C1-cc7 P1-C: the typed content API read of a report's own output is that report's own read; its 401/403/not_found
// fences the report in the caller's cache. The storage URL's bytes and ordinary failures never do; nor an unowned call.
const A = 'artifact-a'
const fenceOf = (client: QueryClient) =>
  fenced(client.getQueryData<ReportFence>(reportFenceKey(A)) ?? { refusedAt: 0, allowedFrom: 0 })
const deps = (over: Partial<DownloadDeps>): DownloadDeps => ({
  getContent: () => Promise.reject(new Error('unused')),
  fetchBytes: () => Promise.reject(new Error('unused')),
  save: () => undefined,
  ...over,
})
const content = { sha256: 'a'.repeat(64), mime: 'text/markdown', filename: 'r.md', downloadUrl: 'https://store.test/x' }

describe('a report output download and its report’s refusal', () => {
  it('the content API’s own not_found / 403 fences the report in the caller’s cache', async () => {
    for (const [status, code] of [
      [422, 'not_found'],
      [403, 'forbidden'],
    ] as const) {
      const client = new QueryClient()
      const getContent = () => Promise.reject(new ApiError(status, code, 'No', 'never'))
      await assert.rejects(downloadSource('t', 's', 'a'.repeat(64), deps({ getContent }), { client, artifactId: A }))
      assert.equal(fenceOf(client), true, `${String(status)} ${code}`)
    }
  })

  it('a storage URL failure, a 503 or an unowned call fences nothing', async () => {
    const client = new QueryClient()
    // The content API allowed it; the signed URL then failed: not this report's authority.
    const allowed = () => Promise.resolve(content as never)
    await assert.rejects(
      downloadSource(
        't',
        's',
        'a'.repeat(64),
        deps({ getContent: allowed, fetchBytes: () => Promise.reject(new Error('expired')) }),
        {
          client,
          artifactId: A,
        },
      ),
    )
    await assert.rejects(
      downloadSource(
        't',
        's',
        'a'.repeat(64),
        deps({ getContent: () => Promise.reject(new ApiError(503, 'unavailable', 'Busy', 'safe_read')) }),
        {
          client,
          artifactId: A,
        },
      ),
    )
    assert.equal(fenceOf(client), false)
    await assert.rejects(
      downloadSource(
        't',
        's',
        'a'.repeat(64),
        deps({ getContent: () => Promise.reject(new ApiError(422, 'not_found', 'No', 'never')) }),
      ),
    )
    assert.equal(fenceOf(client), false, 'no owner named: nothing is guessed from a source id')
  })
})
