import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import type { ConversationList } from '../../api/conversations.ts'
import { LISTS, listKey } from './conversation-list.ts'
import { setListsData } from './list-data.ts'

const listOf = (title: string) =>
  ({ projectId: 'p', conversations: [{ id: 'a', title }], more: false }) as unknown as ConversationList

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
})
