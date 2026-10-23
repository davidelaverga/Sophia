import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import { reportTasksRefused, shownTaskReads, taskPages, taskRead, tasksRefusedKey } from './task-read.ts'

// R tasks report not_found: a report's own task list answered 422 not_found (unknown or inaccessible, kept
// indistinguishable) is this person's refusal, as 401/403 are; nothing read before it shows until a read set out since
// is allowed. Only that read: invalid 422, bare 404 and 503 are not refusals, and the project's list keeps 401/403 only.
const P = 'project-p'
const A = 'artifact-a'
const fail = (status: number, code: string) => () => Promise.reject(new ApiError(status, code, 'No', 'never'))
const refusedAt = (client: QueryClient, resource = A) => client.getQueryData<number>(tasksRefusedKey(P, resource)) ?? 0
const ctx = (client: QueryClient) => ({ client, signal: new AbortController().signal })

describe('a report’s own task list refused by not_found', () => {
  it('the classifier: 401, 403 and 422 not_found; not invalid 422, bare 404, 503 or a non-ApiError', () => {
    for (const [s, c] of [
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [422, 'not_found'],
    ] as const)
      assert.equal(reportTasksRefused(new ApiError(s, c, 'No', 'never')), true, `${String(s)} ${c}`)
    for (const [s, c] of [
      [422, 'invalid_request'],
      [404, 'not_found_route'],
      [503, 'unavailable'],
    ] as const)
      assert.equal(reportTasksRefused(new ApiError(s, c, 'No', 'never')), false, `${String(s)} ${c}`)
    assert.equal(reportTasksRefused(new Error('malformed')), false)
  })

  it('kept as the report’s refusal: earlier reads hide; a read set out since and allowed shows again', async () => {
    const client = new QueryClient()
    const before = await taskRead(P, A, () => Promise.resolve({ tasks: [1, 2] }), reportTasksRefused)(ctx(client))
    await assert.rejects(taskRead(P, A, fail(422, 'not_found'), reportTasksRefused)(ctx(client)))
    const at = refusedAt(client)
    assert.ok(at > before.readFrom)
    assert.equal(shownTaskReads([before], false, at), undefined, 'the two rows read before are not shown')
    const since = await taskRead(P, A, () => Promise.resolve({ tasks: [1] }), reportTasksRefused)(ctx(client))
    assert.deepEqual(shownTaskReads([since], false, at), [since])
  })

  it('an invalid 422, a 503 or another report keep nothing; the project list’s 422 not_found is not this refusal', async () => {
    const client = new QueryClient()
    await assert.rejects(taskRead(P, A, fail(422, 'invalid_request'), reportTasksRefused)(ctx(client)))
    await assert.rejects(taskRead(P, A, fail(503, 'unavailable'), reportTasksRefused)(ctx(client)))
    assert.equal(refusedAt(client), 0)
    await assert.rejects(taskRead(P, 'artifact-b', fail(422, 'not_found'), reportTasksRefused)(ctx(client)))
    assert.equal(refusedAt(client), 0, 'report A untouched by report B')
    await assert.rejects(taskPages(P, 'project', fail(422, 'not_found'))({ ...ctx(client), pageParam: null }))
    assert.equal(refusedAt(client, 'project'), 0)
  })
})
