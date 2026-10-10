import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import type { ConversationList } from '../../api/conversations.ts'
import { listKey, messagesKey } from './conversation-list.ts'
import { keepWithdrawnPurged } from './withdrawn-purge.ts'

const AT = '2026-10-10T02:05:34.000Z'
const said = (seq: number, text: string) => ({
  author: 'member' as const,
  actorId: 'ana',
  name: 'Ana',
  text,
  at: AT,
  seq,
})
const row = (id: string, lastMessage: ReturnType<typeof said> | null) => ({ id, lastAt: AT, lastMessage })
const listOf = (...rows: ReturnType<typeof row>[]) =>
  ({ projectId: 'p', conversations: rows }) as unknown as ConversationList
/** A thread holding place 2 withdrawn (with words, where `withdrawn` is false) and place 3 said. */
const thread = (withdrawn: boolean) => ({
  pages: [
    {
      messages: [
        {
          id: 'm2',
          seq: 2,
          author: 'member',
          actorId: 'ana',
          at: AT,
          text: withdrawn ? null : 'Two.',
          withdrawn: withdrawn ? { at: AT } : null,
        },
        { id: 'm3', seq: 3, author: 'member', actorId: 'ana', at: AT, text: 'Three.', withdrawn: null },
      ],
      before: null,
    },
  ],
  pageParams: [null],
})

const LIST = listKey('p', 'ana')
const opening = (client: QueryClient, id: string, key: readonly unknown[] = LIST) =>
  client.getQueryData<ConversationList>(key)?.conversations.find((c) => c.id === id)?.lastMessage

function purging() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  keepWithdrawnPurged(client.getQueryCache())
  return client
}

describe('keepWithdrawnPurged: the list reads as cached hold no words their threads hold withdrawn (CC-0025)', () => {
  it('a list answer from before the withdrawal, landing after the thread’s read: purged in the cache as it lands', async () => {
    const client = purging()
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    await client.fetchQuery({ queryKey: LIST, queryFn: () => Promise.resolve(listOf(row('a', said(2, 'Two.')))) })
    assert.equal(opening(client, 'a'), null)
  })

  it('the thread’s read after the list’s: purged then', () => {
    const client = purging()
    client.setQueryData(LIST, listOf(row('a', said(2, 'Two.'))))
    client.setQueryData(messagesKey('a', 'ana'), thread(false))
    assert.equal(opening(client, 'a')?.text, 'Two.')
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    assert.equal(opening(client, 'a'), null)
  })

  it('a failing list read stays failing: its error, when it was answered and how often, as they were', async () => {
    const client = purging()
    await client.fetchQuery({ queryKey: LIST, queryFn: () => Promise.resolve(listOf(row('a', said(2, 'Two.')))) })
    const unavailable = new Error('The records can’t be read right now')
    await client.fetchQuery({ queryKey: LIST, queryFn: () => Promise.reject(unavailable) }).catch(() => undefined)
    const query = client.getQueryCache().find({ queryKey: LIST, exact: true })
    const before = { ...query?.state }
    assert.equal(before.status, 'error')
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    assert.equal(opening(client, 'a'), null)
    const after = query?.state
    assert.equal(after?.status, 'error')
    assert.equal(after?.error, unavailable)
    assert.equal(after?.dataUpdatedAt, before.dataUpdatedAt)
    assert.equal(after?.dataUpdateCount, before.dataUpdateCount)
    assert.equal(after?.errorUpdateCount, before.errorUpdateCount)
  })

  it('a list read put back as it was when its read set out (a cancel that reverts): purged again', async () => {
    const client = purging()
    client.setQueryData(LIST, listOf(row('a', said(2, 'Two.'))))
    void client.prefetchQuery({ queryKey: LIST, queryFn: () => new Promise<ConversationList>(() => undefined) })
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    assert.equal(opening(client, 'a'), null)
    await client.cancelQueries({ queryKey: LIST })
    assert.equal(opening(client, 'a'), null)
  })

  it('a visible opening, another conversation’s row, another reader’s list: as they were', () => {
    const client = purging()
    const ben = listKey('p', 'ben')
    client.setQueryData(ben, listOf(row('a', said(2, 'Two.'))))
    const mine = listOf(row('a', said(3, 'Three.')), row('b', said(2, 'Two, b’s own.')))
    client.setQueryData(LIST, mine)
    const count = client.getQueryCache().find({ queryKey: LIST, exact: true })?.state.dataUpdateCount
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    // Place 3 is said: the row is useful and stays; b's place 2 is b's own; Ben's list is Ben's.
    assert.equal(client.getQueryData(LIST), mine)
    assert.equal(client.getQueryCache().find({ queryKey: LIST, exact: true })?.state.dataUpdateCount, count)
    assert.equal(opening(client, 'a', ben)?.text, 'Two.')
  })

  it('kept once per cache, however often asked (a view mounted twice over)', () => {
    const client = new QueryClient()
    const cache = client.getQueryCache()
    keepWithdrawnPurged(cache)
    const listening = (cache as unknown as { listeners: Set<unknown> }).listeners.size
    keepWithdrawnPurged(cache)
    assert.equal((cache as unknown as { listeners: Set<unknown> }).listeners.size, listening)
  })
})
