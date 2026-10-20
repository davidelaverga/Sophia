import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InfiniteQueryObserver, notifyManager, QueryClient, type InfiniteData } from '@tanstack/react-query'
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
  searchPages,
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

  it('counts letters in code points, as the API does: one Deseret letter finds nothing, two find (4320173114)', () => {
    const deseret = [goal('d1', '\u{10428}\u{10429} plan')]
    assert.deepEqual(localHits(deseret, undefined, '\u{10428}', health), [])
    assert.deepEqual(
      localHits(deseret, undefined, '\u{10428}\u{10429}', health).map((h) => h.id),
      ['d1'],
    )
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

/**
 * R-C4-SEARCH-READ-01, the refusal's lifecycle: the sheet's own query function (searchPages), on real TanStack queries,
 * with every observer notification (what makes React render, and run its effects) held back. Nothing here reads a
 * refusal and records it: only the product's query function may. Each read takes and honours the query's AbortSignal.
 */
const LIFE = 'p1'
const held: (() => void)[] = []
const hold = () => notifyManager.setScheduler((run) => void held.push(run))
const release = () => {
  notifyManager.setScheduler((run) => setTimeout(run, 0))
  held.length = 0
}
const wordPage = (word: string, next: string | null = null): SearchPage => ({
  hits: [{ ...hit('message'), id: word, title: word }],
  next,
})
const refusal = (status: number) => new ApiError(status, status === 503 ? 'unavailable' : 'refused', 'No.', 'never')
type Answer2 = (q: string, cursor: string | null) => SearchPage | Promise<SearchPage> | Error
type Observer = InfiniteQueryObserver<SearchRead, Error, InfiniteData<SearchRead>, string[], string | null>

/** The search's server: each read answered as `answer` says, unless its signal ends first. */
function server(answer: Answer2 = () => wordPage('x')) {
  const s = {
    answer,
    signals: [] as AbortSignal[],
    read:
      (q: string) =>
      (cursor: string | null, signal: AbortSignal): Promise<SearchPage> => {
        s.signals.push(signal)
        return new Promise<SearchPage>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
          const a = s.answer(q, cursor)
          if (a instanceof Error) reject(a)
          else void Promise.resolve(a).then(resolve, reject)
        })
      },
  }
  return s
}

/** The sheet's query for `q`, as useSearch makes it (key, the product's query function, page params, no retry). */
function sheetQuery(client: QueryClient, s: ReturnType<typeof server>, q: string, project = LIFE) {
  const observer: Observer = new InfiniteQueryObserver(client, {
    queryKey: ['vision', 'search', project, q],
    queryFn: searchPages(project, s.read(q)),
    initialPageParam: null as string | null,
    getNextPageParam: (last: SearchRead) => last.next,
    retry: false,
  })
  const leave = observer.subscribe(() => undefined)
  return { observer, leave }
}

/** What the sheet would show for a query's result: read only; nothing recorded. */
function shownTitles(client: QueryClient, observer: Observer, project = LIFE) {
  const result = observer.getCurrentResult()
  const refusedAt = client.getQueryData<number>(searchRefusedKey(project)) ?? 0
  return shownPages(result.data?.pages, result.isError && closedDoor(result.error), refusedAt)?.flatMap((p) =>
    p.hits.map((h) => h.title),
  )
}

const markerOf = (client: QueryClient, project = LIFE) => client.getQueryData<number>(searchRefusedKey(project))

describe('a settled refusal is kept when nothing renders it (R-C4-SEARCH-READ-01)', () => {
  it('q1’s 403 settles, the sheet leaves before rendering it; q2’s cached pages stay hidden through 503 and a remount', async () => {
    const client = new QueryClient()
    const s = server((q, cursor) => (cursor ? wordPage(`${q} 2`) : wordPage(q, 'c2')))
    hold()
    try {
      const q2 = sheetQuery(client, s, 'egret')
      await q2.observer.refetch()
      q2.leave()
      const q1 = sheetQuery(client, s, 'heron')
      await q1.observer.refetch()
      s.answer = () => refusal(403)
      // The next page is refused: settled in the cache, its notification held, so no render and no effect.
      await q1.observer.fetchNextPage()
      assert.equal(client.getQueryState(['vision', 'search', LIFE, 'heron'])?.status, 'error', 'the 403 settled')
      q1.leave()
      // The sheet opened again on q2: its cached pages, read before the refusal, through a later 503.
      s.answer = () => refusal(503)
      const again = sheetQuery(client, s, 'egret')
      assert.equal(shownTitles(client, again.observer), undefined, 'cached, before the refusal: hidden at once')
      await again.observer.refetch()
      assert.equal(again.observer.getCurrentResult().isError, true)
      assert.equal(shownTitles(client, again.observer), undefined, 'through a later 503')
      assert.ok(
        (markerOf(client) ?? 0) > 0,
        'the refusal is kept in the account’s cache for its project, though nothing rendered it',
      )
      // An allowed read begun since: its own pages.
      s.answer = (q) => wordPage(`${q} now`)
      await again.observer.refetch()
      assert.deepEqual(shownTitles(client, again.observer), ['egret now'])
      again.leave()
      assert.ok(s.signals.length >= 5, 'each read took its signal')
    } finally {
      release()
    }
  })

  it('a read of the account left, refused after another account signed in, is kept in the account left only', async () => {
    const left = new QueryClient()
    const later: { refuse?: (e: Error) => void } = {}
    const s = server(() => new Promise<SearchPage>((_resolve, reject) => (later.refuse = reject)))
    hold()
    try {
      const old = sheetQuery(left, s, 'heron')
      const pending = old.observer.refetch()
      // Another account signs in: its own cache, its own sheet.
      const now = new QueryClient()
      const theirs = sheetQuery(now, server(), 'heron')
      await theirs.observer.refetch()
      later.refuse?.(refusal(401))
      await pending
      assert.ok((markerOf(left) ?? 0) > 0, 'kept for the account whose read it was')
      assert.equal(markerOf(now), undefined, 'the account now signed in keeps none')
      assert.deepEqual(shownTitles(now, theirs.observer), ['x'])
      assert.equal(markerOf(left, 'p2'), undefined, 'nor another project of the account left')
      old.leave()
      theirs.leave()
    } finally {
      release()
    }
  })

  it('an ordinary 503 keeps nothing; a read still pending when the sheet leaves is cancelled by its signal, not a refusal', async () => {
    const client = new QueryClient()
    const s = server(() => refusal(503))
    const failed = sheetQuery(client, s, 'heron')
    await failed.observer.refetch()
    assert.equal(failed.observer.getCurrentResult().isError, true)
    assert.equal(markerOf(client), undefined, 'a 503 is no refusal')
    failed.leave()
    s.answer = () => new Promise<SearchPage>(() => undefined)
    const pending = sheetQuery(client, s, 'egret')
    const fetching = pending.observer.refetch()
    pending.leave()
    await fetching
    assert.equal(s.signals.at(-1)?.aborted, true, 'the last observer left: TanStack cancelled the read by its signal')
    assert.equal(markerOf(client), undefined, 'a cancelled read records no refusal')
  })
})
