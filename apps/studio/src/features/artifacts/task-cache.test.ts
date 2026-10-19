import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InfiniteQueryObserver, QueryClient, type InfiniteData } from '@tanstack/react-query'
import type { ProjectTask } from '../../api/vision.ts'
import { taskChanged, taskRecorded, tasksKey } from './task-cache.ts'

// SYNTHETIC client-cache regressions for c82's two automatic findings (4310419402, 4310419406), on a real TanStack
// QueryClient and the actual cache helpers. The "server" below orders and pages as persistence/human-tasks.ts does:
// open first, then done; each newest first; 50 a page; the cursor is the last row.
const P = '00000000-0000-4000-8000-0000000000aa'
const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b2'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const at = (n: number) => new Date(Date.UTC(2026, 9, 18, 0, 0, n)).toISOString()
const task = (n: number, over: Partial<ProjectTask> = {}): ProjectTask => ({
  taskId: id(n),
  text: `Task ${n}`,
  owner: null,
  ownerName: null,
  from: null,
  by: A,
  at: at(n),
  doneBy: null,
  doneAt: null,
  revision: 1,
  ...over,
})
interface Page {
  tasks: ProjectTask[]
  next: string | null
}

describe('task cache (4310419402): an older write answer never rolls back a newer read', () => {
  it('a late owner answer at revision N leaves the report list, the project pages and the task alone at N+1', () => {
    const client = new QueryClient()
    const newer = task(1, { revision: 3, owner: B, ownerName: 'Davide', doneBy: B, doneAt: at(90) })
    const late = task(1, { revision: 2, owner: A, ownerName: 'Luis' })
    client.setQueryData(tasksKey('report-1', 'davide'), { tasks: [newer], readFrom: 1 })
    client.setQueryData<InfiniteData<Page>>(['tasks', 'project', P, 'davide'], {
      pages: [{ tasks: [newer], next: null }],
      pageParams: [null],
    })
    client.setQueryData(['tasks', 'one', P, newer.taskId, 'davide'], newer)
    taskChanged(client, late)
    const flat = client.getQueryData<{ tasks: ProjectTask[] }>(tasksKey('report-1', 'davide'))
    const pages = client.getQueryData<InfiniteData<Page>>(['tasks', 'project', P, 'davide'])
    const one = client.getQueryData<ProjectTask>(['tasks', 'one', P, newer.taskId, 'davide'])
    assert.equal(flat?.tasks[0]?.revision, 3, 'report list keeps N+1')
    assert.equal(pages?.pages[0]?.tasks[0]?.revision, 3, 'project page keeps N+1')
    assert.equal(one?.revision, 3, 'the task read alone keeps N+1 (the next write asks against N+1)')
    assert.notEqual(one?.doneAt ?? null, null, 'still done')
    assert.equal(one?.owner, B)
  })

  it('a late create answer at revision N does not replace the feed’s newer copy in the report list (insertion)', () => {
    const client = new QueryClient()
    const newer = task(2, { revision: 2, owner: B, ownerName: 'Davide' })
    client.setQueryData(tasksKey('report-1', 'davide'), { tasks: [newer], readFrom: 1 })
    taskRecorded(client, 'report-1', 'davide', task(2, { revision: 1 }))
    const flat = client.getQueryData<{ tasks: ProjectTask[] }>(tasksKey('report-1', 'davide'))
    assert.equal(flat?.tasks.length, 1)
    assert.equal(flat?.tasks[0]?.revision, 2)
    assert.equal(flat?.tasks[0]?.owner, B)
  })
})

describe('task cache (R on 878): a late write answer at the SAME revision never reinstalls an origin a newer read redacted', () => {
  it('owner answer N with an available origin, after a GET at N said unavailable: project pages, the task alone and the report list keep it unavailable', () => {
    const client = new QueryClient()
    const origin = { artifactId: 'report-1', versionId: 'v-old', versionNumber: 1, passage: 'b1w0c3', quote: null }
    // The newer read: the same revision N, but this reader may no longer follow the source.
    const read = task(4, { revision: 2, owner: A, ownerName: 'Luis', from: 'unavailable' })
    // The delayed owner command's own answer: revision N too, with the origin as it was when it was sent.
    const late = task(4, { revision: 2, owner: A, ownerName: 'Luis', from: origin })
    client.setQueryData(tasksKey('report-1', 'davide'), { tasks: [read], readFrom: 1 })
    client.setQueryData<InfiniteData<Page>>(['tasks', 'project', P, 'davide'], {
      pages: [{ tasks: [read], next: null }],
      pageParams: [null],
    })
    client.setQueryData(['tasks', 'one', P, read.taskId, 'davide'], read)
    taskChanged(client, late)
    taskRecorded(client, 'report-1', 'davide', late)
    const flat = client.getQueryData<{ tasks: ProjectTask[] }>(tasksKey('report-1', 'davide'))
    const pages = client.getQueryData<InfiniteData<Page>>(['tasks', 'project', P, 'davide'])
    const one = client.getQueryData<ProjectTask>(['tasks', 'one', P, read.taskId, 'davide'])
    assert.equal(pages?.pages[0]?.tasks[0]?.from, 'unavailable', 'project page keeps the redaction')
    assert.equal(one?.from, 'unavailable', 'the task read alone keeps the redaction')
    assert.equal(flat?.tasks[0]?.from, 'unavailable', 'the report list keeps the redaction (insertion included)')
    // A later genuine allowed read restores it: a read replaces the query's data whole.
    client.setQueryData(['tasks', 'one', P, read.taskId, 'davide'], late)
    assert.deepEqual(client.getQueryData<ProjectTask>(['tasks', 'one', P, read.taskId, 'davide'])?.from, origin)
  })
})

/** The project's tasks as the API pages them, with a hold on the next page read when asked. */
function server(count: number) {
  const tasks = new Map(Array.from({ length: count }, (_, i) => [id(i + 1), task(i + 1)]))
  const order = () =>
    [...tasks.values()].toSorted(
      (x, y) =>
        Number(x.doneAt !== null) - Number(y.doneAt !== null) ||
        y.at.localeCompare(x.at) ||
        y.taskId.localeCompare(x.taskId),
    )
  const held: (() => void)[] = []
  let holdNext = false
  return {
    tasks,
    hold: () => (holdNext = true),
    release: () => held.splice(0).forEach((go) => go()),
    page: async (cursor: string | null): Promise<Page> => {
      const all = order()
      const from = cursor === null ? 0 : all.findIndex((t) => t.taskId === cursor) + 1
      const slice = all.slice(from, from + 50)
      const answer = { tasks: slice, next: from + 50 < all.length ? (slice.at(-1)?.taskId ?? null) : null }
      if (cursor !== null && holdNext) {
        holdNext = false
        await new Promise<void>((resolve) => held.push(resolve))
      }
      return answer
    },
  }
}

describe('task cache (4310419406): a task done on a loaded project page', () => {
  it('51 open, the first 50 loaded, one done there before the feed, a late older page, then More: each task once, open before done, none missing', async () => {
    const client = new QueryClient()
    const api = server(51)
    const observer = new InfiniteQueryObserver<Page, Error, InfiniteData<Page>, readonly unknown[], string | null>(
      client,
      {
        queryKey: ['tasks', 'project', P, 'davide'],
        queryFn: ({ pageParam }) => api.page(pageParam),
        initialPageParam: null,
        getNextPageParam: (last) => last.next,
      },
    )
    const stop = observer.subscribe(() => {})
    await observer.refetch()
    assert.equal(observer.getCurrentResult().data?.pages[0]?.tasks.length, 50)
    api.hold()
    const lateMore = observer.fetchNextPage() // a late older next-page read, set out before the change
    const before = api.tasks.get(id(51))
    assert.ok(before)
    const done: ProjectTask = { ...before, revision: 2, doneBy: A, doneAt: at(99) }
    api.tasks.set(done.taskId, done)
    taskChanged(client, done) // its answer lands before the feed or More
    api.release()
    await lateMore.catch(() => undefined)
    await new Promise((r) => setTimeout(r, 0))
    for (let i = 0; i < 3 && observer.getCurrentResult().hasNextPage; i += 1) await observer.fetchNextPage()
    await new Promise((r) => setTimeout(r, 0))
    const rows = (observer.getCurrentResult().data?.pages ?? []).flatMap((p) => p.tasks)
    stop()
    const ids = rows.map((t) => t.taskId)
    assert.equal(new Set(ids).size, ids.length, 'each task once')
    assert.equal(ids.length, 51, 'none missing')
    const firstDone = rows.findIndex((t) => t.doneAt !== null)
    assert.ok(firstDone < 0 || rows.slice(firstDone).every((t) => t.doneAt !== null), 'open before done')
    assert.notEqual(rows.find((t) => t.taskId === id(51))?.doneAt ?? null, null, 'the done task shows done')
  })
})
