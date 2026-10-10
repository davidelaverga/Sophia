import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import type { ConversationList, ConversationSummary } from '../../api/conversations.ts'
import { LISTS, coverageWords, listKey, listWithdrawn, withLastMessage } from './conversation-list.ts'
import { setListsData } from './list-data.ts'

const listOf = (title: string) =>
  ({ projectId: 'p', conversations: [{ id: 'a', title }], more: false }) as unknown as ConversationList

/** A row read at `seq`, its summary covering 1 to 1 with `newer` after it, as the API says one. */
const assessedAt = (seq: number, newer: number) =>
  ({
    id: 'a',
    messageSeq: seq,
    lastAt: '2026-10-07T10:00:00.000Z',
    contributors: [],
    lastMessage: null,
    summaryCoverage: {
      state: newer > 0 ? 'stale' : 'current',
      complete: true,
      fromSeq: 1,
      throughSeq: 1,
      newer,
      generatedAt: '2026-10-07T10:00:00.000Z',
      replyId: null,
      eligibilityRevision: 1,
      ledgerRevision: 1,
    },
    questionsCoverage: {
      state: 'not_assessed',
      complete: false,
      fromSeq: null,
      throughSeq: null,
      newer: 0,
      generatedAt: null,
      replyId: null,
      eligibilityRevision: null,
      ledgerRevision: null,
    },
  }) as unknown as ConversationSummary

/** A list read answering with that row. */
const answer = (row: ConversationSummary) =>
  ({ projectId: 'p', conversations: [row], more: false }) as unknown as ConversationList

const summaryWords = (client: QueryClient, key: readonly unknown[]) => {
  const c = client.getQueryData<ConversationList>(key)?.conversations[0]
  return c ? coverageWords(c.summaryCoverage) : 'no row'
}

describe('setListsData: what this view writes into a list read, and nothing of its state (r4237298620)', () => {
  it('a failing list read takes the write and stays failing: its error, when and how often, as they were', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = listKey('p', 'ana')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(listOf('Before')) })
    const unavailable = new Error('The records can’t be read right now')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(unavailable) }).catch(() => undefined)
    const query = client.getQueryCache().find({ queryKey: key, exact: true })
    const before = { ...query?.state }
    setListsData(
      client,
      LISTS,
      (list) => ({ ...list, conversations: [{ ...list.conversations[0], title: 'After' }] }) as ConversationList,
    )
    assert.equal(client.getQueryData<ConversationList>(key)?.conversations[0]?.title, 'After')
    assert.equal(query?.state.status, 'error')
    assert.equal(query?.state.error, unavailable)
    assert.equal(query?.state.dataUpdatedAt, before.dataUpdatedAt)
    assert.equal(query?.state.dataUpdateCount, before.dataUpdateCount)
    assert.equal(query?.state.errorUpdateCount, before.errorUpdateCount)
  })

  it('only the reads under the key, only those holding data, and one left as it was is not touched', () => {
    const client = new QueryClient()
    const mine = listKey('p', 'ana')
    const theirs = ['other', 'p', 'ana']
    client.setQueryData(mine, listOf('Mine'))
    client.setQueryData(theirs, listOf('Theirs'))
    const count = client.getQueryCache().find({ queryKey: mine, exact: true })?.state.dataUpdateCount
    setListsData(client, LISTS, (list) => list)
    assert.equal(client.getQueryCache().find({ queryKey: mine, exact: true })?.state.dataUpdateCount, count)
    setListsData(client, mine, () => listOf('Changed'))
    assert.equal(client.getQueryData<ConversationList>(mine)?.conversations[0]?.title, 'Changed')
    assert.equal(client.getQueryData<ConversationList>(theirs)?.conversations[0]?.title, 'Theirs')
    // A list key with no read yet is not created.
    setListsData(client, listKey('q', 'ana'), () => listOf('Made up'))
    assert.equal(client.getQueryData(listKey('q', 'ana')), undefined)
  })

  it('a count left unknown by a receipt is the list read’s again once it is read (r4237385090)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = listKey('p', 'ana')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(answer(assessedAt(1, 0))) })
    const mine = {
      author: 'member' as const,
      actorId: 'ana',
      name: 'Ana',
      text: 'Three.',
      at: '2026-10-07T10:05:00.000Z',
    }
    setListsData(client, LISTS, (list) => ({
      ...list,
      conversations: withLastMessage(list.conversations, 'a', { ...mine, seq: 3 }),
    }))
    assert.equal(summaryWords(client, key), 'Covers messages 1–1; newer messages since.')
    // Read again: the API counts the eligible messages after its range (place 2 and yours), and that is what is said.
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(answer(assessedAt(3, 2))), staleTime: 0 })
    assert.equal(summaryWords(client, key), 'Covers messages 1–1; 2 newer since.')
  })

  it('out of date after a withdrawal: only a list read says current again, and it does (CX-0036)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = listKey('p', 'ana')
    // Read at place 2: the summary through 1, place 2 counted newer. Place 2 is then withdrawn, nothing newer shown.
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(answer(assessedAt(2, 1))) })
    const remains = {
      writer: null,
      writerStays: false,
      writerName: null,
      writerIsReader: false,
      sophiaStays: false,
      seq: 2,
      newestShown: 1,
    }
    setListsData(client, LISTS, (list) => listWithdrawn(list, 'a', remains) ?? list)
    assert.equal(summaryWords(client, key), 'Covers messages 1–1; it may be out of date.')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(answer(assessedAt(2, 0))), staleTime: 0 })
    assert.equal(summaryWords(client, key), 'Covers messages 1–1.')
  })
})
