import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import type { ConversationList, ConversationMessage } from '../../api/conversations.ts'
import { listKey, messagesKey } from './conversation-list.ts'
import { keepWithdrawnPurged, listReadSetsOut, type ListRead } from './withdrawn-purge.ts'

const AT = '2026-10-10T02:05:34.000Z'
const LATER = '2026-10-10T02:05:35.000Z'
const said = (seq: number, text: string, actorId = 'ana') => ({
  author: 'member' as const,
  actorId,
  name: actorId,
  text,
  at: AT,
  seq,
})
const NOT_ASSESSED = {
  state: 'not_assessed',
  complete: false,
  fromSeq: null,
  throughSeq: null,
  newer: 0,
  generatedAt: null,
  replyId: null,
  eligibilityRevision: null,
  ledgerRevision: null,
} as const
const row = (id: string, lastMessage: ReturnType<typeof said> | null, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  revision: 3,
  summary: null,
  summaryCoverage: NOT_ASSESSED,
  lastAt: AT,
  contributors: [{ actorId: 'ana', name: 'ana' }],
  sophia: false,
  openQuestions: 0,
  questionsCoverage: NOT_ASSESSED,
  output: null,
  messageSeq: 3,
  lastMessage,
  ...over,
})
const listOf = (readFrom: number | undefined, ...rows: ReturnType<typeof row>[]) =>
  ({ projectId: 'p', conversations: rows, ...(readFrom === undefined ? {} : { readFrom }) }) as unknown as ListRead

const message = (seq: number, over: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: `m${String(seq)}`,
  seq,
  author: 'member',
  actorId: 'ana',
  name: 'ana',
  text: `Seq ${String(seq)}.`,
  at: AT,
  withdrawn: null,
  ask: null,
  replyTo: null,
  ...over,
})
const gone = (seq: number, over: Partial<ConversationMessage> = {}) =>
  message(seq, { text: null, name: null, withdrawn: { at: LATER }, ...over })
const pages = (...messages: ConversationMessage[]) => ({ pages: [{ messages, before: null }], pageParams: [null] })
/** A thread holding place 2 withdrawn (with words, where `withdrawn` is false) and place 3 said. */
const thread = (withdrawn: boolean) => pages(withdrawn ? gone(2) : message(2), message(3))

const LIST = listKey('p', 'ana')
const rowOf = (client: QueryClient, id: string, key: readonly unknown[] = LIST) =>
  client.getQueryData<ConversationList>(key)?.conversations.find((c) => c.id === id)
const opening = (client: QueryClient, id: string, key: readonly unknown[] = LIST) => rowOf(client, id, key)?.lastMessage

function purging() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  keepWithdrawnPurged(client.getQueryCache())
  return client
}

describe('keepWithdrawnPurged: the list reads as cached hold no words their threads hold withdrawn (CC-0025)', () => {
  it('a list answer from before the withdrawal, landing after the thread’s read: purged in the cache as it lands', async () => {
    const client = purging()
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    await client.fetchQuery({ queryKey: LIST, queryFn: () => Promise.resolve(listOf(0, row('a', said(2, 'Two.')))) })
    assert.equal(opening(client, 'a'), null)
  })

  it('a writer who stays, unnamed by a row read before they first wrote: named by the purge; the reader at the cap too (r4237494296)', () => {
    // The reader's account is their token's subject (here in upper case); the API keeps the actor in lower case.
    const reader = 'f0a1b2c3-d4e5-4f60-8a7b-9c0d1e2f3a4b'
    const account = reader.toUpperCase()
    const key = listKey('p', account)
    const theirs = (seq: number) => message(seq, { actorId: reader, name: 'Ana' })
    const full = Array.from({ length: 200 }, (_, i) => ({ actorId: `p${String(i)}`, name: `P${String(i)}` }))
    const client = purging()
    // The list read sets out before she first wrote; her place 1 stays, her place 2 is then withdrawn.
    const read = listOf(listReadSetsOut(), row('a', null, { contributors: full }), row('b', null, { contributors: [] }))
    client.setQueryData(key, read)
    for (const id of ['a', 'b']) client.setQueryData(messagesKey(id, account), pages(theirs(1), theirs(2)))
    for (const id of ['a', 'b']) {
      client.setQueryData(messagesKey(id, account), pages(theirs(1), gone(2, { actorId: reader })))
    }
    // At the cap, she reads here: the last place kept, the rest unnamed.
    const a = rowOf(client, 'a', key)
    assert.equal(a?.contributors.length, 200)
    assert.deepEqual(a?.contributors.at(-1), { actorId: reader, name: 'Ana' })
    assert.ok(a && 'othersUnnamed' in a && a.othersUnnamed === true)
    // With room: named.
    assert.deepEqual(
      rowOf(client, 'b', key)?.contributors.map(({ actorId, name }) => ({ actorId, name })),
      [{ actorId: reader, name: 'Ana' }],
    )
  })

  it('an account kept under a name, not a subject, is no actor: nobody named is taken out for a writer at the cap', () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ actorId: `p${String(i)}`, name: `P${String(i)}` }))
    const client = purging()
    client.setQueryData(LIST, listOf(listReadSetsOut(), row('a', null, { contributors: full })))
    client.setQueryData(messagesKey('a', 'ana'), pages(message(1), message(2)))
    client.setQueryData(messagesKey('a', 'ana'), pages(message(1), gone(2)))
    const a = rowOf(client, 'a')
    assert.deepEqual(a?.contributors, full)
    assert.ok(a && 'othersUnnamed' in a && a.othersUnnamed === true)
  })

  it('the thread’s read after the list’s: purged then', () => {
    const client = purging()
    client.setQueryData(LIST, listOf(listReadSetsOut(), row('a', said(2, 'Two.'))))
    client.setQueryData(messagesKey('a', 'ana'), thread(false))
    assert.equal(opening(client, 'a')?.text, 'Two.')
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    assert.equal(opening(client, 'a'), null)
  })

  it('a failing list read stays failing: its error, when it was answered and how often, as they were', async () => {
    const client = purging()
    await client.fetchQuery({ queryKey: LIST, queryFn: () => Promise.resolve(listOf(0, row('a', said(2, 'Two.')))) })
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
    client.setQueryData(LIST, listOf(0, row('a', said(2, 'Two.'))))
    void client.prefetchQuery({ queryKey: LIST, queryFn: () => new Promise<ConversationList>(() => undefined) })
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    assert.equal(opening(client, 'a'), null)
    await client.cancelQueries({ queryKey: LIST })
    assert.equal(opening(client, 'a'), null)
  })

  it('a visible opening, another conversation’s row, another reader’s list: as they were', () => {
    const client = purging()
    const ben = listKey('p', 'ben')
    client.setQueryData(ben, listOf(0, row('a', said(2, 'Two.'))))
    const mine = listOf(listReadSetsOut(), row('a', said(3, 'Three.')), row('b', said(2, 'Two, b’s own.')))
    client.setQueryData(LIST, mine)
    client.setQueryData(messagesKey('a', 'ana'), pages(message(2), message(3)))
    const count = client.getQueryCache().find({ queryKey: LIST, exact: true })?.state.dataUpdateCount
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    // Place 3 is said, and Ana's words with it: the row is useful and stays; b's place 2 is b's own; Ben's list is Ben's.
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

describe('keepWithdrawnPurged: who wrote there and Sophia’s part, from a list read that may not know (r4236040713)', () => {
  /** Bo's only message (place 4) and Sophia's answer to it (place 5), then both withdrawn; Ana's place 3 said. */
  const said4 = pages(
    message(3),
    message(4, { actorId: 'bo', name: 'bo' }),
    message(5, { author: 'sophia', actorId: null }),
  )
  const gone4 = pages(message(3), gone(4, { actorId: 'bo' }), gone(5, { author: 'sophia', actorId: null }))
  const both = {
    contributors: [
      { actorId: 'ana', name: 'ana' },
      { actorId: 'bo', name: 'bo' },
    ],
    sophia: true,
  }

  it('a list read under way as the thread saw Bo’s only message withdrawn: Bo and Sophia’s part go, Ana stays', () => {
    const client = purging()
    client.setQueryData(messagesKey('a', 'ana'), said4)
    // The list's read sets out, then the thread is read again and holds the withdrawal; the list answers after.
    const readFrom = listReadSetsOut()
    client.setQueryData(messagesKey('a', 'ana'), gone4)
    client.setQueryData(LIST, listOf(readFrom, row('a', said(5, 'Sophia: Five.'), both)))
    const a = rowOf(client, 'a')
    assert.deepEqual(
      a?.contributors.map((p) => p.actorId),
      ['ana'],
    )
    assert.equal(a?.sophia, false)
    assert.equal(a?.lastMessage, null)
  })

  it('a list read that set out after the thread saw it: as the API says it (a writer with words on pages not read)', () => {
    const client = purging()
    client.setQueryData(messagesKey('a', 'ana'), said4)
    client.setQueryData(messagesKey('a', 'ana'), gone4)
    // Read since: the API lists Bo (words older than the pages read here) and Sophia's older answer.
    const current = listOf(listReadSetsOut(), row('a', said(3, 'Seq 3.'), both))
    client.setQueryData(LIST, current)
    assert.equal(client.getQueryData(LIST), current)
  })

  it('a withdrawal older than a message the row knows of was known to its read: as it says', () => {
    const client = purging()
    client.setQueryData(messagesKey('a', 'ana'), said4)
    const readFrom = listReadSetsOut()
    client.setQueryData(messagesKey('a', 'ana'), gone4)
    // The row's last activity is after the withdrawal: the read that knew that message knew the withdrawal too.
    const knew = listOf(readFrom, row('a', said(3, 'Seq 3.'), { ...both, lastAt: '2026-10-10T02:06:00.000Z' }))
    client.setQueryData(LIST, knew)
    assert.equal(client.getQueryData(LIST), knew)
  })

  it('a writer whose words the pages read still show stays; their withdrawn one goes from the opening only', () => {
    const client = purging()
    client.setQueryData(messagesKey('a', 'ana'), thread(false))
    const readFrom = listReadSetsOut()
    client.setQueryData(messagesKey('a', 'ana'), thread(true))
    client.setQueryData(LIST, listOf(readFrom, row('a', said(2, 'Two.'))))
    const a = rowOf(client, 'a')
    assert.deepEqual(
      a?.contributors.map((p) => p.actorId),
      ['ana'],
    )
    assert.equal(a?.lastMessage, null)
  })
})
