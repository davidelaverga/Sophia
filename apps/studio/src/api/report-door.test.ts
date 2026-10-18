import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { getSourceContent, listArtifactVersions, listReportSources } from './artifacts.ts'
import { ApiError } from './client.ts'
import { getNativeTask } from './conversation.ts'
import { ownReportRefusal } from '../features/artifacts/report-read.ts'

// R-C1 P1 r4307481556: the four report/task reads a report or task fence follows are refused at the client's first
// sight of a 401/403 status (doorRead), whatever their error body does; the body is cancelled, not awaited. A typed
// 422 not_found still needs its body; an invalid 422, a 503 and a bare 404 are never this person's refusal.
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
const READS = [
  ['versions', () => listArtifactVersions('t', 'a')],
  ['sources', () => listReportSources('t', 'a', 'v')],
  ['content', () => getSourceContent('t', 's')],
  ['task', () => getNativeTask('t', 'p', 'k')],
] as const
const answer = (status: number, body: string) => () => Promise.resolve(new Response(body, { status }))
const settle = (p: Promise<unknown>, ms = 200) =>
  Promise.race([
    p.then(
      () => 'resolved',
      (e: unknown) => e,
    ),
    new Promise((r) => setTimeout(() => r('pending'), ms)),
  ])

describe('a report or task read refused by its 401/403 status', () => {
  for (const [label, read] of READS)
    for (const status of [401, 403]) {
      it(`${label}: ${String(status)} refused at once while its body never ends, and the body is cancelled`, async () => {
        let cancelled = false
        const body = new ReadableStream<Uint8Array>({
          cancel: () => {
            cancelled = true
          },
        })
        globalThis.fetch = () => Promise.resolve(new Response(body, { status }))
        const error = await settle(read())
        assert.ok(error instanceof ApiError, `settled as ${String(error)}`)
        assert.equal(error.status, status)
        assert.equal(error.code, `http_${String(status)}`)
        assert.equal(error.retry, 'safe_read') // a GET's canonical retry, unchanged; the fence keys on the status
        assert.equal(ownReportRefusal(error), true)
        await new Promise((r) => setTimeout(r, 0))
        assert.equal(cancelled, true)
      })
    }

  it('a typed 422 not_found is still read from its body; an invalid 422, a 503 and a bare 404 are not refusals', async () => {
    globalThis.fetch = answer(
      422,
      JSON.stringify({
        code: 'not_found',
        message: 'No',
        requestId: '00000000-0000-4000-8000-0000000000ee',
        retry: 'never',
      }),
    )
    assert.equal(ownReportRefusal(await settle(listArtifactVersions('t', 'a'))), true)
    globalThis.fetch = answer(
      422,
      JSON.stringify({
        code: 'invalid_request',
        message: 'No',
        requestId: '00000000-0000-4000-8000-0000000000ee',
        retry: 'never',
      }),
    )
    assert.equal(ownReportRefusal(await settle(listArtifactVersions('t', 'a'))), false)
    globalThis.fetch = answer(
      503,
      JSON.stringify({
        code: 'unavailable',
        message: 'Busy',
        requestId: '00000000-0000-4000-8000-0000000000ee',
        retry: 'safe_read',
      }),
    )
    assert.equal(ownReportRefusal(await settle(getNativeTask('t', 'p', 'k'))), false)
    globalThis.fetch = answer(404, '<html>')
    assert.equal(ownReportRefusal(await settle(getSourceContent('t', 's'))), false)
  })
})
