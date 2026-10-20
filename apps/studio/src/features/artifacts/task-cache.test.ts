import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InfiniteQueryObserver, QueryClient, type InfiniteData } from '@tanstack/react-query'
import type { ProjectTask } from '../../api/vision.ts'
import { onePerTask, taskChanged, taskRecorded, tasksKey } from './task-cache.ts'
import { taskOrder } from './task-read.ts'

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

describe('task cache (P on B20): a report’s task list is read-authoritative; a Create answer never fills it', () => {
  const origin = { artifactId: 'report-1', versionId: 'v-old', versionNumber: 1, passage: 'b1w0c3', quote: null }
  const created = task(5, { from: origin })
  const key = tasksKey('report-1', 'davide')
  const flat = (client: QueryClient) => client.getQueryData<{ tasks: ProjectTask[]; readFrom: number }>(key)

  it('a 200 {tasks: []} read after the Create was sent stays empty, and only an allowed read restores it', async () => {
    const client = new QueryClient()
    taskOrder() // the Create is sent; its answer is held
    // The source turns private; the report's own task read, set out since, answers as persistence/human-tasks.ts does.
    client.setQueryData(key, { tasks: [], next: null, readFrom: taskOrder() })
    taskRecorded(client, 'report-1', 'davide', created) // the delayed answer, its origin as it was
    assert.deepEqual(flat(client)?.tasks, [], 'the newer read’s exclusion is not refilled')
    assert.equal(client.getQueryState(key)?.isInvalidated, true, 'the list is read again instead')
    // A later allowed read (the source shared again) brings it back: only a read restores it.
    await client.fetchQuery({ queryKey: key, queryFn: () => ({ tasks: [created], next: null, readFrom: taskOrder() }) })
    assert.deepEqual(flat(client)?.tasks[0]?.from, origin)
  })

  it('after a refused first read (403, no data), a late answer neither seeds the list nor stamps it as read', async () => {
    const client = new QueryClient()
    const refused = Object.assign(new Error('forbidden'), { status: 403 })
    await client.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(refused), retry: false })
    taskRecorded(client, 'report-1', 'davide', created)
    assert.equal(flat(client), undefined, 'no task, no fresh readFrom')
    assert.equal(client.getQueryState(key)?.status, 'error')
  })

  it('a legitimate Create shows through the fresh read it asks for, the list read once more and nothing sent again', async () => {
    const client = new QueryClient()
    let reads = 0
    const api = { tasks: [] as ProjectTask[] }
    const queryFn = () => {
      reads++
      return { tasks: [...api.tasks], next: null, readFrom: taskOrder() }
    }
    await client.fetchQuery({ queryKey: key, queryFn })
    api.tasks.push(created) // the Create commits
    taskRecorded(client, 'report-1', 'davide', created)
    assert.deepEqual(flat(client)?.tasks, [], 'not from the answer')
    await client.fetchQuery({ queryKey: key, queryFn, staleTime: 0 })
    assert.deepEqual(flat(client)?.tasks, [created])
    assert.equal(reads, 2)
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

// 4320180800 (C60's admissible case): each page is its own read, and a task finished between them is read open on the
// first and done on the next. The rows show it once, at its newest revision; an older copy read later doesn't undo it;
// and the origin is the last read's, never an older copy's.
describe('the project’s rows, one per task across its pages (4320180800)', () => {
  it('a task read open on page 1 and done on page 2 is one done row, where the done ones are', () => {
    const page1 = Array.from({ length: 50 }, (_, i) => task(100 - i))
    const done = { ...task(60), revision: 2, doneBy: A, doneAt: at(99) }
    const page2 = [task(50), task(49), done]
    const rows = onePerTask([...page1, ...page2])
    assert.equal(rows.length, 52)
    assert.equal(new Set(rows.map((t) => t.taskId)).size, 52)
    const row = rows.find((t) => t.taskId === id(60))
    assert.equal(row?.doneAt, at(99))
    assert.equal(rows.at(-1)?.taskId, id(60), 'among the done ones, after the open')
  })

  it('an older copy read later doesn’t take a done task back to open', () => {
    const done = { ...task(7), revision: 2, doneBy: A, doneAt: at(99) }
    const rows = onePerTask([done, task(7)])
    assert.deepEqual(
      rows.map((t) => [t.taskId, t.revision, t.doneAt]),
      [[id(7), 2, at(99)]],
    )
  })

  it('keeps the origin the last read gave: an older copy never brings back one redacted since', () => {
    const origin = { kind: 'report', label: 'Press plan' } as unknown as ProjectTask['from']
    const newer = { ...task(8), revision: 3, from: origin }
    const redacted = { ...task(8), revision: 2, from: null }
    const rows = onePerTask([newer, redacted])
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.revision, 3)
    assert.equal(rows[0]?.from, null)
  })
})
