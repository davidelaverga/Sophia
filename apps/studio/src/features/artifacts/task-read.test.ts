import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import { shownTaskReads, taskPages, taskRead, tasksRefusedKey } from './task-read.ts'

// V-C5-TASKS-READ-01: a task read refused (401, 403) is kept in the cache that ran it, for its project and resource, as
// it settles; nothing read before the last refusal shows again, whatever answers later; a read set out since does.
const P = 'p1'
const page = (n: number) => ({ tasks: [{ taskId: `t${String(n)}` }], next: null as string | null })
const refusedAt = (client: QueryClient, project: string, resource: string) =>
  client.getQueryData<number>(tasksRefusedKey(project, resource)) ?? 0
const ctx = (client: QueryClient) => ({ signal: new AbortController().signal, client })

describe('task reads and this person’s own refusal', () => {
  it('a refused read is kept as it settles, in its own cache, project and resource; another is untouched', async () => {
    const client = new QueryClient()
    const other = new QueryClient()
    for (const status of [401, 403]) {
      await assert.rejects(
        taskRead(P, 'project', () => Promise.reject(new ApiError(status, 'forbidden', 'No', 'never')))(ctx(client)),
      )
      assert.ok(refusedAt(client, P, 'project') > 0, `${String(status)} kept`)
    }
    assert.equal(refusedAt(client, P, 'report-a'), 0, 'another resource')
    assert.equal(refusedAt(client, 'p2', 'project'), 0, 'another project')
    assert.equal(refusedAt(other, P, 'project'), 0, 'another account’s cache')
  })

  it('an ordinary failure (503) keeps no refusal, and what was read still shows', async () => {
    const client = new QueryClient()
    const read = await taskRead(P, 'project', () => Promise.resolve(page(1)))(ctx(client))
    await assert.rejects(
      taskRead(P, 'project', () => Promise.reject(new ApiError(503, 'unavailable', 'Busy', 'safe_read')))(ctx(client)),
    )
    assert.equal(refusedAt(client, P, 'project'), 0)
    assert.deepEqual(shownTaskReads([read], false, refusedAt(client, P, 'project')), [read])
  })

  it('an older read answering after the refusal never shows; one set out since does', async () => {
    const client = new QueryClient()
    let answer!: (v: ReturnType<typeof page>) => void
    const older = taskPages(
      P,
      'project',
      () => new Promise<ReturnType<typeof page>>((r) => (answer = r)),
    )({
      pageParam: null,
      ...ctx(client),
    })
    await assert.rejects(
      taskPages(P, 'project', () => Promise.reject(new ApiError(403, 'forbidden', 'No', 'never')))({
        pageParam: 'c',
        ...ctx(client),
      }),
    )
    answer(page(1))
    const late = await older
    const at = refusedAt(client, P, 'project')
    assert.equal(shownTaskReads([late], false, at), undefined, 'the late older answer stays hidden')
    assert.equal(shownTaskReads([late], true, at), undefined, 'and while refused now')
    const fresh = await taskPages(P, 'project', () => Promise.resolve(page(2)))({ pageParam: null, ...ctx(client) })
    assert.deepEqual(shownTaskReads([fresh], false, at), [fresh], 'a read set out since shows')
    assert.equal(shownTaskReads([late, fresh], false, at), undefined, 'never mixed with one read before')
  })
})
