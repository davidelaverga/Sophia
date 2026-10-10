import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import type { ConversationList, ConversationStarted, ConversationSummary } from '../../api/conversations.ts'
import { LISTS, coverageWords, listKey, listWithdrawn, messagesKey, withLastMessage } from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'
import { landed, putStarted, released, releasing, setListsData, startHeld } from './list-data.ts'
import {
  NO_WORDS,
  changeKept,
  currentGeneration,
  forgetKept,
  keptAt,
  keptFor,
  withErasure,
  withoutConversation,
} from './talk-store.ts'

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
      writerPlaces: [],
      firsts: new Map<string, number>(),
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

/** A start's receipt for conversation `id`, its first message `${id}1`. */
const started = (id: string) =>
  ({
    conversation: { id, title: 'Started' },
    message: { id: `${id}1`, seq: 1, text: 'First.' },
    reply: null,
    cursor: '1',
  }) as unknown as ConversationStarted
const ids = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryData<ConversationList>(key)?.conversations.map((c) => c.id)

describe('putStarted: a start writes its row and its first message, and nothing of the list read’s state (PR #199 r4237767985)', () => {
  it('a failing list read takes the new row and stays failing: its error, when and how often, as they were', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = listKey('p', 'ana')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(listOf('Before')) })
    const unavailable = new Error('The records can’t be read right now')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(unavailable) }).catch(() => undefined)
    const query = client.getQueryCache().find({ queryKey: key, exact: true })
    const before = { ...query?.state }
    putStarted(client, 'p', 'ana', started('b'), '1')
    assert.deepEqual(ids(client, key), ['b', 'a'])
    assert.equal(query?.state.status, 'error')
    assert.equal(query?.state.error, unavailable)
    assert.equal(query?.state.errorUpdatedAt, before.errorUpdatedAt)
    assert.equal(query?.state.dataUpdatedAt, before.dataUpdatedAt)
    assert.equal(query?.state.dataUpdateCount, before.dataUpdateCount)
    assert.equal(query?.state.errorUpdateCount, before.errorUpdateCount)
    assert.equal(query?.state.fetchFailureCount, before.fetchFailureCount)
  })

  it('an answered list read takes the new row first, once; its first message is read at once (control)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = listKey('p', 'ana')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(listOf('Before')) })
    putStarted(client, 'p', 'ana', started('b'), '1')
    putStarted(client, 'p', 'ana', started('b'), '1')
    assert.deepEqual(ids(client, key), ['b', 'a'])
    assert.equal(client.getQueryCache().find({ queryKey: key, exact: true })?.state.status, 'success')
    assert.deepEqual(client.getQueryData(messagesKey('b', 'ana')), {
      pages: [{ messages: [started('b').message], before: null, readAt: '1' }],
      pageParams: [null],
    })
  })

  it('another reader’s list, another project’s, and a list not read yet are not touched (control)', () => {
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'bea'), listOf('Theirs'))
    client.setQueryData(listKey('q', 'ana'), listOf('Elsewhere'))
    putStarted(client, 'p', 'ana', started('b'), '1')
    assert.deepEqual(ids(client, listKey('p', 'bea')), ['a'])
    assert.deepEqual(ids(client, listKey('q', 'ana')), ['a'])
    assert.equal(client.getQueryData(listKey('p', 'ana')), undefined)
    assert.equal(client.getQueryData(messagesKey('b', 'bea')), undefined)
  })
})

/** The started conversation's row in Ana's list read for project p. */
const rowB = (client: QueryClient) =>
  client.getQueryData<ConversationList>(listKey('p', 'ana'))?.conversations.find((c) => c.id === 'b')

const opening = {
  author: 'member',
  actorId: 'ana',
  name: 'You',
  text: 'Words withdrawn since.',
  at: '2026-10-10T14:46:00.000Z',
  seq: 1,
}
/** The receipt's row (revision 1, its first message as it was), current at feed position 6. */
const receipt = (cursor = '6') =>
  ({
    conversation: {
      id: 'b',
      title: 'Started',
      revision: 1,
      contributors: [{ actorId: 'ana', name: 'You' }],
      lastMessage: opening,
    },
    message: { id: 'b1', seq: 1, text: opening.text },
    reply: null,
    cursor,
  }) as unknown as ConversationStarted
/** The list as read after the withdrawal: the row at revision 2, nobody's words in it. */
const readAfter = () =>
  ({
    projectId: 'p',
    conversations: [
      { id: 'b', title: 'Started', revision: 2, contributors: [], lastMessage: null },
      { id: 'a', title: 'Older' },
    ],
    more: false,
  }) as unknown as ConversationList

describe('a start’s receipt and the list read: a newer row kept, a stale receipt listed without its words (PR #199 r4237924424)', () => {
  it('the list already holds a newer row, its reads now failing: the late receipt leaves the row and the failure', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = listKey('p', 'ana')
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.resolve(readAfter()) })
    await client.fetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('503')) }).catch(() => undefined)
    putStarted(client, 'p', 'ana', receipt(), '7')
    assert.deepEqual(rowB(client), readAfter().conversations[0])
    assert.equal(client.getQueryCache().find({ queryKey: key, exact: true })?.state.status, 'error')
  })

  it('a row at the receipt’s own revision is kept as read', () => {
    const client = new QueryClient()
    const held = { id: 'b', title: 'Started', revision: 1, contributors: [], lastMessage: null }
    client.setQueryData(listKey('p', 'ana'), { projectId: 'p', conversations: [held], more: false })
    putStarted(client, 'p', 'ana', receipt(), '6')
    assert.deepEqual(rowB(client), held)
  })

  it('not listed yet, the receipt past by the page’s feed: listed at the top without its opening or writer', () => {
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'ana'), listOf('Older'))
    putStarted(client, 'p', 'ana', receipt(), '7')
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['b', 'a'])
    assert.equal(rowB(client)?.lastMessage, null)
    assert.deepEqual(rowB(client)?.contributors, [])
    assert.equal(rowB(client)?.title, 'Started')
  })

  it('not listed yet, the receipt current where the page’s feed stands: listed with its words (control)', () => {
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'ana'), listOf('Older'))
    putStarted(client, 'p', 'ana', receipt(), '6')
    assert.deepEqual(rowB(client)?.lastMessage, opening)
    assert.deepEqual(rowB(client)?.contributors, [{ actorId: 'ana', name: 'You' }])
  })
})

/** What a view keeps for Ana in project p, as `landed` reads and changes it: a view born now (useKept). */
const PLACE = 'p ana'
const talkHere = () => keptFor(PLACE, currentGeneration())

describe('a start’s receipt for a conversation erased here meanwhile brings nothing back (PR #199 r4238111781)', () => {
  it('erased here, its row and read taken away: the late receipt changes nothing, and it is not opened', () => {
    forgetKept()
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'ana'), listOf('Older'))
    const words = { title: 'Started', text: 'Words of the start.', askSophia: true }
    changeKept(PLACE, (k) => ({ ...withoutConversation(k, 'b'), start: { ...k.start, fields: words } }))
    const before = keptAt(PLACE)
    const late = receipt('6')
    const open = landed(talkHere(), late, () => putStarted(client, 'p', 'ana', late, '6'))
    assert.equal(open, false)
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['a'])
    assert.equal(client.getQueryCache().find({ queryKey: messagesKey('b', 'ana'), exact: true }), undefined)
    assert.equal(keptAt(PLACE), before)
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
  })

  it('not erased: listed, its thread written, and it may be opened (control)', () => {
    forgetKept()
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'ana'), listOf('Older'))
    const fresh = receipt('6')
    const open = landed(talkHere(), fresh, () => putStarted(client, 'p', 'ana', fresh, '6'))
    assert.equal(open, true)
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['b', 'a'])
    assert.notEqual(client.getQueryData(messagesKey('b', 'ana')), undefined)
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
  })
})

/** An erasure's refusal outright (no reply is never one: held-write sends it again under its key). */
const refusedAs = (status: number, code: string) => new ApiError(status, code, 'Refused', 'never')
const refusal = { words: null, onWords: () => undefined, say: () => 'refused' }

describe('a start’s receipt while an erasure of it pressed here is unanswered: held back, then landed once or let go (PR #199 r4238177970)', () => {
  /** The receipt of a start that asked Sophia. */
  const asking = { ...receipt('6'), reply: { id: 'r1', messageId: 'b1' } } as unknown as ConversationStarted
  const words = { title: 'Started', text: 'Words of the start.', askSophia: true }
  /** A list read, the form's words, and an erasure of the new conversation pressed here: on its way, no reply, none. */
  function erasing(sending: boolean | null) {
    forgetKept()
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'ana'), listOf('Older'))
    changeKept(PLACE, (k) => {
      const held = sending === null ? k : withErasure(k, 'b', { key: 'e1', ask: 'b', sending })
      return { ...held, start: { ...held.start, fields: words } }
    })
    // The view as it was then: what it keeps for Ana in p, read and changed as a view born now does.
    const talk = talkHere()
    const puts: string[] = []
    let opened = 0
    const land = (r: ConversationStarted, stood?: typeof NO_WORDS) => {
      const put = () => {
        puts.push(r.conversation.id)
        putStarted(client, 'p', 'ana', r, '6')
      }
      if (landed(talk, r, put, stood)) opened += 1
    }
    return { client, talk, puts, land, opens: () => opened }
  }
  /** Nothing of the start shown, kept or awaited: the list as read, no thread, the form's words, no wait. */
  const untouched = (client: QueryClient) => {
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['a'])
    assert.equal(client.getQueryCache().find({ queryKey: messagesKey('b', 'ana'), exact: true }), undefined)
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
    assert.equal(keptAt(PLACE)?.asked.b ?? null, null)
  }

  it('its erasure on its way: nothing put, opened, cleared or awaited; the receipt held back with the start', () => {
    const { client, puts, land, opens } = erasing(true)
    land(asking)
    assert.deepEqual(puts, [])
    assert.equal(opens(), 0)
    untouched(client)
    assert.deepEqual(keptAt(PLACE)?.start.heldBack, { receipt: asking, fields: words })
  })

  it('its erasure with no reply: the same, and the form starts nothing new meanwhile', async () => {
    const { client, talk, puts, land } = erasing(false)
    land(asking)
    assert.deepEqual(puts, [])
    untouched(client)
    const { start } = talk.latest()
    assert.deepEqual(startHeld(start), { key: 'b', ask: words, sending: true })
    const sent: string[] = []
    const send = (key: string) => {
      sent.push(key)
      return Promise.resolve(asking)
    }
    const write = useHeldWrite(startHeld(start), () => undefined, send, refusal)
    assert.equal(write.busy, true)
    assert.equal(await write.run(words), undefined)
    assert.deepEqual(sent, [])
  })

  it('erased then (its reply, or a whole list without it): the receipt goes and never lands; the words stay, the form free', () => {
    const { client, talk, puts, land } = erasing(true)
    land(asking)
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
    released(talk, 'b', refusedAs(403, 'forbidden'), land)
    assert.deepEqual(puts, [])
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['a'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
    assert.equal(startHeld(talk.latest().start), null)
  })

  it('its erasure refused outright: the receipt lands then, once: listed, its words gone, the wait noted', () => {
    const { client, talk, puts, land, opens } = erasing(true)
    land(asking)
    changeKept(PLACE, (k) => withErasure(k, 'b', null))
    released(talk, 'b', refusedAs(403, 'forbidden'), land)
    released(talk, 'b', refusedAs(403, 'forbidden'), land)
    assert.deepEqual(puts, ['b'])
    assert.equal(opens(), 1)
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['b', 'a'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
    assert.equal(keptAt(PLACE)?.asked.b?.replyId, 'r1')
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
  })

  it('refused as not found, or by the server failing: it may be gone, so it never lands; the words stay', () => {
    for (const err of [refusedAs(422, 'not_found'), refusedAs(503, 'unavailable'), refusedAs(502, 'http_502')]) {
      const { client, talk, puts, land } = erasing(true)
      land(asking)
      changeKept(PLACE, (k) => withErasure(k, 'b', null))
      released(talk, 'b', err, land)
      assert.deepEqual(puts, [], err.code)
      untouched(client)
      assert.equal(keptAt(PLACE)?.start.heldBack, null)
    }
  })

  it('another conversation’s erasure refused, or another account’s or project’s: nothing lands, nothing of theirs moves', () => {
    const { talk, puts, land } = erasing(true)
    changeKept('p bea', (k) => ({ ...k, start: { ...k.start, fields: words } }))
    const bea = keptAt('p bea')
    land(asking)
    released(talk, 'c', refusedAs(403, 'forbidden'), land)
    released(keptFor('p bea', currentGeneration()), 'b', refusedAs(403, 'forbidden'), land)
    released(keptFor('q ana', currentGeneration()), 'b', refusedAs(403, 'forbidden'), land)
    assert.deepEqual(puts, [])
    assert.deepEqual(keptAt(PLACE)?.start.heldBack, { receipt: asking, fields: words })
    assert.equal(keptAt('p bea'), bea)
    assert.equal(keptAt('q ana'), undefined)
  })

  it('the account forgotten (signed out, another identity): the receipt goes with it, and a late refusal lands nothing', () => {
    const { client, talk, puts, land } = erasing(true)
    land(asking)
    forgetKept()
    // Ana again, a view born since: holds back nothing, and the old view's refusal reaches none of it.
    changeKept(PLACE, (k) => ({ ...k, start: { ...k.start, fields: words } }))
    released(talk, 'b', refusedAs(403, 'forbidden'), land)
    assert.deepEqual(puts, [])
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['a'])
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
  })

  it('kept while the view is away: back, the form still holds it; refused then, it lands once with those words', () => {
    const { talk, puts, land } = erasing(true)
    land(asking)
    // The view goes to Work and comes back: a view born now reads what was kept.
    const back = talkHere()
    assert.deepEqual(startHeld(back.latest().start), { key: 'b', ask: words, sending: true })
    changeKept(PLACE, (k) => withErasure(k, 'b', null))
    released(talk, 'b', refusedAs(409, 'conflict'), land)
    assert.deepEqual(puts, ['b'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
  })

  it('words written in the form since it was held back are never cleared by its landing', () => {
    const { talk, puts, land } = erasing(true)
    land(asking)
    const later = { title: 'Another question', text: 'Written since.', askSophia: false }
    changeKept(PLACE, (k) => ({ ...withErasure(k, 'b', null), start: { ...k.start, fields: later } }))
    released(talk, 'b', refusedAs(403, 'forbidden'), land)
    assert.deepEqual(puts, ['b'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, later)
  })

  it('no erasure here: it lands at once, as before (control)', () => {
    const { client, puts, land, opens } = erasing(null)
    land(asking)
    assert.deepEqual(puts, ['b'])
    assert.equal(opens(), 1)
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['b', 'a'])
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
  })

  /** The erasure's own write, as EraseHere sends it: held here as it goes, its refusal said through `releasing`. */
  function erasure(talk: ReturnType<typeof talkHere>, land: (r: ConversationStarted, words: typeof NO_WORDS) => void) {
    const replies: { settle?: (fail: ApiError | null) => void } = {}
    const keys: string[] = []
    const send = (key: string) => {
      keys.push(key)
      return new Promise<{ conversationId: string }>((resolve, reject) => {
        replies.settle = (fail) => (fail ? reject(fail) : resolve({ conversationId: 'b' }))
      })
    }
    return {
      keys,
      send,
      onHeld: (next: Held<string> | null) => changeKept(PLACE, (k) => withErasure(k, 'b', next)),
      refusal: releasing(refusal, (err) => released(talk, 'b', err, land)),
      settle: (fail: ApiError | null) => replies.settle?.(fail),
    }
  }

  it('through the erasure’s own write: refused outright, it lands once; with no reply, held back under the same key', async () => {
    const refused = erasing(null)
    const e = erasure(refused.talk, refused.land)
    const running = useHeldWrite(null, e.onHeld, e.send, e.refusal).run('b')
    refused.land(asking)
    assert.deepEqual(refused.puts, [])
    e.settle(refusedAs(403, 'forbidden'))
    await running
    assert.deepEqual(refused.puts, ['b'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)

    const unknown = erasing(null)
    const again = erasure(unknown.talk, unknown.land)
    const first = useHeldWrite(null, again.onHeld, again.send, again.refusal).run('b')
    unknown.land(asking)
    again.settle(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
    await first
    assert.deepEqual(unknown.puts, [])
    assert.equal(keptAt(PLACE)?.erasures.b?.sending, false)
    assert.deepEqual(keptAt(PLACE)?.start.heldBack, { receipt: asking, fields: words })
    const second = useHeldWrite(keptAt(PLACE)?.erasures.b ?? null, again.onHeld, again.send, again.refusal).run('b')
    again.settle(null)
    await second
    assert.equal(again.keys[1], again.keys[0])
    // Its reply settles it, as the view does (useErased): the receipt goes with it, never landing.
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    assert.deepEqual(unknown.puts, [])
    untouched(unknown.client)
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
  })
})
