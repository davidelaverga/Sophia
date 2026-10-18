import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import { fenced, ownReportRefusal, reportFenceKey, reportRead, type ReportFence } from './report-read.ts'

// R-TASKS-REPORT-NOTFOUND (C1 report reader): a report read refused to this person (401, 403, or this contract's
// not_found 422) is kept as it settles in the cache that ran it, for that report; an older read answering after it
// never lifts it; an allowed read set out since does; ordinary failures change nothing.
const A = 'artifact-a'
const fenceOf = (client: QueryClient, artifactId = A) =>
  fenced(client.getQueryData<ReportFence>(reportFenceKey(artifactId)) ?? { refusedAt: 0, allowedFrom: 0 })
const ctx = (client: QueryClient) => ({ client })
const refuse = (status: number, code: string) => () => Promise.reject(new ApiError(status, code, 'No', 'never'))

describe('a report read and this person’s own refusal', () => {
  it('own refusals: 401, 403 and not_found 422; not invalid_request 422, a bare 404, 503 or another error', () => {
    for (const [status, code] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [422, 'not_found'],
    ] as const)
      assert.equal(ownReportRefusal(new ApiError(status, code, 'No', 'never')), true, `${String(status)} ${code}`)
    for (const [status, code] of [
      [422, 'invalid_request'],
      [404, 'not_found_route'],
      [503, 'unavailable'],
      [0, 'outcome_unknown'],
    ] as const)
      assert.equal(ownReportRefusal(new ApiError(status, code, 'No', 'never')), false, `${String(status)} ${code}`)
    assert.equal(ownReportRefusal(new Error('malformed')), false)
  })

  it('a refusal fences that report, in its own cache only; an ordinary failure fences nothing', async () => {
    const client = new QueryClient()
    const other = new QueryClient()
    await reportRead(A, () => Promise.resolve(['v1']))(ctx(client))
    await assert.rejects(reportRead(A, refuse(503, 'unavailable'))(ctx(client)))
    await assert.rejects(reportRead(A, refuse(422, 'invalid_request'))(ctx(client)))
    assert.equal(fenceOf(client), false, 'ordinary failures keep the report')
    await assert.rejects(reportRead(A, refuse(422, 'not_found'))(ctx(client)))
    assert.equal(fenceOf(client), true, 'own not_found fences it')
    assert.equal(fenceOf(client, 'artifact-b'), false, 'another report')
    assert.equal(fenceOf(other), false, 'another account’s cache')
  })

  it('an older read answering after the refusal never lifts it; a later failure keeps it; a read since lifts it', async () => {
    const client = new QueryClient()
    let answer!: (v: string[]) => void
    const older = reportRead(A, () => new Promise<string[]>((r) => (answer = r)))(ctx(client))
    await assert.rejects(reportRead(A, refuse(403, 'forbidden'))(ctx(client)))
    answer(['v1'])
    await older
    assert.equal(fenceOf(client), true, 'the late older answer does not lift it')
    await assert.rejects(reportRead(A, refuse(503, 'unavailable'))(ctx(client)))
    assert.equal(fenceOf(client), true, 'nor a later ordinary failure')
    await reportRead(A, () => Promise.resolve(['v1']))(ctx(client))
    assert.equal(fenceOf(client), false, 'an allowed read set out since lifts it')
  })
})
