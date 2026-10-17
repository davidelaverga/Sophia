import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InfiniteQueryObserver, QueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Goal } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import type { SearchHit, SearchPage } from '../../api/vision.ts'
import { closedDoor } from '../studio/project-door.ts'
import {
  around,
  hitRunning,
  hitSource,
  localHits,
  marked,
  readSearch,
  refusalSeen,
  searchOrder,
  searchRefusedKey,
  shownPages,
  type SearchRead,
} from './search-view.ts'

const words = { day: () => 'Oct 4', time: () => '15:00', today: () => false }

const hit = (kind: SearchHit['kind']): SearchHit => ({
  kind,
  id: 'h',
  title: 't',
  snippet: 's',
  meetingId: null,
  at: '2026-10-04T15:00:00.000Z',
  cite: { recordId: 'r' },
})

describe('where a hit is from', () => {
  it('names its kind and when, a recap with its time', () => {
    assert.equal(hitSource(hit('decision'), words), 'Decision · Oct 4')
    assert.equal(hitSource(hit('note'), words), 'Kept note · Oct 4')
    assert.equal(hitSource(hit('report'), words), 'Report · Oct 4')
    assert.equal(hitSource(hit('report_section'), words), 'Report section · Oct 4')
    assert.equal(hitSource(hit('recap'), words), 'Meeting recap · Oct 4, 15:00')
    assert.equal(hitSource(hit('message'), words), 'Message · Oct 4')
  })
})

describe('whether a recap hit’s meeting runs', () => {
  const running = { id: 'm1', endedAt: null }
  it('runs only when the latest meetings say it is the one running', () => {
    assert.equal(hitRunning('m1', [running]), true)
    assert.equal(hitRunning('m2', [running]), false)
    assert.equal(hitRunning('m1', [{ id: 'm1', endedAt: '2026-10-04T15:38:00.000Z' }]), false)
    assert.equal(hitRunning('m1', []), false)
  })

  it('is unknown until they are read', () => {
    assert.equal(hitRunning('m1', undefined), undefined)
  })
})

const goal = (id: string, title: string, over: Partial<Goal> = {}): Goal => ({
  id,
  projectId: 'p',
  title,
  revision: 1,
  authorityEpoch: 1,
  status: 'ready',
  outcome: `${title}, done`,
  criteria: [],
  stateRevision: 1,
  ...over,
})

/** A goal's health as a test says it: on track while running, else not started. */
const health = (g: Goal) => (g.status === 'running' ? 'On track' : 'Not started')

describe('goals and tasks in the search (docs/plans/search-goals.md)', () => {
  const goals = [
    goal('g1', 'Roll the onboarding out', { status: 'running' }),
    goal('g2', 'Keep teams through an admin change', {
      criteria: [{ id: 'c', description: 'The checklist opens on its first step', required: true, verification: 'v' }],
    }),
  ]
  const plans = {
    g1: { tasksFound: [{ id: 't1', purpose: 'Translate the checklist', doer: 'Marco’s Claude Code' }] },
  }

  it('finds a goal by its criterion and a task by its purpose, each labelled', () => {
    const hits = localHits(goals, plans, 'CHECKLIST', health)
    assert.deepEqual(
      hits.map((h) => [h.kind, h.id, h.title, h.source]),
      [
        ['goal', 'g2', 'Keep teams through an admin change', 'Goal · Not started'],
        ['task', 't1', 'Translate the checklist', 'Task · Marco’s Claude Code'],
      ],
    )
    assert.equal(hits[0]?.words, 'The checklist opens on its first step')
  })

  it('finds a task by who does it, and nothing under two letters', () => {
    assert.deepEqual(
      localHits(goals, plans, 'marco', health).map((h) => h.id),
      ['t1'],
    )
    assert.deepEqual(localHits(goals, plans, 'c', health), [])
  })

  it('carries a task’s doer, so its line can mark it (Codex P2 on #313)', () => {
    assert.equal(localHits(goals, plans, 'marco', health)[0]?.doer, 'Marco’s Claude Code')
  })

  it('says «Goal» alone while its health isn’t known: the notes unread (Codex P2 on #313)', () => {
    assert.equal(localHits(goals, plans, 'admin', () => null)[0]?.source, 'Goal')
  })

  it('keeps three of each at most', () => {
    const many = Array.from({ length: 5 }, (_, i) => goal(`m${String(i)}`, `Report ${String(i)}`))
    assert.equal(localHits(many, undefined, 'report', health).length, 3)
  })
})

describe('the words marked, and a long text cut around them', () => {
  it('marks every match whatever its case', () => {
    assert.deepEqual(marked('The Checklist and the checklist', 'checklist'), [
      { text: 'The ', mark: false },
      { text: 'Checklist', mark: true },
      { text: ' and the ', mark: false },
      { text: 'checklist', mark: true },
    ])
    assert.deepEqual(marked('Nothing here', 'checklist'), [{ text: 'Nothing here', mark: false }])
  })

  it('cuts a long text around the first match', () => {
    const long = `${'a '.repeat(100)}the checklist ${'b '.repeat(100)}`
    const cut = around(long, 'checklist', 80)
    assert.ok(cut.startsWith('…') && cut.endsWith('…'))
    assert.ok(cut.includes('the checklist'))
    assert.ok(cut.length <= 82)
    assert.equal(around('short text', 'text', 80), 'short text')
  })
})

describe('the pages the search may show (R-C4-SEARCH-READ-01)', () => {
  const read = (readFrom: number): SearchRead => ({ hits: [hit('message')], next: null, readFrom })

  it('shows pages when nothing was refused, and keeps them through an ordinary failure', () => {
    assert.equal(shownPages([read(10), read(11)], false, 0)?.length, 2)
    assert.equal(shownPages(undefined, false, 0), undefined)
  })

  it('shows nothing while this person’s own read is refused, cached or not', () => {
    assert.equal(shownPages([read(10)], true, 0), undefined)
    assert.equal(shownPages([read(30)], true, 20), undefined)
  })

  it('after a refusal, shows no page set out before it, nor any set with one', () => {
    assert.equal(shownPages([read(10)], false, 20), undefined)
    assert.equal(shownPages([read(20)], false, 20), undefined)
    assert.equal(shownPages([read(10), read(21)], false, 20), undefined)
  })

  it('shows again only pages all set out since the refusal', () => {
    assert.equal(shownPages([read(21), read(22)], false, 20)?.length, 2)
  })
})

const realNow = Date.now

describe('the search’s read and refusal order, with the clock moved back (R-C4-SEARCH-READ-01)', () => {
  it('keeps a page set out before a refusal hidden, though the clock went back between them', async () => {
    try {
      Date.now = () => 2000
      const before = await readSearch(() => Promise.resolve({ hits: [hit('message')], next: null }))
      Date.now = () => 1000
      const refusedAt = refusalSeen()
      assert.equal(shownPages([before], true, refusedAt), undefined, 'hidden while refused')
      assert.equal(shownPages([before], false, refusedAt), undefined, 'still hidden through a later ordinary failure')
      Date.now = () => 0
      const since = await readSearch(() => Promise.resolve({ hits: [hit('message')], next: null }))
      assert.equal(shownPages([since], false, refusedAt)?.length, 1, 'a page set out since shows')
    } finally {
      Date.now = realNow
    }
  })

  it('stamps a page when its read is set out, not when it answers', async () => {
    let answer: ((page: SearchPage) => void) | undefined
    const slow = readSearch(() => new Promise<SearchPage>((resolve) => (answer = resolve)))
    const refusedAt = refusalSeen()
    answer?.({ hits: [hit('message')], next: null })
    assert.ok((await slow).readFrom < refusedAt)
  })

  it('never moves a refusal kept back, and orders each call after every one before it', () => {
    const first = searchOrder()
    Date.now = () => 0
    try {
      assert.ok(searchOrder() > first)
      assert.equal(refusalSeen(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER)
    } finally {
      Date.now = realNow
    }
  })
})

type Answer = (cursor: string | null) => Promise<SearchPage>
/** The API's answer to a read refused (401, 403) or failing (503). */
const failing =
  (status: number): Answer =>
  () =>
    Promise.reject(new ApiError(status, status === 503 ? 'unavailable' : 'refused', 'No.', 'never'))

/**
 * The sheet's reads as TanStack keeps them: one account's query cache, the sheet's infinite query per project and
 * query (its key and options as SearchSheet's), and the refusal kept as SearchSheet's effect keeps it. Each answer is
 * given by the test.
 */
describe('the search through a refusal, in the account’s query cache (R-C4-SEARCH-READ-01)', () => {
  const PROJECT = 'p1'
  const pageOf = (word: string, next: string | null = null): SearchPage => ({
    hits: [{ ...hit('message'), id: word, title: word }],
    next,
  })
  const ok =
    (word: string): Answer =>
    (cursor) =>
      Promise.resolve(cursor ? pageOf(`${word} 2`) : pageOf(word, 'c2'))

  /** One sheet's query on an account's cache; `answer` is what the next read gets. */
  function sheetOn(client: QueryClient, q: string, project = PROJECT) {
    const reads = { answer: ok(q) }
    const observer = new InfiniteQueryObserver<SearchRead, Error, InfiniteData<SearchRead>, unknown[], string | null>(
      client,
      {
        queryKey: ['vision', 'search', project, q],
        queryFn: ({ pageParam }) => readSearch(() => reads.answer(pageParam)),
        initialPageParam: null,
        getNextPageParam: (last) => last.next,
        enabled: false,
        retry: false,
      },
    )
    const unsubscribe = observer.subscribe(() => undefined)
    /** What the sheet shows after a result: the refusal kept first, as its effect does. */
    const shown = () => {
      const result = observer.getCurrentResult()
      if (closedDoor(result.error)) client.setQueryData<number>(searchRefusedKey(project), refusalSeen)
      const refusedAt = client.getQueryData<number>(searchRefusedKey(project)) ?? 0
      return shownPages(result.data?.pages, result.isError && closedDoor(result.error), refusedAt)
    }
    const titles = () => shown()?.flatMap((p) => p.hits.map((h) => h.title))
    return { reads, observer, titles, unsubscribe }
  }

  it('403 on the next page: nothing read before shows, through a 503, the sheet again, another query; an allowed read since does', async () => {
    const client = new QueryClient()
    const sheet = sheetOn(client, 'heron')
    await sheet.observer.refetch()
    assert.deepEqual(sheet.titles(), ['heron'])
    sheet.reads.answer = failing(403)
    await sheet.observer.fetchNextPage()
    // TanStack still holds the page read before: only the fence keeps it off the sheet.
    assert.equal(sheet.observer.getCurrentResult().data?.pages.length, 1)
    assert.equal(sheet.titles(), undefined)
    sheet.reads.answer = failing(503)
    await sheet.observer.refetch()
    assert.equal(sheet.observer.getCurrentResult().isError, true)
    assert.equal(sheet.titles(), undefined, 'a later ordinary failure')
    sheet.unsubscribe()
    const again = sheetOn(client, 'heron')
    assert.equal(again.titles(), undefined, 'the sheet opened again over the cache')
    const other = sheetOn(client, 'egret')
    await other.observer.refetch()
    assert.deepEqual(other.titles(), ['egret'], 'another query read since shows')
    assert.equal(again.titles(), undefined, 'and unlocks nothing read before for this one')
    again.reads.answer = ok('heron now')
    await again.observer.refetch()
    assert.deepEqual(again.titles(), ['heron now'], 'an allowed read since: the current results')
    await again.observer.fetchNextPage()
    assert.deepEqual(again.titles(), ['heron now', 'heron now 2'])
  })

  it('401, then an older read answering late with 200: still hidden; the refusal is this account’s and project’s', async () => {
    const client = new QueryClient()
    const slow = sheetOn(client, 'heron')
    let answer: ((page: SearchPage) => void) | undefined
    slow.reads.answer = () => new Promise<SearchPage>((resolve) => (answer = resolve))
    const late = slow.observer.refetch()
    const refused = sheetOn(client, 'egret')
    refused.reads.answer = failing(401)
    await refused.observer.refetch()
    assert.equal(refused.titles(), undefined)
    answer?.(pageOf('heron'))
    await late
    assert.equal(slow.observer.getCurrentResult().isSuccess, true)
    assert.equal(slow.titles(), undefined, 'set out before the refusal, answered after it')
    // Another project of this account, and another account's cache, keep no refusal of this one.
    const elsewhere = sheetOn(client, 'heron', 'p2')
    await elsewhere.observer.refetch()
    assert.deepEqual(elsewhere.titles(), ['heron'])
    const otherAccount = new QueryClient()
    assert.equal(otherAccount.getQueryData(searchRefusedKey(PROJECT)), undefined)
    const theirs = sheetOn(otherAccount, 'heron')
    await theirs.observer.refetch()
    assert.deepEqual(theirs.titles(), ['heron'])
  })

  it('without a refusal, a failed next page keeps the pages read, and Try again reads afresh', async () => {
    const client = new QueryClient()
    const sheet = sheetOn(client, 'heron')
    await sheet.observer.refetch()
    sheet.reads.answer = failing(503)
    await sheet.observer.fetchNextPage()
    assert.equal(sheet.observer.getCurrentResult().isError, true)
    assert.deepEqual(sheet.titles(), ['heron'])
    assert.equal(client.getQueryData(searchRefusedKey(PROJECT)), undefined)
    sheet.reads.answer = ok('heron')
    await sheet.observer.fetchNextPage()
    assert.deepEqual(sheet.titles(), ['heron', 'heron 2'])
  })
})
