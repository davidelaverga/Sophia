import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query'
import type { ConversationMessage, ConversationStarted } from '../../api/conversations.ts'
import { listKey, messagesKey, withMessage, type ThreadHeld } from './conversation-list.ts'
import { dropUnfollowed, readAtOf } from './followed-thread.ts'
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

  it('a start’s thread is as read where the feed stood as it landed; a sent message keeps where it was read', () => {
    const client = new QueryClient()
    const receipt = {
      conversation: { id: 'b', title: 'Started' },
      message: said(1, 'First.'),
      reply: null,
    } as unknown as ConversationStarted
    putStarted(client, 'p', 'ana', receipt, '6')
    const b = messagesKey('b', 'ana')
    assert.equal(readAtOf(client.getQueryData<ThreadHeld>(b)), '6')
    assert.deepEqual(opened(client, b, '6').words, ['First.'])
    const sent = withMessage(threadA('5'), said(4, 'Four.'))
    assert.equal(readAtOf(sent), '5')
  })
})
