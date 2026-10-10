import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client.ts'
import type { ConversationList, ConversationStarted, ConversationSummary } from '../../api/conversations.ts'
import {
  LISTS,
  contributorsLine,
  coverageWords,
  listKey,
  listWithdrawn,
  messagesKey,
  withLastMessage,
} from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'
import {
  landed,
  newestRead,
  putStarted,
  releasable,
  replyWait,
  setListsData,
  shownList,
  startHeld,
} from './list-data.ts'
import {
  NO_WORDS,
  changeKept,
  currentGeneration,
  awaiting,
  forgetKept,
  goneFrom,
  keepsFor,
  keptAt,
  keptFor,
  withErasure,
  withStanding,
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
    // Said to be partial: who wrote there isn't known, never «Nobody has written yet» (Codex at bfc2635c).
    const row = rowB(client)
    assert.equal(row && 'partial' in row ? row.partial : undefined, true)
    assert.equal(row && contributorsLine(row, 'ana'), 'Who wrote here isn’t known yet')
  })

  it('not listed yet, the receipt current where the page’s feed stands: listed with its words (control)', () => {
    const client = new QueryClient()
    client.setQueryData(listKey('p', 'ana'), listOf('Older'))
    putStarted(client, 'p', 'ana', receipt(), '6')
    assert.deepEqual(rowB(client)?.lastMessage, opening)
    assert.deepEqual(rowB(client)?.contributors, [{ actorId: 'ana', name: 'You' }])
    const row = rowB(client)
    assert.equal(row && 'partial' in row, false)
    assert.equal(row && contributorsLine(row, 'ana'), 'You')
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
/** The new conversation's erasure let go without being known erased (refused, whatever the refusal): in doubt at 7. */
const answered = () => changeKept(PLACE, (k) => withErasure(k, 'b', null, 7))
/** A read set out at `readFrom` in this view's order that finds `found` (a list read listing it, a direct read). */
const readAt = (readFrom: number, ...found: string[]) => changeKept(PLACE, (k) => withStanding(k, found, readFrom))

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
      const held = sending === null ? k : withErasure(k, 'b', { key: 'e1', ask: 'b', sending }, 1)
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
    // As the view lands a receipt held back once it is free (useStanding, useLanding): the list is read again.
    const release = () => {
      const back = releasable(talk.latest())
      if (!back) return
      const put = () => {
        puts.push(`free ${back.receipt.conversation.id}`)
        void client.invalidateQueries({ queryKey: listKey('p', 'ana') })
      }
      if (landed(talk, back.receipt, put, back.fields)) opened += 1
    }
    return { client, talk, puts, land, release, opens: () => opened }
  }
  /**
   * Kept reachable by its title only, so it can be opened (r4238533084), whichever list of the newest only is read
   * since (the cache as read, without it), and nothing else of the receipt: no opening or writer, no thread read made
   * of it, its wait only as a read set out since shows it (`after`; r4238533090, r4238594445). The reads say the rest.
   */
  const reachableTitleOnly = (client: QueryClient) => {
    const read = client.getQueryData<ConversationList>(listKey('p', 'ana'))?.conversations ?? []
    assert.deepEqual(
      read.map((c) => c.id),
      ['a'],
    )
    const shown = shownList(read, keptAt(PLACE) ?? talkHere().latest(), true)
    assert.deepEqual(
      shown.map((c) => c.id),
      ['a', 'b'],
    )
    assert.deepEqual([shown[1]?.title, shown[1]?.lastMessage, shown[1]?.contributors], ['Started', null, []])
    // Said to be partial, and not counted among the newest the list holds (Codex at bfc2635c).
    const row = shown[1]
    assert.equal(row && 'partial' in row ? row.partial : undefined, true)
    assert.equal(row && contributorsLine(row, 'ana'), 'Who wrote here isn’t known yet')
    assert.equal(newestRead({ all: read, more: true }), 1)
    assert.equal(client.getQueryCache().find({ queryKey: messagesKey('b', 'ana'), exact: true }), undefined)
    assert.equal(typeof keptAt(PLACE)?.asked.b?.after, 'number')
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
    const { client, talk, puts, land, release } = erasing(true)
    land(asking)
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
    readAt(8, 'b', 'a')
    release()
    assert.deepEqual(puts, [])
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['a'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
    assert.equal(startHeld(talk.latest().start), null)
  })

  it('its erasure answered without erasing it, whatever the answer: in doubt, nothing lands, the form still fenced (r4238256883, CX-0059)', () => {
    const { client, talk, puts, land, release } = erasing(true)
    land(asking)
    answered()
    release()
    assert.deepEqual(puts, [])
    untouched(client)
    assert.equal(keptAt(PLACE)?.doubted.b, 7)
    assert.equal(releasable(talk.latest()), null)
    assert.deepEqual(startHeld(talk.latest().start), { key: 'b', ask: words, sending: true })
  })

  it('a read set out since that finds it: it stands, so the receipt lands once (its words gone), listed by its title only, no wait noted', () => {
    const { client, puts, land, release, opens } = erasing(true)
    land(asking)
    answered()
    readAt(8, 'b', 'a')
    release()
    release()
    assert.deepEqual(puts, ['free b'])
    assert.equal(opens(), 1)
    reachableTitleOnly(client)
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
    assert.equal(keptAt(PLACE)?.doubted.b, undefined)
  })

  it('a read set out before the doubt arose, or when it did (cached, or under way then): nothing ends, nothing lands', () => {
    const { client, puts, land, release } = erasing(true)
    land(asking)
    answered()
    readAt(6, 'b', 'a')
    readAt(7, 'b', 'a')
    release()
    assert.deepEqual(puts, [])
    untouched(client)
    assert.equal(keptAt(PLACE)?.doubted.b, 7)
  })

  it('a read since that doesn’t find it: nothing lands; a whole list names it gone, one of the newest only has it read directly', () => {
    const { client, talk, puts, land, release } = erasing(true)
    land(asking)
    answered()
    readAt(8, 'a')
    release()
    assert.deepEqual(puts, [])
    untouched(client)
    const kept = talk.latest()
    assert.deepEqual(goneFrom({ ...kept, listed: {} }, ['a']), ['b'])
    assert.equal(keepsFor(kept, 'b'), true)
    // Gone (a whole list without it, or its direct read not found: useSeen and probes settle it): it never lands.
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    readAt(9, 'b', 'a')
    release()
    assert.deepEqual(puts, [])
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
  })

  it('its erasure still on its way or without a reply, or pressed again: a read since finding it lands nothing', () => {
    const { puts, land, release } = erasing(false)
    land(asking)
    readAt(8, 'b', 'a')
    release()
    answered()
    changeKept(PLACE, (k) => withErasure(k, 'b', { key: 'e2', ask: 'b', sending: true }, 8))
    readAt(9, 'b', 'a')
    release()
    assert.deepEqual(puts, [])
    assert.deepEqual(keptAt(PLACE)?.start.heldBack, { receipt: asking, fields: words })
  })

  it('another account’s or project’s read: nothing ends, nothing lands, nothing of theirs moves', () => {
    const { puts, land, release } = erasing(true)
    changeKept('p bea', (k) => ({ ...k, start: { ...k.start, fields: words } }))
    const bea = keptAt('p bea')
    land(asking)
    answered()
    changeKept('p bea', (k) => withStanding(k, ['b'], 8))
    changeKept('q ana', (k) => withStanding(k, ['b'], 8))
    release()
    assert.deepEqual(puts, [])
    assert.deepEqual(keptAt(PLACE)?.start.heldBack, { receipt: asking, fields: words })
    assert.equal(keptAt('p bea'), bea)
  })

  it('the account forgotten (signed out, another identity): the receipt and the doubt go with it; the old view lands nothing', () => {
    const { client, puts, land, release } = erasing(true)
    land(asking)
    answered()
    forgetKept()
    // Ana again, a view born since: holds back nothing, and the old view reads nothing kept (keptFor).
    changeKept(PLACE, (k) => ({ ...k, start: { ...k.start, fields: words } }))
    readAt(8, 'b', 'a')
    release()
    assert.deepEqual(puts, [])
    assert.deepEqual(ids(client, listKey('p', 'ana')), ['a'])
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
    assert.deepEqual(keptAt(PLACE)?.doubted, {})
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
  })

  it('kept while the view is away: back, the form still holds it; a read set out since it came back lands it once', () => {
    const { puts, land, release } = erasing(true)
    land(asking)
    answered()
    // The view goes to Work and comes back: a view born now reads what was kept, and asks again (useStanding).
    const back = talkHere()
    assert.deepEqual(startHeld(back.latest().start), { key: 'b', ask: words, sending: true })
    readAt(12, 'b', 'a')
    release()
    assert.deepEqual(puts, ['free b'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
  })

  it('words written in the form since it was held back are never cleared by its landing', () => {
    const { puts, land, release } = erasing(true)
    land(asking)
    answered()
    const later = { title: 'Another question', text: 'Written since.', askSophia: false }
    changeKept(PLACE, (k) => ({ ...k, start: { ...k.start, fields: later } }))
    readAt(8, 'b', 'a')
    release()
    assert.deepEqual(puts, ['free b'])
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

  /** The erasure's own write, as EraseHere sends it: held here as it goes, let go in doubt at 7 (eraseOf). */
  function erasure() {
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
      onHeld: (next: Held<string> | null) => changeKept(PLACE, (k) => withErasure(k, 'b', next, 7)),
      settle: (fail: ApiError | null) => replies.settle?.(fail),
    }
  }

  it('through its own write (CX-0059): no reply, then refused under its key (403): nothing lands; a read since without it lets it go', async () => {
    const { client, puts, land, release } = erasing(null)
    const e = erasure()
    const first = useHeldWrite(null, e.onHeld, e.send, refusal).run('b')
    land(asking)
    e.settle(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
    await first
    assert.equal(keptAt(PLACE)?.erasures.b?.sending, false)
    const again = useHeldWrite(keptAt(PLACE)?.erasures.b ?? null, e.onHeld, e.send, refusal).run('b')
    e.settle(refusedAs(403, 'forbidden'))
    await again
    assert.equal(e.keys[1], e.keys[0])
    release()
    assert.deepEqual(puts, [])
    untouched(client)
    assert.equal(keptAt(PLACE)?.doubted.b, 7)
    // The first try had erased it: the read since leaves it out, and a whole one lets it go (useSeen).
    readAt(8, 'a')
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    release()
    assert.deepEqual(puts, [])
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
  })

  it('through its own write (r4238256883): refused at once by the API’s 503: held back, and a read since that finds it lands it once', async () => {
    const { puts, land, release } = erasing(null)
    const e = erasure()
    const running = useHeldWrite(null, e.onHeld, e.send, refusal).run('b')
    land(asking)
    e.settle(new ApiError(503, 'unavailable', 'Unavailable', 'safe_read'))
    await running
    release()
    assert.deepEqual(puts, [])
    readAt(8, 'b', 'a')
    release()
    assert.deepEqual(puts, ['free b'])
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
  })

  it('CX-0060: no reply, then its same-key retry refused, all before the Start receipt comes: held back on coming, nothing put', async () => {
    const { client, talk, puts, land, release, opens } = erasing(null)
    const e = erasure()
    const first = useHeldWrite(null, e.onHeld, e.send, refusal).run('b')
    e.settle(new ApiError(0, 'outcome_unknown', 'No reply from Sophia', 'same_admission_key'))
    await first
    const again = useHeldWrite(keptAt(PLACE)?.erasures.b ?? null, e.onHeld, e.send, refusal).run('b')
    e.settle(refusedAs(403, 'forbidden'))
    await again
    assert.equal(keptAt(PLACE)?.doubted.b, 7)
    land(asking)
    release()
    assert.deepEqual(puts, [])
    assert.equal(opens(), 0)
    untouched(client)
    assert.deepEqual(startHeld(talk.latest().start), { key: 'b', ask: words, sending: true })
    readAt(8, 'a')
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    release()
    assert.deepEqual(puts, [])
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
    assert.deepEqual(keptAt(PLACE)?.start.fields, words)
  })

  it('CX-0060: in doubt before the receipt comes, then a read since finds it: it stands, the receipt lands once', () => {
    const { puts, land, release, opens } = erasing(true)
    answered()
    land(asking)
    release()
    assert.deepEqual(puts, [])
    readAt(8, 'b', 'a')
    release()
    release()
    assert.deepEqual(puts, ['free b'])
    assert.equal(opens(), 1)
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
  })

  it('in doubt with no receipt held back: a read since that finds it ends the doubt; a receipt then lands at once', () => {
    const { talk, puts, land } = erasing(true)
    answered()
    assert.deepEqual(awaiting(talk.latest()), ['b'])
    assert.equal(keepsFor(talk.latest(), 'b'), true)
    readAt(8, 'b', 'a')
    assert.equal(keptAt(PLACE)?.doubted.b, undefined)
    land(asking)
    assert.deepEqual(puts, ['b'])
  })

  it('r4238311491: a capped list that leaves it out, then its direct read answering since: it stands, and the receipt lands once', () => {
    const { client, puts, land, release } = erasing(true)
    land(asking)
    answered()
    readAt(8, 'a')
    release()
    assert.deepEqual(puts, [])
    // The direct read (probes), set out at 9, answers: found (useProbes ends the doubt with it).
    readAt(9, 'b')
    release()
    assert.deepEqual(puts, ['free b'])
    reachableTitleOnly(client)
    assert.deepEqual(keptAt(PLACE)?.start.fields, NO_WORDS)
  })

  it('r4238533090: the reply its receipt asked may have ended since: landing held back notes its wait only as a read shows it', () => {
    const held = erasing(true)
    held.land(asking)
    answered()
    readAt(8, 'b', 'a')
    held.release()
    const late = keptAt(PLACE)?.asked.b
    assert.deepEqual([late?.replyId, late?.messageId, typeof late?.after], ['r1', 'b1', 'number'])
    const fresh = erasing(null)
    fresh.land(asking)
    assert.equal(keptAt(PLACE)?.asked.b?.replyId, 'r1')
    assert.equal(keptAt(PLACE)?.asked.b?.after, undefined)
    assert.deepEqual(fresh.puts, ['b'])
  })

  it('r4238594450: an Ask made in it since (a newer wait noted there) is never replaced by the late Start’s', () => {
    const { land, release } = erasing(true)
    land(asking)
    answered()
    const newer = { replyId: 'r2', messageId: 'b2', here: 1 }
    changeKept(PLACE, (k) => ({ ...k, asked: { ...k.asked, b: newer } }))
    readAt(8, 'b', 'a')
    release()
    assert.deepEqual(keptAt(PLACE)?.asked.b, newer)
    assert.equal(keptAt(PLACE)?.start.heldBack, null)
  })

  it('r4238533084: kept reachable across a later read of a list of the newest only; a whole list without it lets it go', () => {
    const { client, land, release } = erasing(true)
    client.setQueryData(listKey('p', 'ana'), { ...listOf('Older'), more: true })
    land(asking)
    answered()
    readAt(9, 'b')
    release()
    // putHeldBack's successor reads the list again: the server's newest only, still without it.
    client.setQueryData(listKey('p', 'ana'), { ...listOf('Older'), more: true })
    const kept = keptAt(PLACE) ?? talkHere().latest()
    const read = client.getQueryData<ConversationList>(listKey('p', 'ana'))?.conversations ?? []
    assert.deepEqual(
      shownList(read, kept, true).map((c) => c.id),
      ['a', 'b'],
    )
    // «Only the newest N» counts the read alone, never the row shown after it (Codex at bfc2635c); a whole one, none.
    assert.equal(newestRead({ all: read, more: true }), 1)
    assert.equal(newestRead({ all: read, more: false }), null)
    // A whole list without it: not shown, and named gone (useSeen settles it; `reached` goes with it).
    assert.deepEqual(
      shownList(read, kept, false).map((c) => c.id),
      ['a'],
    )
    assert.deepEqual(goneFrom({ ...kept, listed: {} }, ['a']), ['b'])
    assert.equal(keepsFor(kept, 'b'), true)
    changeKept(PLACE, (k) => withoutConversation(k, 'b'))
    assert.deepEqual(keptAt(PLACE)?.reached, {})
  })

  it('a list read that already holds it at a newer revision keeps that row as read (control)', () => {
    const { client, land, release, opens } = erasing(true)
    client.setQueryData(listKey('p', 'ana'), readAfter())
    land(asking)
    answered()
    readAt(8, 'b', 'a')
    release()
    assert.deepEqual(client.getQueryData(listKey('p', 'ana')), readAfter())
    assert.equal(opens(), 1)
  })
})

/** The message that asked (b1), its request r1 in `state`, as a read of the thread holds it. */
const asked = (state: string) =>
  [{ id: 'b1', seq: 1, author: 'member', ask: { id: 'r1', state } }] as unknown as Parameters<typeof replyWait>[0]

describe('replyWait: a wait a held-back Start noted is claimed only as a read set out since shows it (PR #199 r4238533090, r4238594445)', () => {
  /** Noted at 7 in this view's order. */
  const held = { replyId: 'r1', messageId: 'b1', after: 7 }
  const here = { replyId: 'r1', messageId: 'b1', after: null }

  it('no read of its thread (none yet, or one failing): no wait claimed, and nothing ends', () => {
    assert.deepEqual(replyWait([], held, 0), { ended: false, waiting: false })
    assert.deepEqual(replyWait([], held, 9), { ended: false, waiting: false })
  })

  it('a read set out since shows it still open (pending or running): waited on', () => {
    for (const state of ['pending', 'running']) {
      assert.deepEqual(replyWait(asked(state), held, 8), { ended: false, waiting: true }, state)
    }
  })

  it('r4238594445: a read cached from before (or at) its noting shows it open: not waited on, nothing ended', () => {
    for (const readFrom of [0, 6, 7]) {
      assert.deepEqual(replyWait(asked('running'), held, readFrom), { ended: false, waiting: false }, String(readFrom))
    }
  })

  it('a read shows it ended (answered, blocked, cancelled), cached or fresh: ended for good, not waited on', () => {
    for (const state of ['answered', 'blocked', 'cancelled']) {
      for (const readFrom of [0, 8]) {
        assert.deepEqual(replyWait(asked(state), held, readFrom), { ended: true, waiting: false }, state)
      }
    }
  })

  it('a read holding another request on that message, or not the message: not this one, not waited on', () => {
    const other = [
      { id: 'b1', seq: 1, author: 'member', ask: { id: 'r9', state: 'running' } },
    ] as unknown as Parameters<typeof replyWait>[0]
    assert.deepEqual(replyWait(other, held, 8), { ended: false, waiting: false })
  })

  it('a wait asked here, as ever: waited on until a read shows it ended, whatever the read (control)', () => {
    assert.deepEqual(replyWait([], here, 0), { ended: false, waiting: true })
    assert.deepEqual(replyWait(asked('running'), here, 0), { ended: false, waiting: true })
    assert.deepEqual(replyWait(asked('answered'), here, 0), { ended: true, waiting: false })
    assert.deepEqual(replyWait([], { replyId: null, messageId: null, after: null }, 0), {
      ended: false,
      waiting: false,
    })
  })
})
