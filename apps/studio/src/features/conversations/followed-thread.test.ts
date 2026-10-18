import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import type { ConversationMessage, ConversationStarted } from '../../api/conversations.ts'
import { listKey, messagesKey, withMessage, type ThreadHeld } from './conversation-list.ts'
import { dropUnfollowed, readAtOf, readFromOf, shows } from './followed-thread.ts'
import { putStarted } from './list-data.ts'

const AT = '2026-10-10T13:55:00.000Z'
const said = (seq: number, text: string, actorId = 'ana'): ConversationMessage => ({
  id: `m${String(seq)}`,
  seq,
  author: 'member',
  actorId,
  name: actorId,
  text,
  at: AT,
  withdrawn: null,
  ask: null,
  replyTo: null,
})
/** A's thread as read where the feed stood at `readAt` (none: where that wasn't known): B1, C2, A3. */
const threadA = (readAt?: string) => ({
  pages: [
    {
      messages: [said(1, 'B one.', 'bo'), said(2, 'Words C withdrew since.', 'cy'), said(3, 'A three.')],
      before: null,
      ...(readAt === undefined ? {} : { readAt }),
    },
  ],
  pageParams: [null],
})
/** The thread read as `useTranscript` opens it: the step it takes first, then what its read shows before any answer. */
const opened = (client: QueryClient, key: readonly unknown[], cursor: string | undefined) => {
  const dropped = dropUnfollowed(client, key, cursor)
  const observer = new InfiniteQueryObserver(client, {
    queryKey: key,
    queryFn: () => new Promise<never>(() => undefined),
    initialPageParam: null as string | null,
    getNextPageParam: () => null,
    retry: false,
  })
  const shown = observer.getCurrentResult().data as ThreadHeld
  return { dropped, words: (shown?.pages ?? []).flatMap((p) => p.messages).map((m) => m.text) }
}
/** A view showing the thread now: its read observed (the open conversation). */
const showing = (client: QueryClient, key: readonly unknown[]) =>
  new InfiniteQueryObserver(client, {
    queryKey: key,
    queryFn: () => new Promise<never>(() => undefined),
    initialPageParam: null as string | null,
    getNextPageParam: () => null,
    enabled: false,
  }).subscribe(() => undefined)

describe('a thread read no view followed as the feed moved is never shown as it was (PR #199 r4237833438)', () => {
  it('A read at 5, B open as the feed moved to 6 (C2 withdrawn elsewhere): A opens with nothing of its old read', () => {
    const client = new QueryClient()
    const a = messagesKey('a', 'ana')
    client.setQueryData(a, threadA('5'))
    const { dropped, words } = opened(client, a, '6')
    assert.equal(dropped, true)
    assert.deepEqual(words, [])
    assert.equal(client.getQueryCache().find({ queryKey: a, exact: true })?.state.data, undefined)
  })

  it('a read whose feed position wasn’t known (none noted) is let go once the feed’s is', () => {
    const client = new QueryClient()
    const a = messagesKey('a', 'ana')
    client.setQueryData(a, threadA())
    assert.deepEqual(opened(client, a, '6').words, [])
  })

  it('read where the feed stands now: shown at once, as read (control)', () => {
    const client = new QueryClient()
    const a = messagesKey('a', 'ana')
    client.setQueryData(a, threadA('6'))
    const { dropped, words } = opened(client, a, '6')
    assert.equal(dropped, false)
    assert.deepEqual(words, ['B one.', 'Words C withdrew since.', 'A three.'])
  })

  it('a thread a view shows now is left to it (it reads again as the feed moves): never let go (control)', () => {
    const client = new QueryClient()
    const a = messagesKey('a', 'ana')
    client.setQueryData(a, threadA('5'))
    const stop = showing(client, a)
    assert.equal(dropUnfollowed(client, a, '6'), false)
    assert.notEqual(client.getQueryData(a), undefined)
    stop()
  })

  it('only that thread goes: another conversation’s, another reader’s, and the list reads stay (control)', () => {
    const client = new QueryClient()
    const a = messagesKey('a', 'ana')
    client.setQueryData(a, threadA('5'))
    client.setQueryData(messagesKey('b', 'ana'), threadA('5'))
    client.setQueryData(messagesKey('a', 'bea'), threadA('5'))
    client.setQueryData(listKey('p', 'ana'), { projectId: 'p', conversations: [], more: false })
    opened(client, a, '6')
    assert.notEqual(client.getQueryData(messagesKey('b', 'ana')), undefined)
    assert.notEqual(client.getQueryData(messagesKey('a', 'bea')), undefined)
    assert.notEqual(client.getQueryData(listKey('p', 'ana')), undefined)
  })

  it('a sent message keeps where its thread was read', () => {
    assert.equal(readAtOf(withMessage(threadA('5'), said(4, 'Four.'))), '5')
  })

  it('positions compare as numbers: read at 10 is current at 9, read at 9 is not at 10', () => {
    const client = new QueryClient()
    const a = messagesKey('a', 'ana')
    client.setQueryData(a, threadA('10'))
    assert.equal(opened(client, a, '9').dropped, false)
    client.clear()
    client.setQueryData(a, threadA('9'))
    assert.equal(opened(client, a, '10').dropped, true)
    client.clear()
    client.setQueryData(a, threadA('not a position'))
    assert.equal(opened(client, a, '10').dropped, true)
  })
})

describe('a start’s receipt: stamped where it is current, written only where the page’s feed is not past it (PR #199 r4237924424)', () => {
  /** A receipt current at feed position 6, holding its first message as it was then. */
  const startedAt = (cursor: string) =>
    ({
      conversation: { id: 'b', title: 'Started' },
      message: said(1, 'Words withdrawn after the start.'),
      reply: null,
      cursor,
    }) as unknown as ConversationStarted
  const b = messagesKey('b', 'ana')
  const wordsHeld = (client: QueryClient) =>
    (client.getQueryData<ThreadHeld>(b)?.pages ?? []).flatMap((p) => p.messages).map((m) => m.text)

  it('stamped with its own cursor, never the page’s', () => {
    const client = new QueryClient()
    putStarted(client, 'p', 'ana', startedAt('6'), '5')
    assert.equal(readAtOf(client.getQueryData<ThreadHeld>(b)), '6')
  })

  it('the page’s feed already past it (withdrawn at 7 before it landed): nothing is written, and opening reads', () => {
    const client = new QueryClient()
    putStarted(client, 'p', 'ana', startedAt('6'), '7')
    assert.equal(client.getQueryData(b), undefined)
    assert.deepEqual(opened(client, b, '7').words, [])
  })

  it('opened from the list while the start was on its way, its read failing; the receipt lands late: nothing goes in', () => {
    const client = new QueryClient()
    const stop = showing(client, b)
    putStarted(client, 'p', 'ana', startedAt('6'), '7')
    assert.equal(client.getQueryData(b), undefined)
    stop()
  })

  it('a read that failed meanwhile (404, erased), the page’s feed lagging at the receipt: never written over', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await client
      .fetchInfiniteQuery({
        queryKey: b,
        queryFn: () => Promise.reject(new Error('404')),
        initialPageParam: null as string | null,
      })
      .catch(() => undefined)
    putStarted(client, 'p', 'ana', startedAt('6'), '6')
    const state = client.getQueryCache().find({ queryKey: b, exact: true })?.state
    assert.equal(state?.status, 'error')
    assert.equal(state?.data, undefined)
  })

  it('a read under way meanwhile is left to answer: nothing written into it', () => {
    const client = new QueryClient()
    void client.prefetchInfiniteQuery({
      queryKey: b,
      queryFn: () => new Promise<never>(() => undefined),
      initialPageParam: null as string | null,
    })
    putStarted(client, 'p', 'ana', startedAt('6'), '6')
    assert.equal(client.getQueryData(b), undefined)
  })

  it('a read made meanwhile is never overwritten by the receipt', () => {
    const client = new QueryClient()
    client.setQueryData(b, {
      pages: [{ messages: [said(1, 'As read meanwhile.')], before: null, readAt: '9' }],
      pageParams: [null],
    })
    putStarted(client, 'p', 'ana', startedAt('6'), '6')
    assert.deepEqual(wordsHeld(client), ['As read meanwhile.'])
  })

  it('a page whose feed position isn’t known: nothing is written', () => {
    const client = new QueryClient()
    putStarted(client, 'p', 'ana', startedAt('6'), undefined)
    assert.equal(client.getQueryData(b), undefined)
  })

  it('written at its own start, the feed past it by the time it opens (withdrawn after): never shown', () => {
    const client = new QueryClient()
    putStarted(client, 'p', 'ana', startedAt('6'), '6')
    const { dropped, words } = opened(client, b, '7')
    assert.equal(dropped, true)
    assert.deepEqual(words, [])
  })

  it('its own start the only move: the first message shows at once (r4237890625)', () => {
    const client = new QueryClient()
    putStarted(client, 'p', 'ana', startedAt('6'), '6')
    assert.deepEqual(opened(client, b, '6').words, ['Words withdrawn after the start.'])
  })

  it('a page whose feed hasn’t caught up with its own start yet: the first message shows at once', () => {
    const client = new QueryClient()
    putStarted(client, 'p', 'ana', startedAt('6'), '5')
    assert.deepEqual(opened(client, b, '5').words, ['Words withdrawn after the start.'])
  })
})

/** A thread read of pages, newest first, each with its messages' ids and what its read noted. */
const pagesOf = (...pages: { ids: string[]; extra: object }[]) => ({
  pages: pages.map((p) => ({ messages: p.ids.map((id) => ({ id })), before: null, ...p.extra })),
  pageParams: pages.map(() => null),
})

describe('where the read of the page holding a message set out, in this view’s order (PR #199 r4238594445, r4238633935)', () => {
  it('each page notes its own: an older page read since is fresher than a newest page cached from before', () => {
    const held = pagesOf({ ids: ['m9'], extra: { readFrom: 5, readAt: '6' } }, { ids: ['b1'], extra: { readFrom: 9 } })
    assert.equal(readFromOf(held as unknown as ThreadHeld, 'b1'), 9)
    assert.equal(readFromOf(held as unknown as ThreadHeld, 'm9'), 5)
  })

  it('a page not noted (written here), a message no page holds, or no read: as if read before all', () => {
    const held = pagesOf({ ids: ['b1'], extra: { readAt: '6' } })
    assert.equal(readFromOf(held as unknown as ThreadHeld, 'b1'), 0)
    assert.equal(readFromOf(held as unknown as ThreadHeld, 'b2'), 0)
    assert.equal(readFromOf(held as unknown as ThreadHeld, null), 0)
    assert.equal(readFromOf(undefined, 'b1'), 0)
  })
})

describe('shows: a thread whose read within the project was refused shows only what a read since brought (CX-0074)', () => {
  const at = (...froms: (number | undefined)[]) =>
    pagesOf(
      ...froms.map((f) => ({ ids: ['m1'], extra: f === undefined ? {} : { readFrom: f } })),
    ) as unknown as ThreadHeld

  it('never refused: shown, cached or not', () => {
    assert.equal(shows(at(3), undefined), true)
    assert.equal(shows(undefined, undefined), true)
  })

  it('refused at 5: a newest page read from before, or when, or not noted, or none, shows nothing', () => {
    assert.equal(shows(at(4), 5), false)
    assert.equal(shows(at(5), 5), false)
    assert.equal(shows(at(undefined), 5), false)
    assert.equal(shows(undefined, 5), false)
  })

  it('a newest page read since shows; an older page read since does not stand for the newest', () => {
    assert.equal(shows(at(6), 5), true)
    assert.equal(shows(at(4, 9), 5), false)
  })
})
