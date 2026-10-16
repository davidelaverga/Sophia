import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConversationMessage } from '../../api/conversations.ts'
import {
  asksNow,
  briefAsks,
  nextAsk,
  olderAsks,
  QUICK_ASKS,
  quickAsks,
  sameAsk,
  settled,
  threadOf,
  type AskContext,
} from './next-ask.ts'

const at = (over: Partial<AskContext> = {}): AskContext => ({
  newest: 'sophia',
  asked: [],
  openQuestions: 0,
  pending: null,
  decided: 0,
  putAway: [],
  ...over,
})

describe('the next ask', () => {
  it('is offered only once Sophia has answered: the newest message hers', () => {
    assert.notEqual(nextAsk(at()), null)
    assert.equal(nextAsk(at({ newest: 'mine' })), null)
    assert.equal(nextAsk(at({ newest: 'theirs' })), null)
    assert.equal(nextAsk(at({ newest: null })), null)
  })
  it('takes the first that fits, in order: a proposal waiting, what is open, what was decided, a summary', () => {
    const all = at({ pending: 'Map first, list second', openQuestions: 1, decided: 4 })
    assert.deepEqual(nextAsk(all), {
      words: 'Should we go with “Map first, list second”?',
      why: 'Because it is proposed and not decided',
    })
    assert.deepEqual(nextAsk({ ...all, pending: null }), {
      words: 'What’s still open?',
      why: 'Because 1 question is open here',
    })
    assert.equal(nextAsk(at({ openQuestions: 2 }))?.why, 'Because 2 questions are open here')
    assert.deepEqual(nextAsk(at({ decided: 4 })), {
      words: 'What did we decide?',
      why: 'Because the brief has 4 decisions',
    })
    assert.equal(nextAsk(at({ decided: 1 }))?.why, 'Because the brief has 1 decision')
    assert.equal(nextAsk(at())?.words, 'Sum it up')
  })
  it('never offers what was asked lately: the viewer’s last six messages, without case or end punctuation', () => {
    const ctx = at({ openQuestions: 1, asked: ['what’s still open'] })
    assert.equal(nextAsk(ctx)?.words, 'Sum it up')
    // Seven messages back is not lately.
    const old = at({ openQuestions: 1, asked: ['What’s still open?', 'a', 'b', 'c', 'd', 'e', 'f'] })
    assert.equal(nextAsk(old)?.words, 'What’s still open?')
  })
  it('counts a summary as having said what was decided', () => {
    assert.equal(nextAsk(at({ decided: 3, asked: ['Sum it up'] })), null)
    assert.equal(nextAsk(at({ decided: 3, openQuestions: 1, asked: ['Sum it up'] }))?.words, 'What’s still open?')
  })
  it('does not bring back what was put away; with nothing left, says nothing', () => {
    const ctx = at({ pending: 'Map first, list second', putAway: ['Should we go with “Map first, list second”?'] })
    assert.equal(nextAsk(ctx)?.words, 'Sum it up')
    assert.equal(nextAsk({ ...ctx, putAway: [...ctx.putAway, 'Sum it up'] }), null)
  })
  it('cuts a long proposal at a word, with an ellipsis, inside the quotes', () => {
    const long = 'Keep every report to a single page with its sources inline and its figures dated'
    const words = nextAsk(at({ pending: long }))?.words ?? ''
    assert.ok(words.startsWith('Should we go with “Keep every report'))
    assert.ok(words.endsWith('…”?'))
    assert.ok(words.length <= 70, words)
  })
})

describe('the quick asks', () => {
  it('are the three less any asked lately and less the one in the field, in their order', () => {
    assert.deepEqual(quickAsks([], null), [...QUICK_ASKS])
    const suggested = { words: 'Should we go with “Map first, list second”?', why: '' }
    // «Sum it up» asked (and covering the decisions): only «What’s still open?» stays.
    assert.deepEqual(quickAsks(['Sum it up'], suggested), ['What’s still open?'])
    assert.deepEqual(quickAsks([], { words: 'What’s still open?', why: '' }), ['Sum it up', 'What did we decide?'])
  })
})

describe('asks compared', () => {
  it('without case, spaces at the ends, or the end’s punctuation', () => {
    assert.equal(sameAsk('Sum it up', '  sum it up. '), true)
    assert.equal(sameAsk('What’s still open?', 'what’s still open'), true)
    assert.equal(sameAsk('Sum it up', 'Sum it all up'), false)
  })
})

/** A message of the thread, at a minute named by its id. */
const msg = (id: string, author: 'member' | 'sophia', actorId: string | null, text: string): ConversationMessage => ({
  id,
  author,
  actorId,
  name: null,
  text,
  at: `2026-10-06T05:${id}:00Z`,
  seq: Number(id),
  withdrawn: null,
  ask: null,
  replyTo: null,
})

describe('the thread, as the next ask reads it', () => {
  it('names whose the newest message is and the viewer’s words, oldest to newest across pages', () => {
    const read = {
      // The first page is the newest; each page oldest first.
      pages: [
        {
          messages: [msg('03', 'member', 'me', 'Sum it up'), msg('04', 'sophia', null, 'Where it stands…')],
          before: 'x',
        },
        { messages: [msg('01', 'member', 'me', 'Hello'), msg('02', 'member', 'lucia', 'Hi')], before: null },
      ],
      pageParams: [null, 'x'],
    }
    assert.deepEqual(threadOf(read, 'me'), { newest: 'sophia', asked: ['Hello', 'Sum it up'] })
    assert.deepEqual(threadOf(undefined, 'me'), { newest: null, asked: [] })
    const lucia = { pages: [{ messages: [msg('05', 'member', 'lucia', 'And?')], before: null }], pageParams: [null] }
    assert.deepEqual(threadOf(lucia, 'me'), { newest: 'theirs', asked: [] })
  })
})

describe('the next ask, after the review (Codex on #262)', () => {
  it('keeps what was put away out of the quick asks too', () => {
    assert.deepEqual(quickAsks([], null, ['What’s still open?']), ['Sum it up', 'What did we decide?'])
  })
  it('reads the viewer’s older asks a page at a time, only until six are in', async () => {
    const pages: Record<string, { messages: ConversationMessage[]; before: string | null }> = {
      '6': {
        messages: [msg('b', 'member', 'me', 'b'), msg('x', 'member', 'them', 'x'), msg('c', 'member', 'me', 'c')],
        before: '3',
      },
      '3': { messages: [msg('a', 'member', 'me', 'a'), msg('y', 'member', 'them', 'y')], before: null },
    }
    const read: string[] = []
    const fetch = (before: string) => {
      read.push(before)
      return Promise.resolve(pages[before] ?? { messages: [], before: null })
    }
    assert.deepEqual((await olderAsks(fetch, '6', 'me', 2)).asks, ['b', 'c'])
    assert.deepEqual(read, ['6'])
    assert.deepEqual((await olderAsks(fetch, '6', 'me', 3)).asks, ['a', 'b', 'c'])
    assert.deepEqual((await olderAsks(fetch, null, 'me', 3)).asks, [])
  })
})

describe('the next ask, only from what is known now (Codex P2s on #262)', () => {
  it('reads older pages until six asks are in or the thread begins; stopped short of both, says so', async () => {
    // Each page: one ask of the viewer's among the team's, and a page before it, down to the first.
    const page = (n: number) => ({
      messages: [msg(`m${String(n)}`, 'member', 'me', `ask ${String(n)}`), msg(`t${String(n)}`, 'member', 'them', 't')],
      before: n > 1 ? String(n - 1) : null,
    })
    const fetch = (before: string) => Promise.resolve(page(Number(before)))
    // Ten pages back, six wanted: six pages read, all six found.
    assert.deepEqual(await olderAsks(fetch, '10', 'me', 6), {
      asks: ['ask 5', 'ask 6', 'ask 7', 'ask 8', 'ask 9', 'ask 10'],
      complete: true,
    })
    // Three pages in all: the thread begins before six; complete, with the three there are.
    assert.deepEqual(await olderAsks(fetch, '3', 'me', 6), { asks: ['ask 1', 'ask 2', 'ask 3'], complete: true })
    // A page limit reached with asks still wanted and pages left: not complete.
    assert.equal((await olderAsks(fetch, '10', 'me', 6, 2)).complete, false)
  })

  it('proposes nothing, and no quick asks, while the thread or what was asked before it is not known', () => {
    const ctx = at({ openQuestions: 1 })
    const known = { fresh: true, recencyKnown: true, quiet: false, hushed: false }
    assert.deepEqual(asksNow(ctx, known), { suggestion: nextAsk(ctx), quick: quickAsks([], nextAsk(ctx), []) })
    // The transcript being read again, or its last read failed: its newest message may not be hers.
    assert.deepEqual(asksNow(ctx, { ...known, fresh: false }), { suggestion: null, quick: [] })
    // The older asks not read (on their way, or the read failed): one asked a page back may be offered again.
    assert.deepEqual(asksNow(ctx, { ...known, recencyKnown: false }), { suggestion: null, quick: [] })
    // Quiet (a message on its way) or hushed: no suggestion, the quick asks as they are.
    assert.deepEqual(asksNow(ctx, { ...known, quiet: true }), { suggestion: null, quick: quickAsks([], null, []) })
  })

  it('counts a read as settled only when idle: a refresh paused offline is still on its way (Codex on #275)', () => {
    assert.equal(settled({ fetchStatus: 'idle' }), true)
    assert.equal(settled({ fetchStatus: 'fetching' }), false)
    // Paused: `isFetching` is false, yet the read waits for the network and an older page pressed now would cancel it.
    assert.equal(settled({ fetchStatus: 'paused' }), false)
  })

  it('takes nothing from a brief whose last read failed: it may be stale', () => {
    const brief = {
      constraints: [],
      pending: [{ statement: 'Map first, list second', state: 'proposed', createdAt: '2026-10-01T09:00:00.000Z' }],
    } as unknown as Parameters<typeof briefAsks>[0]
    assert.equal(briefAsks(brief, false).pending, 'Map first, list second')
    assert.deepEqual(briefAsks(brief, true), { pending: null, decided: 0 })
    assert.deepEqual(briefAsks(undefined, false), { pending: null, decided: 0 })
  })
})
