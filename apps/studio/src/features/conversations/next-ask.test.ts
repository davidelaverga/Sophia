import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConversationMessage } from '../../api/vision.ts'
import { nextAsk, QUICK_ASKS, quickAsks, sameAsk, threadOf, type AskContext } from './next-ask.ts'

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
